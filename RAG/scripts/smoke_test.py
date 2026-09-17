from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT / "src"))

from rag_system.config import load_config
from rag_system.retriever import HybridRetriever, result_to_dict


QUESTIONS = [
    "Vì sao cần học lịch sử?",
    "Hình 1.12 nói về tư liệu lịch sử gì?",
    "Căn cứ vào đâu để biết và dựng lại lịch sử?",
    "Trái Đất có những chuyển động chính nào?",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke test the RAG retriever.")
    parser.add_argument("--config", type=Path, default=RAG_ROOT / "config.yaml")
    parser.add_argument("--output", type=Path, default=RAG_ROOT / "storage" / "class_6" / "smoke_test.json")
    args = parser.parse_args()

    config = load_config(args.config)
    retriever = HybridRetriever(config["index"]["output_dir"], config)
    payload = []
    for question in QUESTIONS:
        results = retriever.search(question)
        payload.append({"question": question, "results": [result_to_dict(result, config["data"]["extracted_dir"]) for result in results]})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "questions": len(payload)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
