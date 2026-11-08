import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Minus, Phone, Search, Send, Video, X } from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import { useCall } from '../context/useCall.js'
import { getSupabaseClient, authorizeRealtimeSession } from '../lib/supabase.js'
import ProtectedMediaImage from './ProtectedMediaImage.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import './FloatingChatDock.css'

const profileFields = 'id, username, display_name, avatar_url, online_status_visibility'
const messageFields = 'id, conversation_id, sender_id, content, created_at'

function displayName(profile) {
  return profile?.display_name || profile?.username || 'QORVEXA member'
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join('')
}

function FloatingChatDock() {
  const { user } = useAuth()
  const { call, startCall } = useCall()
  const [conversations, setConversations] = useState([])
  const [friends, setFriends] = useState([])
  const [openIds, setOpenIds] = useState([])
  const [hiddenIds, setHiddenIds] = useState([])
  const [messagesByConversation, setMessagesByConversation] = useState({})
  const messageContainerRefs = useRef({})
  const [drafts, setDrafts] = useState({})
  const [loadingIds, setLoadingIds] = useState([])
  const [sendingIds, setSendingIds] = useState([])
  const [error, setError] = useState('')
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxTab, setInboxTab] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [creatingFriendId, setCreatingFriendId] = useState('')

  const loadConversations = useCallback(async () => {
    if (!user?.id) return

    const client = getSupabaseClient()

    const [friendshipsResult, conversationsResult, summariesResult, blocksResult] = await Promise.all([
      client.from('friendships')
        .select('user_low, user_high')
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
        .limit(200),

      client.from('conversations')
        .select('id, user_low, user_high, user_low_last_read_at, user_high_last_read_at, created_at, updated_at')
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
        .order('updated_at', { ascending: false })
        .limit(100),

      client.rpc('get_conversation_summaries'),

      client.from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', user.id),
    ])

    if (friendshipsResult.error) throw friendshipsResult.error
    if (conversationsResult.error) throw conversationsResult.error
    if (summariesResult.error) throw summariesResult.error
    if (blocksResult.error) throw blocksResult.error

    const blockedIds = new Set((blocksResult.data || []).map((item) => item.blocked_id))

    const friendIds = new Set((friendshipsResult.data || [])
      .map((friendship) => (
        friendship.user_low === user.id ? friendship.user_high : friendship.user_low
      ))
      .filter((id) => !blockedIds.has(id)))

    const rows = (conversationsResult.data || []).filter((conversation) => {
      const peerId = conversation.user_low === user.id
        ? conversation.user_high
        : conversation.user_low
      return friendIds.has(peerId)
    })

    const peerIds = [...friendIds]

    let profileById = {}

    if (peerIds.length) {
      const profilesResult = await client.from('profiles')
        .select(profileFields)
        .in('id', peerIds)

      if (profilesResult.error) throw profilesResult.error

      profileById = Object.fromEntries(
        (profilesResult.data || []).map((profile) => [profile.id, profile]),
      )
    }

    setFriends(Object.values(profileById))

    const summariesById = Object.fromEntries(
      (summariesResult.data || []).map((summary) => [summary.conversation_id, summary]),
    )

    setConversations(rows.map((conversation) => {
      const peerId = conversation.user_low === user.id
        ? conversation.user_high
        : conversation.user_low
      const summary = summariesById[conversation.id]

      return {
        ...conversation,
        peer: profileById[peerId],
        lastMessage: summary?.last_message_id
          ? {
              id: summary.last_message_id,
              content: summary.last_message_content,
              sender_id: summary.last_message_sender_id,
              created_at: summary.last_message_created_at,
            }
          : null,
        unreadCount: Number(summary?.unread_count || 0),
      }
    }))
  }, [user?.id])

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return

    setLoadingIds((current) => current.includes(conversationId)
      ? current
      : [...current, conversationId])

    try {
      const client = getSupabaseClient()
      const { data, error: queryError } = await client.from('messages')
        .select(messageFields)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (queryError) throw queryError

      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: (data || []).reverse(),
      }))

      const { error: notificationError } = await client.from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('type', 'message')
        .eq('conversation_id', conversationId)
        .eq('is_read', false)

      if (notificationError) throw notificationError

      const { error: readError } = await client.rpc('mark_conversation_read', {
        target_conversation_id: conversationId,
      })

      if (readError) throw readError

      await loadConversations()
    } catch (loadError) {
      setError(loadError.message || 'Messages could not be loaded.')
    } finally {
      setLoadingIds((current) => current.filter((id) => id !== conversationId))
    }
  }, [loadConversations, user?.id])

  const openIdsRef = useRef(openIds)
  openIdsRef.current = openIds

  const loadMessagesRef = useRef(loadMessages)
  loadMessagesRef.current = loadMessages
  useEffect(() => {
    openIds.forEach((conversationId) => {
      const container = messageContainerRefs.current[conversationId]
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }, [messagesByConversation, openIds])

  useEffect(() => {
    let active = true

    loadConversations().catch((loadError) => {
      if (active) setError(loadError.message || 'Conversations could not be loaded.')
    })

    return () => {
      active = false
    }
  }, [loadConversations])

  useEffect(() => {
    if (!user?.id) return undefined

    const client = getSupabaseClient()
    let active = true
    let channel

    authorizeRealtimeSession(client)
      .then(() => {
        if (!active) return

        channel = client.channel(`floating-chat-dock-${user.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'messages',
          }, () => {
            loadConversations().catch((loadError) => setError(loadError.message))

            openIdsRef.current.forEach((conversationId) => {
              loadMessagesRef.current(conversationId)
            })
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'friendships',
          }, () => {
            loadConversations().catch((loadError) => setError(loadError.message))
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'conversations',
          }, () => {
            loadConversations().catch((loadError) => setError(loadError.message))
          })
          .subscribe((status) => {
            if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
              setError('Live chat updates are temporarily unavailable.')
            }
          })
      })
      .catch((channelError) => {
        if (active) {
          setError(channelError.message || 'Live chat could not connect.')
        }
      })

    return () => {
      active = false
      if (channel) client.removeChannel(channel)
    }
  }, [loadConversations, user?.id])

  useEffect(() => {
    openIds.forEach((conversationId) => {
      if (
        !messagesByConversation[conversationId] &&
        !loadingIds.includes(conversationId)
      ) {
        loadMessages(conversationId)
      }
    })
  }, [openIds, messagesByConversation, loadingIds, loadMessages])

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => !hiddenIds.includes(conversation.id)),
    [conversations, hiddenIds],
  )

  const unreadConversations = useMemo(
    () => conversations.filter((conversation) => conversation.unreadCount > 0),
    [conversations],
  )

  const inboxConversations = inboxTab === 'unread'
    ? unreadConversations
    : conversations

  const filteredFriends = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()

    return friends
      .filter((friend) => {
        if (!term) return true
        return `${friend.display_name || ''} ${friend.username || ''}`
          .toLowerCase()
          .includes(term)
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
  }, [friends, searchQuery])

  async function startFriendConversation(profile) {
    if (!profile?.id || creatingFriendId) return

    const existing = conversations.find((conversation) => (
      conversation.peer?.id === profile.id
    ))

    if (existing) {
      setInboxOpen(false)
      openChat(existing.id)
      return
    }

    setCreatingFriendId(profile.id)
    setError('')

    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc(
        'start_direct_conversation',
        { target_user_id: profile.id },
      )

      if (rpcError) throw rpcError

      await loadConversations()

      if (data) {
        setInboxOpen(false)
        openChat(data)
      } else {
        throw new Error('The conversation was created, but its ID was not returned.')
      }
    } catch (conversationError) {
      setError(conversationError.message || 'Could not open this conversation.')
    } finally {
      setCreatingFriendId('')
    }
  }

  function openChat(conversationId) {
    setError('')
    setHiddenIds((current) => current.filter((id) => id !== conversationId))
    setOpenIds((current) => current.includes(conversationId)
      ? current
      : [...current, conversationId])
  }

  function minimizeChat(conversationId) {
    setOpenIds((current) => current.filter((id) => id !== conversationId))
  }

  function hideChat(conversationId) {
    setOpenIds((current) => current.filter((id) => id !== conversationId))
    setHiddenIds((current) => [...new Set([...current, conversationId])])
  }

  async function sendMessage(event, conversation) {
    event.preventDefault()

    const conversationId = conversation.id
    const content = (drafts[conversationId] || '').trim()

    if (!content || sendingIds.includes(conversationId)) return

    setSendingIds((current) => [...current, conversationId])
    setError('')

    try {
      const { data, error: insertError } = await getSupabaseClient()
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
        })
        .select(messageFields)
        .single()

      if (insertError) throw insertError

      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] || []).filter((message) => message.id !== data.id),
          data,
        ],
      }))

      setDrafts((current) => ({ ...current, [conversationId]: '' }))
      await loadConversations()
    } catch (sendError) {
      setError(sendError.message || 'Message could not be sent.')
    } finally {
      setSendingIds((current) => current.filter((id) => id !== conversationId))
    }
  }

  if (!user) return null

  return (
    <div className="floating-chat-dock">
      {error && (
        <div className="floating-chat-error" role="status">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="floating-chat-windows">
        {openIds.map((conversationId, index) => {
          const conversation = conversations.find((item) => item.id === conversationId)
          if (!conversation?.peer) return null

          const peer = conversation.peer
          const name = displayName(peer)
          const messages = messagesByConversation[conversationId] || []

          return (
            <section
              className="floating-chat-window"
              key={conversationId}
              style={{ '--chat-window-index': index }}
              aria-label={`Chat with ${name}`}
            >
              <header className="floating-chat-header">
                <Link to={`/profile/${encodeURIComponent(peer.username || '')}`} className="floating-chat-peer">
                  <span className="floating-chat-avatar floating-chat-avatar--small">
                    <ProtectedMediaImage
                      path={peer.avatar_url}
                      alt=""
                      fallback={initials(name)}
                    />
                  </span>
                  <span className="floating-chat-peer-name">{name}</span>
                </Link>

                <div className="floating-chat-controls">
                  <button
                    type="button"
                    onClick={() => startCall(conversationId, 'audio')}
                    aria-label={`Start audio call with ${name}`}
                    title="Audio call"
                    disabled={Boolean(call)}
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCall(conversationId, 'video')}
                    aria-label={`Start video call with ${name}`}
                    title="Video call"
                    disabled={Boolean(call)}
                  >
                    <Video size={16} />
                  </button>
                  <button type="button" onClick={() => minimizeChat(conversationId)} aria-label="Minimize chat">
                    <Minus size={16} />
                  </button>
                  <button type="button" onClick={() => hideChat(conversationId)} aria-label="Close chat">
                    <X size={16} />
                  </button>
                </div>
              </header>

              <div className="floating-chat-messages" ref={(node) => { messageContainerRefs.current[conversationId] = node }}>
                {loadingIds.includes(conversationId) && !messages.length && (
                  <p className="floating-chat-status">Loading messages…</p>
                )}

                {!loadingIds.includes(conversationId) && !messages.length && (
                  <p className="floating-chat-status">Say hello and start the conversation.</p>
                )}

                {messages.map((message) => (
                  <div
                    className={`floating-chat-message${message.sender_id === user.id ? ' is-own-message' : ''}`}
                    key={message.id}
                  >
                    {message.content}
                  </div>
                ))}
              </div>

              <form className="floating-chat-compose" onSubmit={(event) => sendMessage(event, conversation)}>
                <textarea
                  aria-label={`Message ${name}`}
                  rows={1}
                  maxLength={4000}
                  placeholder="Write a message…"
                  value={drafts[conversationId] || ''}
                  onChange={(event) => setDrafts((current) => ({
                    ...current,
                    [conversationId]: event.target.value,
                  }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      event.currentTarget.form.requestSubmit()
                    }
                  }}
                />
                <EmojiPicker
                  onSelect={(emoji) => setDrafts((current) => ({
                    ...current,
                    [conversationId]: `${current[conversationId] || ''}${emoji}`,
                  }))}
                />
                <button
                  type="submit"
                  disabled={!(drafts[conversationId] || '').trim() || sendingIds.includes(conversationId)}
                  aria-label="Send message"
                >
                  <Send size={17} />
                </button>
              </form>
            </section>
          )
        })}
      </div>

      {inboxOpen && (
        <section className="floating-inbox-panel" aria-label="Messenger inbox">
          <header className="floating-inbox-header">
            <div>
              <strong>Messages</strong>
              <span>Your conversations</span>
            </div>
            <button
              type="button"
              onClick={() => setInboxOpen(false)}
              aria-label="Close inbox"
              title="Close inbox"
            >
              <X size={18} />
            </button>
          </header>

          <nav className="floating-inbox-tabs" aria-label="Inbox filters">
            <button
              type="button"
              className={inboxTab === 'recent' ? 'is-active' : ''}
              onClick={() => setInboxTab('recent')}
              aria-pressed={inboxTab === 'recent'}
            >
              Recent
            </button>
            <button
              type="button"
              className={inboxTab === 'unread' ? 'is-active' : ''}
              onClick={() => setInboxTab('unread')}
              aria-pressed={inboxTab === 'unread'}
            >
              Unread
              {unreadConversations.length > 0 && (
                <span className="floating-inbox-tab-count">
                  {unreadConversations.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={inboxTab === 'search' ? 'is-active' : ''}
              onClick={() => setInboxTab('search')}
              aria-pressed={inboxTab === 'search'}
            >
              <Search size={14} />
              Search
            </button>
          </nav>

          {inboxTab === 'search' ? (
            <div className="floating-inbox-search">
              <div className="floating-inbox-search-field">
                <Search size={16} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search friends..."
                  aria-label="Search friends"
                />
              </div>

              <div className="floating-inbox-list">
                {!searchQuery.trim() && (
                  <p className="floating-inbox-empty">
                    Search for a friend to start a conversation.
                  </p>
                )}

                {searchQuery.trim() && filteredFriends.map((friend) => {
                  const name = displayName(friend)

                  return (
                    <button
                      type="button"
                      className="floating-inbox-item"
                      key={friend.id}
                      onClick={() => startFriendConversation(friend)}
                      disabled={Boolean(creatingFriendId)}
                    >
                      <span className="floating-chat-avatar">
                        <ProtectedMediaImage
                          path={friend.avatar_url}
                          alt=""
                          fallback={initials(name)}
                        />
                      </span>
                      <span className="floating-inbox-item-copy">
                        <strong>{name}</strong>
                        <small>
                          {creatingFriendId === friend.id
                            ? 'Opening conversation…'
                            : `@${friend.username || 'member'}`}
                        </small>
                      </span>
                      <MessageCircle size={17} />
                    </button>
                  )
                })}

                {searchQuery.trim() && !filteredFriends.length && (
                  <p className="floating-inbox-empty">
                    No friends found matching that search.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="floating-inbox-list">
              {inboxConversations.filter((conversation) => conversation.peer).map((conversation) => {
                const peer = conversation.peer
                const name = displayName(peer)
                const preview = conversation.lastMessage?.content || 'Start a conversation'
                const isOwnMessage = conversation.lastMessage?.sender_id === user.id

                return (
                  <button
                    type="button"
                    className="floating-inbox-item"
                    key={conversation.id}
                    onClick={() => {
                      setInboxOpen(false)
                      openChat(conversation.id)
                    }}
                  >
                    <span className="floating-chat-avatar">
                      <ProtectedMediaImage
                        path={peer.avatar_url}
                        alt=""
                        fallback={initials(name)}
                      />
                    </span>
                    <span className="floating-inbox-item-copy">
                      <strong>{name}</strong>
                      <small>
                        {isOwnMessage ? 'You: ' : ''}
                        {preview}
                      </small>
                    </span>
                    {conversation.unreadCount > 0 && (
                      <span className="floating-inbox-unread">
                        {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                      </span>
                    )}
                  </button>
                )
              })}

              {!inboxConversations.some((conversation) => conversation.peer) && (
                <p className="floating-inbox-empty">
                  {inboxTab === 'unread'
                    ? 'You have no unread conversations.'
                    : 'No conversations yet. Search for a friend to say hello.'}
                </p>
              )}
            </div>
          )}

          <Link
            to="/app/messages"
            className="floating-inbox-view-all"
            onClick={() => setInboxOpen(false)}
          >
            View all messages
          </Link>
        </section>
      )}
      <div className="floating-chat-bubbles" aria-label="Recent conversations">
        {visibleConversations.map((conversation) => {
          const peer = conversation.peer
          if (!peer) return null

          const name = displayName(peer)
          const isOpen = openIds.includes(conversation.id)

          return (
            <div className="floating-chat-bubble-wrap" key={conversation.id}>
              <button
                type="button"
                className={`floating-chat-bubble${isOpen ? ' is-open' : ''}`}
                onClick={() => openChat(conversation.id)}
                aria-label={`Open chat with ${name}${conversation.unreadCount ? `, ${conversation.unreadCount} unread messages` : ''}`}
                title={name}
              >
                <ProtectedMediaImage
                  path={peer.avatar_url}
                  alt=""
                  fallback={initials(name)}
                />
                {conversation.unreadCount > 0 && (
                  <span className="floating-chat-unread">
                    {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="floating-chat-bubble-close"
                onClick={() => hideChat(conversation.id)}
                aria-label={`Hide ${name} from chat dock`}
                title="Hide chat bubble"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          className={`floating-chat-empty${inboxOpen ? ' is-active' : ''}`}
          onClick={() => setInboxOpen((current) => !current)}
          aria-label={inboxOpen ? 'Close Messenger inbox' : 'Open Messenger inbox'}
          title="Messenger inbox"
          aria-expanded={inboxOpen}
        >
          <MessageCircle size={23} />
          {unreadConversations.length > 0 && (
            <span className="floating-inbox-trigger-count">
              {unreadConversations.length > 99 ? '99+' : unreadConversations.length}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

export default FloatingChatDock
