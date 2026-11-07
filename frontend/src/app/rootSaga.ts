import { all, fork } from 'redux-saga/effects'
import { accountSaga } from '../features/account/accountSaga'
import { authSaga } from '../features/auth/authSaga'
import { browseSaga } from '../features/browse/browseSaga'
import { detailSaga } from '../features/detail/detailSaga'
import { librarySaga } from '../features/library/librarySaga'
import { playbackSaga } from '../features/playback/playbackSaga'
import { profilesSaga } from '../features/profiles/profilesSaga'

export function* rootSaga() {
  yield all([fork(authSaga), fork(accountSaga), fork(profilesSaga), fork(browseSaga), fork(detailSaga), fork(playbackSaga), fork(librarySaga)])
}
