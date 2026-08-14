/** Host projection of the current Cordis Loader plugin entries, plus enablement control. */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import * as yaml from 'js-yaml'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  PluginEntryId,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventorySetEnabledFailure,
  PluginInventorySetEnabledRequest,
  PluginInventorySetEnabledResult,
  PluginInventorySnapshot,
  PluginInventoryRejected,
  PluginInventorySuccess,
} from './types.ts'

export type * from './types.ts'

/** File name of the profile user patch layer, applied after every bundle layer. */
const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'

/** Loader name of the bootstrap include that owns the whole profile tree. */
const ROOT_INCLUDE_NAME = 'cordis:include'

/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

/** Build a frozen success branch. */
function success<T>(value: T): PluginInventorySuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E extends PluginInventorySetEnabledFailure>(error: E): PluginInventoryRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Include entry config surface the gateway reads to locate the user patch layer. */
interface IncludeConfigShape {
  readonly path?: string
  readonly patches?: readonly PatchOptions[]
}

/**
 * Persist one id-targeted patch into the profile user patch layer: replace the
 * existing row's `disabled` override when present, otherwise append the row.
 * The input list is never mutated.
 */
interface EnablementOverride {
  readonly id: string
  readonly disabled: boolean
}

function mergePatchOverride(patches: readonly PatchOptions[], override: EnablementOverride): PatchOptions[] {
  const merged = structuredClone(patches) as PatchOptions[]
  const existing = merged.find(patch => patch.id === override.id)
  if (existing !== undefined) {
    existing.disabled = override.disabled
  } else {
    merged.push({ id: override.id, disabled: override.disabled })
  }
  return merged
}

/**
 * Remote-only service exposing the Loader's current non-group entry state and
 * a persistence path that flips one entry's effective enablement through the
 * profile user patch layer (the same layer `watchUserPatches` hot-applies).
 */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
  }

  /**
   * Read the Loader directly on every call. Cordis's internal plugin/status
   * events already maintain Entry.fiber and Fiber.state, so a second cache
   * would only add another lifecycle truth to keep synchronized.
   * @returns Current non-group Loader entries in Loader order.
   */
  @Remote('list')
  list(): PluginInventorySnapshot {
    const entries: PluginInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      entries.push({
        entryId: pluginEntryId(entry.id),
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
      })
    }
    return { entries }
  }

  /**
   * Flip one entry's effective enablement persistently. The override is merged
   * into the profile's `cordis.patch.yml` (so it survives restarts and the
   * existing patch watcher re-applies it) and immediately re-applied to the
   * running tree by refreshing the root include's patch stack.
   * @param request - target Loader entry and the desired enablement.
   * @returns the fresh inventory snapshot, or an explicit business failure.
   */
  @Remote('setEnabled')
  async setEnabled(request: PluginInventorySetEnabledRequest): Promise<PluginInventorySetEnabledResult> {
    const target = this.findEntry(request.entryId)
    if (target === undefined) {
      return rejected({ code: 'entry-not-found', entryId: request.entryId })
    }
    const include = this.rootInclude()
    if (include === undefined) {
      return rejected({ code: 'profile-layer-unavailable' })
    }
    if (include.id === request.entryId) {
      return rejected({ code: 'entry-fixed', entryId: request.entryId })
    }

    // Loader rows report full subtree paths (e.g. `include:tool-web`) while
    // patch layers target each row's local id as written in the composition.
    const rowId = target.options.id ?? target.id
    const override: EnablementOverride = { id: rowId, disabled: !request.enabled }
    const includeConfig = include.options.config as IncludeConfigShape
    const includeUrl = includeConfig.path
    if (typeof includeUrl !== 'string') {
      return rejected({ code: 'profile-layer-unavailable' })
    }
    const profileDir = fileURLToPath(new URL('.', includeUrl))
    const patchPath = join(profileDir, PROFILE_PATCH_FILENAME)

    try {
      const current = await readPatchFile(patchPath)
      await writePatchFile(patchPath, mergePatchOverride(current, override))
    } catch (error) {
      return rejected({
        code: 'patch-write-failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }

    // Live apply, mirroring watchUserPatches: refresh the include's patch stack
    // so the loader stops/starts the target fiber without waiting for the file
    // watcher. The appended override wins (patches apply in order).
    try {
      await include.update({
        config: {
          ...includeConfig,
          patches: [...(includeConfig.patches ?? []), override],
        },
      })
    } catch (error) {
      return rejected({
        code: 'patch-write-failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }

    return success(this.list())
  }

  /** First non-group Loader entry whose id matches, mirroring list(). */
  private findEntry(entryId: PluginEntryId): Entry | undefined {
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      if (entry.id === entryId) return entry
    }
    return undefined
  }

  /** The bootstrap include entry carrying the profile tree and its patch stack. */
  private rootInclude(): Entry | undefined {
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name === ROOT_INCLUDE_NAME) return entry
    }
    return undefined
  }
}

/** Parse one patch-layer file with the entry-list YAML dialect. */
async function readPatchFile(patchPath: string): Promise<PatchOptions[]> {
  let content: string
  try {
    content = await readFile(patchPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return []
    throw error
  }
  const parsed: unknown = yaml.load(content, { schema: entryListSchema })
  return Array.isArray(parsed) ? parsed as PatchOptions[] : []
}

/** Atomically persist the merged patch list back to the profile patch layer. */
async function writePatchFile(patchPath: string, patches: PatchOptions[]): Promise<void> {
  const content = yaml.dump(patches, { schema: entryListSchema })
  await writeFile(patchPath + '.tmp', content)
  await rename(patchPath + '.tmp', patchPath)
}

export default PluginInventoryGateway
