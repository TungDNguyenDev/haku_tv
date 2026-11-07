import type { PayloadAction } from '@reduxjs/toolkit'
import { call, put, takeEvery, takeLatest } from 'redux-saga/effects'
import { homeInvalidated } from '../browse/browseSlice'
import { getPlayback, saveProgress, toPlaybackErrorCode, type PlaybackInfo } from './playbackApi'
import { playbackFailed, playbackRequested, playbackSucceeded, progressReported, type PlaybackRequest } from './playbackSlice'

function* fetchPlayback(action: PayloadAction<PlaybackRequest>) {
  const { titleId, episodeId, lang } = action.payload
  try {
    const info: PlaybackInfo = yield call(getPlayback, titleId, episodeId, lang)
    yield put(playbackSucceeded(info))
  } catch (err) {
    yield put(playbackFailed(toPlaybackErrorCode(err)))
  }
}

function* reportProgress(action: ReturnType<typeof progressReported>) {
  try {
    yield call(saveProgress, action.payload.report)
  } catch {
    // A lost heartbeat is not worth bothering the viewer: the next one (a few seconds later) saves the position.
  }
  if (action.payload.leaving) yield put(homeInvalidated())
}

export function* playbackSaga() {
  // takeLatest: clicking another title while the first request is in flight cancels the first one.
  yield takeLatest(playbackRequested.type, fetchPlayback)
  // takeEvery: the save when leaving must never be cancelled by a later heartbeat.
  yield takeEvery(progressReported.type, reportProgress)
}
