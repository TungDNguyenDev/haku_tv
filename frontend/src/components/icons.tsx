// Small inline icons (no icon library in the viewer bundle).
type IconProps = { className?: string }

export function PlayIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6 4v16a1 1 0 0 0 1.5.86l13-8a1 1 0 0 0 0-1.72l-13-8A1 1 0 0 0 6 4z" />
    </svg>
  )
}

export function InfoIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-5M12 8h.01" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronIcon({ className = 'size-8', direction }: IconProps & { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className={className}>
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlusIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

export function ThumbUpIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <path
        d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0 4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.2 8A2 2 0 0 1 18.3 21H7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronDownIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BackIcon({ className = 'size-8' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
