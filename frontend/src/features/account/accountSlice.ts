import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { sessionEnded } from '../auth/authSlice'
import type { AccountDetails, Session } from './accountApi'

/** One form on the account pages (change password, forgot, reset, profile PIN): its request state. */
export interface FormState {
  status: 'idle' | 'saving' | 'done' | 'failed'
  message: string | null // error, or the success text to show
}

const idle: FormState = { status: 'idle', message: null }

export type AccountForm = 'changePassword' | 'forgotPassword' | 'resetPassword' | 'profilePin'

interface AccountState {
  details: AccountDetails | null
  sessions: Session[]
  loading: boolean
  error: string | null
  forms: Record<AccountForm, FormState>
}

const initialState: AccountState = {
  details: null,
  sessions: [],
  loading: false,
  error: null,
  forms: { changePassword: idle, forgotPassword: idle, resetPassword: idle, profilePin: idle },
}

const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    accountRequested(state) {
      state.loading = true
      state.error = null
    },
    accountLoaded(state, action: PayloadAction<{ details: AccountDetails; sessions: Session[] }>) {
      state.loading = false
      state.details = action.payload.details
      state.sessions = action.payload.sessions
    },
    accountFailed(state, action: PayloadAction<string>) {
      state.loading = false
      state.error = action.payload
    },

    sessionRevokeRequested(_state, _action: PayloadAction<string>) {},
    sessionRevoked(state, action: PayloadAction<string>) {
      state.sessions = state.sessions.filter((s) => s.familyId !== action.payload)
    },
    allSessionsRevokeRequested() {},

    changePasswordRequested(state, _action: PayloadAction<{ currentPassword: string; newPassword: string }>) {
      state.forms.changePassword = { status: 'saving', message: null }
    },
    forgotPasswordRequested(state, _action: PayloadAction<string>) {
      state.forms.forgotPassword = { status: 'saving', message: null }
    },
    resetPasswordRequested(state, _action: PayloadAction<{ token: string; password: string }>) {
      state.forms.resetPassword = { status: 'saving', message: null }
    },
    profilePinRequested(state, _action: PayloadAction<{ profileId: number; password: string; pin: string | null }>) {
      state.forms.profilePin = { status: 'saving', message: null }
    },
    formFinished(state, action: PayloadAction<{ form: AccountForm; ok: boolean; message: string | null }>) {
      const { form, ok, message } = action.payload
      state.forms[form] = { status: ok ? 'done' : 'failed', message }
    },
    formReset(state, action: PayloadAction<AccountForm>) {
      state.forms[action.payload] = idle
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sessionEnded, (state) => ({ ...initialState, forms: state.forms }))
  },
})

export const {
  accountRequested,
  accountLoaded,
  accountFailed,
  sessionRevokeRequested,
  sessionRevoked,
  allSessionsRevokeRequested,
  changePasswordRequested,
  forgotPasswordRequested,
  resetPasswordRequested,
  profilePinRequested,
  formFinished,
  formReset,
} = accountSlice.actions
export default accountSlice.reducer
