import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Star, Archive } from 'lucide-react'
import { fetchActiveInstants } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import InstantCameraModal from './InstantCameraModal.jsx'
import InstantViewerModal from './InstantViewerModal.jsx'
import CloseFriendsModal from './CloseFriendsModal.jsx'
import SentInstantsArchiveModal from './SentInstantsArchiveModal.jsx'
import './Instants.css'

export default function InstantsBar({ user, onReply }) {
  const [instants, setInstants] = useState([])
  const [selectedInstantId, setSelectedInstantId] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false)

  const loadInstants = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await fetchActiveInstants()
      setInstants(data)
    } catch (err) {
      console.error('Failed to load instants:', err)
    }
  }, [user?.id])

  useEffect(() => {
    loadInstants()
  }, [loadInstants])

  // Realtime subscription for incoming instants and viewed changes
  useEffect(() => {
    if (!user?.id) return
    const client = getSupabaseClient()
    const channelName = `instants-inbox-${user.id}`
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

  const handleOpenStack = (stack) => {
    // Prefer opening the first unread instant; if all viewed, open the latest
    const unread = stack.instants.find((i) => !i.is_viewed)
    const target = unread || stack.instants[0]
    if (target) {
      setSelectedInstantId(target.id)
    }
  }

  const handleInstantSent = () => {
    loadInstants()
  }

  const handleViewerClose = () => {
    setSelectedInstantId(null)
    loadInstants()
  }

  return (
    <>
      <div className="instants-bar-container">
        {/* User's own capture bubble */}
        <button
          type="button"
          className="instant-bubble-item"
          onClick={() => setCameraOpen(true)}
          title="Capture and send an Instant"
        >
          <div className="instant-avatar-ring is-viewed">
            <div className="instant-avatar-inner">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Your avatar"
                  className="instant-avatar-img"
                />
              ) : (
                <span>{(user?.email || '?')[0].toUpperCase()}</span>
              )}
            </div>
            <div className="instant-create-icon">
              <Plus size={14} />
            </div>
          </div>
          <span className="instant-bubble-label">Instant</span>
        </button>

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
                    <img
                      src={stack.sender.avatar_url}
                      alt={senderName}
                      className="instant-avatar-img"
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
