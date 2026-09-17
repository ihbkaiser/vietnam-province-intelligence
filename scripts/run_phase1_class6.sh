#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C.UTF-8
export LANG=C.UTF-8
export USE_TF=0
export TRANSFORMERS_NO_TF=1
export USE_FLAX=0
export TRANSFORMERS_NO_FLAX=1
export TF_CPP_MIN_LOG_LEVEL=3

if [[ -f ".venv/bin/activate" ]]; then
  source .venv/bin/activate
fi
if [[ -x "bin/mineru" ]]; then
  export PATH="$(pwd)/bin:$PATH"
fi

python scripts/phase1_server_pipeline.py \
  --pdf "books/SGK Lịch sử và địa lí 6 CD.pdf" \
  --out "extracted/class_6_rtx4070" \
  --start-page 1 \
  --layout-engine auto \
  --easyocr-gpu \
  --zip-output
