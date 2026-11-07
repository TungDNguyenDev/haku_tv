import { ChevronIcon } from './icons'

interface Props {
  direction: 'left' | 'right'
  label: string
  onClick: () => void
  /** Placement and display (e.g. "hidden md:grid": the content is centred as a grid); the look stays the same. */
  className?: string
}

/**
 * Left / right arrow of the scrolling rows and the home banner: a small dark box, vertically centred by the caller,
 * that sits in the side gutter instead of covering the cards.
 */
export default function ArrowButton({ direction, label, onClick, className = '' }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`group/arrow h-14 w-10 place-items-center rounded bg-black/50 text-white transition hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none ${className}`}
    >
      <ChevronIcon direction={direction} className="size-7 transition-transform group-hover/arrow:scale-125" />
    </button>
  )
}
