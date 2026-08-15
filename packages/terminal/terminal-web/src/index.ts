/**
 * @deepseek-ai/dsh-terminal-web — bidirectional WebSocket terminal carrier for
 * the web panel. One connection owns one node-pty terminal: raw output streams
 * to the browser as 'output' frames, and the browser relays 'input', 'resize',
 * and 'close' frames back. Terminal semantics (shell choice, login flags,
 * interactive shell) belong to the panel; the subprocess seam provides the PTY
 * and whole-session cleanup.
 *
 * Frames are JSON text messages.
 *   client → server: { type: 'open', cwd?, shell?, cols?, rows? }
 *                    { type: 'input', data }
 *                    { type: 'resize', cols, rows }
 *                    { type: 'close' }
 *   server → client: { type: 'output', data }
 *                    { type: 'exit', exitCode, signal }
 *                    { type: 'error', message }
 */

import { Context } from '@deepseek-ai/cordis'
import type { WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import type {
  SubprocessOutcome,
  SubprocessTerminalHandle,
} from '@deepseek-ai/dsh-subprocess'
import WebSocket, { WebSocketServer } from 'ws'

/** Stable Cordis plugin name. */
export const name = 'terminal-web'

/** Services required before the terminal carrier can accept connections. */
export const inject = ['webServer', 'subprocess']

/** WebSocket upgrade pathname for the terminal stream. */
export const TERMINAL_WS_PATH = '/api/terminal'

/** One client-to-server control frame. */
interface TerminalClientFrame {
  type: 'open' | 'input' | 'resize' | 'close'
  cwd?: string
  shell?: string
  cols?: number
  rows?: number
  data?: string
}

/**
 * Whether a Host-header authority names the local loopback. The terminal spawns
 * a host shell, so it is pinned to loopback exactly like the settings and
 * credential planes: no anonymous LAN caller may open a host terminal.
 */
function isLoopbackAuthority(host: string | undefined): boolean {
  if (host === undefined) return false
  let hostname: string
  try {
    hostname = new URL('http://' + host).hostname
  } catch {
    return false
  }
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^[0-9]{1,3}$/.test(part) && Number(part) <= 255)
}

/** Clamp a viewport dimension to a sane bound. */
function clampDimension(value: unknown, fallback: number, max: number): number {
  const numeric = Math.floor(Number(value))
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(1, numeric))
}

/**
 * Mount the terminal WebSocket carrier on the web server.
 * @param ctx - Host plugin context carrying the web server and subprocess services.
 */
export function apply(ctx: Context): void {
  const { webServer, subprocess } = ctx
  const wss = new WebSocketServer({ noServer: true })
  const live = new Set<SubprocessTerminalHandle>()

  ctx.effect(() => {
    const route: WebUpgradeRoute = {
      path: TERMINAL_WS_PATH,
      handler: (req, socket, head) => {
        if (!isLoopbackAuthority(req.headers.host)) {
          socket.end([
            'HTTP/1.1 403 Forbidden',
            'Connection: close',
            'Content-Type: text/plain; charset=utf-8',
            'Content-Length: 9',
            '',
            'forbidden',
          ].join('\r\n'))
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          void pump(ws)
        })
      },
    }
    webServer.registerUpgrade(route)
    return () => {
      for (const handle of live) void handle.terminate()
      live.clear()
      for (const client of wss.clients) client.terminate()
    }
  }, 'terminal-web: /api/terminal upgrade route')

  /** Pump one connection: open a terminal, stream output, relay control frames. */
  async function pump(ws: WebSocket): Promise<void> {
    let handle: SubprocessTerminalHandle | undefined
    let opened = false
    // A resize frame can beat the async spawn; keep the latest one and apply it
    // once the terminal exists so the PTY never keeps a stale default width.
    let pendingResize: { cols: number; rows: number } | undefined

    const send = (frame: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
    }
    const closeTerminal = (): void => {
      if (handle === undefined) return
      const owned = handle
      handle = undefined
      live.delete(owned)
      void owned.terminate().catch(() => {})
    }

    ws.on('message', (raw) => {
      let frame: TerminalClientFrame
      try {
        frame = JSON.parse(String(raw)) as TerminalClientFrame
      } catch {
        return
      }

      if (frame.type === 'open' && !opened) {
        opened = true
        const shell = typeof frame.shell === 'string' && frame.shell !== ''
          ? frame.shell
          : (process.env.SHELL ?? '/bin/bash')
        const cols = clampDimension(frame.cols, 80, 500)
        const rows = clampDimension(frame.rows, 24, 200)
        const cwd = typeof frame.cwd === 'string' && frame.cwd !== '' ? frame.cwd : process.cwd()
        subprocess.spawnTerminal({
          argv: [shell],
          cwd,
          cols,
          rows,
          graceMs: 2000,
        }).then((terminal) => {
          if (ws.readyState !== WebSocket.OPEN) {
            void terminal.terminate().catch(() => {})
            return
          }
          handle = terminal
          live.add(terminal)
          if (pendingResize !== undefined) {
            terminal.resize?.(pendingResize.cols, pendingResize.rows)
            pendingResize = undefined
          }
          terminal.output.on('data', (chunk: Buffer) => {
            send({ type: 'output', data: chunk.toString('utf8') })
          })
          void terminal.done.then((outcome: SubprocessOutcome) => {
            send({ type: 'exit', exitCode: outcome.exitCode, signal: outcome.signal })
            live.delete(terminal)
            if (handle === terminal) handle = undefined
            ws.close()
          }).catch(() => {})
        }).catch((error: unknown) => {
          send({ type: 'error', message: String(error) })
          ws.close()
        })
        return
      }

      if (frame.type === 'input' && typeof frame.data === 'string' && handle !== undefined) {
        void handle.write(frame.data).catch(() => {})
        return
      }
      if (frame.type === 'resize') {
        const cols = clampDimension(frame.cols, 80, 500)
        const rows = clampDimension(frame.rows, 24, 200)
        if (handle !== undefined) {
          handle.resize?.(cols, rows)
        } else {
          pendingResize = { cols, rows }
        }
        return
      }
      if (frame.type === 'close') {
        closeTerminal()
        ws.close()
      }
    })

    ws.on('close', closeTerminal)
    ws.on('error', closeTerminal)
  }
}
