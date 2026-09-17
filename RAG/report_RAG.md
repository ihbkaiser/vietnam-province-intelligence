# Report RAG System

## Mục Tiêu

Thư mục `RAG/` triển khai một hệ thống RAG local cho dữ liệu đã trích xuất từ `SGK Lịch sử và Địa lí 6 CD.pdf`.

Input chính:

- `../extracted/class_6_phase1_local_cpu_full/rag_chunks.jsonl`
- `../extracted/class_6_phase1_local_cpu_full/metadata/images.json`
- `../extracted/class_6_phase1_local_cpu_full/metadata/book.json`

Output chính:

- `RAG/storage/class_6/documents.jsonl`
- `RAG/storage/class_6/dense_embeddings.npy`
- `RAG/storage/class_6/tfidf_vectorizer.joblib`
- `RAG/storage/class_6/tfidf_matrix.joblib`
- `RAG/storage/class_6/index_config.json`

Index hiện tại đã build:

- documents: `237`
- dense embedding shape: `237 x 384`
- sparse TF-IDF shape: `237 x 26513`
- dense model: `intfloat/multilingual-e5-small`

## Có Cần Train Retriever Không?

Không cần ở giai đoạn này.

Theo `[Reading]-RAG-System.pdf`, phần II.1 phân biệt:

- `Original RAG (2020)`: có fine-tuning end-to-end retriever và generator.
- `Modern RAG`: thường dùng hướng `Retrieve and Prompt`, giữ nguyên trọng số mô hình, chỉ tối ưu indexing/retrieval/prompt.

Project hiện tại đang đi theo `Modern RAG`, nên việc cần làm là build index vector từ chunks đã có. Đây là indexing, không phải training.

Chỉ nên fine-tune retriever nếu sau này hệ thống retrieve sai nhiều với câu hỏi thật của học sinh/giáo viên.

## Mapping Với Tài Liệu [Reading]-RAG-System.pdf

| Thành phần trong PDF | Vị trí trong PDF | Thành phần đã build |
|---|---:|---|
| Document Loading | II.2.1, trang 5-6; IV.2, trang 23 | `src/rag_system/data_loader.py` đọc `rag_chunks.jsonl`, `book.json`, `images.json` |
| Metadata | II.2.1, trang 6 | mỗi document giữ `page_number`, `class_level`, `subject`, `source_pdf`, `images` |
| Text Splitting / Chunking | II.2.1, trang 6-8; IV.3, trang 24-25 | đã dùng chunks từ Phase 1: `rag_chunks.jsonl`; không chunk lại để tránh mất liên kết ảnh/trang |
| Embedding | II.2.1, trang 8; III.2, trang 18 | `src/rag_system/embeddings.py`, mặc định `intfloat/multilingual-e5-small` |
| Vector Store | II.2.1, trang 8; III.2, trang 19; IV.4, trang 25 | `src/rag_system/index_store.py`, lưu local NumPy + Joblib thay cho Chroma vì corpus nhỏ |
| Similarity Search | II.2.2, trang 10 | `src/rag_system/retriever.py` tính dot product cosine trên vectors đã normalize |
| Hybrid Search | II.2.2, trang 10 | dense retrieval + TF-IDF sparse retrieval + RRF |
| Keyword exactness | II.2.2, trang 10, phần hạn chế của Vector Search | exact-match boost cho `Hình 1.12`, năm, cụm được quote để bắt tên riêng/ký hiệu SGK |
| Retriever Runnable / Querying | III.2, trang 19 | `HybridRetriever.search()` và API `/search` |
| Generation | II.2, trang 5; IV.5, trang 26 | `src/rag_system/generator.py`, có prompt grounding và Ollama client |
| UI/API | IV.6, trang 29 | `scripts/serve_api.py` tạo FastAPI server |
| Re-ranking | Phụ lục VII.5.4, trang 101-103 | chưa bật cross-encoder mặc định; thiết kế hiện tại dùng hybrid+RRF trước vì nhẹ cho CPU |

## Kiến Trúc Đã Build

```text
rag_chunks.jsonl
   |
   v
DataLoader
   |
   +--> Dense embedding: intfloat/multilingual-e5-small
   |       |
   |       v
   |   dense_embeddings.npy
   |
   +--> Sparse TF-IDF
           |
           v
       tfidf_matrix.joblib

User query
   |
   +--> dense query vector
   +--> sparse query vector
   |
   v
HybridRetriever: Dense top-k + Sparse top-k + RRF
   |
   +--> Exact-match boost cho hình/năm/tên riêng
   |
   v
Top-k chunks + page/image metadata
   |
   +--> Extractive answer fallback
   +--> Ollama generation nếu bật
```

## Vì Sao Dùng Local NumPy/Joblib Thay Chroma?

PDF dùng ChromaDB trong phần thực hành, nhưng corpus hiện tại chỉ có vài trăm chunks. Với quy mô này, local NumPy + Joblib:

- nhẹ hơn,
- dễ debug hơn,
- không cần service database,
- chạy tốt trên máy không GPU,
- vẫn đúng bản chất vector store/retriever.

Khi mở rộng lên nhiều sách/nhiều lớp, có thể thay `LocalIndexStore` bằng Chroma, Qdrant hoặc Postgres/pgvector mà không đổi phần loader/generator.

## Lệnh Sử Dụng

Build index:

```powershell
python RAG\scripts\build_index.py --config RAG\config.yaml
```

Query retrieval-only:

```powershell
python RAG\scripts\query.py --config RAG\config.yaml --question "Vì sao cần học lịch sử?"
```

Query bằng Ollama:

```powershell
ollama run qwen3:4b
python RAG\scripts\query.py --config RAG\config.yaml --question "Vì sao cần học lịch sử?" --provider ollama
```

Chạy API:

```powershell
python RAG\scripts\serve_api.py --config RAG\config.yaml --host 127.0.0.1 --port 8016
```

Smoke test đã chạy:

- `RAG/storage/class_6/smoke_test.json`
- Câu `Hình 1.12 nói về tư liệu lịch sử gì?` trả về `page_010_01` ở top 1.

## Bước Nâng Cấp Sau

1. Thêm reranker nhỏ như `Qwen/Qwen3-Reranker-0.6B` khi có GPU hoặc khi CPU chịu được.
2. Thêm parent-child indexing: child chunk để search, parent page/section để đưa vào LLM.
3. Tạo evaluation set từ câu hỏi thật của giáo viên/học sinh.
4. Nếu retrieval fail nhiều, lúc đó mới fine-tune embedding/reranker.
