import { configureStore } from '@reduxjs/toolkit'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import createSagaMiddleware from 'redux-saga'
import { afterEach, describe, expect, it } from 'vitest'
import { http } from '../../services/http'
import browseReducer, { myListChanged, ratingChanged } from '../browse/browseSlice'
import { toCard, type Episode, type SimilarTitle, type TitleDetail } from './detailApi'
import { detailSaga } from './detailSaga'
import detailReducer, { detailRequested, detailSucceeded, seasonSelected } from './detailSlice'

const episode = (seasonNumber: number, episodeNumber: number): Episode => ({
  seasonNumber,
  episodeId: seasonNumber * 100 + episodeNumber,
  episodeNumber,
  name: null,
  overview: null,
  runtimeMinutes: 45,
  stillPath: null,
  hasVideo: true,
  progressPercent: null,
})

const similar: SimilarTitle = {
  titleId: 9,
  titleType: 1,
  name: 'Similar',
  overview: null,
  posterPath: null,
  backdropPath: null,
  logoPath: null,
  maturityAge: 13,
  releaseYear: 2021,
  runtimeMinutes: 100,
  seasonCount: 0,
  voteAverage: 7,
  isRecent: false,
  hasVideo: true,
  inMyList: false,
  myRating: null,
}

const detail = (titleId: number): TitleDetail => ({
  titleId,
  titleType: 2,
  name: `Series ${titleId}`,
  overview: null,
  tagline: null,
  originalTitle: `Series ${titleId}`,
  posterPath: null,
  backdropPath: null,
  logoPath: null,
  maturityAge: 13,
  releaseYear: 2020,
  runtimeMinutes: null,
  seasonCount: 2,
  voteAverage: 8,
  isRecent: false,
  hasVideo: true,
  inMyList: false,
  myRating: null,
  resume: null,
  genres: [{ genreId: 1, name: 'Phim Hành Động' }],
  cast: [],
  directors: [],
  creators: [],
  seasons: [
    { seasonNumber: 1, episodeCount: 2 },
    { seasonNumber: 2, episodeCount: 1 },
  ],
  episodesSeason: 1,
  episodes: [episode(1, 1), episode(1, 2)],
  similar: [similar],
})

/* The API is faked at the HTTP layer (axios adapter), as in the other saga tests: the real detailApi and saga run. */
const originalAdapter = http.defaults.adapter
let requests: string[] = []

function fakeServer() {
  requests = []
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    requests.push(config.url ?? '')
    const data = config.url?.endsWith('/episodes') ? [episode(2, 1)] : detail(Number(config.url?.split('/').pop()))
    return { status: 200, statusText: '', headers: new AxiosHeaders(), config, data }
  }
}

function setup() {
  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: { browse: browseReducer, detail: detailReducer },
    middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  })
  sagaMiddleware.run(detailSaga)
  return store
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('detail modal (detailSlice + detailSaga)', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter
  })

  it('loads a title with the episodes of its first season, and other seasons once', async () => {
    fakeServer()
    const store = setup()
    store.dispatch(detailRequested({ titleId: 7, lang: 'vi' }))
    await settle()
    expect(store.getState().detail).toMatchObject({ status: 'succeeded', season: 1, detail: { titleId: 7 } })

    store.dispatch(seasonSelected({ titleId: 7, seasonNumber: 2, lang: 'vi' }))
    expect(store.getState().detail.seasonStatus).toBe('loading')
    await settle()
    expect(store.getState().detail.episodes[2].map((e) => e.episodeId)).toEqual([201])

    store.dispatch(seasonSelected({ titleId: 7, seasonNumber: 1, lang: 'vi' })) // came with the title
    store.dispatch(seasonSelected({ titleId: 7, seasonNumber: 2, lang: 'vi' })) // loaded above
    await settle()
    expect(requests).toEqual(['/api/titles/7', '/api/titles/7/seasons/2/episodes'])
    expect(store.getState().detail.seasonStatus).toBe('idle')
  })

  it('ignores the answer for a title the modal already left', () => {
    const store = setup()
    store.dispatch(detailRequested({ titleId: 8, lang: 'vi' }))
    store.dispatch(detailSucceeded(detail(7)))
    expect(store.getState().detail).toMatchObject({ status: 'loading', detail: null })
  })

  it('My List and ratings from anywhere update the modal and its "More like this" cards', async () => {
    fakeServer()
    const store = setup()
    store.dispatch(detailRequested({ titleId: 7, lang: 'vi' }))
    await settle()

    const shown = store.getState().detail.detail!
    store.dispatch(myListChanged({ card: toCard(shown), inList: true }))
    store.dispatch(ratingChanged({ titleId: 7, rating: 3, previous: null }))
    store.dispatch(myListChanged({ card: toCard(shown.similar[0]), inList: true }))

    const after = store.getState().detail.detail!
    expect([after.inMyList, after.myRating, after.similar[0].inMyList]).toEqual([true, 3, true])
    expect(toCard(shown).genres).toBe('Hành Động') // the "Phim " prefix is dropped, as on the server
  })
})
