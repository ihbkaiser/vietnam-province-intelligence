from __future__ import annotations

import importlib.util
import re
from importlib.metadata import PackageNotFoundError, version
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from packaging.version import Version
from pydantic import BaseModel, Field

from ..config import AppConfig, load_config
from ..data_loader import document_info
from ..indexing import build_index
from ..learning import generate_flashcards, generate_quiz, summarize
from ..llm import LLMProviderError
from ..rag import answer
from ..retriever import HybridRetriever
from ..schemas import MetadataFilter, RetrievedChunk
from ..store import LocalVectorStore
from ..text_utils import compact_text, repair_mojibake
from ..vision import VisionProviderError, invoke_openrouter_vision, textbook_image_prompt


UI_PATH = Path(__file__).resolve().parents[3] / "static" / "index.html"
MIN_PUBLIC_IMAGE_SIDE = 110
MIN_PUBLIC_IMAGE_AREA = 18_000
MIN_PUBLIC_IMAGE_BYTES = 4_000
MIN_QWEN3_TRANSFORMERS_VERSION = Version("4.57.0")
FIGURE_RE = re.compile(r"Hình\s+(\d+)(?:[.,](\d+))?\s*\.?\s*[^.!?\n]{0,150}", flags=re.IGNORECASE)
VISUAL_CUE_RE = re.compile(
    r"hình\s+\d|quan sát|lược đồ|sơ đồ|biểu đồ|chú giải|kí hiệu|tỉ lệ|tỷ lệ|khoảng cách|phương hướng",
    flags=re.IGNORECASE,
)
BAD_IMAGE_CAPTION_RE = re.compile(r"^\s*(?:ảnh sgk|image|none|null)?\s*$", flags=re.IGNORECASE)
EXTRA_VISUAL_CUE_RE = re.compile(
    r"địa hình|đường đồng mức|thang màu|contour|relief|terrain",
    flags=re.IGNORECASE,
)
MAX_LIVE_VLM_IMAGE_CHECKS = 10
MIN_VLM_IMAGE_FIT_SCORE = 75

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional dependency for image filtering only.
    Image = None  # type: ignore[assignment]


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=30)
    filters: MetadataFilter | None = None


class AskRequest(SearchRequest):
    provider: Literal["extractive", "ollama", "hf_local", "openai_compatible"] | None = None


class LearningRequest(BaseModel):
    query: str | None = None
    filters: MetadataFilter | None = None
    top_k: int | None = Field(default=None, ge=1, le=80)
    count: int | None = Field(default=None, ge=1, le=50)
    provider: Literal["extractive", "ollama", "hf_local", "openai_compatible"] | None = None


def _ensure_index(config: AppConfig) -> None:
    store = LocalVectorStore(config.index.output_dir)
    required = [store.documents_path, store.vectorizer_path, store.sparse_matrix_path, store.svd_path, store.dense_path]
    if not all(path.exists() for path in required):
        build_index(config, recreate=True)


@lru_cache(maxsize=4096)
def _image_dimensions(path: str) -> tuple[int, int] | None:
    if Image is None:
        return None
    try:
        with Image.open(path) as image:
            return int(image.width), int(image.height)
    except Exception:
        return None


def _is_public_image(image_path: str, config: AppConfig) -> tuple[bool, tuple[int, int] | None]:
    path = config.data.extracted_dir / image_path
    if not path.exists() or not path.is_file():
        return False, None
    if path.stat().st_size < MIN_PUBLIC_IMAGE_BYTES:
        return False, None
    dimensions = _image_dimensions(str(path))
    if dimensions is None:
        return True, None
    width, height = dimensions
    if min(width, height) < MIN_PUBLIC_IMAGE_SIDE or width * height < MIN_PUBLIC_IMAGE_AREA:
        return False, dimensions
    return True, dimensions


def _with_image_urls(chunk: RetrievedChunk, config: AppConfig) -> dict[str, Any]:
    payload = chunk.model_dump()
    public_images = []
    for image in payload.get("images") or []:
        image_path = image.get("path")
        if not image_path:
            continue
        keep, dimensions = _is_public_image(str(image_path), config)
        if not keep:
            continue
        safe_path = str(image_path).replace("\\", "/")
        image["url"] = f"/source-assets/{safe_path}"
        if dimensions:
            image["width"], image["height"] = dimensions
        public_images.append(image)
    payload["images"] = public_images
    payload["snippet"] = compact_text(chunk.text, 520)
    return payload


def _public_chunks(chunks: list[RetrievedChunk], config: AppConfig) -> list[dict[str, Any]]:
    return [_with_image_urls(chunk, config) for chunk in chunks]


def _figure_refs(text: str) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[tuple[int, int | None]] = set()
    for match in FIGURE_RE.finditer(text or ""):
        major = int(match.group(1))
        minor = int(match.group(2)) if match.group(2) is not None else None
        key = (major, minor)
        if key in seen:
            continue
        seen.add(key)
        refs.append({"major": major, "minor": minor, "label": f"{major}.{minor}" if minor is not None else str(major), "caption": match.group(0).strip()})
    return refs


