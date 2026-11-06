import { configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'
import browseReducer from '../features/browse/browseSlice'
import playbackReducer from '../features/playback/playbackSlice'
import systemReducer from '../features/system/systemSlice'
import { rootSaga } from './rootSaga'

const sagaMiddleware = createSagaMiddleware()

export const store = configureStore({
  reducer: {
    system: systemReducer,
    browse: browseReducer,
    playback: playbackReducer,
  },
  middleware: (getDefault) => getDefault({ thunk: false }).concat(sagaMiddleware),
})

sagaMiddleware.run(rootSaga)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
