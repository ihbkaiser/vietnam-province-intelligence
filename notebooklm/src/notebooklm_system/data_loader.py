from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from .config import AppConfig
from .schemas import ChunkMetadata, ImageRef, LessonInfo, NotebookDocument
from .text_utils import clean_extracted_text, read_json, read_jsonl, repair_mojibake


def document_id_for(source: str) -> str:
    return hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]


def split_text_recursive(text: str, *, chunk_size: int, chunk_overlap: int, min_chunk_chars: int = 80) -> list[str]:
    clean = clean_extracted_text(text).strip()
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [clean]

    units = re.split(r"(\n\n+|\n|(?<=[.!?])\s+)", clean)
    pieces: list[str] = []
    buffer = ""
    for unit in units:
        if not unit:
            continue
        candidate = (buffer + unit).strip()
        if len(candidate) <= chunk_size:
            buffer = candidate + (" " if not unit.endswith("\n") else "")
            continue
        if len(buffer.strip()) >= min_chunk_chars:
            pieces.append(buffer.strip())
        buffer = unit.strip()
        while len(buffer) > chunk_size:
            pieces.append(buffer[:chunk_size].strip())
            buffer = buffer[max(0, chunk_size - chunk_overlap):].strip()
    if len(buffer.strip()) >= min_chunk_chars or not pieces:
        pieces.append(buffer.strip())

    if chunk_overlap <= 0 or len(pieces) <= 1:
        return pieces

    overlapped: list[str] = []
    for index, piece in enumerate(pieces):
        if index == 0:
            overlapped.append(piece)
            continue
        tail = overlapped[-1][-chunk_overlap:].strip()
        merged = f"{tail}\n{piece}".strip()
        overlapped.append(merged[: chunk_size + chunk_overlap].strip())
    return overlapped


def load_lesson_catalog(path: Path, *, max_page: int | None = None) -> list[LessonInfo]:
    raw = read_json(path, {}) or {}
    lessons = []
    for item in raw.get("lessons") or []:
        lesson_id = item.get("lessonId") or item.get("lesson_id")
        lesson_title = item.get("lessonTitle") or item.get("lesson_title")
        if not lesson_id or not lesson_title:
            continue
        lessons.append(
            LessonInfo(
                lesson_id=str(lesson_id),
                lesson_title=repair_mojibake(str(lesson_title)),
                subject=str(item.get("subject") or "unknown"),
                subject_label=repair_mojibake(str(item.get("subjectLabel") or item.get("subject_label") or item.get("subject") or "Khác")),
                lesson_number=item.get("lessonNumber") or item.get("lesson_number"),
                start_page=item.get("startPage") or item.get("start_page"),
                chunk_count=0,
            )
        )

    lessons.sort(key=lambda lesson: (lesson.start_page or 10**9, lesson.lesson_id))
    for index, lesson in enumerate(lessons):
        next_start = lessons[index + 1].start_page if index + 1 < len(lessons) else None
        if next_start:
            lesson.end_page = max(lesson.start_page or next_start, next_start - 1)
        elif max_page:
            lesson.end_page = max_page
    return lessons


def infer_lesson(page_number: int, lessons: list[LessonInfo]) -> LessonInfo | None:
    candidates = [
        lesson
        for lesson in lessons
        if lesson.start_page is not None
        and page_number >= lesson.start_page
        and (lesson.end_page is None or page_number <= lesson.end_page)
    ]
    if candidates:
        return candidates[-1]
    prior = [lesson for lesson in lessons if lesson.start_page is not None and lesson.start_page <= page_number]
    return prior[-1] if prior else None


def _load_images_by_page(image_metadata_path: Path, extracted_dir: Path) -> dict[int, list[ImageRef]]:
    images_by_page: dict[int, list[ImageRef]] = {}
    for item in read_json(image_metadata_path, []) or []:
        if not isinstance(item, dict):
            continue
        page = int(item.get("page_number") or item.get("page") or 0)
        if page <= 0:
            continue
        image_path = str(item.get("path") or "")
        images_by_page.setdefault(page, []).append(
            ImageRef(
                id=str(item.get("id") or ""),
                path=image_path or None,
                label=repair_mojibake(str(item.get("label") or "")) or None,
                caption=repair_mojibake(str(item.get("caption") or "")) or None,
                type=str(item.get("type") or "image"),
                page_number=page,
                exists=bool(image_path and (extracted_dir / image_path).exists()),
            )
        )
    return images_by_page


