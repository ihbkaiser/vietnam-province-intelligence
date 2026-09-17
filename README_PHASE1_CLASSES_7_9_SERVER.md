# Phase 1 Textbook Extraction Bundle

Bundle này đóng gói pipeline trích xuất SGK theo cùng kỹ thuật đã dùng cho lớp 6 trong `extracted/class_6_phase1_local_cpu_full`, dựa trên quy trình của `Report_Đồ_án_GK_NLP.pdf`.

## Nội dung

- `books/SGK Lịch sử và địa lí 6 CD.pdf`
- `books/SGK_LS_ĐL_7.pdf`
- `books/SGK_LS_ĐL_8.pdf`
- `books/SGK_LS_ĐL_9.pdf`
- `scripts/phase1_server_pipeline.py`
- `scripts/extract_schoolbook.py`
- `scripts/deepseek_ocr_pages.py`
- `scripts/spellcheck_markdown_qwen.py`
- `scripts/setup_phase1_server.sh`
- `scripts/run_phase1_classes_6_9.sh`
- requirements cho GPU/MinerU
- prompt cho Codex trên server

## Chạy nhanh trên server

```bash
unzip phase1_classes_6_9_server_bundle.zip -d phase1_classes_6_9
cd phase1_classes_6_9
bash scripts/setup_phase1_server.sh
CLASSES="7 8 9" GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

Mặc định runner chỉ chạy lớp 7, 8, 9 vì lớp 6 đã có bản local. Nếu muốn chạy lại toàn bộ:

```bash
CLASSES="6 7 8 9" GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

## Test nhỏ trước khi chạy full

```bash
CLASSES="7" START_PAGE=1 END_PAGE=5 SKIP_SPELLCHECK=1 GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

Nếu test pass thì chạy full không đặt `END_PAGE`.

## Output

Mỗi lớp sẽ có thư mục và zip riêng:

- `extracted/class_7_rtx4070`
- `extracted/class_8_rtx4070`
- `extracted/class_9_rtx4070`
- `extracted/class_7_rtx4070.zip`
- `extracted/class_8_rtx4070.zip`
- `extracted/class_9_rtx4070.zip`

Các file quan trọng bên trong mỗi thư mục:

- `book.md`
- `book.docx`
- `rag_chunks.jsonl`
- `metadata.json`
- `quality_report.json`
- `images/`
- `pages/`

## Tùy chọn hữu ích

```bash
# Chỉ chạy lớp 8
CLASSES="8" GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh

# Bỏ spellcheck Qwen để chạy nhanh hơn
CLASSES="7 8 9" SKIP_SPELLCHECK=1 GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh

# Nếu MinerU lỗi, ép layout CV fallback
CLASSES="7" LAYOUT_ENGINE=cv GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh

# Chạy lại từ đầu khi cần
CLASSES="7" FORCE=1 GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

Pipeline sẽ ưu tiên layout engine tự động, DeepSeek-OCR cho trang/ảnh, spellcheck Markdown bằng Qwen, sau đó xuất Markdown, DOCX, chunk RAG và zip.
