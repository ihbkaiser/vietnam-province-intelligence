# Prompt Dùng Cho Codex Trên Server

Bạn đang ở server Linux/GPU. Tôi đã giải nén bundle `phase1_classes_6_9_server_bundle.zip` vào thư mục hiện tại. Hãy trích xuất 3 sách `SGK_LS_ĐL_7.pdf`, `SGK_LS_ĐL_8.pdf`, `SGK_LS_ĐL_9.pdf` bằng đúng technique Phase 1 đã dùng cho sách lớp 6, bám theo `Report_Đồ_án_GK_NLP.pdf`.

Yêu cầu:

1. Đọc `README_PHASE1_CLASSES_7_9_SERVER.md`, `README_PHASE1_SERVER.md`, và script `scripts/phase1_server_pipeline.py`.
2. Không tự ý đổi thuật toán nếu không có lỗi runtime. Pipeline cần giữ hướng: layout detection, OCR/DeepSeek-OCR, xuất ảnh, Markdown, DOCX, RAG chunks, metadata, quality report, zip.
3. Cài môi trường bằng:

```bash
bash scripts/setup_phase1_server.sh
```

4. Chạy test 5 trang lớp 7 trước:

```bash
CLASSES="7" START_PAGE=1 END_PAGE=5 SKIP_SPELLCHECK=1 GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

5. Nếu test pass, chạy full:

```bash
CLASSES="7 8 9" GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

6. Nếu lỗi MinerU hoặc layout engine, kiểm tra log rồi thử:

```bash
CLASSES="7" LAYOUT_ENGINE=cv GPU_IDS="0" bash scripts/run_phase1_classes_6_9.sh
```

7. Không xóa output đã chạy xong. Nếu cần chạy lại lớp nào thì dùng `FORCE=1` cho đúng lớp đó.
8. Khi hoàn tất, kiểm tra các file:

```bash
ls -lh extracted/class_7_rtx4070/book.md extracted/class_7_rtx4070/rag_chunks.jsonl extracted/class_7_rtx4070.zip
ls -lh extracted/class_8_rtx4070/book.md extracted/class_8_rtx4070/rag_chunks.jsonl extracted/class_8_rtx4070.zip
ls -lh extracted/class_9_rtx4070/book.md extracted/class_9_rtx4070/rag_chunks.jsonl extracted/class_9_rtx4070.zip
```

Báo lại đường dẫn output zip và mọi lỗi còn lại nếu có.
