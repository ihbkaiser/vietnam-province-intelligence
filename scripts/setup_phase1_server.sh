#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C.UTF-8
export LANG=C.UTF-8
export USE_TF=0
export TRANSFORMERS_NO_TF=1
export USE_FLAX=0
export TRANSFORMERS_NO_FLAX=1
export TF_CPP_MIN_LOG_LEVEL=3

WITH_MINERU=1
for arg in "$@"; do
  if [[ "$arg" == "--with-mineru" ]]; then
    WITH_MINERU=1
  fi
  if [[ "$arg" == "--without-mineru" ]]; then
    WITH_MINERU=0
  fi
done

python3 -m venv .venv
source .venv/bin/activate

python -m pip install -U pip wheel setuptools

# RTX 4070 works well with the CUDA 12.1 PyTorch wheels on most Linux servers.
# If your server image already has a working torch build, this command is safe to skip manually.
python -m pip install --index-url https://download.pytorch.org/whl/cu121 torch torchvision torchaudio
python -m pip install -r requirements-phase1-gpu.txt

if [[ "$WITH_MINERU" == "1" ]]; then
  deactivate
  python3 -m venv .venv-mineru
  source .venv-mineru/bin/activate
  python -m pip install -U pip wheel setuptools uv
  python -m pip install -r requirements-phase1-mineru.txt

  mkdir -p bin
  cat > bin/mineru <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export USE_TF=0
export TRANSFORMERS_NO_TF=1
export USE_FLAX=0
export TRANSFORMERS_NO_FLAX=1
export TF_CPP_MIN_LOG_LEVEL=3
exec "$ROOT_DIR/.venv-mineru/bin/mineru" "$@"
SH
  chmod +x bin/mineru
  deactivate
  source .venv/bin/activate
fi

python - <<'PY'
import torch
print("torch =", torch.__version__)
print("cuda available =", torch.cuda.is_available())
print("gpu count =", torch.cuda.device_count())
if torch.cuda.is_available():
    print("gpu 0 =", torch.cuda.get_device_name(0))
PY

if [[ "$WITH_MINERU" == "1" ]]; then
  echo "mineru wrapper = $(pwd)/bin/mineru"
fi
