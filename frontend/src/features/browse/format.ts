import type { Messages } from '../../i18n'

// Age badge: 0 → "P" in Vietnamese (all ages, as on Vietnamese ratings) or "All", 13 → "13+". Unknown rating → no badge.
export function formatMaturity(age: number | null, t: Messages): string | null {
  if (age === null) return null
  return age === 0 ? t.title.allAges : `${age}+`
}

export function formatVote(vote: number | null): string | null {
  return vote === null ? null : vote.toFixed(1)
}

// 152 → "2 giờ 32 phút" / "2h 32m", 45 → "45 phút" / "45m".
export function formatRuntime(minutes: number | null, t: Messages): string | null {
  if (!minutes) return null
  return t.title.runtime(Math.floor(minutes / 60), minutes % 60)
}

// Stable hue per title for the placeholder shown when TMDB has no image (and for dev data).
export function placeholderStyle(titleId: number): React.CSSProperties {
  const hue = (titleId * 47) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 45% 30%), hsl(${(hue + 40) % 360} 55% 12%))`,
  }
}
