from __future__ import annotations

from typing import Any

import requests

from .utils import extract_json_object


class OllamaClient:
    def __init__(self, base_url: str, model: str, timeout: int = 1800) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def generate(self, prompt: str, *, options: dict[str, Any] | None = None, json_mode: bool = True) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": options or {},
        }
        if json_mode:
            payload["format"] = "json"
        response = requests.post(f"{self.base_url}/api/generate", json=payload, timeout=self.timeout)
        response.raise_for_status()
        data = response.json()
        text = str(data.get("response") or "").strip()
        if not text:
            thinking_len = len(str(data.get("thinking") or ""))
            reason = data.get("done_reason") or "unknown"
            raise ValueError(f"Ollama returned empty response. done_reason={reason}, thinking_chars={thinking_len}")
        return text

    def generate_json(self, prompt: str, *, options: dict[str, Any] | None = None) -> Any:
        # Ollama JSON mode can return an empty final response with thinking models such as qwen3.
        # We therefore enforce JSON in the prompt and parse the normal text response.
        return extract_json_object(self.generate(prompt, options=options, json_mode=False))
