import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GripVertical,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Mic,
  Minus,
  Paperclip,
  Pause,
  Phone,
  Search,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import { useCall } from '../context/useCall.js'
import { getSupabaseClient, authorizeRealtimeSession } from '../lib/supabase.js'
import ProtectedMediaImage from './ProtectedMediaImage.jsx'

import CallReceipt from './CallReceipt.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import MessageInteractions from './MessageInteractions.jsx'
import { loadMessageInteractions, toggleMessageReaction } from '../lib/messageInteractions.js'
import {
  loadMessageAttachments,
  uploadAttachmentFile,
  detectAttachmentType,
  getFileExtension,
} from '../lib/messageAttachments.js'
import MediaLightboxModal from './MediaLightboxModal.jsx'
import { applyCallReceiptsToConversations } from '../lib/callPreview.js'
import MessageStatusIndicator from './MessageStatusIndicator.jsx'
import {
  conversationPeerReadAt,
  conversationPeerDeliveredAt,
  findLastSeenMessageId,
  markConversationDelivered,
  markConversationsDelivered,
} from '../lib/messageDelivery.js'
import './FloatingChatDock.css'

const profileFields = 'id, username, display_name, avatar_url, online_status_visibility'
const messageFields = 'id, conversation_id, sender_id, content, reply_to_message_id, created_at'

const baseConversationFields = 'id, user_low, user_high, user_low_last_read_at, user_high_last_read_at, created_at, updated_at'
const fullConversationFields = 'id, user_low, user_high, user_low_last_read_at, user_high_last_read_at, user_low_last_delivered_at, user_high_last_delivered_at, created_at, updated_at'
let activeFloatingConvFields = fullConversationFields

async function queryFloatingConversationsWithFallback(queryFn) {
  try {
    const primaryResult = await queryFn(activeFloatingConvFields)
    if (!primaryResult.error) return primaryResult

    if (activeFloatingConvFields !== baseConversationFields) {
      activeFloatingConvFields = baseConversationFields
      return await queryFn(baseConversationFields)
    }
    return primaryResult
  } catch (err) {
    if (activeFloatingConvFields !== baseConversationFields) {
      activeFloatingConvFields = baseConversationFields
      try {
        return await queryFn(baseConversationFields)
      } catch (fallbackErr) {
        return { data: [], error: fallbackErr }
      }
    }
    return { data: [], error: err }
  }
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat([], { timeStyle: 'short' }).format(new Date(value))
}

function formatVoiceTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

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

  const messagesByConversationRef = useRef(messagesByConversation)
  messagesByConversationRef.current = messagesByConversation
  const [replyMessagesByConversation, setReplyMessagesByConversation] = useState({})
  const [reactionsByConversation, setReactionsByConversation] = useState({})
  const [attachmentsByConversation, setAttachmentsByConversation] = useState({})
  const [lightboxMedia, setLightboxMedia] = useState(null)
  const [lightboxMediaList, setLightboxMediaList] = useState([])
  const [replyingToByConversation, setReplyingToByConversation] = useState({})
  const [reactionWorkingIds, setReactionWorkingIds] = useState([])

  const [callReceiptsByConversation, setCallReceiptsByConversation] = useState({})
  const messageContainerRefs = useRef({})
  const [drafts, setDrafts] = useState({})
  const [loadingIds, setLoadingIds] = useState([])
  const [sendingIds, setSendingIds] = useState([])
  const [pendingFilesByConversation, setPendingFilesByConversation] = useState({})
  const [uploadProgressByConversation, setUploadProgressByConversation] = useState({})
  const [voiceState, setVoiceState] = useState(null)
  const photoInputRefs = useRef({})
  const fileInputRefs = useRef({})
  const audioStreamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const [error, setError] = useState('')
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxTab, setInboxTab] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [creatingFriendId, setCreatingFriendId] = useState('')

  const [visibleSlotIds, setVisibleSlotIds] = useState([])
  const [overflowPanelOpen, setOverflowPanelOpen] = useState(false)
  const [dockTop, setDockTop] = useState(() => {
    try {
      const saved = localStorage.getItem('qorvexa_bubble_dock_top')
      if (saved !== null) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 10 && parsed < (typeof window !== 'undefined' ? window.innerHeight : 800) - 100) {
          return parsed
        }
      }
    } catch {}
    return null
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartYRef = useRef(0)
  const dragStartTopRef = useRef(0)
  const hasMovedRef = useRef(false)
  const dockRef = useRef(null)
  const overflowPanelRef = useRef(null)
  const overflowButtonRef = useRef(null)

  const loadConversations = useCallback(async () => {
    if (!user?.id) return

    const client = getSupabaseClient()

    const [friendshipsResult, conversationsResult, summariesResult, blocksResult, callsResult] = await Promise.all([
      client.from('friendships')
        .select('user_low, user_high')
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
        .limit(200),

      queryFloatingConversationsWithFallback((fields) =>
        client.from('conversations')
          .select(fields)
          .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
          .order('updated_at', { ascending: false })
          .limit(100)
      ),

      client.rpc('get_conversation_summaries'),

      client.from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', user.id),

      client.from('call_sessions')
        .select('id, conversation_id, caller_id, callee_id, call_type, status, created_at, accepted_at, ended_at')
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (friendshipsResult.error) throw friendshipsResult.error
    if (conversationsResult.error) throw conversationsResult.error
    if (summariesResult.error) throw summariesResult.error
    if (blocksResult.error) throw blocksResult.error

    const conversationData = conversationsResult.data || []

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
      return !blockedIds.has(peerId)
    })

    const peerIds = [...new Set([
      ...friendIds,
      ...rows.map((conversation) => (conversation.user_low === user.id ? conversation.user_high : conversation.user_low)),
    ])]

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

    const updatedConversations = applyCallReceiptsToConversations(
      rows,
      summariesById,
      callsResult.data || [],
      user.id,
      profileById
    )

    setConversations(updatedConversations)
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

      const loadedMessages = (data || []).reverse()
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: loadedMessages,
      }))

      // Non-blocking background enrichment for interactions, attachments, and read status
      Promise.all([
        loadMessageInteractions(client, loadedMessages).catch(() => ({ replyMessagesById: {}, reactionsByMessageId: {} })),
        loadMessageAttachments(client, (loadedMessages || []).map((m) => m.id)).catch(() => ({})),
      ]).then(([interactionData, atts]) => {
        setReplyMessagesByConversation((current) => ({
          ...current,
          [conversationId]: interactionData.replyMessagesById,
        }))
        setReactionsByConversation((current) => ({
          ...current,
          [conversationId]: interactionData.reactionsByMessageId,
        }))
        setAttachmentsByConversation((current) => ({
          ...current,
          [conversationId]: atts,
        }))
      })

      Promise.resolve(
        client.from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .eq('type', 'message')
          .eq('conversation_id', conversationId)
          .eq('is_read', false)
      ).catch(() => {})

      Promise.resolve(
        client.rpc('mark_conversation_read', {
          target_conversation_id: conversationId,
        })
      ).catch(() => {})
    } catch (loadError) {
      setError(loadError.message || 'Messages could not be loaded.')
    } finally {
      setLoadingIds((current) => current.filter((id) => id !== conversationId))
    }
  }, [user?.id])


  const loadCallReceipts = useCallback(async (conversationId) => {
    if (!conversationId) return

    setCallReceiptsByConversation((current) => ({ ...current, [conversationId]: null }))

    const { data, error: queryError } = await getSupabaseClient()
      .from('call_sessions')
      .select('id, conversation_id, caller_id, callee_id, call_type, status, created_at, accepted_at, ended_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (queryError) throw queryError

    setCallReceiptsByConversation((current) => ({
      ...current,
      [conversationId]: data || [],
    }))
  }, [])
  const openIdsRef = useRef(openIds)
  openIdsRef.current = openIds

  const loadMessagesRef = useRef(loadMessages)
  loadMessagesRef.current = loadMessages
  const loadCallReceiptsRef = useRef(loadCallReceipts)
  loadCallReceiptsRef.current = loadCallReceipts
  useEffect(() => {
    openIds.forEach((conversationId) => {
      const container = messageContainerRefs.current[conversationId]
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }, [messagesByConversation, callReceiptsByConversation, openIds])

  useEffect(() => {
    let active = true
    let hydratedFromNetwork = false

    function handleNetworkSynced(event) {
      if (!active) return
      const detail = event.detail
      if (detail?.conversations) {
        hydratedFromNetwork = true
        setConversations(detail.conversations)
      }
      if (detail?.friends) {
        setFriends(detail.friends)
      }
    }

    window.addEventListener('qorvexa:network-synced', handleNetworkSynced)

    // Defer standalone fetch slightly so NetworkPage never competes with FloatingChatDock at startup
    const timer = window.setTimeout(() => {
      if (!active || hydratedFromNetwork) return
      loadConversations().catch((loadError) => {
        if (active) setError(loadError.message || 'Conversations could not be loaded.')
      })
    }, 900)

    return () => {
      active = false
      window.clearTimeout(timer)
      window.removeEventListener('qorvexa:network-synced', handleNetworkSynced)
    }
  }, [loadConversations])

  useEffect(() => {
    if (!user?.id) return undefined

    const client = getSupabaseClient()
    let active = true
    let channel

    let debounceTimer = null
    const triggerDebouncedConversations = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadConversations().catch((loadError) => setError(loadError.message))
      }, 350)
    }

    authorizeRealtimeSession(client)
      .then(() => {
        if (!active) return

        channel = client.channel(`floating-chat-dock-${user.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'messages',
          }, (payload) => {
            const msg = payload?.new
            if (payload?.eventType === 'INSERT' && msg && msg.sender_id !== user.id) {
              if (openIdsRef.current.includes(msg.conversation_id)) {
                Promise.resolve(
                  getSupabaseClient().rpc('mark_conversation_read', {
                    target_conversation_id: msg.conversation_id,
                  })
                ).catch(() => {})
              } else {
                markConversationDelivered(getSupabaseClient(), msg.conversation_id).catch(() => {})
              }
            }
            triggerDebouncedConversations()

            openIdsRef.current.forEach((conversationId) => {
              loadMessagesRef.current(conversationId)
            })
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'message_reactions',
          }, (payload) => {
            const messageId = payload.new?.message_id || payload.old?.message_id
            if (!messageId) return

            for (const conversationId of openIdsRef.current) {
              const rows = messagesByConversationRef.current[conversationId] || []
              if (rows.some((message) => message.id === messageId)) {
                refreshFloatingInteractionsRef.current(conversationId)
                  .catch((loadError) => setError(loadError.message))
              }
            }
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'message_attachments',
          }, () => {
            openIdsRef.current.forEach((conversationId) => {
              refreshFloatingInteractionsRef.current(conversationId)
                .catch(() => {})
            })
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'call_sessions',
          }, (payload) => {
            triggerDebouncedConversations()
            const conversationId = payload.new?.conversation_id || payload.old?.conversation_id
            if (conversationId && openIdsRef.current.includes(conversationId)) {
              loadCallReceiptsRef.current(conversationId)
                .catch((loadError) => setError(loadError.message || 'Call receipts could not be loaded.'))
            }
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'friendships',
          }, () => {
            triggerDebouncedConversations()
          })
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'conversations',
          }, (payload) => {
            if (payload?.new) {
              setConversations((current) => current.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c)))
            }
            if (payload?.eventType !== 'UPDATE') {
              triggerDebouncedConversations()
            }
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

    const handleCallSessionUpdate = () => {
      triggerDebouncedConversations()
    }
    window.addEventListener('qorvexa:call-session-updated', handleCallSessionUpdate)

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener('qorvexa:call-session-updated', handleCallSessionUpdate)
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

      if (!Object.prototype.hasOwnProperty.call(callReceiptsByConversation, conversationId)) {
        loadCallReceipts(conversationId).catch((loadError) => {
          setError(loadError.message || 'Call receipts could not be loaded.')
          setCallReceiptsByConversation((current) => ({
            ...current,
            [conversationId]: [],
          }))
        })
      }
    })
  }, [openIds, messagesByConversation, loadingIds, loadMessages, callReceiptsByConversation, loadCallReceipts])

  // Clamping dockTop position on window resize
  useEffect(() => {
    function clampPosition() {
      if (!dockRef.current) return
      const dockHeight = dockRef.current.offsetHeight || 260
      const minTop = 16
      const maxTop = Math.max(minTop, window.innerHeight - dockHeight - 16)

      setDockTop((current) => {
        if (current === null) {
          return maxTop
        }
        return Math.max(minTop, Math.min(maxTop, current))
      })
    }

    clampPosition()
    window.addEventListener('resize', clampPosition)
    return () => window.removeEventListener('resize', clampPosition)
  }, [])

  // Outside click and Escape listener to dismiss overflow panel
  useEffect(() => {
    if (!overflowPanelOpen) return

    function handleOutside(e) {
      if (
        overflowPanelRef.current &&
        !overflowPanelRef.current.contains(e.target) &&
        overflowButtonRef.current &&
        !overflowButtonRef.current.contains(e.target)
      ) {
        setOverflowPanelOpen(false)
      }
    }

    function handleKey(e) {
      if (e.key === 'Escape') {
        setOverflowPanelOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [overflowPanelOpen])

  const activeConversations = useMemo(
    () => conversations.filter((conversation) => !hiddenIds.includes(conversation.id)),
    [conversations, hiddenIds],
  )

  // Keep visible slots in sync with active conversations and currently open chats
  useEffect(() => {
    setVisibleSlotIds((currentSlots) => {
      const validSlots = currentSlots.filter((id) =>
        activeConversations.some((c) => c.id === id)
      )

      let updated = [...validSlots]

      // Ensure any open chat is in visible slots (up to 3)
      for (const openId of openIds) {
        if (
          activeConversations.some((c) => c.id === openId) &&
          !updated.includes(openId)
        ) {
          if (updated.length < 3) {
            updated.push(openId)
          } else {
            const replaceIdx = updated.findIndex((id) => !openIds.includes(id))
            if (replaceIdx !== -1) {
              updated[replaceIdx] = openId
            }
          }
        }
      }

      // Fill remaining slots up to 3 with most recent active conversations
      if (updated.length < 3) {
        for (const conv of activeConversations) {
          if (!updated.includes(conv.id)) {
            updated.push(conv.id)
            if (updated.length >= 3) break
          }
        }
      }

      if (
        updated.length === currentSlots.length &&
        updated.every((id, idx) => id === currentSlots[idx])
      ) {
        return currentSlots
      }

      return updated
    })
  }, [activeConversations, openIds])

  const visibleBubbleConversations = useMemo(() => {
    return visibleSlotIds
      .map((id) => activeConversations.find((c) => c.id === id))
      .filter(Boolean)
      .slice(0, 3)
  }, [visibleSlotIds, activeConversations])

  const overflowConversations = useMemo(() => {
    const visibleSet = new Set(visibleBubbleConversations.map((c) => c.id))
    return activeConversations.filter((c) => !visibleSet.has(c.id))
  }, [activeConversations, visibleBubbleConversations])

  const overflowCount = overflowConversations.length

  const overflowUnreadCount = useMemo(() => {
    return overflowConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  }, [overflowConversations])

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

  const promoteToVisibleSlot = useCallback((conversationId) => {
    setHiddenIds((current) => current.filter((id) => id !== conversationId))

    setVisibleSlotIds((currentSlots) => {
      if (currentSlots.includes(conversationId)) {
        return currentSlots
      }

      if (currentSlots.length < 3) {
        return [...currentSlots, conversationId]
      }

      // 3 slots full. Replace least recently active conversation (prioritize non-open)
      const slotConvs = currentSlots.map((id) => conversations.find((c) => c.id === id))
      const nonOpen = slotConvs.filter((c) => c && !openIds.includes(c.id))
      const candidates = nonOpen.length > 0 ? nonOpen : slotConvs

      candidates.sort((a, b) => {
        const timeA = new Date(a?.lastMessage?.created_at || a?.updated_at || 0).getTime()
        const timeB = new Date(b?.lastMessage?.created_at || b?.updated_at || 0).getTime()
        return timeA - timeB
      })

      const demoteId = candidates[0]?.id || currentSlots[currentSlots.length - 1]
      return currentSlots.map((id) => (id === demoteId ? conversationId : id))
    })
  }, [conversations, openIds])

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
    promoteToVisibleSlot(conversationId)
    setOpenIds((current) => current.includes(conversationId)
      ? current
      : [...current, conversationId])
  }

  function handlePromoteFromOverflow(conversationId) {
    setOverflowPanelOpen(false)
    openChat(conversationId)
  }

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return

    if (
      e.target.closest('.floating-chat-bubble-close') ||
      e.target.closest('.floating-chat-overflow-panel') ||
      e.target.closest('.floating-inbox-panel') ||
      e.target.closest('.floating-chat-window')
    ) {
      return
    }

    dragStartYRef.current = e.clientY
    dragStartTopRef.current = dockRef.current?.getBoundingClientRect().top || (dockTop || 120)
    hasMovedRef.current = false

    const handlePointerMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - dragStartYRef.current
      if (!hasMovedRef.current && Math.abs(deltaY) > 5) {
        hasMovedRef.current = true
        setIsDragging(true)
      }

      if (hasMovedRef.current) {
        const dockHeight = dockRef.current?.offsetHeight || 260
        const minTop = 16
        const maxTop = Math.max(minTop, window.innerHeight - dockHeight - 16)
        const nextTop = Math.max(minTop, Math.min(maxTop, dragStartTopRef.current + deltaY))
        setDockTop(nextTop)
      }
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)

      if (hasMovedRef.current) {
        setTimeout(() => {
          hasMovedRef.current = false
          setIsDragging(false)
        }, 80)

        setDockTop((current) => {
          if (current !== null) {
            try {
              localStorage.setItem('qorvexa_bubble_dock_top', String(current))
            } catch {}
          }
          return current
        })
      } else {
        setIsDragging(false)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const refreshFloatingInteractions = useCallback(async (conversationId) => {
    const rows = messagesByConversationRef.current[conversationId] || []
    const client = getSupabaseClient()
    const result = await loadMessageInteractions(client, rows)

    setReplyMessagesByConversation((current) => ({
      ...current,
      [conversationId]: result.replyMessagesById,
    }))
    setReactionsByConversation((current) => ({
      ...current,
      [conversationId]: result.reactionsByMessageId,
    }))
    const atts = await loadMessageAttachments(client, (rows || []).map((m) => m.id))
    setAttachmentsByConversation((current) => ({
      ...current,
      [conversationId]: atts,
    }))
  }, [])

  const refreshFloatingInteractionsRef = useRef(refreshFloatingInteractions)
  refreshFloatingInteractionsRef.current = refreshFloatingInteractions

  async function handleFloatingReaction(conversationId, message, reactionType) {
    const workingKey = `${conversationId}:${message.id}`
    if (reactionWorkingIds.includes(workingKey)) return

    setReactionWorkingIds((current) => [...current, workingKey])
    try {
      await toggleMessageReaction(getSupabaseClient(), message.id, user.id, reactionType)
      await refreshFloatingInteractionsRef.current(conversationId)
    } catch (reactionError) {
      setError(reactionError.message || 'Reaction could not be saved.')
    } finally {
      setReactionWorkingIds((current) => current.filter((id) => id !== workingKey))
    }
  }

  function jumpToFloatingMessage(conversationId, messageId) {
    document.getElementById(`floating-chat-message-${messageId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function cancelVoiceRecording() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
    }
    if (voiceState?.audioUrl) {
      try {
        URL.revokeObjectURL(voiceState.audioUrl)
      } catch (_) {}
    }
    audioChunksRef.current = []
    setVoiceState(null)
  }

  function minimizeChat(conversationId) {
    if (voiceState?.conversationId === conversationId) {
      cancelVoiceRecording()
    }
    setOpenIds((current) => current.filter((id) => id !== conversationId))
  }

  function hideChat(conversationId) {
    if (voiceState?.conversationId === conversationId) {
      cancelVoiceRecording()
    }
    setOpenIds((current) => current.filter((id) => id !== conversationId))
    setHiddenIds((current) => [...new Set([...current, conversationId])])

    setVisibleSlotIds((currentSlots) => {
      const remaining = currentSlots.filter((id) => id !== conversationId)
      const nextCandidate = activeConversations.find(
        (c) => c.id !== conversationId && !remaining.includes(c.id)
      )
      if (nextCandidate && remaining.length < 3) {
        return [...remaining, nextCandidate.id]
      }
      return remaining
    })
  }

  // Cleanup voice recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  function handleSelectPhotos(event, conversationId) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const newItems = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: detectAttachmentType(file),
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))

    setPendingFilesByConversation((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] || []), ...newItems],
    }))

    event.target.value = ''
  }

  function handleSelectFiles(event, conversationId) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const newItems = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: detectAttachmentType(file),
      previewUrl: null,
    }))

    setPendingFilesByConversation((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] || []), ...newItems],
    }))

    event.target.value = ''
  }

  function removePendingFile(conversationId, fileId) {
    setPendingFilesByConversation((current) => {
      const list = current[conversationId] || []
      const toRemove = list.find((item) => item.id === fileId)
      if (toRemove?.previewUrl) {
        try {
          URL.revokeObjectURL(toRemove.previewUrl)
        } catch (_) {}
      }
      return {
        ...current,
        [conversationId]: list.filter((item) => item.id !== fileId),
      }
    })
  }

  async function startVoiceRecording(conversationId) {
    if (voiceState) {
      cancelVoiceRecording()
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream
      audioChunksRef.current = []

      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm'
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
        } else {
          mimeType = ''
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.start(250)
      setVoiceState({
        conversationId,
        status: 'recording',
        duration: 0,
        audioBlob: null,
        audioUrl: null,
        audioFile: null,
      })

      recordingTimerRef.current = setInterval(() => {
        setVoiceState((prev) => {
          if (!prev || prev.status !== 'recording') return prev
          return { ...prev, duration: prev.duration + 1 }
        })
      }, 1000)
    } catch (err) {
      console.error('[FloatingChatDock] Microphone error:', err)
      setError('Microphone permission is required to record voice messages.')
    }
  }

  async function stopAndPreviewVoiceRecording() {
    if (!mediaRecorderRef.current || !voiceState || voiceState.status !== 'recording') return
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    const recorder = mediaRecorderRef.current
    const convId = voiceState.conversationId
    const finalDuration = voiceState.duration

    await new Promise((resolve) => {
      recorder.onstop = resolve
      if (recorder.state !== 'inactive') {
        recorder.stop()
      } else {
        resolve()
      }
    })

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
    }

    const chunks = audioChunksRef.current || []
    if (!chunks.length) {
      setVoiceState(null)
      return
    }

    const mimeType = recorder.mimeType || 'audio/webm'
    const audioBlob = new Blob(chunks, { type: mimeType })
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
    const audioFile = new File([audioBlob], `voice-message-${Date.now()}.${ext}`, { type: audioBlob.type })
    const audioUrl = URL.createObjectURL(audioBlob)

    setVoiceState({
      conversationId: convId,
      status: 'preview',
      duration: finalDuration,
      audioBlob,
      audioUrl,
      audioFile,
    })
  }

  async function sendVoiceRecording(conversationId) {
    if (!voiceState || voiceState.conversationId !== conversationId) return
    if (sendingIds.includes(conversationId)) return

    let fileToSend = voiceState.audioFile

    if (voiceState.status === 'recording') {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      const recorder = mediaRecorderRef.current
      if (recorder) {
        await new Promise((resolve) => {
          recorder.onstop = resolve
          if (recorder.state !== 'inactive') {
            recorder.stop()
          } else {
            resolve()
          }
        })
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop())
        audioStreamRef.current = null
      }

      const chunks = audioChunksRef.current || []
      if (!chunks.length) {
        setVoiceState(null)
        return
      }

      const mimeType = recorder?.mimeType || 'audio/webm'
      const audioBlob = new Blob(chunks, { type: mimeType })
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
      fileToSend = new File([audioBlob], `voice-message-${Date.now()}.${ext}`, { type: audioBlob.type })
    }

    if (!fileToSend) {
      cancelVoiceRecording()
      return
    }

    setSendingIds((current) => [...current, conversationId])
    setError('')

    try {
      const client = getSupabaseClient()
      setUploadProgressByConversation((current) => ({
        ...current,
        [conversationId]: { current: 1, total: 1, percent: 50, name: 'Voice message' },
      }))

      const uploaded = await uploadAttachmentFile(client, conversationId, user.id, fileToSend)

      setUploadProgressByConversation((current) => ({
        ...current,
        [conversationId]: { current: 1, total: 1, percent: 100, name: 'Voice message' },
      }))

      const { data, error: insertError } = await client
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: '🎙️ Voice message',
          reply_to_message_id: replyingToByConversation[conversationId]?.id || null,
        })
        .select(messageFields)
        .single()

      if (insertError) throw insertError

      const { error: attInsertError } = await client
        .from('message_attachments')
        .insert([{
          message_id: data.id,
          conversation_id: conversationId,
          sender_id: user.id,
          storage_path: uploaded.storage_path,
          original_filename: uploaded.original_filename,
          file_size: uploaded.file_size,
          mime_type: uploaded.mime_type,
          attachment_type: 'audio',
          metadata: uploaded.metadata || {},
        }])

      if (attInsertError) throw attInsertError

      if (voiceState?.audioUrl) {
        try {
          URL.revokeObjectURL(voiceState.audioUrl)
        } catch (_) {}
      }
      audioChunksRef.current = []
      setVoiceState(null)
      setReplyingToByConversation((current) => ({ ...current, [conversationId]: null }))

      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] || []).filter((m) => m.id !== data.id),
          data,
        ],
      }))

      await refreshFloatingInteractions(conversationId)
      await loadConversations()
    } catch (sendError) {
      setError(sendError.message || 'Voice message could not be sent.')
    } finally {
      setSendingIds((current) => current.filter((id) => id !== conversationId))
      setUploadProgressByConversation((current) => ({
        ...current,
        [conversationId]: null,
      }))
    }
  }

  async function sendMessage(event, conversation) {
    event?.preventDefault?.()

    const conversationId = conversation.id
    const content = (drafts[conversationId] || '').trim()
    const pendingFiles = pendingFilesByConversation[conversationId] || []

    if ((!content && pendingFiles.length === 0) || sendingIds.includes(conversationId)) return

    setSendingIds((current) => [...current, conversationId])
    setError('')

    try {
      const client = getSupabaseClient()
      const uploadedAttachments = []

      if (pendingFiles.length > 0) {
        for (let i = 0; i < pendingFiles.length; i++) {
          const item = pendingFiles[i]
          setUploadProgressByConversation((current) => ({
            ...current,
            [conversationId]: {
              current: i + 1,
              total: pendingFiles.length,
              percent: Math.round((i / pendingFiles.length) * 100),
              name: item.name,
            },
          }))
          const uploaded = await uploadAttachmentFile(
            client,
            conversationId,
            user.id,
            item.file
          )
          uploadedAttachments.push(uploaded)
        }
        setUploadProgressByConversation((current) => ({
          ...current,
          [conversationId]: {
            current: pendingFiles.length,
            total: pendingFiles.length,
            percent: 100,
            name: '',
          },
        }))
      }

      const messageContent = content || (
        uploadedAttachments[0]?.attachment_type === 'photo' || uploadedAttachments[0]?.attachment_type === 'image'
          ? (uploadedAttachments.length > 1 ? `${uploadedAttachments.length} Photos` : 'Photo')
          : uploadedAttachments[0]?.attachment_type === 'video'
            ? 'Video'
            : uploadedAttachments[0]?.attachment_type === 'audio'
              ? '🎙️ Voice message'
              : uploadedAttachments[0]?.original_filename || 'Attachment'
      )

      const { data, error: insertError } = await client
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: messageContent,
          reply_to_message_id: replyingToByConversation[conversationId]?.id || null,
        })
        .select(messageFields)
        .single()

      if (insertError) throw insertError

      if (uploadedAttachments.length > 0) {
        const rowsToInsert = uploadedAttachments.map((att) => ({
          message_id: data.id,
          conversation_id: conversationId,
          sender_id: user.id,
          storage_path: att.storage_path,
          original_filename: att.original_filename,
          file_size: att.file_size,
          mime_type: att.mime_type,
          attachment_type: att.attachment_type === 'image' ? 'photo' : (att.attachment_type || 'file'),
          metadata: att.metadata || {},
        }))
        const { error: attInsertError } = await client
          .from('message_attachments')
          .insert(rowsToInsert)
        if (attInsertError) throw attInsertError
      }

      pendingFiles.forEach((item) => {
        if (item.previewUrl) {
          try { URL.revokeObjectURL(item.previewUrl) } catch (_) {}
        }
      })

      setPendingFilesByConversation((current) => ({ ...current, [conversationId]: [] }))
      setDrafts((current) => ({ ...current, [conversationId]: '' }))
      setReplyingToByConversation((current) => ({ ...current, [conversationId]: null }))

      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] || []).filter((message) => message.id !== data.id),
          data,
        ],
      }))

      await refreshFloatingInteractions(conversationId)
      await loadConversations()
    } catch (sendError) {
      const msg = sendError?.message || ''
      const friendlyError = msg.includes('Failed to fetch')
        ? 'Could not send message. Please check your connection and try again.'
        : msg || 'Message could not be sent.'
      setError(friendlyError)
    } finally {
      setSendingIds((current) => current.filter((id) => id !== conversationId))
      setUploadProgressByConversation((current) => ({
        ...current,
        [conversationId]: null,
      }))
    }
  }

  if (!user) return null

  return (
    <div
      ref={dockRef}
      className={`floating-chat-dock${isDragging ? ' is-dragging' : ''}`}
      style={dockTop !== null ? { top: `${dockTop}px`, bottom: 'auto' } : undefined}
    >
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
          const callReceipts = callReceiptsByConversation[conversationId] || []
          const callIds = new Set(callReceipts.map((s) => s.id))
          const textMessages = messages.filter(
            (m) => !(m.call_session_id && callIds.has(m.call_session_id)) && m.message_type !== 'call'
          )
          const timelineItems = [
            ...textMessages.map((message) => ({ ...message, timelineType: 'message' })),
            ...callReceipts.map((session) => ({ ...session, timelineType: 'call' })),
          ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

          const peerReadAt = conversationPeerReadAt(conversation, user?.id)
          const peerDeliveredAt = conversationPeerDeliveredAt(conversation, user?.id)
          const lastSeenId = findLastSeenMessageId(textMessages, user?.id, peerReadAt)

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
                {loadingIds.includes(conversationId) && !messages.length && !timelineItems.length && (
                  <p className="floating-chat-status">Loading messages…</p>
                )}

                {!loadingIds.includes(conversationId) && !timelineItems.length && (
                  <p className="floating-chat-status">Say hello and start the conversation.</p>
                )}

                {timelineItems.map((item) => item.timelineType === 'call'
                  ? (
                    <CallReceipt
                      key={`call-${item.id}`}
                      session={item}
                      currentUserId={user.id}
                    />
                  )
                  : (
                    <div
                      id={`floating-chat-message-${item.id}`}
                      className={`floating-chat-message-row${item.sender_id === user.id ? ' is-own-message' : ''}`}
                      key={item.id}
                    >
                      <MessageInteractions
                        bubbleClassName="floating-chat-message-bubble"
                        message={item}
                        replyMessage={replyMessagesByConversation[conversationId]?.[item.reply_to_message_id]}
                        reactions={reactionsByConversation[conversationId]?.[item.id] || []}
                        attachments={attachmentsByConversation[conversationId]?.[item.id] || []}
                        currentUserId={user.id}
                        footer={
                          <>
                            <time dateTime={item.created_at}>{formatTime(item.created_at)}</time>
                            {item.sender_id === user.id && (
                              <MessageStatusIndicator
                                message={item}
                                peerReadAt={peerReadAt}
                                peerDeliveredAt={peerDeliveredAt}
                                peer={peer}
                                isLastSeen={lastSeenId === item.id}
                              />
                            )}
                          </>
                        }
                        onReply={(message) => setReplyingToByConversation((current) => ({
                          ...current,
                          [conversationId]: message,
                        }))}
                        onReact={(message, type) => handleFloatingReaction(conversationId, message, type)}
                        onJump={(messageId) => jumpToFloatingMessage(conversationId, messageId)}
                        onOpenMedia={(attachment, list) => {
                          setLightboxMedia(attachment)
                          setLightboxMediaList(list && list.length ? list : [attachment])
                        }}
                      />
                    </div>
                  ))}
              </div>

              <form className="floating-chat-compose" onSubmit={(event) => sendMessage(event, conversation)}>
                {replyingToByConversation[conversationId] && (
                  <div className="floating-chat-replying">
                    <span>Replying to {replyingToByConversation[conversationId].sender_id === user.id ? 'yourself' : name}: {replyingToByConversation[conversationId].content}</span>
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      onClick={() => setReplyingToByConversation((current) => ({ ...current, [conversationId]: null }))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Pre-send attachments tray */}
                {(pendingFilesByConversation[conversationId] || []).length > 0 && (
                  <div className="qv-composer-attachments-tray">
                    {(pendingFilesByConversation[conversationId] || []).map((item) => (
                      <div key={item.id} className="qv-composer-attachment-item">
                        {item.previewUrl ? (
                          <img src={item.previewUrl} alt={item.name} className="qv-composer-attachment-thumb" />
                        ) : (
                          <div className="qv-composer-attachment-file-badge">
                            <span className="qv-composer-attachment-ext">{getFileExtension(item.name)}</span>
                          </div>
                        )}
                        <span className="qv-composer-attachment-name" title={item.name}>{item.name}</span>
                        <button
                          type="button"
                          className="qv-composer-attachment-remove"
                          onClick={() => removePendingFile(conversationId, item.id)}
                          title="Remove attachment"
                          aria-label={`Remove ${item.name}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload progress indicator */}
                {uploadProgressByConversation[conversationId] && (
                  <div className="qv-composer-upload-progress">
                    <div className="qv-composer-upload-progress-info">
                      <LoaderCircle size={13} className="spinner" />
                      <span>
                        Uploading {uploadProgressByConversation[conversationId].current} of {uploadProgressByConversation[conversationId].total}
                        {uploadProgressByConversation[conversationId].name ? ` — ${uploadProgressByConversation[conversationId].name}` : ''} ({uploadProgressByConversation[conversationId].percent}%)
                      </span>
                    </div>
                    <div className="qv-composer-upload-bar">
                      <div
                        className="qv-composer-upload-bar-fill"
                        style={{ width: `${uploadProgressByConversation[conversationId].percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Hidden file inputs */}
                <input
                  type="file"
                  ref={(el) => { photoInputRefs.current[conversationId] = el }}
                  accept="image/*,video/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleSelectPhotos(e, conversationId)}
                />
                <input
                  type="file"
                  ref={(el) => { fileInputRefs.current[conversationId] = el }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleSelectFiles(e, conversationId)}
                />

                {/* Voice recording bar OR voice preview bar OR standard inputs */}
                {voiceState?.conversationId === conversationId && voiceState.status === 'recording' ? (
                  <div className="qv-recording-bar floating-chat-recording-bar">
                    <div className="qv-recording-status">
                      <div className="qv-recording-dot" />
                      <span className="qv-recording-time">{formatVoiceTime(voiceState.duration)}</span>
                      <div className="qv-recording-waves">
                        <span /><span /><span /><span /><span />
                      </div>
                    </div>
                    <div className="qv-recording-actions">
                      <button
                        type="button"
                        className="qv-recording-cancel-btn"
                        onClick={cancelVoiceRecording}
                        title="Discard recording"
                        aria-label="Discard recording"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="floating-chat-record-preview-btn"
                        onClick={stopAndPreviewVoiceRecording}
                        title="Stop and preview voice message"
                        aria-label="Stop and preview voice message"
                      >
                        <Pause size={15} />
                      </button>
                      <button
                        type="button"
                        className="qv-recording-send-btn"
                        onClick={() => sendVoiceRecording(conversationId)}
                        title="Send voice message"
                        aria-label="Send voice message"
                        disabled={sendingIds.includes(conversationId)}
                      >
                        {sendingIds.includes(conversationId) ? (
                          <LoaderCircle size={16} className="spinner" />
                        ) : (
                          <Send size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                ) : voiceState?.conversationId === conversationId && voiceState.status === 'preview' ? (
                  <div className="floating-chat-voice-preview-bar">
                    <div className="floating-chat-voice-preview-player">
                      <audio
                        src={voiceState.audioUrl}
                        controls
                        controlsList="nodownload noplaybackrate"
                        className="floating-chat-preview-audio"
                      />
                    </div>
                    <div className="qv-recording-actions">
                      <button
                        type="button"
                        className="qv-recording-cancel-btn"
                        onClick={cancelVoiceRecording}
                        title="Discard recording"
                        aria-label="Discard recording"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="qv-recording-send-btn"
                        onClick={() => sendVoiceRecording(conversationId)}
                        title="Send voice message"
                        aria-label="Send voice message"
                        disabled={sendingIds.includes(conversationId)}
                      >
                        {sendingIds.includes(conversationId) ? (
                          <LoaderCircle size={16} className="spinner" />
                        ) : (
                          <Send size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="floating-chat-compose-inputs">
                    {/* 1. Photo / Video Button */}
                    <button
                      type="button"
                      className="floating-chat-compose-action-btn"
                      onClick={() => photoInputRefs.current[conversationId]?.click()}
                      aria-label="Attach photos or videos"
                      title="Photo / Video"
                      disabled={sendingIds.includes(conversationId)}
                    >
                      <ImageIcon size={17} />
                    </button>

                    {/* 2. Voice Message Button */}
                    <button
                      type="button"
                      className="floating-chat-compose-action-btn"
                      onClick={() => startVoiceRecording(conversationId)}
                      aria-label="Record voice message"
                      title="Voice message"
                      disabled={sendingIds.includes(conversationId)}
                    >
                      <Mic size={17} />
                    </button>

                    {/* 3. Document / File Button */}
                    <button
                      type="button"
                      className="floating-chat-compose-action-btn"
                      onClick={() => fileInputRefs.current[conversationId]?.click()}
                      aria-label="Attach document or file"
                      title="Attach file"
                      disabled={sendingIds.includes(conversationId)}
                    >
                      <Paperclip size={17} />
                    </button>

                    <textarea
                      aria-label={`Message ${name}`}
                      rows={1}
                      maxLength={4000}
                      placeholder={
                        (pendingFilesByConversation[conversationId] || []).length > 0
                          ? "Add a caption... (optional)"
                          : "Write a message…"
                      }
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
                      disabled={
                        (!(drafts[conversationId] || '').trim() &&
                          (pendingFilesByConversation[conversationId] || []).length === 0) ||
                        sendingIds.includes(conversationId)
                      }
                      aria-label="Send message"
                    >
                      {sendingIds.includes(conversationId) ? (
                        <LoaderCircle size={16} className="spinner" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>
                )}
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
                const isOwnMessage = conversation.lastMessage?.sender_id === user.id && !conversation.lastMessage?.isCall

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
      {/* Overflow Waiting List Panel */}
      {overflowPanelOpen && overflowConversations.length > 0 && (
        <section
          ref={overflowPanelRef}
          className="floating-chat-overflow-panel"
          aria-label="Waiting conversations"
        >
          <header className="floating-chat-overflow-header">
            <div>
              <strong>More conversations</strong>
              <span>{overflowCount} waiting</span>
            </div>
            <button
              type="button"
              onClick={() => setOverflowPanelOpen(false)}
              aria-label="Close waiting list"
              title="Close"
            >
              <X size={15} />
            </button>
          </header>
          <div className="floating-chat-overflow-list">
            {overflowConversations.map((conversation) => {
              const peer = conversation.peer
              if (!peer) return null
              const name = displayName(peer)
              const lastPreview = conversation.lastMessage?.content || `@${peer.username || 'member'}`

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className="floating-overflow-item"
                  onClick={() => handlePromoteFromOverflow(conversation.id)}
                >
                  <span className="floating-chat-avatar floating-chat-avatar--small">
                    <ProtectedMediaImage
                      path={peer.avatar_url}
                      alt=""
                      fallback={initials(name)}
                    />
                  </span>
                  <span className="floating-overflow-item-info">
                    <strong className="floating-overflow-item-name">{name}</strong>
                    <small className="floating-overflow-item-preview">{lastPreview}</small>
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="floating-chat-unread-inline">
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div
        className="floating-chat-bubbles"
        aria-label="Recent conversations"
        onPointerDown={handlePointerDown}
      >
        <div
          className="floating-chat-drag-handle"
          title="Drag to reposition chat heads"
          aria-label="Drag chat heads"
        >
          <GripVertical size={13} />
        </div>

        {visibleBubbleConversations.map((conversation) => {
          const peer = conversation.peer
          if (!peer) return null

          const name = displayName(peer)
          const isOpen = openIds.includes(conversation.id)

          return (
            <div className="floating-chat-bubble-wrap" key={conversation.id}>
              <button
                type="button"
                className={`floating-chat-bubble${isOpen ? ' is-open' : ''}`}
                onClick={(e) => {
                  if (hasMovedRef.current) {
                    e.preventDefault()
                    e.stopPropagation()
                    return
                  }
                  openChat(conversation.id)
                }}
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

        {overflowCount > 0 && (
          <div className="floating-chat-bubble-wrap floating-chat-overflow-wrap">
            <button
              ref={overflowButtonRef}
              type="button"
              className={`floating-chat-bubble floating-chat-overflow-bubble${overflowPanelOpen ? ' is-open' : ''}`}
              onClick={(e) => {
                if (hasMovedRef.current) {
                  e.preventDefault()
                  e.stopPropagation()
                  return
                }
                setOverflowPanelOpen((current) => !current)
              }}
              aria-label={`View ${overflowCount} more conversation${overflowCount === 1 ? '' : 's'}${overflowUnreadCount > 0 ? `, ${overflowUnreadCount} unread` : ''}`}
              title={`${overflowCount} more conversation${overflowCount === 1 ? '' : 's'}`}
              aria-expanded={overflowPanelOpen}
            >
              <span className="floating-chat-overflow-count">+{overflowCount}</span>
              {overflowUnreadCount > 0 && (
                <span className="floating-chat-unread">
                  {overflowUnreadCount > 99 ? '99+' : overflowUnreadCount}
                </span>
              )}
            </button>
          </div>
        )}

        <button
          type="button"
          className={`floating-chat-empty${inboxOpen ? ' is-active' : ''}`}
          onClick={(e) => {
            if (hasMovedRef.current) {
              e.preventDefault()
              e.stopPropagation()
              return
            }
            setInboxOpen((current) => !current)
          }}
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

      <MediaLightboxModal
        isOpen={Boolean(lightboxMedia)}
        activeMedia={lightboxMedia}
        mediaList={lightboxMediaList}
        onClose={() => setLightboxMedia(null)}
      />
    </div>
  )
}

export default FloatingChatDock
