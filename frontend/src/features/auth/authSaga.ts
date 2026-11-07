import type { PayloadAction } from '@reduxjs/toolkit'
import { call, delay, put, takeEvery, takeLatest } from 'redux-saga/effects'
import { currentLanguage } from '../../i18n'
import { apiError } from '../../services/http'
import { login, logout, refresh, register, type AuthResponse, type Credentials } from './authApi'
import {
  authFormFailed,
  loginRequested,
  logoutRequested,
  profileSelected,
  registerRequested,
  sessionEnded,
  sessionRestoreRequested,
  sessionStarted,
  tokenRefreshed,
} from './authSlice'
import { lastProfile, refreshSession, rememberProfile } from './session'

// App start: is there a refresh cookie? If so we are still signed in (and maybe still on the same profile).
function* restoreSession() {
  try {
    const res: AuthResponse = yield call(refresh, lastProfile())
    yield put(sessionStarted(res))
  } catch {
    yield put(sessionEnded())
  }
}

function* signIn(action: PayloadAction<Credentials>) {
  try {
    const res: AuthResponse =
      action.type === registerRequested.type
        ? yield call(register, action.payload, currentLanguage())
        : yield call(login, action.payload)
    rememberProfile(null)
    yield put(sessionStarted(res))
  } catch (err) {
    yield put(authFormFailed(apiError(err).message))
  }
}

function* signOut() {
  try {
    yield call(logout)
  } catch {
    // the server session may already be gone; sign out locally anyway
  }
  rememberProfile(null)
  yield put(sessionEnded())
}

/*
  Proactive refresh: one minute before the access token expires, get a new one, so the user never hits a 401.
  takeLatest restarts the timer whenever a new token arrives and cancels it on sign-out (sessionEnded is in the list
  and simply ends the old timer). The 401 interceptor in services/http.ts is the safety net (e.g. after sleep).
*/
function* scheduleRefresh(action: PayloadAction<AuthResponse | undefined>) {
  if (action.type === sessionEnded.type || !action.payload) return
  const wait = new Date(action.payload.expiresAt).getTime() - Date.now() - 60_000
  yield delay(Math.max(wait, 5_000))
  yield call(refreshSession)
}

export function* authSaga() {
  yield takeLatest(sessionRestoreRequested.type, restoreSession)
  yield takeLatest([loginRequested.type, registerRequested.type], signIn)
  yield takeEvery(logoutRequested.type, signOut)
  yield takeLatest([sessionStarted.type, tokenRefreshed.type, profileSelected.type, sessionEnded.type], scheduleRefresh)
}
