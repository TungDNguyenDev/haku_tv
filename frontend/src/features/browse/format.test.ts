import { describe, expect, it } from 'vitest'
import { en } from '../../i18n/en'
import { vi } from '../../i18n/vi'
import { maturityLabel } from '../profiles/maturity'
import { formatMaturity, formatRuntime, formatVote } from './format'

describe('formatRuntime', () => {
  it.each([
    [152, '2 giờ 32 phút', '2h 32m'],
    [120, '2 giờ', '2h'],
    [45, '45 phút', '45m'],
  ])('%i minutes', (minutes, inVietnamese, inEnglish) => {
    expect(formatRuntime(minutes, vi)).toBe(inVietnamese)
    expect(formatRuntime(minutes, en)).toBe(inEnglish)
  })

  it('shows nothing for an unknown runtime', () => {
    expect(formatRuntime(null, vi)).toBeNull()
    expect(formatRuntime(0, vi)).toBeNull()
  })
})

describe('formatMaturity', () => {
  it('shows "all ages" in the local style and an age as N+', () => {
    expect(formatMaturity(0, vi)).toBe('P')
    expect(formatMaturity(0, en)).toBe('All')
    expect(formatMaturity(13, en)).toBe('13+')
    expect(formatMaturity(null, en)).toBeNull()
  })
})

describe('formatVote', () => {
  it('keeps one decimal', () => {
    expect(formatVote(8.25)).toBe('8.3')
    expect(formatVote(null)).toBeNull()
  })
})

describe('maturityLabel', () => {
  it('names adult tiers by age and Kids tiers by audience', () => {
    expect(maturityLabel(en, false, null)).toBe(en.maturity.all)
    expect(maturityLabel(en, false, 16)).toBe('Up to 16+')
    expect(maturityLabel(vi, true, null)).toBe(vi.maturity.kids)
    expect(maturityLabel(vi, true, 7)).toBe(vi.maturity.littleKids)
  })
})
