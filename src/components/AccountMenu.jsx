import { useRef, useEffect } from 'react'
import { Bookmark, ChevronDown, LogOut, Moon, Settings2, Shield, Sun } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext.jsx'

function AccountMenu({ onSignOut, signingOut, menuRef }) {
  const { pathname } = useLocation()
  const { themePreference, setThemePreference } = useTheme()
  const profileActive = pathname === '/app/profile'
  const privacyActive = pathname === '/app/privacy'
  const bookmarksActive = pathname === '/app/bookmarks'
  const active = profileActive || privacyActive || bookmarksActive

  const internalRef = useRef(null)
  const setRef = (node) => {
    internalRef.current = node
    if (typeof menuRef === 'function') menuRef(node)
    else if (menuRef) menuRef.current = node
  }

  const closeMenu = () => {
    if (internalRef.current) {
      internalRef.current.removeAttribute('open')
    }
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        internalRef.current &&
        internalRef.current.open &&
        !internalRef.current.contains(event.target)
      ) {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [])

  // Close menu on route change
  useEffect(() => {
    closeMenu()
  }, [pathname])

  const toggleTheme = () => {
    setThemePreference(themePreference === 'light' ? 'dark' : 'light')
  }

  return (
    <details ref={setRef} className="network-account-menu">
      <summary
        className={`network-nav-link${active ? ' is-active' : ''}`}
        aria-label="Account settings"
        title="Account settings"
      >
        <Settings2 size={15} aria-hidden="true" />
        <span>Account</span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>

      <div className="network-account-menu-popover">
        <Link
          className={profileActive ? 'is-active' : ''}
          to="/app/profile"
          onClick={closeMenu}
        >
          <Settings2 size={14} aria-hidden="true" />
          <span>Profile settings</span>
        </Link>

        <Link
          className={privacyActive ? 'is-active' : ''}
          to="/app/privacy"
          onClick={closeMenu}
        >
          <Shield size={14} aria-hidden="true" />
          <span>Privacy &amp; blocked accounts</span>
        </Link>

        <Link
          className={bookmarksActive ? 'is-active' : ''}
          to="/app/bookmarks"
          onClick={closeMenu}
        >
          <Bookmark size={14} aria-hidden="true" />
          <span>Saved</span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={themePreference === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {themePreference === 'light' ? (
            <Moon size={14} aria-hidden="true" />
          ) : (
            <Sun size={14} aria-hidden="true" />
          )}
          <span>{themePreference === 'light' ? 'Dark Theme' : 'Light Theme'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeMenu()
            if (onSignOut) onSignOut()
          }}
          disabled={signingOut}
        >
          <LogOut size={14} aria-hidden="true" />
          <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
        </button>
      </div>
    </details>
  )
}

export default AccountMenu
