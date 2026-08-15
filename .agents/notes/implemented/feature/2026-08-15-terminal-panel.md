# Agent Note: Web terminal panel — the live xterm terminal in the panel dock

Status: implemented

English | [中文](2026-08-15-terminal-panel.zh.md)

## Problem

The panel dock shipped Terminal as a fifth tab, but it rendered only the "coming soon" placeholder. The harness's terminal capability serves the model through persistent PTY sessions (the terminal seam), and nothing let the user open a live host shell inside the GUI: the browser surface had no bidirectional terminal channel and no terminal view.

## Decision

Two pieces, one host-side carrier and one browser-side surface.

**`@deepseek-ai/dsh-terminal-web`** mounts a WebSocket carrier on the web profile at `/api/terminal`: one connection owns one node-pty terminal. Raw output streams to the browser as `output` frames; the browser relays `input`, `resize`, and `close` frames back (JSON text frames). The connection is pinned to loopback Host headers exactly like the settings and credentials planes — it spawns a host shell, so no anonymous LAN caller may open one. Terminal semantics (shell choice, login flags) belong to the panel; the carrier stays shell-agnostic over the subprocess seam, which provides the PTY and whole-session cleanup. The `SubprocessTerminalHandle` gains an optional `resize(cols, rows)`: the local provider forwards it to the PTY, and the carrier stashes a resize that beats the async spawn and applies it once the terminal exists, so the PTY never keeps a stale default size.

**`TerminalPanel`** renders a tabbed strip of independent xterm surfaces over the WebSocket — each tab opens its own connection (one terminal per tab), and surfaces stay mounted across tab switches and through a dock toggle until actively closed, so switching away never kills a running shell. The panel reads the selected session's `cwd` (like Review/Files) and opens in the bottom host.

## Consequences

Bought: a live host terminal in the GUI with no model involvement and no new apiproxy domain — the upgrade route rides the existing webserver, and the loopback pin mirrors the settings plane. Cost: a host shell is as privileged as the settings plane (loopback-only by design; the web profile already refuses non-loopback hosts); one WebSocket connection and one node-pty instance per open tab; the terminal is browser-only state — nothing enters the session log or the model transcript.

## Alternatives considered

- **Reusing the model's persistent terminal seam.** Rejected: those sessions are model-visible artifacts (session-logged, replayable); a user's interactive shell must not enter the model transcript.
- **A new apiproxy request/response domain.** Rejected: a terminal is bidirectional streaming; the webserver's upgrade route is the fitting carrier.
- **Hosting the terminal inside the session-logged stream.** Rejected: it would couple a presentation surface to the model transcript and replay machinery.

## Testing

`panels.client.spec.tsx` drives the dock over all five tabs, asserting the Terminal tab opens the xterm surface (`en.tabTerminal`). The carrier has no automated coverage yet: the WebSocket upgrade path, frame protocol, loopback pin, and resize stashing are exercised only by manual smoke. Component-level xterm specs and carrier tests are the follow-up.

## Related

- [Web browser panel](2026-08-15-web-browser-panel.md) — the sibling dock tab; both open independent tabbed surfaces in the panel dock.
- [Persistent PTY sessions](2026-07-16-persistent-pty-sessions.md) — the terminal seam the carrier consumes for node-pty lifecycle.
