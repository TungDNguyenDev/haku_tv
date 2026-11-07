import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { AuthShell, Field, FormAlert } from '../components/AuthShell'
import { forgotPasswordRequested, formReset, resetPasswordRequested } from '../features/account/accountSlice'
import { useT } from '../i18n'

const MIN_PASSWORD = 8

/** Step 1: ask for a reset link. The answer is the same whether the email exists or not. */
export function ForgotPasswordPage() {
  const dispatch = useAppDispatch()
  const form = useAppSelector((s) => s.account.forms.forgotPassword)
  const t = useT()
  const [email, setEmail] = useState('')

  useEffect(() => {
    dispatch(formReset('forgotPassword'))
  }, [dispatch])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    dispatch(forgotPasswordRequested(email.trim()))
  }

  return (
    <AuthShell title={t.reset.forgotTitle}>
      {form.status === 'done' ? (
        <div className="space-y-5">
          <FormAlert tone="success">{form.message}</FormAlert>
          <p className="text-sm text-muted">
            {t.reset.devMailboxBefore}
            <code className="text-white">.html</code>
            {t.reset.devMailboxMiddle}
            <code className="text-white">.dev-mail</code>
            {t.reset.devMailboxAfter}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-muted">{t.reset.forgotIntro}</p>
          <Field label={t.auth.email} type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
          {form.status === 'failed' && <FormAlert>{form.message}</FormAlert>}
          <button
            type="submit"
            disabled={form.status === 'saving' || !email.trim()}
            className="w-full rounded bg-brand py-3 font-semibold hover:bg-brand-hover disabled:opacity-60"
          >
            {form.status === 'saving' ? t.reset.sending : t.reset.sendLink}
          </button>
        </form>
      )}
      <p className="mt-10 text-muted">
        <Link to="/login" className="font-medium text-white hover:underline">
          {t.reset.backToLogin}
        </Link>
      </p>
    </AuthShell>
  )
}

/** Step 2: the link from the email lands here with ?token=... */
export function ResetPasswordPage() {
  const dispatch = useAppDispatch()
  const form = useAppSelector((s) => s.account.forms.resetPassword)
  const t = useT()
  const [search] = useSearchParams()
  const token = search.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    dispatch(formReset('resetPassword'))
  }, [dispatch])

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (tooShort || mismatch) return
    dispatch(resetPasswordRequested({ token, password }))
  }

  if (!token) {
    return (
      <AuthShell title={t.reset.resetTitle}>
        <FormAlert>{t.reset.invalidLink}</FormAlert>
        <p className="mt-6">
          <Link to="/forgot-password" className="text-white hover:underline">
            {t.reset.requestNewLink}
          </Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t.reset.newTitle}>
      {form.status === 'done' ? (
        <div className="space-y-6">
          <FormAlert tone="success">{t.reset.done}</FormAlert>
          <Link to="/login" className="block w-full rounded bg-brand py-3 text-center font-semibold hover:bg-brand-hover">
            {t.auth.login}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t.reset.newPassword} type="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          <Field label={t.reset.confirmPassword} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <p className={`text-xs ${tooShort || mismatch ? 'text-amber-400' : 'text-muted'}`}>
            {mismatch ? t.reset.mismatch : t.auth.passwordHint(MIN_PASSWORD)}
          </p>
          {form.status === 'failed' && (
            <FormAlert>
              {form.message}{' '}
              <Link to="/forgot-password" className="underline">
                {t.reset.sendNewLink}
              </Link>
            </FormAlert>
          )}
          <button
            type="submit"
            disabled={form.status === 'saving' || !password || tooShort || mismatch || !confirm}
            className="w-full rounded bg-brand py-3 font-semibold hover:bg-brand-hover disabled:opacity-60"
          >
            {form.status === 'saving' ? t.common.saving : t.reset.savePassword}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
