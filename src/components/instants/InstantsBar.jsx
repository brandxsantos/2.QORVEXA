import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Star, Archive, ChevronDown, ChevronUp, Camera, Zap, Check } from 'lucide-react'
import { fetchActiveInstants, fetchMyActiveInstants } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import InstantCameraModal from './InstantCameraModal.jsx'
import InstantViewerModal from './InstantViewerModal.jsx'
import StoryViewerModal from './StoryViewerModal.jsx'
import CloseFriendsModal from './CloseFriendsModal.jsx'
import SentInstantsArchiveModal from './SentInstantsArchiveModal.jsx'
import './Instants.css'

function formatTimeAgo(isoString) {
  if (!isoString) return ''
  const diffMinutes = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diffMinutes < 1) return 'now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  const hours = Math.floor(diffMinutes / 60)
  return `${hours}h`
}

export default function InstantsBar({ user, profile, onReply }) {
  const [instants, setInstants] = useState([])
  const [myInstants, setMyInstants] = useState([])
  const [loadedProfile, setLoadedProfile] = useState(profile || null)
  
  // Dock view modes: 'stories' | 'instants' | 'all'
  const [dockTab, setDockTab] = useState('stories')
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Modals state
  const [storyViewerOpen, setStoryViewerOpen] = useState(false)
  const [activeStoryUserIdx, setActiveStoryUserIdx] = useState(0)
  const [activeStoryIdx, setActiveStoryIdx] = useState(0)

  const [instantViewerOpen, setInstantViewerOpen] = useState(false)
  const [selectedInstantId, setSelectedInstantId] = useState(null)

  const [cameraOpen, setCameraOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false)

  // Keep own profile updated
  useEffect(() => {
    if (profile) {
      setLoadedProfile(profile)
      return
    }
    if (!user?.id) return
    let active = true
    getSupabaseClient()
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setLoadedProfile(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user?.id, profile])

  const loadInstants = useCallback(async () => {
    if (!user?.id) return
    try {
      const [receivedData, ownData] = await Promise.all([
        fetchActiveInstants(),
        fetchMyActiveInstants(user.id),
      ])
      setInstants(receivedData || [])
      setMyInstants(ownData || [])
    } catch (err) {
      console.error('Failed to load instants:', err)
    }
  }, [user?.id])

  useEffect(() => {
    loadInstants()
  }, [loadInstants])

  // Realtime subscription for incoming instants, views, and own created instants
  useEffect(() => {
    if (!user?.id) return
    const client = getSupabaseClient()
    const channelName = `instants-dock-${user.id}`
    const channel = client
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'instant_recipients',
        filter: `recipient_id=eq.${user.id}`,
      }, () => {
        loadInstants()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'instants',
      }, () => {
        loadInstants()
      })
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [user?.id, loadInstants])

  // Group received instants into friend story stacks
  const friendStacks = useMemo(() => {
    const stacksMap = new Map()
    for (const item of instants) {
      const senderId = item.sender_id
      if (!stacksMap.has(senderId)) {
        stacksMap.set(senderId, {
          sender: item.sender,
          isOwn: false,
          instants: [],
          hasUnread: false,
          isCloseFriends: false,
        })
      }
      const stack = stacksMap.get(senderId)
      stack.instants.push(item)
      if (!item.is_viewed) {
        stack.hasUnread = true
      }
      if (item.audience_type === 'close_friends') {
        stack.isCloseFriends = true
      }
    }

    return Array.from(stacksMap.values()).sort((a, b) => {
      if (a.hasUnread && !b.hasUnread) return -1
      if (!a.hasUnread && b.hasUnread) return 1
      return 0
    })
  }, [instants])

  const effectiveProfile = profile || loadedProfile
  const avatarPath = effectiveProfile?.avatar_url || user?.user_metadata?.avatar_url
  const ownDisplayName = effectiveProfile?.display_name || effectiveProfile?.username || user?.user_metadata?.display_name || user?.email || 'You'
  const ownInitial = (ownDisplayName.trim()[0] || 'Y').toUpperCase()
  const hasOwnActive = myInstants.length > 0

  // Combined stacks for continuous story viewer (own stories first, then friends)
  const userStoryStacks = useMemo(() => {
    const stacks = []
    if (hasOwnActive) {
      stacks.push({
        sender: effectiveProfile || {
          id: user?.id,
          username: user?.user_metadata?.username || 'you',
          display_name: 'Your Story',
          avatar_url: avatarPath,
        },
        isOwn: true,
        instants: myInstants,
        hasUnread: false,
        isCloseFriends: false,
      })
    }
    return [...stacks, ...friendStacks]
  }, [hasOwnActive, effectiveProfile, user?.id, user?.user_metadata?.username, avatarPath, myInstants, friendStacks])

  // Counts for dock pills
  const unreadStoriesCount = friendStacks.filter((s) => s.hasUnread).length
  const unviewedInstantsCount = instants.filter((i) => !i.is_viewed).length

  // Story Viewer open
  const handleOpenOwnStory = () => {
    if (hasOwnActive) {
      setActiveStoryUserIdx(0)
      setActiveStoryIdx(0)
      setStoryViewerOpen(true)
    } else {
      setCameraOpen(true)
    }
  }

  const handleOpenFriendStory = (stack) => {
    const stackIdx = userStoryStacks.findIndex((s) => s.sender.id === stack.sender.id)
    const firstUnreadIdx = Math.max(0, stack.instants.findIndex((i) => !i.is_viewed))
    setActiveStoryUserIdx(stackIdx >= 0 ? stackIdx : 0)
    setActiveStoryIdx(firstUnreadIdx)
    setStoryViewerOpen(true)
  }

  // Instant Viewer open
  const handleOpenInstant = (instant) => {
    setSelectedInstantId(instant.id)
    setInstantViewerOpen(true)
  }

  const handleInstantViewerClose = () => {
    setInstantViewerOpen(false)
    setSelectedInstantId(null)
    loadInstants()
  }

  const handleStoryViewerClose = () => {
    setStoryViewerOpen(false)
    loadInstants()
  }

  const handleInstantSent = () => {
    loadInstants()
  }

  return (
    <>
      <div className={`floating-dock ${isCollapsed ? 'is-collapsed' : ''}`}>
        {/* Dock Header */}
        <div className="floating-dock-header">
          <div className="floating-dock-tabs">
            <button
              type="button"
              className={`floating-dock-tab ${dockTab === 'stories' ? 'is-active' : ''}`}
              onClick={() => {
                setDockTab('stories')
                if (isCollapsed) setIsCollapsed(false)
              }}
            >
              <span>Stories</span>
              {unreadStoriesCount > 0 && (
                <span className="dock-pill-badge">{unreadStoriesCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`floating-dock-tab ${dockTab === 'instants' ? 'is-active' : ''}`}
              onClick={() => {
                setDockTab('instants')
                if (isCollapsed) setIsCollapsed(false)
              }}
            >
              <span>Instants</span>
              {unviewedInstantsCount > 0 ? (
                <span className="dock-pill-badge dock-pill-badge--glow">{unviewedInstantsCount}</span>
              ) : (
                <span className="dock-pill-count">{instants.length}</span>
              )}
            </button>

            <button
              type="button"
              className={`floating-dock-tab floating-dock-tab--subtle ${dockTab === 'all' ? 'is-active' : ''}`}
              onClick={() => {
                setDockTab('all')
                if (isCollapsed) setIsCollapsed(false)
              }}
            >
              <span>All</span>
            </button>
          </div>

          <div className="floating-dock-actions">
            <button
              type="button"
              className="instant-icon-btn instant-icon-btn--small"
              onClick={() => setCameraOpen(true)}
              title="Add to Story / Send Instant"
              aria-label="Add to Story or Send Instant"
            >
              <Camera size={14} color="#00d9f5" />
            </button>
            <button
              type="button"
              className="instant-icon-btn instant-icon-btn--small"
              onClick={() => setCloseFriendsOpen(true)}
              title="Manage Close Friends"
              aria-label="Manage Close Friends"
            >
              <Star size={14} color="#10b981" />
            </button>
            <button
              type="button"
              className="instant-icon-btn instant-icon-btn--small"
              onClick={() => setArchiveOpen(true)}
              title="Sent Instants Archive"
              aria-label="Sent Instants Archive"
            >
              <Archive size={14} color="#38bdf8" />
            </button>
            <button
              type="button"
              className="instant-icon-btn instant-icon-btn--small"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? 'Expand Dock' : 'Collapse Dock'}
              aria-label={isCollapsed ? 'Expand Dock' : 'Collapse Dock'}
            >
              {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
        </div>

        {/* Collapsed Pill Summary */}
        {isCollapsed && (
          <div
            className="floating-dock-collapsed-bar"
            onClick={() => setIsCollapsed(false)}
            role="button"
            tabIndex={0}
            title="Expand stories & instants dock"
          >
            <Zap size={14} color="#00d9f5" />
            <span>
              {hasOwnActive ? 'Your Story active' : 'Add Story'} • {friendStacks.length} Friends • {unviewedInstantsCount} New Snaps
            </span>
            <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
          </div>
        )}

        {/* Expanded Body Content */}
        {!isCollapsed && (
          <div className="floating-dock-body">
            {/* 1. STORIES ROW */}
            {(dockTab === 'stories' || dockTab === 'all') && (
              <div className="dock-stories-row-container">
                {dockTab === 'all' && (
                  <div className="dock-row-subtitle">
                    <span>Stories</span>
                    <small>{friendStacks.length + (hasOwnActive ? 1 : 0)}</small>
                  </div>
                )}
                <div className="dock-horizontal-scroll">
                  {/* User's own story bubble */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="instant-bubble-item"
                    onClick={handleOpenOwnStory}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleOpenOwnStory()
                      }
                    }}
                    title={hasOwnActive ? 'View your active story' : 'Add to your story'}
                  >
                    <div className={`instant-avatar-ring ${hasOwnActive ? 'is-own-active' : 'is-viewed'}`}>
                      <div className="instant-avatar-inner">
                        {avatarPath ? (
                          <ProtectedMediaImage
                            path={avatarPath}
                            alt={ownDisplayName}
                            className="instant-avatar-img"
                            fallback={<span>{ownInitial}</span>}
                          />
                        ) : (
                          <span>{ownInitial}</span>
                        )}
                      </div>
                      <div
                        className="instant-create-icon"
                        role="button"
                        tabIndex={0}
                        title="Add to story"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCameraOpen(true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation()
                            e.preventDefault()
                            setCameraOpen(true)
                          }
                        }}
                      >
                        <Plus size={12} />
                      </div>
                    </div>
                    <span className={`instant-bubble-label ${hasOwnActive ? 'is-unread' : ''}`}>
                      Your Story
                    </span>
                  </div>

                  {/* Friends' Stories */}
                  {friendStacks.map((stack) => {
                    const senderName = stack.sender?.display_name || stack.sender?.username || 'Member'
                    const firstName = senderName.split(' ')[0]
                    return (
                      <button
                        key={stack.sender.id}
                        type="button"
                        className="instant-bubble-item"
                        onClick={() => handleOpenFriendStory(stack)}
                        title={`${senderName}'s Stories (${stack.instants.length})`}
                      >
                        <div
                          className={`instant-avatar-ring ${stack.hasUnread ? 'is-unread' : 'is-viewed'} ${
                            stack.isCloseFriends ? 'is-close-friends' : ''
                          }`}
                        >
                          <div className="instant-avatar-inner">
                            {stack.sender?.avatar_url ? (
                              <ProtectedMediaImage
                                path={stack.sender.avatar_url}
                                alt={senderName}
                                className="instant-avatar-img"
                                fallback={<span>{senderName[0].toUpperCase()}</span>}
                              />
                            ) : (
                              <span>{senderName[0].toUpperCase()}</span>
                            )}
                          </div>
                          {stack.instants.length > 1 && (
                            <div className="instant-count-badge">
                              {stack.instants.length}
                            </div>
                          )}
                        </div>
                        <span className={`instant-bubble-label ${stack.hasUnread ? 'is-unread' : ''}`}>
                          {firstName}
                        </span>
                      </button>
                    )
                  })}

                  {!friendStacks.length && (
                    <div className="dock-empty-hint">
                      <span>No active friend stories</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. INSTANTS ROW */}
            {(dockTab === 'instants' || dockTab === 'all') && (
              <div className="dock-instants-row-container">
                {dockTab === 'all' && (
                  <div className="dock-row-subtitle">
                    <span>Instants</span>
                    <small>{instants.length}</small>
                  </div>
                )}
                <div className="dock-horizontal-scroll">
                  {instants.map((item) => {
                    const senderName = item.sender?.display_name || item.sender?.username || 'Member'
                    const firstName = senderName.split(' ')[0]
                    const isUnseen = !item.is_viewed
                    const isCloseFriends = item.audience_type === 'close_friends'
                    const timeAgo = formatTimeAgo(item.created_at)

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`instant-card-preview ${isUnseen ? 'is-unseen' : 'is-seen'} ${
                          isCloseFriends ? 'is-close-friends' : ''
                        }`}
                        onClick={() => handleOpenInstant(item)}
                        title={`Instant from ${senderName} (${isUnseen ? 'Unopened · View once' : 'Viewed'})`}
                      >
                        {/* Top: Avatar & Name */}
                        <div className="instant-card-header">
                          <div className="instant-card-avatar">
                            {item.sender?.avatar_url ? (
                              <ProtectedMediaImage
                                path={item.sender.avatar_url}
                                alt={senderName}
                                className="instant-avatar-img"
                                fallback={<span>{senderName[0].toUpperCase()}</span>}
                              />
                            ) : (
                              <span>{senderName[0].toUpperCase()}</span>
                            )}
                          </div>
                          <span className="instant-card-sender">{firstName}</span>
                        </div>

                        {/* Middle: Icon badge */}
                        <div className="instant-card-body">
                          <div className="instant-card-icon-wrap">
                            <Zap size={16} />
                          </div>
                          <span className="instant-card-tag">
                            {isUnseen ? 'View once' : 'Opened'}
                          </span>
                        </div>

                        {/* Bottom: Status & Time */}
                        <div className="instant-card-footer">
                          {isUnseen ? (
                            <span className="instant-unseen-dot" />
                          ) : (
                            <Check size={11} className="instant-seen-check" />
                          )}
                          <span className="instant-card-time">{timeAgo}</span>
                          {isCloseFriends && (
                            <Star size={10} color="#10b981" style={{ marginLeft: 'auto' }} />
                          )}
                        </div>
                      </button>
                    )
                  })}

                  {!instants.length && (
                    <div className="dock-empty-hint">
                      <span>No received Instants</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODALS */}

      {/* 1. Continuous Story Viewer */}
      <StoryViewerModal
        isOpen={storyViewerOpen}
        initialUserIndex={activeStoryUserIdx}
        initialStoryIndex={activeStoryIdx}
        userStoryStacks={userStoryStacks}
        onClose={handleStoryViewerClose}
        onReply={onReply}
        currentUserId={user?.id}
        ownProfile={effectiveProfile}
      />

      {/* 2. Continuous Instant Viewer */}
      {instantViewerOpen && (
        <InstantViewerModal
          instantId={selectedInstantId}
          instantsList={instants}
          onClose={handleInstantViewerClose}
          onReply={onReply}
          currentUserId={user?.id}
        />
      )}

      {/* 3. Camera Modal */}
      <InstantCameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onInstantSent={handleInstantSent}
        user={user}
      />

      {/* 4. Close Friends Modal */}
      <CloseFriendsModal
        isOpen={closeFriendsOpen}
        onClose={() => setCloseFriendsOpen(false)}
        user={user}
      />

      {/* 5. Sent Archive Modal */}
      <SentInstantsArchiveModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      />
    </>
  )
}
