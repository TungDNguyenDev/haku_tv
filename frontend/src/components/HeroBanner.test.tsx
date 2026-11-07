import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroTitle } from '../features/browse/browseApi'
import { renderWithStore } from '../test/render'
import HeroBanner from './HeroBanner'

const hero = (titleId: number): HeroTitle => ({
  titleId,
  titleType: 1,
  name: `Title ${titleId}`,
  overview: `Overview ${titleId}`,
  posterPath: null,
  backdropPath: `/b${titleId}.jpg`,
  logoPath: null,
  maturityAge: 13,
  releaseYear: 2026,
  voteAverage: 7,
  hasVideo: true,
  inMyList: false,
  myRating: null,
})

const shownTitle = () => screen.getByRole('heading', { level: 1 }).textContent
const wait = (seconds: number) => act(() => vi.advanceTimersByTime(seconds * 1000))

describe('HeroBanner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('moves on every 8 s, wraps around, and jumps from the indicator', () => {
    renderWithStore(<HeroBanner heroes={[hero(1), hero(2), hero(3)]} />)
    expect(shownTitle()).toBe('Title 1')
    expect(screen.getAllByRole('button', { name: /^Phim \d\/3/ })).toHaveLength(3)

    wait(7.9)
    expect(shownTitle()).toBe('Title 1')
    wait(0.1)
    expect(shownTitle()).toBe('Title 2')

    fireEvent.click(screen.getByRole('button', { name: 'Phim 3/3: Title 3' }))
    expect(shownTitle()).toBe('Title 3')
    wait(8)
    expect(shownTitle()).toBe('Title 1')

    fireEvent.click(screen.getByRole('button', { name: 'Phim trước' })) // wraps to the last one
    expect(shownTitle()).toBe('Title 3')
    fireEvent.click(screen.getByRole('button', { name: 'Phim tiếp theo' }))
    expect(shownTitle()).toBe('Title 1')
  })

  it('stays put while the detail modal is open, and has no indicator for a single title', () => {
    const { rerender } = renderWithStore(<HeroBanner heroes={[hero(1), hero(2)]} paused />)
    wait(20)
    expect(shownTitle()).toBe('Title 1')

    rerender(<HeroBanner heroes={[hero(1), hero(2)]} />)
    wait(8)
    expect(shownTitle()).toBe('Title 2')

    rerender(<HeroBanner heroes={[hero(1)]} />)
    expect(screen.queryByRole('button', { name: /^Phim / })).toBeNull()
    wait(20)
    expect(shownTitle()).toBe('Title 1')
  })
})
