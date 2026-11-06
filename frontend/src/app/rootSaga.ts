import { all, fork } from 'redux-saga/effects'
import { browseSaga } from '../features/browse/browseSaga'
import { playbackSaga } from '../features/playback/playbackSaga'
import { systemSaga } from '../features/system/systemSaga'

export function* rootSaga() {
  yield all([fork(systemSaga), fork(browseSaga), fork(playbackSaga)])
}
