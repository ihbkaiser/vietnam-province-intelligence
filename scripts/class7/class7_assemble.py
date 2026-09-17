"""
class7_assemble.py — Assembly script for agent-based class 7 OCR pipeline.

Reads agent-produced per-page vision JSON files from _vision_pages/ and
mirrors the class 6 output structure exactly:

  extracted/class_7_agent_full/
    _vision_pages/          ← agent per-page JSON + raw markdown
    _manifests/pages.jsonl  ← rendered page manifest
    _previews/              ← contact sheets
    images/                 ← cropped figure images (page_XXX_deepseek_NNN_4.jpg)
    metadata/
      book.json
      pages/page_001.json …
      images.json
      blocks.jsonl
      spellcheck_report.json
    pages/                  ← rendered page images (PNG copies)
    book.md
    book_raw_ocr.md
    book_corrected.md       ← after spellcheck (initially = book.md)
    rag_chunks.jsonl
    book.docx

Agent per-page JSON contract (written by the agent OCR workers):

  _vision_pages/page_001.json:
  {
    "record_id": "page_001",
    "record_type": "page",
    "page_number": 1,
    "page_image_path": "...\\pages\\page_001.jpg",
    "markdown": "# Lịch sử và Địa lí\n\n![hình 1.1](bbox://page_001_deepseek_000_4)\n\nNội dung...",
    "images": [
      {"id": "page_001_deepseek_000_4", "label": "hình 1.1",
       "caption": "", "bbox": [0.02, 0.10, 0.80, 0.35]},
      ...
    ],
    "markdown_source": "agent-vision",
    "engine": "deepseek-v4-flash"
  }

  - `bbox` is in NORMALIZED page coordinates [x0, y0, x1, y1], each 0..1,
    relative to the full rendered page. The script multiplies by the
    rendered image dimensions to crop.
  - The markdown references each figure as `![alt](bbox://<id>)`. The script
    replaces that with the real relative path `images/<id>.jpg`.

Usage:
  python scripts/class7/class7_assemble.py [options]

Options:
  --vision-dir   agent JSON dir        (default extracted/class_7_agent_full/_vision_pages)
  --render-dir   rendered 2.4 pages    (default _render_class7_2.4)
  --out-dir      output                (default extracted/class_7_agent_full)
  --pdf-name     PDF stem              (default SGK_LS_ĐL_7)
  --chunk-size   default 1800
  --chunk-overlap default 200
  --no-docx      skip book.docx
  --update-spellcheck  rebuild metadata/rag after book_corrected.md is fixed
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parents[2]
IMAGE_LINK_RE = re.compile(r"^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$", flags=re.MULTILINE)
BBOX_LINK_RE = re.compile(r"^!\[([^\]]*)\]\(bbox://([^)]+)\)\s*$")

# ── helpers ──────────────────────────────────────────────────────────────────

def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, records: Iterable[dict[str, object]]) -> None:
    rows = [json.dumps(record, ensure_ascii=False) for record in records]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(rows) + ("\n" if rows else ""), encoding="utf-8")


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return without_marks.replace("đ", "d").replace("Đ", "D")


def normalize_text(value: str) -> str:
    value = strip_accents(value).lower()
    value = value.replace(",", ".").replace(":", ".")
    return re.sub(r"\s+", " ", value).strip()


def figure_key(text: str) -> str | None:
    match = re.search(r"h(?:ì|i)nh\s+(\d{1,2})\s*[\.,]\s*(\d{1,2})", text, flags=re.IGNORECASE)
    if not match:
        match = re.search(r"hinh\s+(\d{1,2})\s*[\.,]\s*(\d{1,2})", normalize_text(text))
    if not match:
        return None
    return f"{int(match.group(1))}_{int(match.group(2))}"


def markdown_text_only(text: str) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("![") or stripped == "</break>":
            continue
        stripped = re.sub(r"^#{1,6}\s*", "", stripped)
        if re.fullmatch(r"PDF Page\s+\d+", stripped, flags=re.IGNORECASE):
            continue
        lines.append(stripped)
    cleaned = re.sub(r"\s+", " ", " ".join(lines)).strip()
    return "" if cleaned.lower() in {"none", "null", "nan"} else cleaned


def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        if end < len(text):
            punct = max(text.rfind(".", start, end), text.rfind("?", start, end), text.rfind("!", start, end))
            if punct > start + chunk_size * 0.55:
                end = punct + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return [chunk for chunk in chunks if chunk]


def clamp_bbox(bbox: list[float]) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = (float(v) for v in bbox)
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)
    return int(round(x0 * 10000)), int(round(y0 * 10000)), int(round(x1 * 10000)), int(round(y1 * 10000))


# ── cropping ─────────────────────────────────────────────────────────────────

def crop_figures(args: argparse.Namespace, out_dir: Path, agent_pages: dict[int, dict]) -> int:
    """Crop each bbox from the rendered page PNG into images/<id>.jpg.

    Returns number of cropped images.
    """
    render_dir = ROOT_DIR / args.render_dir
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    try:
        from PIL import Image
    except ImportError:
        print("PIL not available; cannot crop figures.")
        return 0

    cropped = 0
    for pn in sorted(agent_pages):
        ap = agent_pages[pn]
        for img in ap.get("images") or []:
            img_id = img.get("id") or ""
            if not img_id:
                continue
            bbox = img.get("bbox")
            if not bbox or len(bbox) != 4:
                print(f"  WARN page {pn}: image {img_id} missing valid bbox")
                continue
            src = render_dir / f"page_{pn:03d}.png"
            if not src.exists():
                print(f"  WARN page {pn}: rendered page missing {src}")
                continue
            x0, y0, x1, y1 = clamp_bbox(bbox)
            with Image.open(src) as im:
                w, h = im.size
                # normalized bbox (0..1) -> pixel crop, clamp to image
                px0 = max(0, min(w, int(round(x0 / 10000 * w))))
                py0 = max(0, min(h, int(round(y0 / 10000 * h))))
                px1 = max(0, min(w, int(round(x1 / 10000 * w))))
                py1 = max(0, min(h, int(round(y1 / 10000 * h))))
                if px1 - px0 < 4 or py1 - py0 < 4:
                    print(f"  WARN page {pn}: bbox too small for {img_id}")
                    continue
                crop = im.crop((px0, py0, px1, py1))
                dst = images_dir / f"{img_id}.jpg"
                crop.convert("RGB").save(dst, quality=92)
                cropped += 1
    return cropped


# ── markdown / blocks ────────────────────────────────────────────────────────

def normalize_markdown(markdown: str, images: list[dict], out_dir: Path) -> str:
    """Replace `![alt](bbox://<id>)` links with real relative image paths."""
    img_by_id = {img.get("id"): img for img in images}

    def replace(match: re.Match) -> str:
        alt = match.group(1)
        img_id = match.group(2).strip()
        if img_id.startswith("bbox://"):
            img_id = img_id[len("bbox://"):]
        if img_id not in img_by_id:
            print(f"  WARN: bbox link references unknown image id {img_id}")
            return f"![{alt}](bbox://{img_id})"
        return f"![{alt}](images/{img_id}.jpg)"

    return IMAGE_LINK_RE.sub(replace, markdown)


def markdown_to_blocks(markdown: str, page_no: int, images: list[dict]) -> list[dict]:
    """Convert normalized markdown to block records mirroring class 6."""
    blocks: list[dict] = []
    order = 0
    img_by_id = {img.get("id"): img for img in images}

    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = IMAGE_LINK_RE.match(stripped)
        if match:
            path = match.group(2).strip()
            img_id = Path(path).stem if not path.startswith("bbox://") else path.replace("bbox://", "")
            label = match.group(1) or img_id
            img = img_by_id.get(img_id, {})
            blocks.append({
                "type": "image",
                "id": img_id,
                "label": label,
                "caption": str(img.get("caption") or ""),
                "order": order,
                "page": page_no,
                "path": path,
                "source": "agent-vision",
            })
            order += 1
            continue
        block_type = "caption" if figure_key(stripped) else "text"
        blocks.append({
            "type": block_type,
            "order": order,
            "text": stripped,
            "page": page_no,
            "source": "agent-vision",
        })
        order += 1
    return blocks


# ── assembly ─────────────────────────────────────────────────────────────────

def assemble(args: argparse.Namespace) -> None:
    out_dir = ROOT_DIR / args.out_dir
    vision_dir = ROOT_DIR / args.vision_dir
    render_dir = ROOT_DIR / args.render_dir
    pdf_name = args.pdf_name

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "images").mkdir(parents=True, exist_ok=True)
    (out_dir / "pages").mkdir(parents=True, exist_ok=True)
    (out_dir / "metadata").mkdir(parents=True, exist_ok=True)
    (out_dir / "metadata" / "pages").mkdir(parents=True, exist_ok=True)

    # ── 1. Load agent per-page JSON ──────────────────────────────────────────
    vision_files = sorted(vision_dir.glob("page_*.json"))
    if not vision_files:
        print(f"ERROR: No page_*.json found in {vision_dir}")
        sys.exit(1)

    agent_pages: dict[int, dict] = {}
    for vf in vision_files:
        payload = json.loads(vf.read_text(encoding="utf-8"))
        pn = int(payload.get("page_number", 0))
        if pn > 0:
            agent_pages[pn] = payload

    page_numbers = sorted(agent_pages.keys())
    if not page_numbers:
        print("ERROR: No valid page records found.")
        sys.exit(1)

    print(f"Loaded {len(page_numbers)} agent page records: page {page_numbers[0]} → {page_numbers[-1]}")

    # ── 2. Copy rendered page images → pages/ ────────────────────────────────
    pages_copied = 0
    for pn in page_numbers:
        src = render_dir / f"page_{pn:03d}.png"
        if not src.exists():
            print(f"  WARN: rendered page not found: {src}")
            continue
        dst = out_dir / "pages" / f"page_{pn:03d}.png"
        if not dst.exists():
            shutil.copy2(src, dst)
        pages_copied += 1
    print(f"Copied {pages_copied} page images.")

    # ── 3. Crop figures from bboxes ──────────────────────────────────────────
    cropped = crop_figures(args, out_dir, agent_pages)
    print(f"Cropped {cropped} figure images.")

    # ── 4. Build outputs ─────────────────────────────────────────────────────
    book_lines = [
        f"# {pdf_name}",
        "",
        f"> Source PDF: `books/{pdf_name}.pdf`",
        f"> Generated at: `{datetime.now(timezone.utc).isoformat()}`",
        f"> OCR engine: `agent-vision`",
        f"> Model: `deepseek-v4-flash`",
        "",
    ]
    page_records: list[dict] = []
    block_records: list[dict] = []
    rag_records: list[dict] = []

    for pn in page_numbers:
        ap = agent_pages[pn]
        page_md = str(ap.get("markdown") or "").strip()
        if not page_md:
            page_md = f"[OCR missing for PDF page {pn}]"

        images = ap.get("images") or []
        page_md = normalize_markdown(page_md, images, out_dir)
        blocks = markdown_to_blocks(page_md, pn, images)

        book_lines.extend([f"## PDF Page {pn}", "", page_md, "", "</break>", ""])

        page_text = markdown_text_only(page_md)

        page_record = {
            "source_pdf": f"books/{pdf_name}.pdf",
            "page_number": pn,
            "page_image_path": f"pages/page_{pn:03d}.png",
            "text": page_text,
            "text_blocks": blocks,
            "ocr_engine": "agent-vision",
            "ocr_error": None,
        }
        page_records.append(page_record)
        write_json(out_dir / "metadata" / "pages" / f"page_{pn:03d}.json", page_record)

        for block in blocks:
            block_record = dict(block)
            block_record["page_number"] = pn
            block_records.append(block_record)

        images_for_page = [
            {k: block.get(k) for k in ("id", "path", "caption", "label", "type")}
            for block in blocks
            if block.get("type") in {"image", "table"}
        ]

        for index, chunk in enumerate(chunk_text(page_text, args.chunk_size, args.chunk_overlap), start=1):
            rag_records.append({
                "chunk_id": f"page_{pn:03d}_{index:02d}",
                "source_pdf": f"books/{pdf_name}.pdf",
                "page_number": pn,
                "text": f"PDF Page {pn} {chunk}",
                "images": images_for_page,
            })

    # ── 5. Write output files ────────────────────────────────────────────────
    book_text = "\n".join(book_lines).strip() + "\n"
    (out_dir / "book.md").write_text(book_text, encoding="utf-8")
    (out_dir / "book_raw_ocr.md").write_text(book_text, encoding="utf-8")
    (out_dir / "book_corrected.md").write_text(book_text, encoding="utf-8")

    write_jsonl(out_dir / "metadata" / "blocks.jsonl", block_records)

    image_records = [r for r in block_records if r.get("type") in {"image", "table"}]
    write_json(out_dir / "metadata" / "images.json", image_records)

    write_jsonl(out_dir / "rag_chunks.jsonl", rag_records)

    # page manifest
    manifest_records = [{"page_number": pn, "path": str((out_dir / "pages" / f"page_{pn:03d}.png").resolve())} for pn in page_numbers]
    write_jsonl(out_dir / "_manifests" / "pages.jsonl", manifest_records)

    # book.json summary
    summary = {
        "source_pdf": f"books/{pdf_name}.pdf",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "page_range": {"start": page_numbers[0], "end": page_numbers[-1]},
        "pages_processed": len(page_records),
        "scale": 2.4,
        "ocr_engine": "agent-vision",
        "layout_engine": "none",
        "stats": {
            "blocks": len(block_records),
            "images": len(image_records),
            "rag_chunks": len(rag_records),
        },
        "outputs": {
            "markdown": "book.md",
            "docx": "book.docx",
            "rag_chunks": "rag_chunks.jsonl",
            "page_metadata_dir": "metadata/pages",
            "block_metadata": "metadata/blocks.jsonl",
            "image_metadata": "metadata/images.json",
        },
        "spellcheck": {
            "enabled": True,
            "model": "agent-vision",
            "pages_corrected": 0,
            "rag_chunks_after_spellcheck": len(rag_records),
        },
    }
    write_json(out_dir / "metadata" / "book.json", summary)

    print(f"\nAssembled {len(page_records)} pages, {len(block_records)} blocks, {len(image_records)} images, {len(rag_records)} RAG chunks")
    print(f"book.md: {out_dir / 'book.md'}")
    print(f"rag_chunks.jsonl: {out_dir / 'rag_chunks.jsonl'}")


# ── docx / contact sheet ──────────────────────────────────────────────────────

def write_docx_from_markdown(out_dir: Path) -> bool:
    try:
        from docx import Document
        from docx.shared import Inches
    except ImportError:
        print("python-docx not available; skip DOCX.")
        return False

    book_md = out_dir / "book.md"
    if not book_md.exists():
        return False

    document = Document()
    document.add_heading("Lịch sử và Địa lí 7", level=1)
    for line in book_md.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped == "</break>" or stripped.startswith("> "):
            continue
        if stripped.startswith("# "):
            continue
        if stripped.startswith("## "):
            document.add_heading(stripped[3:].strip(), level=2)
        elif stripped.startswith("### "):
            document.add_heading(stripped[4:].strip(), level=3)
        elif stripped.startswith("!["):
            match = re.search(r"\]\((.*?)\)", stripped)
            if match:
                img_path = out_dir / match.group(1)
                if img_path.exists():
                    try:
                        document.add_picture(str(img_path), width=Inches(5.6))
                    except Exception:
                        document.add_paragraph(str(img_path))
        else:
            document.add_paragraph(stripped)
    document.save(str(out_dir / "book.docx"))
    return True


def write_contact_sheet(out_dir: Path) -> Path | None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None

    images_path = out_dir / "metadata" / "images.json"
    if not images_path.exists():
        return None
    records = [r for r in json.loads(images_path.read_text(encoding="utf-8")) if r.get("path")]
    if not records:
        return None

    preview_dir = out_dir / "_previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    thumb_width, label_height, padding, columns = 260, 42, 12, 3
    max_rows_per_sheet = 80
    max_records_per_sheet = columns * max_rows_per_sheet
    first_path: Path | None = None

    for sheet_index, start in enumerate(range(0, len(records), max_records_per_sheet), start=1):
        batch = records[start: start + max_records_per_sheet]
        rows = math.ceil(len(batch) / columns)
        sheet = Image.new("RGB", (
            columns * thumb_width + (columns + 1) * padding,
            rows * (thumb_width + label_height) + (rows + 1) * padding,
        ), "white")
        draw = ImageDraw.Draw(sheet)

        for idx, record in enumerate(batch):
            img_path = out_dir / str(record["path"])
            if not img_path.exists():
                continue
            with Image.open(img_path).convert("RGB") as img:
                img.thumbnail((thumb_width, thumb_width - label_height), Image.Resampling.LANCZOS)
                col = idx % columns
                row = idx // columns
                x = padding + col * (thumb_width + padding)
                y = padding + row * (thumb_width + label_height + padding)
                sheet.paste(img, (x + (thumb_width - img.width) // 2, y))
                label = f"{record.get('id')} p.{record.get('page_number') or record.get('page')}"
                draw.text((x + 4, y + thumb_width - 12), label, fill=(20, 20, 20))

        out_path = preview_dir / ("images_contact.jpg" if sheet_index == 1 else f"images_contact_{sheet_index:03d}.jpg")
        sheet.save(out_path, quality=88)
        first_path = first_path or out_path

    return first_path


# ── spellcheck metadata update ────────────────────────────────────────────────

def update_after_spellcheck(args: argparse.Namespace) -> None:
    """Rebuild metadata pages + rag_chunks from corrected book.md."""
    out_dir = ROOT_DIR / args.out_dir
    corrected_md = out_dir / "book_corrected.md"
    if not corrected_md.exists():
        print("book_corrected.md not found; cannot update spellcheck metadata.")
        return

    book_md = corrected_md.read_text(encoding="utf-8")
    sections = re.split(r"(?=^## PDF Page \d+)", book_md, flags=re.MULTILINE)
    spellcheck_pages = 0
    rag_records: list[dict] = []

    for section in sections:
        section = section.strip()
        if not section:
            continue
        m = re.match(r"## PDF Page (\d+)", section)
        if not m:
            continue
        pn = int(m.group(1))
        body = re.sub(r"^## PDF Page \d+\s*", "", section)
        body = body.replace("</break>", "").strip()

        text = markdown_text_only(body)
        if not text:
            continue

        page_meta_path = out_dir / "metadata" / "pages" / f"page_{pn:03d}.json"
        if page_meta_path.exists():
            pm = json.loads(page_meta_path.read_text(encoding="utf-8"))
            pm["text_corrected"] = f"PDF Page {pn} {text}"
            pm["spellcheck_engine"] = "agent-vision"
            write_json(page_meta_path, pm)
            spellcheck_pages += 1

        # keep original page images
        page_imgs = []
        for b in pm.get("text_blocks") or []:
            if b.get("type") in {"image", "table"}:
                page_imgs.append({k: b.get(k) for k in ("id", "path", "caption", "label", "type")})

        for index, chunk in enumerate(chunk_text(text, args.chunk_size, args.chunk_overlap), start=1):
            rag_records.append({
                "chunk_id": f"page_{pn:03d}_{index:02d}",
                "source_pdf": f"books/{args.pdf_name}.pdf",
                "page_number": pn,
                "text": f"PDF Page {pn} {chunk}",
                "images": page_imgs,
                "spellcheck_engine": "agent-vision",
            })

    if rag_records:
        write_jsonl(out_dir / "rag_chunks.jsonl", rag_records)

    book_json_path = out_dir / "metadata" / "book.json"
    if book_json_path.exists():
        bj = json.loads(book_json_path.read_text(encoding="utf-8"))
        bj["spellcheck"] = {
            "enabled": True,
            "model": "agent-vision",
            "pages_corrected": spellcheck_pages,
            "rag_chunks_after_spellcheck": len(rag_records),
        }
        bj["stats"]["rag_chunks"] = len(rag_records)
        write_json(book_json_path, bj)

    print(f"Spellcheck metadata updated: {spellcheck_pages} pages, {len(rag_records)} RAG chunks")


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Assemble class 7 agent OCR output into class-6-mirror structure.")
    parser.add_argument("--vision-dir", default="extracted/class_7_agent_full/_vision_pages")
    parser.add_argument("--render-dir", default="_render_class7_2.4")
    parser.add_argument("--out-dir", default="extracted/class_7_agent_full")
    parser.add_argument("--pdf-name", default="SGK_LS_ĐL_7")
    parser.add_argument("--chunk-size", type=int, default=1800)
    parser.add_argument("--chunk-overlap", type=int, default=200)
    parser.add_argument("--docx", action="store_true", default=True, help="Generate book.docx")
    parser.add_argument("--no-docx", action="store_false", dest="docx")
    parser.add_argument("--update-spellcheck", action="store_true",
                        help="Rebuild metadata/rag_chunks from book_corrected.md")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.update_spellcheck:
        update_after_spellcheck(args)
    else:
        assemble(args)
        if args.docx:
            write_docx_from_markdown(ROOT_DIR / args.out_dir)
        write_contact_sheet(ROOT_DIR / args.out_dir)


if __name__ == "__main__":
    main()