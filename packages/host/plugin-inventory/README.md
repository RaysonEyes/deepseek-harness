# @deepseek-ai/dsh-host-plugin-inventory

English | [中文](README.zh.md)

Host projection of the current Cordis Loader tree, plus a persistence path that flips one entry's effective enablement. `PluginInventoryGateway` registers the `pluginInventory` service and publishes two generated direct Remotes, `pluginInventory/list` and `pluginInventory/setEnabled`. Every `list` call reads `ctx.loader.entries()` directly, skips structural group rows, and returns the remaining entries in Loader order with only their Loader entry id, module specifier, effective enablement, and current root Fiber phase.

The phase is `pending`, `loading`, `active`, `failed`, or `unloading`; it is `null` when the entry has no live root Fiber. The snapshot is intentionally point-in-time: Loader remains the sole lifecycle authority, while this package owns no cache, history, provenance model, or event stream. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

`setEnabled` is the one mutation this package owns: it merges a `disabled` override for the target row into the profile's `cordis.patch.yml` user patch layer (so the change survives restarts and the existing patch watcher re-applies it) and immediately refreshes the root include's patch stack so the running tree stops or starts the entry. It never edits `cordis.yml`, never touches bundle layers, and rejects rows it cannot own (unknown ids and the bootstrap include row itself).

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit `api-remotes` assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time state only** — the result contains no durable failure history or subscription; a missing root Fiber is reported as `null`, regardless of why no live root exists.
- **No provenance** — the service does not identify which bundle, profile, or override introduced an entry.
- **Effective enablement can lag** — a row disabled by a disabled ancestor group stays effectively disabled even after `setEnabled` flips the row's own override; only the row's own option changes.
