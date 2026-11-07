import type { Action, PayloadAction } from '@reduxjs/toolkit'
import { call, put, takeEvery } from 'redux-saga/effects'
import {
  continueWatchingRemoved,
  homeInvalidated,
  myListChanged,
  ratingChanged,
  type MyListChange,
  type RatingChange,
} from '../browse/browseSlice'
import { removeProgress, setInMyList, setRating } from './libraryApi'

/*
  My List, ratings and "remove from Continue watching" update the page first (the reducers in browseSlice) and are
  sent to the API afterwards, so a click feels instant. If the API refuses, the change is undone.
  takeEvery, not takeLatest: clicking two different titles quickly must send both.
*/

function* saveMyList(action: PayloadAction<MyListChange>) {
  const { card, inList } = action.payload
  try {
    yield call(setInMyList, card.titleId, inList)
  } catch {
    yield put(myListChanged({ card, inList: !inList }, true))
  }
}

function* saveRating(action: PayloadAction<RatingChange>) {
  const { titleId, rating, previous } = action.payload
  try {
    yield call(setRating, titleId, rating)
  } catch {
    yield put(ratingChanged({ titleId, rating: previous, previous: rating }, true))
  }
}

function* forgetProgress(action: PayloadAction<{ titleId: number }>) {
  try {
    yield call(removeProgress, action.payload.titleId)
  } catch {
    yield put(homeInvalidated()) // the card is gone from the page but not on the server: reload the rows
  }
}

// Undos (meta.undo) only fix the page; sending them to the API again would loop.
const notUndo = (matches: (action: Action) => boolean) => (action: Action) =>
  matches(action) && !(action as Action & { meta?: { undo?: boolean } }).meta?.undo

export function* librarySaga() {
  yield takeEvery(notUndo(myListChanged.match), saveMyList)
  yield takeEvery(notUndo(ratingChanged.match), saveRating)
  yield takeEvery(continueWatchingRemoved.type, forgetProgress)
}
