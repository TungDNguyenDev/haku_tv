import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { setCurrentLanguage } from '../i18n'

// Vitest runs without globals, so Testing Library cannot register its own cleanup: unmount after every test here.
// The i18n module keeps the language for non-React code in a module variable; start every test in Vietnamese.
afterEach(() => {
  cleanup()
  setCurrentLanguage('vi')
  localStorage.clear()
})
