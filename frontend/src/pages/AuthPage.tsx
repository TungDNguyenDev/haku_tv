import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { AuthShell, Field, FormAlert } from '../components/AuthShell'
import { authFormReset, loginRequested, registerRequested } from '../features/auth/authSlice'
import { useT } from '../i18n'

const MIN_PASSWORD = 8

// One page for both sign-in and sign-up: same layout, the mode decides the title, the API call and the link.
export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const dispatch = useAppDispatch()
  const { status, error } = useAppSelector((s) => s.auth.form)
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const isLogin = mode === 'login'

  // Switching between /login and /signup clears the previous form's error.
  useEffect(() => {
    dispatch(authFormReset())
  }, [mode, dispatch])

  const tooShort = !isLogin && password.length > 0 && password.length < MIN_PASSWORD
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (tooShort) return
    const body = { email: email.trim(), password }
    dispatch(isLogin ? loginRequested(body) : registerRequested(body))
  }

  return (
    <AuthShell title={isLogin ? t.auth.loginTitle : t.auth.registerTitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t.auth.email} type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
        <Field
          label={t.auth.password}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          trailing={
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-xs text-muted hover:text-white">
              {showPassword ? t.auth.hide : t.auth.show}
            </button>
          }
        />
        {!isLogin && (
          <p className={`text-xs ${tooShort ? 'text-amber-400' : 'text-muted'}`}>{t.auth.passwordHint(MIN_PASSWORD)}</p>
        )}

        {error && <FormAlert>{error}</FormAlert>}

        <button
          type="submit"
          disabled={status === 'loading' || !email || !password || tooShort}
          className="w-full rounded bg-brand py-3 font-semibold transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? t.auth.working : isLogin ? t.auth.login : t.auth.register}
        </button>

        {isLogin && (
          <p className="text-center">
            <Link to="/forgot-password" className="text-sm text-white/80 hover:text-white hover:underline">
              {t.auth.forgot}
            </Link>
          </p>
        )}
      </form>

      <p className="mt-10 text-muted">
        {isLogin ? t.auth.newHere : t.auth.haveAccount}
        <Link to={isLogin ? '/signup' : '/login'} className="font-medium text-white hover:underline">
          {isLogin ? t.auth.registerNow : t.auth.loginLink}
        </Link>
      </p>
    </AuthShell>
  )
}
