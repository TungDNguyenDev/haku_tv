import { http } from '../../services/http'

export interface AccountDetails {
  email: string
  createdAt: string
  lastLoginAt: string | null
  isAdmin: boolean
}

export interface Session {
  familyId: string
  startedAt: string
  lastSeenAt: string
  device: string // "Chrome · Windows"; "" when the user agent was not recognised
  isCurrent: boolean
}

export async function getAccount(): Promise<AccountDetails> {
  return (await http.get<AccountDetails>('/api/account')).data
}

export async function listSessions(): Promise<Session[]> {
  return (await http.get<Session[]>('/api/auth/sessions')).data
}

export async function revokeSession(familyId: string): Promise<void> {
  await http.delete(`/api/auth/sessions/${familyId}`)
}

export async function revokeAllSessions(): Promise<void> {
  await http.post('/api/auth/sessions/revoke-all')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await http.post('/api/auth/password', { currentPassword, newPassword })
}

/** `language` picks the language of the reset email. */
export async function forgotPassword(email: string, language: string): Promise<void> {
  await http.post('/api/auth/forgot-password', { email, language })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await http.post('/api/auth/reset-password', { token, password })
}

export async function setProfilePin(profileId: number, password: string, pin: string | null): Promise<void> {
  await http.put(`/api/profiles/${profileId}/pin`, { password, pin })
}
