from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml


RAG_ROOT = Path(__file__).resolve().parents[2]


def _resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (RAG_ROOT / path).resolve()


def load_config(path: str | Path) -> dict[str, Any]:
    config_path = Path(path)
    if not config_path.is_absolute():
        config_path = (Path.cwd() / config_path).resolve()
    data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    config = deepcopy(data)

    for section, keys in {
        "data": ["extracted_dir", "rag_chunks_path", "book_metadata_path", "image_metadata_path"],
        "index": ["output_dir"],
    }.items():
        for key in keys:
            if key in config.get(section, {}):
                config[section][key] = _resolve_path(config[section][key])

    return config


def ensure_dir(path: str | Path) -> Path:
    resolved = Path(path)
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved
