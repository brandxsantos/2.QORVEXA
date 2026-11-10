import { useState, useEffect } from 'react'
import { X, Star, Search, LoaderCircle, Users } from 'lucide-react'
import { fetchCloseFriends, setCloseFriend } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import './Instants.css'

export default function CloseFriendsModal({ isOpen, onClose, user }) {
  const [friends, setFriends] = useState([])
  const [closeFriendIds, setCloseFriendIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    let active = true
    if (!isOpen || !user?.id) return

    async function loadData() {
      setLoading(true)
      try {
        const client = getSupabaseClient()
        const [cfResult, friendshipsResult] = await Promise.all([
          fetchCloseFriends(),
          client
            .from('friendships')
            .select('user_low, user_high')
            .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
            .eq('status', 'accepted'),
        ])

        if (!active) return

        const cfSet = new Set((cfResult || []).map((cf) => cf.id))
        setCloseFriendIds(cfSet)

        // Get peer IDs
        const peerIds = (friendshipsResult.data || []).map((f) =>
          f.user_low === user.id ? f.user_high : f.user_low
        )

        if (peerIds.length > 0) {
          const { data: profiles } = await client
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', peerIds)

          if (active) setFriends(profiles || [])
        } else {
          if (active) setFriends([])
        }
      } catch (err) {
        console.error('Failed to load close friends:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [isOpen, user?.id])

  const handleToggle = async (friendId) => {
    const isCurrentlyClose = closeFriendIds.has(friendId)
    const nextClose = !isCurrentlyClose
    setUpdatingId(friendId)

    try {
      await setCloseFriend(friendId, nextClose)
      setCloseFriendIds((prev) => {
        const updated = new Set(prev)
        if (nextClose) updated.add(friendId)
        else updated.delete(friendId)
        return updated
      })
    } catch (err) {
      alert(err.message || 'Unable to update Close Friends.')
    } finally {
      setUpdatingId(null)
    }
  }

  if (!isOpen) return null

  const filteredFriends = friends.filter((f) =>
    (f.display_name || f.username || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="instants-modal-overlay" onClick={onClose}>
      <div className="instants-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="instants-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={18} color="#10b981" fill="#10b981" />
            <h3>Close Friends</h3>
          </div>
          <button type="button" className="instant-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '12px 20px 0 20px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input
              type="text"
              placeholder="Search accepted friends…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 20,
                padding: '8px 12px 8px 36px',
                color: '#ffffff',
                fontSize: '0.88rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div className="instants-modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <LoaderCircle size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading friends…</p>
            </div>
          ) : filteredFriends.length > 0 ? (
            filteredFriends.map((friend) => {
              const isClose = closeFriendIds.has(friend.id)
              const isUpdating = updatingId === friend.id
              return (
                <div key={friend.id} className="instant-cf-item">
                  <div className="instant-cf-user">
                    <div className="instant-avatar-inner" style={{ width: 40, height: 40 }}>
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt="" className="instant-avatar-img" />
                      ) : (
                        <span>{(friend.display_name || '?')[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.9rem' }}>
                        {friend.display_name || friend.username}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        @{friend.username}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`instant-toggle-btn ${isClose ? 'is-active' : ''}`}
                    onClick={() => handleToggle(friend.id)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? '…' : isClose ? 'Close Friend ★' : '+ Add'}
                  </button>
                </div>
              )
            })
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
              <Users size={32} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
              <p style={{ fontSize: '0.9rem' }}>No accepted friends found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
