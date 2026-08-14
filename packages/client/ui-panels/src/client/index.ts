/** Panel switcher browser plugin: registers the dock into the session header utilities. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PanelDock, type PanelsInjected } from './PanelDock.tsx'
import { en, NS, zh, type PanelsLocaleKey } from './locales.ts'

export type { PanelDockProps, PanelId, PanelsInjected } from './PanelDock.tsx'
export type { PanelsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Panel switcher copy. */
    'panels': PanelsLocaleKey
  }
}

/** Services required by the header-slot registration and the injected wire client. */
export const inject = ['slots', 'locale', 'connection']

/** Contribute the panel dock to the session header utilities strip. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-panels: dictionaries')

  const api = (ctx.get('connection') as ConnectionHandle).api
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'panels',
    order: 10,
    locale: NS,
    inject: (): PanelsInjected => ({ api }),
  }, PanelDock))
}
