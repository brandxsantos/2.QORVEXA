import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import './App.css'

const AuthRoutes = lazy(() => import('./pages/AuthRoutes.jsx'))

function AccountAccess() {
  return (
    <Suspense fallback={<div className="auth-loading" role="status">Loading account access…</div>}>
      <AuthRoutes />
    </Suspense>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AccountAccess />} />
      <Route path="/signup" element={<AccountAccess />} />
      <Route path="/forgot-password" element={<AccountAccess />} />
      <Route path="/reset-password" element={<AccountAccess />} />
      <Route path="/app" element={<AccountAccess />} />
      <Route path="/app/*" element={<AccountAccess />} />
      <Route path="/admin/*" element={<AccountAccess />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
