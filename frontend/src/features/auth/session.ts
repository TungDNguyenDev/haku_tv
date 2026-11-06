import type { Dispatch } from '@reduxjs/toolkit'
import { refresh } from './authApi'
import { sessionEnded, tokenRefreshed, type AuthState } from './authSlice'

// The last chosen profile survives a page reload (the id is not a secret; the server re-checks it belongs to the account).
const LAST_PROFILE_KEY = 'hakutv.profileId'

export function rememberProfile(profileId: number | null) {
  try {
    if (profileId === null) localStorage.removeItem(LAST_PROFILE_KEY)
    else localStorage.setItem(LAST_PROFILE_KEY, String(profileId))
  } catch {
    // storage blocked (private mode): the user just picks the profile again after a reload
  }
}

export function lastProfile(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_PROFILE_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/*
  One refresh at a time: when the access token expires, several requests can fail with 401 together.
  They all wait for the same refresh call instead of each rotating the cookie (which the server would see as reuse).
*/
let store: { dispatch: Dispatch; getState: () => { auth: AuthState } } | null = null
let inFlight: Promise<string | null> | null = null

export function configureSession(s: typeof store) {
  store = s
}

export function refreshSession(): Promise<string | null> {
  if (!store) return Promise.resolve(null)
  const s = store
  inFlight ??= (async () => {
    try {
      const res = await refresh(s.getState().auth.profile?.profileId ?? null)
      s.dispatch(tokenRefreshed(res))
      return res.accessToken
    } catch {
      s.dispatch(sessionEnded())
      return null
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}
