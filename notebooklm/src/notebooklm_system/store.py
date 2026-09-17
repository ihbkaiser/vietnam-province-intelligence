from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from .schemas import ChunkMetadata, ImageRef, NotebookDocument


class LocalVectorStore:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def documents_path(self) -> Path:
        return self.output_dir / "documents.jsonl"

    @property
    def sparse_matrix_path(self) -> Path:
        return self.output_dir / "tfidf_matrix.joblib"

    @property
    def vectorizer_path(self) -> Path:
        return self.output_dir / "tfidf_vectorizer.joblib"

    @property
    def svd_path(self) -> Path:
        return self.output_dir / "tfidf_svd.joblib"

    @property
    def dense_path(self) -> Path:
        return self.output_dir / "dense_embeddings.npy"

    @property
    def lessons_path(self) -> Path:
        return self.output_dir / "lessons.json"

    @property
    def config_path(self) -> Path:
        return self.output_dir / "index_config.json"

    def save_documents(self, docs: list[NotebookDocument]) -> None:
        rows = [
            json.dumps(
                {
                    "doc_id": doc.doc_id,
                    "text": doc.text,
                    "metadata": doc.metadata.model_dump(),
                    "images": [image.model_dump() for image in doc.images],
                },
                ensure_ascii=False,
            )
            for doc in docs
        ]
        self.documents_path.write_text("\n".join(rows) + ("\n" if rows else ""), encoding="utf-8")

    def load_documents(self) -> list[NotebookDocument]:
        docs: list[NotebookDocument] = []
        for line in self.documents_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            docs.append(
                NotebookDocument(
                    doc_id=str(row["doc_id"]),
                    text=str(row["text"]),
                    metadata=ChunkMetadata.model_validate(row["metadata"]),
                    images=[ImageRef.model_validate(item) for item in row.get("images") or []],
                )
            )
        return docs

    def save_joblib(self, path: Path, value: Any) -> None:
        joblib.dump(value, path)

    def load_joblib(self, path: Path) -> Any:
        return joblib.load(path)

    def save_dense(self, embeddings: np.ndarray) -> None:
        np.save(self.dense_path, embeddings.astype("float32"))

    def load_dense(self) -> np.ndarray:
        return np.load(self.dense_path)

    def save_json(self, path: Path, value: Any) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def load_json(self, path: Path, default: Any = None) -> Any:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
