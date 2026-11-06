import { all, fork } from 'redux-saga/effects'
import { authSaga } from '../features/auth/authSaga'
import { browseSaga } from '../features/browse/browseSaga'
import { playbackSaga } from '../features/playback/playbackSaga'
import { profilesSaga } from '../features/profiles/profilesSaga'
import { systemSaga } from '../features/system/systemSaga'

export function* rootSaga() {
  yield all([fork(authSaga), fork(profilesSaga), fork(systemSaga), fork(browseSaga), fork(playbackSaga)])
}
