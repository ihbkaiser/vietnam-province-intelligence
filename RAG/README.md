# Class 6 Textbook RAG

RAG module for the extracted Vietnamese class 6 history/geography textbook.

## Build Index

```powershell
python RAG\scripts\build_index.py --config RAG\config.yaml
```

## Ask From CLI

Retrieval only:

```powershell
python RAG\scripts\query.py --config RAG\config.yaml --question "Vì sao cần học lịch sử?"
```

Use Ollama for generation:

```powershell
ollama run qwen3:4b
python RAG\scripts\query.py --config RAG\config.yaml --question "Vì sao cần học lịch sử?" --provider ollama
```

## Run API

```powershell
python RAG\scripts\serve_api.py --config RAG\config.yaml --host 127.0.0.1 --port 8016
```

Endpoints:

- `GET /health`
- `POST /search` with `{"question": "...", "top_k": 5}`
- `POST /ask` with `{"question": "...", "provider": "extractive"}` or `"ollama"`

## Notes

- No retriever training is required for this implementation.
- `build_index.py` creates vectors and local index files. That is indexing, not training.
- Dense retrieval uses `intfloat/multilingual-e5-small` by default.
- Sparse retrieval uses local TF-IDF.
- Hybrid ranking uses Reciprocal Rank Fusion.
