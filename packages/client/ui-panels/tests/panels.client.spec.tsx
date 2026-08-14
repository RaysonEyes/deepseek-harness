// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Side-effect type import: loads the locale-namespace augmentation from the
// package registration into this program (same pattern as the browser-plugin tests).
import type {} from '../src/client/index.ts'
import type {
  GitReviewStatusValue, IApiClient,
} from '@deepseek-ai/dsh-client-connection/client'
import { PanelDock, type PanelDockProps } from '../src/client/PanelDock.tsx'
import { en, type PanelsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: PanelsLocaleKey): string => en[key]) as PanelDockProps['t']

const CWD = '/repo'
const useSessions = ((selector: (s: unknown) => unknown): unknown => selector({
  current: 's1',
  byId: { s1: { cwd: CWD } },
})) as PanelDockProps['useSessions']

const STATUS: GitReviewStatusValue = {
  repoRoot: '/repo',
  branch: 'main',
  changes: [
    { path: 'src/a.ts', status: 'modified', staged: false, unstaged: true, untracked: false },
    { path: 'src/new.ts', status: 'untracked', staged: false, unstaged: false, untracked: true },
  ],
}

function apiMock(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    git: {
      status: vi.fn(async () => ({ rpcId: 'r1', result: { ok: true, value: STATUS } })),
      diff: vi.fn(async () => ({ rpcId: 'r2', result: { ok: true, value: { path: 'src/a.ts', staged: false, untracked: false, diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n one\n+two\n', content: null } } })),
    },
    workspace: {
      listDirectory: vi.fn(async () => ({ rpcId: 'r3', result: { ok: true, value: { path: CWD, home: '/', crumbs: [{ name: '/', path: '/', hidden: false }], entries: [{ name: 'src', path: CWD + '/src', hidden: false, kind: 'directory' as const }] } } })),
    },
    host: {
      listDirectory: vi.fn(async () => ({ rpcId: 'r4', result: { ok: true, value: { path: CWD, home: '/', crumbs: [], entries: [], truncated: false } } })),
    },
    ...overrides,
  } as unknown as IApiClient
}

function props(api: IApiClient): PanelDockProps {
  return {
    t,
    sessionId: 's1',
    useSessions,
    api,
  } as unknown as PanelDockProps
}

describe('PanelDock', () => {
  it('renders the five panel tabs in the dock', () => {
    render(<PanelDock {...props(apiMock())} />)
    for (const label of [en.tabTerminal, en.tabBrowser, en.tabReview, en.tabAssistant, en.tabFiles]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('opens the review panel with the Git change groups and a diff on selection', async () => {
    const api = apiMock()
    render(<PanelDock {...props(api)} />)
    fireEvent.click(screen.getByRole('button', { name: en.tabReview }))
    expect(await screen.findByRole('region', { name: en.panelReview })).toBeTruthy()
    expect(api.git.status).toHaveBeenCalledWith({ cwd: CWD })
    expect(screen.getByText(en.reviewUnstaged)).toBeTruthy()
    expect(screen.getByText(en.reviewUntracked)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /src\/a\.ts/ }))
    await waitFor(() => { expect(api.git.diff).toHaveBeenCalled() })
    expect(screen.getByText(/\+two/)).toBeTruthy()
  })

  it('shows the not-a-repo failure for a plain directory', async () => {
    const api = apiMock({
      git: {
        status: vi.fn(async () => ({ rpcId: 'r', result: { ok: false, error: { code: 'not-a-repo', message: 'no repo', details: {} } } })),
        diff: vi.fn(),
      } as unknown as IApiClient['git'],
    })
    render(<PanelDock {...props(api)} />)
    fireEvent.click(screen.getByRole('button', { name: en.tabReview }))
    expect(await screen.findByText(en.reviewNotRepo)).toBeTruthy()
  })

  it('opens the files panel over the workspace directory listing', async () => {
    const api = apiMock()
    render(<PanelDock {...props(api)} />)
    fireEvent.click(screen.getByRole('button', { name: en.tabFiles }))
    expect(await screen.findByRole('region', { name: en.panelFiles })).toBeTruthy()
    expect(api.workspace.listDirectory).toHaveBeenCalledWith({ path: CWD })
    expect(screen.getByText('src')).toBeTruthy()
  })

  it('shows the placeholder for the terminal tab and toggles the panel closed', async () => {
    render(<PanelDock {...props(apiMock())} />)
    fireEvent.click(screen.getByRole('button', { name: en.tabTerminal }))
    expect(await screen.findByRole('region', { name: en.panelTerminal })).toBeTruthy()
    expect(screen.getByText(en.comingSoon)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.tabTerminal }))
    await waitFor(() => { expect(screen.queryByRole('region', { name: en.panelTerminal })).toBeNull() })
  })

  it('renders nothing when no session cwd is available', () => {
    const noCwd = ((selector: (s: unknown) => unknown): unknown => selector({
      current: 's2',
      byId: { s2: { cwd: undefined } },
    })) as PanelDockProps['useSessions']
    const noCwdProps = { t, sessionId: 's2', useSessions: noCwd, api: apiMock() } as unknown as PanelDockProps
    render(<PanelDock {...noCwdProps} />)
    fireEvent.click(screen.getByRole('button', { name: en.tabReview }))
    expect(screen.queryByRole('region', { name: en.panelReview })).toBeNull()
  })
})
