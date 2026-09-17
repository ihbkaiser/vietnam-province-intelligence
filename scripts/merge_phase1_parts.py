from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PAGE_HEADING_RE = re.compile(r"(?m)^## PDF Page\s+(\d+)\s*$")
IMAGE_LINK_RE = re.compile(r"!\[(.*?)\]\((.*?)\)")


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in records) + ("\n" if records else ""),
        encoding="utf-8",
    )


def split_page_sections(markdown: str) -> tuple[str, list[dict[str, Any]]]:
    matches = list(PAGE_HEADING_RE.finditer(markdown))
    if not matches:
        return markdown.strip(), []
    preamble = markdown[: matches[0].start()].rstrip()
    sections: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections.append({"page_number": int(match.group(1)), "text": markdown[match.start() : end].strip()})
    return preamble, sections


def page_sort_key(part_dir: Path) -> tuple[int, str]:
    summary = read_json(part_dir / "metadata" / "book.json", {})
    page_range = summary.get("page_range") if isinstance(summary, dict) else {}
    start = page_range.get("start") if isinstance(page_range, dict) else None
    if isinstance(start, int):
        return start, part_dir.name
    book_md = part_dir / "book.md"
    if book_md.exists():
        _, sections = split_page_sections(book_md.read_text(encoding="utf-8"))
        if sections:
            return int(sections[0]["page_number"]), part_dir.name
    return 10**9, part_dir.name


def discover_part_dirs(inputs: list[Path], work_dir: Path) -> list[Path]:
    part_dirs: list[Path] = []
    extract_dir = work_dir / "_extracted_parts"
    for input_path in inputs:
        if input_path.is_file() and input_path.suffix.lower() == ".zip":
            target = extract_dir / input_path.stem
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(input_path) as archive:
                archive.extractall(target)
            candidates = [path for path in target.rglob("book.md") if path.is_file()]
            part_dirs.extend(path.parent for path in candidates)
        elif input_path.is_dir():
            if (input_path / "book.md").exists():
                part_dirs.append(input_path)
            else:
                part_dirs.extend(path.parent for path in input_path.rglob("book.md"))
        else:
            raise FileNotFoundError(input_path)
    unique = sorted(set(part_dirs), key=page_sort_key)
    return unique


def copy_with_collision(src: Path, dst_root: Path, rel: str, prefix: str, path_map: dict[str, str]) -> str:
    if not rel:
        return rel
    if rel in path_map:
        return path_map[rel]
    src_path = src / rel
    if not src_path.exists() or not src_path.is_file():
        return rel
    dst_path = dst_root / rel
    if dst_path.exists():
        try:
            if src_path.read_bytes() == dst_path.read_bytes():
                path_map[rel] = rel
                return rel
        except OSError:
            pass
        dst_path = dst_root / Path(rel).parent / f"{prefix}_{Path(rel).name}"
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_path, dst_path)
    new_rel = dst_path.relative_to(dst_root).as_posix()
    path_map[rel] = new_rel
    return new_rel


def copy_asset_dirs(part_dir: Path, out_dir: Path, prefix: str, path_map: dict[str, str]) -> None:
    for folder in ["images", "caption_crops", "text_crops"]:
        src_dir = part_dir / folder
        if not src_dir.exists():
            continue
        for file_path in sorted(src_dir.rglob("*")):
            if file_path.is_file():
                rel = file_path.relative_to(part_dir).as_posix()
                copy_with_collision(part_dir, out_dir, rel, prefix, path_map)

    contact = part_dir / "_previews" / "images_contact.jpg"
    if contact.exists():
        dst = out_dir / "_previews" / "parts" / f"{prefix}_images_contact.jpg"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(contact, dst)


