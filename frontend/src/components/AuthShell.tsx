import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Shared layout of the signed-out pages (login, sign-up, forgot / reset password).
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
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
        <h1 className="mb-7 text-3xl font-bold">{title}</h1>
        {children}
      </main>
    </div>
  )
}

/** Text field with a floating label: inside the box, moves up when the field has focus or a value. */
export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  autoFocus,
  trailing,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  autoFocus?: boolean
  trailing?: ReactNode
}) {
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
      {trailing && <span className="absolute top-1/2 right-3 -translate-y-1/2">{trailing}</span>}
    </label>
  )
}

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded px-4 py-3 text-sm ${tone === 'error' ? 'bg-amber-600/90' : 'bg-emerald-700/90'}`}>
      {children}
    </p>
  )
}
