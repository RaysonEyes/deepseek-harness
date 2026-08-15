# @deepseek-ai/dsh-client-ui-panels

English | [中文](README.zh.md)

Top-right panel switcher: a dock of five tabs — Terminal, Browser, Review, Assistant, and Files — in the session header. Browser, Review and Files open as full-height, width-resizable companions on the right of the conversation; Terminal and the Assistant placeholder open in a height-resizable host below, and the two seats are independent so a right surface and the terminal can be open at once. Review lists the Git working-tree changes grouped by staging state and renders a unified diff per file over the `git` apiproxy domain. Files browses the workspace directory and reads text files through the `host.listDirectory`/`workspace.listDirectory` capability. Terminal mounts a tabbed strip of independent xterm surfaces over the `/api/terminal` WebSocket, kept alive across tab switches and preserved through a dock toggle until actively closed. Browser is a tabbed strip of independent pages — each an address bar plus a sandboxed `<iframe>` with a process-local Back/Forward history and a safe external link — kept alive across tab switches. Assistant still renders a "coming soon" placeholder. Review and Files render only while the selected session has a `cwd`; Browser and Terminal render for any session.

## Model Experience

None, as the panel dock is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The embedded browser cannot render pages that refuse framing** — a site that sends `X-Frame-Options` or `frame-ancestors` shows the browser's own block page, and the client cannot reliably detect it because the frame is cross-origin.
- **The address bar shows the requested URL, not the final one** — a cross-origin frame cannot be introspected, so redirects and in-page navigation do not update the bar, and the browser uses a process-local history rather than the frame's own.
- **Embedded pages run on an opaque origin** — the sandbox omits `allow-same-origin`, so embedded pages get no persistent cookies or storage and logins that need them do not persist across sessions.
- **The Assistant tab is not implemented** — it still renders the placeholder.
