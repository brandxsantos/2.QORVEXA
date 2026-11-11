import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Users,
  LoaderCircle,
  Sparkles,
  Image as ImageIcon,
  Camera,
  Archive,
  Type,
  Eye,
  Star,
} from 'lucide-react'
import { fetchActiveStories, fetchMyActiveStories, fetchStoryArchive } from '../../lib/stories.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import StoryThumbnail from './StoryThumbnail.jsx'
import StoryStudioModal from './StoryStudioModal.jsx'
import StoryArchiveModal from './StoryArchiveModal.jsx'
import StoryViewerModal from './StoryViewerModal.jsx'
import StoriesPreviewTray from './StoriesPreviewTray.jsx'
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
  const [archiveStats, setArchiveStats] = useState({ totalStories: 0, totalViews: 0 })

  // Studio and Archive Modal states
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioMode, setStudioMode] = useState('choose') // 'choose' | 'camera' | 'gallery' | 'text'
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Fullscreen Viewer state
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
      const [receivedData, ownData, archiveData] = await Promise.all([
        fetchActiveStories(),
        fetchMyActiveStories(user.id),
        fetchStoryArchive(user.id).catch(() => []),
      ])
      setStories(receivedData || [])
      setMyStories(ownData || [])

      if (archiveData && archiveData.length) {
        const viewsCount = archiveData.reduce((acc, curr) => acc + (curr.view_count || 0), 0)
        setArchiveStats({ totalStories: archiveData.length, totalViews: viewsCount })
      }
    } catch (err) {
      console.warn('[StoriesLounge] Failed to load stories:', err)
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
    const channelName = `stories-lounge-${user.id}`
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instant_recipients',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          loadStories()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instants',
        },
        () => {
          loadStories()
        }
      )
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

    return Array.from(map.values()).sort((a, b) => {
      if (a.hasUnread && !b.hasUnread) return -1
      if (!a.hasUnread && b.hasUnread) return 1
      return new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt)
    })
  }, [stories])

  const effectiveProfile = profile || loadedProfile
  const avatarPath = effectiveProfile?.avatar_url || user?.user_metadata?.avatar_url
  const ownDisplayName =
    effectiveProfile?.display_name ||
    effectiveProfile?.username ||
    user?.user_metadata?.display_name ||
    user?.email ||
    'You'
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
      setStudioMode('choose')
      setStudioOpen(true)
    }
  }

  const handleOpenFriendStory = (stack) => {
    const stackIdx = userStoryStacks.findIndex((s) => s.sender?.id === stack.sender?.id)
    const firstUnreadIdx = Math.max(0, stack.instants.findIndex((i) => !i.is_viewed))
    setActiveUserIdx(stackIdx >= 0 ? stackIdx : 0)
    setActiveStoryIdx(firstUnreadIdx)
    setViewerOpen(true)
  }

  const handleOpenStudio = (mode = 'choose') => {
    setStudioMode(mode)
    setStudioOpen(true)
  }

  const handleStoryPublished = () => {
    loadStories()
    setTimeout(loadStories, 600)
    setTimeout(loadStories, 1800)
  }

  return (
    <div className="stories-lounge-container">
      {/* Lounge Header */}
      <div className="stories-lounge-header">
        <div className="stories-lounge-title-group">
          <div className="stories-lounge-badge">
            <Sparkles size={14} />
            <span>Stories Lounge</span>
          </div>
          <h1>Stories</h1>
          <p>Share 24-hour visual moments with friends and close circles</p>
        </div>

        <div className="stories-lounge-header-actions">
          <button
            type="button"
            className="stories-lounge-archive-btn"
            onClick={() => setArchiveOpen(true)}
            title="Browse Story Archive"
          >
            <Archive size={16} />
            <span>Archive</span>
            {archiveStats.totalStories > 0 && (
              <span className="stories-lounge-badge-pill">{archiveStats.totalStories}</span>
            )}
          </button>

          <button
            type="button"
            className="stories-lounge-studio-btn"
            onClick={() => handleOpenStudio('choose')}
          >
            <Sparkles size={16} />
            <span>Story Studio</span>
          </button>
        </div>
      </div>

      {/* Quick Visual Stories Preview Tray */}
      <div className="stories-lounge-tray-section">
        <StoriesPreviewTray
          user={user}
          profile={effectiveProfile}
          onReply={onReply}
          className="stories-lounge-tray"
        />
      </div>

      {/* Main Lounge Content */}
      <div className="stories-lounge-content">
        {/* 1. YOUR STORY SPOTLIGHT CARD */}
        <div className="stories-spotlight-card">
          {hasOwnActive && myStories[myStories.length - 1]?.image_path ? (
            /* Actual Uploaded Story Photo Preview Frame */
            <div
              className="stories-spotlight-story-preview"
              onClick={handleOpenOwnStory}
              role="button"
              tabIndex={0}
              title="View your active story"
            >
              <div className="stories-spotlight-thumb-wrap">
                <StoryThumbnail
                  imagePath={myStories[myStories.length - 1].image_path}
                  alt="Your active story preview"
                  className="stories-spotlight-thumb-img"
                  fallbackInitials={ownInitial}
                />
                <div className="stories-spotlight-thumb-gradient" />
              </div>

              {/* Owner Avatar Badge overlay in top-left */}
              <div className="stories-spotlight-thumb-top">
                <div className="story-owner-badge-ring">
                  <div className="story-owner-badge-inner">
                    {avatarPath ? (
                      <ProtectedMediaImage
                        path={avatarPath}
                        alt={ownDisplayName}
                        fallback={<span>{ownInitial}</span>}
                      />
                    ) : (
                      <span>{ownInitial}</span>
                    )}
                  </div>
                </div>
                {myStories.length > 1 && (
                  <span className="stories-spotlight-count-pill">{myStories.length} updates</span>
                )}
              </div>

              {/* Views indicator overlay in bottom */}
              <div className="stories-spotlight-thumb-bottom">
                <span className="stories-spotlight-view-tag">
                  <Eye size={12} />
                  <span>Tap to view</span>
                </span>
              </div>
            </div>
          ) : (
            /* Empty state: profile photo with attractive Add Story (+) indicator */
            <div
              className="stories-spotlight-avatar-box is-empty"
              onClick={() => handleOpenStudio('choose')}
              role="button"
              tabIndex={0}
              title="Add to your story"
            >
              <div className="instant-avatar-ring instant-avatar-ring--large is-unseen-empty">
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

              <button
                type="button"
                className="stories-spotlight-add-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  handleOpenStudio('choose')
                }}
                title="Add Story"
                aria-label="Add Story"
              >
                <Plus size={16} strokeWidth={2.8} />
              </button>
            </div>
          )}

          <div className="stories-spotlight-info">
            <div className="stories-spotlight-title-row">
              <h3>Your Story</h3>
              {hasOwnActive && (
                <span className="stories-spotlight-active-tag">Active 24h</span>
              )}
            </div>

            <p className="stories-spotlight-desc">
              {hasOwnActive
                ? `${myStories.length} active ${myStories.length === 1 ? 'update' : 'updates'} published · Tap preview to view`
                : 'Share a photo, text update, or creative canvas with your friends.'}
            </p>

            <div className="stories-spotlight-actions">
              <button
                type="button"
                className="stories-spotlight-action-pill is-primary"
                onClick={() => handleOpenStudio('choose')}
              >
                <Plus size={14} />
                <span>{hasOwnActive ? 'Add to Story' : 'New Story'}</span>
              </button>

              <button
                type="button"
                className="stories-spotlight-action-pill"
                onClick={() => handleOpenStudio('camera')}
              >
                <Camera size={14} />
                <span>Camera</span>
              </button>

              <button
                type="button"
                className="stories-spotlight-action-pill"
                onClick={() => handleOpenStudio('gallery')}
              >
                <ImageIcon size={14} />
                <span>Gallery</span>
              </button>

              <button
                type="button"
                className="stories-spotlight-action-pill"
                onClick={() => handleOpenStudio('text')}
              >
                <Type size={14} />
                <span>Text Story</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. RECENT STORIES EDITORIAL GRID */}
        <div className="stories-feed-section">
          <div className="stories-feed-header">
            <div className="stories-feed-title-wrap">
              <h2>Recent Stories</h2>
              {friendStacks.length > 0 && (
                <span className="stories-feed-count">{friendStacks.length}</span>
              )}
            </div>
            <span className="stories-feed-subtitle">Stories expire after 24 hours</span>
          </div>

          {loading && friendStacks.length === 0 ? (
            <div className="stories-editorial-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="story-card-skeleton animate-pulse">
                  <div className="story-skeleton-header" />
                  <div className="story-skeleton-footer" />
                </div>
              ))}
            </div>
          ) : friendStacks.length > 0 ? (
            <div className="stories-editorial-grid">
              {friendStacks.map((stack) => {
                const senderName = stack.sender?.display_name || stack.sender?.username || 'Member'
                const latestStory = stack.instants[stack.instants.length - 1]
                const timeAgo = formatTimeAgo(latestStory?.created_at)

                return (
                  <div
                    key={stack.sender?.id || Math.random()}
                    className={`stories-editorial-card ${stack.hasUnread ? 'is-unread-card' : ''}`}
                    onClick={() => handleOpenFriendStory(stack)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Media Thumbnail */}
                    <div className="stories-editorial-media-wrapper">
                      <StoryThumbnail
                        imagePath={latestStory?.image_path}
                        alt={`${senderName}'s story`}
                        className="stories-editorial-thumbnail"
                        fallbackInitials={senderName[0]}
                      />
                      <div className="stories-editorial-gradient" />
                    </div>

                    {/* Top Overlay: Avatar + Ring + Unread Dot */}
                    <div className="stories-editorial-top">
                      <div
                        className={`instant-avatar-ring instant-avatar-ring--small ${
                          stack.hasUnread ? 'is-unread' : 'is-viewed'
                        } ${stack.isCloseFriends ? 'is-close-friends' : ''}`}
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
                      </div>

                      {stack.isCloseFriends && (
                        <span className="story-close-friends-pill">
                          <Star size={10} /> Close Friends
                        </span>
                      )}

                      {stack.hasUnread && <span className="stories-unread-badge" />}
                    </div>

                    {/* Bottom Overlay: Sender Name, Caption, Time */}
                    <div className="stories-editorial-bottom">
                      <strong className="stories-editorial-sender">{senderName}</strong>
                      {latestStory?.caption && (
                        <p className="stories-editorial-caption">{latestStory.caption}</p>
                      )}
                      <div className="stories-editorial-meta">
                        <span className="stories-editorial-time">{timeAgo}</span>
                        {stack.instants.length > 1 && (
                          <span className="stories-editorial-count">
                            {stack.instants.length} updates
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="stories-empty-lounge">
              <div className="stories-empty-icon-wrap">
                <Users size={36} />
              </div>
              <h3>No Active Stories</h3>
              <p>When friends in your circle share moments, they will appear here in your Lounge.</p>
              <button
                type="button"
                className="stories-empty-create-btn"
                onClick={() => handleOpenStudio('choose')}
              >
                <Plus size={16} />
                <span>Share a Story</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Story Studio Composer Modal */}
      {studioOpen && (
        <StoryStudioModal
          isOpen={studioOpen}
          initialMode={studioMode}
          onClose={() => setStudioOpen(false)}
          onStoryPublished={handleStoryPublished}
          user={user}
        />
      )}

      {/* Story Archive Modal */}
      <StoryArchiveModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        user={user}
        onStoryReposted={handleStoryPublished}
      />

      {/* Fullscreen Story Viewer Modal */}
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
