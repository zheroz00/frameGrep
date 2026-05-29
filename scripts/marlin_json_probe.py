#!/usr/bin/env python
"""
Rung 3 probe: does Marlin honor the app's JSON-schema prompt, or must we adapt
its native Scene/Events output into ClipSegment[]?

Calls .caption() with the canonical prompt overridden by (a condensed version of)
the app's buildNativeVideoPrompt JSON instruction, and prints the raw output so we
can see whether it produces the ClipSegment fields (excitement_score/mood/etc).
"""
import sys
import torch
from transformers import AutoModelForCausalLM

MODEL_ID = "NemoStation/Marlin-2B"

APP_JSON_PROMPT = """Analyze this FPV drone video and identify highlight clips.
Respond with a JSON array of clips. Each clip must have:
- start_time: string (MM:SS), end_time: string (MM:SS)
- description: string
- excitement_score: number (1-10)
- mood: string (one of: intense, smooth, dramatic, peaceful, playful, technical)
- lighting: string (one of: golden_hour, midday, overcast, shade, indoor, mixed, low_light)
- dominant_colors: string[] (1-3 colors)
Return ONLY valid JSON array, no markdown or explanation."""


def main() -> None:
    video = sys.argv[1]
    marlin = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, trust_remote_code=True, dtype=torch.bfloat16, device_map={"": "cuda"}
    ).eval()

    print("=" * 78)
    print("RAW OUTPUT with app JSON prompt override:")
    print("=" * 78)
    res = marlin.caption(video, prompt=APP_JSON_PROMPT, max_new_tokens=1024)
    # .caption() still parses as Scene/Events; the raw text is the real signal.
    print("\n--- result['caption'] (raw text) ---")
    print(res.get("caption", "")[:2500])
    print("\n--- parsed scene ---", repr(res.get("scene", ""))[:200])
    print("--- parsed events ---", res.get("events"))


if __name__ == "__main__":
    main()
