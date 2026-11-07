import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PlaybackErrorCode, PlaybackInfo, ProgressReport } from './playbackApi'

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

/**
 * Player heartbeat (every few seconds while playing, on pause, seek and end). leaving = the viewer closed the player:
 * after that save the home rows are reloaded, so Continue watching shows the new position.
 * No state: the position lives in the video element and on the server.
 */
export const progressReported = createAction<{ report: ProgressReport; leaving: boolean }>('playback/progressReported')

export const { playbackRequested, playbackSucceeded, playbackFailed, playbackCleared } = playbackSlice.actions
export default playbackSlice.reducer
