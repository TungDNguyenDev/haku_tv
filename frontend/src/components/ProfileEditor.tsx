import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import type { AvatarKey, MaturityLimit, Profile } from '../features/auth/authApi'
import { AVATAR_KEYS } from '../features/profiles/avatars'
import { ADULT_MATURITY_OPTIONS, KIDS_MATURITY_OPTIONS } from '../features/profiles/maturity'
import {
  profileCreateRequested,
  profileDeleteRequested,
  profileSaveReset,
  profileUpdateRequested,
} from '../features/profiles/profilesSlice'
import Avatar from './Avatar'

interface Props {
  profile: Profile | null // null = new profile
  canDelete: boolean
  onClose: () => void
}

// Create / edit / delete a profile in a dialog. Closes itself when the save succeeds.
export default function ProfileEditor({ profile, canDelete, onClose }: Props) {
  const dispatch = useAppDispatch()
  const save = useAppSelector((s) => s.profiles.save)
  const [name, setName] = useState(profile?.name ?? '')
  const [isKids, setIsKids] = useState(profile?.isKids ?? false)
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(profile?.avatarKey ?? 'blue')
  const [languageCode, setLanguageCode] = useState<'vi' | 'en'>(profile?.languageCode ?? 'vi')
  const [maturityLimit, setMaturityLimit] = useState<MaturityLimit>(profile?.maturityLimit ?? null)
  const maturityOptions = isKids ? KIDS_MATURITY_OPTIONS : ADULT_MATURITY_OPTIONS
  const [confirmDelete, setConfirmDelete] = useState(false)
  const wasSaving = useRef(false)

  useEffect(() => {
    if (save.status === 'saving') wasSaving.current = true
    else if (wasSaving.current && save.status === 'idle') onClose()
  }, [save.status, onClose])

  useEffect(() => {
    dispatch(profileSaveReset())
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const input = { name: name.trim(), isKids, avatarKey, languageCode, maturityLimit }
    dispatch(profile ? profileUpdateRequested({ profileId: profile.profileId, input }) : profileCreateRequested(input))
  }

  const toggleKids = (value: boolean) => {
    setIsKids(value)
    if (value && !profile) setAvatarKey('kids')
    // Kids profiles only offer "kids" (12) and "little kids" (7): drop a 13/16 tier picked for an adult profile.
    if (value && maturityLimit !== null && maturityLimit !== 7) setMaturityLimit(null)
  }

  const saving = save.status === 'saving'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={profile ? 'Chỉnh sửa hồ sơ' : 'Thêm hồ sơ'}
        className="w-full max-w-lg rounded-md bg-surface-raised p-6 shadow-2xl md:p-8"
      >
        <h2 className="mb-6 text-2xl font-bold md:text-3xl">{profile ? 'Chỉnh sửa hồ sơ' : 'Thêm hồ sơ'}</h2>

        <div className="flex gap-5">
          <Avatar avatarKey={avatarKey} className="size-20 text-lg md:size-24" />
          <div className="flex-1 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="Tên"
              aria-label="Tên hồ sơ"
              autoFocus
              className="w-full rounded-sm bg-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-white"
            />

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={isKids} onChange={(e) => toggleKids(e.target.checked)} className="size-5 accent-brand" />
              <span>
                Hồ sơ trẻ em
                <span className="block text-xs text-muted">Giao diện trẻ em, không vào được trang quản trị.</span>
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted">Giới hạn độ tuổi</span>
              <select
                value={maturityLimit ?? ''}
                onChange={(e) => setMaturityLimit(e.target.value === '' ? null : (Number(e.target.value) as MaturityLimit))}
                className="w-full rounded-sm bg-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-white"
              >
                {maturityOptions.map((o) => (
                  <option key={o.value ?? 'all'} value={o.value ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted">Ngôn ngữ</span>
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value as 'vi' | 'en')}
                className="rounded-sm bg-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-white"
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="mb-2 text-sm text-muted">Ảnh đại diện</legend>
          <div className="flex flex-wrap gap-2">
            {AVATAR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={key === avatarKey}
                onClick={() => setAvatarKey(key)}
                className={`rounded-md ring-offset-2 ring-offset-surface-raised ${key === avatarKey ? 'ring-2 ring-white' : 'opacity-70 hover:opacity-100'}`}
              >
                <Avatar avatarKey={key} className="size-11 text-[10px]" />
              </button>
            ))}
          </div>
        </fieldset>

        {save.error && (
          <p role="alert" className="mt-5 rounded bg-amber-600/90 px-3 py-2 text-sm">
            {save.error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-sm bg-white px-6 py-2 font-semibold text-black hover:bg-brand hover:text-white disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button type="button" onClick={onClose} className="rounded-sm border border-white/50 px-6 py-2 text-muted hover:border-white hover:text-white">
            Hủy
          </button>

          {profile && canDelete && (
            <button
              type="button"
              disabled={saving}
              onClick={() => (confirmDelete ? dispatch(profileDeleteRequested(profile.profileId)) : setConfirmDelete(true))}
              className="ml-auto rounded-sm px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
            >
              {confirmDelete ? 'Bấm lần nữa để xóa' : 'Xóa hồ sơ'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
