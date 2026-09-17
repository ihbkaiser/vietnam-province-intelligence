from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

import numpy as np
from sklearn.preprocessing import normalize

from .schemas import MetadataFilter, NotebookDocument, RetrievedChunk
from .store import LocalVectorStore
from .text_utils import normalize_for_search, repair_mojibake


def _top_indices(scores: np.ndarray, k: int, allowed: set[int] | None = None) -> list[int]:
    if allowed is not None:
        allowed = {idx for idx in allowed if 0 <= idx < len(scores)}
        if not allowed:
            return []
        k = min(k, len(allowed))
        masked = np.full_like(scores, -np.inf, dtype="float32")
        for idx in allowed:
            masked[idx] = scores[idx]
        scores = masked
    else:
        k = min(k, len(scores))
    if k <= 0:
        return []
    candidates = np.argpartition(-scores, range(k))[:k]
    return sorted(candidates.tolist(), key=lambda idx: float(scores[idx]), reverse=True)


def _rrf(rank: int, k: int) -> float:
    return 1.0 / (k + rank)


def _coerce_filter(filters: MetadataFilter | dict | None) -> MetadataFilter | None:
    if filters is None:
        return None
    if isinstance(filters, MetadataFilter):
        return filters
    return MetadataFilter.model_validate(filters)


def _definition_terms(query_norm: str) -> list[str]:
    if not re.search(r"\b(là\s+gì|định\s+nghĩa|khái\s+niệm)\b", query_norm):
        return []
    before_question = re.split(r"\blà\s+gì\b", query_norm, maxsplit=1)[0]
    before_question = re.sub(r"\b(hãy|cho biết|nêu|trình bày|em hiểu|theo sgk)\b", " ", before_question)
    raw_terms = re.split(r"\s+(?:và|hoặc)\s+|[;,.?/]+", before_question)
    terms: list[str] = []
    for term in raw_terms:
        clean = re.sub(r"\s+", " ", term).strip()
        if len(clean) >= 4:
            terms.append(clean)
    return terms


def _definition_boost(query_norm: str, text_norm: str, weight: float) -> float:
    boost = 0.0
    for term in _definition_terms(query_norm):
        if term not in text_norm:
            continue
        sentence_matched = False
        for sentence in re.split(r"[.!?。]\s*", text_norm):
            term_pos = sentence.find(term)
            la_match = re.search(r"\blà\b", sentence, flags=re.UNICODE)
            if term_pos >= 0 and la_match and term_pos < la_match.start() and la_match.start() - term_pos <= 140:
                sentence_matched = True
                break
        boost += weight * (6.0 if sentence_matched else 1.2)
    return boost


def _exact_match_boost(query: str, text: str, weight: float) -> float:
    if weight <= 0:
        return 0.0
    query_norm = normalize_for_search(query)
    text_norm = normalize_for_search(text)
    boost = _definition_boost(query_norm, text_norm, weight)

    for figure in re.findall(r"hình\s+\d{1,2}\s*[\.,]\s*\d{1,2}", query_norm):
        if figure in text_norm:
            boost += weight * 2.5

    for year in re.findall(r"\b\d{3,4}\b", query_norm):
        if year in text_norm:
            boost += weight

    quoted_terms = re.findall(r"[\"'“”]([^\"'“”]{3,80})[\"'“”]", query)
    for term in quoted_terms:
        if normalize_for_search(term) in text_norm:
            boost += weight * 1.5

    tokens = [token for token in re.findall(r"\w+", query_norm, flags=re.UNICODE) if len(token) >= 4]
    if tokens:
        matched = sum(1 for token in set(tokens) if token in text_norm)
        boost += weight * 0.12 * matched
    return boost