def load_textbook_documents(config: AppConfig) -> tuple[list[NotebookDocument], list[LessonInfo]]:
    rows = read_jsonl(config.data.rag_chunks_path)
    book_meta = read_json(config.data.book_metadata_path, {}) or {}
    source_pdf = repair_mojibake(str(book_meta.get("source_pdf") or "SGK Lịch sử và Địa lí 6 Cánh Diều"))
    filename = Path(source_pdf).name
    doc_id = document_id_for(f"{filename}:{len(rows)}")
    max_page = max((int(row.get("page_number") or 0) for row in rows), default=0)
    lesson_max_page = max_page
    if config.data.reference_start_page:
        lesson_max_page = min(lesson_max_page, config.data.reference_start_page - 1)
    lessons = load_lesson_catalog(config.data.lesson_metadata_path, max_page=lesson_max_page)
    if config.data.reference_start_page:
        reference_end = (config.data.exclude_from_index_start_page - 1) if config.data.exclude_from_index_start_page else max_page
        if reference_end >= config.data.reference_start_page:
            lessons.append(
                LessonInfo(
                    lesson_id="reference_glossary",
                    lesson_title="Bảng giải thích thuật ngữ và tra cứu",
                    subject="reference",
                    subject_label="Phụ lục",
                    start_page=config.data.reference_start_page,
                    end_page=reference_end,
                    chunk_count=0,
                )
            )
    images_by_page = _load_images_by_page(config.data.image_metadata_path, config.data.extracted_dir)

    docs: list[NotebookDocument] = []
    for row in rows:
        page_number = int(row.get("page_number") or 0)
        if config.data.exclude_from_index_start_page and page_number >= config.data.exclude_from_index_start_page:
            continue
        text = clean_extracted_text(str(row.get("text") or "")).strip()
        if not text:
            continue
        lesson = infer_lesson(page_number, lessons)
        split_chunks = split_text_recursive(
            text,
            chunk_size=config.index.chunk_size,
            chunk_overlap=config.index.chunk_overlap,
            min_chunk_chars=config.index.min_chunk_chars,
        )
        for part_index, chunk_text in enumerate(split_chunks, start=1):
            if len(chunk_text) < config.index.min_chunk_chars:
                continue
            base_chunk_id = str(row.get("chunk_id") or f"page_{page_number:03d}")
            chunk_id = base_chunk_id if len(split_chunks) == 1 else f"{base_chunk_id}_{part_index:02d}"
            metadata = ChunkMetadata(
                document_id=doc_id,
                filename=filename,
                source=str(config.data.rag_chunks_path),
                page=page_number,
                chunk_id=chunk_id,
                section=lesson.lesson_title if lesson else None,
                class_level=6,
                subject=lesson.subject if lesson else "unknown",
                subject_label=lesson.subject_label if lesson else "Khác",
                lesson_id=lesson.lesson_id if lesson else None,
                lesson_title=lesson.lesson_title if lesson else None,
                lesson_number=lesson.lesson_number if lesson else None,
                source_pdf=source_pdf,
            )
            docs.append(
                NotebookDocument(
                    doc_id=chunk_id,
                    text=chunk_text,
                    metadata=metadata,
                    images=images_by_page.get(page_number, []),
                )
            )

    lesson_by_id = {lesson.lesson_id: lesson for lesson in lessons}
    for doc in docs:
        if doc.metadata.lesson_id and doc.metadata.lesson_id in lesson_by_id:
            lesson_by_id[doc.metadata.lesson_id].chunk_count += 1
    return docs, lessons


def document_info(docs: list[NotebookDocument], lessons: list[LessonInfo]) -> list[dict[str, Any]]:
    if not docs:
        return []
    first = docs[0]
    pages = sorted({doc.metadata.page for doc in docs})
    active_lesson_ids = {doc.metadata.lesson_id for doc in docs if doc.metadata.lesson_id}
    return [
        {
            "document_id": first.metadata.document_id,
            "filename": first.metadata.filename,
            "source": first.metadata.source_pdf or first.metadata.source,
            "pages": pages,
            "chunks": len(docs),
            "lessons": [lesson.model_dump() for lesson in lessons if lesson.lesson_id in active_lesson_ids],
        }
    ]
