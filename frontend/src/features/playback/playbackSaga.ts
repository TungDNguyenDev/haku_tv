import type { PayloadAction } from '@reduxjs/toolkit'
import { call, put, takeLatest } from 'redux-saga/effects'
import { getPlayback, toPlaybackErrorCode, type PlaybackInfo } from './playbackApi'
import { playbackFailed, playbackRequested, playbackSucceeded, type PlaybackRequest } from './playbackSlice'

function* fetchPlayback(action: PayloadAction<PlaybackRequest>) {
  const { titleId, episodeId, lang } = action.payload
  try {
    const info: PlaybackInfo = yield call(getPlayback, titleId, episodeId, lang)
    yield put(playbackSucceeded(info))
  } catch (err) {
    yield put(playbackFailed(toPlaybackErrorCode(err)))
  }
}

export function* playbackSaga() {
  // takeLatest: clicking another title while the first request is in flight cancels the first one.
  yield takeLatest(playbackRequested.type, fetchPlayback)
}
