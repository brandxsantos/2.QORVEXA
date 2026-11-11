import { useState, useEffect, useRef, useCallback } from 'react'
import { X, MessageSquare, LoaderCircle, AlertCircle, Star, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { consumeAndViewInstant, reactToInstant } from '../../lib/instants.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import './Instants.css'

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏']
const STORY_DURATION_MS = 5000 // 5 seconds per story

export default function StoryViewerModal({
  isOpen,
  initialUserIndex = 0,
  initialStoryIndex = 0,
  userStoryStacks = [],
  onClose,
  onReply,
  currentUserId,
  ownProfile = null,
}) {
  const [currentUserIdx, setCurrentUserIdx] = useState(initialUserIndex)
  const [currentStoryIdx, setCurrentStoryIdx] = useState(initialStoryIndex)
  const [storyData, setStoryData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0) // 0 to 100
  const [isPaused, setIsPaused] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const [myReaction, setMyReaction] = useState(null)
  const [reacting, setReacting] = useState(false)

  const progressTimerRef = useRef(null)
  const touchStartRef = useRef(null)
  const longPressTimerRef = useRef(null)
  const activeInstantIdRef = useRef(null)

  // Sync initial indices when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentUserIdx(Math.max(0, Math.min(initialUserIndex, userStoryStacks.length - 1)))
      setCurrentStoryIdx(Math.max(0, initialStoryIndex))
      setProgress(0)
      setImageLoaded(false)
      setIsPaused(false)
      setIsInteracting(false)
    }
  }, [isOpen, initialUserIndex, initialStoryIndex, userStoryStacks.length])

  const currentStack = userStoryStacks[currentUserIdx] || null
  const currentInstant = currentStack?.instants?.[currentStoryIdx] || null
  const totalSegments = currentStack?.instants?.length || 1

  // Load and claim current story
  useEffect(() => {
    let active = true
    if (!isOpen || !currentInstant) return

    activeInstantIdRef.current = currentInstant.id
    setLoading(true)
    setImageLoaded(false)
    setError('')
    setProgress(0)

    async function loadStory() {
      try {
        const isOwn = !!currentStack?.isOwn
        const data = await consumeAndViewInstant(currentInstant.id, isOwn, ownProfile)
        if (!active || activeInstantIdRef.current !== currentInstant.id) return

        setStoryData(data)
        setMyReaction(data?.my_reaction || null)

        // Preload image to ensure smooth playback
        if (data?.signedUrl) {
          const img = new Image()
          img.src = data.signedUrl
          img.onload = () => {
            if (active && activeInstantIdRef.current === currentInstant.id) {
              setImageLoaded(true)
              setLoading(false)
            }
          }
          img.onerror = () => {
            if (active && activeInstantIdRef.current === currentInstant.id) {
              setImageLoaded(true)
              setLoading(false)
            }
          }
        } else {
          setLoading(false)
          setImageLoaded(true)
        }
      } catch (err) {
        if (!active || activeInstantIdRef.current !== currentInstant.id) return
        setError(err.message || 'Unable to load story.')
        setLoading(false)
      }
    }

    loadStory()

    return () => {
      active = false
    }
  }, [isOpen, currentInstant?.id, currentStack?.isOwn, ownProfile])

  // Navigation handlers
  const nextStory = useCallback(() => {
    if (!currentStack) {
      onClose?.()
      return
    }

    if (currentStoryIdx + 1 < currentStack.instants.length) {
      // Advance to next story of the same user
      setCurrentStoryIdx((prev) => prev + 1)
      setProgress(0)
      setImageLoaded(false)
    } else if (currentUserIdx + 1 < userStoryStacks.length) {
      // Advance to next user's stories
      setCurrentUserIdx((prev) => prev + 1)
      setCurrentStoryIdx(0)
      setProgress(0)
      setImageLoaded(false)
    } else {
      // Finished all available stories!
      onClose?.()
    }
  }, [currentStack, currentStoryIdx, currentUserIdx, userStoryStacks.length, onClose])

  const prevStory = useCallback(() => {
    if (progress > 20) {
      // If watched > 1s, restart current story
      setProgress(0)
    } else if (currentStoryIdx > 0) {
      // Go to previous story of current user
      setCurrentStoryIdx((prev) => prev - 1)
      setProgress(0)
      setImageLoaded(false)
    } else if (currentUserIdx > 0) {
      // Go to previous user's last story
      const prevStack = userStoryStacks[currentUserIdx - 1]
      setCurrentUserIdx((prev) => prev - 1)
      setCurrentStoryIdx(Math.max(0, (prevStack?.instants?.length || 1) - 1))
      setProgress(0)
      setImageLoaded(false)
    }
  }, [progress, currentStoryIdx, currentUserIdx, userStoryStacks])

  // Progress Bar Timer (Runs only when media is loaded and not paused)
  useEffect(() => {
    if (!isOpen || loading || !imageLoaded || error || isPaused) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      return
    }

    const intervalMs = 25
    const step = (intervalMs / STORY_DURATION_MS) * 100

    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step
        if (next >= 100) {
          clearInterval(progressTimerRef.current)
          nextStory()
          return 100
        }
        return next
      })
    }, intervalMs)

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [isOpen, loading, imageLoaded, error, isPaused, nextStory])

  // Desktop keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        nextStory()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevStory()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, nextStory, prevStory, onClose])

  // Press-and-hold (pause & hide UI)
  const handlePointerDown = (e) => {
    // If clicking a button or reaction, don't trigger touch zone action
    if (e.target.closest('button') || e.target.closest('input')) return

    setIsPaused(true)
    longPressTimerRef.current = setTimeout(() => {
      setIsInteracting(true)
    }, 150)
  }

  const handlePointerUp = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    setIsPaused(false)
    setIsInteracting(false)
  }

  // Tap navigation zones (Left 30% = prev, Right 70% = next)
  const handleZoneClick = (e) => {
    if (e.target.closest('button') || e.target.closest('.story-no-click') || isInteracting) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const widthRatio = clickX / rect.width

    if (widthRatio < 0.3) {
      prevStory()
    } else {
      nextStory()
    }
  }

  // Swipe gestures for mobile
  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    handlePointerDown(e)
  }

  const handleTouchEnd = (e) => {
    handlePointerUp()
    if (!touchStartRef.current) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const elapsed = Date.now() - touchStartRef.current.time
    touchStartRef.current = null

    // Swipe down to close
    if (deltaY > 80 && Math.abs(deltaY) > Math.abs(deltaX) && elapsed < 350) {
      onClose?.()
      return
    }

    // Horizontal swipe: Swipe left = Next User, Swipe right = Prev User
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) && elapsed < 350) {
      if (deltaX < 0) {
        // Next user
        if (currentUserIdx + 1 < userStoryStacks.length) {
          setCurrentUserIdx((prev) => prev + 1)
          setCurrentStoryIdx(0)
          setProgress(0)
          setImageLoaded(false)
        } else {
          onClose?.()
        }
      } else {
        // Prev user
        if (currentUserIdx > 0) {
          setCurrentUserIdx((prev) => prev - 1)
          setCurrentStoryIdx(0)
          setProgress(0)
          setImageLoaded(false)
        }
      }
    }
  }

  // Reactions & Replies
  const handleReact = async (emoji) => {
    if (!currentInstant || reacting) return
    const nextEmoji = myReaction === emoji ? null : emoji
    setMyReaction(nextEmoji)
    setReacting(true)
    try {
      await reactToInstant(currentInstant.id, nextEmoji)
    } catch {
      setMyReaction(myReaction)
    } finally {
      setReacting(false)
    }
  }

  const handleReplyClick = () => {
    if (onReply && storyData?.sender) {
      onReply({
        peerId: storyData.sender.id,
        instantId: storyData.id,
        caption: storyData.caption,
      })
    }
    onClose?.()
  }

  if (!isOpen || !currentStack) return null

  const isOwnStory = !!currentStack.isOwn
  const senderInfo = isOwnStory ? ownProfile || currentStack.sender : currentStack.sender
  const senderName = isOwnStory ? 'Your Story' : senderInfo?.display_name || senderInfo?.username || 'Member'
  const senderAvatar = senderInfo?.avatar_url || null
  const senderInitial = ((isOwnStory ? ownProfile?.display_name || 'You' : senderName).trim()[0] || '?').toUpperCase()

  return (
    <div
      className={`story-viewer-overlay ${isInteracting ? 'is-holding' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleZoneClick}
    >
      {/* Desktop Prev / Next Navigation Arrows */}
      <button
        type="button"
        className="story-nav-btn story-nav-btn--prev story-no-click"
        onClick={(e) => {
          e.stopPropagation()
          prevStory()
        }}
        aria-label="Previous story"
        disabled={currentUserIdx === 0 && currentStoryIdx === 0}
      >
        <ChevronLeft size={28} />
      </button>

      <button
        type="button"
        className="story-nav-btn story-nav-btn--next story-no-click"
        onClick={(e) => {
          e.stopPropagation()
          nextStory()
        }}
        aria-label="Next story"
      >
        <ChevronRight size={28} />
      </button>

      {/* Main Story Container */}
      <div className="story-viewer-box">
        {/* Top: Segmented Progress Bars */}
        <div className="story-progress-row story-no-click">
          {Array.from({ length: totalSegments }).map((_, idx) => {
            let fillPercent = 0
            if (idx < currentStoryIdx) fillPercent = 100
            else if (idx === currentStoryIdx) fillPercent = progress
            return (
              <div key={idx} className="story-progress-track">
                <div
                  className="story-progress-bar"
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
            )
          })}
        </div>

        {/* Header: User Avatar, Name, Timestamp, Close */}
        <div className="story-header story-no-click">
          <div className="story-header-left">
            <div className="instant-avatar-inner" style={{ width: 38, height: 38, flexShrink: 0 }}>
              {senderAvatar ? (
                <ProtectedMediaImage
                  path={senderAvatar}
                  alt={senderName}
                  className="instant-avatar-img"
                  fallback={<span>{senderInitial}</span>}
                />
              ) : (
                <span>{senderInitial}</span>
              )}
            </div>
            <div className="story-header-info">
              <div className="story-header-name">{senderName}</div>
              <div className="story-header-meta">
                {isOwnStory ? (
                  <span>{currentInstant?.audience_type === 'close_friends' ? 'Close Friends' : 'Shared with Friends'}</span>
                ) : (
                  <>
                    <span>@{senderInfo?.username}</span>
                    {currentInstant?.audience_type === 'close_friends' && (
                      <span className="instant-viewer-tag">
                        <Star size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                        Close Friends
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="story-header-right">
            <button
              type="button"
              className="instant-icon-btn story-close-btn"
              onClick={(e) => {
                e.stopPropagation()
                onClose?.()
              }}
              aria-label="Close stories"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Media / Content Area */}
        <div className="story-content-area">
          {loading ? (
            <div className="story-loading-state">
              <LoaderCircle size={36} className="animate-spin" />
              <p>Loading story…</p>
            </div>
          ) : error ? (
            <div className="story-error-state story-no-click">
              <AlertCircle size={44} color="#f59e0b" style={{ margin: '0 auto 12px auto' }} />
              <p className="story-error-title">{error}</p>
              <p className="story-error-desc">
                Stories and Instants are view-once and expire after 24 hours.
              </p>
              <button
                type="button"
                className="instant-retake-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  nextStory()
                }}
              >
                Skip to Next
              </button>
            </div>
          ) : storyData?.signedUrl ? (
            <img
              src={storyData.signedUrl}
              alt="Story"
              className="story-image-element"
              onDragStart={(e) => e.preventDefault()}
            />
          ) : null}
        </div>

        {/* Bottom Bar: Caption, Reactions, Reply */}
        {!loading && !error && storyData && (
          <div className="story-bottom-bar story-no-click">
            {storyData.caption && (
              <div className="story-caption-text">
                {storyData.caption}
              </div>
            )}

            {!isOwnStory && (
              <div className="story-interaction-row">
                {/* Reactions */}
                <div className="instant-reactions-strip">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`instant-react-btn ${myReaction === emoji ? 'is-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReact(emoji)
                      }}
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Reply */}
                {storyData.sender?.id !== currentUserId && (
                  <button
                    type="button"
                    className="instant-reply-chat-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReplyClick()
                    }}
                  >
                    <MessageSquare size={16} />
                    <span>Reply</span>
                  </button>
                )}
              </div>
            )}

            {isOwnStory && (
              <div className="story-own-footer">
                <span className="story-own-indicator">
                  <Eye size={14} style={{ marginRight: 6 }} />
                  Your Active Story
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
