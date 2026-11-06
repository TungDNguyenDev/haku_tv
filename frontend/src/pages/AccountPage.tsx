import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import { FormAlert } from '../components/AuthShell'
import Avatar from '../components/Avatar'
import { Dialog, PinInput } from '../components/PinDialog'
import {
  accountRequested,
  allSessionsRevokeRequested,
  changePasswordRequested,
  formReset,
  profilePinRequested,
  sessionRevokeRequested,
} from '../features/account/accountSlice'
import type { Profile } from '../features/auth/authApi'
import { maturityLabel } from '../features/profiles/maturity'
import { profilesRequested } from '../features/profiles/profilesSlice'

const dateFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

// "Tài khoản": details, password, signed-in devices, profiles & parental controls (maturity + PIN lock).
export default function AccountPage() {
  const dispatch = useAppDispatch()
  const { details, sessions, loading, error } = useAppSelector((s) => s.account)
  const profiles = useAppSelector((s) => s.profiles.items)
  const [pinFor, setPinFor] = useState<Profile | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  useEffect(() => {
    dispatch(accountRequested())
    dispatch(profilesRequested())
  }, [dispatch])

  const closePin = useCallback(() => setPinFor(null), [])

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-8 md:px-8">
        <h1 className="text-3xl font-bold md:text-4xl">Tài khoản</h1>
        {details && (
          <p className="mt-2 text-sm text-muted">Thành viên từ {dateFormat.format(new Date(details.createdAt))}</p>
        )}
        {error && <p className="mt-4 text-sm text-amber-400">{error}</p>}

        <Section title="Thông tin đăng nhập">
          {loading && !details ? (
            <p className="text-muted">Đang tải…</p>
          ) : (
            details && (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted">Email</dt>
                <dd className="break-all">{details.email}</dd>
                <dt className="text-muted">Đăng nhập gần nhất</dt>
                <dd>{details.lastLoginAt ? dateTimeFormat.format(new Date(details.lastLoginAt)) : '—'}</dd>
                {details.isAdmin && (
                  <>
                    <dt className="text-muted">Quyền</dt>
                    <dd>Quản trị viên</dd>
                  </>
                )}
              </dl>
            )
          )}
        </Section>

        <Section title="Đổi mật khẩu">
          <ChangePasswordForm />
        </Section>

        <Section
          title="Thiết bị đang đăng nhập"
          action={
            confirmAll ? (
              <button type="button" onClick={() => dispatch(allSessionsRevokeRequested())} className="text-sm font-semibold text-red-400 hover:underline">
                Bấm lần nữa để đăng xuất tất cả
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmAll(true)} className="text-sm text-muted hover:text-white hover:underline">
                Đăng xuất khỏi mọi thiết bị
              </button>
            )
          }
        >
          <ul className="divide-y divide-white/10">
            {sessions.map((s) => (
              <li key={s.familyId} className="flex items-center gap-4 py-3">
                <DeviceIcon />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.device}
                    {s.isCurrent && <span className="ml-2 rounded bg-emerald-600/80 px-1.5 py-0.5 text-[11px] font-semibold">Thiết bị này</span>}
                  </p>
                  <p className="text-xs text-muted">
                    Đăng nhập {dateTimeFormat.format(new Date(s.startedAt))} · Hoạt động gần nhất {dateTimeFormat.format(new Date(s.lastSeenAt))}
                  </p>
                </div>
                {!s.isCurrent && (
                  <button
                    type="button"
                    onClick={() => dispatch(sessionRevokeRequested(s.familyId))}
                    className="rounded border border-white/30 px-3 py-1 text-sm hover:border-white"
                  >
                    Đăng xuất
                  </button>
                )}
              </li>
            ))}
            {sessions.length === 0 && !loading && <li className="py-3 text-sm text-muted">Không có thiết bị nào.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">Thiết bị bị đăng xuất sẽ phải đăng nhập lại trong vòng 15 phút.</p>
        </Section>

        <Section
          title="Hồ sơ và kiểm soát của phụ huynh"
          action={
            <Link to="/profiles?manage" className="text-sm text-muted hover:text-white hover:underline">
              Quản lý hồ sơ
            </Link>
          }
        >
          <ul className="divide-y divide-white/10">
            {profiles.map((p) => (
              <li key={p.profileId} className="flex items-center gap-4 py-3">
                <Avatar avatarKey={p.avatarKey} className="size-11 text-[9px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {maturityLabel(p.isKids, p.maturityLimit)} · {p.hasPin ? 'Đã khóa bằng PIN' : 'Không khóa'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPinFor(p)}
                  className="rounded border border-white/30 px-3 py-1 text-sm hover:border-white"
                >
                  {p.hasPin ? 'Đổi / gỡ PIN' : 'Khóa bằng PIN'}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </main>
      <AppFooter />

      {pinFor && <ProfilePinDialog profile={pinFor} onClose={closePin} />}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 rounded-md bg-surface-raised p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ChangePasswordForm() {
  const dispatch = useAppDispatch()
  const form = useAppSelector((s) => s.account.forms.changePassword)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    dispatch(formReset('changePassword'))
  }, [dispatch])

  const mismatch = confirm.length > 0 && confirm !== next
  const tooShort = next.length > 0 && next.length < 8

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mismatch || tooShort) return
    dispatch(changePasswordRequested({ currentPassword: current, newPassword: next }))
  }

  // Clear the fields once the change went through (adjusting state during render, not in an effect).
  const [handled, setHandled] = useState(form.status)
  if (form.status !== handled) {
    setHandled(form.status)
    if (form.status === 'done') {
      setCurrent('')
      setNext('')
      setConfirm('')
    }
  }

  const input = 'w-full rounded-sm bg-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-white'

  return (
    <form onSubmit={submit} className="grid max-w-md gap-3" noValidate>
      <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Mật khẩu hiện tại" autoComplete="current-password" className={input} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Mật khẩu mới (tối thiểu 8 ký tự)" autoComplete="new-password" className={input} />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" className={input} />
      {(mismatch || tooShort) && <p className="text-xs text-amber-400">{mismatch ? 'Hai mật khẩu mới chưa khớp.' : 'Mật khẩu mới tối thiểu 8 ký tự.'}</p>}
      {form.status === 'failed' && <FormAlert>{form.message}</FormAlert>}
      {form.status === 'done' && <FormAlert tone="success">{form.message}</FormAlert>}
      <button
        type="submit"
        disabled={form.status === 'saving' || !current || !next || !confirm || mismatch || tooShort}
        className="w-fit rounded-sm bg-white px-5 py-2 font-semibold text-black hover:bg-white/80 disabled:opacity-50"
      >
        {form.status === 'saving' ? 'Đang lưu…' : 'Đổi mật khẩu'}
      </button>
    </form>
  )
}

