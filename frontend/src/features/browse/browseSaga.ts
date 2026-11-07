import type { PayloadAction } from '@reduxjs/toolkit'
import type { Task } from 'redux-saga'
import { call, cancel, fork, put, take } from 'redux-saga/effects'
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

/**
 * Like takeLatest, except that a request for the language already being loaded is dropped instead of restarting it
 * (React StrictMode runs the page's mount effect twice in dev, which used to send the same request twice).
 * Another language still cancels the running load.
 */
export function* browseSaga() {
  let running: Task | undefined
  let runningLang: string | undefined
  while (true) {
    const action: PayloadAction<{ lang: string }> = yield take(homeRequested.type)
    if (running?.isRunning()) {
      if (runningLang === action.payload.lang) continue
      yield cancel(running)
    }
    runningLang = action.payload.lang
    running = yield fork(fetchHome, action)
  }
}
