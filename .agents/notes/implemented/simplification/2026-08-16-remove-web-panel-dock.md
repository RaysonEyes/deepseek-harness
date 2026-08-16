# Agent Note: Remove the web panel dock (dsh-client-ui-panels)

Status: implemented

English | [中文](2026-08-16-remove-web-panel-dock.zh.md)

## Problem

The web profile shipped a top-right panel dock (`@deepseek-ai/dsh-client-ui-panels`) with five tabs — Terminal, Browser, Review, Assistant, Files — rendered by a single `PanelDock` beside the conversation. The dock's surfaces duplicated what an installable sidebar plugin now provides with a better experience and less surface: file rendering and editing, a terminal, Git, and a browser in one workbench. Keeping two overlapping browser surfaces means two codebases to maintain, two test suites, and a heavier default web bundle — with the panel dock as the weaker of the two.

## Decision

Remove the built-in web panel dock: delete `packages/client/ui-panels` and its `ui-panels` mount row from the web-app bundle patch. The `terminal-web` carrier (`@deepseek-ai/dsh-terminal-web`) stays — it is a host-side WebSocket transport, not a browser surface, and remains available for any future browser terminal. Users who want the dock's surfaces install a sidebar plugin (e.g. dsh-better-sidebar) into their profile instead.

The web profile no longer composes `ui-panels`; the composed tree, tsconfig client aggregate, and web-app dependencies drop the package. The `ui-panels` disable row in the user profile's `cordis.patch.yml` (added while the row still existed) is removed too, so the profile no longer references a deleted entry.

This removal consolidates the [web browser panel feature note](2026-08-15-web-browser-panel.md), whose only subject was the dock's `BrowserPanel`. Its decision survives here so the rationale is not lost:

- **Sandbox posture.** Each page is an address bar plus a sandboxed `<iframe>`; `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"` with `referrerPolicy="no-referrer"`, no `allow-top-navigation` (a frame-busting page cannot navigate the GUI) and no `allow-same-origin` (the framed page runs on an opaque origin and cannot reach the parent even when its URL shares the GUI origin). The GUI origin is never sent as a referrer.
- **Address normalization.** `toHttpUrl` accepts only `http:`/`https:` schemes; `javascript:`, `file:`, `data:`, `mailto:` and every other scheme return null and show the localized error; a schemeless value gets `https://`. **Open in new tab** is a real `<a target="_blank" rel="noopener noreferrer">` under the same http(s)-only rule the web result card applies.
- **History model.** Navigation is a React-managed local history stack — Back/Forward step the stack, Reload remounts the frame by bumping its React `key` — because a cross-origin frame is opaque, so the iframe's own history cannot drive the address bar.
- **Known limits.** Cross-origin frames are opaque (the bar shows the requested URL, not the final URL after redirects); pages that refuse framing show the browser's own block page; the opaque-origin sandbox gives embedded pages no persistent cookies or storage, so logins that require them do not persist.
- **Alternatives rejected then, still rejected now.** A host-side web proxy that fetches and re-renders pages (new apiproxy domain + security review; "browse the web" becomes "read a fetched snapshot"); reusing the model-facing `web_fetch` capability (a model tool with a result-view contract, not a user-facing navigation surface); driving Back/Forward from the iframe's own history (opaque frame cannot track the URL).

## Scope: what is and isn't removed

Removed:

- `packages/client/ui-panels` — the whole package: `PanelDock`, `TerminalPanel`, `BrowserPanel`, `ReviewPanel`, `FilesPanel`, stores, locales, CSS, the invariant companion, and its tests (`browser-panel.client.spec.tsx`, `panels.client.spec.tsx`, `invariant.client.spec.ts`).
- The `ui-panels` row in `packages/bundle/web-app/cordis.patch.yml`.
- The `@deepseek-ai/dsh-client-ui-panels` workspace dependency in `packages/bundle/web-app/package.json`, its tsconfig client aggregate entry, and the package README model-experience allowlist entry.
- The `ui-panels` disable row in the user profile's `cordis.patch.yml`.

RETAINED:

- `@deepseek-ai/dsh-terminal-web` — the WebSocket terminal carrier stays mounted at `terminal-web`; the browser half that consumed it (`TerminalPanel`) is gone, but the carrier is a host-side transport and out of scope for this surface removal.
- All other web browser roster rows and the `dsh-files` bundle plugin in the profile.

## Alternatives considered

- **Keeping the dock dormant (disabled) instead of deleting.** Rejected: a dormant surface still ships in the bundle, still carries its dependency and test weight, and still invites re-enabling the weaker duplicate later. The surfaces are fully provided by installable plugins, so there is no capability gap a dormant dock would cover.
- **Extracting the dock into a separate bundle layer.** Rejected: that keeps the maintenance and test burden alive for a surface the user no longer uses, and splits the panel into yet another layer to compose.
- **Keeping the built-in browser panel only.** Rejected: the browser was one tab of a dock whose other tabs (terminal, Git review, files) were already superseded by the sidebar plugin; keeping one tab means keeping the whole package and dock, which is the weaker duplicate this removal eliminates.

## Consequences

The default web bundle is smaller and the browser roster has one fewer surface. Users who want the dock's features install a sidebar plugin into their profile; the profile-level install path is already how the replacement was mounted. The `terminal-web` carrier loses its only in-tree browser consumer — a future browser terminal would either reuse it or replace it, and the terminal-panel Agent Note records that carrier's design. The embedded-browser security posture described here (http(s)-only, sandboxed opaque iframe) is the reference for any future in-GUI browser surface.

## Testing

The package's own tests are deleted with the package. The composed web profile tree is verified via `--dump-config` to contain no `ui-panels` row; repo-wide greps for `dsh-client-ui-panels` / `ui-panels` (excluding node_modules, lib, dist) find only the deletion, the web-app bundle removal, and this note. Absence is the verification: no current documentation presents the dock as available and no test exercises it as supported behavior.

## Related

- [Web terminal panel](2026-08-15-terminal-panel.md) — the carrier this removal leaves without an in-tree browser consumer.
