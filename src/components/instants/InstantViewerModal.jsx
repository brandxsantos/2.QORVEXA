import { useState, useEffect, useRef, useCallback } from 'react'
import { X, MessageSquare, LoaderCircle, AlertCircle, Star, ChevronLeft, ChevronRight } from 'lucide-react'
import { consumeAndViewInstant, reactToInstant } from '../../lib/instants.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import './Instants.css'

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏']

export default function InstantViewerModal({
  instantId,
  instantsList = [],
  isOwn = false,
  ownProfile = null,
  onClose,
  onReply,
  currentUserId,
}) {
  const [activeInstantId, setActiveInstantId] = useState(instantId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [instantData, setInstantData] = useState(null)
  const [myReaction, setMyReaction] = useState(null)
  const [reacting, setReacting] = useState(false)
  const touchStartRef = useRef(null)

  // Sync active instant when prop changes
  useEffect(() => {
    setActiveInstantId(instantId)
  }, [instantId])

  // Current index within list of available Instants
  const currentIdx = instantsList.findIndex((item) => item.id === activeInstantId)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx >= 0 && currentIdx < instantsList.length - 1
  const totalCount = instantsList.length

  const goToNext = useCallback(() => {
    if (hasNext) {
      setActiveInstantId(instantsList[currentIdx + 1].id)
    } else {
      onClose?.()
    }
  }, [hasNext, currentIdx, instantsList, onClose])

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      setActiveInstantId(instantsList[currentIdx - 1].id)
    }
  }, [hasPrev, currentIdx, instantsList])

  // Load and claim instant securely (NO prefetching)
  useEffect(() => {
    let active = true
    if (!activeInstantId) return

    setLoading(true)
    setError('')

    async function loadAndClaim() {
      try {
        const data = await consumeAndViewInstant(activeInstantId, isOwn, ownProfile)
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
  }, [activeInstantId, isOwn, ownProfile])

  // Keyboard navigation
  useEffect(() => {
    if (!activeInstantId) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        goToPrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeInstantId, goToNext, goToPrev, onClose])

  // Mobile swipe gestures
  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      t: Date.now(),
    }
  }

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const elapsed = Date.now() - touchStartRef.current.t
    touchStartRef.current = null

    // Swipe down to close
    if (deltaY > 80 && Math.abs(deltaY) > Math.abs(deltaX) && elapsed < 350) {
      onClose?.()
      return
    }

    // Horizontal swipe: Swipe left = Next, Swipe right = Prev
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) && elapsed < 350) {
      if (deltaX < 0) goToNext()
      else goToPrev()
    }
  }

  const handleReact = async (emoji) => {
    if (!activeInstantId || reacting) return
    const nextEmoji = myReaction === emoji ? null : emoji
    setMyReaction(nextEmoji)
    setReacting(true)
    try {
      await reactToInstant(activeInstantId, nextEmoji)
    } catch {
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
    onClose?.()
  }

  if (!activeInstantId) return null

  const senderAvatar = isOwn ? ownProfile?.avatar_url || instantData?.sender?.avatar_url : instantData?.sender?.avatar_url
  const senderDisplayName = isOwn ? 'Your Instant' : instantData?.sender?.display_name || instantData?.sender?.username || 'Member'
  const senderInitial = ((isOwn ? ownProfile?.display_name || ownProfile?.username || 'Y' : senderDisplayName).trim()[0] || '?').toUpperCase()

  return (
    <div
      className="instant-viewer-overlay"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Prev / Next Navigation Arrows */}
      {hasPrev && (
        <button
          type="button"
          className="story-nav-btn story-nav-btn--prev"
          onClick={goToPrev}
          aria-label="Previous Instant"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          className="story-nav-btn story-nav-btn--next"
          onClick={goToNext}
          aria-label="Next Instant"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Main Container */}
      <div className="instant-viewer-container">
        {/* Top Bar */}
        <div className="instant-viewer-top">
          {instantData ? (
            <div className="instant-viewer-sender">
              <div className="instant-avatar-inner" style={{ width: 40, height: 40, flexShrink: 0 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {totalCount > 1 && currentIdx >= 0 && (
              <span className="instant-counter-pill">
                {currentIdx + 1} / {totalCount}
              </span>
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
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {hasNext && (
                  <button
                    type="button"
                    className="instant-retake-btn"
                    onClick={goToNext}
                  >
                    Next Instant
                  </button>
                )}
                <button
                  type="button"
                  className="instant-retake-btn"
                  onClick={onClose}
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : instantData?.signedUrl ? (
            <img
              src={instantData.signedUrl}
              alt="Instant"
              className="instant-viewer-image"
            />
          ) : null}
        </div>

        {/* Bottom Bar: Caption, Reactions, Reply, Navigation */}
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
    </div>
  )
}
