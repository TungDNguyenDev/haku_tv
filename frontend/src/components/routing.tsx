import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '../app/hooks'
import { selectCanAdmin } from '../features/auth/authSlice'

/*
  Route guards. The order of the gates mirrors the product flow:
    anonymous → /login   →   signed in, no profile → /profiles   →   profile chosen → /browse, /watch
  While the session is being restored from the refresh cookie (page reload), a splash screen is shown instead of
  flashing the login page.
*/

export function SplashScreen() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-surface">
      <div className="flex flex-col items-center gap-6">
        <span className="text-4xl font-black tracking-tight text-brand">HAKUTV</span>
        <div className="size-10 animate-spin rounded-full border-4 border-white/15 border-t-brand" />
      </div>
    </div>
  )
}

/** Signed-in pages (profile picker). */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status)
  const location = useLocation()
  if (status === 'unknown') return <SplashScreen />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

/** Pages that need a chosen profile (browse, watch). */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { status, profile } = useAppSelector((s) => s.auth)
  const location = useLocation()
  if (status === 'unknown') return <SplashScreen />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!profile) return <Navigate to="/profiles" replace state={{ from: location.pathname + location.search }} />
  return children
}

/**
 * Admin area: admin accounts only, and not while a Kids profile is active. Hiding the link is only cosmetic;
 * the real check is the API's "Admin" policy on every admin endpoint (Phase 8).
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status)
  const canAdmin = useAppSelector(selectCanAdmin)
  const location = useLocation()
  if (status === 'unknown') return <SplashScreen />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!canAdmin) return <Navigate to="/browse" replace />
  return children
}

/** Login / sign-up: already signed in → go on to the profile picker. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status)
  const location = useLocation()
  if (status === 'unknown') return <SplashScreen />
  if (status === 'authenticated') return <Navigate to="/profiles" replace state={location.state} />
  return children
}
