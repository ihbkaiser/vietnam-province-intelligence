from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_FLAX", "0")
os.environ.setdefault("TRANSFORMERS_NO_FLAX", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")


TEXT_FILE_SUFFIXES = {".md", ".mmd", ".markdown", ".txt"}
IMAGE_LINK_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


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
        text = path.read_text(encoding="utf-8", errors="ignore").strip()
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


def normalize_markdown_images(markdown: str, raw_dir: Path, out_dir: Path, page_number: int) -> tuple[str, list[dict[str, str]]]:
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    image_records: list[dict[str, str]] = []

    def replace_link(match: re.Match[str]) -> str:
        alt_text = match.group(1)
        rel_path = match.group(2).strip()
        if rel_path.startswith(("http://", "https://", "#")):
            return match.group(0)

        src = raw_dir / rel_path
        if not src.exists():
            matches = list(raw_dir.rglob(Path(rel_path).name))
            src = matches[0] if matches else src
        if not src.exists():
            return match.group(0)

        image_index = len(image_records)
        suffix = src.suffix.lower() or ".jpg"
        dst = images_dir / f"page_{page_number:03d}_{image_index:03d}{suffix}"
        shutil.copy2(src, dst)
        normalized_rel = dst.relative_to(out_dir).as_posix()
        image_records.append(
            {
                "id": f"page_{page_number:03d}_image_{image_index:03d}",
                "source": src.relative_to(out_dir).as_posix() if src.is_relative_to(out_dir) else str(src),
                "path": normalized_rel,
                "alt": alt_text,
            }
        )
        return f"![{alt_text}]({normalized_rel})"

    return IMAGE_LINK_RE.sub(replace_link, markdown), image_records


def render_page(pdf_path: Path, page_number: int, output_dir: Path, scale: float) -> Path:
    import fitz

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"page_{page_number:03d}.jpg"
    doc = fitz.open(str(pdf_path))
    page = doc[page_number - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    pix.save(str(out_path))
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark DeepSeek-OCR CPU inference for one PDF page.")
    parser.add_argument("--pdf", type=Path, default=Path("books/SGK Lịch sử và địa lí 6 CD.pdf"))
    parser.add_argument("--page", type=int, default=6)
    parser.add_argument("--out", type=Path, default=Path("extracted/deepseek_cpu_benchmark"))
    parser.add_argument("--model", default="deepseek-ai/DeepSeek-OCR")
    parser.add_argument("--render-scale", type=float, default=2.0)
    parser.add_argument("--base-size", type=int, default=1024)
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--num-threads", type=int, default=os.cpu_count() or 2)
    parser.add_argument("--model-dtype", choices=["float32", "bfloat16"], default="bfloat16")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    timings: dict[str, float] = {}

    t0 = time.perf_counter()
    page_image = render_page(args.pdf, args.page, args.out / "pages", args.render_scale)
    timings["render_seconds"] = time.perf_counter() - t0

    import torch
    from transformers import AutoModel, AutoTokenizer

    torch.set_num_threads(max(1, args.num_threads))
    if not torch.cuda.is_available():
        # DeepSeek-OCR remote code hard-calls `.cuda()` inside infer().
        # For a CPU-only benchmark we turn those calls into no-ops.
        torch.Tensor.cuda = lambda self, *cuda_args, **cuda_kwargs: self  # type: ignore[method-assign]
        torch.nn.Module.cuda = lambda self, *cuda_args, **cuda_kwargs: self  # type: ignore[method-assign]
    print("torch =", torch.__version__)
    print("cuda available =", torch.cuda.is_available())
    print("cpu threads =", torch.get_num_threads())
    print("page image =", page_image)

    t0 = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    model = AutoModel.from_pretrained(
        args.model,
        trust_remote_code=True,
        use_safetensors=True,
        low_cpu_mem_usage=True,
        _attn_implementation="eager",
    ).eval()
    if not torch.cuda.is_available() and args.model_dtype == "bfloat16":
        model = model.to(torch.bfloat16)
    timings["model_load_seconds"] = time.perf_counter() - t0

    raw_dir = args.out / f"raw_page_{args.page:03d}"
    raw_dir.mkdir(parents=True, exist_ok=True)
    prompt = (
        "<image>\n<|grounding|>Convert the textbook page to clean Vietnamese markdown. "
        "Preserve headings, numbered tasks, captions, and table text. Do not invent missing text."
    )

    t0 = time.perf_counter()
    try:
        result = model.infer(
            tokenizer,
            prompt=prompt,
            image_file=str(page_image),
            output_path=str(raw_dir),
            base_size=args.base_size,
            image_size=args.image_size,
            crop_mode=True,
            save_results=True,
            test_compress=True,
        )
    except TypeError:
        result = model.infer(
            tokenizer,
            prompt=prompt,
            image_file=str(page_image),
            output_path=str(raw_dir),
            base_size=args.base_size,
            image_size=args.image_size,
            crop_mode=True,
            test_compress=True,
        )
    timings["infer_seconds"] = time.perf_counter() - t0

    markdown, source = result_to_markdown(result, raw_dir)
    markdown, image_records = normalize_markdown_images(markdown, raw_dir, args.out, args.page)
    output = {
        "pdf": str(args.pdf),
        "page": args.page,
        "model": args.model,
        "device": "cpu",
        "num_threads": torch.get_num_threads(),
        "model_dtype": args.model_dtype,
        "page_image": str(page_image),
        "markdown_source": source,
        "markdown_chars": len(markdown),
        "image_links_normalized": len(image_records),
        "timings": timings,
    }
    (args.out / "page.md").write_text(markdown + ("\n" if markdown else ""), encoding="utf-8")
    (args.out / "images.json").write_text(json.dumps(image_records, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.out / "benchmark.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