/** Lock a profile with a PIN, change it, or remove it. Needs the account password. */
function ProfilePinDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const form = useAppSelector((s) => s.account.forms.profilePin)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')

  useEffect(() => {
    dispatch(formReset('profilePin'))
  }, [dispatch])

  useEffect(() => {
    if (form.status === 'done') onClose()
  }, [form.status, onClose])

  const save = (value: string | null) => dispatch(profilePinRequested({ profileId: profile.profileId, password, pin: value }))

  return (
    <Dialog label={`Khóa hồ sơ ${profile.name}`} onClose={onClose}>
      <h2 className="mb-2 text-2xl font-bold">Khóa hồ sơ {profile.name}</h2>
      <p className="mb-6 text-sm text-muted">Mỗi lần chọn hồ sơ này sẽ phải nhập mã PIN 4 số. Cần mật khẩu tài khoản để thay đổi.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mật khẩu tài khoản"
        autoComplete="current-password"
        autoFocus
        className="mb-6 w-full rounded-sm bg-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-white"
      />
      <PinInput value={pin} onChange={setPin} />
      {form.status === 'failed' && <div className="mt-5 text-left"><FormAlert>{form.message}</FormAlert></div>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={form.status === 'saving' || !password || pin.length !== 4}
          onClick={() => save(pin)}
          className="rounded-sm bg-white px-5 py-2 font-semibold text-black hover:bg-white/80 disabled:opacity-50"
        >
          {profile.hasPin ? 'Lưu PIN mới' : 'Khóa hồ sơ'}
        </button>
        {profile.hasPin && (
          <button
            type="button"
            disabled={form.status === 'saving' || !password}
            onClick={() => save(null)}
            className="rounded-sm border border-red-400/60 px-5 py-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            Gỡ khóa
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-sm px-5 py-2 text-muted hover:text-white">
          Hủy
        </button>
      </div>
    </Dialog>
  )
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-8 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" strokeLinecap="round" />
    </svg>
  )
}
