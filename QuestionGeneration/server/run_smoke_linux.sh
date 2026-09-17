#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source .venv-qg/bin/activate
python QuestionGeneration/scripts/check_ollama.py --model qwen3:4b
python QuestionGeneration/scripts/generate_questions.py \
  --config QuestionGeneration/config.yaml \
  --limit-chunks 1 \
  --questions-per-chunk 1 \
  --output-dir data/server_smoke \
  --reset-output
python QuestionGeneration/scripts/export_quiz.py \
  --input QuestionGeneration/data/server_smoke/validated_questions.jsonl \
  --csv QuestionGeneration/data/server_smoke/quiz_export.csv \
  --json QuestionGeneration/data/server_smoke/quiz_export.json
