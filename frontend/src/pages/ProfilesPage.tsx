import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import Avatar from '../components/Avatar'
import LanguageSelect from '../components/LanguageSelect'
import ProfileEditor from '../components/ProfileEditor'
import type { Profile } from '../features/auth/authApi'
import { logoutRequested } from '../features/auth/authSlice'
import { MAX_PROFILES } from '../features/profiles/profilesApi'
import { PinPrompt } from '../components/PinDialog'
import { useT } from '../i18n'
import { pinPromptClosed, pinPromptOpened, profileSelectRequested, profilesRequested } from '../features/profiles/profilesSlice'

// "Who's watching?": pick a profile, or switch to manage mode to add / edit / delete them.
export default function ProfilesPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { items, status, error, selectingId, pinPrompt } = useAppSelector((s) => s.profiles)
  const current = useAppSelector((s) => s.auth.profile)
  const t = useT()
  const [manage, setManage] = useState(new URLSearchParams(location.search).has('manage'))
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)
  // /profiles?unlock=<id> (the header's profile switcher for a locked profile): that profile is the one being chosen.
  const unlockId = Number(new URLSearchParams(location.search).get('unlock')) || null
  const [chosenId, setChosenId] = useState<number | null>(unlockId)

  useEffect(() => {
    dispatch(profilesRequested())
  }, [dispatch])

  // Selected: the new token is in the store once selectingId is cleared and auth.profile is the chosen one.
  useEffect(() => {
    if (chosenId !== null && selectingId === null && current?.profileId === chosenId) {
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/profiles' ? from : '/browse', { replace: true })
    }
  }, [chosenId, selectingId, current, location.state, navigate])

  // ...and its PIN is asked straight away.
  useEffect(() => {
    if (unlockId !== null) dispatch(pinPromptOpened({ profileId: unlockId, error: null }))
  }, [unlockId, dispatch])

  const choose = (profile: Profile) => {
    if (manage) {
      setEditing(profile)
      return
    }
    setChosenId(profile.profileId)
    // A locked profile answers "pin-required" and the saga opens the PIN prompt.
    dispatch(profileSelectRequested({ profileId: profile.profileId }))
  }

  const closeEditor = useCallback(() => setEditing(null), [])
  const closePin = useCallback(() => dispatch(pinPromptClosed()), [dispatch])
  const pinProfile = pinPrompt ? items.find((p) => p.profileId === pinPrompt.profileId) : undefined

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-4 py-5 md:px-12">
        <span className="text-3xl font-black tracking-tight text-brand">HAKUTV</span>
        <div className="flex items-center gap-5">
          {/* With a profile in use the language is that profile's setting; before that it is picked here. */}
          {!current && <LanguageSelect />}
          <button type="button" onClick={() => dispatch(logoutRequested())} className="text-sm text-muted hover:text-white">
            {t.common.signOut}
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center">
        <h1 className="text-3xl font-medium md:text-5xl">{manage ? t.profiles.manageTitle : t.profiles.whoIsWatching}</h1>

        {status === 'loading' && items.length === 0 && (
          <div className="mt-12 size-10 animate-spin rounded-full border-4 border-white/15 border-t-brand" />
        )}
        {error && <p className="mt-6 text-sm text-amber-400">{error}</p>}

        <ul className="mt-10 flex max-w-4xl flex-wrap justify-center gap-5 md:gap-8">
          {items.map((p) => (
            <li key={p.profileId}>
              <button
                type="button"
                onClick={() => choose(p)}
                disabled={selectingId !== null}
                className="group flex w-24 flex-col items-center gap-3 md:w-36"
              >
                <span className="relative">
                  <Avatar
                    avatarKey={p.avatarKey}
                    className="size-24 text-base ring-white transition group-hover:ring-4 group-focus-visible:ring-4 md:size-36 md:text-2xl"
                  />
                  {manage && (
                    <span className="absolute inset-0 grid place-items-center rounded-md bg-black/55">
                      <PencilIcon />
                    </span>
                  )}
                  {!manage && p.hasPin && (
                    <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-black/70" title={t.profiles.lockedProfile}>
                      <LockIcon />
                    </span>
                  )}
                  {selectingId === p.profileId && (
                    <span className="absolute inset-0 grid place-items-center rounded-md bg-black/40">
                      <span className="size-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-muted group-hover:text-white md:text-lg">{p.name}</span>
                {p.isKids && <span className="-mt-2 text-xs font-semibold text-sky-300">{t.common.kids}</span>}
              </button>
            </li>
          ))}

          {status === 'succeeded' && items.length < MAX_PROFILES && (
            <li>
              <button type="button" onClick={() => setEditing('new')} className="group flex w-24 flex-col items-center gap-3 md:w-36">
                <span className="grid size-24 place-items-center rounded-md border-2 border-transparent text-6xl text-muted transition group-hover:bg-white/10 group-hover:text-white md:size-36 md:text-8xl">
                  +
                </span>
                <span className="text-muted group-hover:text-white md:text-lg">{t.profiles.addProfile}</span>
              </button>
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={() => setManage((m) => !m)}
          className={`mt-14 border px-6 py-2 tracking-widest uppercase md:text-lg ${
            manage ? 'border-white bg-white font-semibold text-black' : 'border-muted text-muted hover:border-white hover:text-white'
          }`}
        >
          {manage ? t.profiles.done : t.common.manageProfiles}
        </button>
      </main>

      {editing && (
        <ProfileEditor profile={editing === 'new' ? null : editing} canDelete={items.length > 1} onClose={closeEditor} />
      )}

      {pinPrompt && pinProfile && (
        <PinPrompt
          profileName={pinProfile.name}
          error={pinPrompt.error}
          busy={selectingId === pinPrompt.profileId}
          onSubmit={(pin) => {
            setChosenId(pinPrompt.profileId)
            dispatch(profileSelectRequested({ profileId: pinPrompt.profileId, pin }))
          }}
          onClose={closePin}
        />
      )}
    </div>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="white" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" strokeLinejoin="round" />
    </svg>
  )
}
