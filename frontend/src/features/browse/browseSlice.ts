import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { profileSelected, sessionEnded } from '../auth/authSlice'
import type { HomeFeed } from './browseApi'

interface BrowseState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  feed: HomeFeed | null
  error: string | null
}

const initialState: BrowseState = { status: 'idle', feed: null, error: null }

const browseSlice = createSlice({
  name: 'browse',
  initialState,
  reducers: {
    homeRequested(state, _action: PayloadAction<{ lang: string }>) {
      state.status = 'loading'
      state.error = null
    },
    homeSucceeded(state, action: PayloadAction<HomeFeed>) {
      state.status = 'succeeded'
      state.feed = action.payload
    },
    homeFailed(state, action: PayloadAction<string>) {
      state.status = 'failed'
      state.error = action.payload
    },
  },
  // Each profile sees its own rows (Kids filter, language): a profile switch or edit, or sign-out, drops the cached
  // feed so BrowsePage loads it again with the new token.
  extraReducers: (builder) => {
    builder.addCase(profileSelected, () => initialState)
    builder.addCase(sessionEnded, () => initialState)
  },
})

export const { homeRequested, homeSucceeded, homeFailed } = browseSlice.actions
export default browseSlice.reducer
