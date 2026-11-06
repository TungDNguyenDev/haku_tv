import axios from 'axios'
import { http } from '../../services/http'

export interface Profile {
  profileId: number
  name: string
  isKids: boolean
  avatarKey: AvatarKey
  languageCode: 'vi' | 'en'
}

export type AvatarKey = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'teal' | 'orange' | 'kids'

export interface AuthResponse {
  accessToken: string
  expiresAt: string // ISO UTC
  accountId: number
  isAdmin: boolean
  profile: Profile | null
}

export interface Credentials {
  email: string
  password: string
}

export async function register(body: Credentials): Promise<AuthResponse> {
  return (await http.post<AuthResponse>('/api/auth/register', body)).data
}

export async function login(body: Credentials): Promise<AuthResponse> {
  return (await http.post<AuthResponse>('/api/auth/login', body)).data
}

/**
 * New access token from the HttpOnly refresh cookie. 409 "retry" = another tab rotated the cookie a moment ago;
 * waiting briefly lets the browser pick up the new cookie, then one retry succeeds.
 */
export async function refresh(profileId: number | null): Promise<AuthResponse> {
  try {
    return (await http.post<AuthResponse>('/api/auth/refresh', { profileId })).data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      await new Promise((r) => setTimeout(r, 500))
      return (await http.post<AuthResponse>('/api/auth/refresh', { profileId })).data
    }
    throw err
  }
}

export async function logout(): Promise<void> {
  await http.post('/api/auth/logout')
}
