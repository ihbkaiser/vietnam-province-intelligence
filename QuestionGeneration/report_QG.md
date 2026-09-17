# Question Generation Report

## Mục tiêu

Bạn không muốn tự tạo hoặc tự kiểm tra thủ công bộ câu hỏi. Vì vậy module này triển khai pipeline sinh câu hỏi bằng model, lấy cảm hứng trực tiếp từ `acl_latex.pdf`.

## Paper Có Cần Câu Hỏi Có Sẵn Không?

Không. Paper `VietMed-MCQ` tạo dataset từ tài liệu phi cấu trúc. Quy trình chính là:

1. Chia textbook/guideline thành chunk.
2. Teacher model sinh câu hỏi trắc nghiệm từ từng chunk.
3. Student model kiểm tra lại đáp án mà không nhìn đáp án gốc.
4. Evidence grounding kiểm tra đoạn chứng cứ có nằm trong context không.
5. Chỉ giữ câu hỏi qua đủ các cổng kiểm định.

Human validation trong paper là hậu kiểm chất lượng trên một mẫu, không phải bước bắt buộc để tạo toàn bộ dataset.

## Mapping Sang Project Này

| Thành phần trong paper | Triển khai trong repo |
| --- | --- |
| Data Acquisition and Chunking | Dùng `RAG/storage/class_6/documents.jsonl` đã build từ SGK |
| Teacher-Guided Generation | `QuestionGeneration/src/qg_system/pipeline.py::generate_candidates` |
| Structured JSON schema | `teacher_prompt` ép model trả về `question/options/answer/explanation/evidence` |
| Student-Based Consistency Filtering | `student_validation` cho Student tự chọn đáp án từ context |
| Answer Consistency | Giữ câu nếu `student_answer == teacher_answer` |
| Evidence Grounding | `evidence_overlap_score` kiểm tra evidence có nằm trong source chunk |
| Positional Bias Mitigation | `shuffle_options` trộn A/B/C/D sau khi validate |
| Dataset Output | `validated_questions.jsonl`, `rejected_questions.jsonl`, `quiz_export.csv` |

## Vì Không Có Review Thủ Công Thì Cần Gì?

Pipeline này dùng nhiều cổng tự động thay cho review thủ công:

- Kiểm tra schema JSON.
- Kiểm tra đủ 4 options A/B/C/D.
- Kiểm tra chỉ có một answer key.
- Loại option trùng nhau.
- Loại câu hỏi quá ngắn/quá dài.
- Loại evidence quá ngắn hoặc không khớp source.
- Student tự trả lời lại, không được biết đáp án Teacher.
- Loại câu nếu Student không đồng thuận hoặc confidence thấp.
- Shuffle options để giảm bias vị trí đáp án.

## Giới Hạn

Model-only không bao giờ chắc 100%. Nó có thể giảm rất nhiều công sức thủ công, nhưng không thay thế hoàn toàn chuyên môn sư phạm nếu bạn dùng để kiểm tra chính thức. Cách thực tế là gắn `validation` metadata và chỉ dùng câu có confidence cao.

## Phase Sau Nếu Muốn Train

Sau khi sinh đủ nhiều câu đã qua lọc, `validated_questions.jsonl` có thể dùng làm synthetic dataset để fine-tune model sinh câu hỏi riêng. Khi đó training không bắt đầu từ dữ liệu thủ công, mà bắt đầu từ dữ liệu model-generated đã được Student lọc.

## Trạng Thái Test Local

Pipeline đã chạy live với Ollama `qwen3:4b` trên 1 chunk, sinh 1 câu và được Student chấp nhận. Do `qwen3:4b` có thinking, thời gian local có thể rất chậm. Khi chạy toàn bộ sách, nên dùng server GPU hoặc model không thinking để giảm thời gian.
