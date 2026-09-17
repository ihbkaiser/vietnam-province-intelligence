from __future__ import annotations

import json
import sys
from pathlib import Path

QG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(QG_ROOT / "src"))

from qg_system.pipeline import build_arg_parser, run_generation


def main() -> None:
    args = build_arg_parser().parse_args()
    summary = run_generation(args)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
