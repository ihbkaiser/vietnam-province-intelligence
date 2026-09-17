from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ImageRef(BaseModel):
    id: str | None = None
    path: str | None = None
    label: str | None = None
    caption: str | None = None
    type: str | None = None
    page_number: int | None = None
    exists: bool | None = None
    url: str | None = None


class LessonInfo(BaseModel):
    lesson_id: str
    lesson_title: str
    subject: str
    subject_label: str
    lesson_number: int | None = None
    start_page: int | None = None
    end_page: int | None = None
    chunk_count: int = 0


class ChunkMetadata(BaseModel):
    document_id: str
    filename: str
    source: str
    page: int
    chunk_id: str
    section: str | None = None
    class_level: int | None = None
    subject: str | None = None
    subject_label: str | None = None
    lesson_id: str | None = None
    lesson_title: str | None = None
    lesson_number: int | None = None
    source_pdf: str | None = None


class NotebookDocument(BaseModel):
    doc_id: str
    text: str
    metadata: ChunkMetadata
    images: list[ImageRef] = Field(default_factory=list)


class RetrievedChunk(BaseModel):
    text: str
    score: float
    metadata: ChunkMetadata
    images: list[ImageRef] = Field(default_factory=list)
    dense_score: float = 0.0
    sparse_score: float = 0.0
    dense_rank: int | None = None
    sparse_rank: int | None = None


class Citation(BaseModel):
    source_index: int
    source_marker: str
    filename: str
    page: int
    section: str | None = None
    chunk_id: str | None = None
    lesson_title: str | None = None


class RagAnswer(BaseModel):
    question: str
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    provider: str = "extractive"
    model: str | None = None


class Summary(BaseModel):
    scope: Literal["query", "document", "filter", "corpus"]
    target: str | None = None
    summary: str
    key_points: list[str] = Field(default_factory=list)
    image_hints: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    provider: str = "extractive"
    model: str | None = None


class QuizItem(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int
    explanation: str
    source_markers: list[str] = Field(default_factory=list)
    difficulty: str | None = None
    topic: str | None = None
    evidence_text: str | None = None
    image_hint: str | None = None

    @model_validator(mode="after")
    def validate_correct_index(self) -> "QuizItem":
        if not 0 <= self.correct_index < len(self.options):
            raise ValueError("correct_index out of range")
        return self


class QuizSet(BaseModel):
    scope: Literal["query", "document", "filter", "corpus"]
    target: str | None = None
    items: list[QuizItem] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    provider: str = "extractive"
    model: str | None = None


class Flashcard(BaseModel):
    front: str
    back: str
    hint: str | None = None
    topic: str | None = None
    source_markers: list[str] = Field(default_factory=list)
    evidence_text: str | None = None
    image_hint: str | None = None


class FlashcardSet(BaseModel):
    scope: Literal["query", "document", "filter", "corpus"]
    target: str | None = None
    cards: list[Flashcard] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    provider: str = "extractive"
    model: str | None = None


class MetadataFilter(BaseModel):
    filename: str | None = None
    page: int | None = None
    page_min: int | None = None
    page_max: int | None = None
    document_id: str | None = None
    lesson_id: str | None = None
    subject: str | None = None
    class_level: int | None = None

    @model_validator(mode="after")
    def normalize(self) -> "MetadataFilter":
        for field in ("filename", "document_id", "lesson_id", "subject"):
            value = getattr(self, field)
            if isinstance(value, str):
                setattr(self, field, value.strip() or None)
        if self.page is not None:
            self.page_min = self.page
            self.page_max = self.page
        return self


class DocumentInfo(BaseModel):
    document_id: str
    filename: str
    source: str | None = None
    pages: list[int] = Field(default_factory=list)
    chunks: int = 0
    lessons: list[LessonInfo] = Field(default_factory=list)


class UploadResponse(BaseModel):
    filename: str
    chunks_indexed: int
    message: str
