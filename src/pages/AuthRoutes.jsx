import { LoaderCircle } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext.jsx'
import { useAuth } from '../context/useAuth.js'
import AdminRoutes from './AdminRoutes.jsx'
import AuthPage from './AuthPage.jsx'
import MemberPage from './MemberPage.jsx'
import ExplorePage from './ExplorePage.jsx'
import NetworkPage from './NetworkPage.jsx'
import ProfileSettingsPage from './ProfileSettingsPage.jsx'
import BookmarksPage from './BookmarksPage.jsx'
import PrivacyPage from './PrivacyPage.jsx'
import PublicProfilePage from './PublicProfilePage.jsx'
import HashtagPage from './HashtagPage.jsx'
import PresenceTracker from '../components/PresenceTracker.jsx'
import FloatingChatDock from '../components/FloatingChatDock.jsx'
import { CallProvider } from '../components/CallProvider.jsx'
import CallOverlay from '../components/CallOverlay.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth-loading" role="status">
        <LoaderCircle size={22} className="spinner" aria-hidden="true" />
        Checking your sessionÃ¢â‚¬Â¦
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function AuthRoutes() {
  const { pathname } = useLocation()
  const memberPage = pathname.startsWith('/profile/')
    ? <PublicProfilePage />
    : pathname.startsWith('/hashtag/')
      ? <HashtagPage />
    : pathname === '/app'
      ? <MemberPage />
      : pathname === '/app/explore'
      ? <ExplorePage />
      : pathname === '/app/profile'
      ? <ProfileSettingsPage />
      : pathname === '/app/bookmarks'
        ? <BookmarksPage />
        : pathname === '/app/privacy'
          ? <PrivacyPage />
          : <NetworkPage />
  const page = pathname.startsWith('/profile/') || pathname.startsWith('/hashtag/')
    ? memberPage
    : pathname.startsWith('/app')
      ? <ProtectedRoute>{memberPage}</ProtectedRoute>
    : pathname.startsWith('/admin')
      ? <AdminRoutes />
    : ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname)
      ? <AuthPage />
      : <Navigate to="/" replace />

  const showFloatingChatDock =
    pathname.startsWith('/app') ||
    pathname.startsWith('/profile/') ||
    pathname.startsWith('/hashtag/')
  return (
    <AuthProvider>
      <CallProvider>
        <PresenceTracker />
        {showFloatingChatDock && <FloatingChatDock />}
        {page}
        <CallOverlay />
      </CallProvider>
    </AuthProvider>
  )
}

export default AuthRoutes

