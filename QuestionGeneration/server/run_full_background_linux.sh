#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source .venv-qg/bin/activate
mkdir -p QuestionGeneration/data/class_6 QuestionGeneration/logs

STAMP="$(date +%Y%m%d_%H%M%S)"
LOG="QuestionGeneration/logs/qg_full_${STAMP}.log"

nohup python QuestionGeneration/scripts/generate_questions.py \
  --config QuestionGeneration/config.yaml \
  --output-dir data/class_6 \
  --reset-output \
  > "${LOG}" 2>&1 &

PID="$!"
echo "${PID}" > QuestionGeneration/logs/qg_full.pid
echo "Started QuestionGeneration full run."
echo "PID: ${PID}"
echo "Log: ${LOG}"
echo "Watch: tail -f ${LOG}"
