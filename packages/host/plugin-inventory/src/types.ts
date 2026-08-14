import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable Loader-tree identity of one configured plugin entry. */
export type PluginEntryId = Branded<'PluginEntryId'>

/** Lifecycle state of an entry's root Fiber, or null when it has no live root Fiber. */
export type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** One non-group Loader entry exposed to trusted clients. */
export interface PluginInventoryEntry {
  readonly entryId: PluginEntryId
  /** Exact module specifier imported by the Loader entry. */
  readonly moduleName: string
  /** Effective Loader enablement, including disabled ancestor groups. */
  readonly enabled: boolean
  readonly fiberPhase: PluginFiberPhase
}

/** Point-in-time inventory returned by the plugin inventory Remote. */
export interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
}

/** Flip the effective enablement of one Loader entry via the user patch layer. */
export interface PluginInventorySetEnabledRequest {
  /** Loader-tree id of the entry to flip, as reported by the inventory. */
  readonly entryId: PluginEntryId
  /** Desired effective enablement for the entry itself. */
  readonly enabled: boolean
}

/** The requested Loader entry does not exist in the current tree. */
export interface PluginInventoryEntryNotFound {
  readonly code: 'entry-not-found'
  readonly entryId: PluginEntryId
}

/** The entry is host app glue and cannot be toggled by a user patch. */
export interface PluginInventoryEntryFixed {
  readonly code: 'entry-fixed'
  readonly entryId: PluginEntryId
}

/** The running profile has no writable user patch layer to persist into. */
export interface PluginInventoryProfileLayerUnavailable {
  readonly code: 'profile-layer-unavailable'
}

/** Persisting or live-applying the patch failed. */
export interface PluginInventoryPatchWriteFailed {
  readonly code: 'patch-write-failed'
  readonly message: string
}

/** Failures shared by the plugin-inventory mutation. */
export type PluginInventorySetEnabledFailure =
  | PluginInventoryEntryNotFound
  | PluginInventoryEntryFixed
  | PluginInventoryProfileLayerUnavailable
  | PluginInventoryPatchWriteFailed

/** Successful mutation result. */
export interface PluginInventorySuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected mutation result with a stable business failure. */
export interface PluginInventoryRejected<E extends PluginInventorySetEnabledFailure> {
  readonly ok: false
  readonly error: E
}

/** Result returned by the plugin-inventory `setEnabled` operation. */
export type PluginInventorySetEnabledResult =
  | PluginInventorySuccess<PluginInventorySnapshot>
  | PluginInventoryRejected<PluginInventorySetEnabledFailure>
