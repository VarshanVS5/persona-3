# Change requests from Person 3

## 1. `apps/desktop-ui/src-tauri/tauri.conf.json` (needs project-owner approval, D9)

Edited on the Person 3 branch; the project owner must review before merge.

| Field | Before | Now | Why |
|---|---|---|---|
| `version` | 0.0.0 | 0.1.0 | Matches `apps/desktop-ui/package.json` and the About view. |
| `build.beforeDevCommand` / `beforeBuildCommand` | none | `pnpm run dev` / `pnpm run build` | `tauri dev` and `tauri build` start and build the UI. |
| `app.windows[0]` | 1200x800 | adds `minWidth 960`, `minHeight 600`, label `main` | Minimum window size; capability targets label `main`. |
| `app.security.csp` | `connect-src 'self' http://127.0.0.1:8765` | `connect-src 'self' http://127.0.0.1:* ipc: http://ipc.localhost`, `style-src 'self'` | The user may choose another loopback port; Tauri IPC needs `ipc:`. Still loopback only. |
| `app.security.devCsp` | none | allows `ws://127.0.0.1:*` and inline styles | Vite hot reload in `tauri dev` only. |
| `bundle.icon` | empty | five generated icons in `src-tauri/icons` | Installer and taskbar icon. Source: `reference/person-3-ui-character/assets/atlas-icon.svg`. |

Not changed: identifier, bundle targets, signing (none), sidecar (none). The backend is not started by the shell yet.

## 2. Backend endpoints the UI needs (owners: project owner / Person 1 / Person 2)

The UI shows an explicit "unavailable" or "not reported" state for each until they exist.

| Need | Used by | Suggested owner |
|---|---|---|
| Audit journal read endpoint | Audit journal view (currently lists session events only) | Person 1 (journal) |
| Provider status (9Router, Transcribe, Polly enabled/disabled) | Settings > Providers (currently "unknown") | Person 2 |
| Permission scope: allowlisted apps and directories | Settings > Permissions (currently "Not reported by backend") | Person 1 |
| Backend version in `/api/v1/health` | About view (currently "Backend version: not reported") | Project owner |
| Speech capability flag and an audio/dictation endpoint | Voice control (not shown; typed input only) | Person 2 |
| Optional `compensationVerified` flag on `verification_passed` payload | "Reversible" statement (UI reads it only if present) | Person 1 |

Contract note: `events.schema.json` `ConfirmationPayload` carries no target list, so the approval dialog derives targets from the plan the user reviewed.
