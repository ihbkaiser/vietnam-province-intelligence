from __future__ import annotations

import json
import random
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from .config import AppConfig
from .llm import LLMProviderError, Provider, invoke_llm
from .prompting import render_prompt
from .rag import build_context, format_citations, retrieve
from .retriever import HybridRetriever
from .schemas import Flashcard, FlashcardSet, MetadataFilter, QuizItem, QuizSet, RetrievedChunk, Summary
from .text_utils import compact_text, sentence_split


T = TypeVar("T", bound=BaseModel)

VI_STOPWORDS = {
    "bằng", "biết", "các", "cách", "cần", "cho", "chúng", "còn", "của", "dân", "đang", "đây",
    "đến", "để", "đều", "được", "giúp", "gì", "hay", "hiểu", "hoặc", "học", "khi", "là", "làm",
    "lên", "một", "nào", "này", "như", "những", "quan", "sao", "sau", "sử", "theo", "thế",
    "trong", "trên", "từ", "và", "vào", "về", "với",
}

INSTRUCTION_PREFIXES = (
    "quan sát", "dựa vào", "em hãy", "hãy", "trình bày", "sưu tầm", "đọc thông tin",
    "thảo luận", "luyện tập", "vận dụng", "xác định",
)

KNOWN_CONCEPT_TERMS = (
    "Kinh độ", "Vĩ độ", "Kinh tuyến", "Vĩ tuyến", "Kinh tuyến gốc", "Xích đạo",
    "Tọa độ địa lí", "Quả Địa Cầu", "Bản đồ", "Lược đồ", "Kí hiệu bản đồ",
    "Tỉ lệ bản đồ", "Chú giải bản đồ", "Phương hướng trên bản đồ", "Giờ địa phương", "Giờ GMT",
    "Lịch sử", "Tư liệu gốc", "Tư liệu truyền miệng", "Tư liệu hiện vật", "Tư liệu chữ viết",
    "Niên đại", "Thập kỉ", "Thế kỉ", "Thiên niên kỉ",
)

ENGLISH_QUIZ_RE = re.compile(
    r"\b("
    r"what|which|following|purpose|map|projection|earth|legend|symbol|scale|distance|"
    r"directly|none|all of|true|false|represent|convert|curved|surface|flat|plane|"
    r"area|volume|shading|patterns|greenland|south america"
    r")\b",
    flags=re.IGNORECASE,
)

BAD_QUIZ_QUESTION_RE = re.compile(
    r"^\s*(?:"
    r"khái\s+niệm\s+nào\s+phù\s+hợp\s+với\s+mô\s+tả\s+sau|"
    r"cụm\s+từ\s+nào\s+hoàn\s+thành\s+đúng\s+nhận\s+định|"
    r"nhận\s+định\s+nào\s+đúng\s+về|"
    r"mô\s+tả\s+nào\s+đúng\s+về|"
    r"cặp\s+ghép\s+khái\s+niệm\s*[-–]\s*mô\s+tả\s+nào\s+đúng"
    r")",
    flags=re.IGNORECASE,
)

BAD_QUIZ_OPTION_RE = re.compile(
    r"^\s*(?:dưới\s+đây|cùng\s+phát|thành\s+hiệu|hiện\s+thành|cảng\s+biển\s+thành|"
    r"sân\s+bay\s+cảng|luyện\s+trạm|hoang\s+hiệu|đường\s+đường)\s*$",
    flags=re.IGNORECASE,
)

FLASHCARD_VISUAL_CUE_RE = re.compile(
    r"hình\s+\d|quan sát|bản đồ|lược đồ|sơ đồ|biểu đồ|chú giải|kí hiệu|tỉ lệ|tỷ lệ|"
    r"khoảng cách|phương hướng|địa hình|đường đồng mức|thang màu",
    flags=re.IGNORECASE,
)
BAD_FLASHCARD_FRONT_RE = re.compile(
    r"^\s*(?:bài\s+\d+|ý\s+chính|nêu\b|trình\s+bày\b|hãy\b|cho\s+biết\b|"
    r"khái\s+niệm\s+nào|nhận\s+định\s+nào|theo\s+(?:sgk|sách|đoạn))",
    flags=re.IGNORECASE,
)

BAD_TERM_STARTS = (
    "độ ", "đạo ", "địa ", "tuyến ", "khoảng ", "chuyển ", "ngược ", "trung bình ",
    "điểm ", "bên ", "trái ", "phải ", "những ", "các ", "của ",
)

BAD_DEFINITION_SUBJECT_PREFIXES = (
    "nửa ",
    "một ",
    "các ",
    "những ",
    "phần ",
    "mặt ",
    "bên ",
    "phía ",
)

BAD_TERM_PREFIXES = (
    "học xong",
    "toạ độ",
    "toa độ",
    "xác định được",
    "nhận biết được",
    "biết đọc",
)

ACTION_SUBJECT_PREFIXES = (
    "sử dụng ",
    "dùng ",
    "căn cứ ",
    "đặt ",
    "giữ ",
    "xác định ",
    "đo ",
    "tính ",
    "tìm ",
    "đọc ",
    "phóng ",
    "di chuyển ",
    "chia sẻ ",
    "quan sát ",
)

METHOD_DEFINITION_PREFIXES = (
    "cách ",
    "phương pháp ",
    "biện pháp ",
    "thao tác ",
    "việc ",
)

BAD_TERM_CONTAINS = (
    "thành hiệu",
    "hiện thành",
    "cảng biển thành",
    "sân bay cảng",
    "đường biên giới",
)


def _plain_learning_text(text: str) -> str:
    return re.sub(r"[*_`]+", "", compact_text(text, 320)).strip()


