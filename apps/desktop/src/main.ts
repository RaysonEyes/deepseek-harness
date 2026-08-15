/**
 * Electron main process for the DeepSeek Harness macOS desktop app.
 *
 * The web backend is the built `dsh` CLI (`@deepseek-ai/dsh`) booted in `web`
 * mode; it serves the frontend dist itself, so the shell only needs to spawn
 * it and point a BrowserWindow at the printed loopback URL. The backend runs
 * with the app's bundled Node runtime, so the distributed .app needs no system
 * Node installation, and its stdio is piped so the shell can read the
 * `dsh web: http://127.0.0.1:PORT` readiness line the web bundle prints on
 * activation (the port is `0`-assigned by the OS to avoid collisions).
 *
 * The backend is spawned with the app's own binary in `ELECTRON_RUN_AS_NODE`
 * mode with `--expose-internals`: the web profile boots cordis-plugin-hmr,
 * whose loader needs Node's internal module loader. Electron's
 * `utilityProcess` cannot pass that flag in a packaged app (its
 * `IsAllowedOption` explicitly refuses `--expose-internals` unless
 * `ELECTRON_RUN_AS_NODE` is set), so the run-as-node child is the only
 * bundled-runtime route that satisfies the loader.
 *
 * The `DSH_DESKTOP_CAPTURE` environment variable is a verification hook: when
 * set to a file path, the shell waits for the page to finish loading, captures
 * the window to a PNG at that path, and prints where it wrote it. A
 * `DSH_DESKTOP_QUIT_AFTER_CAPTURE=1` alongside it exits the app after the
 * capture so headless smoke runs terminate on their own. A
 * `DSH_DESKTOP_NO_DIALOGS=1` suppresses the native error dialogs (the app
 * logs and quits instead), so a failing backend cannot hang a headless run on
 * an unclickable alert.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { app, BrowserWindow, dialog } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The deployed CLI entry inside the backend closure, relative to the closure root.
 * The deploy root is the wrapper manifest dsh-desktop-backend, so the CLI lands
 * under node_modules like every other dependency. */
const BACKEND_ENTRY = join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
/** The web bundle's readiness line: `dsh web: http://127.0.0.1:PORT`. */
const URL_LINE = /^dsh web: http:\/\/127\.0\.0\.1:(\d+)/

/** Title used while the loopback URL is not yet known. */
const WINDOW_TITLE = 'DeepSeek Harness'

/** Set before quit so the backend-exit handler does not double-report. */
let appQuitting = false

/** The spawned backend child; killed on quit so no orphan node keeps running. */
let backendChild: ChildProcess | undefined

/** Headless verification runs suppress native dialogs: log and quit instead. */
const NO_DIALOGS = process.env.DSH_DESKTOP_NO_DIALOGS === '1'

/** Report a fatal startup or backend error; native dialog unless suppressed. */
function reportFatal(message: string): void {
  if (NO_DIALOGS) {
    console.error('[dsh-desktop] ' + message)
    app.quit()
    return
  }
  void dialog.showErrorBox(WINDOW_TITLE, message)
  app.quit()
}

/** Resolve the deployed backend closure root for dev and packaged layouts. */
function backendRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'backend')
  const here = fileURLToPath(import.meta.url) // apps/desktop/lib/main.js
  return resolve(here, '..', '..', 'resources', 'backend')
}

/** The absolute CLI entry to fork. */
function backendEntry(): string {
  return join(backendRoot(), BACKEND_ENTRY)
}

/** Render the loading window immediately so the app feels alive while the backend boots. */
function createWindow(url: string | undefined): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: WINDOW_TITLE,
    show: false,
    backgroundColor: '#0b0e14',
  })
  window.once('ready-to-show', () => { window.show() })
  if (url !== undefined) void window.loadURL(url)
  return window
}

