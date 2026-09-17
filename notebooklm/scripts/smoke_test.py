from __future__ import annotations

import argparse
import sys
from pathlib import Path

NOTEBOOKLM_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NOTEBOOKLM_ROOT / "src"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from notebooklm_system.config import load_config
from notebooklm_system.indexing import build_index
from notebooklm_system.learning import generate_flashcards, generate_quiz, summarize
from notebooklm_system.rag import answer
from notebooklm_system.retriever import HybridRetriever


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local smoke test.")
    parser.add_argument("--config", type=Path, default=NOTEBOOKLM_ROOT / "config.yaml")
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.rebuild or not (config.index.output_dir / "documents.jsonl").exists():
        print(build_index(config, recreate=True))
    retriever = HybridRetriever(config.index.output_dir, config.retrieval.model_dump())

    question = "Vì sao cần học lịch sử?"
    rag = answer(retriever, config, question, k=3, provider="extractive")
    summary = summarize(retriever, config, query=question, k=4, provider="extractive")
    quiz = generate_quiz(retriever, config, query=question, count=3, provider="extractive")
    cards = generate_flashcards(retriever, config, query=question, count=3, provider="extractive")

    print("answer:", rag.answer[:240].replace("\n", " "))
    print("citations:", [citation.model_dump() for citation in rag.citations[:3]])
    print("summary_points:", len(summary.key_points))
    print("quiz_items:", len(quiz.items))
    print("flashcards:", len(cards.cards))
    assert rag.chunks
    assert summary.key_points
    assert quiz.items
    assert cards.cards


if __name__ == "__main__":
    main()
