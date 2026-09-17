from __future__ import annotations

import json
import os
import re
import sys
import traceback
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
REPO_ROOT = APP_DIR.parent
NOTEBOOKLM_SRC = REPO_ROOT / "notebooklm" / "src"
CONFIG_PATH = REPO_ROOT / "notebooklm" / "config.yaml"

if str(NOTEBOOKLM_SRC) not in sys.path:
    sys.path.insert(0, str(NOTEBOOKLM_SRC))

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")

from notebooklm_system.config import load_config  # noqa: E402
from notebooklm_system.interfaces.api import (  # noqa: E402
    _attach_flashcard_images,
    _attach_quiz_images,
    _attach_summary_visuals,
    _ensure_index,
    _provider_status,
    _public_chunks,
)
from notebooklm_system.learning import generate_flashcards, generate_quiz, summarize  # noqa: E402
from notebooklm_system.llm import LLMProviderError  # noqa: E402
from notebooklm_system.rag import answer  # noqa: E402
from notebooklm_system.retriever import HybridRetriever  # noqa: E402
from notebooklm_system.store import LocalVectorStore  # noqa: E402


def load_runtime() -> tuple[Any, HybridRetriever, LocalVectorStore]:
    config = load_config(CONFIG_PATH)
    _ensure_index(config)
    retriever = HybridRetriever(config.index.output_dir, config.retrieval.model_dump())
    store = LocalVectorStore(config.index.output_dir)
    return config, retriever, store


