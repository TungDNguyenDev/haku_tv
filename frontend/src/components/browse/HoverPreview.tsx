import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { CONTINUE_WATCHING, type Rating, type TitleCard } from '../../features/browse/browseApi'
import { continueWatchingRemoved, myListChanged, ratingChanged } from '../../features/browse/browseSlice'
import { formatMaturity, formatRuntime, formatVote, placeholderStyle } from '../../features/browse/format'
import { useDetailNavigation } from '../../features/detail/detailRoute'
import { useT } from '../../i18n'
import { tmdbImage } from '../../services/tmdbImage'
import { CheckIcon, CloseIcon, PlayIcon, PlusIcon } from '../icons'
import { PreviewContext, type PreviewApi } from './previewContext'
import { RateButton, RoundButton } from './TitleActions'

/*
  Hover preview: resting on a card for a moment opens a bigger card with actions and details on top of it.

  It is rendered ONCE for the whole page, in a portal on <body>, not inside the card: the rows are horizontal
  scroll containers (overflow-x: auto also clips vertically), so a card that simply scaled up would be cut off.
  Only on devices with a real mouse; on touch screens a tap opens the title directly.
*/

// Resting on a card this long opens its preview, so sweeping the mouse across the page does not pop cards open.
const OPEN_DELAY_MS = 450

/** Starts loading the preview's pictures during the wait, so they are already there when it opens. */
function preload(card: TitleCard) {
  for (const src of [tmdbImage(card.backdropPath, 'w780'), tmdbImage(card.logoPath, 'w300')]) {
    if (src) new Image().src = src
  }
}

/**
 * Width of a 16:9 BackdropCard (cards.tsx: w-[44vw] sm:w-[30vw] md:w-[23vw] lg:w-[18.5vw] xl:w-[15.6vw]).
 * innerWidth, like the CSS: media queries and vw both count the scrollbar.
 */
function backdropCardWidth() {
  const width = window.innerWidth
  const vw = width >= 1280 ? 15.6 : width >= 1024 ? 18.5 : width >= 768 ? 23 : width >= 640 ? 30 : 44
  return (width * vw) / 100
}

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
        preload(card)
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
  const { open: openDetail } = useDetailNavigation()
  const moreInfo = () => {
    onClose()
    openDetail(card.titleId)
  }

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

  // ~1.5x a standard 16:9 card, whatever card was hovered (a narrow poster must not get a smaller preview),
  // centred on the hovered card, kept inside the viewport (first/last card of a row grows inwards instead of
  // off-screen, like the real thing).
  const viewport = document.documentElement.clientWidth
  const width = Math.min(Math.max(backdropCardWidth() * 1.5, 320), 460)
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
      // A click anywhere on the card opens the detail modal, except on the action buttons (they stop the click).
      onClick={moreInfo}
      className="preview-in absolute z-40 cursor-pointer overflow-hidden rounded-md bg-surface-raised shadow-2xl shadow-black/80"
      style={{ left: left + window.scrollX, top, width, transformOrigin: `${origin} center` }}
    >
      {/* The click bubbles to the card (opens the detail); a real button so keyboard users can reach it too. */}
      <button type="button" aria-label={`${t.title.moreInfo}: ${card.name}`} className="relative block aspect-video w-full">
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
        {/* Clicks here stay with the buttons and don't reach the card. */}
        <div className="flex w-fit items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

