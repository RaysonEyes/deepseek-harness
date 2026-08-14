// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginInventorySettingsTab } from '../src/client/PluginInventorySettingsTab.tsx'
import type {
  PluginInventorySettingsTabInjected,
  PluginInventorySettingsTabProps,
} from '../src/client/PluginInventorySettingsTab.tsx'
import type { PluginInventorySetEnabledRequest } from '@deepseek-ai/dsh-api-remotes/client'
import { en, type PluginInventoryLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<PluginInventorySettingsTabInjected['list']>>
const t = ((key: PluginInventoryLocaleKey): string => en[key]) as PluginInventorySettingsTabProps['t']

function props(
  list: PluginInventorySettingsTabInjected['list'],
  setEnabled: PluginInventorySettingsTabInjected['setEnabled'] = async () => { throw new Error('unused') },
): PluginInventorySettingsTabProps {
  return {
    t,
    list,
    setEnabled,
  } as PluginInventorySettingsTabProps
}

const SNAPSHOT = {
  entries: [
    { entryId: '8a1b2c3d', moduleName: '@deepseek-ai/cordis-plugin-hmr', enabled: true, fiberPhase: 'active' },
    { entryId: 'pending', moduleName: 'cordis:pending-name', enabled: true, fiberPhase: 'pending' },
    { entryId: 'loading', moduleName: '@fixture/loading-name', enabled: true, fiberPhase: 'loading' },
    { entryId: 'failed', moduleName: '@fixture/failed-name', enabled: true, fiberPhase: 'failed' },
    { entryId: 'unloading', moduleName: '@fixture/unloading-name', enabled: true, fiberPhase: 'unloading' },
    { entryId: 'unobserved', moduleName: '@fixture/unobserved-name', enabled: true, fiberPhase: null },
    { entryId: 'disabled-entry', moduleName: '@deepseek-ai/dsh-host-directory-picker-native', enabled: false, fiberPhase: null },
  ],
} as unknown as Snapshot

describe('PluginInventorySettingsTab', () => {
  it('renders runtime status only for enabled plugins', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const list = vi.fn(() => deferred.promise)
    const view = render(<PluginInventorySettingsTab {...props(list)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(list).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.catalog })).toBeTruthy()
    expect(screen.getByText(en.toggleHint)).toBeTruthy()
    expect(view.container.querySelector('[data-plugin-count]')?.textContent).toBe('7')
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getAllByText(en.enabledTag)).toHaveLength(6)
    expect(screen.getByText(en.disabledTag)).toBeTruthy()
    for (const value of [
      'Mounted',
      'Waiting for dependencies',
      'Loading',
      'Mount failed',
      'Unloading',
      'Not mounted',
    ]) {
      expect(screen.getByRole('img', { name: value })).toBeTruthy()
    }
    const active = screen.getByRole('button', { name: 'hmr, Mounted, Enabled' })
    expect(active.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(active)
    expect(active.getAttribute('aria-expanded')).toBe('true')
    expect(view.container.querySelector('[data-loader-entry]')?.textContent).toBe('8a1b2c3d')
    expect(screen.getByText(en.configuration)).toBeTruthy()
    expect(screen.getByText(en.cordis)).toBeTruthy()
    fireEvent.click(active)
    expect(view.container.querySelector('[data-loader-entry]')).toBeNull()

    fireEvent.click(active)
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), {
      target: { value: 'disabled-entry' },
    })
    expect(view.container.querySelector('[data-loader-entry]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'directory-picker-native, Disabled' }))
    expect(screen.getAllByText(en.disabledTag)).toHaveLength(2)
    expect(screen.queryByText(en.cordis)).toBeNull()
    expect(screen.queryByText(en.unobserved)).toBeNull()
  })

  it('renders one enablement switch per togglable plugin', async () => {
    render(<PluginInventorySettingsTab {...props(async () => SNAPSHOT)} />)
    await screen.findByRole('searchbox', { name: en.search })
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(7)
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true')
    expect(switches[6]!.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'directory-picker-native, Enable' })).toBeTruthy()
  })

  it('skips the switch for the bootstrap include row', async () => {
    const snapshot = {
      entries: [
        { entryId: 'include', moduleName: 'cordis:include', enabled: true, fiberPhase: 'active' },
        { entryId: 'tool-x', moduleName: 'cordis:active', enabled: true, fiberPhase: 'active' },
      ],
    } as unknown as Snapshot
    render(<PluginInventorySettingsTab {...props(async () => snapshot)} />)
    await screen.findByRole('searchbox', { name: en.search })
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })

  it('calls setEnabled with the desired state and shows the returned snapshot', async () => {
    const setEnabled = vi.fn(async (request: PluginInventorySetEnabledRequest) => {
      expect(request).toEqual({ entryId: 'disabled-entry', enabled: true })
      return {
        entries: SNAPSHOT.entries.map(entry =>
          entry.entryId === 'disabled-entry' ? { ...entry, enabled: true } : entry),
      } as unknown as Snapshot
    })
    render(<PluginInventorySettingsTab {...props(async () => SNAPSHOT, setEnabled)} />)
    const toggle = await screen.findByRole('switch', { name: 'directory-picker-native, Enable' })
    fireEvent.click(toggle)
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledOnce() })
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'directory-picker-native, Disable' }).getAttribute('aria-checked')).toBe('true')
    })
    expect(screen.getAllByText(en.enabledTag)).toHaveLength(7)
    expect(screen.queryByText(en.toggleError)).toBeNull()
  })

  it('reports a toggle failure without losing the current catalog', async () => {
    const setEnabled = vi.fn(async () => { throw new Error('entry-not-found') })
    render(<PluginInventorySettingsTab {...props(async () => SNAPSHOT, setEnabled)} />)
    const toggle = await screen.findByRole('switch', { name: 'directory-picker-native, Enable' })
    fireEvent.click(toggle)
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledOnce() })
    expect((await screen.findByRole('alert')).textContent).toBe(en.toggleError)
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByRole('switch', { name: 'directory-picker-native, Enable' })).toBeTruthy()
  })

  it('filters by module name or Loader entry id', async () => {
    render(<PluginInventorySettingsTab {...props(async () => SNAPSHOT)} />)
    const search = await screen.findByRole('searchbox', { name: en.search })

    fireEvent.change(search, { target: { value: 'disabled-entry' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('directory-picker-native')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'cordis-plugin-hmr' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('hmr')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'not-a-plugin' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const list = vi.fn<PluginInventorySettingsTabInjected['list']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce({ entries: [] })
    render(<PluginInventorySettingsTab {...props(list)} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('contains a synchronous Remote failure and ignores a result after unmount', async () => {
    const syncFailure = vi.fn(() => { throw new Error('namespace unavailable') }) as PluginInventorySettingsTabInjected['list']
    const failed = render(<PluginInventorySettingsTab {...props(syncFailure)} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    failed.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<PluginInventorySettingsTab {...props(() => deferred.promise)} />)
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const pendingFailure = render(<PluginInventorySettingsTab {...props(() => deferredFailure.promise)} />)
    pendingFailure.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })
})
