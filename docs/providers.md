# Analysis providers

How each analysis backend behaves and which knobs matter. See `CLAUDE.md` for the short version.

All providers emit clip times in `"MM:SS"` format internally, and all output is normalized into
`ClipSegment[]` by `src/domain/`.

## Gemini (native video upload)

Default analysis model is `gemini-2.5-flash-lite`, chosen from empirical testing (5 accurate clips
vs 1 from `gemini-3.1-flash-lite` on the same FPV footage, see `docs/model_test_notes.md`). The
user can switch models in Settings and the choice auto-saves to localStorage.

### Model list is curated, not fetched

The selector is driven by `GEMINI_ANALYSIS_MODELS` in `src/services/geminiModels.ts`, which only
holds models that accept video input and return text. Adding a model means adding one entry there
plus the same ID to the `GeminiModel` union in `src/types.ts`. Settings load validates the saved
model against the registry and falls back to the default for unknown IDs, so a model that is not in
the registry cannot be selected.

Older models are kept on purpose: empirical testing has shown smaller Flash Lite models beating
larger ones on FPV footage, so "newest" is not a safe proxy for "best".

The Gemini `ListModels` endpoint is deliberately not used:

- it does not report input modalities, so video-capable models cannot be filtered without fragile
  name heuristics (`-tts`, `-image`, `-live`, `embedding`, ...);
- API keys with service restrictions get a 403 `API_KEY_SERVICE_BLOCKED` from it, which would leave
  the selector empty for those users.

Current registry (verified against https://ai.google.dev/gemini-api/docs/models, 2026-09-15):
`gemini-2.5-flash-lite` (default), `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`,
`gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-3.5-flash`, `gemini-3.6-flash`,
`gemini-3.7-flash`, `gemini-3.8-flash`.

Other hardcoded models:
- Prompt optimization ("AI Polish" button): `gemini-3-flash-preview`.
- Caption generation (`captionService.ts`): `gemini-2.5-flash`, free-form JSON.

All analysis uses structured JSON via `responseSchema`.

### Two independent video sampling knobs

Both live in Settings and both persist.

- `geminiMediaResolution` (`low` / `default`): frame sharpness, i.e. tokens per frame.
- `geminiFps`: how many frames per second Gemini samples.

Gemini's own default is 1 fps, which misses sub-second FPV action (backflips and gaps fall between
frames), so frameGrep defaults `geminiFps` to **4**. It is passed as `videoMetadata: { fps }` on the
video part in `geminiService.ts`, and is only sent when `fps > 1` so that `fps=1` preserves Gemini's
native behavior.

Higher fps costs more tokens and pairs well with `low` resolution. This mirrors the frame-extraction
path, which already clamps short clips to 4 fps.

## Custom (OpenRouter / Ollama / vLLM)

OpenAI-compatible API, default model `qwen/qwen3-vl-235b-a22b-instruct`. These endpoints do not
accept video uploads, so the client extracts frames instead.

The Anthropic-direct provider is force-pinned for `anthropic/*` models on OpenRouter, because
Bedrock otherwise substitutes a non-vision Haiku.

### Adaptive frame extraction (`localVLMService.ts`)

Frame budget is derived from a token budget for both endpoint types (`framesForContext()`):
`floor((context - output reserve - PROMPT_RESERVE) / tokens per frame)`.

- **Cloud VLMs (OpenRouter):** context comes from the OpenRouter models API for the selected
  model; if unknown, 128K is assumed. Frames are sent at 720p, which costs about 945 tokens each,
  and the output reserve is 16K. A 128K model therefore gets about 119 frames, and any model is
  capped at 200 frames as a cost ceiling. (Before 2026-09-15 the cloud path used the 512p local
  per-frame cost and a fixed 200 frames, which overflowed any model under 256K.)
- **Local vLLM:** 512p frames at about 500 tokens each with a 6K output reserve, which is about 50
  frames at 32K context.

> **Keep `LOCAL_CONTEXT_TOKENS` (in `localVLMService.ts`) in sync with `VLLM_MAX_LEN` in
> `.env.local`.** A previous hardcoded "60 frames at 65K" assumption blew past a 32K vLLM
> (57924 > 32768).

`capFrames()` is a hard post-extraction safety trim, so the adaptive-FPS floor cannot overshoot on
very long clips.

Frame rate adapts to duration: `fps = max(MIN_FPS, min(MAX_FPS, maxFrames / duration))` with
`MIN_FPS=0.1` and `MAX_FPS=4.0`. Short clips (under 15s on cloud) clamp at 4 fps, enough to catch
sub-second action like backflips. Long videos drop fps to stay under budget.

Frames are JPEG q0.7: max 1280x720 for cloud, max **896x512 for local vLLM**. Smaller frames mean
more of them fit a 32K window, and temporal coverage beats per-frame sharpness for spotting FPV
action.

Local VLMs get a `/no_think` directive in the prompt plus `chat_template_kwargs.enable_thinking:
false`, to disable Qwen3.x reasoning blocks. Without it they burn the token budget before emitting
any JSON.

## Marlin-2B (local)

Local clip-ID model served separately, wired through `marlinService.ts` with its own search panel
component. Managed as a PM2 process.

## FPV prompts

FPV preset prompts auto-append the canonical move dictionary from `constants/fpvMoves.ts` at
runtime, in `useVideoAnalysis.ts`. AI Polish is explicitly instructed **not** to generate a
`MOVE VOCABULARY` section, to avoid duplicating it.

`components/FpvMoveDictionaryPanel.tsx` is a collapsible read-only viewer shown in Prompt Lab when
the active category is `fpv`, so the user can browse what the model is being taught.

## Music suggestions (`jamendoService.ts`)

Analyzes clip mood, energy level, and excitement scores to build music search terms, then queries
the Jamendo API with generated tags (genre, mood) and speed (tempo).

Two modes: "All Clips" (header button) for cohesive video-wide music, and "Single Clip" (per-clip
button) for individual ditties. Results are royalty-free tracks with inline audio preview, free for
personal use with attribution (Creative Commons).
