from __future__ import annotations

import argparse
import json
import sys

import requests


def main() -> None:
    parser = argparse.ArgumentParser(description="Check Ollama availability and model presence.")
    parser.add_argument("--base-url", default="http://localhost:11434")
    parser.add_argument("--model", default="qwen3:4b")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    try:
        response = requests.get(f"{base_url}/api/tags", timeout=20)
        response.raise_for_status()
    except Exception as exc:
        print(f"Ollama is not reachable at {base_url}: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(2)

    payload = response.json()
    models = [item.get("name") or item.get("model") for item in payload.get("models", [])]
    print(json.dumps({"base_url": base_url, "models": models}, ensure_ascii=False, indent=2))
    if args.model not in models:
        print(f"Model {args.model!r} is not installed. Run: ollama pull {args.model}", file=sys.stderr)
        raise SystemExit(3)


if __name__ == "__main__":
    main()
