#!/usr/bin/env bash
# One-command rebuild of the macOS desktop app: repo build → closure deploy →
# electron-builder packaging → headless smoke capture.
#
# Usage (from the repository root):
#   scripts/rebuild-desktop-app.sh
#
# Prerequisites: pnpm workspace installed, macOS arm64 build target. When
# GitHub downloads are slow, export ELECTRON_BUILDER_BINARIES_MIRROR, e.g.
#   ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> pnpm install (sync workspace)"
CI=true pnpm install

echo "==> repo build (lib + web dist)"
CI=true pnpm run build

echo "==> desktop: icon, Electron main, backend closure, electron-builder package"
CI=true pnpm --filter @deepseek-ai/dsh-desktop run build:icon
CI=true pnpm --filter @deepseek-ai/dsh-desktop run build:app

APP_BIN="apps/desktop/dist-app/mac-arm64/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"
if [[ ! -x "$APP_BIN" ]]; then
  echo "error: packaged app binary not found at $APP_BIN" >&2
  exit 1
fi

echo "==> headless smoke: boot the packaged app against a fresh profile and capture"
SMOKE_HOME="$(mktemp -d)"
CAPTURE="$(mktemp -t dsh-desktop-smoke).png"
DSH_HOME="$SMOKE_HOME" \
DSH_DESKTOP_CAPTURE="$CAPTURE" \
DSH_DESKTOP_QUIT_AFTER_CAPTURE=1 \
DSH_DESKTOP_NO_DIALOGS=1 \
"$APP_BIN" >/tmp/dsh-desktop-smoke.log 2>&1 || true
rm -rf "$SMOKE_HOME"

if [[ -s "$CAPTURE" ]]; then
  SIZE="$(stat -f%z "$CAPTURE")"
  echo "==> smoke OK: capture $CAPTURE (${SIZE} bytes)"
  if (( SIZE < 20000 )); then
    echo "warning: capture is small (${SIZE} bytes); inspect $CAPTURE — the window may be blank" >&2
  fi
else
  echo "error: no capture written; see /tmp/dsh-desktop-smoke.log" >&2
  exit 1
fi

echo
echo "==> artifacts:"
ls -la apps/desktop/dist-app/ | grep -vE '^d|^total'
