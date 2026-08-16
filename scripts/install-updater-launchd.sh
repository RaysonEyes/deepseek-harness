#!/usr/bin/env bash
# Install (or reinstall) the launchd agent that runs scripts/update-from-upstream.sh on
# a schedule, and verify it with an immediate kickstart.
#
# Usage:
#   scripts/install-updater-launchd.sh [interval_seconds]
#   (default 3600 = hourly; e.g. 86400 = daily, 1800 = every 30 min)
#
# Uninstall:
#   launchctl bootout "gui/$(id -u)/com.dsh.upstream-updater" && rm ~/Library/LaunchAgents/com.dsh.upstream-updater.plist
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.dsh.upstream-updater"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
INTERVAL="${1:-3600}"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>$REPO_ROOT/scripts/update-from-upstream.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>$INTERVAL</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/$LABEL.out.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/$LABEL.err.log</string>
</dict>
</plist>
EOF

# Validate the plist and (re)load the agent.
plutil -lint "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"

echo "installed: $PLIST"
echo "schedule: every ${INTERVAL}s (next run on the interval; an immediate first run happened at load)"
echo "detail log: $HOME/.dsh/updater/updater.log"
