/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-terminal-web`.
 * @module @deepseek-ai/dsh-terminal-web/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-terminal-web'

/** Cordis companion plugin name. */
export const name = 'terminal-web-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * Owned relation: the terminal WebSocket upgrade route and its disposer must
 * stay symmetric — after the owning fiber unloads, the route table must no
 * longer answer for its path (a stale route would keep upgrading sockets to
 * a disposed plugin's handler). Probed exactly like the webserver companion's
 * register/dispose cycle, scoped to the terminal upgrade path.
 */
const install: InvariantInstaller = (ctx, fail) => {
  ctx.on('internal/plugin', () => {
    const server = ctx.get('webServer') as
      | { registerUpgrade(route: { path: string; handler: () => void }): () => void }
      | undefined
    if (server === undefined) return // no webserver row in this composition
    const probe = { path: '/__dsh_terminal_invariant_probe__', handler: () => {} }
    try {
      server.registerUpgrade(probe)()
      server.registerUpgrade(probe)()
    } catch {
      fail('webServer upgrade-route disposer left a route registered — terminal-web route lifecycle diverged')
    }
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