/** Wait for the backend's readiness line on its piped stdout. */
function waitForUrl(child: ChildProcess, window: BrowserWindow): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const stdout = child.stdout
    if (stdout === null || stdout === undefined) {
      reject(new Error('dsh-desktop: backend was started without piped stdout; cannot read its URL line'))
      return
    }
    let buffer = ''
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      const match = URL_LINE.exec(buffer)
      if (match === null) return
      const [, port] = match
      stdout.off('data', onData)
      resolvePromise('http://127.0.0.1:' + String(port))
    }
    stdout.on('data', onData)
    child.once('exit', (code) => {
      stdout.off('data', onData)
      reject(new Error('dsh-desktop: backend exited before printing its URL (code ' + String(code) + ')'))
    })
    window.once('closed', () => {
      stdout.off('data', onData)
      reject(new Error('dsh-desktop: window closed while waiting for the backend URL'))
    })
  })
}

/** Capture the window to a PNG when the verification hook requests it. */
function armCaptureHook(window: BrowserWindow, url: string): void {
  const capturePath = process.env.DSH_DESKTOP_CAPTURE
  if (capturePath === undefined || capturePath === '') return
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      // Let the client shell mount and settle before the capture.
      await new Promise(resolveTimer => setTimeout(resolveTimer, 5000))
      const image = await window.webContents.capturePage()
      writeFileSync(capturePath, image.toPNG())
      console.log('dsh-desktop: capture written to ' + capturePath + ' (loaded ' + url + ')')
      if (process.env.DSH_DESKTOP_QUIT_AFTER_CAPTURE === '1') app.quit()
    })()
  })
}

console.log('[dsh-desktop] main module loaded')
void app.whenReady().then(async () => {
  console.log('[dsh-desktop] app ready')
  const entry = backendEntry()
  if (!existsSync(entry)) {
    reportFatal('The bundled backend is missing at ' + entry + '. Run pnpm --filter @deepseek-ai/dsh-desktop run build:backend in the repository before launching.')
    return
  }

  console.log('[dsh-desktop] backend entry:', entry)
  const window = createWindow(undefined)
  console.log('[dsh-desktop] spawning backend')
  const backend = spawn(process.execPath, ['--expose-internals', entry, 'web', '--port', '0'], {
    cwd: app.getPath('home'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'pipe',
  })
  backendChild = backend
  backend.on('error', (error) => {
    console.error('[dsh-desktop] backend spawn failed:', error)
    reportFatal('Could not start the DeepSeek Harness backend: ' + String(error.message))
  })
  backend.stdout?.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    if (!text.includes('dsh web:')) console.log('[dsh-desktop][backend stdout]', text)
  })
  backend.stderr?.on('data', (chunk) => {
    // Full stderr: a truncated slice hid the loader-entry cause twice during
    // verification, so keep the whole chunk for diagnosis.
    console.log('[dsh-desktop][backend stderr]', chunk.toString('utf8'))
  })
  backend.once('exit', (code) => {
    console.log('[dsh-desktop] backend exited, code', code)
    backendChild = undefined
    // The backend quitting is the app quitting: every window shows the same
    // server, so a dead server leaves nothing to display.
    if (!appQuitting) {
      reportFatal('The DeepSeek Harness backend stopped unexpectedly (code ' + String(code) + ').')
    }
  })

  try {
    console.log('[dsh-desktop] waiting for backend URL')
    const url = await waitForUrl(backend, window)
    void window.loadURL(url)
    armCaptureHook(window, url)
  } catch (error) {
    console.error('[dsh-desktop] backend startup failed:', error)
    reportFatal('Could not start the DeepSeek Harness backend: ' + (error instanceof Error ? error.message : String(error)))
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  // macOS dock click with no open window: the backend is gone only if the
  // process is quitting, so re-create the window for the still-served URL.
  if (BrowserWindow.getAllWindows().length === 0 && !appQuitting) {
    createWindow(undefined)
  }
})

app.on('before-quit', () => {
  // Mark quitting so the backend-exit handler does not double-report; stop
  // the backend (SIGTERM exits 0 in the web profile) so no orphan survives.
  appQuitting = true
  backendChild?.kill('SIGTERM')
  backendChild = undefined
})
