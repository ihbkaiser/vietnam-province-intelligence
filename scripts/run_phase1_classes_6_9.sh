#!/usr/bin/env bash
set -euo pipefail

export LC_ALL="${LC_ALL:-C.UTF-8}"
export LANG="${LANG:-C.UTF-8}"
export USE_TF=0
export TRANSFORMERS_NO_TF=1
export USE_FLAX=0
export TRANSFORMERS_NO_FLAX=1
export TF_CPP_MIN_LOG_LEVEL=3

if [[ -f ".venv/bin/activate" ]]; then
  source ".venv/bin/activate"
fi

if [[ -x "bin/mineru" ]]; then
  export PATH="$(pwd)/bin:$PATH"
fi

CLASSES="${CLASSES:-7 8 9}"
LAYOUT_ENGINE="${LAYOUT_ENGINE:-auto}"
SCALE="${SCALE:-2.4}"
MINERU_WINDOW_SIZE="${MINERU_WINDOW_SIZE:-16}"
START_PAGE="${START_PAGE:-1}"

run_class() {
  local class_id="$1"
  local pdf=""
  local out=""

  case "$class_id" in
    6)
      pdf="books/SGK Lịch sử và địa lí 6 CD.pdf"
      out="extracted/class_6_rtx4070"
      ;;
    7)
      pdf="books/SGK_LS_ĐL_7.pdf"
      out="extracted/class_7_rtx4070"
      ;;
    8)
      pdf="books/SGK_LS_ĐL_8.pdf"
      out="extracted/class_8_rtx4070"
      ;;
    9)
      pdf="books/SGK_LS_ĐL_9.pdf"
      out="extracted/class_9_rtx4070"
      ;;
    *)
      echo "Unsupported class: ${class_id}" >&2
      exit 2
      ;;
  esac

  if [[ ! -f "$pdf" ]]; then
    echo "Missing PDF: $pdf" >&2
    exit 2
  fi

  local args=(
    python scripts/phase1_server_pipeline.py
    --pdf "$pdf"
    --out "$out"
    --start-page "$START_PAGE"
    --scale "$SCALE"
    --layout-engine "$LAYOUT_ENGINE"
    --mineru-window-size "$MINERU_WINDOW_SIZE"
    --easyocr-gpu
    --zip-output
  )

  if [[ -n "${END_PAGE:-}" ]]; then
    args+=(--end-page "$END_PAGE")
  fi

  if [[ -n "${GPU_IDS:-}" ]]; then
    args+=(--gpu-ids "$GPU_IDS")
  fi

  if [[ "${SKIP_SPELLCHECK:-0}" == "1" ]]; then
    args+=(--skip-spellcheck)
  fi

  if [[ "${FORCE:-0}" == "1" ]]; then
    args+=(--force)
  fi

  if [[ "${FORCE_DEEPSEEK:-0}" == "1" ]]; then
    args+=(--force-deepseek)
  fi

  echo "Phase 1 extraction: class ${class_id}"
  echo "PDF: ${pdf}"
  echo "Output: ${out}"
  "${args[@]}"
}

for class_id in $CLASSES; do
  run_class "$class_id"
done

echo "Done. Check extracted/class_*_rtx4070 and extracted/class_*_rtx4070.zip."
