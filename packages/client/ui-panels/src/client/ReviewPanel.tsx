// Git change review panel: working-tree status grouped by staging state,
// with a unified diff view per file, served by the host `git` apiproxy domain.

import { useCallback, useEffect, useState } from 'react'
import type {
  GitReviewChange, GitReviewDiffValue, GitReviewStatusValue, IApiClient,
} from '@deepseek-ai/dsh-client-connection/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type PanelsLocaleKey } from './locales.ts'
import css from './Panels.module.css'

/** Review panel dependencies supplied by the dock. */
export interface ReviewPanelProps {
  readonly api: IApiClient
  /** Absolute working directory of the reviewed workspace. */
  readonly cwd: string
  readonly t: TranslateNS<typeof NS>
}

type StatusView =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly code: string }
  | { readonly status: 'ready'; readonly value: GitReviewStatusValue }

/** Diff-view state for one selected path. */
interface DiffViewState {
  readonly loading: boolean
  readonly value: GitReviewDiffValue | null
  readonly failed: boolean
}

const IDLE_DIFF: DiffViewState = { loading: false, value: null, failed: false }

/** Grouping label key by change shape, in display order. */
function groupOf(change: GitReviewChange): PanelsLocaleKey {
  if (change.untracked) return 'reviewUntracked'
  if (change.status === 'conflicted') return 'reviewConflicted'
  if (change.staged && !change.unstaged) return 'reviewStaged'
  return 'reviewUnstaged'
}

const GROUP_ORDER: PanelsLocaleKey[] = ['reviewUnstaged', 'reviewStaged', 'reviewUntracked', 'reviewConflicted']

/** Short status badge for one change. */
function badgeOf(change: GitReviewChange): string {
  if (change.untracked) return '?'
  switch (change.status) {
    case 'added': return 'A'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    case 'conflicted': return 'C'
    default: return 'M'
  }
}

/** One unified-diff line with its gutter classification. */
function diffClass(line: string): string {
  if (line.startsWith('+')) return css.diffAdd ?? ''
  if (line.startsWith('-')) return css.diffDel ?? ''
  if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) return css.diffMeta ?? ''
  return css.diffCtx ?? ''
}

/** Render a unified diff as a read-only colored block. */
function DiffView({ diff, t }: { diff: GitReviewDiffValue; t: ReviewPanelProps['t'] }) {
  const lines = diff.untracked
    ? (diff.content ?? '').split('\n').map(line => `+${line}`)
    : diff.diff.split('\n')
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return <p className={css.diffEmpty}>{t('reviewDiffEmpty')}</p>
  }
  return (
    <pre className={css.diff}>
      {lines.map((line, index) => (
        <span key={index} className={diffClass(line)}>{line === '' ? ' ' : line}</span>
      ))}
    </pre>
  )
}

/** Git working-tree review panel. */
export function ReviewPanel({ api, cwd, t }: ReviewPanelProps) {
  const [view, setView] = useState<StatusView>({ status: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffViewState>(IDLE_DIFF)

  const load = useCallback(async (): Promise<void> => {
    setView({ status: 'loading' })
    try {
      const response = await api.git.status({ cwd })
      if (!response.result.ok) {
        setView({ status: 'error', code: response.result.error.code })
        return
      }
      setView({ status: 'ready', value: response.result.value })
    } catch {
      setView({ status: 'error', code: 'git-failed' })
    }
  }, [api, cwd])

  useEffect(() => { void load() }, [load])

  const select = useCallback(async (change: GitReviewChange): Promise<void> => {
    setSelected(change.path)
    setDiff({ loading: true, value: null, failed: false })
    try {
      const response = await api.git.diff({
        cwd,
        path: change.path,
        staged: change.staged && !change.unstaged,
      })
      if (!response.result.ok) {
        setDiff({ loading: false, value: null, failed: true })
        return
      }
      setDiff({ loading: false, value: response.result.value, failed: false })
    } catch {
      setDiff({ loading: false, value: null, failed: true })
    }
  }, [api, cwd])

  if (view.status === 'loading') return <p className={css.panelStatus}>{t('reviewLoading')}</p>
  if (view.status === 'error') {
    return <p className={css.panelError}>{view.code === 'not-a-repo' ? t('reviewNotRepo') : t('reviewFailed')}</p>
  }

  const { value } = view
  const groups = GROUP_ORDER.map(key => ({ key, items: value.changes.filter(change => groupOf(change) === key) }))
    .filter(group => group.items.length > 0)
  const hasChanges = value.changes.length > 0

  return (
    <div className={css.review}>
      <div className={css.reviewToolbar}>
        <span className={css.reviewBranch}>{t('reviewBranch')}: <strong>{value.branch ?? 'HEAD'}</strong></span>
        <button type="button" className={css.iconButton} onClick={() => { void load() }}>{t('reviewRefresh')}</button>
      </div>
      {!hasChanges ? (
        <p className={css.panelStatus}>{t('reviewEmpty')}</p>
      ) : (
        <div className={css.reviewBody}>
          <ul className={css.changeList} aria-label={t('panelReview')}>
            {groups.map(group => (
              <li key={group.key} className={css.changeGroup}>
                <div className={css.changeGroupHeader}>
                  {t(group.key)} <span>{group.items.length}</span>
                </div>
                <ul className={css.changeItems}>
                  {group.items.map(change => (
                    <li key={change.path}>
                      <button
                        type="button"
                        className={css.changeRow}
                        data-active={selected === change.path || undefined}
                        onClick={() => { void select(change) }}
                      >
                        <span className={css.changeBadge} data-status={change.status}>{badgeOf(change)}</span>
                        <span className={css.changePath}>{change.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className={css.diffPane}>
            {diff.loading ? (
              <p className={css.panelStatus}>{t('reviewLoading')}</p>
            ) : diff.failed ? (
              <p className={css.panelError}>{t('reviewDiffFailed')}</p>
            ) : diff.value === null ? (
              <p className={css.panelStatus}>{t('reviewDiffEmpty')}</p>
            ) : (
              <DiffView diff={diff.value} t={t} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReviewPanel
