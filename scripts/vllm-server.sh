#!/bin/bash
set -e
# vLLM server — PM2 entrypoint (started/stopped via `pm2 start|stop vllm-server`).
#
# This is a PLAIN long-lived server: it does NOT touch llama-swap or any other
# service. GPU 0 holds one heavy user at a time, so stop the others yourself first:
#   pm2 stop llama-server-cuda marlin-server
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

export HF_HOME=/mnt/gamesSSD/models/huggingface
export HF_HUB_CACHE=/mnt/gamesSSD/models/huggingface/hub
export HF_HUB_DISABLE_XET=1
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES="${GPU:-0}"

if [ -z "${HF_TOKEN:-}" ]; then
  echo "WARNING: HF_TOKEN unset — gated models will 401 unless already cached." >&2
fi

echo "Starting vLLM on port ${PORT:-8002} (GPU ${CUDA_VISIBLE_DEVICES}) with model: ${MODEL}"
echo "Poll http://localhost:${PORT:-8002}/v1/models for readiness."

exec /home/hank/miniconda/envs/vllm/bin/vllm serve \
  "$MODEL" \
  --host 0.0.0.0 \
  --port "${PORT:-8002}" \
  --max-model-len "$MAX_MODEL_LEN" \
  --limit-mm-per-prompt '{"video": 1}' \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization "$GPU_MEM_UTIL" \
  --enforce-eager \
  --allowed-origins '["*"]'
