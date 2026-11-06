import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GuestOnly, RequireAdmin, RequireProfile, RequireSession } from './components/routing'
import AccountPage from './pages/AccountPage'
import AuthPage from './pages/AuthPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages'
import BrowsePage from './pages/BrowsePage'
import ProfilesPage from './pages/ProfilesPage'

// Lazy chunks: the player (Shaka) and the admin area (antd) are only downloaded when opened.
const WatchPage = lazy(() => import('./pages/WatchPage'))
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <Routes>
          <Route path="/" element={<Navigate to="/browse" replace />} />
          <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
          <Route path="/signup" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
          {/* Open to everyone: the reset link must work even if this browser is signed in to another account. */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/profiles" element={<RequireSession><ProfilesPage /></RequireSession>} />
          <Route path="/account" element={<RequireSession><AccountPage /></RequireSession>} />
          <Route path="/browse" element={<RequireProfile><BrowsePage /></RequireProfile>} />
          <Route path="/watch/:titleId" element={<RequireProfile><WatchPage /></RequireProfile>} />
          {/* Admin accounts only (identity.Account.IsAdmin), never on a Kids profile. */}
          <Route path="/admin/*" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/browse" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
