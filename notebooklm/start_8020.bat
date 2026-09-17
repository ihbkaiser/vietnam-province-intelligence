@echo off
REM Start the Simple NotebookLM FastAPI server on port 8020.
REM Run this BEFORE starting the Next.js dev server so the RAG pipeline
REM (notebookBridge.ts) can use the warm HTTP server instead of cold-starting
REM Python per request.
cd /d "%~dp0.."
echo Starting NotebookLM server on port 8020...
python scripts\serve.py --config config.yaml --host 127.0.0.1 --port 8020