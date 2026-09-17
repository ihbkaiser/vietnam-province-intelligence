from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_FLAX", "0")
os.environ.setdefault("TRANSFORMERS_NO_FLAX", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")


IMAGE_TOKEN_RE = re.compile(r"^!\[.*?\]\(.*?\)\s*$")
PLACEHOLDER_RE = re.compile(r"@@IMAGE_LINK_\d{4}@@")
PAGE_HEADING_RE = re.compile(r"(?m)^## PDF Page\s+(\d+)\s*$")


@dataclass
class PageSection:
    page_number: int
    text: str


def split_page_sections(markdown: str) -> tuple[str, list[PageSection]]:
    matches = list(PAGE_HEADING_RE.finditer(markdown))
    if not matches:
        return "", [PageSection(page_number=1, text=markdown)]

    preamble = markdown[: matches[0].start()].rstrip() + "\n\n"
    sections: list[PageSection] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections.append(PageSection(page_number=int(match.group(1)), text=markdown[match.start() : end].strip()))
    return preamble, sections


def protect_markdown_lines(text: str) -> tuple[str, dict[str, str]]:
    placeholders: dict[str, str] = {}
    protected_lines: list[str] = []
    for line in text.splitlines():
        if IMAGE_TOKEN_RE.match(line.strip()):
            token = f"@@IMAGE_LINK_{len(placeholders):04d}@@"
            placeholders[token] = line
            protected_lines.append(token)
        else:
            protected_lines.append(line)
    return "\n".join(protected_lines), placeholders


def restore_markdown_lines(text: str, placeholders: dict[str, str]) -> str:
    for token, original in placeholders.items():
        text = text.replace(token, original)
    return text


def strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:markdown|md|text)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def split_long_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    parts: list[str] = []
    current: list[str] = []
    current_len = 0
    for paragraph in re.split(r"(\n\s*\n)", text):
        if current_len + len(paragraph) > max_chars and current:
            parts.append("".join(current).strip())
            current = []
            current_len = 0
        current.append(paragraph)
        current_len += len(paragraph)
    if current:
        parts.append("".join(current).strip())
    return [part for part in parts if part]


def load_qwen(model_name: str, cpu_threads: int | None = None):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if cpu_threads and cpu_threads > 0:
        torch.set_num_threads(cpu_threads)

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if torch.cuda.is_available():
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        kwargs = {
            "trust_remote_code": True,
            "torch_dtype": dtype,
            "device_map": "auto",
            "low_cpu_mem_usage": True,
        }
    else:
        kwargs = {
            "trust_remote_code": True,
            "torch_dtype": torch.bfloat16,
            "low_cpu_mem_usage": True,
        }
    try:
        model = AutoModelForCausalLM.from_pretrained(model_name, attn_implementation="sdpa", **kwargs)
    except TypeError:
        kwargs.pop("low_cpu_mem_usage", None)
        model = AutoModelForCausalLM.from_pretrained(model_name, **kwargs)
    model.eval()
    return tokenizer, model


def generate_text(tokenizer, model, protected_markdown: str, max_new_tokens: int) -> str:
    import torch

    messages = [
        {
            "role": "system",
            "content": (
                "Bạn là bộ hậu xử lý OCR tiếng Việt cho sách giáo khoa. "
                "Chỉ sửa lỗi OCR, chính tả, dấu tiếng Việt, ký tự rác và lỗi tách từ. "
                "Không thêm kiến thức mới, không diễn giải, không tóm tắt, không đổi số liệu hoặc tên riêng nếu không chắc."
            ),
        },
        {
            "role": "user",
            "content": (
                "Sửa đoạn Markdown OCR dưới đây.\n"
                "Yêu cầu bắt buộc:\n"
                "- Giữ nguyên heading Markdown, số thứ tự câu hỏi, `</break>` và các placeholder dạng @@IMAGE_LINK_0000@@.\n"
                "- Không xóa hoặc thêm ảnh, không đổi đường dẫn ảnh.\n"
                "- Output duy nhất là Markdown đã sửa, không giải thích.\n\n"
                f"```markdown\n{protected_markdown}\n```"
            ),
        },
    ]
    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            do_sample=False,
            max_new_tokens=max_new_tokens,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = outputs[0][inputs["input_ids"].shape[-1] :]
    return strip_code_fence(tokenizer.decode(generated, skip_special_tokens=True))


def correct_section(tokenizer, model, text: str, max_section_chars: int, max_new_tokens: int) -> str:
    corrected_parts: list[str] = []
    for part in split_long_text(text, max_section_chars):
        corrected_parts.append(generate_text(tokenizer, model, part, max_new_tokens))
    return "\n\n".join(corrected_parts).strip()


