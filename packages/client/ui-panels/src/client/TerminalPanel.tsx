// Terminal panel: one tabbed strip of independent xterm surfaces, each wired to
// its own /api/terminal WebSocket. The host owns one node-pty process per tab;
// each tab streams raw output in, relays keystrokes and resizes out, and closes
// its session when the tab is removed. Every tab stays mounted while the panel
// is open (hidden when inactive), so switching tabs preserves each session.

import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { XTERM_CSS } from './xterm-styles.ts'
import css from './Panels.module.css'

export interface TerminalPanelProps {
  readonly cwd: string
  readonly t: TranslateNS<typeof NS>
}

interface TerminalTab {
  readonly id: number
  readonly title: string
}

type TerminalStatus = 'connecting' | 'ready' | 'exited' | 'error'

interface TerminalServerFrame {
  type: 'output' | 'exit' | 'error'
  data?: string
  message?: string
}

/** Derive the /api/terminal WebSocket URL from the page origin. */
function terminalSocketUrl(): string {
  const url = new URL('/api/terminal', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

/** One terminal session: its own xterm surface and WebSocket process. */
function TerminalTabView({ cwd, hidden, t }: { cwd: string; hidden: boolean; t: TranslateNS<typeof NS> }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('connecting')

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    const socket = new WebSocket(terminalSocketUrl())
    let disposed = false

    const send = (frame: unknown): void => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
    }

    socket.addEventListener('open', () => {
      if (disposed) {
        socket.close()
        return
      }
      send({ type: 'open', cwd, cols: term.cols, rows: term.rows })
      setStatus('ready')
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      let frame: TerminalServerFrame
      try {
        frame = JSON.parse(event.data) as TerminalServerFrame
      } catch {
        return
      }
      if (frame.type === 'output' && typeof frame.data === 'string') term.write(frame.data)
      if (frame.type === 'exit') setStatus('exited')
      if (frame.type === 'error') setStatus('error')
    })

    socket.addEventListener('close', () => {
      setStatus(prev => prev === 'exited' ? prev : 'exited')
    })

    const dataDisposable = term.onData((data) => {
      send({ type: 'input', data })
    })
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      send({ type: 'resize', cols, rows })
    })
    // A hidden tab has a zero-size container; skip fitting until it is shown
    // again so fit() never collapses the terminal to 0 rows.
    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit()
    })
    resizeObserver.observe(container)

    const beforeUnload = (): void => { send({ type: 'close' }) }
    window.addEventListener('beforeunload', beforeUnload)

    return () => {
      disposed = true
      window.removeEventListener('beforeunload', beforeUnload)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      send({ type: 'close' })
      socket.close()
      term.dispose()
    }
  }, [cwd])

  return (
    <div className={css.terminalBody} hidden={hidden || undefined}>
      <div ref={containerRef} className={css.terminalXterm} />
      {status === 'connecting' && <p className={css.panelStatus}>{t('terminalConnecting')}</p>}
      {status === 'error' && <p className={css.panelError}>{t('terminalFailed')}</p>}
      {status === 'exited' && <p className={css.panelStatus}>{t('terminalExited')}</p>}
    </div>
  )
}

/** Tabbed terminal panel: independent terminals kept alive across tab switches. */
export function TerminalPanel({ cwd, t }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [{ id: 1, title: t('terminalTab') + ' 1' }])
  const [activeId, setActiveId] = useState(1)
  const nextId = useRef(2)

  // Inject the shared xterm stylesheet once for the whole panel.
  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.dataset.plugin = 'dsh-client-ui-panels'
    styleEl.textContent = XTERM_CSS
    document.head.appendChild(styleEl)
    return () => { styleEl.remove() }
  }, [])

  const addTab = (): void => {
    const id = nextId.current
    nextId.current += 1
    setTabs(prev => [...prev, { id, title: t('terminalTab') + ' ' + String(id) }])
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
    <div className={css.terminal}>
      <div className={css.terminalTabs} role="tablist" aria-label={t('panelTerminal')}>
        {tabs.map(tab => (
          <div key={tab.id} className={css.terminalTab} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              data-active={tab.id === activeId || undefined}
              className={css.terminalTabButton}
              onClick={() => { setActiveId(tab.id) }}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className={css.terminalTabClose}
              aria-label={t('closeTab')}
              onClick={() => { closeTab(tab.id) }}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={css.terminalTabAdd} aria-label={t('addTab')} onClick={addTab}>
          ＋
        </button>
      </div>
      <div className={css.terminalStack}>
        {tabs.map(tab => (
          <TerminalTabView key={tab.id} cwd={cwd} hidden={tab.id !== activeId} t={t} />
        ))}
      </div>
    </div>
  )
}

export default TerminalPanel
