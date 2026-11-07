// UI languages. Same codes as catalog.Language / identity.Profile.LanguageCode, so one choice drives both the
// interface and the catalog texts. No imports here: the auth slice reads it while the store is being built.
export type Language = 'vi' | 'en'

export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'English' },
]

// The language of the signed-out pages (login, profile picker): the last one used on this browser.
const KEY = 'hakutv.lang'

export function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'en' || value === 'vi' ? value : 'vi'
  } catch {
    return 'vi'
  }
}

export function storeLanguage(lang: Language) {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // storage blocked (private mode): the next visit starts in Vietnamese again
  }
}
