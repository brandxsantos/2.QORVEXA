
import { Bookmark, ChevronDown, LogOut, Settings2, Shield } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

function AccountMenu({ onSignOut, signingOut }) {
  const { pathname } = useLocation()
  const profileActive = pathname === '/app/profile'
  const privacyActive = pathname === '/app/privacy'
  const bookmarksActive = pathname === '/app/bookmarks'
  const active = profileActive || privacyActive || bookmarksActive

  return (
    <details className="network-account-menu">
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

        <button type="button" onClick={onSignOut} disabled={signingOut}>
          <LogOut size={14} aria-hidden="true" />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </details>
  )
}

export default AccountMenu
