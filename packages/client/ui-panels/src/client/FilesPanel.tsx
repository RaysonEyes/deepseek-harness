// Workspace directory browser panel: lists directories and files through the
// always-available `workspace.listDirectory` host capability. Directories
// navigate; files read their content through `workspace.readFile`.

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

/** One opened file's content, or an error while reading it. */
type FileView =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly path: string; readonly content: string }

export function FilesPanel({ api, cwd, t }: FilesPanelProps) {
  const [stack, setStack] = useState<StackEntry[]>([{ path: cwd, name: t('filesRoot') }])
  const [view, setView] = useState<ListView>({ status: 'loading' })
  const [file, setFile] = useState<FileView | null>(null)

  const current = stack[stack.length - 1]?.path ?? cwd

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

  useEffect(() => { void load(current) }, [current, load])

  const openDirectory = useCallback((path: string, name: string): void => {
    setFile(null)
    setStack(prev => [...prev, { path, name }])
  }, [])

  const openFile = useCallback(async (path: string): Promise<void> => {
    setFile({ status: 'loading' })
    try {
      const response = await api.workspace.readFile({ path })
      if (!response.result.ok) {
        setFile({ status: 'error' })
        return
      }
      setFile({ status: 'ready', path: response.result.value.path, content: response.result.value.content })
    } catch {
      setFile({ status: 'error' })
    }
  }, [api])

  const up = useCallback((): void => {
    setFile(null)
    setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  const pop = useCallback((index: number): void => {
    setFile(null)
    setStack(prev => prev.slice(0, index + 1))
  }, [])

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

      {file === null ? (
        <>
          {view.status === 'loading' && <p className={css.panelStatus}>{t('filesLoading')}</p>}
          {view.status === 'error' && <p className={css.panelError}>{t('filesFailed')}</p>}
          {view.status === 'ready' && (
            <ul className={css.fileList}>
              {view.listing.entries.map(entry => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className={css.fileRow}
                    data-kind={entry.kind}
                    onClick={() => {
                      if (entry.kind === 'directory') openDirectory(entry.path, entry.name)
                      else void openFile(entry.path)
                    }}
                  >
                    <span className={css.fileIcon} aria-hidden="true">{entry.kind === 'directory' ? '▸' : '·'}</span>
                    <span className={css.changePath}>{entry.name}</span>
                  </button>
                </li>
              ))}
              {view.listing.entries.length === 0 && <p className={css.panelStatus}>{t('filesEmpty')}</p>}
            </ul>
          )}
        </>
      ) : (
        <>
          {file.status === 'loading' && <p className={css.panelStatus}>{t('filesLoading')}</p>}
          {file.status === 'error' && <p className={css.panelError}>{t('filesFailed')}</p>}
          {file.status === 'ready' && (
            <pre className={css.fileContent}><code>{file.content}</code></pre>
          )}
        </>
      )}
    </div>
  )
}

export default FilesPanel