class HybridRetriever:
    def __init__(self, index_dir: Path, retrieval_config: dict[str, object] | None = None) -> None:
        self.store = LocalVectorStore(index_dir)
        self.docs = self.store.load_documents()
        self.vectorizer = self.store.load_joblib(self.store.vectorizer_path)
        self.sparse_matrix = self.store.load_joblib(self.store.sparse_matrix_path)
        self.svd = self.store.load_joblib(self.store.svd_path)
        self.dense_embeddings = self.store.load_dense()
        self.index_config = self.store.load_json(self.store.config_path, {})
        self.retrieval_config = retrieval_config or {}

    def _allowed_indices(self, filters: MetadataFilter | dict | None) -> set[int] | None:
        f = _coerce_filter(filters)
        if f is None:
            return None
        allowed: set[int] = set()
        for idx, doc in enumerate(self.docs):
            meta = doc.metadata
            if f.filename and meta.filename != f.filename:
                continue
            if f.document_id and meta.document_id != f.document_id:
                continue
            if f.lesson_id and meta.lesson_id != f.lesson_id:
                continue
            if f.subject and f.subject not in {meta.subject, meta.subject_label}:
                continue
            if f.class_level and meta.class_level != f.class_level:
                continue
            if f.page_min is not None and meta.page < f.page_min:
                continue
            if f.page_max is not None and meta.page > f.page_max:
                continue
            allowed.add(idx)
        return allowed

    def all_documents(self, filters: MetadataFilter | dict | None = None) -> list[RetrievedChunk]:
        allowed = self._allowed_indices(filters)
        indices: Iterable[int] = allowed if allowed is not None else range(len(self.docs))
        results = [
            RetrievedChunk(text=self.docs[idx].text, score=0.0, metadata=self.docs[idx].metadata, images=self.docs[idx].images)
            for idx in indices
        ]
        return sorted(results, key=lambda item: (item.metadata.filename, item.metadata.page, item.metadata.chunk_id))

    def search(
        self,
        query: str,
        *,
        final_top_k: int | None = None,
        initial_top_k: int | None = None,
        filters: MetadataFilter | dict | None = None,
    ) -> list[RetrievedChunk]:
        query = repair_mojibake(query)
        final_top_k = final_top_k or int(self.retrieval_config.get("final_top_k", 5))
        initial_top_k = initial_top_k or int(self.retrieval_config.get("initial_top_k", max(final_top_k * 3, 10)))
        rrf_k = int(self.retrieval_config.get("rrf_k", 60))
        sparse_weight = float(self.retrieval_config.get("sparse_weight", 1.0))
        dense_weight = float(self.retrieval_config.get("dense_weight", 0.85))
        exact_weight = float(self.retrieval_config.get("exact_match_weight", 0.025))
        allowed = self._allowed_indices(filters)

        sparse_query = self.vectorizer.transform([query])
        sparse_scores = (self.sparse_matrix @ sparse_query.T).toarray().ravel().astype("float32")
        dense_query = normalize(self.svd.transform(sparse_query), norm="l2").astype("float32")[0]
        dense_scores = self.dense_embeddings @ dense_query

        sparse_ranking = _top_indices(sparse_scores, initial_top_k, allowed)
        dense_ranking = _top_indices(dense_scores, initial_top_k, allowed)
        merged: dict[int, RetrievedChunk] = {}

        for rank, idx in enumerate(dense_ranking, start=1):
            doc = self.docs[idx]
            merged.setdefault(
                idx,
                RetrievedChunk(
                    text=doc.text,
                    score=0.0,
                    metadata=doc.metadata,
                    images=doc.images,
                    dense_score=float(dense_scores[idx]),
                    sparse_score=float(sparse_scores[idx]),
                ),
            )
            merged[idx].score += dense_weight * _rrf(rank, rrf_k)
            merged[idx].dense_rank = rank

        for rank, idx in enumerate(sparse_ranking, start=1):
            doc = self.docs[idx]
            merged.setdefault(
                idx,
                RetrievedChunk(
                    text=doc.text,
                    score=0.0,
                    metadata=doc.metadata,
                    images=doc.images,
                    dense_score=float(dense_scores[idx]),
                    sparse_score=float(sparse_scores[idx]),
                ),
            )
            merged[idx].score += sparse_weight * _rrf(rank, rrf_k)
            merged[idx].sparse_rank = rank

        for item in merged.values():
            item.score += _exact_match_boost(query, item.text, exact_weight)

        return sorted(merged.values(), key=lambda item: item.score, reverse=True)[:final_top_k]


class OptionalReranker:
    def __init__(self, model_name: str, *, enabled: bool = False) -> None:
        self.model_name = model_name
        self.enabled = enabled
        self._model = None
        self.error: str | None = None

    def _load(self):
        if self._model is not None:
            return self._model
        from sentence_transformers import CrossEncoder

        self._model = CrossEncoder(self.model_name)
        return self._model

    def rerank(self, query: str, chunks: list[RetrievedChunk], top_k: int) -> list[RetrievedChunk]:
        if not self.enabled or not chunks:
            return chunks[:top_k]
        try:
            model = self._load()
            scores = model.predict([[query, chunk.text] for chunk in chunks])
            for chunk, score in zip(chunks, scores):
                chunk.score = float(score)
            self.error = None
            return sorted(chunks, key=lambda chunk: chunk.score, reverse=True)[:top_k]
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            return chunks[:top_k]
