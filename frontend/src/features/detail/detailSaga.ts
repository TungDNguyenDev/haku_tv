import type { PayloadAction } from '@reduxjs/toolkit'
import { call, put, select, takeLatest } from 'redux-saga/effects'
import { apiError } from '../../services/http'
import { getEpisodes, getTitleDetail, type Episode, type TitleDetail } from './detailApi'
import {
  detailFailed,
  detailRequested,
  detailSucceeded,
  seasonFailed,
  seasonLoaded,
  seasonSelected,
  type SeasonRequest,
} from './detailSlice'

type DetailStatus = 'idle' | 'loading' | 'failed'

function* fetchDetail(action: PayloadAction<{ titleId: number; lang: string }>) {
  try {
    const detail: TitleDetail = yield call(getTitleDetail, action.payload.titleId, action.payload.lang)
    yield put(detailSucceeded(detail))
  } catch (err) {
    yield put(detailFailed(apiError(err).code))
  }
}

function* fetchSeason(action: PayloadAction<SeasonRequest>) {
  const { titleId, seasonNumber, lang } = action.payload
  // Sagas see an action after the reducers: seasonSelected has already marked the season 'loading' unless cached.
  const status: DetailStatus = yield select((s: { detail: { seasonStatus: DetailStatus } }) => s.detail.seasonStatus)
  if (status !== 'loading') return
  try {
    const episodes: Episode[] = yield call(getEpisodes, titleId, seasonNumber, lang)
    yield put(seasonLoaded({ titleId, seasonNumber, episodes }))
  } catch {
    yield put(seasonFailed({ titleId, seasonNumber }))
  }
}

export function* detailSaga() {
  // takeLatest: opening another title (a "More like this" card) cancels the request for the previous one.
  yield takeLatest(detailRequested.type, fetchDetail)
  // takeLatest: flipping through seasons quickly only loads the last one picked.
  yield takeLatest(seasonSelected.type, fetchSeason)
}
