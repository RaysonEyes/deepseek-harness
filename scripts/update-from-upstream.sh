#!/usr/bin/env bash
# Check the upstream deepseek-ai/deepseek-harness for new commits and, when present,
# apply them (rebase master onto upstream/master), rebuild the desktop app, and post
# a macOS notification. Every run is logged to ~/.dsh/updater/updater.log.
#
# Run manually:
#   scripts/update-from-upstream.sh
# or on a schedule via scripts/install-updater-launchd.sh (recommended).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# node/pnpm resolve even when launched from a minimal environment (e.g. launchd).
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

LOG_DIR="$HOME/.dsh/updater"
LOG_FILE="$LOG_DIR/updater.log"
mkdir -p "$LOG_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"; }

notify() { # title message
  local q='"'
  osascript -e "display notification ${q}${2}${q} with title ${q}${1}${q}" >/dev/null 2>&1 || true
}

# Single-flight lock: skip when a previous run is still in progress.
LOCK_DIR="$REPO_ROOT/.git/updater.lock.d"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "skip: another updater run is still in progress"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Only operate on master; never rebase a random branch onto upstream.
if [ "$(git symbolic-ref --short HEAD)" != "master" ]; then
  log "skip: current branch is $(git branch --show-current), not master"
  exit 0
fi

# 1. Fetch upstream; nothing else runs if this fails.
if ! git fetch upstream --quiet; then
  log "error: git fetch upstream failed"
  notify "DeepSeek Harness 更新" "拉取上游失败,请检查网络或 git 配置"
  exit 1
fi

# 2. Count commits in upstream/master that local master does not have.
NEW_COMMITS=$(git rev-list --count master..upstream/master)
if [ "$NEW_COMMITS" -eq 0 ]; then
  log "up to date (0 new commits)"
  exit 0
fi
log "==> $NEW_COMMITS new upstream commit(s); applying"

# 3. The rebase needs a clean working tree.
if [ -n "$(git status --porcelain)" ]; then
  log "skip: working tree is dirty; commit or stash before updating"
  notify "DeepSeek Harness 更新" "上游有 $NEW_COMMITS 个新提交,但工作区有未提交改动,请先提交或 stash"
  exit 0
fi

# 4. Rebase the local master onto the new upstream master; abort on conflict.
if ! git rebase upstream/master; then
  git rebase --abort
  log "error: rebase conflicted; aborted, nothing changed"
  notify "DeepSeek Harness 更新" "应用上游更新失败(rebase 冲突),已回滚,请手动解决"
  exit 1
fi
log "rebase ok; head now: $(git log --oneline -1)"

# 5. Rebuild the desktop app so the running install can be replaced.
if ! "$REPO_ROOT/scripts/rebuild-desktop-app.sh" >> "$LOG_FILE" 2>&1; then
  log "error: rebuild failed; see $LOG_FILE"
  notify "DeepSeek Harness 更新" "已应用 $NEW_COMMITS 个新提交,但应用重新构建失败,详见日志 $LOG_FILE"
  exit 1
fi

# Keep the personal fork (origin) in sync after a successful update.
# Disable with DHS_UPSTREAM_PUSH_ORIGIN=0.
if [ "${DHS_UPSTREAM_PUSH_ORIGIN:-1}" != "0" ]; then
  if git push --force-with-lease origin master >> "$LOG_FILE" 2>&1; then
    log "origin master pushed"
  else
    log "warning: origin push failed (skipped)"
  fi
fi

log "==> update applied and desktop app rebuilt"
notify "DeepSeek Harness 更新" "已安装上游最新代码($NEW_COMMITS 个新提交)并重建应用,重启应用后生效"
