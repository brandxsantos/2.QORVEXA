import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Users, LoaderCircle, Sparkles, BookOpen } from 'lucide-react'
import { fetchActiveStories, fetchMyActiveStories } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import StoryCreateModal from './StoryCreateModal.jsx'
import StoryViewerModal from './StoryViewerModal.jsx'
import './Instants.css'

function formatTimeAgo(isoString) {
  if (!isoString) return ''
  const diffMinutes = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const hours = Math.floor(diffMinutes / 60)
  return `${hours}h ago`
}

export default function StoriesTab({ user, profile, onReply }) {
  const [stories, setStories] = useState([])
  const [myStories, setMyStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadedProfile, setLoadedProfile] = useState(profile || null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [activeUserIdx, setActiveUserIdx] = useState(0)
  const [activeStoryIdx, setActiveStoryIdx] = useState(0)

  // Profile resolution
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

  const loadStories = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [receivedData, ownData] = await Promise.all([
        fetchActiveStories(),
        fetchMyActiveStories(user.id),
      ])
      setStories(receivedData || [])
      setMyStories(ownData || [])
    } catch (err) {
      console.error('Failed to load stories:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadStories()
  }, [loadStories])

  // Realtime subscription for stories
  useEffect(() => {
    if (!user?.id) return
    const client = getSupabaseClient()
    const channelName = `stories-tab-${user.id}`
    const channel = client
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'instant_recipients',
        filter: `recipient_id=eq.${user.id}`,
      }, () => {
        loadStories()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'instants',
      }, () => {
        loadStories()
      })
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [user?.id, loadStories])

  // Group received stories into friend stacks
  const friendStacks = useMemo(() => {
    const map = new Map()
    for (const item of stories) {
      const senderId = item.sender_id
      if (!map.has(senderId)) {
        map.set(senderId, {
          sender: item.sender,
          isOwn: false,
          instants: [],
          hasUnread: false,
          isCloseFriends: false,
        })
      }
      const stack = map.get(senderId)
      stack.instants.push(item)
      if (!item.is_viewed) stack.hasUnread = true
      if (item.audience_type === 'close_friends') stack.isCloseFriends = true
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.hasUnread && !b.hasUnread) return -1
      if (!a.hasUnread && b.hasUnread) return 1
      return 0
    })
  }, [stories])

  const effectiveProfile = profile || loadedProfile
  const avatarPath = effectiveProfile?.avatar_url || user?.user_metadata?.avatar_url
  const ownDisplayName = effectiveProfile?.display_name || effectiveProfile?.username || user?.user_metadata?.display_name || user?.email || 'You'
  const ownInitial = (ownDisplayName.trim()[0] || 'Y').toUpperCase()
  const hasOwnActive = myStories.length > 0

  // Combined stacks for continuous viewer (own stories first, then friends)
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
        instants: myStories,
        hasUnread: false,
        isCloseFriends: false,
      })
    }
    return [...stacks, ...friendStacks]
  }, [hasOwnActive, effectiveProfile, user?.id, user?.user_metadata?.username, avatarPath, myStories, friendStacks])

  const handleOpenOwnStory = () => {
    if (hasOwnActive) {
      setActiveUserIdx(0)
      setActiveStoryIdx(0)
      setViewerOpen(true)
    } else {
      setCreateModalOpen(true)
    }
  }

  const handleOpenFriendStory = (stack) => {
    const stackIdx = userStoryStacks.findIndex((s) => s.sender.id === stack.sender.id)
    const firstUnreadIdx = Math.max(0, stack.instants.findIndex((i) => !i.is_viewed))
    setActiveUserIdx(stackIdx >= 0 ? stackIdx : 0)
    setActiveStoryIdx(firstUnreadIdx)
    setViewerOpen(true)
  }

  return (
    <div className="stories-tab-container">
      {/* Header bar */}
      <div className="stories-tab-header">
        <div>
          <h2>Stories</h2>
          <p>24-hour visual posts from friends (repeat viewing supported)</p>
        </div>
        <button
          type="button"
          className="stories-add-btn"
          onClick={() => setCreateModalOpen(true)}
        >
          <Plus size={16} />
          <span>Add Story</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="stories-loading-box">
          <LoaderCircle size={28} className="animate-spin" />
          <span>Loading stories…</span>
        </div>
      ) : (
        <div className="stories-tab-content">
          {/* Section: Your Story */}
          <div className="stories-section">
            <span className="stories-section-title">Your Story</span>
            <div className="stories-cards-row">
              <div
                className={`story-profile-card ${hasOwnActive ? 'is-active-story' : 'is-create-story'}`}
                onClick={handleOpenOwnStory}
                role="button"
                tabIndex={0}
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
                    title="Add Story"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCreateModalOpen(true)
                    }}
                  >
                    <Plus size={13} />
                  </div>
                </div>
                <div className="story-profile-details">
                  <strong>Your Story</strong>
                  <span>{hasOwnActive ? `${myStories.length} active story` : 'Tap to add story'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Friends' Stories */}
          <div className="stories-section">
            <span className="stories-section-title">Friends' Updates ({friendStacks.length})</span>
            {friendStacks.length > 0 ? (
              <div className="stories-cards-grid">
                {friendStacks.map((stack) => {
                  const senderName = stack.sender?.display_name || stack.sender?.username || 'Member'
                  const latestStory = stack.instants[stack.instants.length - 1]
                  const timeAgo = formatTimeAgo(latestStory?.created_at)

                  return (
                    <div
                      key={stack.sender.id}
                      className={`story-friend-card ${stack.hasUnread ? 'is-unread-card' : ''}`}
                      onClick={() => handleOpenFriendStory(stack)}
                      role="button"
                      tabIndex={0}
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
                      <div className="story-friend-info">
                        <strong>{senderName}</strong>
                        <span>{timeAgo}</span>
                      </div>
                      {stack.hasUnread && <span className="story-card-unread-dot" />}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="stories-empty-panel">
                <Users size={32} />
                <p>No active stories from friends right now.</p>
                <small>Stories expire after 24 hours.</small>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Creation Modal */}
      <StoryCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onStoryPublished={loadStories}
        user={user}
      />

      {/* Continuous Viewer Modal */}
      <StoryViewerModal
        isOpen={viewerOpen}
        initialUserIndex={activeUserIdx}
        initialStoryIndex={activeStoryIdx}
        userStoryStacks={userStoryStacks}
        onClose={() => {
          setViewerOpen(false)
          loadStories()
        }}
        onReply={onReply}
        currentUserId={user?.id}
        ownProfile={effectiveProfile}
      />
    </div>
  )
}
