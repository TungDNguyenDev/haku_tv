import { Link } from 'react-router-dom'
import type { TitleCard } from '../../features/browse/browseApi'
import { placeholderStyle } from '../../features/browse/format'
import { tmdbImage } from '../../services/tmdbImage'
import { useCardHover } from './previewContext'

/*
  The three card shapes of the browse rows. Widths are viewport-relative so a row shows about the same number
  of cards at any screen size (plus a peek of the next one, which hints that the row scrolls).
*/

const focusRing = 'outline-offset-2 focus-visible:outline-2 focus-visible:outline-white'

/** 16:9 backdrop with the title logo (TMDB backdrops have no text on them). */
export function BackdropCard({ card }: { card: TitleCard }) {
  const hover = useCardHover<HTMLAnchorElement>(card)
  const image = tmdbImage(card.backdropPath, 'w780')
  const logo = tmdbImage(card.logoPath, 'w300')

  return (
    <Link
      to={`/watch/${card.titleId}`}
      aria-label={card.name}
      {...hover}
      className={`relative block aspect-video w-[44vw] shrink-0 snap-start overflow-hidden rounded-md bg-surface-raised sm:w-[30vw] md:w-[23vw] lg:w-[18.5vw] xl:w-[15.6vw] ${focusRing}`}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="size-full" style={placeholderStyle(card.titleId)} />
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/70 to-transparent" />
      {logo ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          className="absolute bottom-[8%] left-[6%] max-h-[40%] max-w-[58%] object-contain object-left-bottom drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
        />
      ) : (
        <p className="absolute bottom-[8%] left-[6%] line-clamp-2 max-w-[85%] text-sm font-bold drop-shadow md:text-base">{card.name}</p>
      )}
      {card.isRecent && <NewBadge />}
    </Link>
  )
}

/** Tall 2:3 poster: the poster artwork already carries the title. */
export function PosterCard({ card }: { card: TitleCard }) {
  const hover = useCardHover<HTMLAnchorElement>(card)
  const image = tmdbImage(card.posterPath, 'w342')

  return (
    <Link
      to={`/watch/${card.titleId}`}
      aria-label={card.name}
      {...hover}
      className={`relative block aspect-[2/3] w-[31vw] shrink-0 snap-start overflow-hidden rounded-md bg-surface-raised sm:w-[22vw] md:w-[17vw] lg:w-[13.8vw] xl:w-[11.6vw] ${focusRing}`}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center p-3 text-center font-bold" style={placeholderStyle(card.titleId)}>
          {card.name}
        </div>
      )}
      {card.isRecent && <NewBadge />}
    </Link>
  )
}

/** Top 10: a big outlined rank number with the poster overlapping its right edge. */
export function RankCard({ card, rank }: { card: TitleCard; rank: number }) {
  const hover = useCardHover<HTMLAnchorElement>(card)
  const image = tmdbImage(card.posterPath, 'w342')

  return (
    <Link
      to={`/watch/${card.titleId}`}
      aria-label={`Hạng ${rank}: ${card.name}`}
      {...hover}
      className={`relative flex aspect-[4/3] w-[52vw] shrink-0 snap-start items-end sm:w-[37vw] md:w-[28vw] lg:w-[22vw] xl:w-[18.6vw] ${focusRing}`}
    >
      {/* SVG so the number scales with the card; "10" is squeezed into the same width as one digit. */}
      <svg viewBox="0 0 110 150" className="h-full w-[55%] shrink-0 overflow-visible" aria-hidden="true">
        <text
          x="110"
          y="146"
          textAnchor="end"
          fontSize="180"
          fontWeight="900"
          fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
          letterSpacing="-6"
          fill="var(--color-surface)"
          stroke="#5c5c5c"
          strokeWidth="3.5"
          {...(rank >= 10 && { textLength: 108, lengthAdjust: 'spacingAndGlyphs' })}
        >
          {rank}
        </text>
      </svg>
      <div className="relative -ml-[5%] h-full w-1/2 shrink-0 overflow-hidden rounded-sm bg-surface-raised shadow-lg shadow-black/60">
        {image ? (
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-2 text-center text-sm font-bold" style={placeholderStyle(card.titleId)}>
            {card.name}
          </div>
        )}
      </div>
    </Link>
  )
}

function NewBadge() {
  return (
    <span className="absolute top-0 left-2 rounded-b-sm bg-brand px-1.5 pt-0.5 pb-1 text-[10px] font-bold tracking-wide uppercase shadow">
      Mới
    </span>
  )
}
