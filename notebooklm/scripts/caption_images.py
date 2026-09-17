from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tqdm import tqdm

NOTEBOOKLM_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NOTEBOOKLM_ROOT / "src"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from notebooklm_system.config import load_config
from notebooklm_system.vision import invoke_openrouter_vision, textbook_image_prompt


MIN_IMAGE_BYTES = 4_000


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_cache(path: Path) -> dict[str, dict]:
    records: dict[str, dict] = {}
    if not path.exists():
        return records
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        key = str(item.get("id") or item.get("path") or "")
        if key and not item.get("error"):
            records[key] = item
    return records


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def image_records(config, *, start_page: int | None, end_page: int | None) -> list[dict]:
    records = []
    for item in load_json(config.data.image_metadata_path, []):
        page = int(item.get("page_number") or item.get("page") or 0)
        if start_page is not None and page < start_page:
            continue
        if end_page is not None and page > end_page:
            continue
        rel_path = str(item.get("path") or "")
        image_path = config.data.extracted_dir / rel_path
        if not rel_path or not image_path.exists() or image_path.stat().st_size < MIN_IMAGE_BYTES:
            continue
        record = dict(item)
        record["_abs_path"] = str(image_path)
        records.append(record)
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Caption SGK images with an OpenRouter VLM.")
    parser.add_argument("--config", type=Path, default=NOTEBOOKLM_ROOT / "config.yaml")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--model", default=None, help="Override model. Default uses generation.vision_model.")
    parser.add_argument("--batch-model", action="store_true", help="Use generation.vision_batch_model for cheaper offline captioning.")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--start-page", type=int, default=None)
    parser.add_argument("--end-page", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    model = args.model or (config.generation.vision_batch_model if args.batch_model else config.generation.vision_model)
    out_path = args.out or (config.index.output_dir / "image_caption_cache.jsonl")
    cache = read_cache(out_path)
    records = image_records(config, start_page=args.start_page, end_page=args.end_page)
    if args.limit == 0:
        records = []
    elif args.limit > 0:
        records = records[: args.limit]

    done = 0
    errors = 0
    for item in tqdm(records, desc=f"Caption images with {model}"):
        key = str(item.get("id") or item.get("path") or "")
        if key in cache and not args.force:
            continue
        source_hint = " | ".join(str(item.get(field) or "") for field in ["label", "caption", "page_number", "path"])
        try:
            result, used_model = invoke_openrouter_vision(
                image_path=Path(item["_abs_path"]),
                prompt=textbook_image_prompt(source_hint=source_hint),
                config=config.generation,
                model=model,
            )
            append_jsonl(
                out_path,
                {
                    "id": item.get("id"),
                    "path": item.get("path"),
                    "page_number": item.get("page_number") or item.get("page"),
                    "model": used_model,
                    "caption": result,
                },
            )
            done += 1
        except Exception as exc:
            append_jsonl(out_path, {"id": item.get("id"), "path": item.get("path"), "error": str(exc), "model": model})
            errors += 1

    print(json.dumps({"output": str(out_path), "processed": done, "errors": errors, "model": model}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
