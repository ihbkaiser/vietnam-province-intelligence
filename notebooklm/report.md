# NotebookLM Implementation Report

## Mục Tiêu

Folder `notebooklm/` triển khai một bản Simple NotebookLM cho dữ liệu SGK Lịch sử và Địa lí 6 đã trích xuất ở Phase 1. Hướng này thay thế cách dùng bộ câu hỏi tĩnh bằng một hệ thống học tập dựa trên RAG: chọn phạm vi tài liệu, truy xuất ngữ cảnh, sinh câu trả lời/tóm tắt/quiz/flashcards và trả kèm nguồn.

## Trạng Thái Build

- Nguồn dữ liệu: `extracted/class_6_phase1_local_cpu_full/rag_chunks.jsonl`
- Số trang nguồn: `206`
- Số trang có chunk được index: `199`
- Số bài học/phạm vi nhận diện: `47` (`46` bài học + `1` phụ lục thuật ngữ/tra cứu)
- Số chunk sau recursive chunking: `348`
- Vector store: `notebooklm/storage/class_6`
- Sparse matrix: `348 x 26235`
- Dense SVD embedding: `348 x 256`
- Smoke test: `ask`, `summarize`, `quiz`, `flashcards` chạy được ở provider `extractive`
- HTTP test: `/health`, `/documents`, `/lessons`, `/search`, `/ask`, `/quiz`, `/providers`, `/` chạy ổn
- LLM mặc định chuyển sang provider `hf_local` với model `Qwen/Qwen3-4B-Instruct-2507` theo cấu hình trong tài liệu; app vẫn giữ `ollama` với model `qwen3:4b` làm đường chạy nhanh đã test.
- Quiz test qua Ollama: `provider=ollama`, `model=qwen3:4b`, sinh được item có `source_markers`.
- Môi trường local đã nâng `transformers` lên `4.57.6`; nếu dùng bản cũ như `4.46.x`, HF local sẽ không nhận kiến trúc `qwen3`.
- Query kiểm thử `Hình 1.12 nói về tư liệu lịch sử gì?`: top 1 trả trang `10`
- Query kiểm thử `Vì sao cần học lịch sử?`: top 1 trả trang `8`

## Mapping Theo `[Description]-Building-Simple-NotebookLM.pdf`

| Thành phần trong PDF | Đã triển khai trong `notebooklm/` | Ghi chú |
|---|---|---|
| `data/` chứa tài liệu đầu vào | `config.yaml` trỏ tới `../extracted/class_6_phase1_local_cpu_full/rag_chunks.jsonl` | Dùng kết quả OCR/spellcheck đã có thay vì đọc PDF thô lại. |
| `src/config.py` | `src/notebooklm_system/config.py` | Quản lý data path, chunking, retrieval, generation, learning. |
| `src/schemas.py` | `src/notebooklm_system/schemas.py` | Có `ChunkMetadata`, `RetrievedChunk`, `Citation`, `RagAnswer`, `Summary`, `QuizSet`, `FlashcardSet`. |
| Nạp tài liệu và metadata | `src/notebooklm_system/data_loader.py` | Gắn `page`, `lesson_id`, `lesson_title`, `subject`, `images`. |
| Chunking recursive `1000/150` | `split_text_recursive()` trong `data_loader.py` | Bám cấu hình được PDF chọn làm baseline tốt. |
| Vector hóa và lưu vector store | `src/notebooklm_system/indexing.py`, `store.py` | Bản đang chạy dùng local TF-IDF + SVD dense để chạy nhẹ trên máy local; model embedding trong tài liệu là `GreenNode/GreenNode-Embedding-Large-VN-Mixed-V1`. |
| Semantic/hybrid retrieval | `src/notebooklm_system/retriever.py` | Kết hợp sparse TF-IDF, dense SVD, RRF và exact-match boost. |
| Reranking bằng Cross-Encoder | `OptionalReranker` trong `retriever.py` | Có sẵn hook, mặc định tắt vì CPU/local có thể chậm. |
| Prompt Jinja2 | `prompts/*.jinja2` | Có prompt cho answer, summary map/reduce, quiz, flashcards. |
| RAG answer có citation | `src/notebooklm_system/rag.py` | Trả `RagAnswer` kèm `[S1]`, page, chunk, lesson. |
| Summary map-reduce | `summarize()` trong `learning.py` | Nếu dùng LLM và nhiều chunk, chạy map-reduce; extractive fallback cho local. |
| Quiz và Flashcards | `generate_quiz()`, `generate_flashcards()` trong `learning.py` | LLM trả JSON và validate bằng Pydantic; có fallback local. |
| Export JSON/Markdown | `src/notebooklm_system/export.py` | CLI có thể xuất markdown/text. |
| REST API FastAPI | `src/notebooklm_system/interfaces/api.py` | Endpoints: `/documents`, `/lessons`, `/search`, `/ask`, `/summarize`, `/quiz`, `/flashcards`. |
| UI sử dụng | `GET /` trong FastAPI | Web UI local có tab hỏi đáp, tóm tắt, quiz, flashcards, search. |
| CLI | `scripts/cli.py` | Có các lệnh `ask`, `search`, `summarize`, `quiz`, `flashcards`. |
| Evaluation Ragas | `src/notebooklm_system/evaluation/ragas_evaluator.py` | Optional; cần cài thêm `ragas datasets` và benchmark Q/A chuẩn. |

