import { LoaderCircle } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext.jsx'
import { useAuth } from '../context/useAuth.js'
import AdminRoutes from './AdminRoutes.jsx'
import AuthPage from './AuthPage.jsx'
import MemberPage from './MemberPage.jsx'

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth-loading" role="status">
        <LoaderCircle size={22} className="spinner" aria-hidden="true" />
        Checking your session…
      </div>
    )
  }

  return user ? <MemberPage /> : <Navigate to="/login" replace />
}

function AuthRoutes() {
  const { pathname } = useLocation()
  const page = pathname === '/app'
    ? <ProtectedRoute />
    : pathname.startsWith('/admin')
      ? <AdminRoutes />
    : ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname)
      ? <AuthPage />
      : <Navigate to="/" replace />

  return (
    <AuthProvider>
      {page}
    </AuthProvider>
  )
}

export default AuthRoutes
