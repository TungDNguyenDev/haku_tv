import type { PayloadAction } from '@reduxjs/toolkit'
import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import type { RootState } from '../../app/store'
import { apiError } from '../../services/http'
import type { AuthResponse, Profile } from '../auth/authApi'
import { currentProfileChanged, currentProfileRemoved, profileSelected } from '../auth/authSlice'
import { rememberProfile } from '../auth/session'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  selectProfile,
  updateProfile,
  type ProfileInput,
} from './profilesApi'
import {
  profileCreateRequested,
  profileDeleted,
  profileDeleteRequested,
  profileSaved,
  profileSaveFailed,
  profilesFailed,
  profileSelectFinished,
  profileSelectRequested,
  profilesLoaded,
  profilesRequested,
  profileUpdateRequested,
} from './profilesSlice'

function* fetchProfiles() {
  try {
    const items: Profile[] = yield call(listProfiles)
    yield put(profilesLoaded(items))
  } catch (err) {
    yield put(profilesFailed(apiError(err).message))
  }
}

function* create(action: PayloadAction<ProfileInput>) {
  try {
    const profile: Profile = yield call(createProfile, action.payload)
    yield put(profileSaved(profile))
  } catch (err) {
    yield put(profileSaveFailed(apiError(err).message))
  }
}

function* update(action: PayloadAction<{ profileId: number; input: ProfileInput }>) {
  try {
    const profile: Profile = yield call(updateProfile, action.payload.profileId, action.payload.input)
    yield put(profileSaved(profile))
    yield put(currentProfileChanged(profile))

    // Kids flag or language of the profile in use changed: the token still carries the old values, get a new one.
    const current: Profile | null = yield select((s: RootState) => s.auth.profile)
    if (current?.profileId === profile.profileId) {
      const res: AuthResponse = yield call(selectProfile, profile.profileId)
      yield put(profileSelected(res))
    }
  } catch (err) {
    yield put(profileSaveFailed(apiError(err).message))
  }
}

function* remove(action: PayloadAction<number>) {
  try {
    yield call(deleteProfile, action.payload)
    yield put(profileDeleted(action.payload))
    const current: Profile | null = yield select((s: RootState) => s.auth.profile)
    if (current?.profileId === action.payload) {
      rememberProfile(null)
      yield put(currentProfileRemoved(action.payload))
    }
  } catch (err) {
    yield put(profileSaveFailed(apiError(err).message))
  }
}

function* choose(action: PayloadAction<number>) {
  try {
    const res: AuthResponse = yield call(selectProfile, action.payload)
    rememberProfile(action.payload)
    yield put(profileSelected(res))
  } catch (err) {
    yield put(profilesFailed(apiError(err).message))
  } finally {
    yield put(profileSelectFinished())
  }
}

export function* profilesSaga() {
  yield takeLatest(profilesRequested.type, fetchProfiles)
  yield takeEvery(profileCreateRequested.type, create)
  yield takeEvery(profileUpdateRequested.type, update)
  yield takeEvery(profileDeleteRequested.type, remove)
  yield takeLatest(profileSelectRequested.type, choose)
}
