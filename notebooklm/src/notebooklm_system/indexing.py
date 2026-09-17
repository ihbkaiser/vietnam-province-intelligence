from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .config import AppConfig
from .data_loader import document_info, load_textbook_documents
from .store import LocalVectorStore


def build_index(config: AppConfig, *, recreate: bool = True) -> dict[str, object]:
    docs, lessons = load_textbook_documents(config)
    store = LocalVectorStore(config.index.output_dir)
    if recreate:
        for path in [
            store.documents_path,
            store.sparse_matrix_path,
            store.vectorizer_path,
            store.svd_path,
            store.dense_path,
            store.lessons_path,
            store.config_path,
        ]:
            if path.exists():
                path.unlink()

    texts = [doc.text for doc in docs]
    vectorizer = TfidfVectorizer(
        lowercase=True,
        token_pattern=r"(?u)\b\w+\b",
        ngram_range=(1, 2),
        max_features=config.index.max_features,
        sublinear_tf=True,
    )
    sparse_matrix = vectorizer.fit_transform(texts)

    component_count = min(config.index.dense_svd_components, max(2, min(sparse_matrix.shape) - 1))
    svd = TruncatedSVD(n_components=component_count, random_state=42)
    dense_embeddings = normalize(svd.fit_transform(sparse_matrix), norm="l2").astype("float32")

    store.save_documents(docs)
    store.save_joblib(store.vectorizer_path, vectorizer)
    store.save_joblib(store.sparse_matrix_path, sparse_matrix)
    store.save_joblib(store.svd_path, svd)
    store.save_dense(dense_embeddings)
    store.save_json(store.lessons_path, [lesson.model_dump() for lesson in lessons])

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "collection_name": config.index.collection_name,
        "documents": len(docs),
        "pages": len({doc.metadata.page for doc in docs}),
        "lessons": len([lesson for lesson in lessons if lesson.chunk_count > 0]),
        "sparse_shape": list(sparse_matrix.shape),
        "dense_shape": list(dense_embeddings.shape),
        "chunk_size": config.index.chunk_size,
        "chunk_overlap": config.index.chunk_overlap,
        "vector_store": "local_tfidf_svd",
    }
    store.save_json(store.config_path, summary)
    store.save_json(config.index.output_dir / "build_summary.json", {**summary, "documents_info": document_info(docs, lessons)})
    return summary
