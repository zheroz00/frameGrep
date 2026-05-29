#!/bin/bash
set -e
# Marlin-2B local analysis server — see scripts/marlin_server.py.
#
# Loads NemoStation/Marlin-2B via transformers (~4.4GB VRAM) and serves:
#   GET  /health
#   POST /analyze   (raw video bytes -> {clips:[...]})
# The FPV.AI app reaches it through the /api/marlin Vite proxy (vite.config.ts).
#
# Usage:
#   scripts/marlin-server.sh                 # GPU 0 (16GB 4060 Ti), port 8003
#   GPU=1 scripts/marlin-server.sh           # NOTE: the 8GB Quadro OOMs under load
#   PORT=8013 scripts/marlin-server.sh       # alternate port
#
# Defaults to GPU 0 (16GB): weights are ~4.4GB but caption generation needs another
# ~4.3GB for attention over the video frames, so the 8GB card OOMs. Marlin shares
# GPU 0 with vLLM / llama-swap — stop those first if VRAM is tight (vLLM's
# vllm-start.sh already does `pm2 stop llama-server-cuda`). Reuses the existing HF
# login token + default cache (~/.cache/huggingface) where Marlin is already cached.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES="${GPU:-0}"
export MARLIN_PORT="${PORT:-8003}"
# Reduce allocator fragmentation during the large attention allocation.
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}"

echo "Starting Marlin server on port ${MARLIN_PORT} (GPU ${CUDA_VISIBLE_DEVICES})..."
echo "Poll http://localhost:${MARLIN_PORT}/health for readiness."

exec /home/hank/miniconda/envs/vllm/bin/python "${SCRIPT_DIR}/marlin_server.py"
