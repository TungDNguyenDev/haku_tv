import { useAppSelector } from '../app/hooks'
import { selectLanguage } from '../features/auth/authSlice'
import { en } from './en'
import type { Language } from './language'
import { vi, type Messages } from './vi'

export type { Language } from './language'
export type { Messages } from './vi'

const dictionaries: Record<Language, Messages> = { vi, en }

/** Texts of the current language, for components: re-renders when the profile (or the picked language) changes. */
export function useT(): Messages {
  return dictionaries[useAppSelector(selectLanguage)]
}

/*
  Same texts for code outside React (sagas, the axios error helper). The store pushes the current language here,
  like the access token in services/http.ts.
*/
let current: Language = 'vi'

export function setCurrentLanguage(lang: Language) {
  if (lang === current) return
  current = lang
  document.documentElement.lang = lang
}

export function currentLanguage(): Language {
  return current
}

export function messages(): Messages {
  return dictionaries[current]
}

/** Message for an API error code; null when the code has no translation (the caller then shows the server text). */
export function errorText(code: string): string | null {
  const errors: Record<string, string> = dictionaries[current].errors
  return errors[code] ?? null
}
