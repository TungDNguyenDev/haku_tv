import { configureStore } from '@reduxjs/toolkit'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import createSagaMiddleware from 'redux-saga'
import { afterEach, describe, expect, it } from 'vitest'
import { http } from '../../services/http'
import authReducer from '../auth/authSlice'
import { profilesSaga } from '../profiles/profilesSaga'
import profilesReducer, { profilesRequested } from '../profiles/profilesSlice'
import { browseSaga } from './browseSaga'
import browseReducer, { homeRequested } from './browseSlice'

/*
  React StrictMode runs mount effects twice in dev, so the page asks for the home feed and the header for the
  profile list twice in a row. The fake API (axios adapter) answers after a tick, like a real round trip, and
  records what was sent.
*/
const originalAdapter = http.defaults.adapter
let requests: string[] = []

function fakeServer() {
  requests = []
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    requests.push(`${config.url}${config.params?.lang ? `?lang=${config.params.lang}` : ''}`)
    await new Promise((r) => setTimeout(r, 5))
    const data = config.url === '/api/profiles' ? [] : { heroes: [], rows: [] }
    return { status: 200, statusText: '', headers: new AxiosHeaders(), config, data }
  }
}

function setup() {
  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: { auth: authReducer, profiles: profilesReducer, browse: browseReducer },
    middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  })
  sagaMiddleware.run(browseSaga)
  sagaMiddleware.run(profilesSaga)
  return store
}

const settle = () => new Promise((r) => setTimeout(r, 20))

describe('requests asked for twice while loading', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter
  })

  it('sends the home feed and the profile list once', async () => {
    fakeServer()
    const store = setup()
    store.dispatch(homeRequested({ lang: 'vi' }))
    store.dispatch(profilesRequested())
    store.dispatch(homeRequested({ lang: 'vi' }))
    store.dispatch(profilesRequested())
    await settle()

    expect(requests).toEqual(['/api/browse/home?lang=vi', '/api/profiles'])
    expect(store.getState().browse.status).toBe('succeeded')
  })

  it('still switches to another language while the first one is loading', async () => {
    fakeServer()
    const store = setup()
    store.dispatch(homeRequested({ lang: 'vi' }))
    store.dispatch(homeRequested({ lang: 'en' }))
    await settle()

    expect(requests).toEqual(['/api/browse/home?lang=vi', '/api/browse/home?lang=en'])
    expect(store.getState().browse.status).toBe('succeeded')
  })
})
