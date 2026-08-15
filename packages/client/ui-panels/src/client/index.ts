/** Panel switcher plugin: the header dock, the right-side companion host, and the bottom host. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PanelDock, PanelHost, PanelSide, type PanelsInjected } from './PanelDock.tsx'
import { createPanelsStore } from './stores.ts'
import { en, NS, zh, type PanelsLocaleKey } from './locales.ts'

export type { PanelDockProps, PanelHostProps, PanelSideProps, PanelsInjected, PanelsStore } from './PanelDock.tsx'
export type { BottomPanelId, PanelId, PanelsActions, PanelsState, SidePanelId } from './stores.ts'
export type { PanelsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Panel switcher copy. */
    'panels': PanelsLocaleKey
  }
}

/** Services required by the header-slot registration and the injected wire client. */
export const inject = ['slots', 'locale', 'connection']

/** Contribute the dock (header) and the bottom panel host (conversation). */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-panels: dictionaries')

  const api = (ctx.get('connection') as ConnectionHandle).api
  // One shared handle: the framework's per-handle × scope cache gives the dock
  // and the host the same session-scoped store instance, so a tab click in the
  // header opens the surface in the bottom host.
  const panelsStore = createPanelsStore()
  const inject = (): PanelsInjected => ({ api })

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'panels',
    order: 10,
    locale: NS,
    store: panelsStore,
    inject,
  }, PanelDock))

  ctx.slots.inject('conversation.panel', () => ctx.slots.register({
    name: 'conversation.panel',
    id: 'panels',
    locale: NS,
    store: panelsStore,
    inject,
  }, PanelHost))

  ctx.slots.inject('conversation.side', () => ctx.slots.register({
    name: 'conversation.side',
    id: 'panels',
    locale: NS,
    store: panelsStore,
    inject,
  }, PanelSide))
}
