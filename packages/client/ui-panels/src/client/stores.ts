/**
 * Panel state shared between the header dock (which toggles panels), the
 * right-side companion host, and the bottom host. One store handle is passed to
 * every registration in apply, so the framework's per-handle × scope cache gives
 * every seat the same session-scoped instance. The right-side and bottom seats
 * are independent so a browser/review/files surface and the terminal can be
 * open at once.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Surfaces that open in the right-side companion column. */
export type SidePanelId = 'browser' | 'review' | 'files'
/** Surfaces that open in the bottom host. */
export type BottomPanelId = 'terminal' | 'assistant'
/** Every panel the dock toggles. */
export type PanelId = SidePanelId | BottomPanelId

/** Panel state: which surface each host shows, the bottom height, and terminal liveness. */
export type PanelsState = {
  /** Open right-side surface (browser/review/files), or none. */
  side: SidePanelId | null
  /** Open bottom surface (terminal/assistant), or none. */
  bottom: BottomPanelId | null
  /** Bottom host height in px. */
  height: number
  /** Right-side companion width in px. */
  sideWidth: number
  /** True once the terminal has been opened and not actively closed: it stays
   * mounted through hide/show so its sessions survive a dock toggle. */
  terminalOpened: boolean
}

/** Write set: the dock toggles, the hosts close/dismiss, and the bottom host resizes. */
export type PanelsActions = {
  toggle: (draft: PanelsState, id: PanelId) => void
  closeSide: (draft: PanelsState) => void
  closeBottom: (draft: PanelsState) => void
  dismiss: (draft: PanelsState) => void
  setHeight: (draft: PanelsState, px: number) => void
  setSideWidth: (draft: PanelsState, px: number) => void
}

/** Smallest height the terminal stays usable at. */
export const PANEL_HEIGHT_MIN = 120
/** Cap so a single drag cannot bury the conversation entirely. */
export const PANEL_HEIGHT_MAX = 900

/** Default panel height: ~30% of the viewport, with a fixed fallback off-window. */
function defaultHeight(): number {
  if (typeof window === 'undefined') return 240
  return Math.round(window.innerHeight * 0.3)
}

/** Smallest width a right-side surface stays usable at. */
export const SIDE_WIDTH_MIN = 320
/** Cap so a single drag cannot bury the conversation entirely. */
export const SIDE_WIDTH_MAX = 1200

/** Default side width: ~40% of the viewport, with a fixed fallback off-window. */
function defaultSideWidth(): number {
  if (typeof window === 'undefined') return 560
  return Math.round(window.innerWidth * 0.4)
}

/** Whether a panel id opens on the right side rather than the bottom. */
function isSidePanel(id: PanelId): id is SidePanelId {
  return id === 'browser' || id === 'review' || id === 'files'
}

/**
 * Create the panels store handle. The height and tab selection are transient
 * interaction state (not persisted).
 * @returns the shared store handle for the dock and both hosts.
 */
export function createPanelsStore(): EngineStoreHandle<PanelsState, PanelsActions> {
  return defineStore({
    init: (): PanelsState => ({ side: null, bottom: null, height: defaultHeight(), sideWidth: defaultSideWidth(), terminalOpened: false }),
    actions: {
      toggle: (draft, id) => {
        if (isSidePanel(id)) {
          draft.side = draft.side === id ? null : id
        } else {
          draft.bottom = draft.bottom === id ? null : id
          // Opening the terminal marks it opened; only the ✕ close button
          // resets this, so a dock toggle keeps the session alive.
          if (id === 'terminal' && draft.bottom === 'terminal') draft.terminalOpened = true
        }
      },
      closeSide: (draft) => { draft.side = null },
      closeBottom: (draft) => {
        if (draft.bottom === 'terminal') draft.terminalOpened = false
        draft.bottom = null
      },
      dismiss: (draft) => {
        // Escape hides both surfaces without disposing the terminal session.
        draft.side = null
        draft.bottom = null
      },
      setHeight: (draft, px: number) => { draft.height = Math.min(PANEL_HEIGHT_MAX, Math.max(PANEL_HEIGHT_MIN, px)) },
      setSideWidth: (draft, px: number) => { draft.sideWidth = Math.min(SIDE_WIDTH_MAX, Math.max(SIDE_WIDTH_MIN, px)) },
    },
  })
}