def _caption_for_image(image: dict[str, Any], captions: list[dict[str, Any]], image_index: int) -> tuple[str, dict[str, Any] | None]:
    raw_caption = str(image.get("caption") or "").strip()
    if raw_caption and not BAD_IMAGE_CAPTION_RE.match(raw_caption):
        refs = _figure_refs(raw_caption)
        return raw_caption, refs[0] if refs else None
    if captions:
        caption = captions[min(image_index, len(captions) - 1)]
        return str(caption.get("caption") or "").strip(), caption
    return "", None


def _quiz_image_candidates(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_url: dict[str, dict[str, Any]] = {}
    for chunk_index, chunk in enumerate(chunks or []):
        marker = f"S{chunk_index + 1}"
        meta = chunk.get("metadata") or {}
        text = f"{chunk.get('text') or ''} {chunk.get('snippet') or ''}"
        captions = _figure_refs(text)
        for image_index, image in enumerate(chunk.get("images") or []):
            url = image.get("url")
            if not url:
                continue
            key = str(url)
            existing = by_url.get(key)
            if existing is not None:
                # Cùng 1 ảnh xuất hiện ở nhiều chunk (cùng trang); nhớ mọi marker
                # để item trỏ marker bất kỳ vẫn match được ảnh này.
                markers = set(existing.get("all_markers") or [])
                markers.add(marker)
                existing["all_markers"] = sorted(markers)
                if existing.get("figure") is None:
                    _caption, figure = _caption_for_image(image, captions, image_index)
                    existing["figure"] = figure.get("label") if figure else None
                    existing["figure_major"] = figure.get("major") if figure else None
                    existing["figure_minor"] = figure.get("minor") if figure else None
                continue
            caption, figure = _caption_for_image(image, captions, image_index)
            payload = dict(image)
            payload.update(
                {
                    "page": meta.get("page") or image.get("page_number"),
                    "source_marker": marker,
                    "all_markers": [marker],
                    "lesson_title": meta.get("lesson_title") or meta.get("section"),
                    "derivedCaption": caption or image.get("label") or "Ảnh SGK",
                    "figure": figure.get("label") if figure else None,
                    "figure_major": figure.get("major") if figure else None,
                    "figure_minor": figure.get("minor") if figure else None,
                    "match_type": "source_chunk",
                }
            )
            by_url[key] = payload
    return list(by_url.values())


def _keyword_score(item_text: str, candidate: dict[str, Any]) -> int:
    caption = f"{candidate.get('derivedCaption') or ''} {candidate.get('label') or ''}".lower()
    stopwords = {
        "câu",
        "hỏi",
        "nào",
        "đúng",
        "trong",
        "trên",
        "dưới",
        "theo",
        "được",
        "của",
        "với",
        "một",
        "các",
        "bản",
        "đồ",
        "hình",
        "sử",
        "dụng",
        "loại",
        "dạng",
        "nội",
        "dung",
        "người",
        "học",
        "cho",
        "biết",
    }
    words = {
        word
        for word in re.findall(r"[A-Za-zÀ-ỹ0-9]{3,}", item_text.lower())
        if word not in stopwords
    }
    return sum(1 for word in words if word in caption)


def _score_quiz_image(candidate: dict[str, Any], refs: list[dict[str, Any]], markers: set[str], item_text: str) -> tuple[int, str]:
    score = 0
    match_type = "source_chunk"
    all_markers = set(candidate.get("all_markers") or [candidate.get("source_marker")] or [])
    if all_markers & markers:
        score += 60
    elif not refs:
        return 0, match_type
    c_major = candidate.get("figure_major")
    c_minor = candidate.get("figure_minor")
    for ref in refs:
        r_major = ref.get("major")
        r_minor = ref.get("minor")
        if c_major == r_major and c_minor == r_minor and c_minor is not None:
            return score + 240, "exact_figure"
        if c_major == r_major and c_minor is not None and r_minor is not None:
            distance = abs(int(c_minor) - int(r_minor))
            if 0 < distance <= 2:
                score += 150 - distance * 35
                match_type = "nearby_figure"
    score += _keyword_score(item_text, candidate) * 8
    if not refs and all_markers & markers:
        score += 25
    return score, match_type


def _select_quiz_images(item: dict[str, Any], candidates: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
    visual_text = " ".join(
        [
            str(item.get("question") or ""),
            str(item.get("front") or ""),
            str(item.get("back") or ""),
            str(item.get("hint") or ""),
            str(item.get("explanation") or ""),
            str(item.get("evidence_text") or ""),
            str(item.get("image_hint") or ""),
            str(item.get("summary") or ""),
            " ".join(str(point) for point in item.get("key_points") or []),
            str(item.get("topic") or ""),
        ]
    )
    item_text = " ".join([visual_text, " ".join(str(option) for option in item.get("options") or [])])
    refs = _figure_refs(visual_text)
    markers = {str(marker) for marker in item.get("source_markers") or []}
    candidate_markers = set()
    for candidate in candidates:
        candidate_markers.update(candidate.get("all_markers") or [candidate.get("source_marker")] or [])
    has_source_images = bool(markers & candidate_markers)
    if not refs and not (VISUAL_CUE_RE.search(visual_text) or EXTRA_VISUAL_CUE_RE.search(visual_text)) and not has_source_images:
        return []
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for index, candidate in enumerate(candidates):
        score, match_type = _score_quiz_image(candidate, refs, markers, item_text)
        if score <= 0:
            continue
        payload = dict(candidate)
        payload["match_type"] = match_type
        payload["heuristic_score"] = score
        payload["keyword_hits"] = _keyword_score(item_text, candidate)
        scored.append((score, index, payload))
    scored.sort(key=lambda row: (-row[0], row[1]))
    selected: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for _, _, image in scored:
        url = str(image.get("url") or "")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        selected.append(image)
        if len(selected) >= limit:
            break
    return selected


def _source_chunks_for_item(item: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    marker_map = {f"S{index + 1}": chunk for index, chunk in enumerate(chunks or [])}
    markers = [str(marker) for marker in item.get("source_markers") or [] if str(marker) in marker_map]
    selected = [marker_map[marker] for marker in markers]
    return selected or (chunks or [])[:1]


def _source_title(chunk: dict[str, Any]) -> str:
    meta = chunk.get("metadata") or {}
    lesson = meta.get("lesson_title") or meta.get("section") or "SGK"
    page = meta.get("page")
    return f"{lesson} · trang {page}" if page else str(lesson)


def _source_records(item: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    marker_by_chunk = {id(chunk): f"S{index + 1}" for index, chunk in enumerate(chunks or [])}
    records = []
    for chunk in _source_chunks_for_item(item, chunks):
        meta = chunk.get("metadata") or {}
        records.append(
            {
                "marker": marker_by_chunk.get(id(chunk), ""),
                "page": meta.get("page"),
                "lesson_title": meta.get("lesson_title") or meta.get("section"),
                "chunk_id": meta.get("chunk_id"),
                "snippet": chunk.get("snippet") or compact_text(chunk.get("text") or "", 520),
            }
        )
    return records


def _strip_source_marker_text(text: str) -> str:
    clean = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    clean = re.sub(r"\b(?:Theo|Dẫn chứng)\s+S\d+\s*[:,]?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"^\s*Dẫn chứng\s*:\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\[S\d+\]", "", clean)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in clean.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def _quiz_evidence_text(item: dict[str, Any], source_chunks: list[dict[str, Any]]) -> str:
    custom = _strip_source_marker_text(str(item.get("evidence_text") or ""))
    if custom:
        return custom
    first = source_chunks[0] if source_chunks else {}
    meta = first.get("metadata") or {}
    page = meta.get("page")
    lesson = meta.get("lesson_title") or meta.get("section") or "bài học"
    answer_text = ""
    options = item.get("options") or []
    correct_index = item.get("correct_index")
    if isinstance(correct_index, int) and 0 <= correct_index < len(options):
        answer_text = str(options[correct_index])
    explanation = _strip_source_marker_text(str(item.get("explanation") or ""))
    if explanation:
        core = explanation
    elif first:
        core = compact_text(str(first.get("text") or first.get("snippet") or ""), 360)
    else:
        core = "nội dung này được nêu trong phần bài học liên quan."
    source_line = f"**SGK trang {page}, {lesson}** nêu nội dung liên quan." if page else f"**{lesson}** nêu nội dung liên quan."
    core_line = core[0].upper() + core[1:] if core else core
    conclusion = f"Vì vậy, đáp án đúng là **{answer_text}**." if answer_text else ""
    parts = [source_line, "", f"- {core_line}"]
    if conclusion:
        parts.extend(["", conclusion])
    return "\n".join(parts).replace("..", ".")


def _strong_heuristic_image(image: dict[str, Any]) -> bool:
    if image.get("match_type") == "exact_figure":
        return True
    if image.get("match_type") == "nearby_figure" and int(image.get("keyword_hits") or 0) > 0:
        return True
    if int(image.get("keyword_hits") or 0) >= 2:
        return True
    return int(image.get("heuristic_score") or 0) >= 140


def _validate_quiz_images_with_vlm(
    item: dict[str, Any],
    images: list[dict[str, Any]],
    config: AppConfig,
    budget: list[int],
) -> list[dict[str, Any]]:
    if not images:
        return []
    checked: list[dict[str, Any]] = []
    item_text = " ".join(
        [
            str(item.get("question") or ""),
            str(item.get("front") or ""),
            str(item.get("back") or ""),
            str(item.get("hint") or ""),
            str(item.get("image_hint") or ""),
            str(item.get("evidence_text") or ""),
            str(item.get("explanation") or ""),
            str(item.get("summary") or ""),
            " ".join(str(point) for point in item.get("key_points") or []),
            " ".join(str(option) for option in item.get("options") or []),
        ]
    )
    vlm_ran = False
    for image in images[:4]:
        if budget[0] <= 0:
            break
        image_path = image.get("path")
        if not image_path:
            continue
        abs_path = config.data.extracted_dir / str(image_path)
        if not abs_path.exists():
            continue
        budget[0] -= 1
        source_hint = " | ".join(
            str(value)
            for value in [
                image.get("derivedCaption"),
                image.get("caption"),
                image.get("label"),
                f"trang {image.get('page') or image.get('page_number') or ''}",
            ]
            if value
        )
        try:
            result, model = invoke_openrouter_vision(
                image_path=abs_path,
                prompt=textbook_image_prompt(source_hint=source_hint, question_hint=item_text),
                config=config.generation,
                model=config.generation.vision_model,
                timeout_s=min(config.generation.timeout_s, 90),
            )
        except VisionProviderError:
            continue
        vlm_ran = True
        fit = result.get("question_fit") or {}
        try:
            score = int(float(fit.get("score") or 0))
        except (TypeError, ValueError):
            score = 0
        if score < MIN_VLM_IMAGE_FIT_SCORE:
            continue
        payload = dict(image)
        payload["vlm_model"] = model
        payload["vlm_score"] = score
        payload["vlm_caption"] = result.get("caption_vi")
        payload["vlm_reason"] = fit.get("reason")
        checked.append(payload)
        if len(checked) >= 2:
            break
    if checked:
        return checked
    if vlm_ran:
        # VLM đã duyệt nhưng loại hết ảnh (điểm thấp) → không gắn ảnh sai/lệch.
        return []
    # VLM không chạy được (lỗi API/network) → chỉ giữ ảnh khớp mạnh, không tự bịa.
    return [image for image in images if _strong_heuristic_image(image)][:2]


def _attach_quiz_images(items: list[dict[str, Any]], chunks: list[dict[str, Any]], config: AppConfig | None = None) -> list[dict[str, Any]]:
    candidates = _quiz_image_candidates(chunks)
    updated: list[dict[str, Any]] = []
    vlm_budget = [MAX_LIVE_VLM_IMAGE_CHECKS]
    for item in items or []:
        payload = dict(item)
        source_chunks = _source_chunks_for_item(payload, chunks)
        selected_images = _select_quiz_images(payload, candidates)
        if config is not None:
            selected_images = _validate_quiz_images_with_vlm(payload, selected_images, config, vlm_budget)
        else:
            selected_images = [image for image in selected_images if _strong_heuristic_image(image)][:2]
        payload["images"] = selected_images
        payload["evidence"] = {
            "title": _source_title(source_chunks[0]) if source_chunks else "SGK",
            "text": _quiz_evidence_text(payload, source_chunks),
            "sources": _source_records(payload, chunks),
            "images": selected_images,
        }
        updated.append(payload)
    return updated


def _learning_evidence_text(item: dict[str, Any], source_chunks: list[dict[str, Any]]) -> str:
    custom = _strip_source_marker_text(str(item.get("evidence_text") or ""))
    if custom:
        return custom
    first = source_chunks[0] if source_chunks else {}
    meta = first.get("metadata") or {}
    page = meta.get("page")
    lesson = meta.get("lesson_title") or meta.get("section") or "bài học"
    back = _strip_source_marker_text(str(item.get("back") or item.get("summary") or ""))
    if not back and first:
        back = compact_text(str(first.get("text") or first.get("snippet") or ""), 300)
    source_line = f"**SGK trang {page}, {lesson}:**" if page else f"**{lesson}:**"
    return "\n\n".join(part for part in [source_line, back] if part)


def _attach_flashcard_images(cards: list[dict[str, Any]], chunks: list[dict[str, Any]], config: AppConfig | None = None) -> list[dict[str, Any]]:
    candidates = _quiz_image_candidates(chunks)
    updated: list[dict[str, Any]] = []
    vlm_budget = [MAX_LIVE_VLM_IMAGE_CHECKS]
    for card in cards or []:
        payload = dict(card)
        source_chunks = _source_chunks_for_item(payload, chunks)
        selected_images = _select_quiz_images(payload, candidates, limit=3)
        if config is not None:
            selected_images = _validate_quiz_images_with_vlm(payload, selected_images, config, vlm_budget)
        else:
            selected_images = [image for image in selected_images if _strong_heuristic_image(image)][:2]
        payload["images"] = selected_images
        payload["evidence"] = {
            "title": _source_title(source_chunks[0]) if source_chunks else "SGK",
            "text": _learning_evidence_text(payload, source_chunks),
            "sources": _source_records(payload, chunks),
            "images": selected_images,
        }
        updated.append(payload)
    return updated


def _attach_summary_visuals(payload: dict[str, Any], chunks: list[dict[str, Any]], config: AppConfig | None = None) -> list[dict[str, Any]]:
    candidates = _quiz_image_candidates(chunks)
    if not candidates:
        return []
    pseudo_item = {
        "summary": payload.get("summary") or "",
        "key_points": payload.get("key_points") or [],
        "image_hint": " | ".join(str(item) for item in payload.get("image_hints") or []),
        "source_markers": [f"S{index + 1}" for index in range(len(chunks or []))],
    }
    selected_images = _select_quiz_images(pseudo_item, candidates, limit=4)
    if config is not None:
        selected_images = _validate_quiz_images_with_vlm(pseudo_item, selected_images, config, [MAX_LIVE_VLM_IMAGE_CHECKS])
    else:
        selected_images = [image for image in selected_images if _strong_heuristic_image(image)][:2]
    return selected_images


def _provider_http_error(exc: LLMProviderError) -> HTTPException:
    return HTTPException(status_code=502, detail=str(exc))


def _missing_api_key(value: str) -> bool:
    clean = (value or "").strip()
    return not clean or clean.upper() == "EMPTY" or (clean.startswith("${") and clean.endswith("}"))


def _openai_compatible_label(config: AppConfig) -> str:
    model = (config.generation.quiz_model or config.generation.openai_model).lower()
    if "deepseek-v4-flash" in model:
        return "DeepSeek V4 Flash API"
    if "gpt-oss-20b" in model:
        return "GPT-OSS-20B API"
    if "openrouter.ai" in config.generation.openai_api_base.lower():
        return "OpenRouter"
    return "OpenAI-compatible/vLLM"


def _provider_status(config: AppConfig) -> list[dict[str, Any]]:
    providers: list[dict[str, Any]] = [
        {
            "value": "extractive",
            "label": "Extractive local",
            "available": True,
            "model": None,
            "reason": "Chạy offline, không cần LLM.",
        }
    ]

    try:
        response = requests.get(f"{config.generation.ollama_base_url.rstrip('/')}/api/tags", timeout=1.5)
        response.raise_for_status()
        models = {item.get("name") for item in response.json().get("models", [])}
        model_available = config.generation.ollama_model in models
        providers.append(
            {
                "value": "ollama",
                "label": "Ollama",
                "available": model_available,
                "model": config.generation.ollama_model,
                "reason": (
                    f"Sẵn sàng với model {config.generation.ollama_model}."
                    if model_available
                    else f"Ollama đang chạy nhưng chưa có model {config.generation.ollama_model}."
                ),
            }
        )
    except requests.RequestException:
        providers.append(
            {
                "value": "ollama",
                "label": "Ollama",
                "available": False,
                "model": config.generation.ollama_model,
                "reason": "Ollama chưa chạy ở URL trong config.",
            }
        )

    hf_ready = importlib.util.find_spec("torch") is not None and importlib.util.find_spec("transformers") is not None
    hf_reason = ""
    if hf_ready:
        try:
            transformers_version = Version(version("transformers"))
            if transformers_version < MIN_QWEN3_TRANSFORMERS_VERSION:
                hf_ready = False
                hf_reason = (
                    f"`transformers` đang là {transformers_version}, chưa đủ để nhận Qwen3. "
                    f"Cần >= {MIN_QWEN3_TRANSFORMERS_VERSION}."
                )
        except (PackageNotFoundError, ValueError):
            hf_ready = False
            hf_reason = "Không đọc được version `transformers`."
    else:
        hf_reason = "Chưa cài đủ torch/transformers để chạy HF local."
    providers.append(
        {
            "value": "hf_local",
            "label": "HF local",
            "available": hf_ready,
            "model": config.generation.hf_model,
            "reason": (
                f"Chạy trực tiếp model paper {config.generation.hf_model}. Lần đầu có thể tải model khá nặng."
                if hf_ready
                else hf_reason
            ),
        }
    )

    openai_label = _openai_compatible_label(config)
    generation_model = config.generation.quiz_model or config.generation.openai_model
    vision_model = config.generation.vision_model
    vision_batch_model = config.generation.vision_batch_model
    if _missing_api_key(config.generation.openai_api_key):
        providers.append(
            {
                "value": "openai_compatible",
                "label": openai_label,
                "available": False,
                "model": generation_model,
                "reason": "Chưa tìm thấy OPENROUTER_API_KEY trong .env/backend/.env.",
            }
        )
    else:
        try:
            headers = {"Authorization": f"Bearer {config.generation.openai_api_key}"}
            is_openrouter = "openrouter.ai" in config.generation.openai_api_base.lower()
            if is_openrouter:
                headers["HTTP-Referer"] = "http://127.0.0.1:8020"
                headers["X-Title"] = "NotebookLM SGK"
            status_url = (
                f"{config.generation.openai_api_base.rstrip('/')}/key"
                if is_openrouter
                else f"{config.generation.openai_api_base.rstrip('/')}/models"
            )
            response = requests.get(
                status_url,
                headers=headers,
                timeout=1.5,
            )
            providers.append(
                {
                    "value": "openai_compatible",
                    "label": openai_label,
                    "available": response.ok,
                    "model": generation_model,
                    "reason": (
                        f"Sẵn sàng với quiz model {generation_model}; VLM ảnh {vision_model}; batch offline {vision_batch_model}."
                        if response.ok
                        else f"Endpoint/key trả HTTP {response.status_code}."
                    ),
                }
            )
        except requests.RequestException:
            providers.append(
                {
                    "value": "openai_compatible",
                    "label": openai_label,
                    "available": False,
                    "model": generation_model,
                    "reason": f"Chưa kết nối được endpoint {config.generation.openai_api_base}.",
                }
            )
    return providers


def _html() -> str:
    if UI_PATH.exists():
        return UI_PATH.read_text(encoding="utf-8")
    return r"""
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NotebookLM SGK</title>
  <style>
    :root {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #16202a;
      background: #f6f8fb;
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1280px, calc(100vw - 28px)); margin: 0 auto; padding: 18px 0 28px; }
    header, section {
      background: #fff;
      border: 1px solid #dbe3ea;
      border-radius: 8px;
      box-shadow: 0 10px 26px rgba(22,32,42,.08);
    }
    header { padding: 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: 0; }
    .sub { margin: 4px 0 0; color: #657080; font-size: 14px; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: minmax(330px,.85fr) minmax(0,1.15fr); gap: 12px; align-items: start; }
    section { padding: 16px; }
    label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 700; }
    textarea, select, input {
      width: 100%;
      border: 1px solid #c9d3df;
      border-radius: 7px;
      background: #fbfcfe;
      color: #16202a;
      font: inherit;
    }
    textarea { min-height: 142px; padding: 12px; resize: vertical; line-height: 1.5; }
    select, input { height: 40px; padding: 0 10px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    .row3 { display: grid; grid-template-columns: 1fr 90px 132px; gap: 10px; margin-top: 10px; }
    button {
      height: 42px;
      border: 1px solid #17202a;
      border-radius: 7px;
      background: #17202a;
      color: #fff;
      font: inherit;
      font-weight: 750;
      cursor: pointer;
    }
    button:disabled { opacity: .6; cursor: wait; }
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .tabs button {
      width: auto;
      height: 36px;
      padding: 0 12px;
      border-color: #dbe3ea;
      background: #f6f8fb;
      color: #485465;
    }
    .tabs button.active { background: #007a78; color: white; border-color: #007a78; }
    .answer { white-space: pre-wrap; line-height: 1.62; color: #263241; }
    .muted { color: #657080; font-size: 13px; }
    .source {
      border-top: 1px solid #e6edf3;
      padding-top: 12px;
      margin-top: 12px;
      display: grid;
      grid-template-columns: minmax(0,1fr) 116px;
      gap: 12px;
    }
    .source strong { display: block; margin-bottom: 5px; font-size: 13px; }
    .source p { margin: 0; color: #4c5868; font-size: 13px; line-height: 1.5; }
    .thumbs { display: grid; grid-template-columns: repeat(2, 54px); gap: 6px; align-content: start; }
    .thumbs img { width: 54px; height: 54px; object-fit: cover; border-radius: 6px; border: 1px solid #dbe3ea; background: #eef2f5; }
    .quiz-item, .card-item {
      border-top: 1px solid #e6edf3;
      padding-top: 12px;
      margin-top: 12px;
    }
    .quiz-item ol { margin: 8px 0 0; padding-left: 24px; line-height: 1.6; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; background: #e6f3f1; color: #007a78; padding: 3px 8px; font-size: 12px; font-weight: 700; margin-right: 6px; }
    .error { color: #b42318; font-weight: 700; }
    @media (max-width: 880px) {
      .grid, .source { grid-template-columns: 1fr; }
      header { display: block; }
      .row, .row3 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>NotebookLM SGK Lịch sử và Địa lí 6</h1>
        <p class="sub" id="status">Đang tải dữ liệu...</p>
      </div>
      <div class="muted" id="docInfo"></div>
    </header>

    <div class="grid">
      <section>
        <div class="tabs" role="tablist">
          <button id="tabAsk" class="active" data-task="ask">Hỏi đáp</button>
          <button data-task="summarize">Tóm tắt</button>
          <button data-task="quiz">Quiz</button>
          <button data-task="flashcards">Flashcards</button>
          <button data-task="search">Search</button>
        </div>
        <label for="query">Nội dung</label>
        <textarea id="query">Vì sao cần học lịch sử?</textarea>
        <div class="row">
          <div>
            <label for="lesson">Bài học</label>
            <select id="lesson"><option value="">Tất cả bài học</option></select>
          </div>
          <div>
            <label for="subject">Môn học</label>
            <select id="subject"><option value="">Tất cả</option></select>
          </div>
        </div>
        <div class="row3">
          <div>
            <label for="provider">Model</label>
            <select id="provider">
              <option value="extractive">Extractive local</option>
              <option value="ollama">Ollama</option>
              <option value="openai_compatible">OpenAI-compatible/vLLM</option>
            </select>
            <p class="muted" id="providerHint" style="margin:6px 0 0"></p>
          </div>
          <div>
            <label for="topK">Top K</label>
            <input id="topK" type="number" min="1" max="30" value="5">
          </div>
          <div>
            <label for="count">Số item</label>
            <input id="count" type="number" min="1" max="50" value="6">
          </div>
        </div>
        <button id="run" style="margin-top:12px;width:100%">Chạy</button>
      </section>

      <section>
        <div id="output" class="answer">Kết quả sẽ hiện ở đây.</div>
        <div id="sources"></div>
      </section>
    </div>
  </main>

  <script>
    let task = "ask";
    let lessons = [];
    let providerStatus = {};
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

    function filterPayload() {
      const filters = {};
      if ($("lesson").value) filters.lesson_id = $("lesson").value;
      if ($("subject").value) filters.subject = $("subject").value;
      return Object.keys(filters).length ? filters : null;
    }

    function renderSources(chunks) {
      $("sources").innerHTML = (chunks || []).slice(0, 8).map((chunk, index) => {
        const meta = chunk.metadata || {};
        const imgs = (chunk.images || []).filter(img => img.url).slice(0, 4)
          .map(img => `<img src="${escapeHtml(img.url)}" title="${escapeHtml(img.label || img.caption || "")}" alt="">`).join("");
        return `<div class="source">
          <div>
            <strong>S${index + 1} · Trang ${meta.page ?? ""} · ${escapeHtml(meta.lesson_title || "Không rõ bài")}</strong>
            <p>${escapeHtml(chunk.snippet || chunk.text || "")}</p>
          </div>
          <div class="thumbs">${imgs}</div>
        </div>`;
      }).join("");
    }

    function renderQuiz(data) {
      $("output").innerHTML = `<span class="pill">${data.provider}</span>${(data.items || []).length} câu hỏi`;
      $("output").innerHTML += (data.items || []).map((item, i) => `
        <div class="quiz-item">
          <strong>Câu ${i + 1}. ${escapeHtml(item.question)}</strong>
          <ol type="A">${item.options.map(opt => `<li>${escapeHtml(opt)}</li>`).join("")}</ol>
          <p class="muted">Đáp án: ${String.fromCharCode(65 + item.correct_index)} · ${escapeHtml(item.explanation || "")}</p>
        </div>`).join("");
      renderSources(data.chunks);
    }

    function renderFlashcards(data) {
      $("output").innerHTML = `<span class="pill">${data.provider}</span>${(data.cards || []).length} flashcards`;
      $("output").innerHTML += (data.cards || []).map((card, i) => `
        <div class="card-item">
          <strong>Thẻ ${i + 1}. ${escapeHtml(card.front)}</strong>
          <p>${escapeHtml(card.back)}</p>
          ${card.hint ? `<p class="muted">${escapeHtml(card.hint)}</p>` : ""}
        </div>`).join("");
      renderSources(data.chunks);
    }

    function renderProviders(providers) {
      providerStatus = Object.fromEntries((providers || []).map(provider => [provider.value, provider]));
      $("provider").innerHTML = (providers || []).map(provider => {
        const label = `${provider.label}${provider.model ? " · " + provider.model : ""}${provider.available ? "" : " · chưa chạy"}`;
        return `<option value="${escapeHtml(provider.value)}" ${provider.available ? "" : "disabled"}>${escapeHtml(label)}</option>`;
      }).join("");
      const preferred = (providers || []).find(provider => provider.value === "ollama" && provider.available)
        || (providers || []).find(provider => provider.value === "extractive")
        || (providers || []).find(provider => provider.available);
      if (preferred) $("provider").value = preferred.value;
      updateProviderHint();
    }

    function updateProviderHint() {
      const info = providerStatus[$("provider").value];
      $("providerHint").textContent = info ? info.reason : "";
    }

    async function loadMeta() {
      const [docsRes, lessonsRes, providersRes] = await Promise.all([fetch("/documents"), fetch("/lessons"), fetch("/providers")]);
      const docs = await docsRes.json();
      lessons = await lessonsRes.json();
      const providers = await providersRes.json();
      $("status").textContent = "Sẵn sàng";
      if (docs[0]) $("docInfo").textContent = `${docs[0].chunks} chunks · ${docs[0].pages.length} trang · ${lessons.length} bài`;
      renderProviders(providers);
      const subjects = [...new Set(lessons.map(l => l.subject_label).filter(Boolean))];
      $("subject").innerHTML = `<option value="">Tất cả</option>` + subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
      fillLessons();
    }

    function fillLessons() {
      const subject = $("subject").value;
      const filtered = lessons.filter(l => !subject || l.subject_label === subject || l.subject === subject);
      $("lesson").innerHTML = `<option value="">Tất cả bài học</option>` + filtered.map(l => `<option value="${escapeHtml(l.lesson_id)}">${escapeHtml(l.lesson_title)} (${l.chunk_count})</option>`).join("");
    }

    document.querySelectorAll(".tabs button").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        task = button.dataset.task;
      });
    });
    $("subject").addEventListener("change", fillLessons);
    $("provider").addEventListener("change", updateProviderHint);

    $("run").addEventListener("click", async () => {
      const query = $("query").value.trim();
      $("run").disabled = true;
      $("status").textContent = "Đang xử lý...";
      $("output").textContent = "Đang xử lý...";
      $("sources").innerHTML = "";
      try {
        const selectedProvider = $("provider").value;
        const providerInfo = providerStatus[selectedProvider];
        if (providerInfo && !providerInfo.available) throw new Error(providerInfo.reason || "Provider chưa sẵn sàng.");
        let endpoint = `/${task}`;
        let body = { filters: filterPayload() };
        if (task === "ask") body = { query, top_k: Number($("topK").value), provider: selectedProvider, filters: filterPayload() };
        else if (task === "search") body = { query, top_k: Number($("topK").value), filters: filterPayload() };
        else body = { query: query || null, top_k: Number($("topK").value), count: Number($("count").value), provider: selectedProvider, filters: filterPayload() };
        const response = await fetch(endpoint, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
        const contentType = response.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          data = { detail: (await response.text()) || response.statusText };
        }
        if (!response.ok) throw new Error(data.detail || data.message || JSON.stringify(data));
        $("status").textContent = "Hoàn tất";
        if (task === "quiz") renderQuiz(data);
        else if (task === "flashcards") renderFlashcards(data);
        else if (task === "summarize") { $("output").textContent = `${data.summary}\n\nÝ chính:\n- ${(data.key_points || []).join("\n- ")}`; renderSources(data.chunks); }
        else if (task === "search") { $("output").textContent = `${(data.results || []).length} kết quả phù hợp.`; renderSources(data.results); }
        else { $("output").textContent = data.answer; renderSources(data.chunks); }
      } catch (err) {
        $("status").textContent = "Có lỗi";
        $("output").innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
      } finally {
        $("run").disabled = false;
      }
    });

    loadMeta().catch(err => { $("status").textContent = "Có lỗi"; $("output").textContent = err.message; });
  </script>
</body>
</html>
"""


def create_app(config_path: Path | str | None = None) -> FastAPI:
    config = load_config(config_path)
    _ensure_index(config)
    retriever = HybridRetriever(config.index.output_dir, config.retrieval.model_dump())
    store = LocalVectorStore(config.index.output_dir)
    lessons = store.load_json(store.lessons_path, [])

    app = FastAPI(title="Simple NotebookLM for Vietnamese Textbooks", version="0.1.0")
    if config.data.extracted_dir.exists():
        app.mount("/source-assets", StaticFiles(directory=str(config.data.extracted_dir)), name="source-assets")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return _html()

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "chunks": len(retriever.docs), "index": str(config.index.output_dir)}

    @app.get("/documents")
    def documents() -> list[dict[str, Any]]:
        return document_info(retriever.docs, [])

    @app.get("/lessons")
    def list_lessons() -> list[dict[str, Any]]:
        return lessons

    @app.get("/providers")
    def providers() -> list[dict[str, Any]]:
        return _provider_status(config)

    @app.post("/search")
    def search(request: SearchRequest) -> dict[str, Any]:
        query = repair_mojibake(request.query)
        chunks = retriever.search(query, final_top_k=request.top_k, filters=request.filters)
        return {"query": query, "results": _public_chunks(chunks, config)}

    @app.post("/ask")
    def ask(request: AskRequest) -> dict[str, Any]:
        query = repair_mojibake(request.query)
        try:
            result = answer(retriever, config, query, k=request.top_k, filters=request.filters, provider=request.provider)
        except LLMProviderError as exc:
            raise _provider_http_error(exc) from exc
        payload = result.model_dump()
        public_chunks = _public_chunks(result.chunks, config)
        payload["chunks"] = public_chunks
        return payload

    @app.post("/summarize")
    def summarize_endpoint(request: LearningRequest) -> dict[str, Any]:
        query = repair_mojibake(request.query) if request.query else None
        try:
            result = summarize(retriever, config, query=query, filters=request.filters, k=request.top_k, provider=request.provider)
        except LLMProviderError as exc:
            raise _provider_http_error(exc) from exc
        payload = result.model_dump()
        public_chunks = _public_chunks(result.chunks, config)
        payload["chunks"] = public_chunks
        payload["visuals"] = _attach_summary_visuals(payload, public_chunks, config)
        return payload

    @app.post("/quiz")
    def quiz_endpoint(request: LearningRequest) -> dict[str, Any]:
        query = repair_mojibake(request.query) if request.query else None
        try:
            result = generate_quiz(retriever, config, query=query, filters=request.filters, count=request.count, k=request.top_k, provider=request.provider)
        except LLMProviderError as exc:
            raise _provider_http_error(exc) from exc
        payload = result.model_dump()
        public_chunks = _public_chunks(result.chunks, config)
        payload["chunks"] = public_chunks
        payload["items"] = _attach_quiz_images(payload.get("items") or [], public_chunks, config)
        return payload

    @app.post("/flashcards")
    def flashcards_endpoint(request: LearningRequest) -> dict[str, Any]:
        query = repair_mojibake(request.query) if request.query else None
        try:
            result = generate_flashcards(retriever, config, query=query, filters=request.filters, count=request.count, k=request.top_k, provider=request.provider)
        except LLMProviderError as exc:
            raise _provider_http_error(exc) from exc
        payload = result.model_dump()
        public_chunks = _public_chunks(result.chunks, config)
        payload["chunks"] = public_chunks
        payload["cards"] = _attach_flashcard_images(payload.get("cards") or [], public_chunks, config)
        return payload

    return app
