# Simple NotebookLM For Vietnamese Textbooks

This folder implements a lightweight NotebookLM-style learning system for the extracted class 6 History and Geography textbook.

## Quick Start

```powershell
cd D:\vietnam-province-intelligence
python notebooklm\scripts\build_index.py --config notebooklm\config.yaml
python notebooklm\scripts\serve.py --config notebooklm\config.yaml --host 127.0.0.1 --port 8020
```

Open:

```text
http://127.0.0.1:8020
```

## Tasks

- `ask`: grounded Q&A with citations.
- `summarize`: summary and key points over a query or metadata filter.
- `quiz`: dynamic multiple-choice quiz generation from retrieved context.
- `flashcards`: flashcards from retrieved context.
- `search`: debug retrieval without calling a model.

The default provider is `extractive`, so the app runs without Ollama. Switch to `ollama` in the UI after starting Ollama and pulling the configured model.
