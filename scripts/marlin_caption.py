#!/usr/bin/env python
"""
Marlin-2B local validation harness (Rung 1).

Loads NemoStation/Marlin-2B via the documented transformers `trust_remote_code`
path and runs its two convenience modes against FPV clips:

  - caption(video)        -> Scene paragraph + dense Events with <start-end> spans
  - find(video, event=..) -> resolves a natural-language query to a (start, end) span

Usage:
  python scripts/marlin_caption.py <video.mp4> [more.mp4 ...] \
      [--find "a backflip" --find "flying through a gap between trees"]

Run inside the `vllm` conda env (transformers 5.9, torch 2.11, torchcodec installed):
  /home/hank/miniconda/envs/vllm/bin/python scripts/marlin_caption.py ...
"""
import argparse
import time

import torch
from transformers import AutoModelForCausalLM

MODEL_ID = "NemoStation/Marlin-2B"


def hms(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+", help="video file paths")
    ap.add_argument(
        "--find",
        action="append",
        default=[],
        help="natural-language event query for find mode (repeatable)",
    )
    ap.add_argument("--max-new-tokens", type=int, default=2048)
    args = ap.parse_args()

    t0 = time.time()
    print(f"Loading {MODEL_ID} (first run downloads ~4.5GB)...")
    marlin = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
        dtype=torch.bfloat16,
        device_map={"": "cuda"},
    )
    marlin.eval()
    print(f"Loaded in {time.time() - t0:.1f}s on {next(marlin.parameters()).device}")
    print(
        f"VRAM allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB "
        f"(reserved {torch.cuda.memory_reserved() / 1e9:.2f} GB)\n"
    )

    for video in args.videos:
        print("=" * 78)
        print(f"VIDEO: {video}")
        print("=" * 78)

        # --- Caption mode -------------------------------------------------
        t = time.time()
        cap = marlin.caption(video, max_new_tokens=args.max_new_tokens)
        dt = time.time() - t
        print(f"\n[caption] {dt:.1f}s")
        print("  Scene:", cap.get("scene", "").strip()[:600])
        events = cap.get("events", []) or []
        print(f"  Events ({len(events)}):")
        for ev in events:
            print(
                f"    <{hms(ev['start'])}-{hms(ev['end'])}> "
                f"({ev['start']:.1f}-{ev['end']:.1f}s) {ev['description']}"
            )

        # --- Find mode ----------------------------------------------------
        for query in args.find:
            t = time.time()
            res = marlin.find(video, event=query)
            dt = time.time() - t
            span = res.get("span")
            span_str = (
                f"{hms(span[0])}-{hms(span[1])} ({span[0]:.1f}-{span[1]:.1f}s)"
                if span
                else "NO SPAN"
            )
            print(
                f"\n[find] {dt:.1f}s  q='{query}'  -> {span_str}  "
                f"(format_ok={res.get('format_ok')})  raw={res.get('raw')!r}"
            )
        print()


if __name__ == "__main__":
    main()
