import { createContext, useContext, useRef } from 'react'
import type { TitleCard } from '../../features/browse/browseApi'

// Shared between the cards and HoverPreviewProvider (kept out of the .tsx so React Fast Refresh keeps working).
export interface PreviewApi {
  schedule: (card: TitleCard, anchor: HTMLElement) => void
  cancel: () => void
}

export const PreviewContext = createContext<PreviewApi | null>(null)

/** Spread onto a card: starts the open timer on mouse enter, cancels it when the mouse leaves before it fires. */
export function useCardHover<T extends HTMLElement>(card: TitleCard) {
  const api = useContext(PreviewContext)
  const ref = useRef<T>(null)
  return {
    ref,
    onMouseEnter: () => {
      if (ref.current) api?.schedule(card, ref.current)
    },
    onMouseLeave: () => api?.cancel(),
  }
}
