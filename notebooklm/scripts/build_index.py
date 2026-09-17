from __future__ import annotations

import argparse
import sys
from pathlib import Path

NOTEBOOKLM_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NOTEBOOKLM_ROOT / "src"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from notebooklm_system.config import load_config
from notebooklm_system.indexing import build_index


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the NotebookLM vector index.")
    parser.add_argument("--config", type=Path, default=NOTEBOOKLM_ROOT / "config.yaml")
    parser.add_argument("--no-recreate", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    summary = build_index(config, recreate=not args.no_recreate)
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
