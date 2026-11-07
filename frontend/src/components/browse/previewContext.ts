import { createContext, useContext, useRef } from 'react'
import type { TitleCard } from '../../features/browse/browseApi'

// Shared between the cards and HoverPreviewProvider (kept out of the .tsx so React Fast Refresh keeps working).
export interface PreviewApi {
  /** rowKey: which row the card is in (the Continue watching preview offers "remove from row"). */
  schedule: (card: TitleCard, anchor: HTMLElement, rowKey?: string) => void
  cancel: () => void
}

export const PreviewContext = createContext<PreviewApi | null>(null)

/** Spread onto a card: starts the open timer on mouse enter, cancels it when the mouse leaves before it fires. */
export function useCardHover<T extends HTMLElement>(card: TitleCard, rowKey?: string) {
  const api = useContext(PreviewContext)
  const ref = useRef<T>(null)
  return {
    ref,
    onMouseEnter: () => {
      if (ref.current) api?.schedule(card, ref.current, rowKey)
    },
    onMouseLeave: () => api?.cancel(),
  }
}
