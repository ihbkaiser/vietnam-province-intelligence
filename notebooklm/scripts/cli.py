from __future__ import annotations

import argparse
import sys
from pathlib import Path

NOTEBOOKLM_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NOTEBOOKLM_ROOT / "src"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from notebooklm_system.config import load_config
from notebooklm_system.export import export_model
from notebooklm_system.indexing import build_index
from notebooklm_system.learning import generate_flashcards, generate_quiz, summarize
from notebooklm_system.rag import answer
from notebooklm_system.retriever import HybridRetriever
from notebooklm_system.schemas import MetadataFilter


def _filters(args: argparse.Namespace) -> MetadataFilter | None:
    payload = {
        "lesson_id": getattr(args, "lesson_id", None),
        "subject": getattr(args, "subject", None),
        "page": getattr(args, "page", None),
        "page_min": getattr(args, "page_min", None),
        "page_max": getattr(args, "page_max", None),
    }
    payload = {key: value for key, value in payload.items() if value is not None}
    return MetadataFilter.model_validate(payload) if payload else None


def _common_filters(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--lesson-id")
    parser.add_argument("--subject")
    parser.add_argument("--page", type=int)
    parser.add_argument("--page-min", type=int)
    parser.add_argument("--page-max", type=int)


def main() -> None:
    parser = argparse.ArgumentParser(description="NotebookLM CLI")
    parser.add_argument("--config", type=Path, default=NOTEBOOKLM_ROOT / "config.yaml")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("build-index")

    ask_p = sub.add_parser("ask")
    ask_p.add_argument("query")
    provider_choices = ["extractive", "ollama", "hf_local", "openai_compatible"]

    ask_p.add_argument("--provider", choices=provider_choices, default=None)
    ask_p.add_argument("--top-k", type=int, default=None)
    _common_filters(ask_p)

    search_p = sub.add_parser("search")
    search_p.add_argument("query")
    search_p.add_argument("--top-k", type=int, default=5)
    _common_filters(search_p)

    sum_p = sub.add_parser("summarize")
    sum_p.add_argument("--query")
    sum_p.add_argument("--provider", choices=provider_choices, default=None)
    _common_filters(sum_p)

    quiz_p = sub.add_parser("quiz")
    quiz_p.add_argument("--query")
    quiz_p.add_argument("--count", type=int, default=None)
    quiz_p.add_argument("--provider", choices=provider_choices, default=None)
    _common_filters(quiz_p)

    cards_p = sub.add_parser("flashcards")
    cards_p.add_argument("--query")
    cards_p.add_argument("--count", type=int, default=None)
    cards_p.add_argument("--provider", choices=provider_choices, default=None)
    _common_filters(cards_p)

    args = parser.parse_args()
    config = load_config(args.config)
    if args.command == "build-index":
        print(build_index(config, recreate=True))
        return

    retriever = HybridRetriever(config.index.output_dir, config.retrieval.model_dump())
    filters = _filters(args)
    if args.command == "search":
        for item in retriever.search(args.query, final_top_k=args.top_k, filters=filters):
            print(f"[{item.metadata.page} | {item.metadata.chunk_id} | {item.score:.4f}] {item.text[:240]}")
    elif args.command == "ask":
        print(export_model(answer(retriever, config, args.query, k=args.top_k, filters=filters, provider=args.provider), fmt="md"))
    elif args.command == "summarize":
        print(export_model(summarize(retriever, config, query=args.query, filters=filters, provider=args.provider), fmt="md"))
    elif args.command == "quiz":
        print(export_model(generate_quiz(retriever, config, query=args.query, filters=filters, count=args.count, provider=args.provider), fmt="md"))
    elif args.command == "flashcards":
        print(export_model(generate_flashcards(retriever, config, query=args.query, filters=filters, count=args.count, provider=args.provider), fmt="md"))


if __name__ == "__main__":
    main()
