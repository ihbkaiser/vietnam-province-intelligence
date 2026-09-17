from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT / "src"))

from rag_system.config import load_config
from rag_system.data_loader import load_documents
from rag_system.embeddings import HFTextEmbedder, l2_normalize, recommend_svd_components
from rag_system.index_store import LocalIndexStore


def build_index(config_path: Path, embedding_backend: str | None = None) -> Path:
    config = load_config(config_path)
    data_config = config["data"]
    index_config = config["index"]
    backend = embedding_backend or index_config.get("embedding_backend", "hf")

    docs = load_documents(
        data_config["rag_chunks_path"],
        data_config["extracted_dir"],
        data_config.get("book_metadata_path"),
        data_config.get("image_metadata_path"),
    )
    texts = [doc.text for doc in docs]
    index_dir = Path(index_config["output_dir"])
    store = LocalIndexStore(index_dir)
    store.save_documents(docs)

    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents=None,
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95,
        sublinear_tf=True,
    )
    tfidf_matrix = vectorizer.fit_transform(texts)
    tfidf_matrix = normalize(tfidf_matrix, norm="l2", axis=1, copy=False)
    store.save_joblib(store.vectorizer_path, vectorizer)
    store.save_joblib(store.sparse_matrix_path, tfidf_matrix)

    if backend == "hf":
        embedder = HFTextEmbedder(
            index_config.get("embedding_model", "intfloat/multilingual-e5-small"),
            device=index_config.get("device", "cpu"),
            max_length=int(index_config.get("max_length", 512)),
        )
        dense_embeddings = embedder.encode(texts, is_query=False, batch_size=int(index_config.get("batch_size", 16)))
    elif backend == "tfidf_svd":
        components = recommend_svd_components(tfidf_matrix.shape[0], tfidf_matrix.shape[1])
        svd = TruncatedSVD(n_components=components, random_state=42)
        dense_embeddings = svd.fit_transform(tfidf_matrix).astype("float32")
        dense_embeddings = l2_normalize(dense_embeddings)
        store.save_joblib(store.svd_path, svd)
    else:
        raise ValueError(f"Unsupported embedding backend: {backend}")

    store.save_dense(np.asarray(dense_embeddings, dtype="float32"))
    store.save_config(
        {
            "embedding_backend": backend,
            "embedding_model": index_config.get("embedding_model"),
            "device": index_config.get("device", "cpu"),
            "max_length": int(index_config.get("max_length", 512)),
            "documents": len(docs),
            "dense_dimensions": int(dense_embeddings.shape[1]),
            "sparse_features": int(tfidf_matrix.shape[1]),
        }
    )
    summary = {
        "index_dir": str(index_dir),
        "documents": len(docs),
        "embedding_backend": backend,
        "dense_shape": list(dense_embeddings.shape),
        "sparse_shape": list(tfidf_matrix.shape),
    }
    (index_dir / "build_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return index_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Build local dense+sparse RAG index.")
    parser.add_argument("--config", type=Path, default=RAG_ROOT / "config.yaml")
    parser.add_argument("--embedding-backend", choices=["hf", "tfidf_svd"], default=None)
    args = parser.parse_args()
    build_index(args.config, args.embedding_backend)


if __name__ == "__main__":
    main()
