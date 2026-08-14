// Workspace directory browser panel: lists directories and files through the
// always-available `workspace.listDirectory` host capability (native picker
// deployments do not serve the browse picker's `host.listDirectory`).

import { useCallback, useEffect, useState } from 'react'
import type { IApiClient, WorkspaceDirectoryListing } from '@deepseek-ai/dsh-client-connection/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './Panels.module.css'

export interface FilesPanelProps {
  readonly api: IApiClient
  readonly cwd: string
  readonly t: TranslateNS<typeof NS>
}

interface StackEntry {
  readonly path: string
  readonly name: string
}

type ListView =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly listing: WorkspaceDirectoryListing }

export function FilesPanel({ api, cwd, t }: FilesPanelProps) {
  const [stack, setStack] = useState<StackEntry[]>([{ path: cwd, name: t('filesRoot') }])
  const [view, setView] = useState<ListView>({ status: 'loading' })

  const load = useCallback(async (target: string): Promise<void> => {
    setView({ status: 'loading' })
    try {
      const response = await api.workspace.listDirectory({ path: target })
      if (!response.result.ok) {
        setView({ status: 'error' })
        return
      }
      setView({ status: 'ready', listing: response.result.value })
    } catch {
      setView({ status: 'error' })
    }
  }, [api])

  useEffect(() => { void load(stack[0]?.path ?? cwd) }, [cwd, load, stack])

  const open = useCallback((path: string, name: string): void => {
    setStack(current => [...current, { path, name }])
  }, [])

  const up = useCallback((): void => {
    setStack(current => current.length > 1 ? current.slice(0, -1) : current)
  }, [])

  const pop = useCallback((index: number): void => {
    setStack(current => current.slice(0, index + 1))
  }, [])

  if (view.status === 'loading') return <p className={css.panelStatus}>{t('filesLoading')}</p>
  if (view.status === 'error') return <p className={css.panelError}>{t('filesFailed')}</p>

  return (
    <div className={css.files}>
      <nav className={css.filesCrumbs} aria-label={t('filesRoot')}>
        {stack.length > 1 && (
          <button type="button" className={css.iconButton} onClick={up}>{t('filesBack')}</button>
        )}
        {stack.map((crumb, index) => (
          <button
            key={crumb.path}
            type="button"
            className={css.crumb}
            data-current={index === stack.length - 1 || undefined}
            onClick={() => { pop(index) }}
          >
            {crumb.name}
          </button>
        ))}
      </nav>
      <ul className={css.fileList}>
        {view.listing.entries.map(entry => (
          <li key={entry.path}>
            <button
              type="button"
              className={css.fileRow}
              data-kind={entry.kind}
              disabled={entry.kind !== 'directory'}
              onClick={() => { if (entry.kind === 'directory') open(entry.path, entry.name) }}
            >
              <span className={css.fileIcon} aria-hidden="true">{entry.kind === 'directory' ? '▸' : '·'}</span>
              <span className={css.changePath}>{entry.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {view.listing.entries.length === 0 && <p className={css.panelStatus}>{t('filesEmpty')}</p>}
    </div>
  )
}

export default FilesPanel