def normalize_urls(value: Any) -> Any:
    if isinstance(value, str):
        if re.match(r"^(https?://|data:image/|blob:)", value, re.I):
            return value
        clean = value.replace("\\", "/").strip()
        marker = "/source-assets/"
        if marker in clean:
            tail = clean.split(marker, 1)[1].lstrip("/")
            return f"/api/source-assets/{tail}"
        if clean.startswith("source-assets/"):
            return f"/api/source-assets/{clean.removeprefix('source-assets/')}"
        if clean.startswith("api/source-assets/"):
            return f"/api/source-assets/{clean.removeprefix('api/source-assets/')}"
        return value
    if isinstance(value, list):
        return [normalize_urls(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_urls(item) for key, item in value.items()}
    return value


def filters_from_request(body: dict[str, Any]) -> dict[str, Any] | None:
    filters = body.get("filters") or {}
    lesson_id = body.get("lessonId") or body.get("lesson_id")
    subject = body.get("subject")
    class_level = body.get("classLevel") or body.get("class_level")
    if lesson_id:
        filters["lesson_id"] = lesson_id
    if subject:
        filters["subject"] = subject
    if class_level:
        filters["class_level"] = int(class_level)
    clean = {key: value for key, value in filters.items() if value not in (None, "")}
    return clean or None


def clean_query(value: Any) -> str:
    return str(value or "").strip()


def provider_from_request(body: dict[str, Any]) -> str | None:
    provider = body.get("provider")
    if provider in {"extractive", "ollama", "hf_local", "openai_compatible"}:
        return provider
    return None


def public_chunks(chunks: list[Any], config: Any) -> list[dict[str, Any]]:
    return normalize_urls(_public_chunks(chunks, config))


def action_health(config: Any, retriever: HybridRetriever, _store: LocalVectorStore, _body: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": True,
        "chunks": len(retriever.docs),
        "index": str(config.index.output_dir),
        "provider_default": config.generation.default_provider,
        "quiz_model": config.generation.quiz_model,
        "vision_model": config.generation.vision_model,
    }


def action_lessons(_config: Any, _retriever: HybridRetriever, store: LocalVectorStore, _body: dict[str, Any]) -> dict[str, Any]:
    lessons = store.load_json(store.lessons_path, [])
    return {"lessons": normalize_urls(lessons)}


def action_documents(_config: Any, retriever: HybridRetriever, _store: LocalVectorStore, _body: dict[str, Any]) -> dict[str, Any]:
    docs: dict[str, dict[str, Any]] = {}
    for doc in retriever.docs:
        meta = doc.metadata
        document_id = meta.document_id
        entry = docs.setdefault(
            document_id,
            {
                "document_id": document_id,
                "filename": meta.filename,
                "source": meta.source,
                "pages": set(),
                "chunks": 0,
            },
        )
        entry["chunks"] += 1
        entry["pages"].add(meta.page)
    payload = []
    for item in docs.values():
        item["pages"] = sorted(item["pages"])
        payload.append(item)
    return {"documents": payload}


def action_providers(config: Any, _retriever: HybridRetriever, _store: LocalVectorStore, _body: dict[str, Any]) -> dict[str, Any]:
    return {"providers": normalize_urls(_provider_status(config))}


def action_search(config: Any, retriever: HybridRetriever, _store: LocalVectorStore, body: dict[str, Any]) -> dict[str, Any]:
    query = clean_query(body.get("query"))
    top_k = int(body.get("topK") or body.get("top_k") or 10)
    chunks = retriever.search(query, final_top_k=top_k, filters=filters_from_request(body))
    return {"query": query, "results": public_chunks(chunks, config)}


def action_ask(config: Any, retriever: HybridRetriever, _store: LocalVectorStore, body: dict[str, Any]) -> dict[str, Any]:
    query = clean_query(body.get("query"))
    top_k = int(body.get("topK") or body.get("top_k") or 10)
    result = answer(
        retriever,
        config,
        query,
        k=top_k,
        filters=filters_from_request(body),
        provider=provider_from_request(body) or "openai_compatible",
    )
    payload = result.model_dump()
    payload["chunks"] = public_chunks(result.chunks, config)
    return normalize_urls(payload)


def action_summarize(config: Any, retriever: HybridRetriever, _store: LocalVectorStore, body: dict[str, Any]) -> dict[str, Any]:
    query = clean_query(body.get("query")) or None
    top_k = int(body.get("topK") or body.get("top_k") or 10)
    result = summarize(
        retriever,
        config,
        query=query,
        filters=filters_from_request(body),
        k=top_k,
        provider=provider_from_request(body) or "openai_compatible",
    )
    payload = result.model_dump()
    chunks = public_chunks(result.chunks, config)
    payload["chunks"] = chunks
    payload["visuals"] = normalize_urls(_attach_summary_visuals(payload, chunks, config))
    return normalize_urls(payload)


def action_quiz(config: Any, retriever: HybridRetriever, _store: LocalVectorStore, body: dict[str, Any]) -> dict[str, Any]:
    query = clean_query(body.get("query")) or None
    top_k = int(body.get("topK") or body.get("top_k") or 5)
    count = int(body.get("count") or 6)
    result = generate_quiz(
        retriever,
        config,
        query=query,
        filters=filters_from_request(body),
        count=count,
        k=top_k,
        provider=provider_from_request(body) or "openai_compatible",
    )
    payload = result.model_dump()
    chunks = public_chunks(result.chunks, config)
    payload["chunks"] = chunks
    payload["items"] = normalize_urls(_attach_quiz_images(payload.get("items") or [], chunks, config))
    return normalize_urls(payload)


def action_flashcards(config: Any, retriever: HybridRetriever, _store: LocalVectorStore, body: dict[str, Any]) -> dict[str, Any]:
    query = clean_query(body.get("query")) or None
    top_k = int(body.get("topK") or body.get("top_k") or 10)
    count = body.get("count")
    result = generate_flashcards(
        retriever,
        config,
        query=query,
        filters=filters_from_request(body),
        count=int(count) if count not in (None, "") else None,
        k=top_k,
        provider=provider_from_request(body) or "openai_compatible",
    )
    payload = result.model_dump()
    chunks = public_chunks(result.chunks, config)
    payload["chunks"] = chunks
    payload["cards"] = normalize_urls(_attach_flashcard_images(payload.get("cards") or [], chunks, config))
    return normalize_urls(payload)


ACTIONS = {
    "health": action_health,
    "lessons": action_lessons,
    "documents": action_documents,
    "providers": action_providers,
    "search": action_search,
    "ask": action_ask,
    "summarize": action_summarize,
    "quiz": action_quiz,
    "flashcards": action_flashcards,
}


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "health"
    if action not in ACTIONS:
        print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}, ensure_ascii=False))
        return 2

    try:
        raw = sys.stdin.read().strip()
        body = json.loads(raw) if raw else {}
        config, retriever, store = load_runtime()
        payload = ACTIONS[action](config, retriever, store, body)
        print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False))
        return 0
    except LLMProviderError as exc:
        print(json.dumps({"ok": False, "error": str(exc), "kind": "provider"}, ensure_ascii=False))
        return 3
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(limit=8),
                },
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
