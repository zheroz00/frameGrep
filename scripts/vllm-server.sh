#!/bin/bash
set -e
# vLLM server — PM2 entrypoint (started/stopped via `pm2 start|stop vllm-server`).
#
# This is a PLAIN long-lived server: it does NOT touch any other service. A single
# GPU holds one heavy user at a time, so stop other GPU users yourself first:
#   pm2 stop marlin-server
#   pm2 start vllm-server
#
# Model selection lives in ONE place — .env.local:
#   VLLM_MODEL=<hf-model-id>          # e.g. cyankiwi/Qwen3-VL-8B-Instruct-AWQ-4bit
#   VLLM_MAX_LEN=32768               # optional context length
#   VLLM_GPU_MEM_UTIL=0.95           # optional GPU 0 fraction
# To switch models: edit .env.local, then `pm2 restart vllm-server --update-env`.
#
# Readiness: poll http://localhost:8002/v1/models  (empty/refused = not up yet).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# HF auth + model config come from the gitignored .env.local (no secrets in tracked files).
if [ -f "${PROJECT_ROOT}/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${PROJECT_ROOT}/.env.local"
  set +a
fi

# VLLM_MODEL is the canonical knob; fall back to MODEL (legacy) then a sane default.
MODEL="${VLLM_MODEL:-${MODEL:-cyankiwi/Qwen3-VL-8B-Instruct-AWQ-4bit}}"
MAX_MODEL_LEN="${VLLM_MAX_LEN:-32768}"
GPU_MEM_UTIL="${VLLM_GPU_MEM_UTIL:-0.95}"

# HF cache location. Defaults to HF's standard path; override HF_HOME/HF_HUB_CACHE
# in .env.local if your models live on another drive.
export HF_HOME="${HF_HOME:-$HOME/.cache/huggingface}"
export HF_HUB_CACHE="${HF_HUB_CACHE:-$HF_HOME/hub}"
export HF_HUB_DISABLE_XET=1
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES="${GPU:-0}"

if [ -z "${HF_TOKEN:-}" ]; then
  echo "WARNING: HF_TOKEN unset — gated models will 401 unless already cached." >&2
fi

echo "Starting vLLM on port ${PORT:-8002} (GPU ${CUDA_VISIBLE_DEVICES}) with model: ${MODEL}"
echo "Poll http://localhost:${PORT:-8002}/v1/models for readiness."

# Uses the `vllm` on PATH by default; set VLLM_BIN in .env.local to point at a
# specific install (e.g. a conda/venv path) if it isn't on your PATH.
exec "${VLLM_BIN:-vllm}" serve \
  "$MODEL" \
  --host 0.0.0.0 \
  --port "${PORT:-8002}" \
  --max-model-len "$MAX_MODEL_LEN" \
  --limit-mm-per-prompt '{"video": 1}' \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization "$GPU_MEM_UTIL" \
  --enforce-eager \
  --allowed-origins '["*"]'
