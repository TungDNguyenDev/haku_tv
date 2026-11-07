import { useAppDispatch, useAppSelector } from '../app/hooks'
import { languagePicked, selectLanguage } from '../features/auth/authSlice'
import { profileUpdateRequested } from '../features/profiles/profilesSlice'
import { useT } from '../i18n'
import { LANGUAGES, type Language } from '../i18n/language'
import Select from './Select'

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
    <Select
      value={lang}
      disabled={saving}
      options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
      onChange={change}
      aria-label={t.common.language}
      title={t.common.language}
      icon={<GlobeIcon />}
      align="end"
      className={className}
    />
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  )
}
