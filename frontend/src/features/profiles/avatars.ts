import type { AvatarKey } from '../auth/authApi'

// Profile picture colours. The keys must match ProfileRules.Avatars in the API.
export const AVATAR_BACKGROUNDS: Record<AvatarKey, string> = {
  red: 'linear-gradient(135deg, #e50914, #8c0610)',
  blue: 'linear-gradient(135deg, #2f80ed, #1b4b8f)',
  yellow: 'linear-gradient(135deg, #f2c94c, #c08b16)',
  green: 'linear-gradient(135deg, #27ae60, #145c33)',
  purple: 'linear-gradient(135deg, #9b51e0, #55248a)',
  teal: 'linear-gradient(135deg, #2dc6c6, #137171)',
  orange: 'linear-gradient(135deg, #f2994a, #b5561b)',
  kids: 'linear-gradient(135deg, #ff5f6d 0%, #ffc371 35%, #47d18c 65%, #3ba7f5 100%)',
}

export const AVATAR_KEYS = Object.keys(AVATAR_BACKGROUNDS) as AvatarKey[]
