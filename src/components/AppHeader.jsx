import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Compass,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Rss,
  Settings2,
  Shield,
  Sun,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import BrandMark from './BrandMark.jsx'
import AccountMenu from './AccountMenu.jsx'
import { useAuth } from '../context/useAuth.js'
import { useNotifications } from '../context/useNotifications.js'
import { useTheme } from '../context/ThemeContext.jsx'
import { getSupabaseClient } from '../lib/supabase.js'
import './AppHeader.css'

export function AppHeader({
  activeSection,
  username: propUsername,
  unreadMessageCount: propUnreadMessageCount,
  onSignOut,
  signingOut: propSigningOut,
  className = '',
}) {
  const { user } = useAuth()
  const { unreadNotificationCount = 0 } = useNotifications()
  const { themePreference, setThemePreference } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [internalUsername, setInternalUsername] = useState('')
  const [internalUnreadMessages, setInternalUnreadMessages] = useState(0)
  const [internalSigningOut, setInternalSigningOut] = useState(false)

  const effectiveUsername = propUsername || internalUsername || ''
  const effectiveUnreadMessages =
    typeof propUnreadMessageCount === 'number'
      ? propUnreadMessageCount
      : internalUnreadMessages
  const effectiveSigningOut =
    typeof propSigningOut === 'boolean'
      ? propSigningOut
      : internalSigningOut

  // 1. Fetch username for profile navigation if not provided
  useEffect(() => {
    if (propUsername || !user?.id) return
    let active = true

    getSupabaseClient()
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.username) {
          setInternalUsername(data.username)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [propUsername, user?.id])

  // 2. Fetch unread message count if not explicitly provided
  useEffect(() => {
    if (typeof propUnreadMessageCount === 'number' || !user?.id) return
    let active = true

    async function loadUnreadCount() {
      try {
        const { data } = await getSupabaseClient()
          .from('conversation_participants')
          .select('unread_count')
          .eq('user_id', user.id)

        if (active && data) {
          const total = data.reduce(
            (sum, item) => sum + Number(item.unread_count || 0),
            0
          )
          setInternalUnreadMessages(total)
        }
      } catch {
        // Suppress background query errors
      }
    }

    loadUnreadCount()
    return () => {
      active = false
    }
  }, [propUnreadMessageCount, user?.id])

  // 3. Automatically close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // 4. Handle Escape key & body scroll lock when drawer is open
  useEffect(() => {
    if (!drawerOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerOpen])

  // 5. Unified Sign Out handler
  const handleSignOut = async () => {
    if (onSignOut) {
      return onSignOut()
    }
    setInternalSigningOut(true)
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut()
      if (signOutError) throw signOutError
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setInternalSigningOut(false)
    }
  }

  // 6. Theme switcher handler
  const toggleTheme = () => {
    setThemePreference(themePreference === 'light' ? 'dark' : 'light')
  }

  // Active state matching
  const pathname = location.pathname
  const isFeedActive = activeSection === 'feed' || pathname === '/app'
  const isExploreActive = activeSection === 'explore' || pathname === '/app/explore'
  const isDiscoverActive = activeSection === 'discover' || pathname === '/app/discover'
  const isFriendsActive = activeSection === 'friends' || pathname === '/app/friends'
  const isNotificationsActive = activeSection === 'notifications' || pathname === '/app/notifications'
  const isMessagesActive = activeSection === 'messages' || pathname === '/app/messages'
  const isProfileActive =
    activeSection === 'profile' ||
    (effectiveUsername && pathname === `/profile/${encodeURIComponent(effectiveUsername)}`)
  const isAccountActive =
    activeSection === 'account' ||
    pathname === '/app/profile' ||
    pathname === '/app/privacy' ||
    pathname === '/app/bookmarks'

  const profilePath = effectiveUsername
    ? `/profile/${encodeURIComponent(effectiveUsername)}`
    : '/app/profile'

  return (
    <header className={`app-header member-header member-feed-header ${className}`.trim()}>
      <div className="app-header-container">
        {/* BRAND MARK */}
        <div className="app-header-left">
          <Link
            className="brand-link app-header-brand"
            to={user ? '/app' : '/'}
            aria-label={user ? 'QORVEXA feed' : 'QORVEXA home'}
            onClick={() => setDrawerOpen(false)}
          >
            <BrandMark />
          </Link>
        </div>

        {/* DESKTOP COMMUNITY NAVIGATION */}
        {user ? (
          <nav className="network-nav app-header-desktop-nav" aria-label="Community navigation">
            <Link
              to="/app"
              className={`network-nav-link${isFeedActive ? ' is-active' : ''}`}
              aria-current={isFeedActive ? 'page' : undefined}
              aria-label="Feed"
              title="Feed"
            >
              <Rss size={15} aria-hidden="true" />
              <span>Feed</span>
            </Link>

            <Link
              to="/app/explore"
              className={`network-nav-link${isExploreActive ? ' is-active' : ''}`}
              aria-current={isExploreActive ? 'page' : undefined}
              aria-label="Explore"
              title="Explore"
            >
              <Compass size={15} aria-hidden="true" />
              <span>Explore</span>
            </Link>

            <Link
              to="/app/discover"
              className={`network-nav-link${isDiscoverActive ? ' is-active' : ''}`}
              aria-current={isDiscoverActive ? 'page' : undefined}
              aria-label="Discover"
              title="Discover"
            >
              <UserPlus size={15} aria-hidden="true" />
              <span>Discover</span>
            </Link>

            <Link
              to="/app/friends"
              className={`network-nav-link${isFriendsActive ? ' is-active' : ''}`}
              aria-current={isFriendsActive ? 'page' : undefined}
              aria-label="Friends"
              title="Friends"
            >
              <Users size={15} aria-hidden="true" />
              <span>Friends</span>
            </Link>

            <Link
              to="/app/notifications"
              className={`network-nav-link${isNotificationsActive ? ' is-active' : ''}`}
              aria-current={isNotificationsActive ? 'page' : undefined}
              aria-label={
                unreadNotificationCount > 0
                  ? `Notifications (${unreadNotificationCount} unread)`
                  : 'Notifications'
              }
              title="Notifications"
            >
              <Bell size={15} aria-hidden="true" />
              <span>Notifications</span>
              {unreadNotificationCount > 0 && (
                <span className="network-badge">{unreadNotificationCount}</span>
              )}
            </Link>

            <Link
              to="/app/messages"
              className={`network-nav-link${isMessagesActive ? ' is-active' : ''}`}
              aria-current={isMessagesActive ? 'page' : undefined}
              aria-label={
                effectiveUnreadMessages > 0
                  ? `Messages (${effectiveUnreadMessages} unread)`
                  : 'Messages'
              }
              title="Messages"
            >
              <MessageCircle size={15} aria-hidden="true" />
              <span>Messages</span>
              {effectiveUnreadMessages > 0 && (
                <span className="network-badge">{effectiveUnreadMessages}</span>
              )}
            </Link>

            {effectiveUsername && (
              <Link
                to={profilePath}
                className={`network-nav-link${isProfileActive ? ' is-active' : ''}`}
                aria-current={isProfileActive ? 'page' : undefined}
                aria-label="My profile"
                title="My profile"
              >
                <UserRound size={15} aria-hidden="true" />
                <span>My profile</span>
              </Link>
            )}

            <AccountMenu onSignOut={handleSignOut} signingOut={effectiveSigningOut} />
          </nav>
        ) : (
          <nav className="network-nav app-header-desktop-nav" aria-label="Community navigation">
            <Link to="/" className="network-nav-link" aria-label="Home" title="Home">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Home</span>
            </Link>
            <Link to="/login" className="network-nav-link">Sign in</Link>
            <Link to="/signup" className="network-nav-link app-header-signup-btn">Join QORVEXA</Link>
            <button
              type="button"
              className="network-nav-link app-header-theme-btn"
              onClick={toggleTheme}
              aria-label={themePreference === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              title={themePreference === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {themePreference === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
            </button>
          </nav>
        )}

        {/* MOBILE CONTROLS */}
        <div className="app-header-mobile-bar">
          {user && (unreadNotificationCount > 0 || effectiveUnreadMessages > 0) && (
            <div className="app-header-mobile-indicators">
              {unreadNotificationCount > 0 && (
                <Link
                  to="/app/notifications"
                  className="app-header-mobile-icon-btn"
                  aria-label={`Notifications (${unreadNotificationCount} unread)`}
                >
                  <Bell size={18} aria-hidden="true" />
                  <span className="network-badge">{unreadNotificationCount}</span>
                </Link>
              )}
              {effectiveUnreadMessages > 0 && (
                <Link
                  to="/app/messages"
                  className="app-header-mobile-icon-btn"
                  aria-label={`Messages (${effectiveUnreadMessages} unread)`}
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  <span className="network-badge">{effectiveUnreadMessages}</span>
                </Link>
              )}
            </div>
          )}

          <button
            type="button"
            className="app-header-drawer-toggle"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={drawerOpen}
            aria-controls="app-header-mobile-drawer"
          >
            {drawerOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* MOBILE NAVIGATION DRAWER */}
      {drawerOpen && (
        <div className="app-header-drawer-wrapper" id="app-header-mobile-drawer">
          <div
            className="app-header-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="app-header-drawer-panel" aria-label="Mobile navigation">
            <div className="app-header-drawer-header">
              <Link
                className="brand-link"
                to={user ? '/app' : '/'}
                onClick={() => setDrawerOpen(false)}
                aria-label="QORVEXA"
              >
                <BrandMark />
              </Link>
              <button
                type="button"
                className="app-header-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="app-header-drawer-scroll">
              {user ? (
                <>
                  <div className="app-header-drawer-section">
                    <span className="app-header-drawer-label">COMMUNITY</span>
                    <nav className="app-header-drawer-links">
                      <Link
                        to="/app"
                        className={`app-header-drawer-link${isFeedActive ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Rss size={18} aria-hidden="true" />
                        <span>Feed</span>
                      </Link>
                      <Link
                        to="/app/explore"
                        className={`app-header-drawer-link${isExploreActive ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Compass size={18} aria-hidden="true" />
                        <span>Explore</span>
                      </Link>
                      <Link
                        to="/app/discover"
                        className={`app-header-drawer-link${isDiscoverActive ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <UserPlus size={18} aria-hidden="true" />
                        <span>Discover</span>
                      </Link>
                      <Link
                        to="/app/friends"
                        className={`app-header-drawer-link${isFriendsActive ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Users size={18} aria-hidden="true" />
                        <span>Friends</span>
                      </Link>
                      <Link
                        to="/app/notifications"
                        className={`app-header-drawer-link${isNotificationsActive ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Bell size={18} aria-hidden="true" />
                        <span>Notifications</span>
                        {unreadNotificationCount > 0 && (
                          <span className="network-badge">{unreadNotificationCount}</span>
                        )}
                      </Link>
                      <Link
                        to="/app/messages"
                        className={`app-header-drawer-link${isMessagesActive ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <MessageCircle size={18} aria-hidden="true" />
                        <span>Messages</span>
                        {effectiveUnreadMessages > 0 && (
                          <span className="network-badge">{effectiveUnreadMessages}</span>
                        )}
                      </Link>
                      {effectiveUsername && (
                        <Link
                          to={profilePath}
                          className={`app-header-drawer-link${isProfileActive ? ' is-active' : ''}`}
                          onClick={() => setDrawerOpen(false)}
                        >
                          <UserRound size={18} aria-hidden="true" />
                          <span>My profile</span>
                        </Link>
                      )}
                    </nav>
                  </div>

                  <div className="app-header-drawer-section">
                    <span className="app-header-drawer-label">ACCOUNT</span>
                    <nav className="app-header-drawer-links">
                      <Link
                        to="/app/profile"
                        className={`app-header-drawer-link${pathname === '/app/profile' ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Settings2 size={18} aria-hidden="true" />
                        <span>Profile settings</span>
                      </Link>
                      <Link
                        to="/app/privacy"
                        className={`app-header-drawer-link${pathname === '/app/privacy' ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Shield size={18} aria-hidden="true" />
                        <span>Privacy &amp; blocked</span>
                      </Link>
                      <Link
                        to="/app/bookmarks"
                        className={`app-header-drawer-link${pathname === '/app/bookmarks' ? ' is-active' : ''}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Bookmark size={18} aria-hidden="true" />
                        <span>Saved posts</span>
                      </Link>
                    </nav>
                  </div>

                  <div className="app-header-drawer-footer">
                    <button
                      type="button"
                      className="app-header-drawer-action"
                      onClick={toggleTheme}
                    >
                      {themePreference === 'light' ? (
                        <>
                          <Moon size={18} aria-hidden="true" />
                          <span>Dark Theme</span>
                        </>
                      ) : (
                        <>
                          <Sun size={18} aria-hidden="true" />
                          <span>Light Theme</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className="app-header-drawer-action app-header-drawer-signout"
                      onClick={() => {
                        setDrawerOpen(false)
                        handleSignOut()
                      }}
                      disabled={effectiveSigningOut}
                    >
                      <LogOut size={18} aria-hidden="true" />
                      <span>{effectiveSigningOut ? 'Signing out...' : 'Sign out'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="app-header-drawer-section">
                  <span className="app-header-drawer-label">GET STARTED</span>
                  <nav className="app-header-drawer-links">
                    <Link
                      to="/"
                      className="app-header-drawer-link"
                      onClick={() => setDrawerOpen(false)}
                    >
                      <ArrowLeft size={18} aria-hidden="true" />
                      <span>Home</span>
                    </Link>
                    <Link
                      to="/login"
                      className="app-header-drawer-link"
                      onClick={() => setDrawerOpen(false)}
                    >
                      <span>Sign in</span>
                    </Link>
                    <Link
                      to="/signup"
                      className="app-header-drawer-link is-active"
                      onClick={() => setDrawerOpen(false)}
                    >
                      <span>Join QORVEXA</span>
                    </Link>
                  </nav>

                  <div className="app-header-drawer-footer" style={{ marginTop: '2rem' }}>
                    <button
                      type="button"
                      className="app-header-drawer-action"
                      onClick={toggleTheme}
                    >
                      {themePreference === 'light' ? (
                        <>
                          <Moon size={18} aria-hidden="true" />
                          <span>Dark Theme</span>
                        </>
                      ) : (
                        <>
                          <Sun size={18} aria-hidden="true" />
                          <span>Light Theme</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </header>
  )
}

export default AppHeader
