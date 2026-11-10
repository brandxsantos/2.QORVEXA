import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Star, Archive } from 'lucide-react'
import { fetchActiveInstants, fetchMyActiveInstants } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import InstantCameraModal from './InstantCameraModal.jsx'
import InstantViewerModal from './InstantViewerModal.jsx'
import CloseFriendsModal from './CloseFriendsModal.jsx'
import SentInstantsArchiveModal from './SentInstantsArchiveModal.jsx'
import './Instants.css'

export default function InstantsBar({ user, profile, onReply }) {
  const [instants, setInstants] = useState([])
  const [myInstants, setMyInstants] = useState([])
  const [loadedProfile, setLoadedProfile] = useState(profile || null)
  const [selectedInstantId, setSelectedInstantId] = useState(null)
  const [isViewingOwn, setIsViewingOwn] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false)

  // Keep own profile updated with avatar_url
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
    const channelName = `instants-bar-${user.id}`
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

  // Group received instants by sender
  const senderStacks = useMemo(() => {
    const stacksMap = new Map()
    for (const item of instants) {
      const senderId = item.sender_id
      if (!stacksMap.has(senderId)) {
        stacksMap.set(senderId, {
          sender: item.sender,
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

  const handleOwnStoryClick = () => {
    if (myInstants.length > 0) {
      setIsViewingOwn(true)
      setSelectedInstantId(myInstants[0].id)
    } else {
      setCameraOpen(true)
    }
  }

  const handleOpenStack = (stack) => {
    // Prefer opening the first unread instant; if all viewed, open the latest
    const unread = stack.instants.find((i) => !i.is_viewed)
    const target = unread || stack.instants[0]
    if (target) {
      setIsViewingOwn(false)
      setSelectedInstantId(target.id)
    }
  }

  const handleInstantSent = () => {
    loadInstants()
  }

  const handleViewerClose = () => {
    setSelectedInstantId(null)
    setIsViewingOwn(false)
    loadInstants()
  }

  const hasOwnActive = myInstants.length > 0
  const effectiveProfile = profile || loadedProfile
  const avatarPath = effectiveProfile?.avatar_url || user?.user_metadata?.avatar_url
  const ownDisplayName = effectiveProfile?.display_name || effectiveProfile?.username || user?.user_metadata?.display_name || user?.email || 'You'
  const ownInitial = (ownDisplayName.trim()[0] || 'Y').toUpperCase()

  return (
    <>
      <div className="instants-bar-container">
        {/* User's own story bubble */}
        <div
          role="button"
          tabIndex={0}
          className="instant-bubble-item"
          onClick={handleOwnStoryClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleOwnStoryClick()
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
              <Plus size={14} />
            </div>
          </div>
          <span className={`instant-bubble-label ${hasOwnActive ? 'is-unread' : ''}`}>
            Your Story
          </span>
        </div>

        {/* Received Instants by sender */}
        {senderStacks.map((stack) => {
          const senderName = stack.sender?.display_name || stack.sender?.username || 'Member'
          const firstName = senderName.split(' ')[0]
          return (
            <button
              key={stack.sender.id}
              type="button"
              className="instant-bubble-item"
              onClick={() => handleOpenStack(stack)}
              title={`${senderName}'s Instant`}
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
              </div>
              <span className={`instant-bubble-label ${stack.hasUnread ? 'is-unread' : ''}`}>
                {firstName}
              </span>
            </button>
          )
        })}

        {/* Action icons: Close Friends & Sent Archive */}
        <div className="instant-bar-actions">
          <button
            type="button"
            className="instant-icon-btn"
            onClick={() => setCloseFriendsOpen(true)}
            title="Manage Close Friends"
            aria-label="Manage Close Friends"
          >
            <Star size={16} color="#10b981" />
          </button>
          <button
            type="button"
            className="instant-icon-btn"
            onClick={() => setArchiveOpen(true)}
            title="Sent Instants Archive"
            aria-label="Sent Instants Archive"
          >
            <Archive size={16} color="#06b6d4" />
          </button>
        </div>
      </div>

      {/* Modals */}
      <InstantCameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onInstantSent={handleInstantSent}
        user={user}
      />

      <InstantViewerModal
        instantId={selectedInstantId}
        isOwn={isViewingOwn}
        ownProfile={effectiveProfile}
        onClose={handleViewerClose}
        onReply={onReply}
        currentUserId={user?.id}
      />

      <CloseFriendsModal
        isOpen={closeFriendsOpen}
        onClose={() => setCloseFriendsOpen(false)}
        user={user}
      />

      <SentInstantsArchiveModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      />
    </>
  )
}