def validate_corrected_text(original: str, corrected: str) -> list[str]:
    issues: list[str] = []
    original_placeholders = set(PLACEHOLDER_RE.findall(original))
    corrected_placeholders = set(PLACEHOLDER_RE.findall(corrected))
    missing_placeholders = sorted(original_placeholders - corrected_placeholders)
    if missing_placeholders:
        issues.append(f"missing image placeholders: {', '.join(missing_placeholders[:5])}")

    original_len = len(markdown_text_only(original))
    corrected_len = len(markdown_text_only(corrected))
    if original_len > 80 and corrected_len < original_len * 0.55:
        issues.append(f"corrected text too short: {corrected_len}/{original_len} chars")
    if original_len > 80 and corrected_len > original_len * 2.2:
        issues.append(f"corrected text too long: {corrected_len}/{original_len} chars")
    return issues


def worker_main(args: argparse.Namespace) -> None:
    tokenizer, model = load_qwen(args.model, args.cpu_threads)
    out_dir = Path(args.worker_output)
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = Path(args.worker_manifest)
    records = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    for record in records:
        page_number = int(record["page_number"])
        out_path = out_dir / f"page_{page_number:03d}.json"
        if out_path.exists() and not args.force:
            continue
        try:
            corrected = correct_section(
                tokenizer,
                model,
                str(record["protected_text"]),
                args.max_section_chars,
                args.max_new_tokens,
            )
            issues = validate_corrected_text(str(record["protected_text"]), corrected)
            if issues:
                payload = {
                    "page_number": page_number,
                    "corrected_protected_text": record["protected_text"],
                    "error": "; ".join(issues),
                    "fallback_to_raw": True,
                }
            else:
                payload = {"page_number": page_number, "corrected_protected_text": corrected}
        except Exception as exc:
            payload = {"page_number": page_number, "corrected_protected_text": record["protected_text"], "error": str(exc)}
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, records: Iterable[dict[str, object]]) -> None:
    path.write_text("\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n", encoding="utf-8")


def markdown_text_only(section: str) -> str:
    lines: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("!["):
            continue
        if stripped == "</break>":
            continue
        stripped = re.sub(r"^#{1,6}\s*", "", stripped)
        lines.append(stripped)
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def spawn_gpu_workers(
    sections: list[dict[str, object]],
    args: argparse.Namespace,
    work_dir: Path,
    gpu_ids: list[str],
) -> None:
    shard_count = max(1, len(gpu_ids))
    shards: list[list[dict[str, object]]] = [[] for _ in range(shard_count)]
    for index, section in enumerate(sections):
        shards[index % shard_count].append(section)

    processes: list[subprocess.Popen[bytes]] = []
    for shard_index, shard in enumerate(shards):
        manifest_path = work_dir / f"spellcheck_manifest_{shard_index}.jsonl"
        write_jsonl(manifest_path, shard)
        env = os.environ.copy()
        env["USE_TF"] = "0"
        env["TRANSFORMERS_NO_TF"] = "1"
        env["USE_FLAX"] = "0"
        env["TRANSFORMERS_NO_FLAX"] = "1"
        env["TF_CPP_MIN_LOG_LEVEL"] = "3"
        if gpu_ids:
            env["CUDA_VISIBLE_DEVICES"] = gpu_ids[shard_index]
        command = [
            sys.executable,
            str(Path(__file__).resolve()),
            "--worker-manifest",
            str(manifest_path),
            "--worker-output",
            str(args.worker_output),
            "--model",
            args.model,
            "--max-section-chars",
            str(args.max_section_chars),
            "--max-new-tokens",
            str(args.max_new_tokens),
        ]
        if args.force:
            command.append("--force")
        processes.append(subprocess.Popen(command, env=env))

    failed: list[int] = []
    for process in processes:
        exit_code = process.wait()
        if exit_code != 0:
            failed.append(exit_code)
    if failed:
        raise RuntimeError(f"Spellcheck worker failed: {failed}")


