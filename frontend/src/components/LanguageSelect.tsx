import { useAppDispatch, useAppSelector } from '../app/hooks'
import { languagePicked, selectLanguage } from '../features/auth/authSlice'
import { profileUpdateRequested } from '../features/profiles/profilesSlice'
import { useT } from '../i18n'
import { LANGUAGES, type Language } from '../i18n/language'

/**
 * Language picker. Signed out / no profile yet (login, profile picker): only this browser's choice.
 * With a profile in use (app header): the language is that profile's setting, so the choice is saved to the profile;
 * the profiles saga then gets a new token and the catalog reloads in the new language.
 */
export default function LanguageSelect({ className = '' }: { className?: string }) {
  const dispatch = useAppDispatch()
  const lang = useAppSelector(selectLanguage)
  const profile = useAppSelector((s) => s.auth.profile)
  const saving = useAppSelector((s) => s.profiles.save.status === 'saving')
  const t = useT()

  const change = (value: Language) => {
    if (!profile) {
      dispatch(languagePicked(value))
      return
    }
    const { profileId, name, isKids, avatarKey, maturityLimit } = profile
    dispatch(profileUpdateRequested({ profileId, input: { name, isKids, avatarKey, maturityLimit, languageCode: value } }))
  }

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <GlobeIcon />
      <select
        value={lang}
        disabled={saving}
        onChange={(e) => change(e.target.value as Language)}
        aria-label={t.common.language}
        title={t.common.language}
        className="cursor-pointer appearance-none rounded border border-white/40 bg-black/60 py-1.5 pr-8 pl-9 text-sm text-white outline-none hover:border-white focus:ring-2 focus:ring-white disabled:cursor-wait disabled:opacity-60"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-neutral-900">
            {l.name}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  )
}
