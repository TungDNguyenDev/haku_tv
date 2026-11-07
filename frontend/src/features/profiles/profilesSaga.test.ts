import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import createSagaMiddleware from 'redux-saga'
import { afterEach, describe, expect, it } from 'vitest'
import { setCurrentLanguage } from '../../i18n'
import { en } from '../../i18n/en'
import { http } from '../../services/http'
import type { AuthResponse, Profile } from '../auth/authApi'
import authReducer from '../auth/authSlice'
import { profilesSaga } from './profilesSaga'
import profilesReducer, { profileSelectRequested } from './profilesSlice'

const locked: Profile = {
  profileId: 3,
  name: 'Bố',
  isKids: false,
  avatarKey: 'blue',
  languageCode: 'vi',
  maturityLimit: null,
  hasPin: true,
}

/*
  The API is faked at the HTTP layer (axios adapter), so the real profilesApi, apiError and saga all run.
  The fake answers POST /api/profiles/{id}/select like ProfilesController: 403 pin-required / pin-invalid, or a token.
*/
const originalAdapter = http.defaults.adapter
let requests: { url?: string; body: unknown }[] = []

function fakeServer(answer: (body: { pin?: string }) => { status: number; data: object }) {
  requests = []
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const body = config.data ? JSON.parse(config.data as string) : {}
    requests.push({ url: config.url, body })
    const { status, data } = answer(body)
    const response = { status, statusText: '', headers: new AxiosHeaders(), config, data }
    if (status >= 400) throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response)
    return response
  }
}

const token = (profile: Profile): AuthResponse => ({ accessToken: 't', expiresAt: '2026-01-01T00:00:00Z', accountId: 1, isAdmin: false, profile })

/** The real reducers + the real saga. */
function setup() {
  const sagaMiddleware = createSagaMiddleware()
  const store = configureStore({
    reducer: { auth: authReducer, profiles: profilesReducer },
    middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
  })
  sagaMiddleware.run(profilesSaga)
  return store
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('choosing a profile (profilesSaga)', () => {
  afterEach(() => {
    http.defaults.adapter = originalAdapter
    setCurrentLanguage('vi')
  })

  it('opens the PIN prompt, without an error, when the profile is locked', async () => {
    fakeServer(() => ({ status: 403, data: { code: 'pin-required', error: 'server text' } }))
    const store = setup()

    store.dispatch(profileSelectRequested({ profileId: locked.profileId }))
    await settle()

    expect(requests).toEqual([{ url: '/api/profiles/3/select', body: {} }])
    expect(store.getState().profiles.pinPrompt).toEqual({ profileId: 3, error: null })
    expect(store.getState().profiles.selectingId).toBeNull()
    expect(store.getState().auth.profile).toBeNull()
  })

  it('keeps the prompt open with a translated error after a wrong PIN', async () => {
    setCurrentLanguage('en')
    fakeServer(() => ({ status: 403, data: { code: 'pin-invalid', error: 'Mã PIN không đúng.' } }))
    const store = setup()

    store.dispatch(profileSelectRequested({ profileId: 3, pin: '0000' }))
    await settle()

    expect(requests[0].body).toEqual({ pin: '0000' })
    expect(store.getState().profiles.pinPrompt).toEqual({ profileId: 3, error: en.errors['pin-invalid'] })
  })

  it('closes the prompt and switches to the profile when the PIN is right', async () => {
    fakeServer((body) => (body.pin === '1234' ? { status: 200, data: token(locked) } : { status: 403, data: { code: 'pin-invalid' } }))
    const store = setup()

    store.dispatch(profileSelectRequested({ profileId: 3, pin: '1234' }))
    await settle()

    expect(store.getState().profiles.pinPrompt).toBeNull()
    expect(store.getState().auth.profile?.profileId).toBe(3)
    expect(localStorage.getItem('hakutv.profileId')).toBe('3') // survives a page reload
  })
})
