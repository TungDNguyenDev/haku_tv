import type { AvatarKey } from '../features/auth/authApi'
import { AVATAR_BACKGROUNDS } from '../features/profiles/avatars'

// Profile picture: a colour + a simple face, drawn in SVG (no image files to host).
export default function Avatar({ avatarKey, className = 'size-10' }: { avatarKey: AvatarKey; className?: string }) {
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-md ${className}`}
      style={{ background: AVATAR_BACKGROUNDS[avatarKey] ?? AVATAR_BACKGROUNDS.red }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="size-full">
        <circle cx="34" cy="40" r="6" fill="white" />
        <circle cx="66" cy="40" r="6" fill="white" />
        <path d="M28 62 Q50 82 72 62" stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" />
      </svg>
      {avatarKey === 'kids' && (
        <span className="absolute bottom-[7%] text-[0.55em] font-black tracking-wider text-white drop-shadow">KIDS</span>
      )}
    </span>
  )
}
