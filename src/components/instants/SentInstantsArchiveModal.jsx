import { useState, useEffect } from 'react'
import { X, Archive, Star, CheckCircle2, Clock, LoaderCircle, AlertCircle } from 'lucide-react'
import { fetchSentInstants } from '../../lib/instants.js'
import './Instants.css'

export default function SentInstantsArchiveModal({ isOpen, onClose }) {
  const [instants, setInstants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!isOpen) return

    async function loadArchive() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchSentInstants()
        if (active) setInstants(data)
      } catch (err) {
        if (active) setError(err.message || 'Unable to load sent Instants.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadArchive()

    return () => {
      active = false
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="instants-modal-overlay" onClick={onClose}>
      <div className="instants-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="instants-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Archive size={18} color="#06b6d4" />
            <h3>Sent Instants Archive</h3>
          </div>
          <button type="button" className="instant-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="instants-modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <LoaderCircle size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading sent archive…</p>
            </div>
          ) : error ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#ef4444' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 8px auto' }} />
              <p>{error}</p>
            </div>
          ) : instants.length > 0 ? (
            instants.map((item) => {
              const createdDate = new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
              })

              return (
                <div key={item.id} className="instant-archive-card">
                  <div className="instant-archive-header">
                    <span>{createdDate}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.audience_type === 'close_friends' && (
                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.75rem', fontWeight: 600 }}>
                          <Star size={11} fill="#10b981" /> Close Friends
                        </span>
                      )}
                      <span style={{ color: item.is_expired ? '#64748b' : '#06b6d4', fontSize: '0.75rem', fontWeight: 600 }}>
                        {item.is_expired ? 'Expired' : 'Active'}
                      </span>
                    </div>
                  </div>

                  {item.caption && (
                    <div style={{ color: '#ffffff', fontSize: '0.88rem', fontStyle: 'italic' }}>
                      &ldquo;{item.caption}&rdquo;
                    </div>
                  )}

                  <div className="instant-archive-stats">
                    <span className="instant-seen-badge">
                      <CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {item.viewed_count} viewed
                    </span>
                    <span className="instant-unopened-badge">
                      <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {item.total_recipients - item.viewed_count} unopened
                    </span>
                  </div>

                  {/* Recipient seen breakdown */}
                  {item.recipients?.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.recipients.map((rec) => (
                        <span
                          key={rec.id}
                          style={{
                            fontSize: '0.75rem',
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: rec.is_viewed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: rec.is_viewed ? '#34d399' : '#fbbf24',
                            border: `1px solid ${rec.is_viewed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                          }}
                        >
                          @{rec.username} {rec.is_viewed ? '✓' : '•'}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reactions */}
                  {item.reactions?.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                      <span style={{ color: '#94a3b8' }}>Reactions:</span>
                      {item.reactions.map((r, i) => (
                        <span key={i} title={r.user?.display_name}>
                          {r.reaction}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
              <Archive size={36} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
              <p style={{ fontSize: '0.92rem', color: '#ffffff', marginBottom: 4 }}>No sent Instants yet</p>
              <p style={{ fontSize: '0.82rem' }}>Photos you capture and send to friends will appear in your private archive here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
