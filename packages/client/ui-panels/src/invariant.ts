/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-panels`.
 * @module @deepseek-ai/dsh-client-ui-panels/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-panels'

/** Cordis companion plugin name. */
export const name = 'client-ui-panels-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package renders read-only panels (Git review over
 * the `git` apiproxy domain, files over `host.listDirectory`, a self-contained
 * sandboxed iframe browser) plus a terminal over the /api/terminal WebSocket,
 * and holds no cross-plugin mutable state beyond the local dock selection and
 * the browser panel's process-local navigation history.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
