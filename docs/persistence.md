# Persistence and backups

Where frameGrep keeps state. See `CLAUDE.md` for the short version.

## localStorage

All app data lives in browser localStorage. Active keys:

| Key | Contents |
| --- | --- |
| `fpv_app_settings` | Provider config, API keys, model choices, sampling knobs. |
| `fpv_presets` | Default and custom prompt presets. |
| `fpv_projects` | Saved analysis sessions. |

Settings auto-save 500ms after every change, so no manual save is required. The Settings modal's
"Save Settings" button is effectively redundant and is kept only for clarity.

An orphan `fpv_settings` key from a pre-rename version of the code is auto-removed on load by a
one-shot cleanup in `useAppSettings.ts`. New installs never see it.

## Presets

Custom presets are saved alongside the defaults. Editing a default preset saves the modified
version rather than mutating the original.

## Projects

A project stores an analysis session (clips plus metadata) for later reload. Videos themselves are
not stored and must be re-uploaded.

## Auto-backup and folder linking

Auto-backup is optional. When on, it writes a JSON backup 30 seconds after changes (debounced).

Folder linking uses the File System Access API to link a local folder for silent auto-backups with
no download dialog. Directory handles persist to IndexedDB via `services/workspaceDirectory.ts`,
but the browser still requires a one-click "Reconnect" after a page refresh.

## File naming

- Manual exports use dated filenames: `fpv-presets-2024-01-07.json`, `fpv-projects-2024-01-07.json`.
- Auto-backups use static filenames that overwrite in place: `fpv-presets-auto-backup.json`,
  `fpv-projects-auto-backup.json`.

The Settings modal also offers a unified backup (`fpv-all-data-*.json`) containing presets plus
projects. Import auto-detects the format (bundle, presets-only, or projects-only).
