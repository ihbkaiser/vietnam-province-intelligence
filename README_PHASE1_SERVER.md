# Phase 1 Server Pipeline

Pipeline này dành cho server Linux có RTX 4070. Đầu vào mặc định là `books/SGK Lịch sử và địa lí 6 CD.pdf`.

Pipeline mặc định có MinerU/PDF-Extract-Kit cho layout theo report. Để tránh MinerU làm lệch dependency của DeepSeek/Qwen, setup tạo riêng `.venv-mineru` và một wrapper `bin/mineru`; môi trường chính `.venv` chỉ phục vụ DeepSeek-OCR, EasyOCR, Qwen và export dữ liệu.

Đầu ra chính:

- `extracted/class_6_rtx4070/book.md`
- `extracted/class_6_rtx4070/book.docx`
- `extracted/class_6_rtx4070/rag_chunks.jsonl`
- `extracted/class_6_rtx4070/metadata/book.json`
- `extracted/class_6_rtx4070/metadata/images.json`
- `extracted/class_6_rtx4070/_previews/images_contact.jpg`
- `extracted/class_6_rtx4070.zip`

## Chạy trên server

```bash
unzip phase1_class6_server_bundle.zip
bash scripts/setup_phase1_server.sh
bash scripts/run_phase1_class6.sh
```

Runner sẽ thử MinerU trước khi `--layout-engine auto`. Nếu MinerU lỗi, pipeline tự fallback sang OpenCV/EasyOCR để crop hình theo caption, nhưng mặc định vẫn có stage MinerU.

Nếu muốn debug nhanh mà không cài MinerU:

```bash
bash scripts/setup_phase1_server.sh --without-mineru
bash scripts/run_phase1_class6.sh
```

## Test nhanh

```bash
python scripts/phase1_server_pipeline.py \
  --pdf "books/SGK Lịch sử và địa lí 6 CD.pdf" \
  --out "extracted/class_6_rtx4070_test" \
  --start-page 6 \
  --end-page 10 \
  --layout-engine cv \
  --easyocr-gpu \
  --skip-spellcheck \
  --zip-output
```

## SSH an toàn

Không nên dán password server vào chat. Hãy dùng SSH key hoặc host alias đã cấu hình sẵn trong `~/.ssh/config`, rồi upload bundle bằng:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\remote_phase1_upload.ps1 `
  -HostName your.server.ip `
  -User your_user `
  -RemoteDir /home/your_user/vietnam_phase1 `
  -KeyFile C:\Users\Admin\.ssh\id_ed25519
```
