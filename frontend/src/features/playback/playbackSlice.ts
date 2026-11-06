import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PlaybackErrorCode, PlaybackInfo } from './playbackApi'

export interface PlaybackRequest {
  titleId: number
  episodeId: number | null
  lang: string
}

interface PlaybackState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  info: PlaybackInfo | null
  error: PlaybackErrorCode | null
}

const initialState: PlaybackState = { status: 'idle', info: null, error: null }

const playbackSlice = createSlice({
  name: 'playback',
  initialState,
  reducers: {
    playbackRequested(state, _action: PayloadAction<PlaybackRequest>) {
      state.status = 'loading'
      state.info = null
      state.error = null
    },
    playbackSucceeded(state, action: PayloadAction<PlaybackInfo>) {
      state.status = 'succeeded'
      state.info = action.payload
    },
    playbackFailed(state, action: PayloadAction<PlaybackErrorCode>) {
      state.status = 'failed'
      state.error = action.payload
    },
    // Leaving the watch page: forget the source so the next title never flashes the previous one.
    playbackCleared() {
      return initialState
    },
  },
})

export const { playbackRequested, playbackSucceeded, playbackFailed, playbackCleared } = playbackSlice.actions
export default playbackSlice.reducer
