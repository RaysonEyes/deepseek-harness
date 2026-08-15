# Agent Note: Web browser panel — the embedded browser in the panel dock

Status: implemented

English | [中文](2026-08-15-web-browser-panel.zh.md)

## Problem

The panel dock shipped five tabs — Terminal, Browser, Review, Assistant, Files — but the Browser tab rendered only the "coming soon" placeholder, while Review, Files and Terminal were wired to real surfaces. The web capability exists only as the model-facing `web_search`/`web_fetch` tools with a `card: 'web'` result view, so nothing let the user browse the web themselves inside the GUI.

## Decision

`BrowserPanel` is a tabbed strip of independent embedded pages: each page is an address bar plus a sandboxed `<iframe>` that renders the submitted http(s) URL, and every page stays mounted while the panel is open so switching tabs restores that page's state. Navigation is a React-managed local history stack; **Back**/**Forward** step the stack, **Reload** remounts the frame by bumping its React `key`, and **Open in new tab** is a real `<a target="_blank" rel="noopener noreferrer">` so the current URL leaves the panel as a safe external link under the same http(s)-only rule the web result card applies. The address value is normalized by `toHttpUrl`: a value naming a scheme is accepted only for `http:`/`https:`, while `javascript:`, `file:`, `data:`, `mailto:` and every other scheme return null and show the localized error, and a schemeless value gets `https://`. The frame carries `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"` and `referrerPolicy="no-referrer"`: scripts, forms, popups and downloads work, `allow-top-navigation` is absent so a frame-busting page cannot navigate the GUI, `allow-same-origin` is absent so the framed page runs on an opaque origin and cannot reach the parent even when its URL shares the GUI origin, and the GUI origin is never sent as referrer. The panel reads no `api` and no `cwd` (unlike Review/Files it talks to no Host surface), and opens as a full-height companion on the right of the conversation rather than in the bottom host, independent of `cwd` because it reads no workspace.

## Consequences

Bought: a working embedded browser with zero Host changes, a deterministic and testable history model, and a safe-link posture consistent with the web result card. Cost: cross-origin frames are opaque, so the bar shows the requested URL rather than the page's final URL after redirects or in-page navigation, and pages that refuse framing (`X-Frame-Options`/`frame-ancestors`) show the browser's own block page with no reliable client-side detection. The opaque-origin sandbox gives embedded pages no persistent cookies or storage, so logins that require them do not persist across sessions.

## Alternatives considered

- **A Host-side web proxy that fetches and re-renders pages.** Rejected: it adds a new apiproxy domain and host route with a security review, and it turns "browse the web" into "read a fetched snapshot". The iframe needs no Host change and is the literal meaning of a built-in browser.
- **Reusing the model-facing `web_fetch` capability.** Rejected: that seam is a model tool with a result-view contract, not a user-facing navigation surface, and the client has no RPC path to it; wiring it through would couple a presentation panel to a model-tool contract.
- **Using the iframe's own history for Back/Forward.** Rejected: a cross-origin frame is opaque, so the bar could not track the current URL; a local React history stack is deterministic, testable, and keeps the address bar correct.

## Testing

`packages/client/ui-panels/tests/browser-panel.client.spec.tsx` pins the component: the empty-state hint and disabled controls, http(s) normalization (schemeless to `https://`, explicit http(s) preserved), rejection of a non-http(s) scheme with the error copy, Back/Forward stepping the local history, the safe external link attributes, and Reload preserving the address, plus a tab suite: one default page tab, adding a tab and restoring the previous tab's address on switch back, and closing the active tab. `panels.client.spec.tsx` opens the panel from the dock and asserts the start hint; its stale "terminal placeholder" test now targets the Assistant placeholder, the one remaining placeholder.

## Related

- [Web result card frontend](2026-07-30-web-result-card-frontend.md) — the safe-link rule and `card: 'web'` result view this panel complements.
- [Web workspace file links](2026-07-31-web-workspace-file-links.md) — records the desktop-shell WebView as the future home for an owned preview container.
