import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import createSagaMiddleware from 'redux-saga'
import { afterEach, describe, expect, it } from 'vitest'
import { http } from '../../services/http'
import browseReducer, { homeSucceeded } from '../browse/browseSlice'
import { playbackSaga } from './playbackSaga'
import playbackReducer, { progressReported } from './playbackSlice'

const originalAdapter = http.defaults.adapter
let requests: { url?: string; body: unknown }[] = []

function fakeServer(status: number) {
  requests = []
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    requests.push({ url: config.url, body: JSON.parse(config.data as string) })
    const response = { status, statusText: '', headers: new AxiosHeaders(), config, data: { isFinished: false } }
    if (status >= 400) throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, null, response)
    return response
  }
}

function setup() {
  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: { browse: browseReducer, playback: playbackReducer },
    middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  })
  sagaMiddleware.run(playbackSaga)
  store.dispatch(homeSucceeded({ heroes: [], rows: [] })) // the home page was loaded before Play
  return store
}

const settle = () => new Promise((r) => setTimeout(r, 0))
const report = { titleId: 7, episodeId: 70, positionSeconds: 61.4, durationSeconds: 2700 }

describe('watch progress (playbackSaga)', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter
  })

  it('saves a heartbeat without touching the home rows', async () => {
    fakeServer(200)
    const store = setup()
    store.dispatch(progressReported({ report, leaving: false }))
    await settle()
    expect(requests).toEqual([{ url: '/api/progress', body: report }])
    expect(store.getState().browse.status).toBe('succeeded')
  })

  it('leaving the player saves, then marks the home rows for reloading (Continue watching)', async () => {
    fakeServer(200)
    const store = setup()
    store.dispatch(progressReported({ report, leaving: true }))
    await settle()
    expect(requests).toHaveLength(1)
    expect(store.getState().browse.status).toBe('idle')
  })

  it('a failed save is ignored (the next heartbeat retries) and still reloads the rows when leaving', async () => {
    fakeServer(500)
    const store = setup()
    store.dispatch(progressReported({ report, leaving: true }))
    await settle()
    expect(store.getState().browse.status).toBe('idle')
  })
})
