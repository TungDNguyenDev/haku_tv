import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { profileSelected, sessionEnded } from '../auth/authSlice'
import { myListChanged, ratingChanged } from '../browse/browseSlice'
import type { Episode, TitleDetail } from './detailApi'

/*
  The detail modal: one title at a time. Episodes are kept per season, so going back to a season already seen is
  instant; the season the modal opens on comes with the title.
*/

interface DetailState {
  titleId: number | null
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  detail: TitleDetail | null
  error: string | null // API error code ("title-not-found", "network", ...)
  season: number | null // season picked in the episode list
  episodes: Record<number, Episode[]>
  seasonStatus: 'idle' | 'loading' | 'failed'
}

const initialState: DetailState = {
  titleId: null,
  status: 'idle',
  detail: null,
  error: null,
  season: null,
  episodes: {},
  seasonStatus: 'idle',
}

export interface SeasonRequest {
  titleId: number
  seasonNumber: number
  lang: string
}

const detailSlice = createSlice({
  name: 'detail',
  initialState,
  reducers: {
    detailRequested(_state, action: PayloadAction<{ titleId: number; lang: string }>) {
      return { ...initialState, titleId: action.payload.titleId, status: 'loading' }
    },
    detailSucceeded(state, action: PayloadAction<TitleDetail>) {
      const detail = action.payload
      if (detail.titleId !== state.titleId) return // an answer for a title the modal already left
      state.status = 'succeeded'
      state.detail = detail
      state.season = detail.episodesSeason
      state.episodes = detail.episodesSeason === null ? {} : { [detail.episodesSeason]: detail.episodes }
    },
    detailFailed(state, action: PayloadAction<string>) {
      state.status = 'failed'
      state.error = action.payload
    },
    // The saga loads the season only when it is not cached yet.
    seasonSelected(state, action: PayloadAction<SeasonRequest>) {
      if (action.payload.titleId !== state.titleId) return
      state.season = action.payload.seasonNumber
      state.seasonStatus = state.episodes[action.payload.seasonNumber] ? 'idle' : 'loading'
    },
    seasonLoaded(state, action: PayloadAction<{ titleId: number; seasonNumber: number; episodes: Episode[] }>) {
      const { titleId, seasonNumber, episodes } = action.payload
      if (titleId !== state.titleId) return
      state.episodes[seasonNumber] = episodes
      if (state.season === seasonNumber) state.seasonStatus = 'idle'
    },
    seasonFailed(state, action: PayloadAction<{ titleId: number; seasonNumber: number }>) {
      if (action.payload.titleId === state.titleId && state.season === action.payload.seasonNumber) state.seasonStatus = 'failed'
    },
    detailClosed() {
      return initialState
    },
  },
  extraReducers: (builder) => {
    // My List / rating from the modal (or its "More like this" cards) go through the same optimistic actions as the
    // home page, so both stay in sync, and an undo after an API error reverts the modal too.
    builder.addCase(myListChanged, (state, action) => {
      const { card, inList } = action.payload
      if (state.detail?.titleId === card.titleId) state.detail.inMyList = inList
      for (const s of state.detail?.similar ?? []) if (s.titleId === card.titleId) s.inMyList = inList
    })
    builder.addCase(ratingChanged, (state, action) => {
      const { titleId, rating } = action.payload
      if (state.detail?.titleId === titleId) state.detail.myRating = rating
      for (const s of state.detail?.similar ?? []) if (s.titleId === titleId) s.myRating = rating
    })
    builder.addCase(profileSelected, () => initialState)
    builder.addCase(sessionEnded, () => initialState)
  },
})

export const { detailRequested, detailSucceeded, detailFailed, seasonSelected, seasonLoaded, seasonFailed, detailClosed } =
  detailSlice.actions
export default detailSlice.reducer
