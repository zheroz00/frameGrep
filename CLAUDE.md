# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this app is (and is not)

frameGrep is a React app that analyzes FPV/drone footage to identify highlight moments. Users upload
video, configure analysis presets, and export clips as EDL (DaVinci Resolve / Premiere), FFmpeg
scripts, or FCPXML.

The core purpose is **clip identification + music suggestion + export to external tools.** Features
that turn it into a full video editor should be questioned and discussed before implementation.

Analysis runs through one of three providers: Google Gemini (native video), a custom
OpenAI-compatible endpoint (OpenRouter / local vLLM / local llama.cpp), or the local Marlin-2B
clip-ID model.

Formerly named "FPV.AI Editor". Header, title, and package are now branded **frameGrep**, but
several localStorage keys and backup filenames still use the `fpv_` prefix.

## Commands

```bash
npm install
npm run dev              # dev server, http://localhost:3008 by default
npm run build            # production build
npm run preview          # preview the production build

npm test                 # vitest run
npm run test:smoke       # node --test, stabilization smoke check
npm run typecheck        # tsc --noEmit (app)
npm run typecheck:tests  # tsc --noEmit -p tsconfig.tests.json
npm run check            # typecheck + typecheck:tests + test + build
```

Run `npm run check` before declaring work done. Tests are vitest, colocated as `*.test.ts` next to
the code they cover (heaviest in `src/domain/`). There is no ESLint or Prettier; style is convention
only.

PM2 (`ecosystem.config.cjs`) runs `npm run dev`, not a production build. That is intentional: the
dev server hosts middleware and proxies the app needs (see
[docs/architecture.md](docs/architecture.md#dev-server-surface-viteconfigts--server)).

## Environment

Set keys in `.env.local` (all optional, users can also enter keys in the Settings UI):

```bash
VITE_GEMINI_API_KEY=AIza...
VITE_OPENROUTER_API_KEY=sk-or-v1-...
VITE_OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1
VITE_OPENROUTER_MODEL=qwen/qwen3-vl-235b-a22b-instruct
VITE_FRAME_EXTRACTION_FPS=0.5     # fixed extraction fps; default is adaptive
VITE_JAMENDO_CLIENT_ID=4d45d0dd

FRAMEGREP_PORT=3008               # dev server port
FRAMEGREP_HOST=127.0.0.1          # 0.0.0.0 to expose on the LAN
ALLOWED_HOST=my.domain.com        # comma-separated extra hostnames
```

## Orientation

Source lives under `src/`; config files stay at the project root. `@/*` maps to `src/`.

- `App.tsx` is the orchestrator and the only integration point. All state lives in hooks created
  there and passes down as props: no Context, no Redux, no Zustand. Cross-hook logic goes in
  `App.tsx`.
- `src/domain/` holds pure, tested logic (media, presets, project). Provider output is normalized
  here before it becomes `ClipSegment[]`.
- `src/services/` holds I/O and API clients. Every analysis backend implements the `ProviderAdapter`
  contract in `services/providerAdapter.ts`.
- `src/types.ts` holds every shared interface.

Keep files under 300 lines where practical. Accepted exceptions: `App.tsx`,
`constants/defaultPresets.ts`, `constants/fpvMoves.ts`.

## Gotchas worth knowing up front

- **Keep `LOCAL_CONTEXT_TOKENS` in `localVLMService.ts` in sync with `VLLM_MAX_LEN` in
  `.env.local`.** The local frame budget is derived from it. A stale value silently overflows the
  vLLM context.
- **FPV presets append the move dictionary at runtime**, in `useVideoAnalysis.ts`. Do not bake the
  vocabulary into preset text, and keep AI Polish from generating a `MOVE VOCABULARY` section.
- **Gemini defaults to 1 fps sampling, which misses sub-second FPV action.** frameGrep overrides
  this to 4 fps via `geminiFps`.
- **Gemini models are a curated list, not fetched from Google.** Add a model in two places:
  `GEMINI_ANALYSIS_MODELS` in `services/geminiModels.ts` and the `GeminiModel` union in `types.ts`.
  Only video-in, text-out models belong there. See [docs/providers.md](docs/providers.md) for why
  `ListModels` is not used.
- **Settings auto-save 500ms after any change.** The Settings modal's "Save Settings" button is
  redundant, kept only for clarity.
- **Projects do not store video.** Reloading a project requires re-uploading the source files.
- Clip times are `"MM:SS"` strings internally across every provider.

## Deeper reference

| Doc | Covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Stack, file map, state management, both data flows, dev server middleware and proxies, code organization rules. |
| [docs/providers.md](docs/providers.md) | Gemini models and sampling knobs, adaptive frame extraction and budget math, OpenRouter/vLLM notes, Marlin, FPV prompts, music suggestions. |
| [docs/persistence.md](docs/persistence.md) | localStorage keys, presets, projects, auto-backup, folder linking, backup file naming. |
| [docs/local-inference-cheatsheet.md](docs/local-inference-cheatsheet.md) | Running the local vLLM / llama.cpp / Marlin stacks. |
| [docs/model_test_notes.md](docs/model_test_notes.md) | Empirical model comparisons behind the default model choice. |
| [docs/fpv-move-research.md](docs/fpv-move-research.md) | Source research for the canonical move dictionary. |
