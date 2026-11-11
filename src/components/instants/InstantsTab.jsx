import { useState, useEffect, useCallback } from 'react'
import { Camera, Zap, Check, Star, LoaderCircle, Inbox, Send, AlertCircle } from 'lucide-react'
import { fetchActiveInstants, fetchSentInstants } from '../../lib/instants.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import InstantCameraModal from './InstantCameraModal.jsx'
import InstantViewerModal from './InstantViewerModal.jsx'
import CloseFriendsModal from './CloseFriendsModal.jsx'
import './Instants.css'

function formatTimeAgo(isoString) {
  if (!isoString) return ''
  const diffMinutes = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const hours = Math.floor(diffMinutes / 60)
  return `${hours}h ago`
}

export default function InstantsTab({ user, onReply }) {
  const [activeSubTab, setActiveSubTab] = useState('received') // 'received' | 'sent'
  const [instants, setInstants] = useState([])
  const [sentInstants, setSentInstants] = useState([])
  const [loading, setLoading] = useState(true)

  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [viewerModalOpen, setViewerModalOpen] = useState(false)
  const [selectedInstantId, setSelectedInstantId] = useState(null)
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [receivedData, sentData] = await Promise.all([
        fetchActiveInstants(),
        fetchSentInstants(),
      ])
      setInstants(receivedData || [])
      setSentInstants(sentData || [])
    } catch (err) {
      console.error('Failed to load instants:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Realtime subscription for incoming instants
  useEffect(() => {
    if (!user?.id) return
    const client = getSupabaseClient()
    const channelName = `instants-tab-${user.id}`
    const channel = client
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'instant_recipients',
        filter: `recipient_id=eq.${user.id}`,
      }, () => {
        loadData()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'instants',
      }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [user?.id, loadData])

  const unseenCount = instants.filter((i) => !i.is_viewed).length

  const handleOpenInstant = (instant) => {
    setSelectedInstantId(instant.id)
    setViewerModalOpen(true)
  }

  const handleViewerClose = () => {
    setViewerModalOpen(false)
    setSelectedInstantId(null)
    loadData()
  }

  return (
    <div className="instants-tab-container">
      {/* Header Bar */}
      <div className="instants-tab-header">
        <div>
          <h2>Instants</h2>
          <p>Camera-first spontaneous photo sharing with view-once protection</p>
        </div>
        <div className="instants-header-actions">
          <button
            type="button"
            className="instants-cf-btn"
            onClick={() => setCloseFriendsOpen(true)}
            title="Manage Close Friends"
          >
            <Star size={15} color="#10b981" />
            <span>Close Friends</span>
          </button>
          <button
            type="button"
            className="instants-capture-btn"
            onClick={() => setCameraModalOpen(true)}
          >
            <Camera size={16} />
            <span>Capture Instant</span>
          </button>
        </div>
      </div>

      {/* Sub-tabs: Received vs Sent */}
      <div className="instants-subtabs-row">
        <button
          type="button"
          className={`instants-subtab-btn ${activeSubTab === 'received' ? 'is-active' : ''}`}
          onClick={() => setActiveSubTab('received')}
        >
          <Inbox size={15} />
          <span>Received</span>
          {unseenCount > 0 ? (
            <span className="dock-pill-badge dock-pill-badge--glow">{unseenCount}</span>
          ) : (
            <span className="instants-subtab-count">{instants.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`instants-subtab-btn ${activeSubTab === 'sent' ? 'is-active' : ''}`}
          onClick={() => setActiveSubTab('sent')}
        >
          <Send size={15} />
          <span>Sent Snaps</span>
          <span className="instants-subtab-count">{sentInstants.length}</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="stories-loading-box">
          <LoaderCircle size={28} className="animate-spin" />
          <span>Loading Instants…</span>
        </div>
      ) : activeSubTab === 'received' ? (
        /* RECEIVED INBOX */
        <div className="instants-grid-layout">
          {instants.length > 0 ? (
            instants.map((item) => {
              const senderName = item.sender?.display_name || item.sender?.username || 'Member'
              const isUnopened = !item.is_viewed
              const isCloseFriends = item.audience_type === 'close_friends'
              const timeAgo = formatTimeAgo(item.created_at)

              return (
                <div
                  key={item.id}
                  className={`instant-inbox-card ${isUnopened ? 'is-unopened-card' : 'is-opened-card'}`}
                  onClick={() => handleOpenInstant(item)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="instant-inbox-card-top">
                    <div className="instant-card-avatar" style={{ width: 28, height: 28 }}>
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
                    <div className="instant-inbox-sender-meta">
                      <strong>{senderName}</strong>
                      <small>@{item.sender?.username}</small>
                    </div>
                    {isCloseFriends && (
                      <span className="instant-cf-pill">
                        <Star size={10} color="#10b981" />
                        CF
                      </span>
                    )}
                  </div>

                  <div className="instant-inbox-card-center">
                    <div className={`instant-status-badge ${isUnopened ? 'is-unopened' : 'is-opened'}`}>
                      {isUnopened ? (
                        <>
                          <Zap size={18} />
                          <span>Tap to view once</span>
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          <span>Already opened</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="instant-inbox-card-footer">
                    <span>{timeAgo}</span>
                    <span className="instant-rule-tag">View once</span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="stories-empty-panel">
              <Zap size={32} color="#00d9f5" />
              <p>No received Instants in your inbox right now.</p>
              <small>Instants are view-once and expire after 24 hours.</small>
            </div>
          )}
        </div>
      ) : (
        /* SENT ARCHIVE */
        <div className="instants-grid-layout">
          {sentInstants.length > 0 ? (
            sentInstants.map((item) => {
              const timeAgo = formatTimeAgo(item.created_at)
              const recipientCount = item.total_recipients || 0
              const viewedCount = item.viewed_count || 0

              return (
                <div key={item.id} className="instant-inbox-card is-opened-card">
                  <div className="instant-inbox-card-top">
                    <div className="instant-inbox-sender-meta">
                      <strong>Sent Instant</strong>
                      <small>{timeAgo}</small>
                    </div>
                    {item.audience_type === 'close_friends' && (
                      <span className="instant-cf-pill">
                        <Star size={10} color="#10b981" />
                        Close Friends
                      </span>
                    )}
                  </div>

                  <div className="instant-inbox-card-center">
                    <div className="instant-archive-stats-box">
                      <span><strong>{viewedCount}</strong> / {recipientCount} opened</span>
                    </div>
                  </div>

                  <div className="instant-inbox-card-footer">
                    <span>{item.caption ? `"${item.caption.slice(0, 30)}…"` : 'No caption'}</span>
                    <span className="instant-rule-tag">Private archive</span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="stories-empty-panel">
              <Send size={32} />
              <p>No sent Instants yet.</p>
              <small>Photos you send will be tracked here privately.</small>
            </div>
          )}
        </div>
      )}

      {/* Camera Modal */}
      <InstantCameraModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onInstantSent={loadData}
        user={user}
      />

      {/* Viewer Modal */}
      {viewerModalOpen && (
        <InstantViewerModal
          instantId={selectedInstantId}
          instantsList={instants}
          onClose={handleViewerClose}
          onReply={onReply}
          currentUserId={user?.id}
        />
      )}

      {/* Close Friends Modal */}
      <CloseFriendsModal
        isOpen={closeFriendsOpen}
        onClose={() => setCloseFriendsOpen(false)}
        user={user}
      />
    </div>
  )
}