## Khác Biệt Có Chủ Đích

PDF dùng Qdrant và có thể dùng HuggingFace/Gemini/vLLM. Bản này vẫn giữ local TF-IDF + SVD cho retriever để chạy ngay trên máy không GPU và không cần service vector database. Khi mở rộng nhiều sách/lớp, có thể thay `LocalVectorStore` bằng Qdrant + embedding `GreenNode/GreenNode-Embedding-Large-VN-Mixed-V1` mà vẫn giữ schema, prompts, API và learning pipeline.

Ngoài ra, bản hiện tại lọc trang cuối sách từ trang `203` trở đi khỏi index mặc định vì đây là mục lục/nhà xuất bản/QR, dễ gây nhiễu retrieval. Các trang `194-202` được tách thành phạm vi `Phụ lục` thay vì gán nhầm vào bài 26.

Provider `extractive` có fallback quiz/flashcard rule-based để app chạy được ngay. Fallback này ưu tiên câu định nghĩa và cụm từ khóa có nghĩa; khi cần chất lượng tự nhiên hơn cho giảng dạy, nên chuyển sang `ollama`, `hf_local` hoặc `openai_compatible`.

## Ghi Chú Về Module Quiz

Phần `Quiz` hiện tại bám kiến trúc NotebookLM/RAG trong `[Description]-Building-Simple-NotebookLM.pdf`: truy xuất đúng bài/chunk, lấy ngữ cảnh, sinh item và trả citation. Tuy nhiên, nhánh `Extractive local` không phải mô hình sinh câu hỏi đã được huấn luyện theo paper QG. Đây là fallback rule-based để chạy được trên máy local không GPU.

Sau khi kiểm thử bài 2 Địa lí, fallback đã được chỉnh để:

- Phân biệt câu định nghĩa khái niệm với câu phương pháp/thao tác, ví dụ `Sử dụng tỉ lệ thước là cách đơn giản nhất...` sẽ thành câu hỏi phương pháp, không còn hỏi là "khái niệm".
- Không dùng các cụm OCR rác từ bảng/legend làm distractor, ví dụ `Thành hiệu đường`, `Cảng biển Thành`.
- Sinh thêm câu hỏi thủ tục/số liệu cho các đoạn như tính khoảng cách, tỉ lệ bản đồ, ví dụ Rạch Giá - Cần Thơ.
- Giao diện quiz hiển thị dẫn chứng theo từng câu sau khi người học đã trả lời, gồm marker `S1`, trang/bài, đoạn trích và ảnh liên quan từ SGK nếu chunk nguồn có ảnh.
- Ảnh SGK mở bằng lightbox trong app, đóng được bằng nút `×`, bấm nền hoặc phím `Escape`; API lọc các icon/ảnh quá nhỏ để tránh phóng to các biểu tượng không hữu ích.
- Prompt và fallback quiz đã bỏ lối mở đầu máy móc như `Theo SGK`/`Theo ví dụ trong SGK`; câu số liệu được ưu tiên viết dạng vận dụng có đủ dữ kiện, ví dụ nêu khoảng cách đo được và tỉ lệ thước rồi hỏi khoảng cách thực tế.
- Fallback quiz không còn dừng ở 4 câu khi bài có ít pattern định nghĩa; hệ thống nhận dạng thêm định nghĩa nằm giữa đoạn OCR, luôn bổ sung câu statement/cloze nếu chưa đủ số item yêu cầu.
- Nhánh cloze tự do đã bị loại khỏi fallback chính vì dễ kéo rác OCR vào đáp án; riêng bài bản đồ có thêm template kiến thức cho phép chiếu, kí hiệu, chú giải, tỉ lệ, đo khoảng cách, phương hướng và nhóm bản đồ để sinh được 15 câu sạch hơn.
- Nếu muốn đạt chất lượng giống hướng model QG trong paper, bước tiếp theo vẫn cần module generator + evaluator riêng: fine-tune hoặc chạy LLM đủ mạnh, rồi lọc bằng answerability/faithfulness/uniqueness.

Trong `[Description]-Building-Simple-NotebookLM.pdf`, cấu hình tham chiếu không dùng Ollama làm mặc định. Tài liệu dùng embedding `GreenNode/GreenNode-Embedding-Large-VN-Mixed-V1`, LLM backend `hf_local`, `gemini` hoặc `vllm`; model local minh họa là `Qwen3-4B-Instruct-2507`, Gemini là `gemini-2.5-flash`, reranker là `BAAI/bge-reranker-v2-m3`. Bản hiện tại đã đặt `hf_local` + `Qwen/Qwen3-4B-Instruct-2507` làm mặc định, giữ provider `openai_compatible` cho vLLM ở `http://localhost:8001/v1`, và dùng thêm Ollama `qwen3:4b` làm đường chạy local thực dụng vì model này đã có sẵn trên máy.

