import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { CONTINUE_WATCHING, type Rating, type TitleCard } from '../../features/browse/browseApi'
import { continueWatchingRemoved, myListChanged, ratingChanged } from '../../features/browse/browseSlice'
import { formatMaturity, formatRuntime, formatVote, placeholderStyle } from '../../features/browse/format'
import { useT } from '../../i18n'
import { tmdbImage } from '../../services/tmdbImage'
import { CheckIcon, ChevronDownIcon, CloseIcon, DoubleThumbIcon, PlayIcon, PlusIcon, ThumbDownIcon, ThumbIcon } from '../icons'
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
  rowKey?: string
}

export function HoverPreviewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenPreview | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const api = useMemo<PreviewApi>(() => {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    return {
      schedule(card, anchor, rowKey) {
        if (!canHover) return
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setOpen({ card, rect: anchor.getBoundingClientRect(), rowKey }), OPEN_DELAY_MS)
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

function PreviewCard({ card, rect, rowKey, onClose }: OpenPreview & { onClose: () => void }) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const t = useT()
  const play = () => navigate(`/watch/${card.titleId}`)

  // My List / rating change while the preview is open: read them from the store, not from the card it opened with.
  const live = useAppSelector((s) => findCard(s.browse.feed?.rows, card.titleId)) ?? card
  const { inMyList, myRating } = live
  const toggleList = () => dispatch(myListChanged({ card, inList: !inMyList }))
  const rate = (rating: Rating | null) => dispatch(ratingChanged({ titleId: card.titleId, rating, previous: myRating }))
  const removeFromRow = () => {
    dispatch(continueWatchingRemoved({ titleId: card.titleId }))
    onClose()
  }
  const resumeEpisode =
    rowKey === CONTINUE_WATCHING && card.resumeSeasonNumber !== null && card.resumeEpisodeNumber !== null
      ? t.title.resumeEpisodeLong(card.resumeSeasonNumber, card.resumeEpisodeNumber)
      : null

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
          <RoundButton label={inMyList ? t.title.removeFromList : t.title.addToList} onClick={toggleList}>
            {inMyList ? <CheckIcon /> : <PlusIcon />}
          </RoundButton>
          <RateButton rating={myRating} onRate={rate} />
          {rowKey === CONTINUE_WATCHING && (
            <RoundButton label={t.title.removeFromRow} onClick={removeFromRow}>
              <CloseIcon />
            </RoundButton>
          )}
          <RoundButton label={t.title.moreInfoPhase} className="ml-auto">
            <ChevronDownIcon />
          </RoundButton>
        </div>

        {rowKey === CONTINUE_WATCHING && (resumeEpisode || card.resumePercent !== null) && (
          <div className="flex items-center gap-3 text-sm">
            {card.resumePercent !== null && (
              <div className="h-1 flex-1 bg-white/30" aria-hidden="true">
                <div className="h-full bg-brand" style={{ width: `${card.resumePercent}%` }} />
              </div>
            )}
            {resumeEpisode && <span className="shrink-0 text-muted">{resumeEpisode}</span>}
          </div>
        )}

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

function findCard(rows: { items: TitleCard[] }[] | undefined, titleId: number): TitleCard | undefined {
  for (const row of rows ?? []) for (const c of row.items) if (c.titleId === titleId) return c
  return undefined
}

const RATING_ICONS: Record<Rating, (filled: boolean) => ReactNode> = {
  1: (filled) => <ThumbDownIcon filled={filled} />,
  2: (filled) => <ThumbIcon filled={filled} />,
  3: (filled) => <DoubleThumbIcon filled={filled} className="size-6" />,
}

/**
 * The three thumbs, like the real thing: the round button shows the current rating; resting on it (or focusing it)
 * slides out a pill with the three choices. Choosing the current rating again removes it.
 */
function RateButton({ rating, onRate }: { rating: Rating | null; onRate: (rating: Rating | null) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const choose = (value: Rating) => {
    onRate(value === rating ? null : value)
    setOpen(false)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <RoundButton
        label={rating ? t.title.rated(t.title.ratings[rating]) : t.title.rate}
        onClick={() => (rating ? onRate(null) : setOpen(true))}
      >
        {rating ? RATING_ICONS[rating](true) : <ThumbIcon />}
      </RoundButton>
      {/* Above the button, not over it: centred on it, the pill would cover My List and the buttons next to it.
          The transparent bottom padding bridges the gap, so moving the mouse up to the pill keeps it open. */}
      {open && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-1.5">
          <div
            role="group"
            aria-label={t.title.rate}
            className="flex items-center gap-1 rounded-full bg-neutral-800 px-1.5 py-1 shadow-lg shadow-black/60 ring-1 ring-white/20"
          >
            {([1, 2, 3] as const).map((value) => (
              <button
                key={value}
                type="button"
                title={t.title.ratings[value]}
                aria-label={t.title.ratings[value]}
                aria-pressed={rating === value}
                onClick={() => choose(value)}
                className="grid size-9 place-items-center rounded-full transition hover:scale-110 hover:bg-white/15"
              >
                {RATING_ICONS[value](rating === value)}
              </button>
            ))}
          </div>
        </div>
      )}
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
