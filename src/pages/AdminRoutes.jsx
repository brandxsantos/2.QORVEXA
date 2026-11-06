import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  Database,
  Flag,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ScrollText,
  Users,
  UserRoundPlus,
  UserRoundX,
  X,
} from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'
import AdminManagementPage from './AdminManagementPage.jsx'

const tableNames = ['posts', 'comments', 'follows', 'groups', 'messages', 'stories']

function formatCount(value) {
  return Number(value).toLocaleString()
}

function formatTrendDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' })
}

function isSetupError(error) {
  return error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
}

function AdminRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [overview, setOverview] = useState(null)
  const [adminRole, setAdminRole] = useState('')
  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  const requestAdminData = useCallback(async () => {
    try {
      const client = getSupabaseClient()
      const { data: role, error: roleError } = await client.rpc('admin_get_role')
      if (roleError) return { error: roleError }
      if (!role) return { error: { code: '42501', message: 'Administrator access required.' } }
      if (!['super_admin', 'admin'].includes(role)) return { role, data: null, error: null }
      const { data, error } = await client.rpc('admin_get_overview')
      return { role, data, error }
    } catch (error) {
      return { error }
    }
  }, [])

  const applyAdminResult = useCallback(({ role, data, error }) => {
    if (error) {
      if (error.code === '42501') {
        setStatus('denied')
      } else if (error.code === 'PGRST202' || error.code === '42883') {
        setErrorMessage('Apply supabase/migrations/20261107023000_admin_management.sql in the Supabase SQL Editor, then refresh this page.')
        setStatus('management-upgrade')
      } else if (isSetupError(error)) {
        setErrorMessage(error.message)
        setStatus('setup')
      } else {
        setErrorMessage(error.message || 'The administrator overview could not be loaded.')
        setStatus('error')
      }

      return
    }

    setAdminRole(role)
    if (['super_admin', 'admin'].includes(role) && (!data?.account_metrics || !Array.isArray(data.registration_trend))) {
      setErrorMessage('Apply supabase/migrations/20261107003000_admin_dashboard_metrics.sql in the Supabase SQL Editor, then refresh this page.')
      setStatus('upgrade')
      return
    }

    if (data) setOverview(data)
    setErrorMessage('')
    setStatus('ready')
  }, [])

  useEffect(() => {
    if (!user) return undefined

    let active = true
    requestAdminData().then((result) => {
      if (active) applyAdminResult(result)
    })

    return () => {
      active = false
    }
  }, [applyAdminResult, requestAdminData, user])

  const loadOverview = useCallback(async () => {
    setStatus('loading')
    setErrorMessage('')
    applyAdminResult(await requestAdminData())
  }, [applyAdminResult, requestAdminData])

  if (loading) {
    return (
      <div className="auth-loading" role="status">
        <LoaderCircle size={22} className="spinner" aria-hidden="true" />
        Checking your session…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  async function handleSignOut() {
    setSigningOut(true)

    try {
      const { error } = await getSupabaseClient().auth.signOut()
      if (error) throw error
      navigate('/', { replace: true })
    } catch (error) {
      setErrorMessage(error.message || 'Sign out failed. Please try again.')
      setStatus(status === 'ready' ? 'ready' : 'error')
    } finally {
      setSigningOut(false)
    }
  }

  if (location.pathname === '/admin') {
    return <Navigate to="/admin/overview" replace />
  }

  const section = location.pathname.split('/')[2] || 'overview'
  if (!['overview', 'users', 'reports', 'moderation', 'audit', 'roles'].includes(section)) {
    return <Navigate to="/admin/overview" replace />
  }
  if (adminRole === 'support' && ['overview', 'moderation', 'audit', 'roles'].includes(section)) {
    return <Navigate to="/admin/reports" replace />
  }
  if (adminRole === 'moderator' && section === 'roles') return <Navigate to="/admin/users" replace />

  if (status === 'ready' && !['super_admin', 'admin'].includes(adminRole) && section === 'overview') {
    return <Navigate to={adminRole === 'support' ? '/admin/reports' : '/admin/users'} replace />
  }

  if (status === 'loading') {
    return (
      <main className="admin-loading" role="status">
        <LoaderCircle size={24} className="spinner" aria-hidden="true" />
        Verifying administrator access…
      </main>
    )
  }

  if (status === 'denied') {
    return (
      <main className="admin-access-state">
        <div className="admin-access-card">
          <div className="admin-access-icon"><Shield size={25} aria-hidden="true" /></div>
          <p className="admin-eyebrow">RESTRICTED AREA</p>
          <h1>Administrator access required.</h1>
          <p>Your signed-in account does not have an administrator role. Access was denied by Supabase.</p>
          <div className="admin-state-actions">
            <Link className="admin-button admin-button--secondary" to="/">Back to QORVEXA</Link>
            <button className="admin-button admin-button--primary" type="button" onClick={handleSignOut} disabled={signingOut}>
              <LogOut size={15} aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (status === 'setup') {
    return (
      <main className="admin-access-state">
        <div className="admin-access-card admin-setup-card">
          <div className="admin-access-icon"><Database size={25} aria-hidden="true" /></div>
          <p className="admin-eyebrow">ADMIN ACCESS NOT CONFIGURED</p>
          <h1>Secure setup is required.</h1>
          <p>The admin migrations must be applied and the owner account provisioned in the Supabase SQL Editor before this dashboard can open.</p>
          <ol className="admin-setup-list">
            <li>Apply the profile migration, then the admin security migration.</li>
            <li>Verify your account email and copy its UUID from Authentication → Users.</li>
            <li>Replace the UUID in the one-time owner bootstrap script and run it in the SQL Editor.</li>
          </ol>
          <code className="admin-setup-path">supabase/setup/bootstrap_super_admin.sql</code>
          <Link className="admin-button admin-button--secondary" to="/">Back to QORVEXA</Link>
          <details className="admin-setup-error">
            <summary>Database setup response</summary>
            <code>{errorMessage}</code>
          </details>
        </div>
      </main>
    )
  }

  if (status === 'upgrade') {
    return (
      <main className="admin-access-state">
        <div className="admin-access-card admin-setup-card">
          <div className="admin-access-icon"><Database size={25} aria-hidden="true" /></div>
          <p className="admin-eyebrow">DASHBOARD UPDATE REQUIRED</p>
          <h1>Apply the dashboard metrics migration.</h1>
          <p>The existing secure admin dashboard is still available in your database, but this version needs a small migration to add real account statistics and registration trends.</p>
          <ol className="admin-setup-list">
            <li>Open Supabase Dashboard → SQL Editor → New query.</li>
            <li>Copy and run the complete dashboard metrics migration from your QORVEXA project.</li>
            <li>Return here and refresh the page.</li>
          </ol>
          <code className="admin-setup-path">supabase/migrations/20261107003000_admin_dashboard_metrics.sql</code>
          <Link className="admin-button admin-button--secondary" to="/">Back to QORVEXA</Link>
          <details className="admin-setup-error">
            <summary>Migration requirement</summary>
            <code>{errorMessage}</code>
          </details>
        </div>
      </main>
    )
  }

  if (status === 'management-upgrade') {
    return (
      <main className="admin-access-state">
        <div className="admin-access-card admin-setup-card">
          <div className="admin-access-icon"><Database size={25} aria-hidden="true" /></div>
          <p className="admin-eyebrow">ADMIN MANAGEMENT UPDATE REQUIRED</p>
          <h1>Apply the administration migration.</h1>
          <p>This release needs the protected user management, restriction, report, and audit functions.</p>
          <code className="admin-setup-path">supabase/migrations/20261107023000_admin_management.sql</code>
          <details className="admin-setup-error"><summary>Database response</summary><code>{errorMessage}</code></details>
          <button className="admin-button admin-button--secondary" type="button" onClick={loadOverview}>Retry after migration</button>
        </div>
      </main>
    )
  }

  const sectionLabels = {
    overview: 'Overview',
    users: 'User management',
    reports: 'Reports',
    moderation: 'Content moderation',
    audit: 'Audit logs',
    roles: 'Administrator roles',
  }

  const readyTables = tableNames.filter((name) => overview?.social_tables_ready?.[name])
  const unavailableTables = tableNames.filter((name) => !overview?.social_tables_ready?.[name])
  const metrics = overview?.account_metrics
  const metricCards = [
    { label: 'TOTAL USERS', value: metrics.total_users, icon: Users, note: 'Accounts registered in Supabase Auth' },
    { label: 'VERIFIED USERS', value: metrics.verified_users, icon: BadgeCheck, note: 'Email address confirmed' },
    { label: 'UNVERIFIED USERS', value: metrics.unverified_users, icon: UserRoundX, note: 'Email confirmation pending' },
    { label: 'REGISTERED TODAY', value: metrics.registered_today, icon: UserRoundPlus, note: 'Since the start of today' },
    { label: 'LAST 7 DAYS', value: metrics.registered_last_7_days, icon: CalendarDays, note: 'New account registrations' },
    { label: 'THIS MONTH', value: metrics.registered_this_month, icon: CalendarDays, note: 'Since the start of this month' },
  ]
  const peakRegistrations = Math.max(1, ...(overview?.registration_trend || []).map((item) => Number(item.count)))

  return (
    <div className={`admin-layout${collapsed ? ' admin-layout--collapsed' : ''}${sidebarOpen ? ' admin-layout--sidebar-open' : ''}`}>
      {sidebarOpen && <button className="admin-sidebar-scrim" type="button" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className="admin-sidebar">
        <div className="admin-brand-row">
          <Link to="/admin/overview" className="admin-brand-link" aria-label="QORVEXA admin overview">
            <BrandMark compact />
            <span className="admin-brand-copy"><strong>QORVEXA</strong><small>{adminRole.replace('_', ' ').toUpperCase()}</small></span>
          </Link>
          <button className="admin-icon-button admin-collapse-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <button className="admin-icon-button admin-mobile-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close admin navigation">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-sidebar-caption">CONTROL CENTER</div>
        <nav className="admin-nav" aria-label="Administrator navigation">
          <span className="admin-nav-section">OVERVIEW</span>
          {['super_admin', 'admin'].includes(adminRole) && <Link className={`admin-nav-link${section === 'overview' ? ' admin-nav-link--active' : ''}`} to="/admin/overview" onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard size={17} aria-hidden="true" /><span>Overview</span>
          </Link>}
          <span className="admin-nav-section">COMMUNITY</span>
          <Link className={`admin-nav-link${section === 'users' ? ' admin-nav-link--active' : ''}`} to="/admin/users" onClick={() => setSidebarOpen(false)}><Users size={17} /><span>User management</span></Link>
          <Link className={`admin-nav-link${section === 'reports' ? ' admin-nav-link--active' : ''}`} to="/admin/reports" onClick={() => setSidebarOpen(false)}><Flag size={17} /><span>Reports</span></Link>
          {['super_admin', 'admin', 'moderator'].includes(adminRole) && <Link className={`admin-nav-link${section === 'moderation' ? ' admin-nav-link--active' : ''}`} to="/admin/moderation" onClick={() => setSidebarOpen(false)}><ShieldAlert size={17} /><span>Content moderation</span></Link>}
          {['super_admin', 'admin', 'moderator'].includes(adminRole) && <Link className={`admin-nav-link${section === 'audit' ? ' admin-nav-link--active' : ''}`} to="/admin/audit" onClick={() => setSidebarOpen(false)}><ScrollText size={17} /><span>Audit logs</span></Link>}
          {adminRole === 'super_admin' && <Link className={`admin-nav-link${section === 'roles' ? ' admin-nav-link--active' : ''}`} to="/admin/roles" onClick={() => setSidebarOpen(false)}><ShieldCheck size={17} /><span>Admin roles</span></Link>}
          <div className="admin-sidebar-note">
            <span className="admin-status-dot" />
            <span>Server-verified access</span>
          </div>
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-user-chip">
            <span className="admin-user-avatar">{(user.email?.[0] || 'A').toUpperCase()}</span>
            <span className="admin-user-copy"><strong>Administrator</strong><small>{user.email}</small></span>
          </div>
          <button className="admin-signout-button" type="button" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={16} aria-hidden="true" /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button className="admin-icon-button admin-mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open admin navigation">
            <Menu size={19} aria-hidden="true" />
          </button>
          <div className="admin-breadcrumb"><span>QORVEXA ADMIN</span><span>/</span><strong>{sectionLabels[section]}</strong></div>
          <div className="admin-topbar-actions">
            <span className="admin-live-status"><i /> SYSTEM ONLINE</span>
            <Link className="admin-home-link" to="/" aria-label="Return to public site"><ArrowDownToLine size={16} aria-hidden="true" /><span>Public site</span></Link>
          </div>
        </header>

        {section !== 'overview' ? <AdminManagementPage section={section} role={adminRole} userId={user.id} /> : <section className="admin-content">
          <div className="admin-page-heading">
            <div>
              <p className="admin-eyebrow"><Activity size={14} aria-hidden="true" /> PLATFORM CONTROL</p>
              <h1>Overview</h1>
              <p>Real-time view of the QORVEXA data currently configured in Supabase.</p>
            </div>
            <button className="admin-button admin-button--secondary admin-refresh-button" type="button" onClick={loadOverview} disabled={status === 'loading'}>
              <RefreshCw size={15} className={status === 'loading' ? 'spinner' : ''} aria-hidden="true" />
              Refresh data
            </button>
          </div>

          {status === 'error' && (
            <div className="admin-inline-error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div><strong>Overview unavailable</strong><span>{errorMessage}</span></div>
              <button type="button" onClick={loadOverview}>Retry</button>
            </div>
          )}

          {errorMessage && status === 'ready' && (
            <div className="admin-inline-error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div><strong>Sign-out failed</strong><span>{errorMessage}</span></div>
            </div>
          )}

          <div className="admin-stat-grid">
            {metricCards.map(({ label, value, icon: Icon, note }) => (
              <article className="admin-stat-card" key={label}>
                <div className="admin-stat-heading"><span>{label}</span><span className="admin-stat-icon"><Icon size={17} aria-hidden="true" /></span></div>
                <strong>{formatCount(value)}</strong>
                <p>{note}</p>
              </article>
            ))}
            <article className="admin-stat-card admin-stat-card--status">
              <div className="admin-stat-heading"><span>CONTENT DATA</span><span className="admin-stat-icon"><Database size={17} aria-hidden="true" /></span></div>
              <strong>{readyTables.length} <small>/ {tableNames.length} tables</small></strong>
              <p>{readyTables.length ? 'Schema tables detected' : 'Social data schema not installed'}</p>
            </article>
          </div>

          {adminRole === 'super_admin' && (
            <section className="admin-role-shortcut" aria-labelledby="admin-role-shortcut-heading">
              <span className="admin-role-shortcut-icon"><ShieldCheck size={19} aria-hidden="true" /></span>
              <div>
                <h2 id="admin-role-shortcut-heading">Administrator access</h2>
                <p>Manage staff roles and grant administrator access to other registered members.</p>
              </div>
              <Link className="admin-button admin-button--secondary" to="/admin/roles">
                <UserRoundPlus size={15} aria-hidden="true" />
                Manage admin roles
              </Link>
            </section>
          )}

          <section className="admin-registrations-card" aria-labelledby="registration-trend-heading">
            <div className="admin-section-heading">
              <div><h2 id="registration-trend-heading">Registration trend</h2><p>New Supabase Auth accounts per day over the last 7 days.</p></div>
              <span className="admin-generated-time">PROFILE ROWS: {formatCount(overview.registered_profiles)}</span>
            </div>
            <div className="admin-registration-chart" role="img" aria-label="Daily account registrations over the last seven days">
              {(overview?.registration_trend || []).map((item) => {
                const count = Number(item.count)
                const height = count === 0 ? 0 : Math.max(8, (count / peakRegistrations) * 100)
                return (
                  <div className="admin-registration-day" key={item.date} aria-label={`${formatTrendDate(item.date)}: ${formatCount(count)} registrations`}>
                    <span className="admin-registration-count">{formatCount(count)}</span>
                    <div className="admin-registration-track"><span style={{ height: `${height}%` }} /></div>
                    <span className="admin-registration-label">{formatTrendDate(item.date)}</span>
                  </div>
                )
              })}
            </div>
            <p className="admin-readiness-footnote"><ShieldCheck size={16} aria-hidden="true" /> Account statistics are calculated in PostgreSQL and returned only to an authorized administrator.</p>
          </section>

          <div className="admin-section-heading">
            <div><h2>Platform data readiness</h2><p>No estimates or sample metrics—only tables detected in the connected database.</p></div>
            <span className="admin-generated-time">
              {overview?.generated_at
                ? `UPDATED ${new Date(overview.generated_at).toLocaleTimeString()}`
                : 'WAITING FOR DATABASE'}
            </span>
          </div>

          {unavailableTables.length > 0 ? (
            <section className="admin-readiness-card">
              <div className="readiness-header">
                <span className="readiness-icon"><Database size={19} aria-hidden="true" /></span>
                <div><h3>Social feature schema not installed</h3><p>Statistics for these features are unavailable until their RLS-protected migrations are designed and applied.</p></div>
              </div>
              <ul className="readiness-table-list">
                {tableNames.map((name) => {
                  const isReady = overview.social_tables_ready?.[name]
                  return (
                    <li key={name}>
                      <code>public.{name}</code>
                      <span className={isReady ? 'schema-state schema-state--ready' : 'schema-state'}>
                        <i /> {isReady ? 'Detected' : 'Not installed'}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="admin-readiness-footnote">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>Administrative data access is checked in PostgreSQL for every overview request.</span>
              </div>
            </section>
          ) : (
            <section className="admin-readiness-card admin-ready-card">
              <div className="readiness-header">
                <span className="readiness-icon readiness-icon--ready"><ShieldCheck size={19} aria-hidden="true" /></span>
                <div><h3>Social tables detected</h3><p>Detected: {readyTables.map((name) => `public.${name}`).join(', ')}.</p></div>
              </div>
              <p className="admin-readiness-footnote"><ShieldCheck size={16} aria-hidden="true" /> Additional metrics will be enabled only through administrator-authorized database functions.</p>
            </section>
          )}
          <p className="admin-metrics-note">Active, inactive, and suspended account counts are not shown because the current database does not yet define those account states.</p>
        </section>}
      </main>
    </div>
  )
}

export default AdminRoutes
