// Panel switcher: a dock of five tabs (Terminal, Browser, Review, Assistant,
// Files) in the session header. Browser, Review and Files open as full-height
// companions on the right of the conversation; Terminal and the Assistant
// placeholder open in a bottom host below the conversation. The right and
// bottom seats are independent, so a right surface and the terminal can be
// open at once.

import { useEffect, useRef } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { BrowserPanel } from './BrowserPanel.tsx'
import { FilesPanel } from './FilesPanel.tsx'
import { ReviewPanel } from './ReviewPanel.tsx'
import { TerminalPanel } from './TerminalPanel.tsx'
import { NS, type PanelsLocaleKey } from './locales.ts'
import { createPanelsStore, type PanelId } from './stores.ts'
import css from './Panels.module.css'

/** Registration-side injected face: the shared wire client. */
export interface PanelsInjected {
  readonly api: IApiClient
}

/** The shared panels store handle type. */
export type PanelsStore = ReturnType<typeof createPanelsStore>

/** Full dock props: header-slot runtime + locale + store + inject shares. */
export type PanelDockProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & PropsStore<PanelsStore>
  & InjectFace<PanelsInjected>

/** Full bottom-host props: panel-slot runtime + locale + store + inject shares. */
export type PanelHostProps =
  PropsRuntime<'conversation.panel'>
  & PropsLocale<typeof NS>
  & PropsStore<PanelsStore>
  & InjectFace<PanelsInjected>

/** Full side-companion props: side-slot runtime + locale + store + inject shares. */
export type PanelSideProps =
  PropsRuntime<'conversation.side'>
  & PropsLocale<typeof NS>
  & PropsStore<PanelsStore>
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

/** Finish a pointer-capture resize: release capture and clear the drag origin. */
function finishResizeDrag<T>(
  dragStart: React.MutableRefObject<T | null>,
): (event: React.PointerEvent<HTMLDivElement>) => void {
  return (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStart.current = null
  }
}

/** Dock of panel tabs rendered into the session header utilities strip. */
export function PanelDock({ t, useStore, actions }: PanelDockProps) {
  const side = useStore(s => s.side)
  const bottom = useStore(s => s.bottom)

  // Escape dismisses both surfaces without disposing the terminal session (the
  // dock is always mounted while a session exists, so it owns the gesture).
  useEffect(() => {
    if (side === null && bottom === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') actions.dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [side, bottom, actions])

  return (
    <div className={css.dock} role="group" aria-label={t('dockLabel')}>
      {PANELS.map(panel => (
        <button
          key={panel.id}
          type="button"
          className={css.dockTab}
          data-active={
            (panel.id === 'terminal' || panel.id === 'assistant' ? bottom : side) === panel.id || undefined
          }
          aria-pressed={
            (panel.id === 'terminal' || panel.id === 'assistant' ? bottom : side) === panel.id
          }
          onClick={() => { actions.toggle(panel.id) }}
        >
          {t(panel.tabKey)}
        </button>
      ))}
    </div>
  )
}

/** Right-side companion host: renders the inspect surfaces (browser, review,
 * files) beside the conversation. */
export function PanelSide({ sessionId, useSessions, api, t, useStore, actions }: PanelSideProps) {
  const side = useStore(s => s.side)
  const sideWidth = useStore(s => s.sideWidth)
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const dragStart = useRef<{ x: number; width: number } | null>(null)

  if (side === null) return null
  // Review and Files need a workspace directory; the browser does not.
  if ((side === 'review' || side === 'files') && cwd === undefined) return null

  const activeMeta = PANELS.find(panel => panel.id === side)
  const activeTitle = activeMeta === undefined ? '' : t(activeMeta.titleKey)

  // Drag the left edge: pulling left widens the panel, pulling right narrows
  // it; the conversation column reflows to the remaining width.
  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { x: event.clientX, width: sideWidth }
  }
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current
    if (start === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    actions.setSideWidth(start.width + start.x - event.clientX)
  }

  return (
    <div className={css.sidePanel} style={{ width: sideWidth }} role="region" aria-label={activeTitle}>
      <div
        className={css.sideResizeHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('resizeSide')}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={finishResizeDrag(dragStart)}
      />
      <div className={css.sideHeader}>
        <strong>{activeTitle}</strong>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('close')}
          onClick={() => { actions.closeSide() }}
        >
          ✕
        </button>
      </div>
      <div className={css.sideBody}>
        {side === 'browser' ? <BrowserPanel t={t} /> : null}
        {side === 'review' && cwd !== undefined ? <ReviewPanel api={api} cwd={cwd} t={t} /> : null}
        {side === 'files' && cwd !== undefined ? <FilesPanel api={api} cwd={cwd} t={t} /> : null}
      </div>
    </div>
  )
}

/** Bottom panel host: renders the terminal and the assistant placeholder below
 * the conversation. The terminal stays mounted after its first open so a dock
 * toggle (hide/show) preserves every session. */
export function PanelHost({ sessionId, useSessions, t, useStore, actions }: PanelHostProps) {
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const bottom = useStore(s => s.bottom)
  const terminalOpened = useStore(s => s.terminalOpened)
  const height = useStore(s => s.height)
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  const terminalVisible = bottom === 'terminal'
  const assistantVisible = bottom === 'assistant'
  const hostVisible = terminalVisible || assistantVisible
  const terminalMounted = terminalOpened

  if (!terminalMounted && !assistantVisible) return null

  const activeTitle = terminalVisible ? t('panelTerminal') : t('panelAssistant')

  // Drag the top edge: pulling up grows the panel, pulling down shrinks it.
  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { y: event.clientY, height }
  }
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current
    if (start === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    actions.setHeight(start.height + start.y - event.clientY)
  }

  return (
    <div className={css.host} style={{ height: hostVisible ? height : 0 }} role="region" aria-label={activeTitle}>
      {hostVisible && (
        <div
          className={css.resizeHandle}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('resize')}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={finishResizeDrag(dragStart)}
        />
      )}
      <div className={css.hostHeader}>
        <strong>{activeTitle}</strong>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('close')}
          onClick={() => { actions.closeBottom() }}
        >
          ✕
        </button>
      </div>
      <div className={css.hostBody}>
        {terminalMounted && cwd !== undefined ? <TerminalPanel cwd={cwd} t={t} /> : null}
        {assistantVisible ? <Placeholder t={t} /> : null}
      </div>
    </div>
  )
}
