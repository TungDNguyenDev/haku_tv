import { http } from '../../services/http'
import type { Rating, TitleCard, TitleType } from '../browse/browseApi'

// GET /api/titles/{id}: everything the detail modal shows, in one request.

export interface Episode {
  seasonNumber: number
  episodeId: number
  episodeNumber: number
  name: string | null // null: the UI shows "Episode 3"
  overview: string | null
  runtimeMinutes: number | null
  stillPath: string | null
  hasVideo: boolean
  progressPercent: number | null // null never started, 100 finished
}

export interface Season {
  seasonNumber: number // 0 = specials (listed last)
  episodeCount: number
}

export interface PersonCredit {
  personId: number
  name: string
  profilePath: string | null
  characterName: string | null
}

/** Where Play continues: an episode of a series (maybe a next one not started yet), or a position in a movie. */
export interface ResumePoint {
  episodeId: number | null
  seasonNumber: number | null
  episodeNumber: number | null
  positionSeconds: number
  durationSeconds: number
}

export interface SimilarTitle {
  titleId: number
  titleType: TitleType
  name: string
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  logoPath: string | null
  maturityAge: number | null
  releaseYear: number | null
  runtimeMinutes: number | null
  seasonCount: number
  voteAverage: number | null
  isRecent: boolean
  hasVideo: boolean
  inMyList: boolean
  myRating: Rating | null
}

export interface TitleDetail extends Omit<SimilarTitle, 'overview'> {
  overview: string | null
  tagline: string | null
  originalTitle: string
  resume: ResumePoint | null
  genres: { genreId: number; name: string }[]
  cast: PersonCredit[]
  directors: PersonCredit[]
  creators: PersonCredit[]
  seasons: Season[]
  episodesSeason: number | null // which season `episodes` belongs to
  episodes: Episode[]
  similar: SimilarTitle[]
}

export async function getTitleDetail(titleId: number, lang: string): Promise<TitleDetail> {
  const res = await http.get<TitleDetail>(`/api/titles/${titleId}`, { params: { lang } })
  return res.data
}

export async function getEpisodes(titleId: number, seasonNumber: number, lang: string): Promise<Episode[]> {
  const res = await http.get<Episode[]>(`/api/titles/${titleId}/seasons/${seasonNumber}/episodes`, { params: { lang } })
  return res.data
}

/**
 * A row card for the My List row of the home page (myListChanged needs one): the modal can add titles that are in no
 * row yet. TMDB's Vietnamese movie genres all start with "Phim ", which the server strips the same way.
 */
export function toCard(title: SimilarTitle | TitleDetail): TitleCard {
  const genres = 'genres' in title ? title.genres.slice(0, 3).map((g) => g.name.replace(/^Phim /, '')).join(' • ') : ''
  return {
    titleId: title.titleId,
    titleType: title.titleType,
    name: title.name,
    posterPath: title.posterPath,
    backdropPath: title.backdropPath,
    logoPath: title.logoPath,
    maturityAge: title.maturityAge,
    releaseYear: title.releaseYear,
    voteAverage: title.voteAverage,
    hasVideo: title.hasVideo,
    inMyList: title.inMyList,
    myRating: title.myRating,
    runtimeMinutes: title.runtimeMinutes,
    genres: genres || null,
    isRecent: title.isRecent,
    resumePercent: null,
    resumeSeasonNumber: null,
    resumeEpisodeNumber: null,
  }
}
