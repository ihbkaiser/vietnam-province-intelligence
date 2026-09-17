from __future__ import annotations

import argparse
import hashlib
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .ollama_client import OllamaClient
from .utils import append_jsonl, compact_context, evidence_overlap_score, normalize_text, read_jsonl, repair_mojibake, write_json


ANSWER_KEYS = ("A", "B", "C", "D")


def load_config(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def resolve_path(base: Path, value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (base / path).resolve()


def load_chunks(chunks_path: Path, config: dict[str, Any]) -> list[dict[str, Any]]:
    generation_cfg = config.get("generation", {})
    min_page = generation_cfg.get("min_page")
    max_page = generation_cfg.get("max_page")
    min_chars = int(generation_cfg.get("min_chunk_chars", 300))
    chunks: list[dict[str, Any]] = []
    for row in read_jsonl(chunks_path):
        page_number = int(row.get("page_number") or row.get("metadata", {}).get("page_number") or 0)
        text = repair_mojibake(str(row.get("text") or ""))
        if min_page is not None and page_number < int(min_page):
            continue
        if max_page is not None and page_number > int(max_page):
            continue
        if len(normalize_text(text)) < min_chars:
            continue
        chunks.append(
            {
                "chunk_id": str(row.get("chunk_id") or row.get("doc_id") or f"page_{page_number:03d}"),
                "page_number": page_number,
                "text": text,
                "images": row.get("images") or [],
                "metadata": row.get("metadata") or {},
            }
        )
    return chunks


def teacher_prompt(chunk: dict[str, Any], questions_per_chunk: int, max_context_chars: int) -> str:
    context = compact_context(chunk["text"], max_context_chars)
    return f"""
Bạn là giáo viên Lịch sử và Địa lí THCS kiêm hệ thống tạo đề kiểm tra.

Nhiệm vụ: chỉ dựa trên CONTEXT bên dưới để tạo {questions_per_chunk} câu hỏi trắc nghiệm 4 lựa chọn.

Yêu cầu bắt buộc:
- Không dùng kiến thức ngoài CONTEXT.
- Mỗi câu chỉ có đúng 1 đáp án đúng.
- 3 phương án nhiễu phải hợp lý, cùng loại kiến thức với đáp án đúng, không quá lộ.
- Không hỏi về thông tin không có trong CONTEXT.
- Evidence phải là một đoạn trích ngắn lấy trực tiếp từ CONTEXT.
- Câu hỏi phù hợp học sinh lớp 6.
- Trộn độ khó nếu context cho phép: easy, medium, hard.
- Không để đáp án đúng tập trung vào một chữ cái cố định.

Trả về JSON duy nhất theo schema:
{{
  "questions": [
    {{
      "question": "câu hỏi",
      "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
      "answer": "A",
      "explanation": "giải thích ngắn dựa trên evidence",
      "evidence": "trích dẫn nguyên văn hoặc gần nguyên văn từ CONTEXT",
      "difficulty": "easy|medium|hard",
      "bloom_level": "remember|understand|apply|analyze"
    }}
  ]
}}

SOURCE:
- chunk_id: {chunk["chunk_id"]}
- page_number: {chunk["page_number"]}

CONTEXT:
{context}
""".strip()


def student_prompt(chunk: dict[str, Any], candidate: dict[str, Any], max_context_chars: int) -> str:
    context = compact_context(chunk["text"], max_context_chars)
    options = candidate.get("options") or {}
    return f"""
Bạn là bộ kiểm định câu hỏi độc lập. Chỉ dựa vào CONTEXT, hãy tự chọn đáp án đúng.
Không được nhìn theo đáp án gốc của người tạo câu hỏi.

Trả về JSON duy nhất:
{{
  "answer": "A|B|C|D",
  "supported": true,
  "confidence": 0.0,
  "reason": "giải thích ngắn",
  "evidence_used": "đoạn trong CONTEXT hỗ trợ đáp án"
}}

CONTEXT:
{context}

QUESTION:
{candidate.get("question", "")}

OPTIONS:
A. {options.get("A", "")}
B. {options.get("B", "")}
C. {options.get("C", "")}
D. {options.get("D", "")}
""".strip()


def stable_id(*parts: str) -> str:
    digest = hashlib.sha1("||".join(parts).encode("utf-8")).hexdigest()[:12]
    return digest


def canonical_candidate(raw: dict[str, Any], chunk: dict[str, Any]) -> dict[str, Any]:
    options = raw.get("options") or {}
    normalized_options = {key: repair_mojibake(str(options.get(key) or "")).strip() for key in ANSWER_KEYS}
    question = repair_mojibake(str(raw.get("question") or "")).strip()
    evidence = repair_mojibake(str(raw.get("evidence") or "")).strip()
    answer = str(raw.get("answer") or "").strip().upper()[:1]
    return {
        "id": stable_id(chunk["chunk_id"], question, evidence),
        "source_chunk_id": chunk["chunk_id"],
        "page_number": chunk["page_number"],
        "question": question,
        "options": normalized_options,
        "answer": answer,
        "explanation": repair_mojibake(str(raw.get("explanation") or "")).strip(),
        "evidence": evidence,
        "difficulty": str(raw.get("difficulty") or "medium").strip().lower(),
        "bloom_level": str(raw.get("bloom_level") or "understand").strip().lower(),
        "images": chunk.get("images") or [],
        "source_text": chunk["text"],
    }


def generate_candidates(
    teacher: OllamaClient,
    chunk: dict[str, Any],
    config: dict[str, Any],
    questions_per_chunk: int,
) -> list[dict[str, Any]]:
    generation_cfg = config.get("generation", {})
    prompt = teacher_prompt(chunk, questions_per_chunk, int(generation_cfg.get("max_context_chars", 2600)))
    payload = teacher.generate_json(prompt, options=generation_cfg.get("teacher_options") or {})
    raw_questions = payload.get("questions") if isinstance(payload, dict) else payload
    if not isinstance(raw_questions, list):
        raise ValueError("Teacher output JSON must contain a questions list.")
    return [canonical_candidate(item, chunk) for item in raw_questions if isinstance(item, dict)]


def structural_validation(candidate: dict[str, Any], context: str, config: dict[str, Any]) -> tuple[bool, list[str], dict[str, Any]]:
    validation_cfg = config.get("validation", {})
    reasons: list[str] = []
    question = candidate["question"]
    options = candidate["options"]
    answer = candidate["answer"]
    evidence = candidate["evidence"]

    if not (int(validation_cfg.get("min_question_chars", 18)) <= len(question) <= int(validation_cfg.get("max_question_chars", 260))):
        reasons.append("question_length_out_of_range")
    if answer not in ANSWER_KEYS:
        reasons.append("invalid_answer_key")
    for key in ANSWER_KEYS:
        option_text = options.get(key, "")
        if not (int(validation_cfg.get("min_option_chars", 3)) <= len(option_text) <= int(validation_cfg.get("max_option_chars", 180))):
            reasons.append(f"option_{key}_length_out_of_range")
    option_norms = [normalize_text(options.get(key, "")) for key in ANSWER_KEYS]
    if validation_cfg.get("reject_duplicate_options", True) and len(set(option_norms)) != len(option_norms):
        reasons.append("duplicate_options")
    if validation_cfg.get("reject_if_answer_in_question", True) and answer in ANSWER_KEYS:
        answer_text = normalize_text(options.get(answer, ""))
        question_norm = normalize_text(question)
        if len(answer_text) >= 12 and answer_text in question_norm:
            reasons.append("answer_text_leaked_in_question")
    min_evidence_chars = int(validation_cfg.get("min_evidence_chars", 18))
    evidence_score = evidence_overlap_score(evidence, context)
    if len(normalize_text(evidence)) < min_evidence_chars:
        reasons.append("evidence_too_short")
    if evidence_score < float(validation_cfg.get("min_evidence_overlap", 0.72)):
        reasons.append("evidence_not_grounded")

    metrics = {"evidence_overlap": evidence_score}
    return not reasons, reasons, metrics


def student_validation(
    student: OllamaClient,
    chunk: dict[str, Any],
    candidate: dict[str, Any],
    config: dict[str, Any],
) -> tuple[bool, list[str], dict[str, Any]]:
    generation_cfg = config.get("generation", {})
    validation_cfg = config.get("validation", {})
    prompt = student_prompt(chunk, candidate, int(generation_cfg.get("max_context_chars", 2600)))
    payload = student.generate_json(prompt, options=generation_cfg.get("student_options") or {})
    if not isinstance(payload, dict):
        return False, ["student_output_not_object"], {"student_raw": payload}

    student_answer = str(payload.get("answer") or "").strip().upper()[:1]
    confidence_raw = payload.get("confidence", 0.0)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.0
    supported = bool(payload.get("supported", False))
    reasons: list[str] = []
    if student_answer != candidate["answer"]:
        reasons.append("student_answer_mismatch")
    if not supported:
        reasons.append("student_marked_unsupported")
    if confidence < float(validation_cfg.get("min_student_confidence", 0.65)):
        reasons.append("student_confidence_too_low")
    return not reasons, reasons, {
        "student_answer": student_answer,
        "student_confidence": confidence,
        "student_supported": supported,
        "student_reason": repair_mojibake(str(payload.get("reason") or "")),
        "student_evidence_used": repair_mojibake(str(payload.get("evidence_used") or "")),
    }


def shuffle_options(candidate: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    items = [(key, candidate["options"][key]) for key in ANSWER_KEYS]
    old_to_new: dict[str, str] = {}
    correct_text = candidate["options"][candidate["answer"]]
    rng.shuffle(items)
    shuffled = {}
    for new_key, (old_key, value) in zip(ANSWER_KEYS, items):
        shuffled[new_key] = value
        old_to_new[old_key] = new_key
    new_answer = next(key for key, value in shuffled.items() if value == correct_text)
    updated = dict(candidate)
    updated["options"] = shuffled
    updated["answer_before_shuffle"] = candidate["answer"]
    updated["answer"] = new_answer
    validation = dict(updated.get("validation") or {})
    if validation.get("student_answer") in old_to_new:
        validation["student_answer_before_shuffle"] = validation["student_answer"]
        validation["student_answer"] = old_to_new[str(validation["student_answer"])]
    validation["option_key_map_after_shuffle"] = old_to_new
    updated["validation"] = validation
    return updated


def process_candidate(
    candidate: dict[str, Any],
    chunk: dict[str, Any],
    student: OllamaClient | None,
    config: dict[str, Any],
    rng: random.Random,
) -> tuple[bool, dict[str, Any]]:
    ok, reasons, metrics = structural_validation(candidate, chunk["text"], config)
    validation = {"structural_reasons": reasons, **metrics}

    if ok and config.get("validation", {}).get("require_student_consensus", True):
        if student is None:
            ok = False
            validation["student_reasons"] = ["student_required_but_missing"]
        else:
            student_ok, student_reasons, student_metrics = student_validation(student, chunk, candidate, config)
            ok = ok and student_ok
            validation["student_reasons"] = student_reasons
            validation.update(student_metrics)

    result = dict(candidate)
    result["validation"] = validation
    result["accepted"] = ok
    if ok and config.get("validation", {}).get("shuffle_options_after_validation", True):
        result = shuffle_options(result, rng)
        result["validation"]["options_shuffled"] = True
    return ok, result


def run_generation(args: argparse.Namespace) -> dict[str, Any]:
    config_path = Path(args.config).resolve()
    config = load_config(config_path)
    base_dir = config_path.parent
    chunks_path = resolve_path(base_dir, config["data"]["chunks_path"])
    output_dir = resolve_path(base_dir, args.output_dir or config["data"]["output_dir"])
    candidates_path = output_dir / "generated_candidates.jsonl"
    accepted_path = output_dir / "validated_questions.jsonl"
    rejected_path = output_dir / "rejected_questions.jsonl"
    if args.reset_output:
        for path in [candidates_path, accepted_path, rejected_path, output_dir / "run_summary.json"]:
            if path.exists():
                path.unlink()

    chunks = load_chunks(chunks_path, config)
    if args.start_index:
        chunks = chunks[int(args.start_index) :]
    if args.limit_chunks:
        chunks = chunks[: int(args.limit_chunks)]

    questions_per_chunk = int(args.questions_per_chunk or config.get("generation", {}).get("questions_per_chunk", 2))
    model_cfg = config.get("models", {})
    teacher_model = args.teacher_model or model_cfg.get("teacher_model")
    student_model = args.student_model or model_cfg.get("student_model")
    base_url = model_cfg.get("ollama_base_url", "http://localhost:11434")
    teacher = OllamaClient(base_url, teacher_model)
    student = None if args.skip_student else OllamaClient(base_url, student_model)
    rng = random.Random(int(config.get("validation", {}).get("random_seed", 42)))

    accepted = 0
    rejected = 0
    generated = 0
    errors: list[dict[str, Any]] = []

    for index, chunk in enumerate(chunks, start=1):
        try:
            candidates = generate_candidates(teacher, chunk, config, questions_per_chunk)
        except Exception as exc:
            errors.append({"chunk_id": chunk["chunk_id"], "page_number": chunk["page_number"], "error": f"{type(exc).__name__}: {exc}"})
            continue

        generated += len(candidates)
        append_jsonl(candidates_path, candidates)
        accepted_rows = []
        rejected_rows = []
        for candidate in candidates:
            try:
                ok, result = process_candidate(candidate, chunk, student, config, rng)
            except Exception as exc:
                ok = False
                result = dict(candidate)
                result["accepted"] = False
                result["validation"] = {"runtime_error": f"{type(exc).__name__}: {exc}"}
            if ok:
                accepted_rows.append(result)
            else:
                rejected_rows.append(result)
        accepted += append_jsonl(accepted_path, accepted_rows)
        rejected += append_jsonl(rejected_path, rejected_rows)
        print(f"[{index}/{len(chunks)}] {chunk['chunk_id']} generated={len(candidates)} accepted={len(accepted_rows)} rejected={len(rejected_rows)}")

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": str(config_path),
        "chunks_path": str(chunks_path),
        "output_dir": str(output_dir),
        "teacher_model": teacher_model,
        "student_model": None if args.skip_student else student_model,
        "chunks_seen": len(chunks),
        "candidates_generated": generated,
        "accepted": accepted,
        "rejected": rejected,
        "acceptance_rate": accepted / max(1, generated),
        "errors": errors,
        "outputs": {
            "generated_candidates": str(candidates_path),
            "validated_questions": str(accepted_path),
            "rejected_questions": str(rejected_path),
        },
    }
    write_json(output_dir / "run_summary.json", summary)
    return summary


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate and validate textbook MCQs with a teacher-student LLM pipeline.")
    parser.add_argument("--config", default="QuestionGeneration/config.yaml")
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--limit-chunks", type=int, default=None)
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--questions-per-chunk", type=int, default=None)
    parser.add_argument("--teacher-model", default=None)
    parser.add_argument("--student-model", default=None)
    parser.add_argument("--skip-student", action="store_true")
    parser.add_argument("--reset-output", action="store_true")
    return parser
