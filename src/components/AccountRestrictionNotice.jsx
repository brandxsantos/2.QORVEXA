import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase.js'

function AccountRestrictionNotice({ userId }) {
  const [restrictions, setRestrictions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadRestrictions() {
      try {
        const { data, error: queryError } = await getSupabaseClient()
          .from('user_restrictions')
          .select('id, restriction_type, reason, expires_at')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        if (!active) return
        if (queryError) {
          setError('Account notices could not be loaded. Refresh the page or contact support.')
          return
        }

        const now = Date.now()
        setRestrictions((data || []).filter((item) => !item.expires_at || new Date(item.expires_at).getTime() > now))
      } catch {
        if (!active) return
        setError('Account notices could not be loaded. Refresh the page or contact support.')
      }
    }

    loadRestrictions()
    return () => { active = false }
  }, [userId])

  if (!error && restrictions.length === 0) return null

  return (
    <div className="account-restriction-notice" role={error ? 'alert' : 'status'}>
      <AlertCircle size={17} aria-hidden="true" />
      <div>
        {error ? <span>{error}</span> : restrictions.map((item) => (
          <p key={item.id}>
            {item.restriction_type === 'warning'
              ? 'Account warning'
              : `Active restriction on ${item.restriction_type.replace('_', ' ')}`}
            {' — '}{item.reason}
            {item.expires_at && ` Expires ${new Date(item.expires_at).toLocaleString()}.`}
          </p>
        ))}
        {!error && <small>Contact support if you believe this is a mistake.</small>}
      </div>
    </div>
  )
}

export default AccountRestrictionNotice
