OWNER: Person 3 - UI & Animated Character - do not edit without owner approval

# apps/desktop-ui - Project ATLAS Windows desktop app (Tauri 2 shell + React/TypeScript UI)

The UI layer is implemented and tested. The Tauri shell is written but **has not been compiled** (no Rust toolchain on the authoring machine), so no installer or `.exe` exists yet.

## What is here

| Path | Purpose |
|---|---|
| `src-tauri/` | Tauri 2 shell: native window (min 960x600), settings file in app data, close handshake permission. No process launching, no automation. |
| `src/services/atlasClient.ts` | Live REST/SSE client for `docs/api-contract.md`. Loopback only, per-request timeouts, schema-validated, typed errors. |
| `src/services/mockClient.ts` | Mock client replaying `packages/contracts/examples/`. Used only when the user picks Mock mode. |
| `src/lib/` | Pure logic: event reducer, outcome and character mapping, redactor, settings, validation. |
| `src/hooks/useAtlas.ts` | Task controller: submit, approve, cancel, SSE-to-polling fallback, inactivity timer. |
| `src/components/`, `src/app/` | Character, command bar, transcript, plan inspector, approval dialog, timeline, result panel, first launch, journal, settings, about. |

## Prerequisites

- Windows 10/11 x64 with WebView2 (preinstalled on Windows 11; the installer bootstraps it on Windows 10).
- Node 20+ (tested with 24.13) and pnpm 9.15 (`packageManager` in the root `package.json`).
- For the desktop shell only: Rust (stable, MSVC toolchain) and Visual Studio Build Tools with "Desktop development with C++". See https://tauri.app/start/prerequisites/.

## Install

```powershell
pnpm install                     # from the repo root (the project owner regenerates pnpm-lock.yaml)
```

## Run

Mock mode (no backend, nothing is executed):

```powershell
cd apps/desktop-ui
pnpm run tauri:dev               # opens the desktop window; choose "Mock mode" on first launch
```

`pnpm run dev` alone serves the UI on http://127.0.0.1:5173 for quick development in a browser. That is a developer convenience; settings then live in browser storage and window-close handling is inactive. It is not the product.

Live mode:

1. Start the backend (`services/atlas-core`) so it listens on `127.0.0.1:8765` (see its README; `ATLAS_MOCK_MODE=false` for real execution, `true` for backend-simulated).
2. Run `pnpm run tauri:dev`, choose "Live mode" on first launch (or in Settings). The banner shows `Live mode`, `Backend mock mode`, or `Disconnected`.

## Verify (commands and results are in the completion report)

```powershell
cd apps/desktop-ui
pnpm run lint
pnpm run test
pnpm run build                   # type-check + Vite production build of the UI
pnpm run tauri:build             # needs Rust; produces .msi/.exe under src-tauri/target/release/bundle
```

Installers are **not signed**. Windows SmartScreen may show an "unknown publisher" warning.

## Keyboard shortcuts

Ctrl+K focus command box - Ctrl+. cancel running task - Ctrl+Enter submit - Esc dismiss approval dialog (does not approve).

## Boundaries

- The UI is not a security boundary. It displays plans, relays approve/cancel through the documented endpoints, and never executes LLM output.
- Mock mode and Live mode use different clients, selected only by the user's explicit choice. A dead backend shows `Disconnected`; it never falls back to mock.
- Provider API keys are never requested or stored here. They belong in the backend `.env`.
- `src-tauri/tauri.conf.json` changes need project-owner approval (see `reference/person-3-ui-character/docs/change-requests/`).