## Vì Sao Hướng Này Tốt Hơn Bộ Quiz Tĩnh

- Quiz được sinh theo bài/truy vấn tại thời điểm cần dùng, không phải sinh hàng loạt rồi khó kiểm soát.
- Mỗi item có citation/chunk nguồn để debug.
- Có thể dùng cùng một kho tri thức cho hỏi đáp, tóm tắt, flashcards và tạo đề.
- Nếu chất lượng quiz chưa tốt, ta sửa prompt/validator/retrieval thay vì train model ngay.

## Lệnh Chạy

```powershell
python notebooklm\scripts\build_index.py --config notebooklm\config.yaml
python notebooklm\scripts\smoke_test.py --config notebooklm\config.yaml
python notebooklm\scripts\serve.py --config notebooklm\config.yaml --host 127.0.0.1 --port 8020
```

Local URL:

```text
http://127.0.0.1:8020
```

## Bước Nâng Cấp Tiếp Theo

1. Chuyển retriever sang Qdrant + `GreenNode/GreenNode-Embedding-Large-VN-Mixed-V1` nếu muốn bám sát phần vector store của tài liệu.
2. Bật reranker `BAAI/bge-reranker-v2-m3` khi có GPU hoặc khi corpus mở rộng nhiều sách.
3. Thêm validator LLM-as-judge cho quiz: kiểm tra đáp án duy nhất, evidence đủ, không hỏi mơ hồ.
4. Tạo benchmark nhỏ theo từng bài để chạy Ragas.

## Cập Nhật Provider GPT-OSS-20B

Để chất lượng quiz bớt máy móc, app đã được cấu hình ưu tiên nhánh `openai_compatible` với OpenRouter model `openai/gpt-oss-20b:free`. App đọc `OPENROUTER_API_KEY` từ `.env` hoặc `backend/.env`, không copy secret vào `notebooklm/config.yaml`.

Trạng thái hiện tại trên máy local: biến key có tồn tại, nhưng OpenRouter endpoint `/api/v1/key` trả HTTP `401`. Vì vậy UI sẽ disable `GPT-OSS-20B API` cho tới khi key được refresh/cấp lại. Khi key hợp lệ, Quiz nên chọn `GPT-OSS-20B API`; nếu không, chọn `Ollama qwen3:4b` hoặc `HF local Qwen3-4B`, còn `Extractive local` chỉ nên coi là fallback chống lỗi.

Riêng với Quiz, nếu người dùng đã chọn một provider LLM nhưng model không trả JSON/citation đạt quality gate, app sẽ báo lỗi thay vì tự động rơi về fallback rule-based. Mục tiêu là tránh sinh các câu hỏi máy móc như dạng điền cụm từ rời rạc hoặc distractor rác OCR trong khi UI vẫn khiến người dùng tưởng đó là đầu ra của LLM.

## Cập Nhật Provider DeepSeek/Gemini

Ngày 2026-08-17, app chuyển nhánh `openai_compatible` sang OpenRouter theo cấu hình tách riêng:

- `openai_model`: `deepseek/deepseek-v4-flash-0731`
- `quiz_model`: `deepseek/deepseek-v4-flash-0731`
- `vision_model`: `google/gemini-3.7-flash`
- `vision_batch_model`: `google/gemini-3.7-flash:batch`

Lý do chọn `deepseek/deepseek-v4-flash-0731`: đây là slug mới hơn bản `deepseek/deepseek-v4-flash` 0423, vẫn thuộc nhóm giá rẻ trên OpenRouter, hỗ trợ JSON/structured output và phù hợp hơn cho sinh quiz text có citation. Bản 0423 có thể giữ làm fallback nếu 0731 bị nghẽn provider hoặc đổi giá.

Lý do không đặt `google/gemini-3.7-flash:batch` làm mặc định cho UI realtime: bản `:batch` rẻ hơn, nhưng hợp hơn cho job offline như caption toàn bộ ảnh SGK hoặc đánh giá lại ảnh hàng loạt. Với thao tác bấm quiz trong app, cấu hình mặc định dùng `google/gemini-3.7-flash` để tránh độ trễ/semantics batch chưa ổn định.

Đã thêm module `notebooklm_system.vision` và script:

```powershell
python notebooklm\scripts\caption_images.py --config notebooklm\config.yaml --limit 20
python notebooklm\scripts\caption_images.py --config notebooklm\config.yaml --batch-model --limit 100
```

Script này dùng Gemini VLM qua OpenRouter để tạo cache caption/visible text/teaching points cho ảnh SGK. Cache này là nền để bước sau chọn ảnh phù hợp hơn cho từng câu hỏi, ví dụ thử ảnh lân cận 2.9, 2.10, 2.12 nếu ảnh 2.11 không khớp nội dung.
