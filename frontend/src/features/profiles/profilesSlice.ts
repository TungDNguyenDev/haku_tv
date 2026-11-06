import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Profile } from '../auth/authApi'
import { sessionEnded } from '../auth/authSlice'
import type { ProfileInput } from './profilesApi'

interface ProfilesState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  items: Profile[]
  error: string | null
  // The editor dialog: what is being saved and whether it failed.
  save: { status: 'idle' | 'saving' | 'failed'; error: string | null }
  selectingId: number | null
  // A locked profile was picked: show the PIN dialog for it (error = previous attempt failed).
  pinPrompt: { profileId: number; error: string | null } | null
}

const initialState: ProfilesState = {
  status: 'idle',
  items: [],
  error: null,
  save: { status: 'idle', error: null },
  selectingId: null,
  pinPrompt: null,
}

const profilesSlice = createSlice({
  name: 'profiles',
  initialState,
  reducers: {
    profilesRequested(state) {
      state.status = 'loading'
      state.error = null
    },
    profilesLoaded(state, action: PayloadAction<Profile[]>) {
      state.status = 'succeeded'
      state.items = action.payload
    },
    profilesFailed(state, action: PayloadAction<string>) {
      state.status = 'failed'
      state.error = action.payload
    },

    profileCreateRequested(state, _action: PayloadAction<ProfileInput>) {
      state.save = { status: 'saving', error: null }
    },
    profileUpdateRequested(state, _action: PayloadAction<{ profileId: number; input: ProfileInput }>) {
      state.save = { status: 'saving', error: null }
    },
    profileDeleteRequested(state, _action: PayloadAction<number>) {
      state.save = { status: 'saving', error: null }
    },
    profileSaved(state, action: PayloadAction<Profile>) {
      state.save = { status: 'idle', error: null }
      const i = state.items.findIndex((p) => p.profileId === action.payload.profileId)
      if (i >= 0) state.items[i] = action.payload
      else state.items.push(action.payload)
    },
    profileDeleted(state, action: PayloadAction<number>) {
      state.save = { status: 'idle', error: null }
      state.items = state.items.filter((p) => p.profileId !== action.payload)
    },
    profileSaveFailed(state, action: PayloadAction<string>) {
      state.save = { status: 'failed', error: action.payload }
    },
    profileSaveReset(state) {
      state.save = { status: 'idle', error: null }
    },

    profileSelectRequested(state, action: PayloadAction<{ profileId: number; pin?: string }>) {
      state.selectingId = action.payload.profileId
    },
    pinPromptOpened(state, action: PayloadAction<{ profileId: number; error: string | null }>) {
      state.pinPrompt = action.payload
    },
    pinPromptClosed(state) {
      state.pinPrompt = null
    },
    profileSelectFinished(state) {
      state.selectingId = null
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sessionEnded, () => initialState)
  },
})

export const {
  profilesRequested,
  profilesLoaded,
  profilesFailed,
  profileCreateRequested,
  profileUpdateRequested,
  profileDeleteRequested,
  profileSaved,
  profileDeleted,
  profileSaveFailed,
  profileSaveReset,
  profileSelectRequested,
  profileSelectFinished,
  pinPromptOpened,
  pinPromptClosed,
} = profilesSlice.actions
export default profilesSlice.reducer
