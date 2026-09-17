from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


MOJIBAKE_MARKERS = ("Ã", "Â", "Ä", "áº", "á»", "Ä‘", "Ä")


def repair_mojibake(text: str) -> str:
    current = text
    for _ in range(3):
        if not any(marker in current for marker in MOJIBAKE_MARKERS):
            break
        try:
            repaired = current.encode("latin1").decode("utf-8")
        except UnicodeError:
            break
        current_score = sum(current.count(marker) for marker in MOJIBAKE_MARKERS)
        repaired_score = sum(repaired.count(marker) for marker in MOJIBAKE_MARKERS)
        if repaired_score >= current_score:
            break
        current = repaired
    return current


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def compact_text(text: str, max_chars: int = 500) -> str:
    clean = re.sub(r"\s+", " ", clean_extracted_text(text)).strip()
    return clean if len(clean) <= max_chars else clean[: max_chars - 1].rstrip() + "..."


def sentence_split(text: str) -> list[str]:
    clean = re.sub(r"\s+", " ", clean_extracted_text(text)).strip()
    if not clean:
        return []
    parts = re.split(r"(?<=[.!?。])\s+|(?<=\.)\s+(?=[A-ZÀ-ỴĐ])", clean)
    return [part.strip() for part in parts if part.strip()]


def normalize_for_search(text: str) -> str:
    text = clean_extracted_text(text).lower()
    text = text.replace(",", ".").replace(":", ".")
    return re.sub(r"\s+", " ", text).strip()


def clean_extracted_text(text: str) -> str:
    current = repair_mojibake(text)
    current = re.sub(r"\b(Kinh tuyến và vĩ tuyến)\s+(Quả Địa Cầu\s+là\b)", r"\1. \2", current)
    current = re.sub(r"</center\s*>", ". ", current, flags=re.IGNORECASE)
    current = re.sub(r"</?(center|span|div|p|br|b|i|strong|em)[^>]*>", " ", current, flags=re.IGNORECASE)
    current = re.sub(r"<[^>]+>", " ", current)
    current = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", current)
    current = re.sub(r"\bPDF\s+Page\s+\d+\b", " ", current, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", current).strip()
