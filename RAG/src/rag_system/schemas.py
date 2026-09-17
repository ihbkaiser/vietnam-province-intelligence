from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RagDocument:
    doc_id: str
    chunk_id: str
    page_number: int
    text: str
    images: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResult:
    document: RagDocument
    score: float
    dense_score: float = 0.0
    sparse_score: float = 0.0
    dense_rank: int | None = None
    sparse_rank: int | None = None
