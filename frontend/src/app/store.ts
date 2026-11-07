import { configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'
import accountReducer from '../features/account/accountSlice'
import authReducer, { selectLanguage, sessionRestoreRequested } from '../features/auth/authSlice'
import { configureSession, refreshSession } from '../features/auth/session'
import browseReducer from '../features/browse/browseSlice'
import playbackReducer from '../features/playback/playbackSlice'
import profilesReducer from '../features/profiles/profilesSlice'
import { setCurrentLanguage } from '../i18n'
import { storeLanguage } from '../i18n/language'
import { setAccessToken, setRefreshHandler } from '../services/http'
import { rootSaga } from './rootSaga'

const sagaMiddleware = createSagaMiddleware()

export const store = configureStore({
  reducer: {
    auth: authReducer,
    account: accountReducer,
    profiles: profilesReducer,
    browse: browseReducer,
    playback: playbackReducer,
  },
  middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
})

sagaMiddleware.run(rootSaga)

// axios reads the token synchronously on every request: keep its copy in sync with the store.
store.subscribe(() => setAccessToken(store.getState().auth.accessToken))

// Same for the UI language (sagas and apiError build texts outside React). It is also remembered for the next visit,
// so the login page opens in the language of the last profile used on this browser.
let lastLanguage: string | null = null
function syncLanguage() {
  const lang = selectLanguage(store.getState())
  if (lang === lastLanguage) return
  lastLanguage = lang
  setCurrentLanguage(lang)
  storeLanguage(lang)
}
syncLanguage()
store.subscribe(syncLanguage)
configureSession(store)
setRefreshHandler(refreshSession)

// Once per page load (not from a component effect, which StrictMode would run twice and rotate the cookie twice).
store.dispatch(sessionRestoreRequested())

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
