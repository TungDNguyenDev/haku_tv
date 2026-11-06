import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import BrowsePage from './pages/BrowsePage'

// Lazy chunks: the player (Shaka) and the admin area (antd) are only downloaded when opened.
const WatchPage = lazy(() => import('./pages/WatchPage'))
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <Routes>
          <Route path="/" element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/watch/:titleId" element={<WatchPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
