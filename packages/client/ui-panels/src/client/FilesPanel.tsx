// Workspace directory browser panel: folder tree over the host `listDirectory`
// capability (the same listing the directory picker serves; the host returns
// child directories, so every row navigates).

import { useCallback, useEffect, useState } from 'react'
import type { DirectoryEntry, DirectoryListing, IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './Panels.module.css'

/** Files panel dependencies supplied by the dock. */
export interface FilesPanelProps {
  readonly api: IApiClient
  /** Absolute root directory of the workspace. */
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
  | { readonly status: 'ready'; readonly listing: DirectoryListing }

/** Workspace directory browser panel. */
export function FilesPanel({ api, cwd, t }: FilesPanelProps) {
  const [stack, setStack] = useState<StackEntry[]>([{ path: cwd, name: t('filesRoot') }])
  const [view, setView] = useState<ListView>({ status: 'loading' })

  const load = useCallback(async (target: string): Promise<void> => {
    setView({ status: 'loading' })
    try {
      const response = await api.host.listDirectory({ path: target })
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

  const open = useCallback((entry: DirectoryEntry): void => {
    setStack(current => [...current, { path: entry.path, name: entry.name }])
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
            <button type="button" className={css.fileRow} onClick={() => { void open(entry) }}>
              <span className={css.fileIcon} aria-hidden="true">{entry.hidden ? '·' : '▸'}</span>
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
