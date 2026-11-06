import { http } from '../../services/http'
import type { AuthResponse, AvatarKey, Profile } from '../auth/authApi'

export interface ProfileInput {
  name: string
  isKids: boolean
  avatarKey: AvatarKey
  languageCode: 'vi' | 'en'
}

export const MAX_PROFILES = 5

export async function listProfiles(): Promise<Profile[]> {
  return (await http.get<Profile[]>('/api/profiles')).data
}

export async function createProfile(input: ProfileInput): Promise<Profile> {
  return (await http.post<Profile>('/api/profiles', input)).data
}

export async function updateProfile(profileId: number, input: ProfileInput): Promise<Profile> {
  return (await http.put<Profile>(`/api/profiles/${profileId}`, input)).data
}

export async function deleteProfile(profileId: number): Promise<void> {
  await http.delete(`/api/profiles/${profileId}`)
}

/** Returns an access token that carries the profile (its Kids limit and language). */
export async function selectProfile(profileId: number): Promise<AuthResponse> {
  return (await http.post<AuthResponse>(`/api/profiles/${profileId}/select`)).data
}
