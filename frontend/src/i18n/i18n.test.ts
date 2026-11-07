import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { apiError } from '../services/http'
import { en } from './en'
import { errorText, messages, setCurrentLanguage } from './index'
import { vi } from './vi'

/** Every key path of a dictionary, e.g. "account.memberSince". */
function keyPaths(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

function leaf(obj: object, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj)
}

/** An axios error as the API returns it (no response = network failure). */
function httpError(status?: number, data?: object): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response = status === undefined ? undefined : { status, statusText: '', headers: {}, config, data }
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response)
}

describe('dictionaries', () => {
  it('have the same keys in Vietnamese and English', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(vi).sort())
  })

  it('have no empty texts, and the same kind of entry (text or function) for each key', () => {
    for (const path of keyPaths(vi)) {
      const v = leaf(vi, path)
      const e = leaf(en, path)
      expect(typeof e, path).toBe(typeof v)
      if (typeof v === 'string') expect(v.trim(), path).not.toBe('')
      if (typeof e === 'string') expect(e.trim(), path).not.toBe('')
    }
  })
})

describe('errorText / messages', () => {
  it('follows the current language', () => {
    expect(errorText('wrong-password')).toBe(vi.errors['wrong-password'])
    setCurrentLanguage('en')
    expect(errorText('wrong-password')).toBe('Incorrect password.')
    expect(messages().locale).toBe('en-US')
  })

  it('returns null for a code without a translation', () => {
    expect(errorText('brand-new-code')).toBeNull()
  })
})

describe('apiError', () => {
  it('translates a known API code instead of showing the server text', () => {
    setCurrentLanguage('en')
    const result = apiError(httpError(400, { code: 'same-password', error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }))
    expect(result).toEqual({ code: 'same-password', message: en.errors['same-password'] })
  })

  it("falls back to the server's message for a code the client does not know", () => {
    const result = apiError(httpError(409, { code: 'brand-new-code', error: 'Server text' }))
    expect(result).toEqual({ code: 'brand-new-code', message: 'Server text' })
  })

  it('treats a 429 from the rate limiter (no body) as rate-limited', () => {
    expect(apiError(httpError(429)).code).toBe('rate-limited')
  })

  it('reports an unreachable API as a network error', () => {
    expect(apiError(httpError()).message).toBe(vi.errors.network)
  })

  it('uses the generic message for anything else', () => {
    expect(apiError(new Error('boom'))).toEqual({ code: 'generic', message: vi.errors.generic })
  })
})
