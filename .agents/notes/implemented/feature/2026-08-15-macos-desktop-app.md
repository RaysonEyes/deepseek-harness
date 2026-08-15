# Agent Note: macOS desktop app — an Electron shell for the web GUI

Status: implemented

English | [中文](2026-08-15-macos-desktop-app.zh.md)

## Problem

The repository ships two user surfaces: the `dsh` CLI and the web GUI served by `dsh web` (the browser profile over `dsh-base` + `dsh-web-app`). There is no way for a non-technical macOS user to open the harness as a native application: the CLI requires a Node installation, and the browser surface requires manually running a command and keeping a terminal alive. `dsh web` is already a complete self-serving backend — it hosts the frontend dist, the `/api` gateway, the terminal WebSocket, and prints a `dsh web: http://127.0.0.1:PORT` readiness line on stdout — so the desktop shell does not need to re-serve anything; it needs to own the backend process lifecycle and put the surface in a native window.

## Decision

### An Electron shell over the deployed `dsh` CLI closure

`apps/desktop` (`@deepseek-ai/dsh-desktop`, private) is an Electron app whose main process spawns the built `dsh` CLI in `web` mode as a child of the app's own binary in **`ELECTRON_RUN_AS_NODE`** mode (`child_process.spawn(process.execPath, ...)`), with `--port 0` so the OS assigns a free port and the shell parses the actual port from the readiness line. Running the backend on the bundled binary gives it the app's Node runtime, so the distributed .app needs no system Node; the web profile serves everything the window loads. The frontend dist arrives in the closure through `@deepseek-ai/dsh-web-app`'s dependency on `@deepseek-ai/dsh-web-frontend`, so the shell bundles zero frontend assets of its own.

### Backend closure: the SDK runtime deploy route, reused

The backend is deployed exactly like the SDK runtime distribution: `pnpm --filter @deepseek-ai/dsh deploy --legacy --prod --config.node-linker=hoisted --config.auto-install-peers=false --config.link-workspace-packages=true` into `resources/backend`, then every staged symlink is materialized to real bytes (the packaged app has no repository and no pnpm store). The four deploy flags are grounded in the same measurement the single-exe note records. `node-pty`'s darwin-arm64 prebuild is an N-API addon (its symbol table is N-API only), so it loads under Electron's Node runtime unchanged — no rebuild, no electron-rebuild pass, `npmRebuild: false` in the builder config. The shell spawns the backend with `--expose-internals`: the web profile boots cordis-plugin-hmr, whose loader needs Node's internal module loader, and the closure's node-addon-require-builtin fallback cannot provide it under Electron's Node (the embedder symbol it needs is absent there). Electron's `utilityProcess` cannot pass that flag in a packaged app — its `IsAllowedOption` refuses `--expose-internals` unless `ELECTRON_RUN_AS_NODE` is set — so the run-as-node child is the only bundled-runtime route that satisfies the loader.

### Packaging and verification

electron-builder emits a `.dmg` + `.zip` + `.app` for arm64 (Apple Silicon) with ad-hoc signing (no Developer ID; notarization is a distribution follow-up). Three env-gated hooks make the shell verifiable headlessly: `DSH_DESKTOP_CAPTURE` captures the window to a PNG after the page settles, `DSH_DESKTOP_QUIT_AFTER_CAPTURE=1` exits after the capture, and `DSH_DESKTOP_NO_DIALOGS=1` turns the fatal-error dialogs into logged quits so a failing backend cannot hang a headless run.

## Consequences

Bought: a distributable macOS app with no Node prerequisite and no port conflicts (`--port 0`), reusing the proven closure deploy instead of inventing a second packaging pipeline, and a verification path (screenshot capture) that does not need an interactive display to prove the window loads. Cost: the .app embeds a full CLI closure (hundreds of MB, like other Electron apps), data is shared with any CLI installation under `~/.dsh`, and the app is macOS/arm64-only in this iteration (the web profile already refuses non-loopback hosts, so a LAN-exposed desktop build is a non-goal).

## Alternatives considered

- **Electron main serving the frontend itself.** Rejected: that duplicates the web profile's host rows (webserver, frontend-static, apiproxy, terminal websocket) and drifts from the browser surface; forking the real CLI keeps one source of truth for "what the web GUI is".
- **System `node` via `child_process.spawn`.** Rejected: requires a Node >= 22.19 installation on the user's machine, contradicting "a native app for non-technical users". The shipped spawn uses `process.execPath` (the app's own binary) in `ELECTRON_RUN_AS_NODE` mode, which keeps the bundled-runtime property that the utility process was chosen for.
- **A second `pkg` single-file executable for the web CLI.** Rejected: the SDK runtime exe is JSON-RPC-only; building a web-mode exe is a separate distribution concern and the plain closure already works under Electron.
- **Tauri.** Rejected: introduces a Rust toolchain and a sidecar story for a Node backend with no benefit over Electron for an app that is a web surface.

## Testing

A smoke run spawns the deployed closure with `electron .`, waits for the readiness line, loads the URL, captures the window (`DSH_DESKTOP_CAPTURE`), and exits (`DSH_DESKTOP_QUIT_AFTER_CAPTURE`); the captured PNG is compared against the served GUI by inspection. The packaged `.app` binary is exercised the same way from `dist-app/mac-arm64/` to prove the extraResources layout and the bundled runtime. The closure build verifies the entry, the frontend index, and the agent presets exist before finishing.

## Related

- [Single-file executable SDK runtime distribution](2026-07-10-single-file-executable-sdk-runtime-distribution.md) — the deploy flags, node-pty handling, and closure materialization this app reuses.
- [Web workspace file links](2026-07-31-web-workspace-file-links.md) — records the desktop-shell WebView as the future home for an owned preview container; the Electron shell is that home now.
