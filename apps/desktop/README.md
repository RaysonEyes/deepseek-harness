# DeepSeek Harness Desktop (macOS)

A native macOS desktop shell for the DeepSeek Harness web GUI. The app bundles the built `dsh` CLI
closure and the web frontend dist, spawns the `dsh web` backend as a child of its own binary in
`ELECTRON_RUN_AS_NODE` mode, and opens the browser surface in a standard macOS window — no system
Node installation required.

## What it packages

- **Backend**: the built `@deepseek-ai/dsh` CLI closure (deployed with `pnpm deploy` into
  `resources/backend`, symlinks materialized to real files) booted as `dsh web --port 0`. The web
  profile serves the frontend dist and the `/api` gateway itself; the shell only reads the printed
  `dsh web: http://127.0.0.1:PORT` readiness line to learn the OS-assigned port. The backend is
  spawned with `--expose-internals`: the web profile boots cordis-plugin-hmr, whose loader needs
  Node's internal module loader, and the closure's node-addon-require-builtin fallback cannot provide
  it under Electron's Node runtime.
- **Frontend**: `@deepseek-ai/dsh-web-frontend/dist`, which rides in the closure through
  `@deepseek-ai/dsh-web-app`'s dependency on it.
- **Shell**: Electron (the backend child runs on the app's own binary via `ELECTRON_RUN_AS_NODE`,
  BrowserWindow for the surface). The terminal panel's `node-pty` addon is an N-API prebuild, so it
  loads under Electron's Node runtime unchanged.

## Building

Prerequisites: the repository built with `pnpm run build` (the deploy packs each package's
`lib/` and the web `dist/`).

```sh
pnpm install
pnpm --filter @deepseek-ai/dsh-desktop run build        # compile the Electron main (lib/)
pnpm --filter @deepseek-ai/dsh-desktop run build:icon   # rasterize build/icon.png from the favicon
pnpm --filter @deepseek-ai/dsh-desktop run build:backend # deploy the CLI closure into resources/backend
pnpm --filter @deepseek-ai/dsh-desktop run build:app    # all of the above + electron-builder --mac
```

Artifacts land in `apps/desktop/dist-app/`: `DeepSeek Harness-<version>-arm64.dmg`,
`DeepSeek Harness-<version>-arm64-mac.zip`, and the unpacked `mac-arm64/DeepSeek Harness.app`.
The build is ad-hoc signed (no Apple Developer ID); Gatekeeper will warn on machines other than the
builder until the app is notarized with a real identity.

## Running from the repository (dev mode)

```sh
pnpm --filter @deepseek-ai/dsh-desktop run dev
```

The same `resources/backend` closure is used; rebuild it after any `pnpm run build` that changes
the CLI or frontend.

## Verification hooks

- `DSH_DESKTOP_CAPTURE=/path/to/shot.png` — capture the window to a PNG after the page settles.
- `DSH_DESKTOP_QUIT_AFTER_CAPTURE=1` — exit after the capture (for non-interactive smoke runs).
- `DSH_DESKTOP_NO_DIALOGS=1` — suppress the native error dialogs: log and quit instead, so a
  failing backend cannot hang a headless run on an unclickable alert.

```sh
DSH_DESKTOP_CAPTURE=/tmp/dsh-desktop.png DSH_DESKTOP_QUIT_AFTER_CAPTURE=1 \
  pnpm --filter @deepseek-ai/dsh-desktop exec electron .
```

## Layout

```
src/main.ts            Electron main: backend fork, URL parse, window lifecycle, capture hook
scripts/build-backend.mjs  CLI closure deploy + symlink materialization
scripts/render-icon.mjs    icon.svg → build/icon.png via rsvg-convert (qlmanage fallback)
electron-builder.yml       mac target (dmg + zip, arm64), extraResources: backend closure
resources/backend/         build artifact (gitignored): the deployed CLI closure
dist-app/                  build artifact (gitignored): the packaged .app/.dmg/.zip
```

## Notes

- Data (profiles, settings, sessions) lives under the default `~/.dsh`, shared with any CLI
  installation.
- Only the arm64 (Apple Silicon) target is built; add `x64` to `mac.target[].arch` to also emit an
  Intel build (built on an Intel machine or via a universal build setup).
- Windows is out of scope: `dsh web` deliberately refuses `--host 0.0.0.0`, and the desktop shell is
  macOS-only by design (see the architecture note).
