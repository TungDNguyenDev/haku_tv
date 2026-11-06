import { http } from '../../services/http'

export type TitleType = 1 | 2 // 1 = movie, 2 = series

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
}

export interface TitleCard extends TitleBase {
  runtimeMinutes: number | null
  genres: string | null // "Hành Động • Phiêu Lưu"
  isRecent: boolean
}

export interface HeroTitle extends TitleBase {
  overview: string | null
}

// How the UI draws a row (decided by the SQL proc): 16:9 backdrops, ranked posters, or tall posters.
export type RowLayout = 'standard' | 'top10' | 'poster'

export interface BrowseRow {
  key: string
  name: string
  layout: RowLayout
  items: TitleCard[]
}

export interface HomeFeed {
  hero: HeroTitle | null
  rows: BrowseRow[]
}

export async function getHome(lang: string): Promise<HomeFeed> {
  const res = await http.get<HomeFeed>('/api/browse/home', { params: { lang } })
  return res.data
}
