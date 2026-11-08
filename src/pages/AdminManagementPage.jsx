import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
  UserRoundX,
} from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase.js'

const pageSize = 25
const restrictionOptions = [
  ['warning', 'Issue warning'],
  ['posting', 'Restrict creating posts'],
  ['commenting', 'Restrict commenting'],
  ['messaging', 'Restrict messaging'],
  ['friend_requests', 'Restrict friend requests'],
  ['following', 'Restrict following'],
]

function dateLabel(value) {
  return value ? new Date(value).toLocaleString() : 'â€”'
}

function rpcMessage(error) {
  return error?.message || 'The requested operation failed.'
}

function AdminManagementPage({ section, role, userId }) {
  const [users, setUsers] = useState([])
  const [reports, setReports] = useState([])
  const [logs, setLogs] = useState([])
  const [roles, setRoles] = useState([])
  const [roleCandidates, setRoleCandidates] = useState([])
  const [roleCandidateSearch, setRoleCandidateSearch] = useState('')
  const [roleCandidateLoading, setRoleCandidateLoading] = useState(false)
  const [newStaffRole, setNewStaffRole] = useState('admin')
  const [content, setContent] = useState([])
  const [contentType, setContentType] = useState('post')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reportFilter, setReportFilter] = useState('pending')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [restrictionTarget, setRestrictionTarget] = useState(null)
  const [restrictionType, setRestrictionType] = useState('posting')
  const [restrictionDuration, setRestrictionDuration] = useState('24h')
  const [restrictionReason, setRestrictionReason] = useState('')

  const loadPage = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const client = getSupabaseClient()
      if (section === 'users') {
        const { data, error: resultError } = await client.rpc('admin_list_users', {
          search_term: search.trim(),
          status_filter: statusFilter,
          page_offset: offset,
          page_size: pageSize,
        })
        if (resultError) throw resultError
        setUsers(data?.users || [])
        setTotal(Number(data?.total || 0))
      } else if (section === 'reports') {
        const { data, error: resultError } = await client.rpc('admin_list_reports', {
          status_filter: reportFilter,
          page_offset: offset,
          page_size: pageSize,
        })
        if (resultError) throw resultError
        setReports(data?.reports || [])
        setTotal(Number(data?.total || 0))
      } else if (section === 'audit') {
        const { data, error: resultError } = await client.rpc('admin_list_audit_logs', {
          search_term: search.trim(),
          page_offset: offset,
          page_size: pageSize,
        })
        if (resultError) throw resultError
        setLogs(data?.logs || [])
        setTotal(Number(data?.total || 0))
      } else if (section === 'moderation') {
        const { data, error: resultError } = await client.rpc('admin_list_content', {
          content_type: contentType,
          search_term: search.trim(),
          page_offset: offset,
          page_size: pageSize,
        })
        if (resultError) throw resultError
        setContent(data?.items || [])
        setTotal(Number(data?.total || 0))
      } else if (section === 'roles') {
        const { data, error: resultError } = await client.rpc('admin_list_roles')
        if (resultError) throw resultError
        setRoles(data || [])
        setTotal(data?.length || 0)
      }
    } catch (loadError) {
      setError(rpcMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [contentType, offset, reportFilter, search, section, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadPage() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadPage])

  async function applyRestriction(event) {
    event.preventDefault()
    if (!restrictionTarget) return
    setWorking(restrictionTarget.id)
    setError('')
    try {
      const durations = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '3d': 3 * 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }
      const duration = role === 'moderator' && ['30d', 'permanent'].includes(restrictionDuration)
        ? '7d'
        : restrictionDuration
      const expiry = duration === 'permanent'
        ? null
        : new Date(Date.now() + durations[duration]).toISOString()
      const { error: rpcError } = await getSupabaseClient().rpc('admin_apply_restriction', {
        target_user_id: restrictionTarget.id,
        restriction_type: restrictionType,
        reason: restrictionReason.trim(),
        expires_at: expiry,
      })
      if (rpcError) throw rpcError
      setNotice('Restriction was recorded and will be enforced by Supabase.')
      setRestrictionTarget(null)
      setRestrictionReason('')
      await loadPage()
    } catch (actionError) {
      setError(rpcMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  async function revokeRestriction(restriction) {
    const reason = window.prompt('Reason for restoring this account permission (at least 3 characters):')
    if (reason === null) return
    setWorking(restriction.id)
    setError('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('admin_revoke_restriction', {
        restriction_id: restriction.id,
        reason,
      })
      if (rpcError) throw rpcError
      setNotice('Restriction revoked.')
      await loadPage()
    } catch (actionError) {
      setError(rpcMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  async function updateReport(report, status) {
    let resolution = ''
    if (status === 'resolved' || status === 'dismissed') {
      resolution = window.prompt(`Add an internal note for this ${status} decision:`) || ''
      if (resolution.trim().length < 3) {
        setError('Provide an internal note of at least 3 characters.')
        return
      }
    }
    setWorking(report.id)
    setError('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('admin_update_report', {
        report_id: report.id,
        new_status: status,
        resolution_note: resolution || null,
        assignee_id: status === 'in_review' ? userId : null,
      })
      if (rpcError) throw rpcError
      setNotice(`Report marked ${status.replace('_', ' ')}.`)
      await loadPage()
    } catch (actionError) {
      setError(rpcMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  async function updateRole(target, nextRole) {
    if (!window.confirm(`${nextRole === 'none' ? 'Remove administrator access from' : `Set ${nextRole} role for`} ${target.display_name || target.username || target.user_id}?`)) return
    setWorking(target.user_id)
    setError('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('admin_set_role', {
        target_user_id: target.user_id,
        new_role: nextRole,
      })
      if (rpcError) throw rpcError
      setNotice('Administrator role updated.')
      await loadPage()
    } catch (actionError) {
      setError(rpcMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  async function searchRoleCandidates(event) {
    event.preventDefault()
    setRoleCandidateLoading(true)
    setError('')
    setNotice('')
    setRoleCandidates([])
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc('admin_search_role_candidates', {
        search_term: roleCandidateSearch.trim(),
      })
      if (rpcError) throw rpcError
      setRoleCandidates(data || [])
      if (!data?.length) setNotice('No eligible verified members matched that search.')
    } catch (searchError) {
      const missingFunction = searchError.code === 'PGRST202' || searchError.code === '42883'
      setError(missingFunction
        ? 'Apply supabase/migrations/20261107025000_admin_role_candidates.sql in the Supabase SQL Editor, then search again.'
        : rpcMessage(searchError))
    } finally {
      setRoleCandidateLoading(false)
    }
  }

  async function grantRole(candidate) {
    const memberName = candidate.display_name || candidate.username || candidate.email || candidate.user_id
    if (!window.confirm(`Grant the ${newStaffRole.replace('_', ' ')} role to ${memberName}?`)) return
    setWorking(candidate.user_id)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('admin_set_role', {
        target_user_id: candidate.user_id,
        new_role: newStaffRole,
      })
      if (rpcError) throw rpcError
      setNotice(`${newStaffRole.replace('_', ' ')} access granted to ${memberName}.`)
      setRoleCandidates((current) => current.filter((item) => item.user_id !== candidate.user_id))
      await loadPage()
    } catch (grantError) {
      setError(rpcMessage(grantError))
    } finally {
      setWorking('')
    }
  }

  async function moderateContent(item) {
    const hide = !item.is_hidden
    const reason = window.prompt(`${hide ? 'Reason for hiding' : 'Reason for restoring'} this ${contentType}:`)
    if (reason === null) return
    if (reason.trim().length < 3) {
      setError('Provide a reason of at least 3 characters.')
      return
    }
    setWorking(item.id)
    setError('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('admin_moderate_content', {
        content_type: contentType,
        content_id: item.id,
        hide_content: hide,
        reason,
      })
      if (rpcError) throw rpcError
      setNotice(`${contentType === 'post' ? 'Post' : 'Comment'} ${hide ? 'hidden' : 'restored'}.`)
      await loadPage()
    } catch (actionError) {
      setError(rpcMessage(actionError))
    } finally {
      setWorking('')
    }
  }

  const titles = {
    users: ['User management', 'Search registered accounts and apply auditable restrictions.'],
    reports: ['Report management', 'Review and resolve community reports. Reporter identities are limited to authorized staff.'],
    moderation: ['Content moderation', 'Search public posts and comments; hide or restore content with an auditable reason.'],
    audit: ['Administrative audit log', 'Search immutable records of administrative actions.'],
    roles: ['Administrator roles', 'Only a super administrator can grant or remove staff access.'],
  }
  const heading = titles[section] || titles.users

  return (
    <section className="admin-content admin-management">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow"><ShieldCheck size={14} aria-hidden="true" /> ADMINISTRATION Â· {role.replace('_', ' ').toUpperCase()}</p>
          <h1>{heading[0]}</h1>
          <p>{heading[1]}</p>
        </div>
        <button className="admin-button admin-button--secondary admin-refresh-button" type="button" onClick={loadPage} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spinner' : ''} />Refresh
        </button>
      </div>

      {error && <div className="admin-inline-error" role="alert"><AlertCircle size={18} /><div><strong>Request failed</strong><span>{error}</span></div></div>}
      {notice && <div className="admin-management-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss">Ã—</button></div>}

      {(section === 'users' || section === 'audit' || section === 'moderation') && (
        <form className="admin-management-filters" onSubmit={(event) => { event.preventDefault(); setOffset(0) }}>
          <label className="admin-management-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={section === 'users' ? 'Search name, username, email, or ID' : section === 'moderation' ? 'Search content or author' : 'Search action, target, or administrator'} /></label>
          {section === 'moderation' && <select aria-label="Content type" value={contentType} onChange={(event) => { setContentType(event.target.value); setOffset(0) }}><option value="post">Posts</option><option value="comment">Comments and replies</option></select>}
          {section === 'users' && <select aria-label="Filter by account status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setOffset(0) }}>
            <option value="all">All account statuses</option><option value="active">No active restrictions</option><option value="restricted">Any active restriction</option>
          </select>}
        </form>
      )}
      {section === 'reports' && <div className="admin-management-filters"><select aria-label="Filter reports" value={reportFilter} onChange={(event) => { setReportFilter(event.target.value); setOffset(0) }}>
        <option value="pending">Pending</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All reports</option>
      </select></div>}

      {loading ? <div className="admin-management-loading" role="status"><LoaderCircle className="spinner" size={20} />Loading secure recordsâ€¦</div> : (
        <>
          {section === 'users' && (
            <div className="admin-management-list">
              {!users.length ? <div className="admin-management-empty"><UserRound size={22} /><strong>No matching users</strong><span>Adjust the search or status filter.</span></div> : users.map((account) => (
                <article className="admin-management-card" key={account.id}>
                  <div className="admin-management-card-main">
                    <span className="admin-management-avatar">{(account.display_name || account.email || '?').slice(0, 1).toUpperCase()}</span>
                    <div className="admin-management-user">
                      <strong>{account.display_name || account.username || 'QORVEXA member'}</strong>
                      <span>@{account.username || 'no-username'} Â· {account.email || 'No email'}</span>
                      <small>{account.id}</small>
                      <small>Joined {dateLabel(account.created_at)} Â· Last active {dateLabel(account.last_active_at)}</small>
                      {account.admin_role && <em>Staff role: {account.admin_role.replace('_', ' ')}</em>}
                    </div>
                  </div>
                  <div className="admin-management-card-actions">
                    {role !== 'support' && <button className="admin-button admin-button--secondary" type="button" disabled={Boolean(account.admin_role) || account.id === userId} onClick={() => setRestrictionTarget(account)}>
                      <ShieldAlert size={14} />Restrict
                    </button>}
                  </div>
                  {account.active_restrictions?.length > 0 && (
                    <div className="admin-active-restrictions">
                      {account.active_restrictions.map((restriction) => (
                        <div className="admin-restriction-item" key={restriction.id}>
                          <span><strong>{restriction.type.replace('_', ' ')}</strong> Â· {restriction.reason} Â· {restriction.expires_at ? `until ${dateLabel(restriction.expires_at)}` : 'permanent'}</span>
                          {role !== 'support' && <button type="button" onClick={() => revokeRestriction(restriction)} disabled={working === restriction.id}>Restore</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {section === 'reports' && (
            <div className="admin-management-list">
              {!reports.length ? <div className="admin-management-empty"><ShieldAlert size={22} /><strong>No reports in this view</strong><span>New community reports will appear here.</span></div> : reports.map((report) => (
                <article className="admin-report-card" key={report.id}>
                  <div className="admin-report-meta"><span className={`admin-report-severity admin-report-severity--${report.severity}`}>{report.severity}</span><span>{report.category.replace('_', ' ')}</span><span>{report.target_type} Â· {report.target_id}</span><time><Clock3 size={13} />{dateLabel(report.created_at)}</time></div>
                  <p>{report.description}</p>
                  <div className="admin-report-parties"><span>Reported account: <strong>{report.reported_display_name || report.reported_username || report.reported_user_id}</strong></span><span>Reporter: <strong>{report.reporter_display_name || report.reporter_username || report.reporter_id}</strong></span>{report.assignee_username && <span>Assigned to @{report.assignee_username}</span>}</div>
                  {report.resolution && <p className="admin-report-resolution">Internal note: {report.resolution}</p>}
                  {role !== 'support' && <div className="admin-report-actions">
                    {report.status === 'pending' && <button className="admin-button admin-button--secondary" type="button" disabled={working === report.id} onClick={() => updateReport(report, 'in_review')}>Assign to me</button>}
                    {(report.status === 'pending' || report.status === 'in_review') && <>
                      <button className="admin-button admin-button--primary" type="button" disabled={working === report.id} onClick={() => updateReport(report, 'resolved')}>Resolve</button>
                      <button className="admin-button admin-button--secondary" type="button" disabled={working === report.id} onClick={() => updateReport(report, 'dismissed')}>Dismiss</button>
                    </>}
                  </div>}
                </article>
              ))}
            </div>
          )}

          {section === 'moderation' && (
            <div className="admin-management-list">
              {!content.length ? <div className="admin-management-empty"><ShieldAlert size={22} /><strong>No matching content</strong><span>Adjust the search or choose another content type.</span></div> : content.map((item) => (
                <article className={`admin-report-card${item.is_hidden ? ' is-hidden' : ''}`} key={item.id}>
                  <div className="admin-report-meta"><span>{contentType}</span><span>{item.parent_id ? 'reply' : ''}</span><span>{item.is_hidden ? 'hidden' : 'visible'}</span><time><Clock3 size={13} />{dateLabel(item.created_at)}</time></div>
                  <p>{item.content}</p>
                  <div className="admin-report-parties"><span>Author: <strong>{item.display_name || item.username || item.author_id}</strong></span><span>Content ID: <strong>{item.id}</strong></span>{item.hidden_reason && <span>Moderation reason: {item.hidden_reason}</span>}</div>
                  <div className="admin-report-actions"><button className={`admin-button ${item.is_hidden ? 'admin-button--secondary' : 'admin-button--primary'}`} type="button" disabled={working === item.id} onClick={() => moderateContent(item)}>{item.is_hidden ? 'Restore content' : 'Hide content'}</button></div>
                </article>
              ))}
            </div>
          )}

          {section === 'audit' && (
            <div className="admin-management-list">
              {!logs.length ? <div className="admin-management-empty"><ShieldCheck size={22} /><strong>No audit entries found</strong></div> : logs.map((entry) => (
                <article className="admin-audit-card" key={entry.id}>
                  <div><strong>{entry.action}</strong><time>{dateLabel(entry.created_at)}</time></div>
                  <p>{entry.reason}</p>
                  <small>{entry.actor_username ? `@${entry.actor_username}` : entry.actor_id} Â· {entry.target_type || 'system'} {entry.target_id || ''}</small>
                  {Object.keys(entry.details || {}).length > 0 && <details><summary>Action details</summary><pre>{JSON.stringify(entry.details, null, 2)}</pre></details>}
                </article>
              ))}
            </div>
          )}

          {section === 'roles' && (
            <div className="admin-management-list">
              {role === 'super_admin' && <form className="admin-role-search" onSubmit={searchRoleCandidates}>
                <div>
                  <h2>Add staff access</h2>
                  <p>Search verified members by name, username, or email. Only you, as super admin, can grant these roles.</p>
                </div>
                <label className="admin-role-search-field">
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={roleCandidateSearch}
                    onChange={(event) => setRoleCandidateSearch(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    placeholder="Search members (2+ characters)"
                    aria-label="Search verified members"
                    required
                  />
                </label>
                <label className="admin-role-select">
                  <span>Role to grant</span>
                  <select value={newStaffRole} onChange={(event) => setNewStaffRole(event.target.value)}>
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="support">Support (read only)</option>
                  </select>
                </label>
                <button className="admin-button admin-button--secondary" type="submit" disabled={roleCandidateLoading || roleCandidateSearch.trim().length < 2}>
                  {roleCandidateLoading ? <LoaderCircle size={15} className="spinner" /> : <Search size={15} />}
                  {roleCandidateLoading ? 'Searchingâ€¦' : 'Find member'}
                </button>
              </form>}
              {role === 'super_admin' && roleCandidates.map((candidate) => (
                <article className="admin-management-card" key={candidate.user_id}>
                  <div className="admin-management-card-main">
                    <span className="admin-management-avatar">{(candidate.display_name || candidate.email || '?').slice(0, 1).toUpperCase()}</span>
                    <div className="admin-management-user">
                      <strong>{candidate.display_name || candidate.username || 'QORVEXA member'}</strong>
                      <span>@{candidate.username || 'no-username'} Â· {candidate.email}</span>
                      <small>{candidate.user_id}</small>
                    </div>
                  </div>
                  <div className="admin-management-card-actions">
                    <button className="admin-button admin-button--primary" type="button" disabled={Boolean(working)} onClick={() => grantRole(candidate)}>
                      <UserRoundPlus size={14} />{working === candidate.user_id ? 'Grantingâ€¦' : `Grant ${newStaffRole.replace('_', ' ')}`}
                    </button>
                  </div>
                </article>
              ))}
              {roles.map((target) => (
                <article className="admin-management-card" key={target.user_id}>
                  <div className="admin-management-card-main"><span className="admin-management-avatar"><ShieldCheck size={18} /></span><div className="admin-management-user"><strong>{target.display_name || target.username || target.user_id}</strong><span>@{target.username || 'no-username'} Â· {target.role.replace('_', ' ')}</span><small>{target.user_id}</small></div></div>
                  {target.role !== 'super_admin' && <div className="admin-management-card-actions">
                    <select aria-label={`Change role for ${target.username || target.user_id}`} value={target.role} disabled={working === target.user_id} onChange={(event) => updateRole(target, event.target.value)}>
                      <option value="admin">Admin</option><option value="moderator">Moderator</option><option value="support">Support (read only)</option><option value="none">Remove access</option>
                    </select>
                  </div>}
                </article>
              ))}
              <p className="admin-management-note">The database prevents changing your own role or demoting/removing the final super administrator. Role changes are recorded in the audit log.</p>
            </div>
          )}
        </>
      )}

      {section !== 'roles' && <div className="admin-management-pagination">
        <span>{total ? `${offset + 1}â€“${Math.min(offset + pageSize, total)} of ${total}` : '0 records'}</span>
        <div><button type="button" aria-label="Previous page" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - pageSize))}><ChevronLeft size={17} /></button><button type="button" aria-label="Next page" disabled={offset + pageSize >= total || loading} onClick={() => setOffset((value) => value + pageSize)}><ChevronRight size={17} /></button></div>
      </div>}

      {restrictionTarget && (
        <div className="admin-modal-overlay" role="presentation" onClick={() => setRestrictionTarget(null)}>
          <form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-restriction-title" onSubmit={applyRestriction} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="admin-modal-close" onClick={() => setRestrictionTarget(null)} aria-label="Close dialog">Ã—</button>
            <h2 id="admin-restriction-title">Apply account restriction</h2>
            <p>{restrictionTarget.display_name || restrictionTarget.email || restrictionTarget.id}</p>
            <p>Restrictions block the selected actions only. They do not disable sign-in or read access.</p>
            <label>Action<select value={restrictionType} onChange={(event) => setRestrictionType(event.target.value)}>{restrictionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Duration<select value={restrictionDuration} onChange={(event) => setRestrictionDuration(event.target.value)}><option value="1h">1 hour</option><option value="24h">24 hours</option><option value="3d">3 days</option><option value="7d">7 days</option>{role !== 'moderator' && <><option value="30d">30 days</option><option value="permanent">Permanent</option></>}</select></label>
            <label>Reason<textarea required minLength={3} maxLength={1000} value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} rows={4} /></label>
            {error && <p className="admin-modal-error" role="alert">{error}</p>}
            <div className="admin-modal-actions"><button className="admin-button admin-button--secondary" type="button" onClick={() => setRestrictionTarget(null)}>Cancel</button><button className="admin-button admin-button--primary" type="submit" disabled={Boolean(working)}><UserRoundX size={14} />{working ? 'Savingâ€¦' : 'Confirm restriction'}</button></div>
          </form>
        </div>
      )}
    </section>
  )
}

export default AdminManagementPage
