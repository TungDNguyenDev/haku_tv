import { http } from '../../services/http'

export type TitleType = 1 | 2 // 1 = movie, 2 = series

// The three thumbs: 1 = not for me, 2 = I like this, 3 = love this.
export type Rating = 1 | 2 | 3

interface TitleBase {
  titleId: number
  titleType: TitleType
  name: string
  posterPath: string | null
  backdropPath: string | null
  logoPath: string | null
  maturityAge: number | null
  releaseYear: number | null
  voteAverage: number | null
  hasVideo: boolean
  // The current profile's own state (Phase 4)
  inMyList: boolean
  myRating: Rating | null
}

export interface TitleCard extends TitleBase {
  runtimeMinutes: number | null
  genres: string | null // "Hành Động • Phiêu Lưu"
  isRecent: boolean
  // Continue watching cards only: progress of the movie / episode to continue, and which episode it is.
  // A next episode not started yet has a season/episode but no percent.
  resumePercent: number | null
  resumeSeasonNumber: number | null
  resumeEpisodeNumber: number | null
}

export interface HeroTitle extends TitleBase {
  overview: string | null
}

// How the UI draws a row (decided by the SQL proc): 16:9 backdrops, ranked posters, or tall posters.
export type RowLayout = 'standard' | 'top10' | 'poster'

// Rows only this profile has, filled from its own data. The UI names them itself (and may add the My List row).
export const CONTINUE_WATCHING = 'continue-watching'
export const MY_LIST = 'my-list'

export interface BrowseRow {
  key: string
  name: string
  layout: RowLayout
  items: TitleCard[]
}

export interface HomeFeed {
  heroes: HeroTitle[] // billboard titles, newest release first; the banner rotates through them
  rows: BrowseRow[]
}

export async function getHome(lang: string): Promise<HomeFeed> {
  const res = await http.get<HomeFeed>('/api/browse/home', { params: { lang } })
  return res.data
}
