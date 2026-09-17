from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT / "src"))

from rag_system.config import load_config
from rag_system.generator import OllamaGenerator, extractive_answer
from rag_system.retriever import HybridRetriever, compact_snippet, repair_mojibake, result_to_dict


def main() -> None:
    parser = argparse.ArgumentParser(description="Query the local textbook RAG index.")
    parser.add_argument("--config", type=Path, default=RAG_ROOT / "config.yaml")
    parser.add_argument("--question", required=True)
    parser.add_argument("--top-k", type=int, default=None)
    parser.add_argument("--provider", choices=["extractive", "ollama"], default=None)
    parser.add_argument("--page-min", type=int, default=None)
    parser.add_argument("--page-max", type=int, default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    retriever = HybridRetriever(config["index"]["output_dir"], config)
    filters = {key: value for key, value in {"page_min": args.page_min, "page_max": args.page_max}.items() if value is not None}
    question = repair_mojibake(args.question)
    results = retriever.search(question, final_top_k=args.top_k, filters=filters)
    provider = args.provider or config.get("generation", {}).get("default_provider", "extractive")

    if provider == "ollama":
        generator = OllamaGenerator(
            config.get("generation", {}).get("ollama_base_url", "http://localhost:11434"),
            config.get("generation", {}).get("ollama_model", "qwen3:4b"),
        )
        answer = generator.generate(question, results, int(config.get("generation", {}).get("max_context_chars", 7000)))
    else:
        answer = extractive_answer(question, results)

    payload = {
        "question": question,
        "answer": answer,
        "results": [result_to_dict(result, config["data"]["extracted_dir"]) for result in results],
    }
    if retriever.dense_error:
        payload["dense_warning"] = f"Dense embedding unavailable; sparse fallback was used. {retriever.dense_error}"
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print("\nANSWER\n")
    if retriever.dense_error:
        print(f"[warning] Dense embedding unavailable; sparse fallback was used. {retriever.dense_error}\n")
    print(answer["answer"])
    print("\nSOURCES\n")
    for rank, result in enumerate(results, start=1):
        doc = result.document
        print(f"{rank}. page={doc.page_number} chunk={doc.chunk_id} score={result.score:.4f}")
        print(f"   {compact_snippet(doc.text, 240)}")
        for image in doc.images[:3]:
            if image.get("path"):
                print(f"   image: {image['path']}")


if __name__ == "__main__":
    main()