def rewrite_markdown_paths(text: str, path_map: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        alt, rel = match.group(1), match.group(2)
        return f"![{alt}]({path_map.get(rel, rel)})"

    return IMAGE_LINK_RE.sub(replace, text)


def rewrite_object_paths(value: Any, path_map: dict[str, str]) -> Any:
    if isinstance(value, dict):
        rewritten: dict[str, Any] = {}
        for key, item in value.items():
            if key in {"path", "caption_crop_path", "text_crop_path", "page_image_path"} and isinstance(item, str):
                rewritten[key] = path_map.get(item, item)
            else:
                rewritten[key] = rewrite_object_paths(item, path_map)
        return rewritten
    if isinstance(value, list):
        return [rewrite_object_paths(item, path_map) for item in value]
    return value


def merge_markdown_file(part_dirs: list[Path], filename: str, out_dir: Path) -> None:
    preamble = ""
    sections: list[dict[str, Any]] = []
    for part_dir in part_dirs:
        path = part_dir / filename
        if not path.exists():
            continue
        part_preamble, part_sections = split_page_sections(path.read_text(encoding="utf-8"))
        if not preamble and part_preamble:
            preamble = part_preamble
        sections.extend(part_sections)
    if not sections:
        return
    sections = sorted(sections, key=lambda section: int(section["page_number"]))
    merged = (preamble.strip() + "\n\n" if preamble.strip() else "") + "\n\n".join(section["text"] for section in sections)
    (out_dir / filename).write_text(merged.strip() + "\n", encoding="utf-8")


def merge_parts(part_dirs: list[Path], out_dir: Path, make_zip: bool) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    merged_images: list[dict[str, Any]] = []
    merged_blocks: list[dict[str, Any]] = []
    merged_rag: list[dict[str, Any]] = []
    merged_text_ocr_manifest: list[dict[str, Any]] = []
    part_reports: list[dict[str, Any]] = []
    path_maps_by_part: dict[Path, dict[str, str]] = {}

    for index, part_dir in enumerate(part_dirs, start=1):
        prefix = f"part{index:03d}_{part_dir.name}"
        path_map: dict[str, str] = {}
        copy_asset_dirs(part_dir, out_dir, prefix, path_map)
        path_maps_by_part[part_dir] = path_map

        images = rewrite_object_paths(read_json(part_dir / "metadata" / "images.json", []), path_map)
        if isinstance(images, list):
            merged_images.extend(images)

        blocks = [rewrite_object_paths(record, path_map) for record in read_jsonl(part_dir / "metadata" / "blocks.jsonl")]
        merged_blocks.extend(blocks)

        text_manifest = [
            rewrite_object_paths(record, path_map)
            for record in read_jsonl(part_dir / "metadata" / "text_ocr_manifest.jsonl")
        ]
        merged_text_ocr_manifest.extend(text_manifest)

        rag_records = [rewrite_object_paths(record, path_map) for record in read_jsonl(part_dir / "rag_chunks.jsonl")]
        merged_rag.extend(rag_records)

        pages_dir = part_dir / "metadata" / "pages"
        if pages_dir.exists():
            for page_path in sorted(pages_dir.glob("page_*.json")):
                payload = rewrite_object_paths(read_json(page_path, {}), path_map)
                page_no = int(payload.get("page_number") or re.sub(r"\D+", "", page_path.stem) or 0)
                write_json(out_dir / "metadata" / "pages" / f"page_{page_no:03d}.json", payload)

        quality = read_json(part_dir / "metadata" / "quality_report.json", None)
        if quality:
            quality["part_dir"] = part_dir.as_posix()
            part_reports.append(quality)

    for filename in ["book.md", "book_raw_ocr.md", "book_corrected.md"]:
        merge_markdown_file(part_dirs, filename, out_dir)
        if (out_dir / filename).exists():
            text = (out_dir / filename).read_text(encoding="utf-8")
            for part_dir in part_dirs:
                text = rewrite_markdown_paths(text, path_maps_by_part[part_dir])
            (out_dir / filename).write_text(text, encoding="utf-8")

    merged_rag = sorted(merged_rag, key=lambda record: (int(record.get("page_number") or 0), str(record.get("chunk_id") or "")))
    merged_blocks = sorted(merged_blocks, key=lambda record: (int(record.get("page_number") or record.get("page") or 0), int(record.get("order") or 0)))
    merged_images = sorted(merged_images, key=lambda record: (int(record.get("page_number") or record.get("page") or 0), str(record.get("id") or "")))

    write_json(out_dir / "metadata" / "images.json", merged_images)
    write_jsonl(out_dir / "metadata" / "blocks.jsonl", merged_blocks)
    write_jsonl(out_dir / "metadata" / "text_ocr_manifest.jsonl", merged_text_ocr_manifest)
    write_jsonl(out_dir / "rag_chunks.jsonl", merged_rag)
    write_json(out_dir / "metadata" / "quality_report_parts.json", part_reports)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "parts": [part.as_posix() for part in part_dirs],
        "pages": sorted({int(record.get("page_number") or record.get("page") or 0) for record in merged_blocks if record.get("page_number") or record.get("page")}),
        "stats": {
            "parts": len(part_dirs),
            "images": len(merged_images),
            "blocks": len(merged_blocks),
            "text_ocr_blocks": len(merged_text_ocr_manifest),
            "rag_chunks": len(merged_rag),
        },
        "outputs": {
            "markdown": "book.md",
            "raw_markdown": "book_raw_ocr.md",
            "corrected_markdown": "book_corrected.md",
            "rag_chunks": "rag_chunks.jsonl",
            "image_metadata": "metadata/images.json",
            "block_metadata": "metadata/blocks.jsonl",
            "text_ocr_manifest": "metadata/text_ocr_manifest.jsonl",
            "page_metadata_dir": "metadata/pages",
        },
    }
    write_json(out_dir / "metadata" / "book.json", summary)

    if make_zip:
        zip_path = out_dir.with_suffix(".zip")
        if zip_path.exists():
            zip_path.unlink()
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(out_dir.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(out_dir.parent))
        print(f"zip: {zip_path} ({zip_path.stat().st_size:,} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge multiple Phase 1 Kaggle page-range outputs.")
    parser.add_argument("inputs", nargs="+", type=Path, help="Part zip files, part directories, or a directory containing part folders.")
    parser.add_argument("--out", type=Path, default=Path("extracted/class_6_phase1_merged"))
    parser.add_argument("--no-zip", action="store_true")
    args = parser.parse_args()

    part_dirs = discover_part_dirs(args.inputs, args.out.parent / "_phase1_merge_work")
    if not part_dirs:
        raise RuntimeError("No part directories with book.md found.")
    print("parts:")
    for part in part_dirs:
        print(" -", part)
    merge_parts(part_dirs, args.out, make_zip=not args.no_zip)
    print("merged:", args.out)


if __name__ == "__main__":
    main()
