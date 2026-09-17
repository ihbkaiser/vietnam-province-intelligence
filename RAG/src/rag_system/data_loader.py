from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schemas import RagDocument


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_documents(
    rag_chunks_path: Path,
    extracted_dir: Path,
    book_metadata_path: Path | None = None,
    image_metadata_path: Path | None = None,
) -> list[RagDocument]:
    book_meta = read_json(book_metadata_path, {}) if book_metadata_path else {}
    image_records = read_json(image_metadata_path, []) if image_metadata_path else []
    valid_image_paths = {str(item.get("path")) for item in image_records if item.get("path")}

    docs: list[RagDocument] = []
    for row in read_jsonl(rag_chunks_path):
        page_number = int(row.get("page_number") or 0)
        chunk_id = str(row.get("chunk_id") or f"page_{page_number:03d}_{len(docs)+1:02d}")
        images = []
        for image in row.get("images") or []:
            if not isinstance(image, dict):
                continue
            image_path = str(image.get("path") or "")
            image_copy = dict(image)
            image_copy["exists"] = bool(image_path and (extracted_dir / image_path).exists())
            image_copy["registered"] = image_path in valid_image_paths
            images.append(image_copy)

        metadata = {
            "book": Path(str(book_meta.get("source_pdf") or "SGK Lịch sử và địa lí 6 CD")).stem,
            "class_level": 6,
            "subject": "history_geography",
            "page_number": page_number,
            "source_pdf": book_meta.get("source_pdf"),
            "spellcheck_engine": row.get("spellcheck_engine") or book_meta.get("spellcheck", {}).get("model"),
        }
        docs.append(
            RagDocument(
                doc_id=chunk_id,
                chunk_id=chunk_id,
                page_number=page_number,
                text=str(row.get("text") or "").strip(),
                images=images,
                metadata=metadata,
            )
        )
    return docs


def write_documents_jsonl(path: Path, docs: list[RagDocument]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for doc in docs:
        rows.append(
            json.dumps(
                {
                    "doc_id": doc.doc_id,
                    "chunk_id": doc.chunk_id,
                    "page_number": doc.page_number,
                    "text": doc.text,
                    "images": doc.images,
                    "metadata": doc.metadata,
                },
                ensure_ascii=False,
            )
        )
    path.write_text("\n".join(rows) + ("\n" if rows else ""), encoding="utf-8")


def load_documents_jsonl(path: Path) -> list[RagDocument]:
    docs: list[RagDocument] = []
    for row in read_jsonl(path):
        docs.append(
            RagDocument(
                doc_id=str(row["doc_id"]),
                chunk_id=str(row["chunk_id"]),
                page_number=int(row["page_number"]),
                text=str(row["text"]),
                images=list(row.get("images") or []),
                metadata=dict(row.get("metadata") or {}),
            )
        )
    return docs
