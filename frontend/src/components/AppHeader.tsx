import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

// Transparent over the hero, solid once the page scrolls (same behaviour as the big streaming sites).
export default function AppHeader() {
  const [scrolled, setScrolled] = useState(false)

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
        <Link to="/admin" className="ml-auto text-xs text-muted hover:text-white">
          Admin
        </Link>
      </div>
    </header>
  )
}
