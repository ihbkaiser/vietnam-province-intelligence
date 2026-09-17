from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Export accepted MCQs to classroom-friendly CSV/JSON.")
    parser.add_argument("--input", type=Path, default=Path("QuestionGeneration/data/class_6/validated_questions.jsonl"))
    parser.add_argument("--csv", type=Path, default=Path("QuestionGeneration/data/class_6/quiz_export.csv"))
    parser.add_argument("--json", type=Path, default=Path("QuestionGeneration/data/class_6/quiz_export.json"))
    args = parser.parse_args()

    rows = read_jsonl(args.input)
    args.csv.parent.mkdir(parents=True, exist_ok=True)
    with args.csv.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "question",
                "option_a",
                "option_b",
                "option_c",
                "option_d",
                "correct_answer",
                "explanation",
                "evidence",
                "page_number",
                "chunk_id",
                "difficulty",
                "bloom_level",
            ],
        )
        writer.writeheader()
        for row in rows:
            options = row.get("options") or {}
            writer.writerow(
                {
                    "question": row.get("question", ""),
                    "option_a": options.get("A", ""),
                    "option_b": options.get("B", ""),
                    "option_c": options.get("C", ""),
                    "option_d": options.get("D", ""),
                    "correct_answer": row.get("answer", ""),
                    "explanation": row.get("explanation", ""),
                    "evidence": row.get("evidence", ""),
                    "page_number": row.get("page_number", ""),
                    "chunk_id": row.get("source_chunk_id", ""),
                    "difficulty": row.get("difficulty", ""),
                    "bloom_level": row.get("bloom_level", ""),
                }
            )

    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"exported {len(rows)} questions")
    print(f"csv: {args.csv}")
    print(f"json: {args.json}")


if __name__ == "__main__":
    main()
