# QuestionGeneration

Pipeline sinh câu hỏi tự động từ sách giáo khoa đã được index bởi RAG.

Thiết kế này đi theo hướng của `acl_latex.pdf`: Teacher model sinh câu hỏi, Student model kiểm định độc lập, sau đó hệ thống lọc evidence và các lỗi cấu trúc. Bạn không cần tự viết câu hỏi thủ công.

## Chạy thử ít chunk

```powershell
python QuestionGeneration\scripts\generate_questions.py --config QuestionGeneration\config.yaml --limit-chunks 2 --questions-per-chunk 1 --reset-output
```

## Chạy toàn bộ

```powershell
python QuestionGeneration\scripts\generate_questions.py --config QuestionGeneration\config.yaml --reset-output
```

Kết quả nằm ở:

- `QuestionGeneration/data/class_6/generated_candidates.jsonl`
- `QuestionGeneration/data/class_6/validated_questions.jsonl`
- `QuestionGeneration/data/class_6/rejected_questions.jsonl`
- `QuestionGeneration/data/class_6/run_summary.json`

## Export quiz

```powershell
python QuestionGeneration\scripts\export_quiz.py
```

File CSV export:

- `QuestionGeneration/data/class_6/quiz_export.csv`

## Gợi ý model

Mặc định dùng `qwen3:4b` qua Ollama vì máy local của bạn đang có model này. Nếu chạy trên server có VRAM tốt hơn, nên đổi:

- Teacher: model lớn hơn, sáng tạo hơn một chút.
- Student: model khác Teacher, nhiệt độ thấp hơn, kiểm định khắt khe hơn.

Nếu bắt buộc chạy local CPU/GPU yếu, vẫn dùng được nhưng tốc độ sẽ chậm.

Ghi chú thực tế: `qwen3:4b` trên Ollama có chế độ thinking, nên mỗi câu qua đủ Teacher + Student có thể mất nhiều phút. Để chạy cả sách, nên chạy theo batch nhỏ hoặc chuyển sang server GPU/model không thinking.
