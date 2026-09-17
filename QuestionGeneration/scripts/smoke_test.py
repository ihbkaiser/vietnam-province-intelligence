from __future__ import annotations

import json
import sys
from pathlib import Path

QG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(QG_ROOT / "src"))

from qg_system.pipeline import canonical_candidate, structural_validation


def main() -> None:
    chunk = {
        "chunk_id": "page_008_01",
        "page_number": 8,
        "text": "Học lịch sử giúp chúng ta biết được cội nguồn của tổ tiên, quê hương, đất nước và hiểu những gì nhân loại tạo ra trong quá khứ.",
        "images": [],
    }
    raw = {
        "question": "Học lịch sử giúp chúng ta biết được điều gì?",
        "options": {
            "A": "Cội nguồn của tổ tiên, quê hương, đất nước",
            "B": "Cách tính khoảng cách trên bản đồ",
            "C": "Cấu tạo của núi lửa",
            "D": "Cách dự báo thời tiết",
        },
        "answer": "A",
        "explanation": "Evidence nêu rõ học lịch sử giúp biết cội nguồn.",
        "evidence": "biết được cội nguồn của tổ tiên, quê hương, đất nước",
        "difficulty": "easy",
        "bloom_level": "remember",
    }
    config = {
        "validation": {
            "min_question_chars": 18,
            "max_question_chars": 260,
            "min_option_chars": 3,
            "max_option_chars": 180,
            "min_evidence_chars": 18,
            "min_evidence_overlap": 0.72,
            "reject_duplicate_options": True,
            "reject_if_answer_in_question": True,
        }
    }
    candidate = canonical_candidate(raw, chunk)
    ok, reasons, metrics = structural_validation(candidate, chunk["text"], config)
    print(json.dumps({"ok": ok, "reasons": reasons, "metrics": metrics}, ensure_ascii=False, indent=2))
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
