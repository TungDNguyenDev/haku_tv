import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '../app/hooks'
import { selectCanAdmin } from '../features/auth/authSlice'

const REPO_URL = 'https://github.com/TungDNguyenDev/haku_tv'
const YEAR = new Date().getFullYear()

/*
  Footer in the usual streaming-site layout: a full-width black band (separated from the #141414 page by its colour
  and a hairline border) holding a centred block of small grey links in four columns, the data source credit and the
  copyright line. TMDB's API terms ask apps to credit TMDB and to state that the app is not endorsed by them; the
  credit uses TMDB's brand colours but stays less prominent than our own logo.
  The "back to top" control is a floating button (BackToTop), shown once the page is scrolled.
*/
export default function AppFooter() {
  const canAdmin = useAppSelector(selectCanAdmin)
  const signedIn = useAppSelector((s) => s.auth.status === 'authenticated')

  return (
    <footer className="mt-16 w-full border-t border-white/10 bg-black text-[13px] text-[#808080]">
      <div className="mx-auto w-full max-w-[1000px] px-4 pt-12 pb-10 md:px-12">
        <div className="mb-6 flex items-center gap-5">
          <IconLink href={REPO_URL} label="Mã nguồn trên GitHub">
            <GitHubIcon />
          </IconLink>
          <IconLink href="https://www.themoviedb.org/" label="The Movie Database (TMDB)">
            <FilmIcon />
          </IconLink>
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-4">
          {signedIn && <FooterLink to="/browse">Trang chủ</FooterLink>}
          {signedIn && <FooterLink to="/account">Tài khoản</FooterLink>}
          {signedIn && <FooterLink to="/profiles?manage">Quản lý hồ sơ</FooterLink>}
          {signedIn && <FooterLink to="/profiles">Đổi hồ sơ</FooterLink>}
          <FooterLink href={REPO_URL}>Mã nguồn dự án</FooterLink>
          <FooterLink href="https://www.themoviedb.org/">Dữ liệu phim từ TMDB</FooterLink>
          <FooterLink href="https://www.themoviedb.org/api-terms-of-use">Điều khoản TMDB API</FooterLink>
          {import.meta.env.DEV && <FooterLink href="http://localhost:5080/swagger">Tài liệu API (Swagger)</FooterLink>}
          {canAdmin && <FooterLink to="/admin">Trang quản trị</FooterLink>}
        </ul>

        <div className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-2">
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" aria-label="TMDB" className="shrink-0">
            <TmdbBadge />
          </a>
          <p className="max-w-xl leading-relaxed">
            Thông tin phim và hình ảnh lấy từ TMDB. Sản phẩm này sử dụng TMDB API nhưng không được TMDB xác nhận hay chứng nhận.
          </p>
        </div>

        <p className="mt-8 border-t border-white/10 pt-5 text-xs">© {YEAR} HakuTV · Dự án học tập cá nhân, phi thương mại.</p>
      </div>
      <BackToTop />
    </footer>
  )
}

/** Floating "back to top" button, bottom-right; appears after scrolling about one screen down. */
function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      aria-label="Lên đầu trang"
      title="Lên đầu trang"
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed right-5 bottom-5 z-40 grid size-11 place-items-center rounded-full border border-white/20 bg-black/80 text-white shadow-lg shadow-black/60 backdrop-blur transition duration-300 hover:bg-brand hover:border-brand md:right-8 md:bottom-8 md:size-12 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function FooterLink({ to, href, children }: { to?: string; href?: string; children: ReactNode }) {
  const className = 'hover:text-white hover:underline'
  return (
    <li>
      {to ? (
        <Link to={to} className={className}>
          {children}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className={className}>
          {children}
        </a>
      )}
    </li>
  )
}

function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="text-white/75 hover:text-white">
      {children}
    </a>
  )
}

/** TMDB credit in their brand colours (green → blue gradient, dark navy text). */
function TmdbBadge() {
  return (
    <svg viewBox="0 0 92 24" className="h-5 w-auto" aria-hidden="true">
      <defs>
        <linearGradient id="tmdb-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#90cea1" />
          <stop offset="0.56" stopColor="#3cbec9" />
          <stop offset="1" stopColor="#00b3e5" />
        </linearGradient>
      </defs>
      <rect width="92" height="24" rx="12" fill="url(#tmdb-gradient)" />
      <text x="46" y="16.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0d253f" fontFamily="Arial, sans-serif" letterSpacing="1">
        TMDB
      </text>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  )
}

function FilmIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
  )
}
