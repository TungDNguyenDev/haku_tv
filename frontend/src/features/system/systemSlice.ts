import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { HealthResponse } from './systemApi'

interface SystemState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  health: HealthResponse | null
  error: string | null
}

const initialState: SystemState = { status: 'idle', health: null, error: null }

const systemSlice = createSlice({
  name: 'system',
  initialState,
  reducers: {
    healthRequested(state) {
      state.status = 'loading'
      state.error = null
    },
    healthSucceeded(state, action: PayloadAction<HealthResponse>) {
      state.status = 'succeeded'
      state.health = action.payload
    },
    healthFailed(state, action: PayloadAction<string>) {
      state.status = 'failed'
      state.error = action.payload
    },
  },
})

export const { healthRequested, healthSucceeded, healthFailed } = systemSlice.actions
export default systemSlice.reducer
