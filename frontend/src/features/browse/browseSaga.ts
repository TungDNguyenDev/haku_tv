import type { PayloadAction } from '@reduxjs/toolkit'
import { call, put, takeLatest } from 'redux-saga/effects'
import { apiError } from '../../services/http'
import { getHome, type HomeFeed } from './browseApi'
import { homeFailed, homeRequested, homeSucceeded } from './browseSlice'

function* fetchHome(action: PayloadAction<{ lang: string }>) {
  try {
    const feed: HomeFeed = yield call(getHome, action.payload.lang)
    yield put(homeSucceeded(feed))
  } catch (err) {
    yield put(homeFailed(apiError(err).message))
  }
}

export function* browseSaga() {
  yield takeLatest(homeRequested.type, fetchHome)
}
