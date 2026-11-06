// Age badge: 0 → "P" (all ages, as on Vietnamese ratings), 13 → "13+". Unknown rating → no badge.
export function formatMaturity(age: number | null): string | null {
  if (age === null) return null
  return age === 0 ? 'P' : `${age}+`
}

export function formatVote(vote: number | null): string | null {
  return vote === null ? null : vote.toFixed(1)
}

// 152 → "2 giờ 32 phút", 45 → "45 phút".
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} phút`
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`
}

// Stable hue per title for the placeholder shown when TMDB has no image (and for dev data).
export function placeholderStyle(titleId: number): React.CSSProperties {
  const hue = (titleId * 47) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 45% 30%), hsl(${(hue + 40) % 360} 55% 12%))`,
  }
}
