import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { logoutRequested } from '../features/auth/authSlice'
import { profileSelectRequested, profilesRequested } from '../features/profiles/profilesSlice'
import Avatar from './Avatar'
import { ChevronDownIcon } from './icons'

// Transparent over the hero, solid once the page scrolls. Right side: the profile menu (switch, manage, sign out).
export default function AppHeader() {
  const [scrolled, setScrolled] = useState(false)
  const profile = useAppSelector((s) => s.auth.profile)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-500 ${
        scrolled ? 'bg-surface' : 'bg-linear-to-b from-black/70 to-transparent'
      }`}
    >
      <div className="flex h-16 items-center gap-8 px-4 md:h-[68px] md:px-12">
        <Link to="/browse" className="text-2xl font-black tracking-tight text-brand md:text-3xl">
          HAKUTV
        </Link>
        <nav className="flex gap-5 text-sm">
          <NavLink to="/browse" className={({ isActive }) => (isActive ? 'font-semibold text-white' : 'text-muted hover:text-white')}>
            Trang chủ
          </NavLink>
        </nav>
        {profile?.isKids && (
          <span className="rounded-full bg-sky-500/90 px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase">Trẻ em</span>
        )}
        <div className="ml-auto">{profile && <ProfileMenu />}</div>
      </div>
    </header>
  )
}

function ProfileMenu() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const profile = useAppSelector((s) => s.auth.profile)!
  const { items, selectingId } = useAppSelector((s) => s.profiles)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  // Load the list once for the switcher.
  useEffect(() => {
    if (items.length === 0) dispatch(profilesRequested())
  }, [items.length, dispatch])

  // Close on outside click / Escape (the menu also opens on hover, like the usual streaming headers).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const others = items.filter((p) => p.profileId !== profile.profileId)

  return (
    <div
      ref={root}
      className="relative"
      onMouseEnter={() => {
        window.clearTimeout(closeTimer.current)
        setOpen(true)
      }}
      onMouseLeave={() => {
        closeTimer.current = window.setTimeout(() => setOpen(false), 250)
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // Open only: with a mouse, hovering already opened it and a toggle would close it again on the same gesture.
        // It closes on mouse leave, outside click or Escape (touch screens: tap elsewhere).
        onClick={() => setOpen(true)}
        className="flex items-center gap-2"
      >
        <Avatar avatarKey={profile.avatarKey} className="size-8 text-[8px]" />
        <ChevronDownIcon className={`size-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute top-full right-0 mt-3 w-60 rounded-sm border border-white/15 bg-black/95 py-3 text-sm shadow-xl">
          <p className="truncate px-4 pb-3 text-xs text-muted">
            Đang xem: <span className="font-semibold text-white">{profile.name}</span>
          </p>
          {others.map((p) => (
            <button
              key={p.profileId}
              type="button"
              role="menuitem"
              disabled={selectingId !== null}
              onClick={() => {
                setOpen(false)
                dispatch(profileSelectRequested(p.profileId))
              }}
              className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:underline"
            >
              <Avatar avatarKey={p.avatarKey} className="size-8 text-[8px]" />
              <span className="truncate">{p.name}</span>
              {selectingId === p.profileId && <span className="ml-auto size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => navigate('/profiles?manage')}
            className="mt-2 block w-full px-4 py-1.5 text-left hover:underline"
          >
            Quản lý hồ sơ
          </button>
          <Link to="/admin" role="menuitem" className="block px-4 py-1.5 hover:underline">
            Trang quản trị
          </Link>
          <hr className="my-2 border-white/15" />
          <button
            type="button"
            role="menuitem"
            onClick={() => dispatch(logoutRequested())}
            className="block w-full px-4 py-1.5 text-center hover:underline"
          >
            Đăng xuất khỏi HakuTV
          </button>
        </div>
      )}
    </div>
  )
}
