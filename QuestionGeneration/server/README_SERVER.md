# Server Runbook: Question Generation

Bundle này chỉ phục vụ hệ thống sinh câu hỏi ôn tập từ SGK đã trích xuất. Nó không cần chạy toàn bộ RAG API. Dữ liệu đầu vào chính là:

- `RAG/storage/class_6/documents.jsonl`

Pipeline:

```text
documents.jsonl -> Teacher LLM sinh MCQ -> Student LLM kiểm đáp án -> evidence filter -> validated_questions.jsonl -> quiz_export.csv
```

## 1. Giải nén trên server

Ví dụ:

```bash
mkdir -p ~/cross-sensor/ideas/question_generation
cd ~/cross-sensor/ideas/question_generation
unzip question_generation_server_bundle.zip
```

Sau khi unzip, thư mục phải có:

```text
QuestionGeneration/
RAG/storage/class_6/documents.jsonl
```

## 2. Cài Python dependency

```bash
bash QuestionGeneration/server/setup_python_env.sh
```

Nếu server dùng `python` thay vì `python3`, sửa dòng `python3 -m venv .venv-qg` trong script.

## 3. Cài Ollama và tải model

```bash
bash QuestionGeneration/server/setup_ollama_linux.sh qwen3:4b
```

Kiểm tra GPU:

```bash
nvidia-smi
ollama list
```

Nếu server không cho dùng `systemd`, script sẽ chạy `ollama serve` bằng `nohup`.

## 4. Chạy smoke test

```bash
bash QuestionGeneration/server/run_smoke_linux.sh
```

Kết quả smoke test:

```text
QuestionGeneration/data/server_smoke/validated_questions.jsonl
QuestionGeneration/data/server_smoke/quiz_export.csv
```

## 5. Chạy toàn bộ ở background

```bash
bash QuestionGeneration/server/run_full_background_linux.sh
```

Theo dõi log:

```bash
tail -f QuestionGeneration/logs/qg_full_*.log
```

Kiểm tra tiến trình:

```bash
cat QuestionGeneration/logs/qg_full.pid
ps -p $(cat QuestionGeneration/logs/qg_full.pid)
```

## 6. Export sau khi chạy xong

```bash
bash QuestionGeneration/server/export_full_linux.sh
```

Output chính:

```text
QuestionGeneration/data/class_6/validated_questions.jsonl
QuestionGeneration/data/class_6/rejected_questions.jsonl
QuestionGeneration/data/class_6/run_summary.json
QuestionGeneration/data/class_6/quiz_export.csv
QuestionGeneration/data/class_6/quiz_export.json
```

## 7. Lưu ý tốc độ

`qwen3:4b` có thinking nên có thể chậm. Nếu server có GPU tốt và cài được model khác, nên sửa `QuestionGeneration/config.yaml`:

```yaml
models:
  teacher_model: qwen2.5:7b-instruct
  student_model: llama3.1:8b-instruct
```

Tên model phải đúng với `ollama list`.

## 8. Nếu muốn chia batch

Chạy từng đoạn chunk:

```bash
source .venv-qg/bin/activate
python QuestionGeneration/scripts/generate_questions.py \
  --config QuestionGeneration/config.yaml \
  --start-index 0 \
  --limit-chunks 50 \
  --output-dir data/class_6_batch_000_049 \
  --reset-output
```

Đổi `--start-index` thành `50`, `100`, `150` cho các batch sau.
