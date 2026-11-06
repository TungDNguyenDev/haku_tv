import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { AuthShell, Field, FormAlert } from '../components/AuthShell'
import { forgotPasswordRequested, formReset, resetPasswordRequested } from '../features/account/accountSlice'

const MIN_PASSWORD = 8

/** Step 1: ask for a reset link. The answer is the same whether the email exists or not. */
export function ForgotPasswordPage() {
  const dispatch = useAppDispatch()
  const form = useAppSelector((s) => s.account.forms.forgotPassword)
  const [email, setEmail] = useState('')

  useEffect(() => {
    dispatch(formReset('forgotPassword'))
  }, [dispatch])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    dispatch(forgotPasswordRequested(email.trim()))
  }

  return (
    <AuthShell title="Quên mật khẩu">
      {form.status === 'done' ? (
        <div className="space-y-5">
          <FormAlert tone="success">{form.message}</FormAlert>
          <p className="text-sm text-muted">
            Bản chạy local không gửi email thật: email được lưu thành file <code className="text-white">.html</code> trong thư mục{' '}
            <code className="text-white">.dev-mail</code> ở gốc dự án. Mở file mới nhất và bấm nút trong đó.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-muted">Nhập email của tài khoản, chúng tôi sẽ gửi liên kết để đặt mật khẩu mới (hiệu lực 30 phút).</p>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
          {form.status === 'failed' && <FormAlert>{form.message}</FormAlert>}
          <button
            type="submit"
            disabled={form.status === 'saving' || !email.trim()}
            className="w-full rounded bg-brand py-3 font-semibold hover:bg-brand-hover disabled:opacity-60"
          >
            {form.status === 'saving' ? 'Đang gửi…' : 'Gửi liên kết'}
          </button>
        </form>
      )}
      <p className="mt-10 text-muted">
        <Link to="/login" className="font-medium text-white hover:underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthShell>
  )
}

/** Step 2: the link from the email lands here with ?token=... */
export function ResetPasswordPage() {
  const dispatch = useAppDispatch()
  const form = useAppSelector((s) => s.account.forms.resetPassword)
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
      <AuthShell title="Đặt lại mật khẩu">
        <FormAlert>Liên kết không hợp lệ.</FormAlert>
        <p className="mt-6">
          <Link to="/forgot-password" className="text-white hover:underline">
            Yêu cầu liên kết mới
          </Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Đặt mật khẩu mới">
      {form.status === 'done' ? (
        <div className="space-y-6">
          <FormAlert tone="success">Đã đổi mật khẩu. Mọi thiết bị đã được đăng xuất, hãy đăng nhập lại.</FormAlert>
          <Link to="/login" className="block w-full rounded bg-brand py-3 text-center font-semibold hover:bg-brand-hover">
            Đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Mật khẩu mới" type="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          <Field label="Nhập lại mật khẩu" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <p className={`text-xs ${tooShort || mismatch ? 'text-amber-400' : 'text-muted'}`}>
            {mismatch ? 'Hai mật khẩu chưa khớp.' : `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự.`}
          </p>
          {form.status === 'failed' && (
            <FormAlert>
              {form.message}{' '}
              <Link to="/forgot-password" className="underline">
                Gửi liên kết mới
              </Link>
            </FormAlert>
          )}
          <button
            type="submit"
            disabled={form.status === 'saving' || !password || tooShort || mismatch || !confirm}
            className="w-full rounded bg-brand py-3 font-semibold hover:bg-brand-hover disabled:opacity-60"
          >
            {form.status === 'saving' ? 'Đang lưu…' : 'Lưu mật khẩu'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
