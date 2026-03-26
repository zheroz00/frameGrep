# Design: Migrate Source Files to `src/` Directory

## Context

The project has all source files at the root (no `src/` directory). This is non-standard for a Vite/React project and will draw unnecessary criticism when open-sourcing. Moving to a conventional `src/` structure removes a low-hanging objection while the diff is minimal — all internal imports use relative paths that remain valid after the move.

## What Moves

Into `src/`:
- `App.tsx`, `types.ts`, `index.tsx`
- `components/`, `hooks/`, `services/`, `utils/`, `constants/`

Stays at root:
- `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`
- `public/`, `transcode/`, `docs/`, `dist/`
- `.env.local`, `.gitignore`, `.mcp.json`, `ecosystem.config.cjs`, `CLAUDE.md`

## Config Changes (3 files)

### index.html (line 44)
```html
<!-- Before -->
<script type="module" src="/index.tsx"></script>
<!-- After -->
<script type="module" src="/src/index.tsx"></script>
```

### vite.config.ts (line 28)
```ts
// Before
'@': path.resolve(__dirname, '.')
// After
'@': path.resolve(__dirname, 'src')
```

### tsconfig.json (line 23)
```json
// Before
"@/*": ["./*"]
// After
"@/*": ["./src/*"]
```

## Import Changes

**None.** All 25 source files use relative imports (`../types`, `../services/...`). Since the internal directory structure is preserved, every relative path remains valid.

## CLAUDE.md Updates

- Update the "Flat file structure" note in Project Overview to reflect the new `src/` structure
- Update the `@/*` path alias description
- Update Key Architectural Files paths to include `src/` prefix

## Verification

1. `npm run build` — must succeed with no new errors
2. `npm run dev` — dev server must start and app must load at localhost:3006
3. Spot-check: open app in browser, verify video upload UI renders, settings modal opens
