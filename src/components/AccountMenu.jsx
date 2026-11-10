
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

  const toggleTheme = () => {
    setThemePreference(themePreference === 'light' ? 'dark' : 'light')
  }

  return (
    <details ref={menuRef} className="network-account-menu">
      <summary className={`network-nav-link${active ? ' is-active' : ''}`} aria-label="Account settings">
        <Settings2 size={15} aria-hidden="true" />
        Account
        <ChevronDown size={14} aria-hidden="true" />
      </summary>

      <div className="network-account-menu-popover">
        <Link className={profileActive ? 'is-active' : ''} to="/app/profile">
          <Settings2 size={14} aria-hidden="true" />
          Profile settings
        </Link>

        <Link className={privacyActive ? 'is-active' : ''} to="/app/privacy">
          <Shield size={14} aria-hidden="true" />
          Privacy &amp; blocked accounts
        </Link>

        <Link className={bookmarksActive ? 'is-active' : ''} to="/app/bookmarks">
          <Bookmark size={14} aria-hidden="true" />
          Saved
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
          {themePreference === 'light' ? 'Dark Theme' : 'Light Theme'}
        </button>

        <button type="button" onClick={onSignOut} disabled={signingOut}>
          <LogOut size={14} aria-hidden="true" />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </details>
  )
}

export default AccountMenu

