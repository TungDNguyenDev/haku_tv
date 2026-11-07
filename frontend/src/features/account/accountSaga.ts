import type { PayloadAction } from '@reduxjs/toolkit'
import { all, call, put, takeEvery, takeLatest } from 'redux-saga/effects'
import { currentLanguage, messages } from '../../i18n'
import { apiError } from '../../services/http'
import { sessionEnded } from '../auth/authSlice'
import { rememberProfile } from '../auth/session'
import { profilesRequested } from '../profiles/profilesSlice'
import {
  changePassword,
  forgotPassword,
  getAccount,
  listSessions,
  resetPassword,
  revokeAllSessions,
  revokeSession,
  setProfilePin,
  type AccountDetails,
  type Session,
} from './accountApi'
import {
  accountFailed,
  accountLoaded,
  accountRequested,
  allSessionsRevokeRequested,
  changePasswordRequested,
  forgotPasswordRequested,
  formFinished,
  profilePinRequested,
  resetPasswordRequested,
  sessionRevoked,
  sessionRevokeRequested,
} from './accountSlice'

function* loadAccount() {
  try {
    // Both requests in parallel: `all` waits for both, like Promise.all.
    const [details, sessions]: [AccountDetails, Session[]] = yield all([call(getAccount), call(listSessions)])
    yield put(accountLoaded({ details, sessions }))
  } catch (err) {
    yield put(accountFailed(apiError(err).message))
  }
}

function* revokeOne(action: PayloadAction<string>) {
  try {
    yield call(revokeSession, action.payload)
    yield put(sessionRevoked(action.payload))
  } catch (err) {
    yield put(accountFailed(apiError(err).message))
  }
}

function* revokeAll() {
  try {
    yield call(revokeAllSessions)
  } finally {
    // This device is signed out too: back to the login page.
    rememberProfile(null)
    yield put(sessionEnded())
  }
}

function* changePw(action: PayloadAction<{ currentPassword: string; newPassword: string }>) {
  try {
    yield call(changePassword, action.payload.currentPassword, action.payload.newPassword)
    yield put(formFinished({ form: 'changePassword', ok: true, message: messages().account.passwordChanged }))
    yield put(accountRequested()) // refresh the device list
  } catch (err) {
    yield put(formFinished({ form: 'changePassword', ok: false, message: apiError(err).message }))
  }
}

function* forgot(action: PayloadAction<string>) {
  try {
    yield call(forgotPassword, action.payload, currentLanguage())
    // Same answer whether the email exists or not (the client's text, so it follows the UI language).
    yield put(formFinished({ form: 'forgotPassword', ok: true, message: messages().reset.sent }))
  } catch (err) {
    yield put(formFinished({ form: 'forgotPassword', ok: false, message: apiError(err).message }))
  }
}

function* reset(action: PayloadAction<{ token: string; password: string }>) {
  try {
    yield call(resetPassword, action.payload.token, action.payload.password)
    yield put(formFinished({ form: 'resetPassword', ok: true, message: null }))
  } catch (err) {
    yield put(formFinished({ form: 'resetPassword', ok: false, message: apiError(err).message }))
  }
}

function* pin(action: PayloadAction<{ profileId: number; password: string; pin: string | null }>) {
  try {
    const { profileId, password, pin: value } = action.payload
    yield call(setProfilePin, profileId, password, value)
    yield put(formFinished({ form: 'profilePin', ok: true, message: value ? messages().account.pinSet : messages().account.pinRemoved }))
    yield put(profilesRequested()) // hasPin changed
  } catch (err) {
    yield put(formFinished({ form: 'profilePin', ok: false, message: apiError(err).message }))
  }
}

export function* accountSaga() {
  yield takeLatest(accountRequested.type, loadAccount)
  yield takeEvery(sessionRevokeRequested.type, revokeOne)
  yield takeLatest(allSessionsRevokeRequested.type, revokeAll)
  yield takeLatest(changePasswordRequested.type, changePw)
  yield takeLatest(forgotPasswordRequested.type, forgot)
  yield takeLatest(resetPasswordRequested.type, reset)
  yield takeLatest(profilePinRequested.type, pin)
}
