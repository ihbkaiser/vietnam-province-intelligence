#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

python3 -m venv .venv-qg
source .venv-qg/bin/activate
python -m pip install -U pip
python -m pip install -r QuestionGeneration/requirements.txt

echo "Python environment is ready."
echo "Activate with: source .venv-qg/bin/activate"
