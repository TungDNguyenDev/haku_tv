import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithStore } from '../test/render'
import AuthPage from './AuthPage'

describe('AuthPage', () => {
  it('switches the whole page to English from the language picker', () => {
    const { store } = renderWithStore(<AuthPage mode="login" />)
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Ngôn ngữ' }), { target: { value: 'en' } })

    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeTruthy()
    expect(store.getState().auth.preferredLanguage).toBe('en')
  })

  it('keeps sign-up disabled until the password is long enough', () => {
    renderWithStore(<AuthPage mode="register" />)
    const email = document.querySelector('input[type=email]')!
    const password = document.querySelector('input[type=password]')!
    const submit = screen.getByRole('button', { name: 'Đăng ký' }) as HTMLButtonElement

    fireEvent.change(email, { target: { value: 'viewer@hakutv.test' } })
    fireEvent.change(password, { target: { value: 'short' } })
    expect(submit.disabled).toBe(true)

    fireEvent.change(password, { target: { value: 'long-enough-1' } })
    expect(submit.disabled).toBe(false)
  })

  it('sends the sign-in request with a trimmed email', () => {
    const { store } = renderWithStore(<AuthPage mode="login" />)
    fireEvent.change(document.querySelector('input[type=email]')!, { target: { value: '  viewer@hakutv.test ' } })
    fireEvent.change(document.querySelector('input[type=password]')!, { target: { value: 'whatever-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    expect(store.getState().auth.form.status).toBe('loading') // loginRequested reached the reducer
  })
})
