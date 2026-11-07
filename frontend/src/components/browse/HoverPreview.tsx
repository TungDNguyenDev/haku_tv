import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { TitleCard } from '../../features/browse/browseApi'
import { formatMaturity, formatRuntime, formatVote, placeholderStyle } from '../../features/browse/format'
import { useT } from '../../i18n'
import { tmdbImage } from '../../services/tmdbImage'
import { ChevronDownIcon, PlayIcon, PlusIcon, ThumbUpIcon } from '../icons'
import { PreviewContext, type PreviewApi } from './previewContext'

/*
  Hover preview: resting on a card for a moment opens a bigger card with actions and details on top of it.

  It is rendered ONCE for the whole page, in a portal on <body>, not inside the card: the rows are horizontal
  scroll containers (overflow-x: auto also clips vertically), so a card that simply scaled up would be cut off.
  Only on devices with a real mouse; on touch screens a tap opens the title directly.
*/

const OPEN_DELAY_MS = 450

interface OpenPreview {
  card: TitleCard
  rect: DOMRect
}

export function HoverPreviewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenPreview | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const api = useMemo<PreviewApi>(() => {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    return {
      schedule(card, anchor) {
        if (!canHover) return
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setOpen({ card, rect: anchor.getBoundingClientRect() }), OPEN_DELAY_MS)
      },
      cancel() {
        window.clearTimeout(timer.current)
      },
    }
  }, [])

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    setOpen(null)
  }, [])

  // The preview is placed from the card's position at open time; scrolling or resizing would leave it behind.
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <PreviewContext value={api}>
      {children}
      {open && createPortal(<PreviewCard key={open.card.titleId} {...open} onClose={close} />, document.body)}
    </PreviewContext>
  )
}

function PreviewCard({ card, rect, onClose }: OpenPreview & { onClose: () => void }) {
  const navigate = useNavigate()
  const t = useT()
  const play = () => navigate(`/watch/${card.titleId}`)

  // ~1.5x a standard card, centred on the hovered card, kept inside the viewport (first/last card of a row
  // grows inwards instead of off-screen, like the real thing).
  const viewport = document.documentElement.clientWidth
  const width = Math.min(Math.max(rect.width * 1.5, 320), 460)
  const imageHeight = (width * 9) / 16
  const centred = rect.left + rect.width / 2 - width / 2
  const left = Math.min(Math.max(centred, 16), viewport - width - 16)
  const origin = left > centred ? 'left' : left < centred ? 'right' : 'center'
  const top = rect.top + window.scrollY + rect.height / 2 - imageHeight / 2

  const backdrop = tmdbImage(card.backdropPath, 'w780')
  const logo = tmdbImage(card.logoPath, 'w300')
  const vote = formatVote(card.voteAverage)
  const age = formatMaturity(card.maturityAge, t)
  const runtime = card.titleType === 1 ? formatRuntime(card.runtimeMinutes, t) : t.title.series

  return (
    <div
      role="dialog"
      aria-label={card.name}
      onMouseLeave={onClose}
      className="preview-in absolute z-40 overflow-hidden rounded-md bg-surface-raised shadow-2xl shadow-black/80"
      style={{ left: left + window.scrollX, top, width, transformOrigin: `${origin} center` }}
    >
      <button type="button" onClick={play} aria-label={t.title.playName(card.name)} className="relative block aspect-video w-full">
        {backdrop ? (
          <img src={backdrop} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full" style={placeholderStyle(card.titleId)} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-surface-raised to-transparent" />
        {logo ? (
          <img src={logo} alt="" className="absolute bottom-3 left-4 max-h-[38%] max-w-[55%] object-contain object-left-bottom drop-shadow-lg" />
        ) : (
          <p className="absolute bottom-3 left-4 line-clamp-2 max-w-[80%] text-left text-xl font-bold drop-shadow-lg">{card.name}</p>
        )}
      </button>

      <div className="space-y-3 px-4 pt-2 pb-4">
        <div className="flex items-center gap-2">
          <RoundButton label={t.title.play} primary onClick={play}>
            <PlayIcon className="size-5" />
          </RoundButton>
          <RoundButton label={t.title.addToList}>
            <PlusIcon />
          </RoundButton>
          <RoundButton label={t.title.rate}>
            <ThumbUpIcon />
          </RoundButton>
          <RoundButton label={t.title.moreInfoPhase} className="ml-auto">
            <ChevronDownIcon />
          </RoundButton>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {vote && <span className="font-semibold text-green-400">★ {vote}</span>}
          {age && <span className="border border-white/50 px-1.5 text-xs leading-tight">{age}</span>}
          {runtime && <span>{runtime}</span>}
          {card.releaseYear && <span className="text-muted">{card.releaseYear}</span>}
          <span className="rounded-sm border border-white/40 px-1 text-[10px] leading-tight font-semibold text-muted">HD</span>
        </div>

        {card.genres && <p className="text-sm text-white/90">{card.genres}</p>}
      </div>
    </div>
  )
}

function RoundButton({
  label,
  primary = false,
  onClick,
  className = '',
  children,
}: {
  label: string
  primary?: boolean
  onClick?: () => void
  className?: string
  children: ReactNode
}) {
  // Buttons for later phases stay visible (the layout is final) but do nothing yet; the tooltip says when they arrive.
  const style = primary
    ? 'bg-white text-black hover:bg-white/80'
    : onClick
      ? 'border-2 border-white/50 hover:border-white'
      : 'cursor-not-allowed border-2 border-white/30 text-white/60'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-disabled={!onClick}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-full transition ${style} ${className}`}
    >
      {children}
    </button>
  )
}
