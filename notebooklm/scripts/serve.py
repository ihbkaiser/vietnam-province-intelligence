from __future__ import annotations

import argparse
import sys
from pathlib import Path

NOTEBOOKLM_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NOTEBOOKLM_ROOT / "src"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from notebooklm_system.interfaces.api import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Simple NotebookLM app.")
    parser.add_argument("--config", type=Path, default=NOTEBOOKLM_ROOT / "config.yaml")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8020)
    args = parser.parse_args()

    import uvicorn

    app = create_app(args.config)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
