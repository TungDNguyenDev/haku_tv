import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GuestOnly, RequireProfile, RequireSession } from './components/routing'
import AuthPage from './pages/AuthPage'
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
          <Route path="/profiles" element={<RequireSession><ProfilesPage /></RequireSession>} />
          <Route path="/browse" element={<RequireProfile><BrowsePage /></RequireProfile>} />
          <Route path="/watch/:titleId" element={<RequireProfile><WatchPage /></RequireProfile>} />
          {/* Admin roles come with Phase 8; for now any signed-in account can open the placeholder. */}
          <Route path="/admin/*" element={<RequireSession><AdminPage /></RequireSession>} />
          <Route path="*" element={<Navigate to="/browse" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
