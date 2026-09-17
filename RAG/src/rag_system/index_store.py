from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from .data_loader import load_documents_jsonl, write_documents_jsonl
from .schemas import RagDocument


class LocalIndexStore:
    def __init__(self, index_dir: Path) -> None:
        self.index_dir = index_dir
        self.index_dir.mkdir(parents=True, exist_ok=True)

    @property
    def docs_path(self) -> Path:
        return self.index_dir / "documents.jsonl"

    @property
    def dense_path(self) -> Path:
        return self.index_dir / "dense_embeddings.npy"

    @property
    def sparse_matrix_path(self) -> Path:
        return self.index_dir / "tfidf_matrix.joblib"

    @property
    def vectorizer_path(self) -> Path:
        return self.index_dir / "tfidf_vectorizer.joblib"

    @property
    def svd_path(self) -> Path:
        return self.index_dir / "tfidf_svd.joblib"

    @property
    def config_path(self) -> Path:
        return self.index_dir / "index_config.json"

    def save_documents(self, docs: list[RagDocument]) -> None:
        write_documents_jsonl(self.docs_path, docs)

    def load_documents(self) -> list[RagDocument]:
        return load_documents_jsonl(self.docs_path)

    def save_dense(self, embeddings: np.ndarray) -> None:
        np.save(self.dense_path, embeddings.astype("float32"))

    def load_dense(self) -> np.ndarray:
        return np.load(self.dense_path)

    def save_joblib(self, path: Path, value: Any) -> None:
        joblib.dump(value, path)

    def load_joblib(self, path: Path) -> Any:
        return joblib.load(path)

    def save_config(self, config: dict[str, Any]) -> None:
        self.config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_config(self) -> dict[str, Any]:
        return json.loads(self.config_path.read_text(encoding="utf-8"))
