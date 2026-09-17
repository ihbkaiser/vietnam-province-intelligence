#!/usr/bin/env bash
set -euo pipefail

MODEL="${1:-qwen3:4b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

if ! pgrep -x ollama >/dev/null 2>&1; then
  echo "Starting ollama serve in background..."
  nohup ollama serve > ollama_server.out.log 2> ollama_server.err.log &
  sleep 8
fi

echo "Pulling model: ${MODEL}"
ollama pull "${MODEL}"

echo "Installed models:"
ollama list
