import { call, put, takeLatest } from 'redux-saga/effects'
import { getHealth, type HealthResponse } from './systemApi'
import { healthFailed, healthRequested, healthSucceeded } from './systemSlice'

function* fetchHealth() {
  try {
    const data: HealthResponse = yield call(getHealth)
    yield put(healthSucceeded(data))
  } catch (err) {
    yield put(healthFailed(err instanceof Error ? err.message : 'Unknown error'))
  }
}

export function* systemSaga() {
  // takeLatest: if the user triggers it again while a request is in flight, the old one is cancelled.
  yield takeLatest(healthRequested.type, fetchHealth)
}
