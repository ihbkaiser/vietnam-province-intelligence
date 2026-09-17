from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import numpy as np

from .embeddings import HFTextEmbedder, l2_normalize
from .index_store import LocalIndexStore
from .schemas import RagDocument, SearchResult


def repair_mojibake(text: str) -> str:
    markers = ("Ã", "Ä", "Â", "Æ", "áº", "á»")
    current = text
    for _ in range(3):
        if not any(marker in current for marker in markers):
            break
        try:
            repaired = current.encode("latin1").decode("utf-8")
        except UnicodeError:
            break
        current_marker_count = sum(current.count(marker) for marker in markers)
        repaired_marker_count = sum(repaired.count(marker) for marker in markers)
        if repaired_marker_count >= current_marker_count:
            break
        current = repaired
    return current


def _top_indices(scores: np.ndarray, k: int, allowed: set[int] | None = None) -> list[int]:
    if allowed is not None:
        masked = np.full_like(scores, -np.inf, dtype="float32")
        for idx in allowed:
            masked[idx] = scores[idx]
        scores = masked
    k = min(k, len(scores))
    if k <= 0:
        return []
    candidates = np.argpartition(-scores, range(k))[:k]
    return sorted(candidates.tolist(), key=lambda idx: float(scores[idx]), reverse=True)


def _rrf(rank: int, k: int) -> float:
    return 1.0 / (k + rank)


def _normalize_for_exact_match(text: str) -> str:
    text = text.lower()
    text = text.replace(",", ".").replace(":", ".")
    return re.sub(r"\s+", " ", text)


def _exact_match_boost(query: str, text: str, weight: float) -> float:
    if weight <= 0:
        return 0.0
    query_norm = _normalize_for_exact_match(query)
    text_norm = _normalize_for_exact_match(text)
    boost = 0.0

    for figure in re.findall(r"h\u00ecnh\s+\d{1,2}\s*[\.,]\s*\d{1,2}", query_norm):
        if figure in text_norm:
            boost += weight * 2.0

    for year in re.findall(r"\b\d{3,4}\b", query_norm):
        if year in text_norm:
            boost += weight

    quoted_terms = re.findall(r"[\"“”']([^\"“”']{3,80})[\"“”']", query)
    for term in quoted_terms:
        if _normalize_for_exact_match(term) in text_norm:
            boost += weight

    tokens = [token for token in re.findall(r"\w+", query_norm, flags=re.UNICODE) if len(token) >= 4]
    if tokens:
        matched = sum(1 for token in set(tokens) if token in text_norm)
        boost += weight * 0.15 * matched
    return boost


