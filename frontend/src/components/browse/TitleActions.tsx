import { useState, type ReactNode } from 'react'
import type { Rating } from '../../features/browse/browseApi'
import { useT } from '../../i18n'
import { DoubleThumbIcon, ThumbDownIcon, ThumbIcon } from '../icons'

// The round action buttons of the hover preview and the detail modal (My List, rating, ...).

const SIZES = { md: 'size-9', lg: 'size-10 md:size-11' }

export function RoundButton({
  label,
  primary = false,
  size = 'md',
  onClick,
  className = '',
  children,
}: {
  label: string
  primary?: boolean
  size?: keyof typeof SIZES
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  const style = primary ? 'bg-white text-black hover:bg-white/80' : 'border-2 border-white/50 bg-black/30 hover:border-white'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-full transition ${SIZES[size]} ${style} ${className}`}
    >
      {children}
    </button>
  )
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
export function RateButton({
  rating,
  onRate,
  size = 'md',
}: {
  rating: Rating | null
  onRate: (rating: Rating | null) => void
  size?: keyof typeof SIZES
}) {
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
        size={size}
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
