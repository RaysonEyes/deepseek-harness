import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginInventoryGateway from '../src/index.ts'
import type { PluginEntryId } from '../src/types.ts'

const contexts: Context[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function entryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

const activePlugin: Plugin.Function = () => {}
const pendingPlugin: Plugin.Object = {
  inject: ['neverReady'],
  apply() {},
}

async function harness(): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.pending = pendingPlugin
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory }
}

/**
 * A file-backed harness shaped like the shipped profiles: an empty root
 * config with the bundle rows supplied through the root include's patch stack.
 * @returns the gateway, the profile directory, and the include entry.
 */
async function patchedHarness(): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
  profileDir: string
  patchPath: string
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.include = Include
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-inventory-'))
  tempDirs.push(profileDir)
  const configPath = join(profileDir, 'cordis.yml')
  writeFileSync(configPath, '[]\n')
  const rootInclude = {
    id: 'include',
    name: 'cordis:include',
    config: {
      path: pathToFileURL(configPath).href,
      patches: [
        {
          insert: [
            { id: 'tool-x', name: 'cordis:active' },
            { id: 'tool-y', name: 'cordis:active', disabled: true },
          ],
        },
      ],
    },
  }
  await ctx.loader.create(rootInclude)
  await ctx.loader.await()
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory, profileDir, patchPath: join(profileDir, 'cordis.patch.yml') }
}

describe('PluginInventoryGateway', () => {
  it('publishes list and setEnabled under the pluginInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'pluginInventory',
      namespace: 'pluginInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'setEnabled', invocation: { kind: 'direct' } },
    ])
  })

  it('projects current non-group Loader entries without a second cache', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const pendingId = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledId = await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })
    await ctx.loader.create({ name: 'cordis:active', group: true })

    const snapshot = inventory.list()
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      {
        entryId: activeId,
        moduleName: 'cordis:active',
        enabled: true,
        fiberPhase: 'active',
      },
      {
        entryId: pendingId,
        moduleName: 'cordis:pending',
        enabled: true,
        fiberPhase: 'pending',
      },
      {
        entryId: disabledId,
        moduleName: 'cordis:not-installed',
        enabled: false,
        fiberPhase: null,
      },
    ]))

    await ctx.loader.update(activeId, { disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      enabled: false,
      fiberPhase: null,
    })

    await ctx.loader.remove(pendingId)
    expect(inventory.list().entries.some(entry => entry.entryId === pendingId)).toBe(false)
  })

  it('rejects toggling an unknown entry id', async () => {
    const { inventory } = await harness()
    await expect(inventory.setEnabled({ entryId: entryId('ghost'), enabled: true })).resolves.toEqual({
      ok: false,
      error: { code: 'entry-not-found', entryId: entryId('ghost') },
    })
  })

  it('rejects toggling without a profile patch layer', async () => {
    const { ctx, inventory } = await harness()
    const id = await ctx.loader.create({ name: 'cordis:active' })
    await expect(inventory.setEnabled({ entryId: entryId(id), enabled: false })).resolves.toEqual({
      ok: false,
      error: { code: 'profile-layer-unavailable' },
    })
  })

  it('rejects toggling the bootstrap include row itself', async () => {
    const { inventory } = await patchedHarness()
    await expect(inventory.setEnabled({ entryId: entryId('include'), enabled: false })).resolves.toEqual({
      ok: false,
      error: { code: 'entry-fixed', entryId: entryId('include') },
    })
  })

  it('persists and live-applies a disable override through the patch layer', async () => {
    const { inventory, patchPath } = await patchedHarness()
    const result = await inventory.setEnabled({ entryId: entryId('include:tool-x'), enabled: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entries.find(entry => entry.entryId === 'include:tool-x')?.enabled).toBe(false)

    const persisted = readFileSync(patchPath, 'utf8')
    expect(persisted).toContain('tool-x')
    expect(persisted).toContain('disabled: true')
  })

  it('re-enables a row disabled by a bundle layer and replaces, not duplicates', async () => {
    const { inventory, patchPath } = await patchedHarness()
    const enabled = await inventory.setEnabled({ entryId: entryId('include:tool-y'), enabled: true })
    expect(enabled.ok).toBe(true)
    if (!enabled.ok) return
    expect(enabled.value.entries.find(entry => entry.entryId === 'include:tool-y')?.enabled).toBe(true)
    expect(readFileSync(patchPath, 'utf8')).toContain('disabled: false')

    const disabled = await inventory.setEnabled({ entryId: entryId('include:tool-y'), enabled: false })
    expect(disabled.ok).toBe(true)
    if (!disabled.ok) return
    expect(disabled.value.entries.find(entry => entry.entryId === 'include:tool-y')?.enabled).toBe(false)
    const persisted = readFileSync(patchPath, 'utf8')
    expect(persisted.match(/tool-y/g)).toHaveLength(1)
    expect(persisted).toContain('disabled: true')
  })
})
