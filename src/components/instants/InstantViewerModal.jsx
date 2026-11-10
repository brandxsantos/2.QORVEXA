import { useState, useEffect } from 'react'
import { X, MessageSquare, LoaderCircle, AlertCircle, Star } from 'lucide-react'
import { consumeAndViewInstant, reactToInstant } from '../../lib/instants.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import './Instants.css'

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏']

export default function InstantViewerModal({ instantId, isOwn = false, ownProfile = null, onClose, onReply, currentUserId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [instantData, setInstantData] = useState(null)
  const [myReaction, setMyReaction] = useState(null)
  const [reacting, setReacting] = useState(false)

  useEffect(() => {
    let active = true
    if (!instantId) return

    async function loadAndClaim() {
      setLoading(true)
      setError('')
      try {
        const data = await consumeAndViewInstant(instantId, isOwn, ownProfile)
        if (!active) return
        setInstantData(data)
        setMyReaction(data.my_reaction || null)
      } catch (err) {
        if (!active) return
        setError(err.message || 'Unable to open Instant.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAndClaim()

    return () => {
      active = false
    }
  }, [instantId, isOwn, ownProfile])

  const handleReact = async (emoji) => {
    if (!instantId || reacting) return
    const nextEmoji = myReaction === emoji ? null : emoji
    setMyReaction(nextEmoji)
    setReacting(true)
    try {
      await reactToInstant(instantId, nextEmoji)
    } catch {
      // Revert if failed
      setMyReaction(myReaction)
    } finally {
      setReacting(false)
    }
  }

  const handleReplyClick = () => {
    if (onReply && instantData?.sender) {
      onReply({
        peerId: instantData.sender.id,
        instantId: instantData.id,
        caption: instantData.caption,
      })
    }
    onClose()
  }

  if (!instantId) return null

  const senderAvatar = isOwn ? (ownProfile?.avatar_url || instantData?.sender?.avatar_url) : instantData?.sender?.avatar_url
  const senderDisplayName = isOwn ? 'Your Story' : (instantData?.sender?.display_name || instantData?.sender?.username || 'Member')
  const senderInitial = ((isOwn ? (ownProfile?.display_name || ownProfile?.username || 'Y') : senderDisplayName).trim()[0] || '?').toUpperCase()

  return (
    <div className="instant-viewer-overlay">
      {/* Top Bar */}
      <div className="instant-viewer-top">
        {instantData ? (
          <div className="instant-viewer-sender">
            <div className="instant-avatar-inner" style={{ width: 40, height: 40 }}>
              {senderAvatar ? (
                <ProtectedMediaImage
                  path={senderAvatar}
                  alt={senderDisplayName}
                  className="instant-avatar-img"
                  fallback={<span>{senderInitial}</span>}
                />
              ) : (
                <span>{senderInitial}</span>
              )}
            </div>
            <div>
              <div className="instant-viewer-name">
                {senderDisplayName}
              </div>
              <div className="instant-viewer-meta">
                {isOwn ? (
                  <span>{instantData.audience_type === 'close_friends' ? 'Shared with Close Friends' : 'Shared with Friends'}</span>
                ) : (
                  <>
                    <span>@{instantData.sender?.username}</span>
                    {instantData.audience_type === 'close_friends' && (
                      <span className="instant-viewer-tag">
                        <Star size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                        Close Friends
                      </span>
                    )}
                    <span>• View once</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#ffffff', fontWeight: 600 }}>QORVEXA Instant</div>
        )}

        <button
          type="button"
          className="instant-icon-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Image View */}
      <div className="instant-viewer-content">
        {loading ? (
          <div style={{ textAlign: 'center', color: '#ffffff' }}>
            <LoaderCircle size={36} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Opening Instant…</p>
          </div>
        ) : error ? (
          <div style={{ padding: 24, textAlign: 'center', maxWidth: 360 }}>
            <AlertCircle size={44} color="#f59e0b" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>{error}</p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 20 }}>
              Instants can only be viewed once and expire 24 hours after being sent.
            </p>
            <button
              type="button"
              className="instant-retake-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : instantData?.signedUrl ? (
          <img
            src={instantData.signedUrl}
            alt="Instant"
            className="instant-viewer-image"
          />
        ) : null}
      </div>

      {/* Bottom Bar: Caption, Reactions, Reply */}
      {instantData && !loading && !error && (
        <div className="instant-viewer-bottom">
          {instantData.caption && (
            <div className="instant-viewer-caption">
              {instantData.caption}
            </div>
          )}

          {!isOwn && (
            <div className="instant-viewer-interaction-bar">
              {/* Reactions */}
              <div className="instant-reactions-strip">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`instant-react-btn ${myReaction === emoji ? 'is-active' : ''}`}
                    onClick={() => handleReact(emoji)}
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Reply Button */}
              {instantData.sender?.id !== currentUserId && (
                <button
                  type="button"
                  className="instant-reply-chat-btn"
                  onClick={handleReplyClick}
                >
                  <MessageSquare size={16} />
                  <span>Reply</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
