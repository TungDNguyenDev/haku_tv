import { describe, expect, it } from 'vitest'
import type { AuthResponse, Profile } from './authApi'
import reducer, {
  currentProfileChanged,
  languagePicked,
  profileSelected,
  selectCanAdmin,
  selectLanguage,
  sessionEnded,
  sessionStarted,
  type AuthState,
} from './authSlice'

const profile: Profile = {
  profileId: 7,
  name: 'Haku',
  isKids: false,
  avatarKey: 'red',
  languageCode: 'en',
  maturityLimit: null,
  hasPin: false,
}

const response = (p: Profile | null, isAdmin = false): AuthResponse => ({
  accessToken: 'token',
  expiresAt: '2026-01-01T00:00:00Z',
  accountId: 1,
  isAdmin,
  profile: p,
})

const initial = (): AuthState => reducer(undefined, { type: '@@init' })
const view = (auth: AuthState) => ({ auth })

describe('authSlice language', () => {
  it('starts in Vietnamese when nothing was stored', () => {
    expect(selectLanguage(view(initial()))).toBe('vi')
  })

  it('uses the language picked on the signed-out pages while no profile is chosen', () => {
    const state = reducer(initial(), languagePicked('en'))
    expect(selectLanguage(view(state))).toBe('en')
  })

  it("follows the profile's language once a profile is chosen", () => {
    let state = reducer(initial(), sessionStarted(response(null)))
    state = reducer(state, profileSelected(response(profile)))
    expect(selectLanguage(view(state))).toBe('en')

    state = reducer(state, currentProfileChanged({ ...profile, languageCode: 'vi' }))
    expect(selectLanguage(view(state))).toBe('vi')
  })

  it('keeps the last language after signing out, so the login page stays in it', () => {
    let state = reducer(initial(), sessionStarted(response(profile)))
    state = reducer(state, sessionEnded())
    expect(state.status).toBe('anonymous')
    expect(state.profile).toBeNull()
    expect(selectLanguage(view(state))).toBe('en')
  })
})

describe('selectCanAdmin', () => {
  it('needs an admin account and a non-Kids profile', () => {
    const admin = reducer(initial(), sessionStarted(response(profile, true)))
    expect(selectCanAdmin(view(admin))).toBe(true)

    const kids = reducer(admin, currentProfileChanged({ ...profile, isKids: true }))
    expect(selectCanAdmin(view(kids))).toBe(false)

    const viewer = reducer(initial(), sessionStarted(response(profile, false)))
    expect(selectCanAdmin(view(viewer))).toBe(false)
  })
})
