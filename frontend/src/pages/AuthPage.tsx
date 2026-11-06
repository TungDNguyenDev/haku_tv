import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { authFormReset, loginRequested, registerRequested } from '../features/auth/authSlice'

const MIN_PASSWORD = 8

// One page for both "Đăng nhập" and "Đăng ký": same layout, the mode decides the title, the API call and the link.
export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const dispatch = useAppDispatch()
  const { status, error } = useAppSelector((s) => s.auth.form)
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
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* Background: soft red glows instead of a photo (the catalog images need a signed-in profile). */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(229,9,20,0.35),transparent_55%),radial-gradient(ellipse_at_85%_90%,rgba(229,9,20,0.2),transparent_50%)]" />

      <header className="relative px-4 py-6 md:px-12">
        <Link to="/" className="text-3xl font-black tracking-tight text-brand md:text-4xl">
          HAKUTV
        </Link>
      </header>

      <main className="relative mx-auto mt-4 mb-16 w-full max-w-[450px] rounded-md bg-black/75 px-6 py-10 sm:px-14 sm:py-12">
        <h1 className="mb-7 text-3xl font-bold">{isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
          <div className="relative">
            <Field
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted hover:text-white"
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          {!isLogin && (
            <p className={`text-xs ${tooShort ? 'text-amber-400' : 'text-muted'}`}>Mật khẩu tối thiểu {MIN_PASSWORD} ký tự.</p>
          )}

          {error && (
            <p role="alert" className="rounded bg-amber-600/90 px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'loading' || !email || !password || tooShort}
            className="w-full rounded bg-brand py-3 font-semibold transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'loading' ? 'Đang xử lý…' : isLogin ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-10 text-muted">
          {isLogin ? 'Bạn mới dùng HakuTV? ' : 'Đã có tài khoản? '}
          <Link to={isLogin ? '/signup' : '/login'} className="font-medium text-white hover:underline">
            {isLogin ? 'Đăng ký ngay.' : 'Đăng nhập.'}
          </Link>
        </p>
      </main>
    </div>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  autoFocus?: boolean
}) {
  // Floating label: sits inside the box, moves up when the field has focus or a value.
  return (
    <label className="relative block">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder=" "
        className="peer w-full rounded border border-white/30 bg-neutral-900/70 px-4 pt-6 pb-2 outline-none focus:border-white"
      />
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted transition-all peer-focus:top-3.5 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-xs">
        {label}
      </span>
    </label>
  )
}
