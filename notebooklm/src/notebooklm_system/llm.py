from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Literal

import requests

from .config import GenerationConfig


Provider = Literal["extractive", "ollama", "hf_local", "openai_compatible"]


class LLMProviderError(RuntimeError):
    """Raised when a configured local/remote LLM endpoint is unavailable or malformed."""


THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", flags=re.IGNORECASE | re.DOTALL)
NO_THINK_INSTRUCTION = (
    "Không viết quá trình suy nghĩ. Không giải thích cách bạn suy luận. "
    "Chỉ trả về câu trả lời cuối cùng theo đúng định dạng được yêu cầu.\n\n"
)


def _prepare_prompt(prompt: str, model: str) -> str:
    prompt = NO_THINK_INSTRUCTION + prompt
    if "qwen3" in model.lower() and "/no_think" not in prompt[:200].lower():
        return "/no_think\n" + prompt
    return prompt


def _clean_llm_text(text: str) -> str:
    return THINK_BLOCK_RE.sub("", text).strip()


def _expects_json(prompt: str) -> bool:
    return "Chỉ trả về JSON hợp lệ" in prompt or "JSON hợp lệ" in prompt[:1200]


def _missing_api_key(value: str) -> bool:
    clean = (value or "").strip()
    return not clean or clean.upper() == "EMPTY" or (clean.startswith("${") and clean.endswith("}"))


@lru_cache(maxsize=2)
def _load_hf_model(model_name: str, device: int):
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except Exception as exc:
        raise LLMProviderError(
            "Chưa cài đủ `torch`/`transformers` để chạy HF local. "
            "Hãy cài notebooklm requirements hoặc chọn Ollama/OpenAI-compatible."
        ) from exc

    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        dtype = "auto"
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
        )
        if device >= 0 and torch.cuda.is_available():
            model = model.to(f"cuda:{device}")
        else:
            model = model.to("cpu")
        model.eval()
        return tokenizer, model
    except Exception as exc:
        raise LLMProviderError(f"Không tải/chạy được HF local model `{model_name}`: {exc}") from exc


def _invoke_hf_local(prompt: str, config: GenerationConfig) -> tuple[str, str | None]:
    try:
        import torch
    except Exception as exc:
        raise LLMProviderError("Chưa cài `torch` để chạy HF local.") from exc

    model_name = config.hf_model
    prompt = _prepare_prompt(prompt, model_name)
    tokenizer, model = _load_hf_model(model_name, config.hf_device)
    if hasattr(tokenizer, "apply_chat_template"):
        rendered = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=False,
            add_generation_prompt=True,
        )
    else:
        rendered = prompt
    inputs = tokenizer(rendered, return_tensors="pt").to(model.device)
    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=config.hf_max_new_tokens,
            do_sample=config.temperature > 0,
            temperature=max(config.temperature, 1e-5),
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = outputs[0][inputs["input_ids"].shape[-1] :]
    return _clean_llm_text(tokenizer.decode(generated, skip_special_tokens=True)), model_name


def _request_error_message(provider: str, exc: requests.RequestException) -> str:
    if isinstance(exc, requests.ConnectionError):
        if provider == "ollama":
            return "Không kết nối được Ollama. Hãy chạy `ollama serve`, pull model trong config, hoặc chọn Extractive local."
        return "Không kết nối được OpenAI-compatible/vLLM endpoint. Hãy chạy server model ở URL trong config hoặc chọn Extractive local."
    if isinstance(exc, requests.Timeout):
        return f"LLM provider `{provider}` phản hồi quá lâu. Hãy giảm Top K/Số item hoặc tăng timeout trong config."
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        detail = exc.response.text.strip().replace("\n", " ")[:500]
        return f"LLM provider `{provider}` trả HTTP {exc.response.status_code}: {detail}"
    return f"LLM provider `{provider}` lỗi: {exc}"


def invoke_llm(
    prompt: str,
    config: GenerationConfig,
    *,
    provider: Provider | None = None,
    model_override: str | None = None,
) -> tuple[str, str | None]:
    selected = provider or config.default_provider
    if selected == "extractive":
        return "", None
    if selected == "hf_local":
        return _invoke_hf_local(prompt, config)
    if selected == "ollama":
        try:
            prompt = _prepare_prompt(prompt, config.ollama_model)
            payload: dict[str, Any] = {
                "model": config.ollama_model,
                "prompt": prompt,
                "stream": False,
                "think": False,
                "keep_alive": "10m",
                "options": {
                    "temperature": config.temperature,
                    "num_predict": config.max_output_tokens,
                    "num_ctx": 4096,
                },
            }
            if _expects_json(prompt):
                payload["format"] = "json"
            response = requests.post(
                f"{config.ollama_base_url.rstrip('/')}/api/generate",
                json=payload,
                timeout=(5, config.timeout_s),
            )
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as exc:
            raise LLMProviderError(_request_error_message(selected, exc)) from exc
        except ValueError as exc:
            raise LLMProviderError("Ollama trả response không phải JSON hợp lệ.") from exc
        return _clean_llm_text(str(data.get("response") or "")), config.ollama_model
    if selected == "openai_compatible":
        if _missing_api_key(config.openai_api_key):
            raise LLMProviderError("Chưa có API key cho OpenAI-compatible/OpenRouter. Hãy đặt OPENROUTER_API_KEY trong .env.")
        model_name = model_override or config.openai_model
        prompt = _prepare_prompt(prompt, model_name)
        payload: dict[str, Any] = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": config.temperature,
            "max_tokens": config.max_output_tokens,
        }
        is_openrouter = "openrouter.ai" in config.openai_api_base.lower()
        if is_openrouter and _expects_json(prompt):
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
                timeout=(5, config.timeout_s),
            )
            if response.status_code == 400 and "response_format" in payload:
                payload.pop("response_format", None)
                response = requests.post(
                    f"{config.openai_api_base.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=(5, config.timeout_s),
                )
            response.raise_for_status()
            data = response.json()
            return _clean_llm_text(str(data["choices"][0]["message"]["content"])), model_name
        except requests.RequestException as exc:
            raise LLMProviderError(_request_error_message(selected, exc)) from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMProviderError("OpenAI-compatible/vLLM endpoint trả response không đúng schema chat/completions.") from exc
    raise ValueError(f"Unknown LLM provider: {selected}")
