import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Sparkles, Star, Users } from 'lucide-react'
import { fetchActiveStories, fetchMyActiveStories } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import StoryCreateModal from './StoryCreateModal.jsx'
import StoryViewerModal from './StoryViewerModal.jsx'
import './Instants.css'

function formatShortTime(isoString) {
  if (!isoString) return ''
  const diffMinutes = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diffMinutes < 1) return 'now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  const hours = Math.floor(diffMinutes / 60)
  return `${hours}h`
}

export default function StoriesPreviewTray({
  user,
  profile,
  className = '',
  onReply,
  showTitle = false,
}) {
  const [stories, setStories] = useState([])
  const [myStories, setMyStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadedProfile, setLoadedProfile] = useState(profile || null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createModalMode, setCreateModalMode] = useState('choose')
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
    if (!user?.id) {
      setLoading(false)
      return
    }
    try {
      const [receivedData, ownData] = await Promise.all([
        fetchActiveStories(),
        fetchMyActiveStories(user.id),
      ])
      setStories(receivedData || [])
      setMyStories(ownData || [])
    } catch (err) {
      console.warn('[StoriesPreviewTray] Load error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    setLoading(true)
    loadStories()
  }, [loadStories])

  // Realtime subscription for stories
  useEffect(() => {
    if (!user?.id) return
    const client = getSupabaseClient()
    const channelName = `stories-tray-${user.id}`
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
          latestCreatedAt: item.created_at,
        })
      }
      const stack = map.get(senderId)
      stack.instants.push(item)
      if (!item.is_viewed) stack.hasUnread = true
      if (item.audience_type === 'close_friends') stack.isCloseFriends = true
      if (new Date(item.created_at) > new Date(stack.latestCreatedAt)) {
        stack.latestCreatedAt = item.created_at
      }
    }

    // Sort: Unread first, then by latest update timestamp desc
    return Array.from(map.values()).sort((a, b) => {
      if (a.hasUnread && !b.hasUnread) return -1
      if (!a.hasUnread && b.hasUnread) return 1
      return new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt)
    })
  }, [stories])

  const effectiveProfile = profile || loadedProfile
  const avatarPath = effectiveProfile?.avatar_url || user?.user_metadata?.avatar_url
  const ownDisplayName = effectiveProfile?.display_name || effectiveProfile?.username || user?.user_metadata?.display_name || user?.email || 'You'
  const ownInitial = (ownDisplayName.trim()[0] || 'Y').toUpperCase()
  const hasOwnActive = myStories.length > 0

  // Stacks for viewer
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
      setCreateModalMode('choose')
      setCreateModalOpen(true)
    }
  }

  const handleOpenFriendStory = (stack) => {
    const stackIdx = userStoryStacks.findIndex((s) => s.sender?.id === stack.sender?.id)
    const firstUnreadIdx = Math.max(0, stack.instants.findIndex((i) => !i.is_viewed))
    setActiveUserIdx(stackIdx >= 0 ? stackIdx : 0)
    setActiveStoryIdx(firstUnreadIdx)
    setViewerOpen(true)
  }

  const handleStoryPublished = () => {
    loadStories()
    setTimeout(loadStories, 600)
    setTimeout(loadStories, 1800)
  }

  return (
    <div className={`stories-preview-tray-wrapper ${className}`}>
      {showTitle && (
        <div className="stories-tray-header">
          <span className="stories-tray-heading">Stories</span>
          {friendStacks.length > 0 && (
            <span className="stories-tray-count">{friendStacks.length}</span>
          )}
        </div>
      )}

      <div className="stories-preview-tray" role="region" aria-label="Stories preview">
        {/* 1. YOUR STORY ITEM */}
        <div className="stories-tray-item stories-tray-item--own">
          <div
            className={`stories-avatar-wrapper ${hasOwnActive ? 'is-active-story' : ''}`}
            onClick={handleOpenOwnStory}
            role="button"
            tabIndex={0}
            title={hasOwnActive ? 'View your story' : 'Add to your story'}
          >
            <div className={`instant-avatar-ring ${hasOwnActive ? 'is-own-active' : 'is-unseen-empty'}`}>
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
            </div>

            {/* Add Story Button overlay */}
            <button
              type="button"
              className="stories-tray-add-badge"
              title="Add Story"
              aria-label="Add Story"
              onClick={(e) => {
                e.stopPropagation()
                setCreateModalMode('choose')
                setCreateModalOpen(true)
              }}
            >
              <Plus size={12} strokeWidth={2.5} />
            </button>
          </div>
          <span className="stories-tray-name">Your story</span>
        </div>

        {/* 2. LOADING SKELETONS */}
        {loading && friendStacks.length === 0 && !hasOwnActive && (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stories-tray-item stories-tray-skeleton-item">
                <div className="stories-skeleton-circle animate-pulse" />
                <div className="stories-skeleton-label animate-pulse" />
              </div>
            ))}
          </>
        )}

        {/* 3. FRIENDS' STORIES */}
        {friendStacks.map((stack) => {
          const sender = stack.sender || {}
          const senderName = sender.display_name || sender.username || 'Member'
          const firstName = senderName.split(' ')[0]
          const latestStory = stack.instants[stack.instants.length - 1]
          const timeText = formatShortTime(latestStory?.created_at)

          return (
            <div
              key={sender.id || Math.random()}
              className={`stories-tray-item ${stack.hasUnread ? 'is-unread' : 'is-viewed'}`}
              onClick={() => handleOpenFriendStory(stack)}
              role="button"
              tabIndex={0}
              title={`${senderName}'s story (${timeText})`}
            >
              <div className="stories-avatar-wrapper">
                <div
                  className={`instant-avatar-ring ${
                    stack.hasUnread ? 'is-unread' : 'is-viewed'
                  } ${stack.isCloseFriends ? 'is-close-friends' : ''}`}
                >
                  <div className="instant-avatar-inner">
                    {sender.avatar_url ? (
                      <ProtectedMediaImage
                        path={sender.avatar_url}
                        alt={senderName}
                        className="instant-avatar-img"
                        fallback={<span>{senderName[0]?.toUpperCase()}</span>}
                      />
                    ) : (
                      <span>{senderName[0]?.toUpperCase()}</span>
                    )}
                  </div>
                </div>

                {/* Multiple stories badge */}
                {stack.instants.length > 1 && (
                  <span className="stories-tray-count-badge">
                    {stack.instants.length}
                  </span>
                )}
              </div>
              <span className="stories-tray-name">{firstName}</span>
            </div>
          )
        })}
      </div>

      {/* Creation Modal */}
      <StoryCreateModal
        isOpen={createModalOpen}
        initialMode={createModalMode}
        onClose={() => setCreateModalOpen(false)}
        onStoryPublished={handleStoryPublished}
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
