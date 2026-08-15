// Browser panel: a tabbed strip of independent web pages. Each tab owns its
// address bar, a local Back/Forward history, and a sandboxed iframe; every
// tab stays mounted while the panel is open (hidden when inactive), so
// switching tabs restores that page's state, and the address bar shows the
// requested URL rather than a cross-origin page's final one.

import { useRef, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './Panels.module.css'

/** Browser panel dependencies supplied by the dock (the panel is self-contained). */
export interface BrowserPanelProps {
  readonly t: TranslateNS<typeof NS>
}

interface BrowserTab {
  readonly id: number
  readonly title: string
}

/** Inline glyphs for the navigation controls, labelled by aria-label. */
const BACK = '\u2190'
const FORWARD = '\u2192'
const RELOAD = '\u21bb'
const EXTERNAL = '\u2197'

/**
 * Normalize one non-empty address-bar value into a navigable URL.
 * A value naming a scheme is kept only when that scheme is http or https;
 * any other scheme (mailto:, javascript:, file:, data:, ...) returns null so
 * it can never become an iframe source. A value without a scheme gets https.
 * @param value - the trimmed, non-empty value the user submitted.
 * @returns the http(s) URL, or null when the value names a non-navigable scheme.
 */
function toHttpUrl(value: string): string | null {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return /^https?:/i.test(value) ? value : null
  }
  return 'https://' + value
}

/** One browser page: its address bar, navigation history, and sandboxed iframe. */
function BrowserTabView({ hidden, t }: { hidden: boolean; t: TranslateNS<typeof NS> }) {
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)
  const [input, setInput] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [invalid, setInvalid] = useState(false)

  const current = cursor >= 0 ? history[cursor] ?? null : null

  const navigate = (): void => {
    const value = input.trim()
    if (value === '') return
    const url = toHttpUrl(value)
    if (url === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setHistory(prev => prev.slice(0, cursor + 1).concat(url))
    setCursor(cursor + 1)
    setInput(url)
  }

  const back = (): void => {
    if (cursor <= 0) return
    const next = cursor - 1
    setCursor(next)
    setInput(history[next] ?? '')
  }

  const forward = (): void => {
    if (cursor >= history.length - 1) return
    const next = cursor + 1
    setCursor(next)
    setInput(history[next] ?? '')
  }

  const reload = (): void => {
    if (current === null) return
    setReloadKey(key => key + 1)
  }

  return (
    <div className={css.browserPage} hidden={hidden || undefined}>
      <form
        className={css.browserToolbar}
        onSubmit={(event) => { event.preventDefault(); navigate() }}
      >
        <button
          type="button"
          className={css.iconButton}
          disabled={cursor <= 0}
          aria-label={t('browserBack')}
          onClick={back}
        >
          {BACK}
        </button>
        <button
          type="button"
          className={css.iconButton}
          disabled={cursor >= history.length - 1}
          aria-label={t('browserForward')}
          onClick={forward}
        >
          {FORWARD}
        </button>
        <button
          type="button"
          className={css.iconButton}
          disabled={current === null}
          aria-label={t('browserReload')}
          onClick={reload}
        >
          {RELOAD}
        </button>
        <input
          type="text"
          className={css.browserInput}
          value={input}
          aria-label={t('browserAddress')}
          aria-invalid={invalid || undefined}
          placeholder="https://"
          onChange={(event) => { setInput(event.target.value); setInvalid(false) }}
        />
        <button type="submit" className={css.iconButton}>{t('browserGo')}</button>
        <a
          className={css.iconButton}
          href={current ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('browserOpenExternal')}
          aria-disabled={current === null || undefined}
        >
          {EXTERNAL}
        </a>
      </form>
      {invalid && <p className={css.panelError}>{t('browserInvalidUrl')}</p>}
      {current === null ? (
        <p className={css.browserEmpty}>{t('browserEmpty')}</p>
      ) : (
        <iframe
          key={reloadKey}
          className={css.browserFrame}
          src={current}
          title={t('panelBrowser')}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}

/** Tabbed browser panel: independent pages kept alive across tab switches. */
export function BrowserPanel({ t }: BrowserPanelProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [{ id: 1, title: t('browserTab') + ' 1' }])
  const [activeId, setActiveId] = useState(1)
  const nextId = useRef(2)

  const addTab = (): void => {
    const id = nextId.current
    nextId.current += 1
    setTabs(prev => [...prev, { id, title: t('browserTab') + ' ' + String(id) }])
    setActiveId(id)
  }

  const closeTab = (id: number): void => {
    const remaining = tabs.filter(tab => tab.id !== id)
    if (remaining.length === 0) return
    setTabs(remaining)
    if (activeId === id) {
      const last = remaining[remaining.length - 1]
      if (last !== undefined) setActiveId(last.id)
    }
  }

  return (
    <div className={css.browser}>
      <div className={css.browserTabs} role="tablist" aria-label={t('panelBrowser')}>
        {tabs.map(tab => (
          <div key={tab.id} className={css.browserTab} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              data-active={tab.id === activeId || undefined}
              className={css.browserTabButton}
              onClick={() => { setActiveId(tab.id) }}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className={css.browserTabClose}
              aria-label={t('closeTab')}
              onClick={() => { closeTab(tab.id) }}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={css.browserTabAdd} aria-label={t('addTab')} onClick={addTab}>
          ＋
        </button>
      </div>
      <div className={css.browserStack}>
        {tabs.map(tab => (
          <BrowserTabView key={tab.id} hidden={tab.id !== activeId} t={t} />
        ))}
      </div>
    </div>
  )
}

export default BrowserPanel
