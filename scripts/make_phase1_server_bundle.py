from __future__ import annotations

import argparse
import zipfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


DEFAULT_FILES = [
    "books/SGK Lịch sử và địa lí 6 CD.pdf",
    "books/SGK_LS_ĐL_7.pdf",
    "books/SGK_LS_ĐL_8.pdf",
    "books/SGK_LS_ĐL_9.pdf",
    "scripts/extract_schoolbook.py",
    "scripts/deepseek_ocr_pages.py",
    "scripts/phase1_server_pipeline.py",
    "scripts/spellcheck_markdown_qwen.py",
    "scripts/setup_phase1_server.sh",
    "scripts/run_phase1_class6.sh",
    "scripts/run_phase1_classes_6_9.sh",
    "requirements-phase1-gpu.txt",
    "requirements-phase1-mineru.txt",
    "README_PHASE1_SERVER.md",
    "README_PHASE1_CLASSES_7_9_SERVER.md",
    "PROMPT_PHASE1_CLASSES_7_9_CODEX.md",
    "Report_Đồ_án_GK_NLP.pdf",
]

OPTIONAL_FILES = [
    "notebooks/phase1_kaggle_phase1_full.ipynb",
    "notebooks/phase1_kaggle_pdf_extract_kit_deepseek.ipynb",
    "notebooks/phase1_kaggle_pdf_extract_kit_layout.ipynb",
    "notebooks/phase1_kaggle_deepseek_only.ipynb",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a server bundle for phase-1 textbook extraction.")
    parser.add_argument("--out", type=Path, default=ROOT_DIR / "dist" / "phase1_classes_6_9_server_bundle.zip")
    args = parser.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists():
        args.out.unlink()

    with zipfile.ZipFile(args.out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for rel in DEFAULT_FILES:
            path = ROOT_DIR / rel
            if not path.exists():
                raise FileNotFoundError(path)
            archive.write(path, rel)
        for rel in OPTIONAL_FILES:
            path = ROOT_DIR / rel
            if path.exists():
                archive.write(path, rel)

    print(args.out)


if __name__ == "__main__":
    main()
