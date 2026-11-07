import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { storedLanguage, type Language } from '../../i18n/language'
import type { AuthResponse, Credentials, Profile } from './authApi'

export interface AuthState {
  // unknown = app just started, checking the refresh cookie; anonymous = must log in.
  status: 'unknown' | 'anonymous' | 'authenticated'
  accountId: number | null
  isAdmin: boolean // admin account (the admin area stays hidden while a Kids profile is active)
  accessToken: string | null
  expiresAt: string | null
  profile: Profile | null // the "who's watching" choice; null = account-level token only
  form: { status: 'idle' | 'loading' | 'failed'; error: string | null }
  // UI language while no profile is chosen (login, profile picker): picked there, or the last profile's language.
  preferredLanguage: Language
}

const initialState: AuthState = {
  status: 'unknown',
  accountId: null,
  isAdmin: false,
  accessToken: null,
  expiresAt: null,
  profile: null,
  form: { status: 'idle', error: null },
  preferredLanguage: storedLanguage(),
}

function applyTokens(state: AuthState, res: AuthResponse) {
  state.status = 'authenticated'
  state.accountId = res.accountId
  state.isAdmin = res.isAdmin
  state.accessToken = res.accessToken
  state.expiresAt = res.expiresAt
  state.profile = res.profile
  if (res.profile) state.preferredLanguage = res.profile.languageCode
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionRestoreRequested() {},
    loginRequested(state, _action: PayloadAction<Credentials>) {
      state.form = { status: 'loading', error: null }
    },
    registerRequested(state, _action: PayloadAction<Credentials>) {
      state.form = { status: 'loading', error: null }
    },
    authFormFailed(state, action: PayloadAction<string>) {
      state.form = { status: 'failed', error: action.payload }
    },
    authFormReset(state) {
      state.form = { status: 'idle', error: null }
    },
    // Login, register, page-reload restore: a new session (no profile chosen yet, unless restored with one).
    sessionStarted(state, action: PayloadAction<AuthResponse>) {
      applyTokens(state, action.payload)
      state.form = { status: 'idle', error: null }
    },
    // Background refresh: same session, possibly the same profile.
    tokenRefreshed(state, action: PayloadAction<AuthResponse>) {
      applyTokens(state, action.payload)
    },
    // A profile was picked (or switched): new token that carries it.
    profileSelected(state, action: PayloadAction<AuthResponse>) {
      applyTokens(state, action.payload)
    },
    // The current profile was edited (name, kids, language): keep the token, refresh what the UI shows.
    currentProfileChanged(state, action: PayloadAction<Profile>) {
      if (state.profile?.profileId === action.payload.profileId) {
        state.profile = action.payload
        state.preferredLanguage = action.payload.languageCode
      }
    },
    // The profile in use was deleted (manage mode): back to the picker. The old token expires within 15 minutes and
    // the next refresh no longer returns a profile, because the server re-reads it.
    currentProfileRemoved(state, action: PayloadAction<number>) {
      if (state.profile?.profileId === action.payload) state.profile = null
    },
    // The language switcher of the signed-out pages.
    languagePicked(state, action: PayloadAction<Language>) {
      state.preferredLanguage = action.payload
    },
    logoutRequested() {},
    // Signed out: the login page keeps the language that was in use.
    sessionEnded(state) {
      return { ...initialState, status: 'anonymous' as const, preferredLanguage: state.preferredLanguage }
    },
  },
})

/** The admin link and /admin: admin accounts only, and never while a Kids profile is active. */
export const selectCanAdmin = (s: { auth: AuthState }): boolean => s.auth.isAdmin && !s.auth.profile?.isKids

/** UI and catalog language: the current profile's, or the one picked on the signed-out pages. */
export const selectLanguage = (s: { auth: AuthState }): Language => s.auth.profile?.languageCode ?? s.auth.preferredLanguage

export const {
  sessionRestoreRequested,
  loginRequested,
  registerRequested,
  authFormFailed,
  authFormReset,
  sessionStarted,
  tokenRefreshed,
  profileSelected,
  currentProfileChanged,
  currentProfileRemoved,
  languagePicked,
  logoutRequested,
  sessionEnded,
} = authSlice.actions
export default authSlice.reducer