class HybridRetriever:
    def __init__(self, index_dir: Path, config: dict[str, Any]) -> None:
        self.store = LocalIndexStore(index_dir)
        self.docs = self.store.load_documents()
        self.index_config = self.store.load_config()
        self.config = config
        self.dense_embeddings = self.store.load_dense()
        self.vectorizer = self.store.load_joblib(self.store.vectorizer_path)
        self.tfidf_matrix = self.store.load_joblib(self.store.sparse_matrix_path)
        self.svd = self.store.load_joblib(self.store.svd_path) if self.store.svd_path.exists() else None
        self._hf_embedder: HFTextEmbedder | None = None
        self.dense_error: str | None = None

    def _allowed_indices(self, filters: dict[str, Any] | None) -> set[int] | None:
        if not filters:
            return None
        allowed: set[int] = set()
        page_min = filters.get("page_min")
        page_max = filters.get("page_max")
        for idx, doc in enumerate(self.docs):
            if page_min is not None and doc.page_number < int(page_min):
                continue
            if page_max is not None and doc.page_number > int(page_max):
                continue
            if filters.get("class_level") and doc.metadata.get("class_level") != filters.get("class_level"):
                continue
            allowed.add(idx)
        return allowed

    def _dense_query_vector(self, query: str) -> np.ndarray | None:
        backend = self.index_config.get("embedding_backend")
        if backend == "hf":
            if self._hf_embedder is None:
                self._hf_embedder = HFTextEmbedder(
                    self.index_config["embedding_model"],
                    device=self.index_config.get("device", "cpu"),
                    max_length=int(self.index_config.get("max_length", 512)),
                    local_files_only=True,
                )
            return self._hf_embedder.encode([query], is_query=True, batch_size=1)[0]
        if backend == "tfidf_svd":
            query_tfidf = self.vectorizer.transform([query])
            vector = self.svd.transform(query_tfidf).astype("float32")
            return l2_normalize(vector)[0]
        raise ValueError(f"Unsupported embedding backend: {backend}")

    def search(
        self,
        query: str,
        *,
        final_top_k: int | None = None,
        dense_top_k: int | None = None,
        sparse_top_k: int | None = None,
        filters: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        retrieval_config = self.config.get("retrieval", {})
        final_top_k = final_top_k or int(retrieval_config.get("final_top_k", 5))
        dense_top_k = dense_top_k or int(retrieval_config.get("dense_top_k", 12))
        sparse_top_k = sparse_top_k or int(retrieval_config.get("sparse_top_k", 12))
        rrf_k = int(retrieval_config.get("rrf_k", 60))
        dense_weight = float(retrieval_config.get("dense_weight", 1.0))
        sparse_weight = float(retrieval_config.get("sparse_weight", 1.0))
        exact_match_weight = float(retrieval_config.get("exact_match_weight", 0.0))
        allowed = self._allowed_indices(filters)
        query = repair_mojibake(query)

        sparse_query = self.vectorizer.transform([query])
        sparse_scores = (self.tfidf_matrix @ sparse_query.T).toarray().ravel().astype("float32")
        dense_scores = np.zeros(len(self.docs), dtype="float32")
        dense_ranking: list[int] = []
        try:
            dense_query = self._dense_query_vector(query)
            if dense_query is not None:
                dense_scores = self.dense_embeddings @ dense_query
                dense_ranking = _top_indices(dense_scores, dense_top_k, allowed)
                self.dense_error = None
        except Exception as exc:
            self.dense_error = f"{type(exc).__name__}: {exc}"

        sparse_ranking = _top_indices(sparse_scores, sparse_top_k, allowed)

        merged: dict[int, SearchResult] = {}
        for rank, idx in enumerate(dense_ranking, start=1):
            merged.setdefault(
                idx,
                SearchResult(document=self.docs[idx], score=0.0, dense_score=float(dense_scores[idx]), sparse_score=float(sparse_scores[idx])),
            )
            merged[idx].score += dense_weight * _rrf(rank, rrf_k)
            merged[idx].dense_rank = rank
        for rank, idx in enumerate(sparse_ranking, start=1):
            merged.setdefault(
                idx,
                SearchResult(document=self.docs[idx], score=0.0, dense_score=float(dense_scores[idx]), sparse_score=float(sparse_scores[idx])),
            )
            merged[idx].score += sparse_weight * _rrf(rank, rrf_k)
            merged[idx].sparse_rank = rank

        for item in merged.values():
            item.score += _exact_match_boost(query, item.document.text, exact_match_weight)

        results = sorted(merged.values(), key=lambda item: item.score, reverse=True)
        return results[:final_top_k]


def result_to_dict(result: SearchResult, extracted_dir: Path | None = None) -> dict[str, Any]:
    doc = result.document
    images = []
    for image in doc.images:
        image_copy = dict(image)
        if extracted_dir and image_copy.get("path"):
            image_copy["absolute_path"] = str((extracted_dir / str(image_copy["path"])).resolve())
        images.append(image_copy)
    return {
        "chunk_id": doc.chunk_id,
        "page_number": doc.page_number,
        "score": result.score,
        "dense_score": result.dense_score,
        "sparse_score": result.sparse_score,
        "dense_rank": result.dense_rank,
        "sparse_rank": result.sparse_rank,
        "text": doc.text,
        "images": images,
        "metadata": doc.metadata,
    }


def compact_snippet(text: str, max_chars: int = 500) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"
