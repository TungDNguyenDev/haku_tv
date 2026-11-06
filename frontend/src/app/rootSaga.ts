import { all, fork } from 'redux-saga/effects'
import { accountSaga } from '../features/account/accountSaga'
import { authSaga } from '../features/auth/authSaga'
import { browseSaga } from '../features/browse/browseSaga'
import { playbackSaga } from '../features/playback/playbackSaga'
import { profilesSaga } from '../features/profiles/profilesSaga'

export function* rootSaga() {
  yield all([fork(authSaga), fork(accountSaga), fork(profilesSaga), fork(browseSaga), fork(playbackSaga)])
}
