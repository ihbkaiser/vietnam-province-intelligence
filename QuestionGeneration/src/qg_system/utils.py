from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [json.dumps(record, ensure_ascii=False) for record in records]
    if not rows:
        return 0
    with path.open("a", encoding="utf-8") as file:
        file.write("\n".join(rows) + "\n")
    return len(rows)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def repair_mojibake(text: str) -> str:
    markers = ("\u00c3", "\u00c4", "\u00c2", "\u00c6", "\u00e1\u00ba", "\u00e1\u00bb")
    current = text
    for _ in range(3):
        if not any(marker in current for marker in markers):
            break
        try:
            repaired = current.encode("latin1").decode("utf-8")
        except UnicodeError:
            break
        current_marker_count = sum(current.count(marker) for marker in markers)
        repaired_marker_count = sum(repaired.count(marker) for marker in markers)
        if repaired_marker_count >= current_marker_count:
            break
        current = repaired
    return current


def normalize_text(text: str) -> str:
    text = repair_mojibake(text)
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[“”\"'`´]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def evidence_overlap_score(evidence: str, context: str) -> float:
    evidence_norm = normalize_text(evidence)
    context_norm = normalize_text(context)
    if not evidence_norm:
        return 0.0
    if evidence_norm in context_norm:
        return 1.0
    match = SequenceMatcher(None, evidence_norm, context_norm).find_longest_match(
        0, len(evidence_norm), 0, len(context_norm)
    )
    return match.size / max(1, len(evidence_norm))


def extract_json_object(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    candidates: list[str] = []
    first_obj = text.find("{")
    last_obj = text.rfind("}")
    if first_obj >= 0 and last_obj > first_obj:
        candidates.append(text[first_obj : last_obj + 1])
    first_arr = text.find("[")
    last_arr = text.rfind("]")
    if first_arr >= 0 and last_arr > first_arr:
        candidates.append(text[first_arr : last_arr + 1])
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise ValueError("LLM response did not contain valid JSON.")


def compact_context(text: str, max_chars: int) -> str:
    text = repair_mojibake(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"
