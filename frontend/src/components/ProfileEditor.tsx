import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import type { AvatarKey, MaturityLimit, Profile } from '../features/auth/authApi'
import { AVATAR_KEYS } from '../features/profiles/avatars'
import { ADULT_MATURITY_LIMITS, KIDS_MATURITY_LIMITS, maturityLabel } from '../features/profiles/maturity'
import {
  profileCreateRequested,
  profileDeleteRequested,
  profileSaveReset,
  profileUpdateRequested,
} from '../features/profiles/profilesSlice'
import { useT } from '../i18n'
import { LANGUAGES, type Language } from '../i18n/language'
import Avatar from './Avatar'
import Select from './Select'

interface Props {
  profile: Profile | null // null = new profile
  canDelete: boolean
  onClose: () => void
}

// Trigger colors of the dropdowns, matching the name input.
const FIELD = 'border-transparent bg-neutral-700 hover:border-white/40'

// Create / edit / delete a profile in a dialog. Closes itself when the save succeeds.
export default function ProfileEditor({ profile, canDelete, onClose }: Props) {
  const dispatch = useAppDispatch()
  const save = useAppSelector((s) => s.profiles.save)
  const t = useT()
  const [name, setName] = useState(profile?.name ?? '')
  const [isKids, setIsKids] = useState(profile?.isKids ?? false)
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(profile?.avatarKey ?? 'blue')
  const [languageCode, setLanguageCode] = useState<Language>(profile?.languageCode ?? 'vi')
  const [maturityLimit, setMaturityLimit] = useState<MaturityLimit>(profile?.maturityLimit ?? null)
  const maturityLimits = isKids ? KIDS_MATURITY_LIMITS : ADULT_MATURITY_LIMITS
  const [confirmDelete, setConfirmDelete] = useState(false)
  const wasSaving = useRef(false)
  const formId = useId()

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
        aria-label={profile ? t.profiles.editTitle : t.profiles.addProfile}
        className="w-full max-w-lg rounded-md bg-surface-raised p-6 shadow-2xl md:p-8"
      >
        <h2 className="mb-6 text-2xl font-bold md:text-3xl">{profile ? t.profiles.editTitle : t.profiles.addProfile}</h2>

        <div className="flex gap-5">
          <Avatar avatarKey={avatarKey} className="size-20 text-lg md:size-24" />
          <div className="flex-1 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder={t.profiles.name}
              aria-label={t.profiles.nameLabel}
              autoFocus
              className="w-full rounded-sm bg-neutral-700 px-3 py-2 outline-none focus:ring-2 focus:ring-white"
            />

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={isKids} onChange={(e) => toggleKids(e.target.checked)} className="size-5 accent-brand" />
              <span>
                {t.profiles.kidsProfile}
                <span className="block text-xs text-muted">{t.profiles.kidsHint}</span>
              </span>
            </label>

            {/* Labelled by id rather than wrapped in <label>: a label would re-click the button when an option is picked. */}
            <div className="text-sm">
              <span id={`${formId}-maturity`} className="mb-1 block text-muted">
                {t.profiles.maturity}
              </span>
              <Select<MaturityLimit>
                value={maturityLimit}
                options={maturityLimits.map((limit) => ({ value: limit, label: maturityLabel(t, isKids, limit) }))}
                onChange={setMaturityLimit}
                aria-labelledby={`${formId}-maturity`}
                className="w-full"
                triggerClassName={FIELD}
              />
            </div>

            <div className="text-sm">
              <span id={`${formId}-language`} className="mb-1 block text-muted">
                {t.common.language}
              </span>
              <Select
                value={languageCode}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
                onChange={setLanguageCode}
                aria-labelledby={`${formId}-language`}
                className="min-w-40"
                triggerClassName={FIELD}
              />
              <span className="mt-1 block text-xs text-muted">{t.profiles.languageHint}</span>
            </div>
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="mb-2 text-sm text-muted">{t.profiles.avatar}</legend>
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
            {saving ? t.common.saving : t.common.save}
          </button>
          <button type="button" onClick={onClose} className="rounded-sm border border-white/50 px-6 py-2 text-muted hover:border-white hover:text-white">
            {t.common.cancel}
          </button>

          {profile && canDelete && (
            <button
              type="button"
              disabled={saving}
              onClick={() => (confirmDelete ? dispatch(profileDeleteRequested(profile.profileId)) : setConfirmDelete(true))}
              className="ml-auto rounded-sm px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
            >
              {confirmDelete ? t.profiles.confirmDelete : t.profiles.delete}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
