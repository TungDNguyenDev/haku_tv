import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import createSagaMiddleware from 'redux-saga'
import { afterEach, describe, expect, it } from 'vitest'
import { http } from '../../services/http'
import { CONTINUE_WATCHING, MY_LIST, type BrowseRow, type HomeFeed, type TitleCard } from '../browse/browseApi'
import browseReducer, {
  continueWatchingRemoved,
  homeInvalidated,
  homeSucceeded,
  myListChanged,
  ratingChanged,
} from '../browse/browseSlice'
import { librarySaga } from './librarySaga'

const card = (titleId: number, extra: Partial<TitleCard> = {}): TitleCard => ({
  titleId,
  titleType: 1,
  name: `Title ${titleId}`,
  posterPath: null,
  backdropPath: null,
  logoPath: null,
  maturityAge: 13,
  releaseYear: 2024,
  voteAverage: 7,
  hasVideo: true,
  inMyList: false,
  myRating: null,
  runtimeMinutes: 100,
  genres: null,
  isRecent: false,
  resumePercent: null,
  resumeSeasonNumber: null,
  resumeEpisodeNumber: null,
  ...extra,
})

const row = (key: string, items: TitleCard[]): BrowseRow => ({ key, name: key, layout: 'standard', items })

// Title 1 is in two rows (and is the hero): every copy must change together.
const feed = (): HomeFeed => ({
  hero: { ...card(1), overview: null },
  rows: [
    row(CONTINUE_WATCHING, [card(5, { resumePercent: 40 }), card(6, { resumeSeasonNumber: 1, resumeEpisodeNumber: 2 })]),
    row('top10-movies', [card(1), card(2)]),
    row('popular-movies', [card(3), card(1)]),
    row('genre-28', [card(4)]),
  ],
})

/* The API is faked at the HTTP layer (axios adapter), as in profilesSaga.test.ts: the real libraryApi and saga run. */
const originalAdapter = http.defaults.adapter
let requests: { method?: string; url?: string; body: unknown }[] = []

function fakeServer(status: number) {
  requests = []
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    requests.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data as string) : undefined })
    const response = { status, statusText: '', headers: new AxiosHeaders(), config, data: {} }
    if (status >= 400) throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response)
    return response
  }
}

function setup() {
  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: { browse: browseReducer },
    middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  })
  sagaMiddleware.run(librarySaga)
  store.dispatch(homeSucceeded(feed()))
  return store
}

const settle = () => new Promise((r) => setTimeout(r, 0))
type Store = ReturnType<typeof setup>
const rows = (store: Store) => store.getState().browse.feed!.rows
const copiesOf = (store: Store, titleId: number) =>
  rows(store).flatMap((r) => r.items).filter((c) => c.titleId === titleId)

describe('My List, ratings and Continue watching (browseSlice + librarySaga)', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter
  })

  it('adds to My List at once: every copy of the title, and a new My List row after Popular movies', async () => {
    fakeServer(204)
    const store = setup()

    store.dispatch(myListChanged({ card: card(1), inList: true }))

    expect(rows(store).map((r) => r.key)).toEqual([CONTINUE_WATCHING, 'top10-movies', 'popular-movies', MY_LIST, 'genre-28'])
    expect(copiesOf(store, 1).every((c) => c.inMyList)).toBe(true)
    expect(store.getState().browse.feed!.hero!.inMyList).toBe(true)

    store.dispatch(myListChanged({ card: card(4), inList: true }))
    expect(rows(store)[3].items.map((c) => c.titleId)).toEqual([4, 1]) // newest first

    await settle()
    expect(requests).toEqual([
      { method: 'put', url: '/api/my-list/1', body: undefined },
      { method: 'put', url: '/api/my-list/4', body: undefined },
    ])
  })

  it('removing the last title also removes the My List row', async () => {
    fakeServer(204)
    const store = setup()
    store.dispatch(myListChanged({ card: card(2), inList: true }))
    store.dispatch(myListChanged({ card: card(2), inList: false }))

    expect(rows(store).some((r) => r.key === MY_LIST)).toBe(false)
    expect(copiesOf(store, 2)[0].inMyList).toBe(false)
    await settle()
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['put /api/my-list/2', 'delete /api/my-list/2'])
  })

  it('undoes a change the API refuses, without sending the undo back to the API', async () => {
    fakeServer(500)
    const store = setup()

    store.dispatch(myListChanged({ card: card(1), inList: true }))
    store.dispatch(ratingChanged({ titleId: 1, rating: 3, previous: null }))
    expect(copiesOf(store, 1).every((c) => c.inMyList && c.myRating === 3)).toBe(true)

    await settle()
    expect(copiesOf(store, 1).every((c) => !c.inMyList && c.myRating === null)).toBe(true)
    expect(rows(store).some((r) => r.key === MY_LIST)).toBe(false)
    expect(requests).toHaveLength(2) // the two user actions only
  })

  it('rates a title (and removes the rating with null)', async () => {
    fakeServer(204)
    const store = setup()

    store.dispatch(ratingChanged({ titleId: 1, rating: 2, previous: null }))
    expect(copiesOf(store, 1).map((c) => c.myRating)).toEqual([2, 2])
    expect(store.getState().browse.feed!.hero!.myRating).toBe(2)

    store.dispatch(ratingChanged({ titleId: 1, rating: null, previous: 2 }))
    await settle()
    expect(copiesOf(store, 1).map((c) => c.myRating)).toEqual([null, null])
    expect(requests.map((r) => r.body)).toEqual([{ rating: 2 }, { rating: null }])
  })

  it('removes a card from Continue watching, and the row once it is empty', async () => {
    fakeServer(204)
    const store = setup()

    store.dispatch(continueWatchingRemoved({ titleId: 5 }))
    expect(rows(store)[0].items.map((c) => c.titleId)).toEqual([6])
    store.dispatch(continueWatchingRemoved({ titleId: 6 }))
    expect(rows(store)[0].key).toBe('top10-movies')

    await settle()
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['delete /api/progress/5', 'delete /api/progress/6'])
  })

  it('reloads the rows when the server could not forget the progress', async () => {
    fakeServer(500)
    const store = setup()
    store.dispatch(continueWatchingRemoved({ titleId: 5 }))
    await settle()
    expect(store.getState().browse.status).toBe('idle') // BrowsePage loads the feed again
    expect(store.getState().browse.feed).not.toBeNull() // and keeps showing the old one meanwhile
  })

  it('homeInvalidated keeps the feed on screen', () => {
    fakeServer(204)
    const store = setup()
    store.dispatch(homeInvalidated())
    expect(store.getState().browse).toMatchObject({ status: 'idle', feed: { rows: expect.any(Array) } })
  })
})
