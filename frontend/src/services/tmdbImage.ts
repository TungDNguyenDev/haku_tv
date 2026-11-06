// The DB stores TMDB image paths ('/abc.jpg'); images are loaded straight from TMDB's CDN.
// Sizes: https://developer.themoviedb.org/docs/image-basics
export type TmdbImageSize = 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

const BASE = 'https://image.tmdb.org/t/p/'

export function tmdbImage(path: string | null | undefined, size: TmdbImageSize): string | null {
  return path ? `${BASE}${size}${path}` : null
}
