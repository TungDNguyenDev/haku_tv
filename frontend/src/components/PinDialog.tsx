import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

/** Four-digit PIN field: one input (paste, autofill and screen readers work), drawn as four boxes. */
export function PinInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative mx-auto w-fit" onClick={() => ref.current?.focus()}>
      <div className="flex gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid size-14 place-items-center rounded border-2 text-2xl font-bold md:size-16 ${
              i === value.length ? 'border-white' : 'border-white/40'
            }`}
          >
            {value[i] ? '•' : ''}
          </span>
        ))}
      </div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label="Mã PIN 4 số"
        className="absolute inset-0 cursor-default opacity-0"
      />
    </div>
  )
}

/** Modal shell shared by the PIN prompts. Escape or a click outside closes it. */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={label} className="w-full max-w-md rounded-md bg-surface-raised p-6 text-center shadow-2xl md:p-8">
        {children}
      </div>
    </div>
  )
}

/** "Enter your PIN" when picking a locked profile. Submits automatically on the 4th digit. */
export function PinPrompt({
  profileName,
  error,
  busy,
  onSubmit,
  onClose,
}: {
  profileName: string
  error: string | null
  busy: boolean
  onSubmit: (pin: string) => void
  onClose: () => void
}) {
  const [pin, setPin] = useState('')

  const change = (value: string) => {
    setPin(value)
    if (value.length === 4) onSubmit(value)
  }

  // A failed attempt clears the boxes for the next try.
  const [shownError, setShownError] = useState(error)
  if (error !== shownError) {
    setShownError(error)
    if (error) setPin('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pin.length === 4) onSubmit(pin)
  }

  return (
    <Dialog label={`Mã PIN của hồ sơ ${profileName}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="text-sm text-muted">Hồ sơ đã khóa</p>
        <h2 className="mt-1 mb-6 text-2xl font-bold">Nhập mã PIN để vào hồ sơ {profileName}</h2>
        <PinInput value={pin} onChange={change} autoFocus />
        <p role="alert" className="mt-5 min-h-5 text-sm text-amber-400">
          {busy ? <span className="text-muted">Đang kiểm tra…</span> : error}
        </p>
        <button type="button" onClick={onClose} className="mt-4 text-sm text-muted hover:text-white">
          Hủy
        </button>
      </form>
    </Dialog>
  )
}
