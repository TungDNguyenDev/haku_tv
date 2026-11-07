import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { profileSelected, sessionEnded } from '../auth/authSlice'
import { CONTINUE_WATCHING, MY_LIST, type HomeFeed, type Rating, type TitleCard } from './browseApi'

interface BrowseState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  feed: HomeFeed | null
  error: string | null
}

const initialState: BrowseState = { status: 'idle', feed: null, error: null }

export interface MyListChange {
  card: TitleCard
  inList: boolean
}

export interface Undoable {
  undo: boolean
}

export interface RatingChange {
  titleId: number
  rating: Rating | null
  previous: Rating | null // to undo it if the API refuses
}

/** Every copy of a title on the page (a title can be in several rows, and be the hero). */
function updateTitle(feed: HomeFeed, titleId: number, update: (title: { inMyList: boolean; myRating: Rating | null }) => void) {
  if (feed.hero?.titleId === titleId) update(feed.hero)
  for (const row of feed.rows) for (const card of row.items) if (card.titleId === titleId) update(card)
}

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
    // Something on the server changed what the rows should show (the player saved progress): load them again the
    // next time the page is shown. The old feed stays on screen meanwhile, so there is no skeleton flash.
    homeInvalidated(state) {
      if (state.status !== 'loading') state.status = 'idle'
    },

    // The three below change the page at once (optimistic); librarySaga calls the API and undoes them if it fails.
    // An undo is the same action with meta.undo = true, which librarySaga does not send to the API again.

    myListChanged: {
      prepare: (change: MyListChange, undo = false) => ({ payload: change, meta: { undo } }),
      reducer(state, action: PayloadAction<MyListChange, string, Undoable>) {
        const { card, inList } = action.payload
        const feed = state.feed
        if (!feed) return
        updateTitle(feed, card.titleId, (t) => {
          t.inMyList = inList
        })

        // The My List row itself: newest first, like the server orders it. Created after "Popular movies" (where the
        // server puts it) when the profile's list was empty.
        let row = feed.rows.find((r) => r.key === MY_LIST)
        if (!row && inList) {
          const after = feed.rows.findIndex((r) => r.key === 'popular-movies')
          row = { key: MY_LIST, name: '', layout: 'standard', items: [] }
          feed.rows.splice(after >= 0 ? after + 1 : feed.rows.length, 0, row)
        }
        if (!row) return
        row.items = row.items.filter((c) => c.titleId !== card.titleId)
        if (inList) row.items.unshift({ ...card, inMyList: true, resumePercent: null, resumeSeasonNumber: null, resumeEpisodeNumber: null })
        if (row.items.length === 0) feed.rows = feed.rows.filter((r) => r !== row)
      },
    },
    ratingChanged: {
      prepare: (change: RatingChange, undo = false) => ({ payload: change, meta: { undo } }),
      reducer(state, action: PayloadAction<RatingChange, string, Undoable>) {
        const { titleId, rating } = action.payload
        if (state.feed)
          updateTitle(state.feed, titleId, (t) => {
            t.myRating = rating
          })
      },
    },
    continueWatchingRemoved(state, action: PayloadAction<{ titleId: number }>) {
      const feed = state.feed
      const row = feed?.rows.find((r) => r.key === CONTINUE_WATCHING)
      if (!feed || !row) return
      row.items = row.items.filter((c) => c.titleId !== action.payload.titleId)
      if (row.items.length === 0) feed.rows = feed.rows.filter((r) => r !== row)
    },
  },
  // Each profile sees its own rows (Kids filter, language): a profile switch or edit, or sign-out, drops the cached
  // feed so BrowsePage loads it again with the new token.
  extraReducers: (builder) => {
    builder.addCase(profileSelected, () => initialState)
    builder.addCase(sessionEnded, () => initialState)
  },
})

export const {
  homeRequested,
  homeSucceeded,
  homeFailed,
  homeInvalidated,
  myListChanged,
  ratingChanged,
  continueWatchingRemoved,
} = browseSlice.actions
export default browseSlice.reducer
