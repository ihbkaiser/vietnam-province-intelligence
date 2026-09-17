from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import traceback
from pathlib import Path

os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_FLAX", "0")
os.environ.setdefault("TRANSFORMERS_NO_FLAX", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")


def read_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        raise FileNotFoundError(path)
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_model(model_name: str, attn_impl: str):
    import torch
    from transformers import AutoModel, AutoTokenizer

    if not torch.cuda.is_available():
        torch.Tensor.cuda = lambda self, *args, **kwargs: self  # type: ignore[method-assign]
        torch.nn.Module.cuda = lambda self, *args, **kwargs: self  # type: ignore[method-assign]

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    kwargs: dict[str, object] = {
        "trust_remote_code": True,
        "use_safetensors": True,
        "low_cpu_mem_usage": True,
    }
    if attn_impl:
        kwargs["_attn_implementation"] = attn_impl
    try:
        model = AutoModel.from_pretrained(model_name, **kwargs)
    except TypeError:
        kwargs.pop("_attn_implementation", None)
        kwargs.pop("low_cpu_mem_usage", None)
        model = AutoModel.from_pretrained(model_name, **kwargs)

    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
    if torch.cuda.is_available():
        model = model.eval().cuda().to(dtype)
    else:
        model = model.eval()
        if os.environ.get("DEEPSEEK_CPU_BFLOAT16", "1") == "1":
            model = model.to(torch.bfloat16)
    return tokenizer, model


TEXT_FILE_SUFFIXES = {".md", ".mmd", ".markdown", ".txt"}


def is_meaningful_text(value: object) -> bool:
    text = str(value or "").strip()
    return bool(text) and text.lower() not in {"none", "null", "nan"}


def read_saved_markdown(raw_dir: Path) -> tuple[str, str]:
    candidates = [
        path
        for path in raw_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in TEXT_FILE_SUFFIXES
    ]
    candidates.sort(key=lambda path: (path.stat().st_mtime, path.stat().st_size), reverse=True)
    for path in candidates:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore").strip()
        except OSError:
            continue
        if is_meaningful_text(text):
            return text, f"saved:{path.name}"
    return "", "empty"


def result_to_markdown(result: object, raw_dir: Path) -> tuple[str, str]:
    if isinstance(result, str) and is_meaningful_text(result):
        return result, "return:string"
    if isinstance(result, dict):
        text = result.get("text") or result.get("markdown") or result.get("content")
        if is_meaningful_text(text):
            return str(text), "return:dict"
        fallback = json.dumps(result, ensure_ascii=False)
        if is_meaningful_text(fallback) and fallback != "{}":
            return fallback, "return:dict-json"

    saved_text, saved_source = read_saved_markdown(raw_dir)
    if saved_text:
        return saved_text, saved_source
    if result is not None and is_meaningful_text(result):
        return str(result), "return:other"
    return "", "empty"


def infer_page(
    model,
    tokenizer,
    image_file: str,
    prompt: str,
    out_dir: Path,
    base_size: int,
    image_size: int,
    crop_mode: bool,
    test_compress: bool,
    save_results: bool,
) -> tuple[str, str]:
    infer_kwargs: dict[str, object] = {
        "prompt": prompt,
        "image_file": image_file,
        "output_path": str(out_dir),
        "base_size": base_size,
        "image_size": image_size,
        "crop_mode": crop_mode,
        "test_compress": test_compress,
    }
    try:
        # DeepSeek-OCR can return None while saving Markdown files to output_path.
        result = model.infer(tokenizer, save_results=save_results, **infer_kwargs)
    except TypeError:
        result = model.infer(tokenizer, **infer_kwargs)
    return result_to_markdown(result, out_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run DeepSeek-OCR on rendered textbook page images.")
    parser.add_argument("--manifest", type=Path, required=True, help="JSONL records with page_number and path.")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for page_XXX.json files.")
    parser.add_argument("--model", default="deepseek-ai/DeepSeek-OCR")
    parser.add_argument("--prompt", default="<image>\n<|grounding|>Convert the document to markdown.")
    parser.add_argument("--attn-impl", default="sdpa")
    parser.add_argument("--base-size", type=int, default=1024)
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--crop-mode", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--test-compress", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--save-results", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    tokenizer, model = load_model(args.model, args.attn_impl)
    records = read_jsonl(args.manifest)

    for record in records:
        page_no = int(record["page_number"])
        image_file = str(record["path"])
        record_type = str(record.get("record_type") or "page")
        record_id = str(record.get("record_id") or f"page_{page_no:03d}")
        result_name = str(record.get("result_name") or f"{record_id}.json")
        result_path = args.out / result_name
        if result_path.exists() and not args.force:
            continue
        raw_dir = args.out / f"raw_{record_id}"
        if raw_dir.exists() and args.force:
            shutil.rmtree(raw_dir, ignore_errors=True)
        raw_dir.mkdir(parents=True, exist_ok=True)

        try:
            markdown, markdown_source = infer_page(
                model,
                tokenizer,
                image_file=image_file,
                prompt=args.prompt,
                out_dir=raw_dir,
                base_size=args.base_size,
                image_size=args.image_size,
                crop_mode=args.crop_mode,
                test_compress=args.test_compress,
                save_results=args.save_results,
            )
            payload: dict[str, object] = {
                "record_id": record_id,
                "record_type": record_type,
                "page_number": page_no,
                "page_image_path": image_file,
                "markdown": markdown,
                "markdown_source": markdown_source,
                "raw_output_dir": str(raw_dir),
                "engine": "deepseek-ocr",
            }
            for key in ["block_id", "bbox", "category_type", "layout_type", "order", "det_index"]:
                if key in record:
                    payload[key] = record.get(key)
            if not is_meaningful_text(markdown):
                payload["error"] = "DeepSeek returned no markdown text. Check raw_output_dir."
        except Exception as exc:
            payload = {
                "record_id": record_id,
                "record_type": record_type,
                "page_number": page_no,
                "page_image_path": image_file,
                "markdown": "",
                "engine": "deepseek-ocr",
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        write_json(result_path, payload)
        print(f"{record_type} {record_id}: {result_path}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
