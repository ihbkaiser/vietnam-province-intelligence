from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator


NOTEBOOKLM_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = NOTEBOOKLM_ROOT.parent
SECRET_PLACEHOLDERS = {"", "EMPTY", "NONE", "NULL", "CHANGE_ME", "YOUR_API_KEY"}


class DataConfig(BaseModel):
    extracted_dir: Path = Path("../extracted/class_6_phase1_local_cpu_full")
    rag_chunks_path: Path = Path("../extracted/class_6_phase1_local_cpu_full/rag_chunks.jsonl")
    book_metadata_path: Path = Path("../extracted/class_6_phase1_local_cpu_full/metadata/book.json")
    image_metadata_path: Path = Path("../extracted/class_6_phase1_local_cpu_full/metadata/images.json")
    lesson_metadata_path: Path = Path("../backend/src/data/studyQuestionBank.meta.json")
    uploaded_dir: Path = Path("data/uploads")
    reference_start_page: int | None = 194
    exclude_from_index_start_page: int | None = 203


class IndexConfig(BaseModel):
    output_dir: Path = Path("storage/class_6")
    collection_name: str = "class_6_textbook"
    chunk_size: int = Field(default=1000, ge=200)
    chunk_overlap: int = Field(default=150, ge=0)
    min_chunk_chars: int = Field(default=80, ge=0)
    max_features: int = Field(default=60000, ge=1000)
    dense_svd_components: int = Field(default=256, ge=16)

    @model_validator(mode="after")
    def validate_chunking(self) -> "IndexConfig":
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be smaller than chunk_size")
        return self


class RetrievalConfig(BaseModel):
    final_top_k: int = Field(default=5, ge=1, le=30)
    initial_top_k: int = Field(default=15, ge=1, le=80)
    sparse_weight: float = 1.0
    dense_weight: float = 0.85
    exact_match_weight: float = 0.025
    rrf_k: int = Field(default=60, ge=1)
    use_reranker: bool = False
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    rerank_top_k: int = Field(default=5, ge=1, le=20)


class GenerationConfig(BaseModel):
    default_provider: Literal["extractive", "ollama", "hf_local", "openai_compatible"] = "openai_compatible"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"
    hf_model: str = "Qwen/Qwen3-4B-Instruct-2507"
    hf_device: int = -1
    hf_max_new_tokens: int = Field(default=900, ge=64, le=4096)
    openai_api_base: str = "https://openrouter.ai/api/v1"
    openai_api_key: str = "${OPENROUTER_API_KEY}"
    openai_model: str = "deepseek/deepseek-v4-flash-0731"
    quiz_model: str = "deepseek/deepseek-v4-flash-0731"
    vision_model: str = "google/gemini-3.7-flash"
    vision_batch_model: str = "google/gemini-3.7-flash:batch"
    timeout_s: int = Field(default=360, ge=5)
    max_output_tokens: int = Field(default=4096, ge=64, le=4096)
    max_context_chars: int = Field(default=9000, ge=1000)
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)


class LearningConfig(BaseModel):
    summarize_batch_size: int = Field(default=8, ge=1)
    summarize_retrieval_k: int = Field(default=12, ge=1, le=80)
    generation_retrieval_k: int = Field(default=12, ge=1, le=80)
    quiz_default_count: int = Field(default=6, ge=1, le=50)
    flashcards_default_count: int = Field(default=12, ge=1, le=100)


class AppConfig(BaseModel):
    data: DataConfig = Field(default_factory=DataConfig)
    index: IndexConfig = Field(default_factory=IndexConfig)
    retrieval: RetrievalConfig = Field(default_factory=RetrievalConfig)
    generation: GenerationConfig = Field(default_factory=GenerationConfig)
    learning: LearningConfig = Field(default_factory=LearningConfig)


def _resolve_path(value: Path, base_dir: Path) -> Path:
    return value if value.is_absolute() else (base_dir / value).resolve()


def resolve_config_paths(config: AppConfig, base_dir: Path) -> AppConfig:
    config.data.extracted_dir = _resolve_path(config.data.extracted_dir, base_dir)
    config.data.rag_chunks_path = _resolve_path(config.data.rag_chunks_path, base_dir)
    config.data.book_metadata_path = _resolve_path(config.data.book_metadata_path, base_dir)
    config.data.image_metadata_path = _resolve_path(config.data.image_metadata_path, base_dir)
    config.data.lesson_metadata_path = _resolve_path(config.data.lesson_metadata_path, base_dir)
    config.data.uploaded_dir = _resolve_path(config.data.uploaded_dir, base_dir)
    config.index.output_dir = _resolve_path(config.index.output_dir, base_dir)
    return config


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            values[key] = value
    return values


def _env_values(base_dir: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for path in [
        REPO_ROOT / ".env",
        REPO_ROOT / "backend" / ".env",
        base_dir / ".env",
    ]:
        values.update(_parse_env_file(path))
    values.update(os.environ)
    return values


def _resolve_secret(value: str, env: dict[str, str], fallback_keys: tuple[str, ...]) -> str:
    clean = (value or "").strip()
    if clean.startswith("${") and clean.endswith("}"):
        clean = env.get(clean[2:-1], "")
    if clean.upper() in SECRET_PLACEHOLDERS:
        for key in fallback_keys:
            fallback = env.get(key, "").strip()
            if fallback and fallback.upper() not in SECRET_PLACEHOLDERS:
                return fallback
    return clean


def apply_runtime_env(config: AppConfig, base_dir: Path) -> AppConfig:
    env = _env_values(base_dir)
    config.generation.openai_api_key = _resolve_secret(
        config.generation.openai_api_key,
        env,
        ("OPENROUTER_API_KEY", "OPENAI_API_KEY"),
    )
    return config


def load_config(config_path: Path | str | None = None) -> AppConfig:
    path = Path(config_path) if config_path else NOTEBOOKLM_ROOT / "config.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
    config = AppConfig.model_validate(raw or {})
    base_dir = path.parent if path.exists() else NOTEBOOKLM_ROOT
    return apply_runtime_env(resolve_config_paths(config, base_dir), base_dir)


@lru_cache(maxsize=4)
def get_config(config_path: str | None = None) -> AppConfig:
    return load_config(Path(config_path) if config_path else None)