def update_metadata(
    metadata_dir: Path,
    corrected_sections: list[PageSection],
    model_name: str,
    chunk_size: int,
    overlap: int,
    rag_output: Path,
) -> None:
    pages_dir = metadata_dir / "pages"
    corrected_by_page = {section.page_number: section.text for section in corrected_sections}
    for page_number, section in corrected_by_page.items():
        page_path = pages_dir / f"page_{page_number:03d}.json"
        if not page_path.exists():
            continue
        payload = json.loads(page_path.read_text(encoding="utf-8"))
        payload["text_corrected"] = markdown_text_only(section)
        payload["spellcheck_engine"] = model_name
        page_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    rag_records: list[dict[str, object]] = []
    image_records_path = metadata_dir / "images.json"
    image_records = json.loads(image_records_path.read_text(encoding="utf-8")) if image_records_path.exists() else []
    images_by_page: dict[int, list[dict[str, object]]] = {}
    for record in image_records:
        page_number = int(record.get("page_number") or record.get("page") or 0)
        images_by_page.setdefault(page_number, []).append(
            {
                "id": record.get("id"),
                "path": record.get("path"),
                "label": record.get("label"),
                "caption": record.get("caption"),
                "type": record.get("type"),
            }
        )

    for section in corrected_sections:
        text = markdown_text_only(section.text)
        for index, chunk in enumerate(chunk_text(text, chunk_size, overlap), start=1):
            rag_records.append(
                {
                    "chunk_id": f"page_{section.page_number:03d}_{index:02d}",
                    "page_number": section.page_number,
                    "text": chunk,
                    "images": images_by_page.get(section.page_number, []),
                    "spellcheck_engine": model_name,
                }
            )
    write_jsonl(rag_output, rag_records)

    book_json_path = metadata_dir / "book.json"
    if book_json_path.exists():
        summary = json.loads(book_json_path.read_text(encoding="utf-8"))
        summary["spellcheck"] = {
            "enabled": True,
            "model": model_name,
            "pages_corrected": len(corrected_sections),
            "rag_chunks_after_spellcheck": len(rag_records),
        }
        book_json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Post-process OCR Markdown with a local Qwen LLM.")
    parser.add_argument("--input", type=Path, help="Input Markdown file.")
    parser.add_argument("--output", type=Path, help="Corrected Markdown output.")
    parser.add_argument("--raw-output", type=Path, default=None, help="Where to keep the raw OCR Markdown.")
    parser.add_argument("--metadata-dir", type=Path, default=None, help="Metadata directory to update.")
    parser.add_argument("--rag-output", type=Path, default=None, help="RAG chunks JSONL output.")
    parser.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
    parser.add_argument("--gpus", default="auto", help="Comma-separated GPU IDs, auto, or none.")
    parser.add_argument("--max-section-chars", type=int, default=4200)
    parser.add_argument("--max-new-tokens", type=int, default=3072)
    parser.add_argument("--cpu-threads", type=int, default=8)
    parser.add_argument("--chunk-size", type=int, default=1800)
    parser.add_argument("--chunk-overlap", type=int, default=200)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--worker-manifest", type=Path, default=None)
    parser.add_argument("--worker-output", type=Path, default=None)
    args = parser.parse_args()

    if args.worker_manifest:
        worker_main(args)
        return

    if not args.input or not args.output:
        raise ValueError("--input and --output are required outside worker mode.")

    raw_markdown = args.input.read_text(encoding="utf-8")
    if args.raw_output and not args.raw_output.exists():
        args.raw_output.write_text(raw_markdown, encoding="utf-8")

    preamble, page_sections = split_page_sections(raw_markdown)
    protected_records: list[dict[str, object]] = []
    placeholder_map: dict[int, dict[str, str]] = {}
    for section in page_sections:
        protected_text, placeholders = protect_markdown_lines(section.text)
        placeholder_map[section.page_number] = placeholders
        protected_records.append({"page_number": section.page_number, "protected_text": protected_text})

    work_dir = args.output.parent / "_spellcheck_qwen"
    worker_output = work_dir / "pages"
    worker_output.mkdir(parents=True, exist_ok=True)
    args.worker_output = worker_output

    if args.gpus == "none":
        gpu_ids: list[str] = []
    elif args.gpus == "auto":
        try:
            import torch

            gpu_ids = [str(index) for index in range(torch.cuda.device_count())]
        except Exception:
            gpu_ids = []
    else:
        gpu_ids = [value.strip() for value in args.gpus.split(",") if value.strip()]

    if gpu_ids:
        spawn_gpu_workers(protected_records, args, work_dir, gpu_ids)
    else:
        manifest_path = work_dir / "spellcheck_manifest_cpu.jsonl"
        write_jsonl(manifest_path, protected_records)
        args.worker_manifest = manifest_path
        args.worker_output = worker_output
        worker_main(args)

    corrected_sections: list[PageSection] = []
    page_errors: list[dict[str, object]] = []
    for section in page_sections:
        corrected_path = worker_output / f"page_{section.page_number:03d}.json"
        if corrected_path.exists():
            payload = json.loads(corrected_path.read_text(encoding="utf-8"))
            corrected_protected = str(payload.get("corrected_protected_text") or section.text)
            if payload.get("error"):
                page_errors.append(
                    {
                        "page_number": section.page_number,
                        "error": payload.get("error"),
                        "fallback_to_raw": bool(payload.get("fallback_to_raw")),
                    }
                )
        else:
            corrected_protected = section.text
        corrected = restore_markdown_lines(corrected_protected, placeholder_map[section.page_number])
        corrected_sections.append(PageSection(page_number=section.page_number, text=corrected))

    corrected_markdown = preamble + "\n\n".join(section.text.strip() for section in corrected_sections).strip() + "\n"
    args.output.write_text(corrected_markdown, encoding="utf-8")

    if args.metadata_dir and args.rag_output:
        update_metadata(args.metadata_dir, corrected_sections, args.model, args.chunk_size, args.chunk_overlap, args.rag_output)
        report = {
            "enabled": True,
            "model": args.model,
            "pages_total": len(page_sections),
            "pages_corrected": len(corrected_sections),
            "page_error_count": len(page_errors),
            "page_errors": page_errors,
        }
        (args.metadata_dir / "spellcheck_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Spellcheck done: {args.output}")
    print(f"Pages corrected: {len(corrected_sections)}")
    print(f"Page errors/fallbacks: {len(page_errors)}")


if __name__ == "__main__":
    main()
