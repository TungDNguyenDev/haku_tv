import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AuthResponse, Credentials, Profile } from './authApi'

export interface AuthState {
  // unknown = app just started, checking the refresh cookie; anonymous = must log in.
  status: 'unknown' | 'anonymous' | 'authenticated'
  accountId: number | null
  accessToken: string | null
  expiresAt: string | null
  profile: Profile | null // the "who's watching" choice; null = account-level token only
  form: { status: 'idle' | 'loading' | 'failed'; error: string | null }
}

const initialState: AuthState = {
  status: 'unknown',
  accountId: null,
  accessToken: null,
  expiresAt: null,
  profile: null,
  form: { status: 'idle', error: null },
}

function applyTokens(state: AuthState, res: AuthResponse) {
  state.status = 'authenticated'
  state.accountId = res.accountId
  state.accessToken = res.accessToken
  state.expiresAt = res.expiresAt
  state.profile = res.profile
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
      if (state.profile?.profileId === action.payload.profileId) state.profile = action.payload
    },
    // The profile in use was deleted (manage mode): back to the picker. The old token expires within 15 minutes and
    // the next refresh no longer returns a profile, because the server re-reads it.
    currentProfileRemoved(state, action: PayloadAction<number>) {
      if (state.profile?.profileId === action.payload) state.profile = null
    },
    logoutRequested() {},
    sessionEnded() {
      return { ...initialState, status: 'anonymous' as const }
    },
  },
})

/** Catalog language of the current profile (Vietnamese until a profile is chosen). */
export const selectLanguage = (s: { auth: AuthState }): 'vi' | 'en' => s.auth.profile?.languageCode ?? 'vi'

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
  logoutRequested,
  sessionEnded,
} = authSlice.actions
export default authSlice.reducer
