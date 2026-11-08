import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './context/useAuth.js'
import TermsPage from './pages/TermsPage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import './App.css'

const AuthRoutes = lazy(() => import('./pages/AuthRoutes.jsx'))

function AccountAccess() {
  return (
    <Suspense fallback={<div className="auth-loading" role="status">Loading account access…</div>}>
      <AuthRoutes />
    </Suspense>
  )
}

function HomeRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="auth-loading" role="status">Checking your session…</div>
  }

  return user ? <Navigate to="/app" replace /> : <LandingPage />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthProvider><HomeRoute /></AuthProvider>} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/login" element={<AccountAccess />} />
      <Route path="/signup" element={<AccountAccess />} />
      <Route path="/forgot-password" element={<AccountAccess />} />
      <Route path="/reset-password" element={<AccountAccess />} />
      <Route path="/profile/:username" element={<AccountAccess />} />
      <Route path="/hashtag/:tag" element={<AccountAccess />} />
      <Route path="/app" element={<AccountAccess />} />
      <Route path="/app/messages/:conversationId" element={<AccountAccess />} />
      <Route path="/app/*" element={<AccountAccess />} />
      <Route path="/admin/*" element={<AccountAccess />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
