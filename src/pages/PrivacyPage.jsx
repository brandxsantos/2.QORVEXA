import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, LoaderCircle, Shield, UserRoundX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'
import BrandMark from '../components/BrandMark.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'

function PrivacyPage() {
  const { user } = useAuth()
  const [blockedMembers, setBlockedMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadBlockedMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: resultError } = await getSupabaseClient().rpc('get_blocked_members')
      if (resultError) throw resultError
      setBlockedMembers(data || [])
    } catch (loadError) {
      setError(loadError.message || 'Your blocked members could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadBlockedMembers() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadBlockedMembers])

  async function unblock(member) {
    const display = member.display_name || member.username || member.email || 'this member'
    if (!window.confirm(`Unblock ${display}? They will be able to find and contact you again.`)) return
    setWorkingId(member.user_id)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('unblock_member', { target_user_id: member.user_id })
      if (rpcError) throw rpcError
      setBlockedMembers((current) => current.filter((item) => item.user_id !== member.user_id))
      setNotice(`${display} was unblocked.`)
    } catch (unblockError) {
      setError(unblockError.message || 'This member could not be unblocked.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <main className="member-page member-feed-page settings-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/app" aria-label="QORVEXA feed"><BrandMark /></Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link className="network-nav-link" to="/app">Feed</Link>
          <Link className="network-nav-link" to="/app/bookmarks">Bookmarks</Link>
          <Link className="network-nav-link is-active" to="/app/privacy">Privacy</Link>
          <Link className="network-nav-link" to="/app/profile">Profile</Link>
        </nav>
      </header>
      <AccountRestrictionNotice userId={user.id} />
      <section className="settings-card" aria-labelledby="privacy-heading">
        <p className="eyebrow"><Shield size={14} aria-hidden="true" /> ACCOUNT CONTROLS</p>
        <h1 id="privacy-heading">Privacy and blocked accounts</h1>
        <p className="settings-intro">Blocked members cannot view your profile or posts, send friend requests, or access your conversations. Blocking also removes an existing friendship.</p>
        {error && <div className="settings-message settings-message--error" role="alert"><AlertCircle size={16} />{error}</div>}
        {notice && <p className="settings-message settings-message--success" role="status">{notice}</p>}
        <div className="privacy-list" aria-live="polite">
          {loading ? <div className="member-feed-state" role="status"><LoaderCircle className="spinner" size={19} />Loading blocked members…</div>
            : blockedMembers.length === 0
              ? <div className="member-feed-empty"><span><Shield size={20} /></span><h2>No blocked accounts</h2><p>Members you block from their profile will appear here.</p></div>
              : blockedMembers.map((member) => (
                <article className="privacy-member-row" key={member.user_id}>
                  <div className="privacy-member-identity">
                    {member.avatar_url
                      ? <img src={member.avatar_url} alt="" />
                      : <span aria-hidden="true">{(member.display_name || member.username || '?').slice(0, 1).toUpperCase()}</span>}
                    <div><strong>{member.display_name || member.username || 'QORVEXA member'}</strong><small>@{member.username || 'no-username'}</small></div>
                  </div>
                  <button className="network-button" type="button" disabled={workingId === member.user_id} onClick={() => unblock(member)}>
                    {workingId === member.user_id ? <LoaderCircle size={14} className="spinner" /> : <UserRoundX size={14} />}
                    {workingId === member.user_id ? 'Unblocking…' : 'Unblock'}
                  </button>
                </article>
              ))}
        </div>
      </section>
      <footer className="member-feed-footer"><span>Signed in as {user.email}</span></footer>
    </main>
  )
}

export default PrivacyPage
