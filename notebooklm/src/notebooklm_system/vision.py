from __future__ import annotations

import base64
import json
import mimetypes
import re
from pathlib import Path
from typing import Any

import requests

from .config import GenerationConfig


class VisionProviderError(RuntimeError):
    """Raised when the configured OpenRouter vision model cannot return usable JSON."""


JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.*?)```", flags=re.IGNORECASE | re.DOTALL)


def _missing_api_key(value: str) -> bool:
    clean = (value or "").strip()
    return not clean or clean.upper() == "EMPTY" or (clean.startswith("${") and clean.endswith("}"))


def _image_data_url(image_path: Path) -> str:
    mime = mimetypes.guess_type(str(image_path))[0] or "image/jpeg"
    data = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def _json_from_text(text: str) -> dict[str, Any]:
    clean = text.strip()
    match = JSON_BLOCK_RE.search(clean)
    if match:
        clean = match.group(1).strip()
    start = clean.find("{")
    end = clean.rfind("}")
    if start >= 0 and end > start:
        clean = clean[start : end + 1]
    return json.loads(clean)


def invoke_openrouter_vision(
    *,
    image_path: Path,
    prompt: str,
    config: GenerationConfig,
    model: str | None = None,
    timeout_s: int | None = None,
) -> tuple[dict[str, Any], str]:
    if _missing_api_key(config.openai_api_key):
        raise VisionProviderError("Missing OPENROUTER_API_KEY for vision model.")

    selected_model = model or config.vision_model
    is_openrouter = "openrouter.ai" in config.openai_api_base.lower()
    payload: dict[str, Any] = {
        "model": selected_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": _image_data_url(image_path)}},
                ],
            }
        ],
        "temperature": 0,
        "max_tokens": min(config.max_output_tokens, 1400),
    }
    if is_openrouter:
        payload["response_format"] = {"type": "json_object"}

    headers = {"Authorization": f"Bearer {config.openai_api_key}", "Content-Type": "application/json"}
    if is_openrouter:
        headers["HTTP-Referer"] = "http://127.0.0.1:8020"
        headers["X-Title"] = "NotebookLM SGK"

    try:
        response = requests.post(
            f"{config.openai_api_base.rstrip('/')}/chat/completions",
            headers=headers,
            json=payload,
            timeout=(5, timeout_s or config.timeout_s),
        )
        if response.status_code == 400 and "response_format" in payload:
            payload.pop("response_format", None)
            response = requests.post(
                f"{config.openai_api_base.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
                timeout=(5, timeout_s or config.timeout_s),
            )
        response.raise_for_status()
        data = response.json()
        text = str(data["choices"][0]["message"]["content"])
        parsed = _json_from_text(text)
        parsed["_usage"] = data.get("usage") or {}
        return parsed, selected_model
    except requests.RequestException as exc:
        detail = exc.response.text[:500] if getattr(exc, "response", None) is not None else str(exc)
        raise VisionProviderError(f"Vision model `{selected_model}` failed: {detail}") from exc
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise VisionProviderError(f"Vision model `{selected_model}` did not return valid JSON.") from exc


def textbook_image_prompt(*, source_hint: str = "", question_hint: str = "") -> str:
    return f"""
Bạn là trợ lý thị giác cho SGK Lịch sử và Địa lí lớp 6.
Hãy đọc ảnh và trả về JSON hợp lệ, không markdown, theo schema:
{{
  "caption_vi": "mô tả ngắn bằng tiếng Việt",
  "visible_text": ["các chữ/số đọc được trong ảnh"],
  "visual_type": "map|diagram|photo|chart|table|icon|other",
  "teaching_points": ["2-5 ý kiến thức có thể dùng để ra câu hỏi"],
  "question_fit": {{
    "score": 0,
    "reason": "ảnh này có phù hợp với câu hỏi/chủ đề không",
    "needs_neighbor_image": false
  }}
}}

Ngữ cảnh nguồn: {source_hint or "không có"}.
Câu hỏi/chủ đề cần kiểm tra: {question_hint or "không có"}.
Score là số nguyên từ 0 đến 100: 0 là không liên quan, 100 là rất phù hợp. Chỉ dùng thông tin nhìn thấy trong ảnh; nếu ảnh chỉ là icon/trang trí, đặt score thấp.
""".strip()