def _format_measurements(text: str) -> str:
    clean = re.sub(r"\b([0-9]+(?:[,.][0-9]+)?)\s*(km|cm|m)\b", r"\1 \2", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", clean).strip()


def _clean_quiz_question(text: str) -> str:
    clean = _format_measurements(_plain_learning_text(text))
    clean = re.sub(
        r"^\s*theo\s+(?:sgk|sách\s+giáo\s+khoa|ngữ\s+cảnh|đoạn\s+trích|văn\s+bản|tài\s+liệu|ví\s+dụ(?:\s+trong\s+sgk)?),?\s*",
        "",
        clean,
        flags=re.IGNORECASE,
    ).strip()
    if clean:
        clean = clean[0].upper() + clean[1:]
    return clean


def _clean_quiz_option(text: str) -> str:
    return _format_measurements(_plain_learning_text(text))


def _clean_quiz_explanation(text: str) -> str:
    clean = _format_measurements(_plain_learning_text(text))
    clean = re.sub(r"^\s*Dẫn chứng(?:\s+từ\s+SGK)?\s*:\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"^\s*Theo\s+(S\d+)\s*,\s*", "", clean, flags=re.IGNORECASE)
    return clean


def _clean_quiz_evidence_text(text: str) -> str:
    clean = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    clean = re.sub(r"```(?:markdown|md)?\s*|\s*```", "", clean, flags=re.IGNORECASE)
    lines = []
    for raw_line in clean.split("\n"):
        line = _format_measurements(re.sub(r"[`]+", "", raw_line).strip())
        if line:
            lines.append(line)
    return "\n".join(lines[:10]).strip()


def _clean_learning_markdown(text: str, *, max_chars: int = 900, max_lines: int = 12) -> str:
    clean = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    clean = re.sub(r"```(?:markdown|md|json)?\s*|\s*```", "", clean, flags=re.IGNORECASE)
    lines: list[str] = []
    for raw_line in clean.split("\n"):
        line = _format_measurements(raw_line.strip())
        if line:
            lines.append(line)
    cleaned = "\n".join(lines[:max_lines]).strip()
    return compact_text(cleaned, max_chars) if len(cleaned) > max_chars else cleaned


def _clean_flashcard_front(text: str) -> str:
    clean = _clean_learning_markdown(text, max_chars=180, max_lines=2).replace("\n", " ")
    clean = re.sub(r"^\s*thẻ\s+\d+\s*[.:-]\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"^\s*bài\s+\d+\.?\s*[^:–-]{0,120}\s*[:–-]\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"^\s*(?:nêu|trình\s+bày|hãy\s+nêu|cho\s+biết)\s+(?:các\s+)?", "", clean, flags=re.IGNORECASE)
    match = re.match(r"^\s*làm\s+thế\s+nào\s+để\s+(.+?)\??$", clean, flags=re.IGNORECASE)
    if match:
        clean = f"Cách {match.group(1).strip()}"
    clean = re.sub(r"\s+là\s+gì\s*\??$", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\?\s*$", "", clean).strip(" .:-–")
    return clean[:1].upper() + clean[1:] if clean else ""


def _clean_flashcard_back(text: str) -> str:
    return _clean_learning_markdown(text, max_chars=1100, max_lines=16)


def _is_procedure_front(front: str) -> bool:
    return bool(re.match(r"^\s*Cách\s+", front, flags=re.IGNORECASE))


def _is_good_flashcard(card: Flashcard) -> bool:
    front = card.front.strip()
    back = card.back.strip()
    if not front or not back or not card.source_markers:
        return False
    front_norm = front.lower()
    if BAD_FLASHCARD_FRONT_RE.search(front):
        return False
    if "bài " in front_norm and re.search(r"\bbài\s+\d+", front_norm):
        return False
    if len(front) > 120 or len(back) < 24:
        return False
    if _is_procedure_front(front):
        return len(re.findall(r"\bBước\s+\d+\b", back, flags=re.IGNORECASE)) >= 2
    if "?" in front:
        return False
    if re.search(r"\b(?:là gì|như thế nào|vì sao|tại sao)\b", front_norm):
        return False
    return True


def _quality_filter_flashcards(cards: list[Flashcard]) -> list[Flashcard]:
    filtered: list[Flashcard] = []
    seen: set[str] = set()
    for card in cards:
        updated = card.model_copy(
            update={
                "front": _clean_flashcard_front(card.front),
                "back": _clean_flashcard_back(card.back),
                "hint": _plain_learning_text(card.hint or "") or None,
                "topic": _plain_learning_text(card.topic or "") or None,
                "evidence_text": _clean_learning_markdown(card.evidence_text or "", max_chars=420, max_lines=6) or None,
                "image_hint": _plain_learning_text(card.image_hint or "") or None,
            }
        )
        norm = updated.front.lower()
        if norm in seen or not _is_good_flashcard(updated):
            continue
        seen.add(norm)
        filtered.append(updated)
    return filtered


def _resolve_target(
    retriever: HybridRetriever,
    config: AppConfig,
    *,
    query: str | None = None,
    filters: MetadataFilter | dict | None = None,
    k: int | None = None,
    retrieval_k: int | None = None,
) -> tuple[list[RetrievedChunk], str, str | None]:
    if query:
        chunks = retrieve(retriever, config, query, k=k or retrieval_k, filters=filters)
        return chunks, "query", query
    if filters:
        chunks = retriever.all_documents(filters)
        return chunks, "filter", json.dumps(filters.model_dump(exclude_none=True) if isinstance(filters, MetadataFilter) else filters, ensure_ascii=False)
    return retriever.all_documents(), "corpus", None


def _json_from_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1).strip()
    if not cleaned.startswith("{"):
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    payload = json.loads(cleaned)
    if not isinstance(payload, dict):
        raise RuntimeError("Expected JSON object.")
    return payload


def _llm_learning_failed(exc: Exception) -> bool:
    if isinstance(exc, LLMProviderError):
        return False
    return isinstance(exc, (json.JSONDecodeError, RuntimeError, ValidationError, ValueError, TypeError, KeyError, IndexError))


def _validate_items(payload: dict[str, Any], key: str, model_class: type[T], dedup_field: str, valid_markers: set[str]) -> list[T]:
    raw_items = payload.get(key)
    if not isinstance(raw_items, list):
        raise RuntimeError(f"Missing list field: {key}")
    items: list[T] = []
    seen: set[str] = set()
    for raw in raw_items:
        try:
            item = model_class.model_validate(raw)
        except ValidationError:
            continue
        if isinstance(item, QuizItem):
            item = item.model_copy(
                update={
                    "question": _clean_quiz_question(item.question),
                    "options": [_clean_quiz_option(option) for option in item.options],
                    "explanation": _clean_quiz_explanation(item.explanation),
                    "evidence_text": _clean_quiz_evidence_text(item.evidence_text or "") or None,
                    "image_hint": _plain_learning_text(item.image_hint or "") or None,
                }
            )
        elif isinstance(item, Flashcard):
            item = item.model_copy(
                update={
                    "front": _clean_flashcard_front(item.front),
                    "back": _clean_flashcard_back(item.back),
                    "hint": _plain_learning_text(item.hint or "") or None,
                    "topic": _plain_learning_text(item.topic or "") or None,
                    "evidence_text": _clean_learning_markdown(item.evidence_text or "", max_chars=420, max_lines=6) or None,
                    "image_hint": _plain_learning_text(item.image_hint or "") or None,
                }
            )
        norm = str(getattr(item, dedup_field, "")).strip().lower()
        if not norm or norm in seen:
            continue
        seen.add(norm)
        if hasattr(item, "source_markers"):
            markers = [marker for marker in getattr(item, "source_markers") if marker in valid_markers]
            if not markers:
                marker_text = " ".join(
                    str(getattr(item, field, "") or "")
                    for field in ("question", "explanation", "evidence_text", "front", "back", "hint")
                )
                markers = [
                    marker
                    for marker in sorted(valid_markers, key=lambda value: int(value[1:]))
                    if re.search(rf"\b{re.escape(marker)}\b", marker_text)
                ]
            item = item.model_copy(update={"source_markers": markers})
        items.append(item)
    if not items:
        raise RuntimeError(f"No valid items produced for {key}.")
    return items


def _quality_filter_quiz_items(items: list[QuizItem]) -> list[QuizItem]:
    filtered: list[QuizItem] = []
    for item in items:
        item = item.model_copy(
            update={
                "question": _clean_quiz_question(item.question),
                "options": [_clean_quiz_option(option) for option in item.options],
                "explanation": _clean_quiz_explanation(item.explanation),
                "evidence_text": _clean_quiz_evidence_text(item.evidence_text or "") or None,
                "image_hint": _plain_learning_text(item.image_hint or "") or None,
            }
        )
        question_norm = item.question.strip().lower()
        options_norm = [option.strip().lower().strip(".: ") for option in item.options]
        explanation_norm = item.explanation.strip().lower()
        if not item.source_markers:
            continue
        if BAD_QUIZ_QUESTION_RE.search(question_norm) or "[...]" in question_norm:
            continue
        if any(marker in question_norm for marker in ("page_", "chunk", "không rõ bài")):
            continue
        if options_norm == ["a", "b", "c", "d"]:
            continue
        if any(BAD_QUIZ_OPTION_RE.match(option) for option in item.options):
            continue
        if any(re.match(r"^[A-D][\).:]\s+", option.strip(), flags=re.IGNORECASE) for option in item.options):
            continue
        if len(set(options_norm)) < 4:
            continue
        if any(
            option in {"không có", "không xác định", "tất cả", "tất cả các đáp án trên", "none", "all of the above"}
            or option.startswith("cả ")
            for option in options_norm
        ):
            continue
        if ENGLISH_QUIZ_RE.search(" ".join([question_norm, explanation_norm, *options_norm])):
            continue
        if "không liên quan" in explanation_norm:
            continue
        filtered.append(item)
    return filtered


def _extractive_summary(chunks: list[RetrievedChunk]) -> tuple[str, list[str]]:
    sentences: list[str] = []
    for chunk in chunks:
        sentences.extend(sentence_split(chunk.text))
    selected = sentences[:8]
    summary = " ".join(selected[:4]) if selected else "Không có đủ nội dung để tóm tắt."
    key_points = [compact_text(sentence, 180) for sentence in selected[:6]]
    return summary, key_points


def _summary_image_hints(summary_text: str, key_points: list[str]) -> list[str]:
    text = " ".join([summary_text, *key_points])
    hints: list[str] = []
    for match in re.finditer(r"Hình\s+\d+(?:[.,]\d+)?[^.!?\n]{0,90}", text, flags=re.IGNORECASE):
        value = compact_text(match.group(0), 120)
        if value and value not in hints:
            hints.append(value)
    for cue in ("bản đồ", "lược đồ", "sơ đồ", "biểu đồ", "địa hình", "đường đồng mức", "thang màu", "tỉ lệ bản đồ"):
        if cue in text.lower() and cue not in hints:
            hints.append(cue)
    return hints[:4]


def summarize(
    retriever: HybridRetriever,
    config: AppConfig,
    *,
    query: str | None = None,
    filters: MetadataFilter | dict | None = None,
    k: int | None = None,
    provider: Provider | None = None,
) -> Summary:
    chunks, scope, target = _resolve_target(
        retriever,
        config,
        query=query,
        filters=filters,
        k=k,
        retrieval_k=config.learning.summarize_retrieval_k,
    )
    selected_provider = provider or config.generation.default_provider
    model_name: str | None = None
    if selected_provider == "extractive":
        summary_text, key_points = _extractive_summary(chunks)
    else:
        try:
            if len(chunks) <= config.learning.summarize_batch_size:
                prompt = render_prompt("summary_single.jinja2", context=build_context(chunks, config.generation.max_context_chars))
                llm_text, model_name = invoke_llm(prompt, config.generation, provider=selected_provider)
                payload = _json_from_text(llm_text)
            else:
                partials = []
                for start in range(0, len(chunks), config.learning.summarize_batch_size):
                    batch = chunks[start : start + config.learning.summarize_batch_size]
                    prompt = render_prompt("summary_map.jinja2", context=build_context(batch, config.generation.max_context_chars))
                    llm_text, model_name = invoke_llm(prompt, config.generation, provider=selected_provider)
                    partials.append(_json_from_text(llm_text))
                prompt = render_prompt("summary_reduce.jinja2", partials=partials)
                llm_text, model_name = invoke_llm(prompt, config.generation, provider=selected_provider)
                payload = _json_from_text(llm_text)
            summary_text = str(payload.get("summary") or "").strip()
            key_points = [str(item).strip() for item in payload.get("key_points") or [] if str(item).strip()]
            image_hints = [str(item).strip() for item in payload.get("image_hints") or [] if str(item).strip()][:4]
            if not summary_text and not key_points:
                raise RuntimeError("Empty summary payload.")
        except Exception as exc:
            if not _llm_learning_failed(exc):
                raise
            summary_text, key_points = _extractive_summary(chunks)
            image_hints = _summary_image_hints(summary_text, key_points)
            selected_provider = f"{selected_provider}+extractive_fallback"
    if selected_provider == "extractive":
        image_hints = _summary_image_hints(summary_text, key_points)
    else:
        image_hints = image_hints or _summary_image_hints(summary_text, key_points)

    return Summary(
        scope=scope,
        target=target,
        summary=summary_text,
        key_points=key_points,
        image_hints=image_hints,
        citations=format_citations(chunks),
        chunks=chunks,
        provider=selected_provider,
        model=model_name,
    )


def _is_good_fact_sentence(sentence: str) -> bool:
    normalized = sentence.strip().lower()
    if not sentence or "?" in sentence or len(sentence) > 320:
        return False
    if "học xong bài này" in normalized or "em sẽ" in normalized:
        return False
    if len(sentence) < 60 and not (len(sentence) >= 28 and re.search(r"\blà\b", normalized)):
        return False
    if any(normalized.startswith(prefix) for prefix in INSTRUCTION_PREFIXES):
        return False
    if normalized.startswith(("–", "-", "1.", "2.", "3.", "4.", "5.")):
        return False
    return True


def _definition_candidate(sentence: str) -> tuple[str, str] | None:
    clean_sentence = _plain_learning_text(sentence)
    subject = ""
    definition = ""
    match = re.match(r"^(.{4,80}?)\s+là\s+(.{20,220})$", clean_sentence.strip(), flags=re.IGNORECASE)
    original_subject_norm = ""
    if match:
        subject = _plain_learning_text(match.group(1).strip(" :-–"))
        definition = _plain_learning_text(match.group(2).strip(" ."))
        original_subject_norm = subject.lower()
        subject_norm_raw = subject.lower()
        exact_known = [term for term in KNOWN_CONCEPT_TERMS if subject_norm_raw == term.lower()]
        known_hits = [
            (len(term), subject_norm_raw.rfind(term.lower()), term)
            for term in KNOWN_CONCEPT_TERMS
            if subject_norm_raw.rfind(term.lower()) >= 0
        ]
        if exact_known:
            subject = max(exact_known, key=len)
        elif known_hits:
            subject = max(known_hits, key=lambda item: (item[0], item[1]))[2]
    else:
        for term in sorted(KNOWN_CONCEPT_TERMS, key=len, reverse=True):
            term_match = re.search(
                rf"\b{re.escape(term)}\s+(?:là|gồm)\s+([^.!?;]{{20,220}})",
                clean_sentence,
                flags=re.IGNORECASE,
            )
            if term_match:
                subject = term
                definition = _plain_learning_text(term_match.group(1).strip(" .:-–"))
                break
    if not subject or not definition:
        return None
    subject_norm = subject.lower()
    if "được coi" in original_subject_norm:
        return None
    if original_subject_norm.startswith(("có ", "cần ", "để ")) and original_subject_norm != subject_norm:
        return None
    if "cách xác định" in original_subject_norm and original_subject_norm != subject_norm:
        return None
    if len(subject) > 80 or len(definition) < 20:
        return None
    if len(subject.split()) > 8:
        return None
    if any(char.isdigit() for char in subject):
        return None
    if subject_norm.startswith(BAD_DEFINITION_SUBJECT_PREFIXES):
        return None
    if subject_norm.startswith(("ví dụ", "nếu ", "giờ quốc tế", "các địa điểm", "những địa điểm")):
        return None
    return subject, definition


def _content_terms(sentence: str) -> list[str]:
    terms: list[str] = []
    for match in re.finditer(r"\b[A-ZÀ-ỴĐ][\wÀ-ỹđĐ-]+(?:\s+[A-ZÀ-ỴĐ][\wÀ-ỹđĐ-]+){1,5}", sentence):
        term = match.group(0).strip()
        if 5 <= len(term) <= 70:
            terms.append(term)

    words = [word for word in re.findall(r"[\wÀ-ỹđĐ-]+", sentence, flags=re.UNICODE)]
    content_words = [word for word in words if len(word) >= 4 and word.lower() not in VI_STOPWORDS and not word.isdigit()]
    for size in (3, 2):
        for index in range(0, max(0, len(content_words) - size + 1)):
            term = " ".join(content_words[index : index + size])
            if 7 <= len(term) <= 60:
                terms.append(term)
    for word in content_words:
        if len(word) >= 6:
            terms.append(word)

    unique: list[str] = []
    seen: set[str] = set()
    for term in terms:
        norm = term.lower()
        if norm in seen:
            continue
        seen.add(norm)
        unique.append(term)
    return unique


def _collect_fact_sentences(chunks: list[RetrievedChunk]) -> list[tuple[str, str, str]]:
    facts: list[tuple[str, str, str]] = []
    for chunk_index, chunk in enumerate(chunks, start=1):
        topic = chunk.metadata.lesson_title or chunk.metadata.subject_label or "SGK"
        marker = f"S{chunk_index}"
        for sentence in sentence_split(chunk.text):
            if _is_good_fact_sentence(sentence):
                facts.append((marker, topic, sentence))
    return facts


def _add_unique_flashcard(cards: list[Flashcard], card: Flashcard | None) -> None:
    if card is None:
        return
    cleaned = _quality_filter_flashcards([card])
    if not cleaned:
        return
    candidate = cleaned[0]
    seen = {item.front.lower() for item in cards}
    if candidate.front.lower() not in seen:
        cards.append(candidate)


def _merge_flashcards(primary: list[Flashcard], secondary: list[Flashcard], limit: int) -> list[Flashcard]:
    merged: list[Flashcard] = []
    seen: set[str] = set()
    for card in [*primary, *secondary]:
        cleaned = _quality_filter_flashcards([card])
        if not cleaned:
            continue
        candidate = cleaned[0]
        key = re.sub(r"\s+", " ", candidate.front.lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(candidate)
        if len(merged) >= limit:
            break
    return merged


def _numbered_steps(segment: str, max_steps: int = 8) -> list[str]:
    clean = re.sub(r"\s+", " ", segment).strip()
    steps: list[str] = []
    for match in re.finditer(r"(?:^|\s)(\d+)\.\s*(.*?)(?=\s+\d+\.|$)", clean, flags=re.DOTALL):
        body = compact_text(match.group(2).strip(" .:-–"), 180)
        if len(body) >= 8:
            steps.append(body)
        if len(steps) >= max_steps:
            break
    return steps


def _procedure_flashcards(chunks: list[RetrievedChunk]) -> list[Flashcard]:
    cards: list[Flashcard] = []
    for chunk_index, chunk in enumerate(chunks, start=1):
        marker = f"S{chunk_index}"
        topic = chunk.metadata.lesson_title or chunk.metadata.subject_label or "SGK"
        text = re.sub(r"\s+", " ", chunk.text)
        folded_match = re.search(
            r"(Để\s+tính\s+khoảng\s+cách\s+theo\s+đường\s+gấp\s+khúc.+?)(?=Hình\s+\d+(?:[.,]\d+)?|Phương\s+hướng|$)",
            text,
            flags=re.IGNORECASE,
        )
        if folded_match:
            steps = _numbered_steps(folded_match.group(1))
            if len(steps) >= 3:
                back = "\n\n".join(f"**Bước {index}:** {step}." for index, step in enumerate(steps, start=1))
                _add_unique_flashcard(
                    cards,
                    Flashcard(
                        front="Cách đo khoảng cách theo đường gấp khúc trên bản đồ",
                        back=back,
                        hint="Dùng một cạnh giấy thẳng để cộng dồn các đoạn gấp khúc.",
                        topic=topic,
                        source_markers=[marker],
                        evidence_text=f"**Dẫn chứng:** {compact_text(folded_match.group(1), 260)}",
                        image_hint="Hình đo khoảng cách giữa hai điểm theo đường gấp khúc",
                    ),
                )

        if re.search(r"1\s*cm\s+trên\s+bản\s+đồ\s+tương\s+ứng\s+với\s+[0-9,.]+\s*km", text, flags=re.IGNORECASE):
            example_match = re.search(
                r"([0-9,.]+)\s*cm.+?1\s*cm.+?([0-9,.]+)\s*km.+?khoảng\s+([0-9,.]+)\s*km",
                text,
                flags=re.IGNORECASE,
            )
            example = ""
            if example_match:
                map_distance, scale_distance, real_distance = example_match.groups()
                example = f"\n\n**Bước 4:** Kiểm tra bằng ví dụ SGK: `{map_distance} cm × {scale_distance} km = {real_distance} km`."
            back = (
                "**Bước 1:** Đo khoảng cách giữa hai điểm trên bản đồ.\n\n"
                "**Bước 2:** Xác định tỉ lệ bản đồ hoặc tỉ lệ thước, tức là `1 cm` trên bản đồ ứng với bao nhiêu ki-lô-mét ngoài thực địa.\n\n"
                "**Bước 3:** Tính khoảng cách thực tế bằng công thức: `khoảng cách thực tế = khoảng cách trên bản đồ × giá trị thực tế ứng với 1 cm`."
                f"{example}"
            )
            _add_unique_flashcard(
                cards,
                Flashcard(
                    front="Cách tính khoảng cách thực tế trên bản đồ",
                    back=back,
                    hint="Đo trên bản đồ trước, rồi nhân theo tỉ lệ.",
                    topic=topic,
                    source_markers=[marker],
                    evidence_text=f"**Dẫn chứng:** {compact_text(text, 260)}",
                    image_hint="Hình minh họa tỉ lệ thước và khoảng cách trên bản đồ",
                ),
            )
    return cards


def _quiz_seed(chunks: list[RetrievedChunk], count: int) -> int:
    raw = "|".join(chunk.metadata.chunk_id for chunk in chunks[:24]) + f":{count}"
    return sum((index + 1) * ord(char) for index, char in enumerate(raw)) % (2**32)


def _term_label(term: str) -> str:
    label = _plain_learning_text(term)
    label = re.sub(r"^\W+", "", label)
    label = re.sub(r"\s+của\s+một\s+địa\s+điểm$", "", label, flags=re.IGNORECASE)
    label = re.sub(r"\s+của\s+địa\s+điểm\s+đó$", "", label, flags=re.IGNORECASE)
    return label.strip(" .:-–")


def _short_definition(definition: str, max_chars: int = 130) -> str:
    text = _plain_learning_text(definition)
    text = re.sub(r"\s*\([^)]{35,}\)", "", text)
    if len(text) <= max_chars:
        return text
    cutoff = text.rfind(" ", 0, max_chars - 3)
    if cutoff < max_chars // 2:
        cutoff = max_chars - 3
    return text[:cutoff].rstrip(" ,;:-") + "..."


def _unique_values(values: list[str], *, max_chars: int = 170) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = _plain_learning_text(value)
        clean = compact_text(clean, max_chars)
        norm = clean.lower().strip(" .:-–")
        if not norm or norm in seen:
            continue
        seen.add(norm)
        unique.append(clean)
    return unique


def _is_method_definition(subject: str, definition: str) -> bool:
    subject_norm = subject.lower()
    definition_norm = definition.lower()
    if subject_norm in {term.lower() for term in KNOWN_CONCEPT_TERMS}:
        return False
    return subject_norm.startswith(ACTION_SUBJECT_PREFIXES) or definition_norm.startswith(METHOD_DEFINITION_PREFIXES)


def _is_plausible_short_term(term: str) -> bool:
    clean = _plain_learning_text(term)
    norm = clean.lower().strip(" .:-–")
    words = norm.split()
    if not norm or len(clean) < 3 or len(clean) > 54:
        return False
    if clean.isupper() and len(words) > 2:
        return False
    if any(bad in norm for bad in ("trang ", "page_", "pdf", "https://")):
        return False
    if norm.startswith(BAD_TERM_STARTS) or norm.startswith(BAD_TERM_PREFIXES):
        return False
    if any(bad in norm for bad in BAD_TERM_CONTAINS):
        return False
    if len(words) == 1 and norm in VI_STOPWORDS:
        return False
    return True


def _definition_question(subject: str, definition: str) -> str:
    if _is_method_definition(subject, definition):
        definition_norm = definition.lower()
        if "cách đơn giản nhất" in definition_norm and "khoảng cách" in definition_norm:
            return "Cách đơn giản nhất để tính khoảng cách trên bản đồ là gì?"
        if definition.lower().startswith(METHOD_DEFINITION_PREFIXES):
            return f"{definition} là gì?"
        return f"Nội dung nào được mô tả là “{definition}”?"
    return f"Khái niệm nào phù hợp với mô tả sau: “{definition}”?"


def _add_unique_quiz_item(items: list[QuizItem], item: QuizItem | None) -> None:
    if not item:
        return
    question_norm = item.question.lower().strip()
    if any(existing.question.lower().strip() == question_norm for existing in items):
        return
    items.append(item)


def _merge_quiz_items(primary: list[QuizItem], fallback: list[QuizItem], limit: int) -> list[QuizItem]:
    merged: list[QuizItem] = []
    seen: set[str] = set()
    for item in [*primary, *fallback]:
        question_norm = re.sub(r"\s+", " ", item.question.lower()).strip()
        answer_norm = ""
        if 0 <= item.correct_index < len(item.options):
            answer_norm = item.options[item.correct_index].lower().strip()
        key = f"{question_norm}::{answer_norm}"
        if not question_norm or key in seen:
            continue
        seen.add(key)
        merged.append(item)
        if len(merged) >= limit:
            break
    return merged


def _clean_method_phrase(text: str) -> str:
    clean = _plain_learning_text(text)
    clean = re.sub(r"\s*\([^)]*(?:\)|$)", " ", clean)
    clean = re.sub(r"\s+hình\s+\d.*$", " ", clean, flags=re.IGNORECASE)
    clean = re.sub(r"^(?:dùng|sử dụng)\s+", "", clean, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", clean).strip(" .:-–")


def _method_distractors_for_subject(subject: str, facts: list[tuple[str, str, str]]) -> list[str]:
    candidates = [
        "Dùng com-pa",
        "Dùng mảnh giấy có cạnh thẳng",
        "Dùng thước kẻ",
        "Căn cứ vào tỉ lệ bản đồ",
        "Đặt lên thước tỉ lệ",
        "Xác định vị trí hai địa điểm cần đo",
    ]
    for _marker, _topic, sentence in facts:
        for match in re.finditer(r"\b(?:ta có thể|có thể|cũng có thể)\s+dùng\s+([^.;]+)", sentence, flags=re.IGNORECASE):
            phrase = match.group(1)
            for part in re.split(r"\s+hoặc\s+|\s*,\s*cũng\s+có\s+thể\s+|,", phrase, flags=re.IGNORECASE):
                clean = _clean_method_phrase(part)
                if 4 <= len(clean) <= 70:
                    candidates.append("Dùng " + clean)
        for bullet in re.findall(r"[–-]\s*([^.;]{6,120})", sentence):
            clean = _plain_learning_text(bullet).strip(" .:-–")
            if clean.lower().startswith(("xác định ", "đặt ", "giữ ", "căn cứ ", "dùng ")):
                candidates.append(clean)
    subject_norm = subject.lower().strip(" .:-–")
    return [
        item
        for item in _unique_values(candidates, max_chars=80)
        if item.lower().strip(" .:-–") != subject_norm
    ]


def _make_quiz_item(
    *,
    question: str,
    correct: str,
    distractors: list[str],
    explanation: str,
    marker: str,
    topic: str,
    rng: random.Random,
    difficulty: str = "medium",
) -> QuizItem | None:
    correct_clean = _clean_quiz_option(correct)
    if len(correct_clean) < 2:
        return None
    cleaned_distractors = [
        _clean_quiz_option(item)
        for item in _unique_values(distractors)
        if _clean_quiz_option(item).lower().strip(" .:-–") != correct_clean.lower().strip(" .:-–")
    ]
    if len(cleaned_distractors) < 3:
        return None
    candidate_pool = cleaned_distractors[: max(3, min(len(cleaned_distractors), 8))]
    ranked = sorted(candidate_pool, key=lambda item: (abs(len(item) - len(correct_clean)), rng.random()))
    options = [correct_clean] + ranked[:3]
    rng.shuffle(options)
    return QuizItem(
        question=_clean_quiz_question(question),
        options=options,
        correct_index=options.index(correct_clean),
        explanation=_format_measurements(_plain_learning_text(explanation)),
        source_markers=[marker],
        difficulty=difficulty,
        topic=topic,
    )


def _definition_records(facts: list[tuple[str, str, str]]) -> list[tuple[str, str, str, str, str]]:
    records: list[tuple[str, str, str, str, str]] = []
    seen: set[str] = set()
    for marker, topic, sentence in facts:
        candidate = _definition_candidate(sentence)
        if not candidate:
            continue
        subject = _term_label(candidate[0])
        definition = _short_definition(candidate[1])
        norm = subject.lower()
        if norm in seen or len(subject) < 3 or len(definition) < 18:
            continue
        seen.add(norm)
        records.append((marker, topic, sentence, subject, definition))
    return records


def _term_pool_from_facts(facts: list[tuple[str, str, str]], definitions: list[tuple[str, str, str, str, str]]) -> list[str]:
    terms = [record[3] for record in definitions]
    joined_text = " ".join(sentence.lower() for _marker, _topic, sentence in facts)
    for concept in KNOWN_CONCEPT_TERMS:
        if concept.lower() in joined_text:
            terms.append(concept)
    for _marker, _topic, sentence in facts:
        for term in _content_terms(sentence):
            if term and term[0].isupper():
                terms.append(term)
    filtered = []
    for term in _unique_values(terms, max_chars=60):
        if not _is_plausible_short_term(term):
            continue
        filtered.append(term)
    return filtered


def _add_definition_reverse_items(
    items: list[QuizItem],
    definitions: list[tuple[str, str, str, str, str]],
    facts: list[tuple[str, str, str]],
    term_pool: list[str],
    count: int,
    rng: random.Random,
) -> None:
    for marker, topic, sentence, subject, definition in definitions:
        if len(items) >= count:
            return
        if _is_method_definition(subject, definition):
            distractors = _method_distractors_for_subject(subject, facts)
        else:
            distractors = _term_distractors_for_subject(subject, term_pool, definitions)
        item = _make_quiz_item(
            question=_definition_question(subject, definition),
            correct=subject,
            distractors=distractors,
            explanation=sentence,
            marker=marker,
            topic=topic,
            rng=rng,
            difficulty="medium",
        )
        if item:
            items.append(item)


def _term_distractors_for_subject(
    subject: str,
    term_pool: list[str],
    definitions: list[tuple[str, str, str, str, str]],
) -> list[str]:
    subject_norm = subject.lower()
    priority: list[str] = [record[3] for record in definitions if record[3].lower() != subject_norm]
    if any(token in subject_norm for token in ("bản đồ", "tỉ lệ", "kí hiệu", "chú giải", "phương hướng", "lược đồ")):
        map_terms = ["Bản đồ", "Lược đồ", "Kí hiệu bản đồ", "Tỉ lệ bản đồ", "Chú giải bản đồ", "Phương hướng trên bản đồ", "Quả Địa Cầu"]
        return [term for term in _unique_values(map_terms + priority, max_chars=70) if term.lower() != subject_norm]
    if any(token in subject_norm for token in ("kinh", "vĩ", "tọa", "toạ", "tuyến", "xích", "quả", "địa cầu")):
        geo_terms = ["Kinh độ", "Vĩ độ", "Kinh tuyến", "Vĩ tuyến", "Kinh tuyến gốc", "Xích đạo", "Tọa độ địa lí"]
        return [term for term in _unique_values(geo_terms + priority, max_chars=70) if term.lower() != subject_norm]
    if "lịch sử" in subject_norm or any("lịch sử" in term.lower() for term in term_pool):
        history_terms = ["Lịch sử", "Tư liệu gốc", "Tư liệu truyền miệng", "Tư liệu hiện vật", "Tư liệu chữ viết"]
        return [term for term in _unique_values(history_terms + priority, max_chars=70) if term.lower() != subject_norm]
    priority.extend(term_pool)
    return [term for term in _unique_values(priority, max_chars=70) if term.lower() != subject_norm]


def _add_definition_direct_items(
    items: list[QuizItem],
    definitions: list[tuple[str, str, str, str, str]],
    count: int,
    rng: random.Random,
) -> None:
    all_definitions = [record[4] for record in definitions if not _is_method_definition(record[3], record[4])]
    for marker, topic, sentence, subject, definition in definitions:
        if len(items) >= count:
            return
        if _is_method_definition(subject, definition):
            continue
        item = _make_quiz_item(
            question=f"Mô tả nào đúng về {subject}?",
            correct=definition,
            distractors=[value for value in all_definitions if value.lower() != definition.lower()],
            explanation=sentence,
            marker=marker,
            topic=topic,
            rng=rng,
            difficulty="medium",
        )
        if item:
            items.append(item)


def _add_pair_items(
    items: list[QuizItem],
    definitions: list[tuple[str, str, str, str, str]],
    count: int,
    rng: random.Random,
) -> None:
    definitions = [record for record in definitions if not _is_method_definition(record[3], record[4])]
    if len(definitions) < 4:
        return
    if len(definitions) < 2:
        return
    for left_index in range(len(definitions)):
        if len(items) >= count:
            return
        right_index = left_index + 1
        if right_index >= len(definitions):
            break
        left = definitions[left_index]
        right = definitions[right_index]
        left_label, left_def = left[3], _short_definition(left[4], 78)
        right_label, right_def = right[3], _short_definition(right[4], 78)
        correct = f"{left_label}: {left_def}; {right_label}: {right_def}"
        distractors = [
            f"{left_label}: {right_def}; {right_label}: {left_def}",
            f"{left_label}: {left_def}; {right_label}: {left_def}",
            f"{left_label}: {right_def}; {right_label}: {right_def}",
        ]
        item = _make_quiz_item(
            question="Cặp ghép khái niệm - mô tả nào đúng?",
            correct=correct,
            distractors=distractors,
            explanation=f"{left[2]} {right[2]}",
            marker=left[0],
            topic=left[1],
            rng=rng,
            difficulty="hard",
        )
        if item:
            items.append(item)


def _add_statement_items(
    items: list[QuizItem],
    definitions: list[tuple[str, str, str, str, str]],
    count: int,
    rng: random.Random,
) -> None:
    if len(definitions) < 2:
        return
    for left_index, left in enumerate(definitions):
        if len(items) >= count:
            return
        left_is_method = _is_method_definition(left[3], left[4])
        peers = [
            record
            for index, record in enumerate(definitions)
            if index != left_index and _is_method_definition(record[3], record[4]) == left_is_method
        ]
        if not peers:
            continue
        right = peers[0]
        left_label, left_def = left[3], _short_definition(left[4], 125)
        right_label, right_def = right[3], _short_definition(right[4], 125)
        correct = f"{left_label} là {left_def}."
        if left_is_method:
            distractors = [
                f"{right_label} là {left_def}.",
                f"{left_label} là {right_def}.",
                f"{left_label} không dùng để tính khoảng cách trên bản đồ.",
            ]
        else:
            distractors = [
                f"{left_label} là {right_def}.",
                f"{right_label} là {left_def}.",
                f"{left_label} là tên gọi khác của {right_label}.",
            ]
        item = _make_quiz_item(
            question=f"Nhận định nào đúng về {left_label}?",
            correct=correct,
            distractors=distractors,
            explanation=left[2],
            marker=left[0],
            topic=left[1],
            rng=rng,
            difficulty="medium",
        )
        if item:
            items.append(item)


def _add_coordinate_application_items(
    items: list[QuizItem],
    facts: list[tuple[str, str, str]],
    term_pool: list[str],
    count: int,
    rng: random.Random,
) -> None:
    coordinate_re = re.compile(
        r"\b([A-Z])\s*\(\s*([0-9]+°\s*[A-ZÀ-ỴĐ]+)\s*[,;]\s*([0-9]+°\s*[A-ZÀ-ỴĐ]+)\s*\)",
        flags=re.UNICODE,
    )
    for marker, topic, sentence in facts:
        match = coordinate_re.search(sentence)
        if not match:
            continue
        point, first_value, second_value = match.group(1), match.group(2).replace(" ", ""), match.group(3).replace(" ", "")
        prompts = [
            (
                f"Trong cách viết tọa độ {point} ({first_value}, {second_value}), thành phần {first_value} biểu thị nội dung nào?",
                f"vĩ độ của điểm {point}",
                [f"kinh độ của điểm {point}", "tên của điểm trên bản đồ", "kinh tuyến gốc", "đường xích đạo"],
            ),
            (
                f"Trong cách viết tọa độ {point} ({first_value}, {second_value}), thành phần {second_value} biểu thị nội dung nào?",
                f"kinh độ của điểm {point}",
                [f"vĩ độ của điểm {point}", "tên của điểm trên bản đồ", "vĩ tuyến gốc", "đường xích đạo"],
            ),
        ]
        for question, correct, distractors in prompts:
            if len(items) >= count:
                return
            item = _make_quiz_item(
                question=question,
                correct=correct,
                distractors=distractors,
                explanation=sentence,
                marker=marker,
                topic=topic,
                rng=rng,
                difficulty="medium",
            )
            if item:
                items.append(item)


def _add_procedure_items(
    items: list[QuizItem],
    facts: list[tuple[str, str, str]],
    count: int,
    rng: random.Random,
) -> None:
    for marker, topic, sentence in facts:
        if len(items) >= count:
            return
        clean_sentence = _plain_learning_text(sentence)
        sentence_norm = clean_sentence.lower()

        if "tính khoảng cách thực tế" in sentence_norm and "căn cứ vào tỉ lệ bản đồ" in sentence_norm:
            _add_unique_quiz_item(
                items,
                _make_quiz_item(
                    question="Để tính khoảng cách thực tế giữa hai địa điểm trên bản đồ, cần căn cứ vào yếu tố nào?",
                    correct="Tỉ lệ bản đồ",
                    distractors=["Kí hiệu bản đồ", "Chú giải bản đồ", "Phương hướng trên bản đồ", "Kinh tuyến gốc"],
                    explanation=clean_sentence,
                    marker=marker,
                    topic=topic,
                    rng=rng,
                    difficulty="medium",
                ),
            )

        if len(items) >= count:
            return
        if "tính khoảng cách theo đường thẳng" in sentence_norm and "com-pa" in sentence_norm and "mảnh giấy" in sentence_norm:
            _add_unique_quiz_item(
                items,
                _make_quiz_item(
                    question="Để đo khoảng cách theo đường thẳng giữa hai địa điểm trên bản đồ, có thể dùng nhóm dụng cụ nào?",
                    correct="Com-pa, mảnh giấy có cạnh thẳng hoặc thước kẻ",
                    distractors=[
                        "La bàn, nhiệt kế hoặc biểu đồ khí hậu",
                        "Bảng chú giải, màu sắc hoặc kí hiệu diện tích",
                        "Kinh tuyến gốc, xích đạo hoặc vĩ tuyến",
                    ],
                    explanation=clean_sentence,
                    marker=marker,
                    topic=topic,
                    rng=rng,
                    difficulty="medium",
                ),
            )

        if len(items) >= count:
            return
        scale_match = re.search(r"1\s*cm\s+trên\s+bản\s+đồ\s+tương\s+ứng\s+với\s+([0-9,.]+\s*km)", clean_sentence, flags=re.IGNORECASE)
        measured_match = re.search(r"(?:đo\s+được\s+là|đo\s+được)\s+khoảng\s+([0-9,.]+)\s*cm", clean_sentence, flags=re.IGNORECASE)
        distance_match = re.search(
            r"khoảng\s+cách\s+thực\s+tế\s+từ\s+(.+?)\s+đến\s+(.+?)\s+theo\s+đường\s+thẳng\s+khoảng\s+([0-9,.]+\s*km)",
            clean_sentence,
            flags=re.IGNORECASE,
        )
        if distance_match and scale_match and measured_match:
            start, end = distance_match.group(1), distance_match.group(2)
            value = _format_measurements(distance_match.group(3))
            measured = _format_measurements(measured_match.group(1) + " cm")
            scale = _format_measurements(scale_match.group(1))
            _add_unique_quiz_item(
                items,
                _make_quiz_item(
                    question=f"Trên bản đồ, khoảng cách từ {start} đến {end} đo được {measured}; tỉ lệ thước cho biết 1 cm ứng với {scale}. Khoảng cách thực tế theo đường thẳng khoảng bao nhiêu?",
                    correct=value,
                    distractors=["20 km", "33 km", "3,3 cm", "100 km"],
                    explanation=clean_sentence,
                    marker=marker,
                    topic=topic,
                    rng=rng,
                    difficulty="medium",
                ),
            )


def _fact_for(facts: list[tuple[str, str, str]], *needles: str) -> tuple[str, str, str] | None:
    normalized_needles = [needle.lower() for needle in needles if needle]
    for marker, topic, sentence in facts:
        sentence_norm = sentence.lower()
        if all(needle in sentence_norm for needle in normalized_needles):
            return marker, topic, sentence
    return facts[0] if facts else None


def _add_fact_item(
    items: list[QuizItem],
    facts: list[tuple[str, str, str]],
    count: int,
    rng: random.Random,
    *,
    needles: tuple[str, ...],
    question: str,
    correct: str,
    distractors: list[str],
    difficulty: str = "medium",
) -> None:
    if len(items) >= count:
        return
    fact = _fact_for(facts, *needles)
    if not fact:
        return
    marker, topic, sentence = fact
    _add_unique_quiz_item(
        items,
        _make_quiz_item(
            question=question,
            correct=correct,
            distractors=distractors,
            explanation=sentence,
            marker=marker,
            topic=topic,
            rng=rng,
            difficulty=difficulty,
        ),
    )


def _add_map_lesson_items(
    items: list[QuizItem],
    facts: list[tuple[str, str, str]],
    count: int,
    rng: random.Random,
) -> None:
    joined = " ".join(sentence.lower() for _marker, _topic, sentence in facts)
    if not any(token in joined for token in ("kí hiệu bản đồ", "tỉ lệ bản đồ", "phép chiếu bản đồ", "phương hướng trên bản đồ")):
        return

    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("chuyển bề mặt cong", "sang mặt phẳng"),
        question="Khi vẽ bản đồ, người ta cần chuyển bề mặt cong của Trái Đất sang dạng nào?",
        correct="Mặt phẳng",
        distractors=["Mặt cầu nguyên dạng", "Mặt cắt địa hình", "Mặt phẳng tọa độ toán học"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("phép chiếu bản đồ",),
        question="Phương pháp nào được dùng để chuyển bề mặt Trái Đất lên mặt phẳng bản đồ?",
        correct="Phép chiếu bản đồ",
        distractors=["Tỉ lệ bản đồ", "Chú giải bản đồ", "Kí hiệu tượng hình"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("đều bị biến dạng",),
        question="Khi chuyển bề mặt cong của Trái Đất lên mặt phẳng, lãnh thổ trên bản đồ thường có đặc điểm gì?",
        correct="Bị biến dạng nhất định so với hình dạng thực",
        distractors=[
            "Giữ nguyên hoàn toàn hình dạng và diện tích",
            "Chỉ thay đổi tên địa danh",
            "Chỉ thể hiện được các đại dương",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("kí hiệu bản đồ", "ngôn ngữ đặc biệt"),
        question="Hệ thống kí hiệu trên bản đồ được coi là gì?",
        correct="Ngôn ngữ đặc biệt của bản đồ",
        distractors=["Tỉ lệ thước của bản đồ", "Bảng đo khoảng cách", "Mũi tên chỉ hướng bắc"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("kí hiệu bản đồ", "vị trí", "phân bố", "số lượng"),
        question="Kí hiệu bản đồ phản ánh những nội dung nào của đối tượng địa lí?",
        correct="Vị trí, phân bố, số lượng và sự phát triển trong không gian",
        distractors=[
            "Chỉ phản ánh tên gọi của địa điểm",
            "Chỉ phản ánh thời gian thành lập bản đồ",
            "Chỉ phản ánh độ cao của núi",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("kí hiệu điểm", "kí hiệu đường", "kí hiệu diện tích"),
        question="Kí hiệu bản đồ được chia thành những loại nào?",
        correct="Kí hiệu điểm, kí hiệu đường và kí hiệu diện tích",
        distractors=[
            "Kí hiệu hình học, kí hiệu chữ và kí hiệu tượng hình",
            "Bản đồ nhỏ, bản đồ trung bình và bản đồ lớn",
            "Kinh tuyến, vĩ tuyến và xích đạo",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("kí hiệu hình học", "kí hiệu chữ", "kí hiệu tượng hình"),
        question="Các dạng kí hiệu bản đồ gồm những dạng nào?",
        correct="Kí hiệu hình học, kí hiệu chữ và kí hiệu tượng hình",
        distractors=[
            "Kí hiệu điểm, kí hiệu đường và kí hiệu diện tích",
            "Bản đồ quốc gia, khu vực và toàn cầu",
            "Đường đồng mức, thang màu và tỉ lệ thước",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("bản đồ địa hình", "đường đồng mức", "thang màu"),
        question="Trên bản đồ địa hình, địa hình bề mặt Trái Đất thường được thể hiện bằng gì?",
        correct="Đường đồng mức hoặc thang màu",
        distractors=["Kinh tuyến gốc hoặc xích đạo", "Com-pa hoặc mảnh giấy", "Tên tỉnh hoặc tên huyện"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("đọc bảng chú giải", "trước khi đọc nội dung bản đồ"),
        question="Trước khi đọc nội dung bản đồ, người đọc cần làm gì?",
        correct="Đọc bảng chú giải và hiểu ý nghĩa của các kí hiệu",
        distractors=[
            "Đo ngay khoảng cách giữa hai địa điểm",
            "Chỉ nhìn màu sắc của bản đồ",
            "Bỏ qua các kí hiệu trên bản đồ",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("căn cứ vào tỉ lệ bản đồ", "bản đồ tỉ lệ nhỏ", "bản đồ tỉ lệ trung bình", "bản đồ tỉ lệ lớn"),
        question="Căn cứ vào tỉ lệ, bản đồ được chia thành những nhóm nào?",
        correct="Bản đồ tỉ lệ nhỏ, tỉ lệ trung bình và tỉ lệ lớn",
        distractors=[
            "Bản đồ tự nhiên, dân cư và kinh tế",
            "Bản đồ giấy, bản đồ ảnh và bản đồ số",
            "Bản đồ điểm, bản đồ đường và bản đồ diện tích",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("bản đồ tỉ lệ nhỏ", "nhỏ hơn 1 : 1 000 000"),
        question="Bản đồ tỉ lệ nhỏ có tỉ lệ như thế nào?",
        correct="Nhỏ hơn 1 : 1 000 000",
        distractors=["Lớn hơn 1 : 200 000", "Từ 1 : 200 000 đến 1 : 1 000 000", "Bằng đúng 1 : 50 000"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("tỉ lệ trung bình", "từ 1 : 200 000 đến 1 : 1 000 000"),
        question="Bản đồ tỉ lệ trung bình có khoảng tỉ lệ nào?",
        correct="Từ 1 : 200 000 đến 1 : 1 000 000",
        distractors=["Nhỏ hơn 1 : 1 000 000", "Lớn hơn 1 : 200 000", "Từ 1 : 10 000 đến 1 : 50 000"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("bản đồ tỉ lệ lớn", "lớn hơn 1 : 200 000"),
        question="Bản đồ tỉ lệ lớn có tỉ lệ như thế nào?",
        correct="Lớn hơn 1 : 200 000",
        distractors=["Nhỏ hơn 1 : 1 000 000", "Từ 1 : 200 000 đến 1 : 1 000 000", "Bằng đúng 1 : 9 000 000"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("có hai cách xác định phương hướng", "kinh tuyến", "mũi tên chỉ hướng bắc"),
        question="Có những cách nào để xác định phương hướng trên bản đồ?",
        correct="Dựa vào kinh tuyến, vĩ tuyến hoặc mũi tên chỉ hướng bắc",
        distractors=[
            "Dựa vào tỉ lệ thước và com-pa",
            "Dựa vào màu sắc và tên địa danh",
            "Dựa vào kí hiệu điểm và kí hiệu diện tích",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("bắc cực", "kinh tuyến đều chỉ hướng nam"),
        question="Trên bản đồ khu vực Bắc Cực, các đường kinh tuyến đều chỉ hướng nào?",
        correct="Hướng nam",
        distractors=["Hướng bắc", "Hướng đông", "Hướng tây"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("nam cực", "kinh tuyến đều chỉ hướng bắc"),
        question="Trên bản đồ khu vực Nam Cực, các đường kinh tuyến đều chỉ hướng nào?",
        correct="Hướng bắc",
        distractors=["Hướng nam", "Hướng đông", "Hướng tây"],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("bản đồ địa lí chung", "bản đồ địa lí chuyên đề"),
        question="Một số bản đồ thông dụng được chia thành hai nhóm nào?",
        correct="Bản đồ địa lí chung và bản đồ địa lí chuyên đề",
        distractors=[
            "Bản đồ tỉ lệ nhỏ và bản đồ tỉ lệ lớn",
            "Bản đồ điểm và bản đồ đường",
            "Bản đồ màu và bản đồ đen trắng",
        ],
    )
    _add_fact_item(
        items,
        facts,
        count,
        rng,
        needles=("bản đồ địa lí chuyên đề", "tập trung một hoặc hai đối tượng"),
        question="Bản đồ địa lí chuyên đề có đặc điểm gì?",
        correct="Tập trung thể hiện một hoặc hai đối tượng địa lí chính",
        distractors=[
            "Không tập trung làm nổi bật yếu tố nào",
            "Chỉ thể hiện đường kinh tuyến và vĩ tuyến",
            "Chỉ dùng để đo khoảng cách bằng com-pa",
        ],
    )


def _add_cloze_items(
    items: list[QuizItem],
    facts: list[tuple[str, str, str]],
    count: int,
    rng: random.Random,
) -> None:
    term_pool: list[str] = []
    known_norms = {term.lower() for term in KNOWN_CONCEPT_TERMS}
    for _marker, _topic, sentence in facts:
        for term in _content_terms(sentence):
            norm = term.lower().strip(" .:-–")
            if norm in known_norms or (term[:1].isupper() and _is_plausible_short_term(term)):
                term_pool.append(term)

    for marker, topic, sentence in facts:
        if len(items) >= count:
            return
        terms = [
            term
            for term in _content_terms(sentence)
            if term.lower().strip(" .:-–") in known_norms or (term[:1].isupper() and _is_plausible_short_term(term))
        ]
        if not terms:
            continue
        answer = sorted(terms, key=lambda term: (len(term.split()), len(term)), reverse=True)[0]
        if len(answer) < 5 or answer.lower() in VI_STOPWORDS:
            continue
        prompt_sentence = sentence.replace(answer, "[...]", 1)
        if prompt_sentence == sentence:
            continue
        distractors = []
        for term in term_pool:
            if term.lower() == answer.lower():
                continue
            if abs(len(term) - len(answer)) > 24:
                continue
            norm = term.lower()
            if norm not in {item.lower() for item in distractors}:
                distractors.append(term)
        item = _make_quiz_item(
            question=f"Cụm từ nào hoàn thành đúng nhận định sau: {_plain_learning_text(prompt_sentence)}",
            correct=answer,
            distractors=distractors,
            explanation=sentence,
            marker=marker,
            topic=topic,
            rng=rng,
            difficulty="easy",
        )
        if item:
            items.append(item)


def _fallback_quiz(chunks: list[RetrievedChunk], count: int) -> list[QuizItem]:
    items: list[QuizItem] = []
    content_chunks = [chunk for chunk in chunks if chunk.metadata.subject != "reference"]
    focused_chunks = _focus_quiz_chunks(content_chunks or chunks)
    candidate_chunks = focused_chunks[: max(4, min(len(focused_chunks), count * 2))]
    facts = _collect_fact_sentences(candidate_chunks)
    definitions = _definition_records(facts)
    term_pool = _term_pool_from_facts(facts, definitions)
    rng = random.Random(_quiz_seed(candidate_chunks, count))

    _add_definition_reverse_items(items, definitions, facts, term_pool, count, rng)
    _add_procedure_items(items, facts, count, rng)
    _add_map_lesson_items(items, facts, count, rng)
    _add_statement_items(items, definitions, count, rng)
    _add_coordinate_application_items(items, facts, term_pool, count, rng)
    _add_pair_items(items, definitions, count, rng)
    _add_definition_direct_items(items, definitions, count, rng)
    return items


def _focus_quiz_chunks(chunks: list[RetrievedChunk], *, allow_single: bool = False) -> list[RetrievedChunk]:
    if not chunks:
        return chunks
    top_lesson = chunks[0].metadata.lesson_id
    if not top_lesson:
        return chunks
    same_lesson = [chunk for chunk in chunks if chunk.metadata.lesson_id == top_lesson]
    return same_lesson if len(same_lesson) >= 2 or allow_single else chunks


def _expand_query_chunks_to_top_lesson(retriever: HybridRetriever, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    if not chunks:
        return chunks
    top_meta = chunks[0].metadata
    if not top_meta.lesson_id:
        return chunks
    filters: dict[str, Any] = {"lesson_id": top_meta.lesson_id}
    if top_meta.filename:
        filters["filename"] = top_meta.filename
    lesson_chunks = retriever.all_documents(filters)
    return lesson_chunks or chunks


def generate_quiz(
    retriever: HybridRetriever,
    config: AppConfig,
    *,
    query: str | None = None,
    filters: MetadataFilter | dict | None = None,
    count: int | None = None,
    k: int | None = None,
    provider: Provider | None = None,
) -> QuizSet:
    n = count or config.learning.quiz_default_count
    chunks, scope, target = _resolve_target(
        retriever,
        config,
        query=query,
        filters=filters,
        k=k,
        retrieval_k=config.learning.generation_retrieval_k,
    )
    chunks = _focus_quiz_chunks(chunks, allow_single=scope == "query")
    selected_provider = provider or config.generation.default_provider
    model_name: str | None = None
    valid_markers = {f"S{i}" for i in range(1, len(chunks) + 1)}
    if selected_provider == "extractive":
        items = _quality_filter_quiz_items(_fallback_quiz(chunks, n))
    else:
        llm_items: list[QuizItem] = []
        llm_failed = False
        quiz_context_chars = min(max(config.generation.max_context_chars, 11000 if n >= 8 else 6500), 12000)
        model_override = config.generation.quiz_model if selected_provider == "openai_compatible" else None
        llm_target = min(n, 18)
        while len(llm_items) < llm_target:
            batch_count = min(6, llm_target - len(llm_items))
            try:
                prompt = render_prompt("quiz.jinja2", context=build_context(chunks, quiz_context_chars), count=batch_count)
                if llm_items:
                    existing_questions = "\n".join(f"- {item.question}" for item in llm_items)
                    prompt += (
                        "\n\nCÁC CÂU ĐÃ SINH, KHÔNG LẶP LẠI:\n"
                        f"{existing_questions}\n"
                    )
                llm_text, model_name = invoke_llm(
                    prompt,
                    config.generation,
                    provider=selected_provider,
                    model_override=model_override,
                )
                payload = _json_from_text(llm_text)
                batch_items = _validate_items(payload, "items", QuizItem, "question", valid_markers)
                batch_items = _quality_filter_quiz_items(batch_items)
                before_count = len(llm_items)
                llm_items = _merge_quiz_items(llm_items, batch_items, llm_target)
                if len(llm_items) == before_count:
                    break
            except Exception as exc:
                if not _llm_learning_failed(exc):
                    raise
                llm_failed = True
                break

        items = _merge_quiz_items(llm_items, [], n)
        if not items:
            raise LLMProviderError(
                f"Model `{selected_provider}` không sinh được quiz đủ chuẩn JSON/citation, "
                "và hệ thống đã không dùng fallback rule-based để tránh tạo câu hỏi kém chất lượng."
            )
        if llm_failed or len(items) < n:
            selected_provider = f"{selected_provider}+quality_filtered"

    return QuizSet(
        scope=scope,
        target=target,
        items=items[:n],
        citations=format_citations(chunks),
        chunks=chunks,
        provider=selected_provider,
        model=model_name,
    )


def _fallback_flashcards(chunks: list[RetrievedChunk], count: int) -> list[Flashcard]:
    cards: list[Flashcard] = []
    content_chunks = [chunk for chunk in chunks if chunk.metadata.subject != "reference"]
    candidate_chunks = (content_chunks or chunks)[: max(4, min(len(content_chunks or chunks), count * 2))]
    for card in _procedure_flashcards(candidate_chunks):
        _add_unique_flashcard(cards, card)
        if len(cards) >= count:
            return cards
    facts = _collect_fact_sentences(candidate_chunks)

    for marker, topic, sentence in facts:
        if len(cards) >= count:
            return cards
        definition = _definition_candidate(sentence)
        if not definition:
            continue
        front = _term_label(definition[0])
        back = f"**Định nghĩa:** {compact_text(definition[1], 360)}."
        _add_unique_flashcard(
            cards,
            Flashcard(
                front=front,
                back=back,
                hint=None,
                topic=topic,
                source_markers=[marker],
                evidence_text=f"**Dẫn chứng:** {compact_text(sentence, 220)}",
                image_hint=compact_text(sentence, 120) if FLASHCARD_VISUAL_CUE_RE.search(sentence) else None,
            ),
        )

    if len(cards) < count:
        for chunk_index, chunk in enumerate(candidate_chunks, start=1):
            for sentence in sentence_split(chunk.text):
                if len(cards) >= count:
                    return cards
                definition = _definition_candidate(sentence)
                if not definition:
                    continue
                topic = chunk.metadata.lesson_title or chunk.metadata.subject_label or "SGK"
                _add_unique_flashcard(
                    cards,
                    Flashcard(
                        front=_term_label(definition[0]),
                        back=f"**Định nghĩa:** {compact_text(definition[1], 360)}.",
                        hint=None,
                        topic=topic,
                        source_markers=[f"S{chunk_index}"],
                        evidence_text=f"**Trang {chunk.metadata.page}:** {compact_text(sentence, 220)}",
                        image_hint=compact_text(sentence, 120) if FLASHCARD_VISUAL_CUE_RE.search(sentence) else None,
                    ),
                )
    return cards


def _auto_flashcard_count(chunks: list[RetrievedChunk]) -> int:
    content_chunks = [chunk for chunk in chunks if chunk.metadata.subject != "reference"]
    chunk_count = len(content_chunks or chunks)
    if chunk_count <= 1:
        return 4
    if chunk_count <= 3:
        return 8
    if chunk_count <= 6:
        return 12
    return min(30, max(14, chunk_count * 2))


def generate_flashcards(
    retriever: HybridRetriever,
    config: AppConfig,
    *,
    query: str | None = None,
    filters: MetadataFilter | dict | None = None,
    count: int | None = None,
    k: int | None = None,
    provider: Provider | None = None,
) -> FlashcardSet:
    chunks, scope, target = _resolve_target(
        retriever,
        config,
        query=query,
        filters=filters,
        k=k,
        retrieval_k=config.learning.generation_retrieval_k,
    )
    n = count or _auto_flashcard_count(chunks)
    selected_provider = provider or config.generation.default_provider
    model_name: str | None = None
    valid_markers = {f"S{i}" for i in range(1, len(chunks) + 1)}
    if selected_provider == "extractive":
        cards = _fallback_flashcards(chunks, n)
    else:
        cards = []
        llm_failed = False
        flashcard_context_chars = min(max(config.generation.max_context_chars, 9000), 12000)
        model_override = config.generation.quiz_model if selected_provider == "openai_compatible" else None
        target_count = min(n, 24)
        while len(cards) < target_count:
            batch_count = min(6, target_count - len(cards))
            try:
                prompt = render_prompt(
                    "flashcards.jinja2",
                    context=build_context(chunks, flashcard_context_chars),
                    count=batch_count,
                )
                if cards:
                    existing_fronts = "\n".join(f"- {card.front}" for card in cards)
                    prompt += (
                        "\n\nCÁC THẺ ĐÃ SINH, KHÔNG LẶP LẠI FRONT:\n"
                        f"{existing_fronts}\n"
                    )
                llm_text, model_name = invoke_llm(prompt, config.generation, provider=selected_provider, model_override=model_override)
                payload = _json_from_text(llm_text)
                batch_cards = _quality_filter_flashcards(_validate_items(payload, "cards", Flashcard, "front", valid_markers))
                before_count = len(cards)
                cards = _merge_flashcards(cards, batch_cards, target_count)
                if len(cards) == before_count:
                    break
            except Exception as exc:
                if not _llm_learning_failed(exc):
                    raise
                llm_failed = True
                break
        if not cards:
            raise LLMProviderError(
                f"Model `{selected_provider}` không sinh được flashcard đủ chuẩn JSON/citation, "
                "và hệ thống đã không dùng fallback rule-based để tránh tạo thẻ kém chất lượng."
            )
        if len(cards) < min(n, 2):
            raise LLMProviderError(
                f"Model `{selected_provider}` chỉ sinh được {len(cards)} flashcard đạt chuẩn; "
                "hãy thử lại hoặc chọn phạm vi bài học rõ hơn."
            )
        if llm_failed or len(cards) < n:
            selected_provider = f"{selected_provider}+quality_filtered"

    return FlashcardSet(
        scope=scope,
        target=target,
        cards=cards[:n],
        citations=format_citations(chunks),
        chunks=chunks,
        provider=selected_provider,
        model=model_name,
    )
