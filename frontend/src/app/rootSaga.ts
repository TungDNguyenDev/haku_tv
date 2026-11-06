import { all, fork } from 'redux-saga/effects'
import { systemSaga } from '../features/system/systemSaga'

export function* rootSaga() {
  yield all([fork(systemSaga)])
}
