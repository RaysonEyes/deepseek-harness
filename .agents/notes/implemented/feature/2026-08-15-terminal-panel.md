# Agent Note: Web terminal panel — the live xterm terminal in the panel dock

Status: implemented

English | [中文](2026-08-15-terminal-panel.zh.md)

## Problem

The panel dock shipped Terminal as a fifth tab, but it rendered only the "coming soon" placeholder. The harness's terminal capability serves the model through persistent PTY sessions (the terminal seam), and nothing let the user open a live host shell inside the GUI: the browser surface had no bidirectional terminal channel and no terminal view.

## Decision

Two pieces, one host-side carrier and one browser-side surface. The browser side, `TerminalPanel` in `dsh-client-ui-panels`, was removed with the panel dock (see [Remove the web panel dock](../simplification/2026-08-16-remove-web-panel-dock.md)); this note retains the carrier design that survives.

**`@deepseek-ai/dsh-terminal-web`** mounts a WebSocket carrier on the web profile at `/api/terminal`: one connection owns one node-pty terminal. Raw output streams to the browser as `output` frames; the browser relays `input`, `resize`, and `close` frames back (JSON text frames). The connection is pinned to loopback Host headers exactly like the settings and credentials planes — it spawns a host shell, so no anonymous LAN caller may open one. Terminal semantics (shell choice, login flags) belong to the consuming surface; the carrier stays shell-agnostic over the subprocess seam, which provides the PTY and whole-session cleanup. The `SubprocessTerminalHandle` gains an optional `resize(cols, rows)`: the local provider forwards it to the PTY, and the carrier stashes a resize that beats the async spawn and applies it once the terminal exists, so the PTY never keeps a stale default size.

## Consequences

Bought: a live host terminal in the GUI with no model involvement and no new apiproxy domain — the upgrade route rides the existing webserver, and the loopback pin mirrors the settings plane. Cost: a host shell is as privileged as the settings plane (loopback-only by design; the web profile already refuses non-loopback hosts); one WebSocket connection and one node-pty instance per open tab; the terminal is browser-only state — nothing enters the session log or the model transcript.

## Alternatives considered

- **Reusing the model's persistent terminal seam.** Rejected: those sessions are model-visible artifacts (session-logged, replayable); a user's interactive shell must not enter the model transcript.
- **A new apiproxy request/response domain.** Rejected: a terminal is bidirectional streaming; the webserver's upgrade route is the fitting carrier.
- **Hosting the terminal inside the session-logged stream.** Rejected: it would couple a presentation surface to the model transcript and replay machinery.

## Testing

The carrier has no automated coverage yet: the WebSocket upgrade path, frame protocol, loopback pin, and resize stashing are exercised only by manual smoke. Carrier tests are the follow-up. The former browser-side dock spec that drove the Terminal tab was removed with `dsh-client-ui-panels` (see [Remove the web panel dock](../simplification/2026-08-16-remove-web-panel-dock.md)).

## Related

- [Remove the web panel dock](../simplification/2026-08-16-remove-web-panel-dock.md) — removed the browser-side `TerminalPanel` that consumed this carrier.
- [Persistent PTY sessions](2026-07-16-persistent-pty-sessions.md) — the terminal seam the carrier consumes for node-pty lifecycle.
