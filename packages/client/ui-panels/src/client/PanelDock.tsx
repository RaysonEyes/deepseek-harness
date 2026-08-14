// Top-right panel switcher: five tabs (Terminal, Browser, Review, Assistant,
// Files) that toggle a right-side panel overlay. Review and Files are wired to
// real Host surfaces; Terminal, Browser and Assistant render a placeholder.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { FilesPanel } from './FilesPanel.tsx'
import { ReviewPanel } from './ReviewPanel.tsx'
import { NS, type PanelsLocaleKey } from './locales.ts'
import css from './Panels.module.css'

/** Panel identities in dock order. */
export type PanelId = 'terminal' | 'browser' | 'review' | 'assistant' | 'files'

/** Registration-side injected face: the shared wire client. */
export interface PanelsInjected {
  readonly api: IApiClient
}

/** Full props assembled by the slot renderer. */
export type PanelDockProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<PanelsInjected>

const PANELS: readonly { id: PanelId; tabKey: PanelsLocaleKey; titleKey: PanelsLocaleKey }[] = [
  { id: 'terminal', tabKey: 'tabTerminal', titleKey: 'panelTerminal' },
  { id: 'browser', tabKey: 'tabBrowser', titleKey: 'panelBrowser' },
  { id: 'review', tabKey: 'tabReview', titleKey: 'panelReview' },
  { id: 'assistant', tabKey: 'tabAssistant', titleKey: 'panelAssistant' },
  { id: 'files', tabKey: 'tabFiles', titleKey: 'panelFiles' },
]

/** The placeholder content for surfaces whose capability is not built yet. */
function Placeholder({ t }: { t: TranslateNS<typeof NS> }) {
  return <p className={css.panelStatus}>{t('comingSoon')}</p>
}

/** Panel switcher dock rendered into the session header utilities strip. */
export function PanelDock({ sessionId, useSessions, api, t }: PanelDockProps) {
  const cwd = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.cwd)
  const [active, setActive] = useState<PanelId | null>(null)

  const toggle = (id: PanelId): void => {
    setActive(current => current === id ? null : id)
  }

  const activeMeta = active === null ? undefined : PANELS.find(panel => panel.id === active)
  const activeTitle = activeMeta === undefined ? '' : t(activeMeta.titleKey)

  return (
    <>
      <div className={css.dock} role="group" aria-label={t('dockLabel')}>
        {PANELS.map(panel => (
          <button
            key={panel.id}
            type="button"
            className={css.dockTab}
            data-active={active === panel.id || undefined}
            aria-pressed={active === panel.id}
            onClick={() => { toggle(panel.id) }}
          >
            {t(panel.tabKey)}
          </button>
        ))}
      </div>
      {active !== null && cwd !== undefined && createPortal(
        <div className={css.overlay} role="region" aria-label={activeTitle}>
          <div className={css.overlayHeader}>
            <strong>{activeTitle}</strong>
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('close')}
              onClick={() => { setActive(null) }}
            >
              ✕
            </button>
          </div>
          <div className={css.overlayBody}>
            {active === 'review' ? <ReviewPanel api={api} cwd={cwd} t={t} /> : null}
            {active === 'files' ? <FilesPanel api={api} cwd={cwd} t={t} /> : null}
            {(active === 'terminal' || active === 'browser' || active === 'assistant') ? <Placeholder t={t} /> : null}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
