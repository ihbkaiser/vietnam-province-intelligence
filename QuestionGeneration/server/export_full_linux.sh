#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source .venv-qg/bin/activate
python QuestionGeneration/scripts/export_quiz.py \
  --input QuestionGeneration/data/class_6/validated_questions.jsonl \
  --csv QuestionGeneration/data/class_6/quiz_export.csv \
  --json QuestionGeneration/data/class_6/quiz_export.json
