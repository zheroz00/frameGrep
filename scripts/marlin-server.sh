#!/bin/bash
set -e
# Marlin-2B local analysis server — see scripts/marlin_server.py.
#
# Loads NemoStation/Marlin-2B via transformers (~4.4GB VRAM) and serves:
#   GET  /health
#   POST /analyze   (raw video bytes -> {clips:[...]})
# The frameGrep app reaches it through the /api/marlin Vite proxy (vite.config.ts).
#
# Usage:
#   scripts/marlin-server.sh                 # GPU 0, port 8003
#   GPU=1 scripts/marlin-server.sh           # pick a different GPU
#   PORT=8013 scripts/marlin-server.sh       # alternate port
#
# VRAM: weights are ~4.4GB but caption generation needs another ~4.3GB for
# attention over the video frames, so budget ~9GB free — an 8GB card OOMs under
# load. If this GPU is shared with another heavy user (e.g. a local LLM), stop
# the other one first when VRAM is tight.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# NemoStation/Marlin-2B is a GATED HF repo — loading it needs an authenticated
# HF_TOKEN. Pull it from the gitignored .env.local (this script is tracked, so the
# secret must NOT live here). Also pin HF_HOME to the persistent shared cache so a
# wipe of ~/.cache/huggingface can't strand us with no weights + no token (the exact
# failure that crash-looped this server). Matches vllm-server.sh's cache location.
if [ -f "${PROJECT_ROOT}/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${PROJECT_ROOT}/.env.local"
  set +a
fi
export HF_HOME="${HF_HOME:-$HOME/.cache/huggingface}"
if [ -z "${HF_TOKEN:-}" ]; then
  echo "WARNING: HF_TOKEN unset — gated NemoStation/Marlin-2B will 401 unless already cached." >&2
fi

export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES="${GPU:-0}"
export MARLIN_PORT="${PORT:-8003}"
# Reduce allocator fragmentation during the large attention allocation.
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}"

echo "Starting Marlin server on port ${MARLIN_PORT} (GPU ${CUDA_VISIBLE_DEVICES})..."
echo "Poll http://localhost:${MARLIN_PORT}/health for readiness."

# Uses `python` on PATH by default; set PYTHON_BIN in .env.local to point at a
# specific interpreter (e.g. a conda/venv path) if needed.
exec "${PYTHON_BIN:-python}" "${SCRIPT_DIR}/marlin_server.py"
