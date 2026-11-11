import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Bookmark,
  Check,
  CheckCheck,
  Clock3,
  Compass,
  Image as ImageIcon,
  Images,
  Mic,
  Paperclip,
  Rss,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Phone,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Video,
  Users,
  X,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import CallReceipt from '../components/CallReceipt.jsx'
import { useAuth } from '../context/useAuth.js'
import { useCall } from '../context/useCall.js'
import { authorizeRealtimeSession, getSupabaseClient } from '../lib/supabase.js'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import NotificationToast from '../components/NotificationToast.jsx'
import notificationToastText from '../lib/notificationToastText.js'
import ReportDialog from '../components/ReportDialog.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'
import AccountMenu from '../components/AccountMenu.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import MessageInteractions from '../components/MessageInteractions.jsx'
import { loadMessageInteractions, toggleMessageReaction } from '../lib/messageInteractions.js'
import { uploadAttachmentFile, loadMessageAttachments } from '../lib/messageAttachments.js'
import MediaLightboxModal from '../components/MediaLightboxModal.jsx'
import SharedMediaPanel from '../components/SharedMediaPanel.jsx'
import { applyCallReceiptsToConversations } from '../lib/callPreview.js'
import MessageStatusIndicator from '../components/MessageStatusIndicator.jsx'
import {
  conversationPeerReadAt,
  conversationPeerDeliveredAt,
  findLastSeenMessageId,
  markConversationDelivered,
  markConversationsDelivered,
} from '../lib/messageDelivery.js'
import StoriesTab from '../components/instants/StoriesTab.jsx'
import StoryViewerModal from '../components/instants/StoryViewerModal.jsx'
import StoriesPreviewTray from '../components/instants/StoriesPreviewTray.jsx'
import { getStoryForViewer } from '../lib/instants.js'

const profileFields = 'id, username, display_name, bio, avatar_url, profile_visibility, online_status_visibility'
const requestFields = 'id, sender_id, receiver_id, status, created_at'
const baseMessageFields = 'id, conversation_id, sender_id, content, reply_to_message_id, created_at'
const fullMessageFields = 'id, conversation_id, sender_id, content, reply_to_message_id, message_type, story_id, story_metadata, created_at'
let activeMessageFields = fullMessageFields

const baseConversationFields = 'id, user_low, user_high, user_low_last_read_at, user_high_last_read_at, created_at, updated_at'
const fullConversationFields = 'id, user_low, user_high, user_low_last_read_at, user_high_last_read_at, user_low_last_delivered_at, user_high_last_delivered_at, created_at, updated_at'
let activeConversationFields = fullConversationFields

async function queryConversationsWithFallback(queryFn) {
  try {
    const primaryResult = await queryFn(activeConversationFields)
    if (!primaryResult.error) return primaryResult

    if (activeConversationFields !== baseConversationFields) {
      activeConversationFields = baseConversationFields
      return await queryFn(baseConversationFields)
    }
    return primaryResult
  } catch (err) {
    if (activeConversationFields !== baseConversationFields) {
      activeConversationFields = baseConversationFields
      try {
        return await queryFn(baseConversationFields)
      } catch (fallbackErr) {
        return { data: [], error: fallbackErr }
      }
    }
    return { data: [], error: err }
  }
}

async function queryMessagesWithFallback(queryFn) {
  try {
    const primaryResult = await queryFn(activeMessageFields)
    if (!primaryResult.error) return primaryResult

    if (activeMessageFields !== baseMessageFields) {
      activeMessageFields = baseMessageFields
      return await queryFn(baseMessageFields)
    }
    return primaryResult
  } catch (err) {
    if (activeMessageFields !== baseMessageFields) {
      activeMessageFields = baseMessageFields
      try {
        return await queryFn(baseMessageFields)
      } catch (fallbackErr) {
        return { data: [], error: fallbackErr }
      }
    }
    return { data: [], error: err }
  }
}
const notificationFields = 'id, user_id, actor_id, type, reference_id, post_id, conversation_id, preview, is_read, created_at, profiles!notifications_actor_id_fkey(username, display_name, avatar_url)'
const notificationFilters = [
  ['all', 'All notifications'],
  ['friend_request', 'Friend requests'],
  ['message', 'Messages'],
  ['post_like', 'Reactions'],
  ['comment', 'Comments & replies'],
  ['new_follower', 'Follows'],
  ['other', 'Other activity'],
]
const presenceStatusEvent = 'qorvexa:presence-status'

function isNetworkSetupError(error) {
  return ['42P01', '42703', 'PGRST200', 'PGRST202', 'PGRST205', '42883'].includes(error.code)
    || /friend_requests|friendships|conversations|messages|notifications|last_active_at|blocked_users/.test(error.message || '')
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function formatTime(value, compact = false) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, compact
    ? { hour: 'numeric', minute: '2-digit' }
    : { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function profileName(profile) {
  return profile?.display_name || profile?.username || 'QORVEXA member'
}

function UserIdentity({ profile, availability, small = false, onClick }) {
  const name = profileName(profile)
  const statusLabel = availability === 'busy' ? 'Busy' : availability === 'online' ? 'Online' : 'Offline'
  const identity = (
    <>
      {profile?.avatar_url
        ? <ProtectedMediaImage className="network-avatar" path={profile.avatar_url} alt="" fallback={initials(name)} />
        : <span className="network-avatar network-avatar--initials" aria-hidden="true">{initials(name)}</span>}
      <span className="network-identity-copy">
        <strong>{name}</strong>
        {profile?.username && <small>@{profile.username}</small>}
      </span>
      {availability && <i className={`network-online-dot network-online-dot--${availability}`} title={statusLabel} aria-label={statusLabel} />}
    </>
  )
  if (!profile?.username) return <div className={`network-identity${small ? ' network-identity--small' : ''}`}>{identity}</div>
  return (
    <Link className={`network-identity network-identity-button${small ? ' network-identity--small' : ''}`} to={`/profile/${encodeURIComponent(profile.username)}`} aria-label={`View ${name}'s profile`} onClick={onClick}>
      {identity}
    </Link>
  )
}

function NetworkPage() {
  const { user } = useAuth()
  const { call, startCall } = useCall()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSection = location.pathname.split('/')[2] || 'friends'
  const [messagesTab, setMessagesTab] = useState(() => searchParams.get('tab') || 'chats')

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'stories' || tabParam === 'chats') {
      setMessagesTab(tabParam)
    } else if (tabParam === 'instants') {
      // Gracefully redirect legacy instant queries to stories
      setMessagesTab('stories')
      navigate('/app/messages?tab=stories', { replace: true })
    } else if (!tabParam) {
      setMessagesTab('chats')
    }
  }, [searchParams, navigate])

  useEffect(() => {
    if (activeSection === 'stories' || activeSection === 'instants') {
      navigate('/app/messages?tab=stories', { replace: true })
    }
  }, [activeSection, navigate])
  const [profiles, setProfiles] = useState([])
  const [discoveryLoadedCount, setDiscoveryLoadedCount] = useState(0)
  const [hasMoreDiscoverProfiles, setHasMoreDiscoverProfiles] = useState(false)
  const [requests, setRequests] = useState([])
  const [friendships, setFriendships] = useState([])
  const [ownUsername, setOwnUsername] = useState(user.user_metadata?.username || '')
  const [blockedIds, setBlockedIds] = useState(() => new Set())
  const [notifications, setNotifications] = useState([])
  const [notificationFilter, setNotificationFilter] = useState('all')
  const [conversations, setConversations] = useState([])
  const [directActiveConversation, setDirectActiveConversation] = useState(null)
  const activeConvRequestIdRef = useRef(0)
  const [messages, setMessages] = useState([])
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const [replyMessagesById, setReplyMessagesById] = useState({})
  const [reactionsByMessageId, setReactionsByMessageId] = useState({})
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState({})
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadProgress, setUploadProgress] = useState(null)
  const [lightboxMedia, setLightboxMedia] = useState(null)
  const [lightboxMediaList, setLightboxMediaList] = useState([])
  const [showSharedMedia, setShowSharedMedia] = useState(false)
  const fileInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const [ownProfile, setOwnProfile] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [reactionWorkingId, setReactionWorkingId] = useState('')
  const [callReceipts, setCallReceipts] = useState([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [presenceError, setPresenceError] = useState('')
  const [workingId, setWorkingId] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [notificationToast, setNotificationToast] = useState('')
  const [typingConversationId, setTypingConversationId] = useState('')
  const [reportTarget, setReportTarget] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [availabilityById, setAvailabilityById] = useState({})
  const messagesEndRef = useRef(null)
  const skipNextMessageScrollRef = useRef(false)
  const typingTimeoutRef = useRef(null)
  const typingSendTimeoutRef = useRef(null)
  const chatChannelRef = useRef(null)
  const [referencedStoryViewer, setReferencedStoryViewer] = useState({
    isOpen: false,
    userStoryStacks: [],
  })

  async function handleOpenStoryReference(storyId, storyMetadata) {
    if (!storyId) {
      setNotificationToast('This story is no longer available.')
      return
    }

    try {
      const result = await getStoryForViewer(storyId)
      if (result?.available && result.story) {
        const stack = {
          id: result.story.sender?.id || result.story.sender_id,
          user: result.story.sender,
          sender: result.story.sender,
          isOwn: (result.story.sender?.id || result.story.sender_id) === user.id,
          instants: [result.story],
        }
        setReferencedStoryViewer({
          isOpen: true,
          userStoryStacks: [stack],
        })
      } else {
        const reason = result?.reason
        if (reason === 'expired') {
          setNotificationToast('This story has expired and is no longer available.')
        } else if (reason === 'unauthorized') {
          setNotificationToast('You do not have permission to view this story.')
        } else if (reason === 'blocked') {
          setNotificationToast('This story is unavailable.')
        } else {
          setNotificationToast('This story is no longer available.')
        }
      }
    } catch {
      setNotificationToast('This story is no longer available.')
    }
  }

  const { conversationId: routeConversationId } = useParams()
  const pathMatch = location.pathname.match(/^\/app\/messages(?:\/([^/?#]+))?/)
  const rawPathConversationId = pathMatch?.[1]
  const pathConversationId = (rawPathConversationId && rawPathConversationId !== 'messages')
    ? decodeURIComponent(rawPathConversationId)
    : ''
  const selectedConversationId = routeConversationId || pathConversationId || searchParams.get('conversation') || ''
  const selectedConversationIdRef = useRef(selectedConversationId)
  selectedConversationIdRef.current = selectedConversationId
  const currentUserName = user.user_metadata?.display_name || user.user_metadata?.username || 'QORVEXA member'
  const currentUsername = user.user_metadata?.username

  const friendIds = useMemo(() => new Set(friendships.map((friendship) => (
    friendship.user_low === user.id ? friendship.user_high : friendship.user_low
  ))), [friendships, user.id])
  const incomingRequests = requests.filter((request) => request.receiver_id === user.id && request.status === 'pending')
  const outgoingByUser = new Map(requests
    .filter((request) => request.sender_id === user.id && request.status === 'pending')
    .map((request) => [request.receiver_id, request]))
  const profileById = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles])
  const profileByIdRef = useRef(profileById)
  profileByIdRef.current = profileById
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const activeConversation = useMemo(() => {
    if (!selectedConversationId) return null
    return conversations.find((conversation) => conversation.id === selectedConversationId)
      || (directActiveConversation?.id === selectedConversationId ? directActiveConversation : null)
  }, [conversations, directActiveConversation, selectedConversationId])
  useEffect(() => {
    if (!notificationToast) return undefined
    const timer = window.setTimeout(() => setNotificationToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notificationToast])

  const presenceTargetIds = useMemo(() => [...new Set([
    ...friendships
      .map((friendship) => friendship.user_low === user.id ? friendship.user_high : friendship.user_low)
      .filter((id) => profiles.some((profile) => profile.id === id && profile.online_status_visibility !== 'nobody')),
    ...requests
      .filter((request) => request.status === 'pending')
      .map((request) => request.sender_id === user.id ? request.receiver_id : request.sender_id)
      .filter((id) => profiles.some((profile) => profile.id === id
        && profile.profile_visibility === 'public'
        && profile.online_status_visibility === 'everyone')),
  ])].sort().join(','), [friendships, profiles, requests, user.id])

  const loadNetwork = useCallback(async () => {
    const client = getSupabaseClient()
    const [profilesResult, ownProfileResult, ownSettingsResult, requestsResult, friendshipsResult, notificationsResult, conversationsResult, unreadCountResult, conversationSummariesResult, blocksResult, callsResult] = await Promise.all([
      client.from('profiles').select(profileFields).neq('id', user.id).order('created_at', { ascending: false }).range(0, 199),
      client.from('profiles').select('id, username, display_name, avatar_url').eq('id', user.id).maybeSingle(),
      client.rpc('get_own_profile_settings'),
      client.from('friend_requests').select(requestFields).or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(200),
      client.from('friendships').select('user_low, user_high, created_at').or(`user_low.eq.${user.id},user_high.eq.${user.id}`).order('created_at', { ascending: false }).limit(200),
      client.from('notifications').select(notificationFields).eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      queryConversationsWithFallback((fields) =>
        client.from('conversations').select(fields).or(`user_low.eq.${user.id},user_high.eq.${user.id}`).order('updated_at', { ascending: false }).limit(100)
      ),
      client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
      client.rpc('get_conversation_summaries'),
      client.from('blocked_users').select('blocked_id').eq('blocker_id', user.id),
      client.from('call_sessions')
        .select('id, conversation_id, caller_id, callee_id, call_type, status, created_at, accepted_at, ended_at')
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    for (const result of [profilesResult, ownProfileResult, ownSettingsResult, requestsResult, friendshipsResult, notificationsResult, conversationsResult, unreadCountResult, conversationSummariesResult, blocksResult, callsResult]) {
      if (result.error) throw result.error
    }

    let conversationRows = conversationsResult.data || []
    const currentSelectedId = selectedConversationIdRef.current
    if (currentSelectedId && !conversationRows.some((conversation) => conversation.id === currentSelectedId)) {
      try {
        const { data: directConv } = await queryConversationsWithFallback((fields) =>
          client
            .from('conversations')
            .select(fields)
            .eq('id', currentSelectedId)
            .maybeSingle()
        )
        if (directConv) {
          conversationRows = [directConv, ...conversationRows]
        }
      } catch (directErr) {
        console.warn('Could not fetch direct conversation row:', directErr)
      }
    }

    // Mark delivery for synchronized conversations
    if (conversationRows.length) {
      markConversationsDelivered(client, conversationRows.map((c) => c.id)).catch(() => {})
    }

    let profileById = Object.fromEntries((profilesResult.data || []).map((profile) => [profile.id, profile]))
    const summariesByConversationId = Object.fromEntries((conversationSummariesResult.data || []).map((summary) => [summary.conversation_id, summary]))
    const relatedIds = new Set([
      ...(requestsResult.data || []).flatMap((request) => [request.sender_id, request.receiver_id]),
      ...(friendshipsResult.data || []).flatMap((friendship) => [friendship.user_low, friendship.user_high]),
    ])

    if (conversationRows.length) {
      const peerIds = [...new Set(conversationRows.map((conversation) => (
        conversation.user_low === user.id ? conversation.user_high : conversation.user_low
      )))]
      peerIds.forEach((id) => relatedIds.add(id))
    }

    const missingProfileIds = [...relatedIds].filter((id) => id !== user.id && !profileById[id])
    if (missingProfileIds.length) {
      const peerResult = await client.from('profiles').select(profileFields).in('id', missingProfileIds)
      if (peerResult.error) throw peerResult.error
      profileById = {
        ...profileById,
        ...Object.fromEntries((peerResult.data || []).map((profile) => [profile.id, profile])),
      }
    }

    setProfiles(Object.values(profileById))
    setOwnProfile(ownProfileResult.data || null)
    setOwnUsername(ownProfileResult.data?.username || '')
    setAvailabilityById((current) => ({ ...current, [user.id]: ownSettingsResult.data?.[0]?.availability_status || 'online' }))
    setDiscoveryLoadedCount(profilesResult.data?.length || 0)
    setHasMoreDiscoverProfiles((profilesResult.data?.length || 0) === 200)

    setRequests(requestsResult.data || [])
    setFriendships(friendshipsResult.data || [])
    const blockedSet = new Set((blocksResult.data || []).map((item) => item.blocked_id))
    setBlockedIds(blockedSet)
    setNotifications(notificationsResult.data || [])
    setUnreadNotificationCount(unreadCountResult.count || 0)
    
    // Only exclude blocked peers; Supabase RLS enforces conversation access
    const activeConversations = conversationRows.filter((conversation) => {
      const peerId = conversation.user_low === user.id ? conversation.user_high : conversation.user_low
      return !blockedSet.has(peerId)
    })
    const updatedConversations = applyCallReceiptsToConversations(
      activeConversations,
      summariesByConversationId,
      callsResult.data || [],
      user.id,
      profileById
    )
    setConversations(updatedConversations)
    setStatus('ready')
  }, [user.id])

  const handleNetworkLoadError = useCallback((loadError) => {
    setError(loadError.message || 'The network could not be loaded.')
    setStatus(isNetworkSetupError(loadError) ? 'setup' : 'error')
  }, [])

  const refreshMessageInteractions = useCallback(async (rows) => {
    const client = getSupabaseClient()
    const result = await loadMessageInteractions(client, rows || [])
    setReplyMessagesById(result.replyMessagesById)
    setReactionsByMessageId(result.reactionsByMessageId)
    const attachments = await loadMessageAttachments(client, (rows || []).map((m) => m.id))
    setAttachmentsByMessageId(attachments)
  }, [])
  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      setMessages([])
      setHasMoreMessages(false)
      return
    }
    const { data, error: queryError } = await queryMessagesWithFallback((fields) =>
      getSupabaseClient()
        .from('messages')
        .select(fields)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100)
    )
    if (queryError) throw queryError
    const loadedMessages = (data || []).reverse()
    setMessages(loadedMessages)
    refreshMessageInteractions(loadedMessages).catch((intErr) => {
      console.warn('Non-fatal interactions load failure:', intErr)
    })
    setHasMoreMessages((data || []).length === 100)
    
    // Mark as read non-fatally
    try {
      await getSupabaseClient()
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('type', 'message')
        .eq('conversation_id', conversationId)
        .eq('is_read', false)
      await getSupabaseClient().rpc('mark_conversation_read', {
        target_conversation_id: conversationId,
      })
    } catch (readErr) {
      console.warn('Non-fatal mark_conversation_read failure:', readErr)
    }
  }, [refreshMessageInteractions, user.id])

  const loadCallReceipts = useCallback(async (conversationId) => {
    if (!conversationId) {
      setCallReceipts([])
      return
    }


    setCallReceipts([])

    const { data, error: queryError } = await getSupabaseClient()
      .from('call_sessions')
      .select('id, conversation_id, caller_id, callee_id, call_type, status, created_at, accepted_at, ended_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (queryError) throw queryError
    setCallReceipts(data || [])
  }, [])

  const handleMessageLoadError = useCallback((loadError) => {
    setError(loadError.message || 'Messages could not be loaded.')
  }, [])

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      await loadNetwork()
    } catch (loadError) {
      handleNetworkLoadError(loadError)
    }
  }, [handleNetworkLoadError, loadNetwork])

  useEffect(() => {
    let active = true
    // Surface initial-load failures after the asynchronous database request settles.
    // eslint-disable-next-line react/set-state-in-effect
    loadNetwork().catch((loadError) => { if (active) handleNetworkLoadError(loadError) })
    return () => { active = false }
  }, [handleNetworkLoadError, loadNetwork])

  useEffect(() => {
    function handlePresenceStatus(event) {
      setPresenceError(event.detail?.message || '')
    }
    window.addEventListener(presenceStatusEvent, handlePresenceStatus)
    return () => window.removeEventListener(presenceStatusEvent, handlePresenceStatus)
  }, [])

  useEffect(() => {
    const client = getSupabaseClient()
    const presenceChannels = new Map()
    let active = true

    function syncAvailability() {
      if (!active) return
      setAvailabilityById((current) => {
        const next = { ...current }
        for (const [id, channel] of presenceChannels) {
          const tracked = Object.values(channel.presenceState()).flat()
          const person = tracked.find((presence) => presence.user_id === id)
          next[id] = ['online', 'busy'].includes(person?.availability) ? person.availability : person ? 'online' : 'offline'
        }
        return next
      })
    }

    for (const targetId of presenceTargetIds.split(',')) {
      if (!targetId || targetId === user.id) continue
      const channel = client.channel(`qorvexa-online-presence:${targetId}`, {
        config: { presence: { key: user.id }, private: true },
      })
      presenceChannels.set(targetId, channel)
      channel
        .on('presence', { event: 'sync' }, syncAvailability)
    }

    authorizeRealtimeSession(client)
      .then(() => {
        if (!active) return
        for (const channel of presenceChannels.values()) {
          channel.subscribe((state, channelError) => {
            if (!active) return
            if (state === 'SUBSCRIBED') {
              setPresenceError('')
              syncAvailability()
            } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
              console.error('Online presence channel failed.', channelError)
              setPresenceError(channelError?.message || 'Online presence disconnected.')
            }
          })
        }
      })
      .catch((channelError) => {
        if (active) {
          console.error('Online presence authorization failed.', channelError)
          setPresenceError(channelError?.message || 'Online presence could not be authorized.')
        }
      })

    function handleVisibilityChange() {
      syncAvailability()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (typingSendTimeoutRef.current) clearTimeout(typingSendTimeoutRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      for (const channel of presenceChannels.values()) client.removeChannel(channel)
    }
  }, [presenceTargetIds, user.id])

  // Dedicated immediate resolution for selected conversation
  useEffect(() => {
    if (!selectedConversationId || activeSection !== 'messages') {
      setDirectActiveConversation(null)
      return undefined
    }

    activeConvRequestIdRef.current += 1
    const currentRequestId = activeConvRequestIdRef.current

    // If already in conversations list, use that immediately
    const existing = conversationsRef.current.find((c) => c.id === selectedConversationId)
    if (existing) {
      setDirectActiveConversation(existing)
    }

    let active = true
    const client = getSupabaseClient()

    async function resolveActiveConversation() {
      try {
        const { data: conv, error: convErr } = await queryConversationsWithFallback((fields) =>
          client
            .from('conversations')
            .select(fields)
            .eq('id', selectedConversationId)
            .maybeSingle()
        )

        if (convErr || !conv || !active || currentRequestId !== activeConvRequestIdRef.current) return

        const peerId = conv.user_low === user.id ? conv.user_high : conv.user_low
        let peer = profileByIdRef.current[peerId]
        if (!peer) {
          const { data: prof } = await client
            .from('profiles')
            .select(profileFields)
            .eq('id', peerId)
            .maybeSingle()
          peer = prof
        }

        const resolved = {
          ...conv,
          peer: peer || { id: peerId, display_name: 'QORVEXA Member' },
          unreadCount: 0,
          lastMessage: existing?.lastMessage || null,
          lastActivityAt: conv.updated_at || conv.created_at,
        }

        if (active && currentRequestId === activeConvRequestIdRef.current) {
          setDirectActiveConversation(resolved)
          setConversations((prev) => {
            if (prev.some((c) => c.id === resolved.id)) {
              return prev.map((c) => (c.id === resolved.id ? { ...c, ...resolved, peer: resolved.peer || c.peer } : c))
            }
            return [resolved, ...prev]
          })
        }
      } catch (err) {
        console.warn('Could not directly resolve active conversation:', err)
      }
    }

    resolveActiveConversation()

    return () => {
      active = false
    }
  }, [activeSection, selectedConversationId, user.id])

  useEffect(() => {
    if (!selectedConversationId || activeSection !== 'messages') {
      setLoadingMessages(false)
      return undefined
    }
    let active = true
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

    setLoadingMessages(true)
    setMessages([])
    setCallReceipts([])

    // Load messages and call receipts immediately for the selected conversation
    loadMessages(selectedConversationId)
      .catch((loadError) => { if (active) handleMessageLoadError(loadError) })
      .finally(() => { if (active) setLoadingMessages(false) })
    loadCallReceipts(selectedConversationId).catch((loadError) => { if (active) handleMessageLoadError(loadError) })

    const client = getSupabaseClient()
    const channel = client.channel(`conversation-${selectedConversationId}`, { config: { private: true } })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConversationId}`,
      }, (payload) => {
        loadMessages(selectedConversationId).catch((loadError) => setError(loadError.message))
        if (payload?.eventType === 'INSERT' && payload?.new?.sender_id !== user.id) {
          getSupabaseClient().rpc('mark_conversation_read', {
            target_conversation_id: selectedConversationId,
          }).catch(() => {})
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${selectedConversationId}`,
      }, (payload) => {
        if (payload?.new) {
        setDirectActiveConversation((current) =>
  current?.id === payload.new.id
    ? { ...current, ...payload.new }
    : current
)
          setConversations((current) => current.map((c) => c.id === payload.new.id ? { ...c, ...payload.new } : c))
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_sessions',
        filter: `conversation_id=eq.${selectedConversationId}`,
      }, () => {
        loadCallReceipts(selectedConversationId).catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
      }, () => {
        refreshMessageInteractions(messagesRef.current)
          .catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_attachments',
      }, () => {
        refreshMessageInteractions(messagesRef.current)
          .catch((loadError) => setError(loadError.message))
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user_id !== user.id) {
          setTypingConversationId(selectedConversationId)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setTypingConversationId(''), 2500)
        }
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setError('The live conversation connection was interrupted. Reconnecting...')
        }
      })
    chatChannelRef.current = channel

    return () => {
      active = false
      if (chatChannelRef.current === channel) chatChannelRef.current = null
      client.removeChannel(channel)
    }
  }, [activeSection, handleMessageLoadError, loadCallReceipts, loadMessages, refreshMessageInteractions, selectedConversationId, user.id])

  useEffect(() => {
    if (skipNextMessageScrollRef.current) {
      skipNextMessageScrollRef.current = false
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, callReceipts])

  useEffect(() => {
    const client = getSupabaseClient()
    const channel = client.channel(`user-notifications-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const notification = payload.new
        const currentSelectedId = selectedConversationIdRef.current
        const isCurrentConversationMessage = notification?.type === 'message'
          && activeSection === 'messages'
          && notification.conversation_id === currentSelectedId
        if (payload.eventType === 'INSERT' && notification?.actor_id !== user.id && !isCurrentConversationMessage) {
          setNotificationToast(notificationToastText(notification?.type))
        }
        const update = isCurrentConversationMessage
          ? client.from('notifications')
            .update({ is_read: true })
            .eq('id', notification.id)
            .eq('user_id', user.id)
            .eq('is_read', false)
          : Promise.resolve({ error: null })
        update
          .then(({ error: updateError }) => {
            if (updateError) throw updateError
            return loadNetwork()
          })
          .catch((loadError) => setError(loadError.message || 'Notifications could not be updated.'))
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setError('Live notifications are temporarily unavailable. Reconnecting...')
        }
      })
    return () => { client.removeChannel(channel) }
  }, [activeSection, loadNetwork, user.id])

  useEffect(() => {
    const client = getSupabaseClient()
    const channel = client.channel(`user-network-updates-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload?.new
        if (payload?.eventType === 'INSERT' && msg && msg.sender_id !== user.id) {
          if (msg.conversation_id === selectedConversationIdRef.current) {
            getSupabaseClient().rpc('mark_conversation_read', {
              target_conversation_id: msg.conversation_id,
            }).catch(() => {})
          } else {
            markConversationDelivered(getSupabaseClient(), msg.conversation_id).catch(() => {})
          }
        }
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setError('Live network updates are temporarily unavailable. Reconnecting...')
        }
      })

    const handleCallSessionUpdate = () => {
      loadNetwork().catch((loadError) => setError(loadError.message))
    }
    window.addEventListener('qorvexa:call-session-updated', handleCallSessionUpdate)

    return () => {
      window.removeEventListener('qorvexa:call-session-updated', handleCallSessionUpdate)
      client.removeChannel(channel)
    }
  }, [loadNetwork, user.id])

  const conversationTimeline = useMemo(() => {
    const callIds = new Set(callReceipts.map((s) => s.id))
    const textMessages = messages.filter(
      (m) => !(m.call_session_id && callIds.has(m.call_session_id)) && m.message_type !== 'call'
    )
    return [
      ...textMessages.map((message) => ({ ...message, timelineType: 'message' })),
      ...callReceipts.map((session) => ({ ...session, timelineType: 'call' })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [messages, callReceipts])

  const peerReadAt = conversationPeerReadAt(activeConversation, user?.id)
  const peerDeliveredAt = conversationPeerDeliveredAt(activeConversation, user?.id)
  const lastSeenMessageId = useMemo(
    () => findLastSeenMessageId(messages, user?.id, peerReadAt),
    [messages, user?.id, peerReadAt]
  )
  const watchedPresenceIds = new Set(presenceTargetIds.split(',').filter(Boolean))
  const profileAvailability = (profile) => !profile || !watchedPresenceIds.has(profile.id)
    ? undefined
    : availabilityById[profile.id] || 'offline'
  useEffect(() => {
    if (status === 'ready' && !pathConversationId && activeConversation) {
      navigate(`/app/messages/${encodeURIComponent(activeConversation.id)}`, { replace: true })
    }
  }, [activeConversation, navigate, pathConversationId, status])
  const unreadMessages = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)
  const filteredNotifications = notifications.filter((notification) => {
    if (notificationFilter === 'all') return true
    if (notificationFilter === 'friend_request') return ['friend_request', 'friend_request_accepted'].includes(notification.type)
    if (notificationFilter === 'other') return !['friend_request', 'friend_request_accepted', 'message', 'post_like', 'comment', 'reply', 'new_follower'].includes(notification.type)
    if (notificationFilter === 'comment') return ['comment', 'reply'].includes(notification.type)
    return notification.type === notificationFilter
  })
  const filteredProfiles = profiles.filter((profile) => {
    if (friendIds.has(profile.id) || blockedIds.has(profile.id)) return false
    const term = query.trim().toLowerCase()
    return !term || `${profile.display_name} ${profile.username} ${profile.bio}`.toLowerCase().includes(term)
  })
  const filteredFriends = friendships
    .map((friendship) => profileById[friendship.user_low === user.id ? friendship.user_high : friendship.user_low])
    .filter((profile) => profile && (!query.trim() || `${profile.display_name} ${profile.username}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((first, second) => Number(['online', 'busy'].includes(profileAvailability(second))) - Number(['online', 'busy'].includes(profileAvailability(first))))

  async function loadMorePeople() {
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('profiles')
        .select(profileFields)
        .neq('id', user.id)
        .order('created_at', { ascending: false })
        .range(discoveryLoadedCount, discoveryLoadedCount + 199)
      if (queryError) throw queryError
      setProfiles((current) => [...new Map([...current, ...(data || [])].map((profile) => [profile.id, profile])).values()])
      setDiscoveryLoadedCount((count) => count + (data?.length || 0))
      setHasMoreDiscoverProfiles((data?.length || 0) === 200)
    } catch (loadError) {
      setError(loadError.message || 'More people could not be loaded.')
    }
  }

  async function runAction(actionId, operation) {
    setWorkingId(actionId)
    setError('')
    try {
      await operation()
      await loadNetwork()
    } catch (actionError) {
      setError(actionError.message || 'The requested action failed.')
    } finally {
      setWorkingId('')
    }
  }

  function sendFriendRequest(profile) {
    return runAction(profile.id, async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('send_friend_request', { target_user_id: profile.id })
      if (rpcError) throw rpcError
    })
  }

  function respondToRequest(request, accept) {
    return runAction(request.id, async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('respond_to_friend_request', {
        request_id: request.id,
        accept_request: accept,
      })
      if (rpcError) throw rpcError
    })
  }

  function cancelRequest(request) {
    if (!window.confirm('Cancel this friend request?')) return
    return runAction(request.id, async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('cancel_friend_request', { request_id: request.id })
      if (rpcError) throw rpcError
    })
  }

  function removeFriend(profile) {
    if (!window.confirm(`Remove ${profileName(profile)} from your friends?`)) return
    return runAction(profile.id, async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('remove_friend', { target_user_id: profile.id })
      if (rpcError) throw rpcError
    })
  }

  async function openConversation(profile) {
    setWorkingId(profile.id)
    setError('')
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc('start_direct_conversation', { target_user_id: profile.id })
      if (rpcError) throw rpcError

      // Seed directActiveConversation with profile so the chat window opens on frame 1
      const initialConv = {
        id: data,
        user_low: user.id < profile.id ? user.id : profile.id,
        user_high: user.id < profile.id ? profile.id : user.id,
        peer: profile,
        unreadCount: 0,
        lastMessage: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setDirectActiveConversation(initialConv)
      setConversations((prev) => {
        if (prev.some((c) => c.id === data)) {
          return prev.map((c) => (c.id === data ? { ...c, peer: profile } : c))
        }
        return [initialConv, ...prev]
      })

      // Navigate immediately without waiting for any full network reload
      navigate(`/app/messages/${encodeURIComponent(data)}`)
    } catch (actionError) {
      setError(actionError.message || 'Could not open this conversation.')
    } finally {
      setWorkingId('')
    }
  }

  const handleSelectConversation = useCallback((conv) => {
    if (!conv?.id) return
    setDirectActiveConversation(conv)
    navigate(`/app/messages/${encodeURIComponent(conv.id)}`)
  }, [navigate])

  function handleStoryReply({ peerId, caption }) {
    openConversation({ id: peerId }).then(() => {
      setDraft(caption ? `Replying to Story ("${caption.slice(0, 35)}…"): ` : 'Replying to Story: ')
    })
  }

  async function markNotificationRead(notification) {
    if (notification.is_read) return
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
    setUnreadNotificationCount((count) => Math.max(0, count - 1))
    const { error: updateError } = await getSupabaseClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id)
      .eq('user_id', user.id)
    if (updateError) {
      setError(updateError.message)
      loadNetwork().catch((loadError) => setError(loadError.message))
    }
  }

  async function markAllNotificationsRead() {
    if (!unreadNotificationCount) return
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
    setUnreadNotificationCount(0)
    const { error: updateError } = await getSupabaseClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    if (updateError) {
      setError(updateError.message)
      loadNetwork().catch((loadError) => setError(loadError.message))
    }
  }

  async function openNotification(notification) {
    await markNotificationRead(notification)

    if (notification.type === 'new_follower') {
      const username = notification.profiles?.username
      if (username) {
        navigate(`/profile/${encodeURIComponent(username)}`)
      } else {
        navigate('/app/friends')
      }
      return
    }
    if (notification.type === 'message' && notification.conversation_id) {
      navigate(`/app/messages/${encodeURIComponent(notification.conversation_id)}`)
      return
    }
    if (notification.type === 'story') {
      navigate('/app/messages?tab=stories')
      return
    }
    if (notification.type === 'instant' || notification.type === 'instant_reaction') {
      navigate('/app/messages')
      return
    }

    let postId = notification.post_id
    if (!postId && notification.type === 'post_like') postId = notification.reference_id
    if (!postId && ['comment', 'reply'].includes(notification.type)) {
      const { data, error: commentError } = await getSupabaseClient()
        .from('comments')
        .select('post_id')
        .eq('id', notification.reference_id)
        .maybeSingle()
      if (commentError) {
        setError(commentError.message)
        return
      }
      postId = data?.post_id
    }
    if (postId) {
      const { data: post, error: postError } = await getSupabaseClient()
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .maybeSingle()
      if (postError) {
        setError(postError.message)
        return
      }
      if (post?.author_id) {
        const { data: author, error: profileError } = await getSupabaseClient()
          .from('profiles')
          .select('username')
          .eq('id', post.author_id)
          .maybeSingle()
        if (profileError) {
          setError(profileError.message)
          return
        }
        if (author?.username) {
          const commentQuery = ['comment', 'reply'].includes(notification.type)
          ? `&comment=${encodeURIComponent(notification.reference_id)}`
          : ''
        navigate(`/profile/${encodeURIComponent(author.username)}?post=${encodeURIComponent(postId)}${commentQuery}`)
          return
        }
      }
    }
    navigate('/app/friends')
  }

  async function handleReactToMessage(message, reactionType) {
    if (!message?.id || reactionWorkingId === message.id) return

    setReactionWorkingId(message.id)
    setError('')

    try {
      await toggleMessageReaction(getSupabaseClient(), message.id, user.id, reactionType)
      await refreshMessageInteractions(messages)
    } catch (reactionError) {
      setError(reactionError.message || 'Reaction could not be saved.')
    } finally {
      setReactionWorkingId('')
    }
  }

  async function jumpToMessage(messageId) {
    const target = document.getElementById(`network-message-${messageId}`)

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    try {
      const { data, error: queryError } = await queryMessagesWithFallback((fields) =>
        getSupabaseClient()
          .from('messages')
          .select(fields)
          .eq('id', messageId)
          .eq('conversation_id', selectedConversationId)
          .maybeSingle()
      )

      if (queryError) throw queryError
      if (!data) return

      const updatedMessages = [...messages, data]
        .filter((message, index, rows) => rows.findIndex((row) => row.id === message.id) === index)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

      setMessages(updatedMessages)
      await refreshMessageInteractions(updatedMessages)

      window.requestAnimationFrame(() => {
        document.getElementById(`network-message-${messageId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    } catch (jumpError) {
      setError(jumpError.message || 'Original message could not be opened.')
    }
  }

  function handleSelectFiles(event) {
    const selected = Array.from(event.target.files || [])
    if (!selected.length) return
    const newItems = selected.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setPendingFiles((prev) => [...prev, ...newItems].slice(0, 10))
    event.target.value = ''
  }

  function handleRemovePendingFile(id) {
    setPendingFiles((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) {
        try { URL.revokeObjectURL(target.previewUrl) } catch (_) {}
      }
      return prev.filter((item) => item.id !== id)
    })
  }

  // Cleanup audio recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  function formatVoiceTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function startAudioRecording() {
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
      setIsRecordingAudio(true)
      setRecordingDuration(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('[NetworkPage] Mic access error:', err)
      setError('Microphone permission is required to record voice messages.')
    }
  }

  function cancelAudioRecording() {
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
    audioChunksRef.current = []
    setIsRecordingAudio(false)
    setRecordingDuration(0)
  }

  async function stopAndSendAudioRecording() {
    if (!mediaRecorderRef.current || !activeConversation) return
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    const recorder = mediaRecorderRef.current
    setIsRecordingAudio(false)

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
      setRecordingDuration(0)
      return
    }

    const mimeType = recorder.mimeType || 'audio/webm'
    const audioBlob = new Blob(chunks, { type: mimeType })
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
    const audioFile = new File([audioBlob], `voice-message-${Date.now()}.${ext}`, { type: audioBlob.type })

    setSending(true)
    setError('')
    try {
      const client = getSupabaseClient()
      setUploadProgress({ current: 1, total: 1, percent: 50, name: 'Voice message' })
      const uploaded = await uploadAttachmentFile(client, activeConversation.id, user.id, audioFile)
      setUploadProgress({ current: 1, total: 1, percent: 100, name: 'Voice message' })

      const { data, error: insertError } = await queryMessagesWithFallback((fields) =>
        client
          .from('messages')
          .insert({
            conversation_id: activeConversation.id,
            sender_id: user.id,
            content: '🎙️ Voice message',
            reply_to_message_id: replyingTo?.id || null,
          })
          .select(fields)
          .single()
      )

      if (insertError) throw insertError

      const { error: attInsertError } = await client
        .from('message_attachments')
        .insert([{
          message_id: data.id,
          conversation_id: activeConversation.id,
          sender_id: user.id,
          storage_path: uploaded.storage_path,
          original_filename: uploaded.original_filename,
          file_size: uploaded.file_size,
          mime_type: uploaded.mime_type,
          attachment_type: 'audio',
          metadata: uploaded.metadata || {},
        }])

      if (attInsertError) throw attInsertError

      const updated = [...messagesRef.current.filter((m) => m.id !== data.id), data]
      setMessages(updated)
      setReplyingTo(null)
      await refreshMessageInteractions(updated)
    } catch (sendError) {
      const msg = sendError?.message || ''
      const friendlyError = msg.includes('Failed to fetch')
        ? 'Could not send voice message. Please check your connection and try again.'
        : msg || 'Voice message could not be sent.'
      setError(friendlyError)
    } finally {
      setSending(false)
      setUploadProgress(null)
      setRecordingDuration(0)
      audioChunksRef.current = []
    }
  }

  function handleOpenMedia(attachment, list) {
    setLightboxMedia(attachment)
    setLightboxMediaList(list && list.length ? list : [attachment])
  }

  async function handleSendMessage(event) {
    event?.preventDefault?.()
    const content = draft.trim()
    if ((!content && pendingFiles.length === 0) || sending || !activeConversation?.id) return
    setSending(true)
    setError('')
    try {
      const client = getSupabaseClient()
      const uploadedAttachments = []

      if (pendingFiles.length > 0) {
        for (let i = 0; i < pendingFiles.length; i++) {
          const item = pendingFiles[i]
          setUploadProgress({
            current: i + 1,
            total: pendingFiles.length,
            percent: Math.round(((i) / pendingFiles.length) * 100),
            name: item.name,
          })
          const uploaded = await uploadAttachmentFile(
            client,
            activeConversation.id,
            user.id,
            item.file
          )
          uploadedAttachments.push(uploaded)
        }
        setUploadProgress({
          current: pendingFiles.length,
          total: pendingFiles.length,
          percent: 100,
          name: '',
        })
      }

      // If text content is empty but attachments exist, use an informative placeholder caption
      const messageContent = content || (
        uploadedAttachments[0]?.attachment_type === 'photo' || uploadedAttachments[0]?.attachment_type === 'image'
          ? (uploadedAttachments.length > 1 ? `${uploadedAttachments.length} Photos` : 'Photo')
          : uploadedAttachments[0]?.attachment_type === 'video'
            ? 'Video'
            : uploadedAttachments[0]?.attachment_type === 'audio'
              ? '🎙️ Voice message'
              : uploadedAttachments[0]?.original_filename || 'Attachment'
      )

      const { data, error: insertError } = await queryMessagesWithFallback((fields) =>
        client
          .from('messages')
          .insert({
            conversation_id: activeConversation.id,
            sender_id: user.id,
            content: messageContent,
            reply_to_message_id: replyingTo?.id || null,
          })
          .select(fields)
          .single()
      )
      if (insertError) throw insertError

      if (uploadedAttachments.length > 0) {
        const rowsToInsert = uploadedAttachments.map((att) => ({
          message_id: data.id,
          conversation_id: activeConversation.id,
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

      // Cleanup blob URLs
      pendingFiles.forEach((item) => {
        if (item.previewUrl) {
          try { URL.revokeObjectURL(item.previewUrl) } catch (_) {}
        }
      })

      const updated = [...messagesRef.current.filter((m) => m.id !== data.id), data]
      setMessages(updated)
      setDraft('')
      setPendingFiles([])
      setReplyingTo(null)
      setTypingConversationId('')
      await refreshMessageInteractions(updated)
    } catch (sendError) {
      const msg = sendError?.message || ''
      const friendlyError = msg.includes('Failed to fetch')
        ? 'Could not send message. Please check your connection and try again.'
        : msg || 'Message could not be sent.'
      setError(friendlyError)
    } finally {
      setSending(false)
      setUploadProgress(null)
    }
  }

  async function loadOlderMessages() {
    const oldestMessage = messages[0]
    if (!activeConversation || !oldestMessage || loadingOlderMessages) return
    setLoadingOlderMessages(true)
    try {
      const { data, error: queryError } = await queryMessagesWithFallback((fields) =>
        getSupabaseClient()
          .from('messages')
          .select(fields)
          .eq('conversation_id', activeConversation.id)
          .lt('created_at', oldestMessage.created_at)
          .order('created_at', { ascending: false })
          .limit(100)
      )
      if (queryError) throw queryError
      skipNextMessageScrollRef.current = true
      const olderMessages = (data || []).reverse()
      const updatedMessages = [...olderMessages, ...messages]
      setMessages(updatedMessages)
      await refreshMessageInteractions(updatedMessages)
      setHasMoreMessages((data || []).length === 100)
    } catch (loadError) {
      setError(loadError.message || 'Older messages could not be loaded.')
    } finally {
      setLoadingOlderMessages(false)
    }
  }

  async function sendTypingSignal() {
    if (!activeConversation || !chatChannelRef.current || typingSendTimeoutRef.current) return
    typingSendTimeoutRef.current = setTimeout(() => {
      typingSendTimeoutRef.current = null
    }, 900)
    try {
      const status = await chatChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id },
      })
      if (status !== 'ok') throw new Error('Typing status could not be sent.')
    } catch (sendError) {
      setError(sendError.message || 'Typing status could not be sent.')
    }
  }

  async function deleteMessage(message) {
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    setWorkingId(message.id)
    try {
      const { data, error: deleteError } = await getSupabaseClient()
        .from('messages')
        .delete()
        .eq('id', message.id)
        .eq('sender_id', user.id)
        .select('id')
        .maybeSingle()
      if (deleteError) throw deleteError
      if (!data) throw new Error('You can delete only your own messages.')
      setMessages((current) => current.filter((item) => item.id !== message.id))
      await loadNetwork()
    } catch (deleteError) {
      setError(deleteError.message || 'Message could not be deleted.')
    } finally {
      setWorkingId('')
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut()
      if (signOutError) throw signOutError
      navigate('/', { replace: true })
    } catch (signOutError) {
      setError(signOutError.message || 'Could not sign out.')
    } finally {
      setSigningOut(false)
    }
  }

  const pageTitles = {
    friends: 'Friends',
    discover: 'Discover people',
    notifications: 'Notifications',
    messages: 'Messages',
  }

  const effectiveMessagesTab = selectedConversationId ? 'chats' : messagesTab

  return (
    <main className="member-page member-feed-page network-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <NotificationToast message={notificationToast} onDismiss={() => setNotificationToast('')} />
      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/app" aria-label="QORVEXA feed"><BrandMark /></Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link to="/app" className="network-nav-link"><Rss size={15} aria-hidden="true" />Feed</Link>
          <Link to="/app/explore" className={`network-nav-link${activeSection === 'explore' ? ' is-active' : ''}`}><Compass size={15} aria-hidden="true" />Explore</Link>
          <Link to="/app/discover" className={`network-nav-link${activeSection === 'discover' ? ' is-active' : ''}`}><UserPlus size={15} aria-hidden="true" />Discover</Link>
          <Link to="/app/friends" className={`network-nav-link${activeSection === 'friends' ? ' is-active' : ''}`}><Users size={15} aria-hidden="true" />Friends</Link>
          <Link to="/app/notifications" className={`network-nav-link${activeSection === 'notifications' ? ' is-active' : ''}`}>
          <Bell size={15} aria-hidden="true" />Notifications{unreadNotificationCount > 0 && <span className="network-badge">{unreadNotificationCount}</span>}
          </Link>
          <Link to="/app/messages" className={`network-nav-link${activeSection === 'messages' ? ' is-active' : ''}`}><MessageCircle size={15} aria-hidden="true" />Messages{unreadMessages > 0 && <span className="network-badge">{unreadMessages}</span>}</Link>

   {ownUsername && <Link to={`/profile/${encodeURIComponent(ownUsername)}`} className="network-nav-link"><UserRound size={15} aria-hidden="true" />My profile</Link>}
<AccountMenu onSignOut={handleSignOut} signingOut={signingOut} />
        </nav>

      </header>

      <AccountRestrictionNotice userId={user.id} />
      <section className={`network-content network-content--${activeSection}`}>
        <div className="network-heading">
          <div><p className="eyebrow">YOUR COMMUNITY</p><h1>{pageTitles[activeSection] || 'Your network'}</h1></div>
          {['friends', 'discover'].includes(activeSection) && (
            <label className="network-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeSection === 'friends' ? 'friends' : 'people'}...`} /></label>
          )}
        </div>

        {activeSection === 'messages' && (
          <div className="network-messages-subnav" role="tablist" aria-label="Messages tabs">
            <button
              type="button"
              role="tab"
              aria-selected={effectiveMessagesTab === 'chats'}
              className={`network-messages-tab${effectiveMessagesTab === 'chats' ? ' is-active' : ''}`}
              onClick={() => {
                setMessagesTab('chats')
                navigate(selectedConversationId ? `/app/messages/${encodeURIComponent(selectedConversationId)}` : '/app/messages')
              }}
            >
              <MessageCircle size={15} aria-hidden="true" />
              <span>Chats</span>
              {unreadMessages > 0 && <span className="network-badge">{unreadMessages}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveMessagesTab === 'stories'}
              className={`network-messages-tab${effectiveMessagesTab === 'stories' ? ' is-active' : ''}`}
              onClick={() => {
                setMessagesTab('stories')
                navigate('/app/messages?tab=stories')
              }}
            >
              <Sparkles size={15} aria-hidden="true" />
              <span>Stories</span>
            </button>
          </div>
        )}

        {error && <div className="network-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error}</span><button type="button" onClick={refresh}>Retry</button></div>}
       {presenceError && (
  <div className="network-presence-warning" role="status">
    <AlertCircle size={15} aria-hidden="true" />
    <span>
      Live online status is temporarily unavailable. Your friends and
      messaging features can still work. Please try again later.
    </span>
  </div>
)}

        {status === 'setup' ? (
          <div className="network-empty network-empty--setup">
            <span><ShieldCheck size={22} aria-hidden="true" /></span>
            <h2>Friends and messaging need one database migration</h2>
            <p>Apply the Friends &amp; Messaging, Community Features, Public Profiles, Presence Privacy Fix, Realtime Social Notifications, and Availability Presence migrations in Supabase SQL Editor, in order.</p>
            <code>supabase/migrations/20261107020000_friends_messaging.sql</code>
            <code>supabase/migrations/20261107030000_community_features.sql</code>
            <code>supabase/migrations/20261107032000_public_profiles.sql</code>
            <code>supabase/migrations/20261107035000_presence_privacy_fix.sql</code>
            <code>supabase/migrations/20261107040000_realtime_social_notifications.sql</code>
            <code>supabase/migrations/20261108000500_availability_presence.sql</code>
            <code>supabase/migrations/20261108010000_repair_online_presence_policies.sql</code>
          </div>
        ) : status === 'loading' ? (
          <div className="network-loading" role="status"><LoaderCircle size={20} className="spinner" aria-hidden="true" />Loading your network...</div>
        ) : (
          <>
            {activeSection === 'discover' && (
              <div className="network-user-grid">
                {filteredProfiles.map((profile) => {
                  const outgoing = outgoingByUser.get(profile.id)
                  const incoming = incomingRequests.find((request) => request.sender_id === profile.id)
                  return (
                    <article className="network-user-card" key={profile.id}>
                      <UserIdentity profile={profile} availability={profileAvailability(profile)} />
                      {profile.bio && <p className="network-user-bio">{profile.bio}</p>}
                      <div className="network-card-actions">
                        {incoming ? (
                          <>
                            <button className="network-button network-button--primary" type="button" disabled={workingId === incoming.id} onClick={() => respondToRequest(incoming, true)}><Check size={14} />Accept</button>
                            <button className="network-button" type="button" disabled={workingId === incoming.id} onClick={() => respondToRequest(incoming, false)}><X size={14} />Decline</button>
                          </>
                        ) : outgoing ? (
                          <button className="network-button" type="button" disabled={workingId === outgoing.id} onClick={() => cancelRequest(outgoing)}>Request sent · Cancel</button>
                        ) : (
                          <button className="network-button network-button--primary" type="button" disabled={workingId === profile.id} onClick={() => sendFriendRequest(profile)}><UserPlus size={14} />Add friend</button>
                        )}
                      </div>
                    </article>
                  )
                })}
                {!filteredProfiles.length && <div className="network-empty"><Users size={21} /><h2>No people found</h2><p>Try a different name or username.</p></div>}
                {hasMoreDiscoverProfiles && <button className="network-load-more" type="button" onClick={loadMorePeople}>Load more people</button>}
              </div>
            )}

            {activeSection === 'friends' && (
              <div className="network-two-column">
                <section className="network-panel">
                  <div className="network-panel-heading"><h2>Friend requests</h2><span>{incomingRequests.length}</span></div>
                  {incomingRequests.length ? incomingRequests.map((request) => {
                    const profile = profileById[request.sender_id]
                    return (
                      <div className="network-person-row" key={request.id}>
                        <UserIdentity profile={profile} availability={profileAvailability(profile)} />
                        <div className="network-row-actions">
                          <button className="network-icon-action network-icon-action--accept" aria-label="Accept friend request" type="button" disabled={workingId === request.id} onClick={() => respondToRequest(request, true)}><Check size={17} /></button>
                          <button className="network-icon-action" aria-label="Decline friend request" type="button" disabled={workingId === request.id} onClick={() => respondToRequest(request, false)}><X size={17} /></button>
                        </div>
                      </div>
                    )
                  }) : <p className="network-inline-empty">No pending requests.</p>}
                  {requests.some((request) => request.sender_id === user.id && request.status === 'pending') && (
                    <>
                      <div className="network-panel-heading network-panel-heading--sub"><h2>Sent requests</h2></div>
                      {requests.filter((request) => request.sender_id === user.id && request.status === 'pending').map((request) => (
                        <div className="network-person-row" key={request.id}>
                          <UserIdentity profile={profileById[request.receiver_id]} />
                          <button className="network-button" type="button" disabled={workingId === request.id} onClick={() => cancelRequest(request)}>Cancel</button>
                        </div>
                      ))}
                    </>
                  )}
                </section>
                <section className="network-panel">
                  <div className="network-panel-heading"><h2>Your friends</h2><span>{filteredFriends.length}</span></div>
                  {filteredFriends.length ? filteredFriends.map((profile) => (
                    <div className="network-person-row" key={profile.id}>
                      <UserIdentity profile={profile} availability={profileAvailability(profile)} />
                      <div className="network-row-actions">
                        <button className="network-button network-button--primary" type="button" disabled={workingId === profile.id} onClick={() => openConversation(profile)}><MessageCircle size={14} />Message</button>
                        <button className="network-icon-action" aria-label={`Remove ${profileName(profile)} from friends`} type="button" onClick={() => removeFriend(profile)}><X size={17} /></button>
                      </div>
                    </div>
                  )) : <div className="network-inline-empty"><Users size={20} /><p>No friends yet. Discover people to get connected.</p><Link to="/app/discover">Discover people</Link></div>}
                </section>
              </div>
            )}

            {activeSection === 'notifications' && (
              <section className="network-panel network-notification-list">
                <div className="network-notification-toolbar">
                  <div className="network-notification-filters" role="group" aria-label="Filter notifications">
                    {notificationFilters.map(([filter, label]) => (
                      <button
                        key={filter}
                        className={`network-button${notificationFilter === filter ? ' network-button--primary' : ''}`}
                        type="button"
                        aria-pressed={notificationFilter === filter}
                        onClick={() => setNotificationFilter(filter)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button className="network-button" type="button" onClick={markAllNotificationsRead} disabled={!unreadNotificationCount}>
                    <CheckCheck size={14} />Mark all as read
                  </button>
                </div>
                {filteredNotifications.length ? filteredNotifications.map((notification) => {
                  const request = requests.find((item) => item.id === notification.reference_id)
                  const isIncomingPending = notification.type === 'friend_request'
                    && request?.status === 'pending'
                    && request.receiver_id === user.id
                  const actorName = profileName(notification.profiles)
                  const notificationText = notification.type === 'new_follower' ? 'started following you.'
                    : notification.type === 'friend_request' ? 'sent you a friend request.'
                    : notification.type === 'friend_request_accepted' ? 'accepted your friend request.'
                      : notification.type === 'message' ? 'sent you a message.'
                        : notification.type === 'story' ? 'shared a new story.'
                          : notification.type === 'story_reply' ? 'replied to your story.'
                            : notification.type === 'post_like' ? 'liked your post.'
                              : notification.type === 'reply' ? 'replied to your comment.'
                                : 'commented on your post.'
                  return (
                    <article
                      className={`network-notification${notification.is_read ? '' : ' is-unread'}`}
                      key={notification.id}
                      onClick={() => openNotification(notification)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault()
                          openNotification(notification)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <UserIdentity profile={notification.profiles} small />
                      <div className="network-notification-copy">
                        <p><Link className="network-notification-actor" to={notification.profiles?.username ? `/profile/${encodeURIComponent(notification.profiles.username)}` : '/app'} onClick={(event) => event.stopPropagation()}><strong>{actorName}</strong></Link> {notificationText}</p>
                        {notification.preview && <small className="network-notification-preview">{notification.preview}</small>}
                        <time dateTime={notification.created_at}><Clock3 size={12} />{formatTime(notification.created_at)}</time>
                        {isIncomingPending && <div className="network-row-actions">
                          <button className="network-button network-button--primary" type="button" disabled={workingId === request.id} onClick={(event) => { event.stopPropagation(); markNotificationRead(notification); respondToRequest(request, true) }}><Check size={14} />Accept</button>
                          <button className="network-button" type="button" disabled={workingId === request.id} onClick={(event) => { event.stopPropagation(); markNotificationRead(notification); respondToRequest(request, false) }}>Decline</button>
                        </div>}
                      </div>
                      {!notification.is_read && <span className="network-unread-dot" aria-label="Unread" />}
                    </article>
                  )
                }) : <div className="network-empty"><Bell size={21} /><h2>{notifications.length ? 'No matching notifications' : "You're all caught up"}</h2><p>{notifications.length ? 'Choose another category to see more activity.' : 'Friend requests, messages, reactions, and comments will appear here.'}</p></div>}
              </section>
            )}

            {activeSection === 'messages' && (
              <>
                {effectiveMessagesTab === 'stories' && (
                  <section className="network-stories-tab-view">
                    <StoriesTab user={user} profile={ownProfile} onReply={handleStoryReply} />
                  </section>
                )}

                {effectiveMessagesTab === 'chats' && (
                  <div className="network-messenger">
                <aside className={`network-conversation-list${selectedConversationId ? ' network-conversation-list--mobile-hidden' : ''}`}>
                  <div className="network-conversation-heading"><h2>Messages</h2><span>{conversations.length}</span></div>
                  <StoriesPreviewTray
                    user={user}
                    profile={ownProfile}
                    onReply={handleStoryReply}
                    className="network-stories-preview-tray"
                  />
                  <label className="network-search network-search--conversation"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations..." /></label>
                  {conversations.filter((conversation) => profileName(conversation.peer).toLowerCase().includes(query.trim().toLowerCase()) || conversation.peer?.username?.toLowerCase().includes(query.trim().toLowerCase())).map((conversation) => (
                    <div
                      className={`network-conversation-row${conversation.id === selectedConversationId ? ' is-selected' : ''}`}
                      key={conversation.id}
                      onClick={() => handleSelectConversation(conversation)}
                    >
                      <UserIdentity
                        profile={conversation.peer}
                        availability={profileAvailability(conversation.peer)}
                        small
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div
                        className="network-conversation-summary"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleSelectConversation(conversation)
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleSelectConversation(conversation)
                          }
                        }}
                      >
                        <span>{conversation.lastMessage?.content || 'Start a conversation'}<small>Open conversation</small></span>
                        {conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}
                      </div>
                    </div>
                  ))}
                  {!conversations.length && <div className="network-inline-empty"><MessageCircle size={20} /><p>Message an accepted friend to start a conversation.</p></div>}
                </aside>

                <section className={`network-chat${selectedConversationId ? ' network-chat--mobile-visible' : ''}`}>
                  {activeConversation ? (
                    <>
                      <header className="network-chat-header">
                        <Link className="network-chat-back" to="/app/messages" aria-label="Back to conversations"><ArrowLeft size={17} /></Link>
                        <UserIdentity profile={activeConversation.peer} availability={profileAvailability(activeConversation.peer)} small />
                        {profileAvailability(activeConversation.peer) && <span className="network-chat-status">{profileAvailability(activeConversation.peer) === 'busy' ? 'Busy' : profileAvailability(activeConversation.peer) === 'online' ? 'Online' : 'Offline'}</span>}

                        <div className="network-chat-call-controls">
                          <button
                            type="button"
                            onClick={() => setShowSharedMedia((prev) => !prev)}
                            className={`network-action-icon-btn${showSharedMedia ? ' network-action-icon-btn--active' : ''}`}
                            aria-label="Shared media gallery"
                            title="Shared photos, videos, and files"
                          >
                            <Images size={17} />
                          </button>
                          <button
                            type="button"
                            onClick={() => startCall(activeConversation.id, 'audio').catch(() => {})}
                            disabled={Boolean(call)}
                            aria-label={`Start audio call with ${profileName(activeConversation.peer)}`}
                            title="Audio call"
                          >
                            <Phone size={17} />
                          </button>
                          <button
                            type="button"
                            onClick={() => startCall(activeConversation.id, 'video').catch(() => {})}
                            disabled={Boolean(call)}
                            aria-label={`Start video call with ${profileName(activeConversation.peer)}`}
                            title="Video call"
                          >
                            <Video size={17} />
                          </button>
                        </div>                      </header>
                      <div className="network-message-list">
                        {hasMoreMessages && <button className="network-load-older" type="button" onClick={loadOlderMessages} disabled={loadingOlderMessages}>{loadingOlderMessages ? 'Loading...' : 'Load older messages'}</button>}
                        {conversationTimeline.map((item) => {
                          if (item.timelineType === 'call') {
                            return <CallReceipt key={`call-${item.id}`} session={item} currentUserId={user.id} />
                          }
                          const message = item
                          return (
                          <article
                            id={`network-message-${message.id}`}
                            className={`network-message${message.sender_id === user.id ? ' network-message--own' : ''}`}
                            key={message.id}
                          >
                            <MessageInteractions
                                bubbleClassName="network-message-bubble"
                                message={message}
                                replyMessage={replyMessagesById[message.reply_to_message_id]}
                                reactions={reactionsByMessageId[message.id] || []}
                                attachments={attachmentsByMessageId[message.id] || []}
                                currentUserId={user.id}
                                onReply={setReplyingTo}
                                onReact={handleReactToMessage}
                                onJump={jumpToMessage}
                                onOpenMedia={handleOpenMedia}
                                onOpenStory={handleOpenStoryReference}
                                footer={
                                  <>
                                    <time dateTime={message.created_at}>{formatTime(message.created_at, true)}</time>
                                    {message.sender_id === user.id && (
                                      <MessageStatusIndicator
                                        message={message}
                                        peerReadAt={peerReadAt}
                                        peerDeliveredAt={peerDeliveredAt}
                                        peer={activeConversation?.peer}
                                        isLastSeen={lastSeenMessageId === message.id}
                                      />
                                    )}
                                    {message.sender_id === user.id && (
                                      <button type="button" aria-label="Delete message" onClick={() => deleteMessage(message)} disabled={workingId === message.id}>
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </>
                                }
                              />
                          </article>
                        )
                        })}
                        {typingConversationId === selectedConversationId && <div className="network-typing"><Link to={`/profile/${encodeURIComponent(activeConversation.peer?.username || '')}`}>{profileName(activeConversation.peer)}</Link> is typing...</div>}
                        <div ref={messagesEndRef} />
                        {loadingMessages ? (
                          <div className="network-chat-empty"><LoaderCircle size={18} className="spinner" aria-hidden="true" /><span>Loading messages…</span></div>
                        ) : !conversationTimeline.length ? (
                          <div className="network-chat-empty">Say hello and start the conversation.</div>
                        ) : null}
                      </div>
                      <form className="network-message-form" onSubmit={handleSendMessage}>
                        {replyingTo && (
                          <div className="network-replying-preview">
                            <div>
                              <strong>Replying to {replyingTo.sender_id === user.id ? 'yourself' : profileName(activeConversation.peer)}</strong>
                              <span>{replyingTo.content}</span>
                            </div>
                            <button type="button" aria-label="Cancel reply" onClick={() => setReplyingTo(null)}>
                              <X size={15} />
                            </button>
                          </div>
                        )}
                        {pendingFiles.length > 0 && (
                          <div className="qv-composer-attachments-tray">
                            {pendingFiles.map((item) => (
                              <div key={item.id} className="qv-composer-attachment-item">
                                {item.previewUrl ? (
                                  <img src={item.previewUrl} alt={item.name} className="qv-composer-attachment-thumb" />
                                ) : (
                                  <div className="qv-composer-attachment-file-badge">
                                    <span className="qv-composer-attachment-ext">{item.name.split('.').pop()?.toUpperCase() || 'FILE'}</span>
                                  </div>
                                )}
                                <span className="qv-composer-attachment-name" title={item.name}>{item.name}</span>
                                <button
                                  type="button"
                                  className="qv-composer-attachment-remove"
                                  onClick={() => handleRemovePendingFile(item.id)}
                                  aria-label={`Remove ${item.name}`}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {uploadProgress && (
                          <div className="qv-composer-upload-progress">
                            <div className="qv-composer-upload-progress-info">
                              <LoaderCircle size={14} className="spinner" />
                              <span>Uploading {uploadProgress.current} of {uploadProgress.total}{uploadProgress.name ? `: ${uploadProgress.name}` : ''}</span>
                            </div>
                            <div className="qv-composer-upload-bar">
                              <div className="qv-composer-upload-bar-fill" style={{ width: `${uploadProgress.percent}%` }} />
                            </div>
                          </div>
                        )}
                        {/* Hidden Photo / Video Input */}
                        <input
                          ref={photoInputRef}
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          style={{ display: 'none' }}
                          onChange={handleSelectFiles}
                        />

                        {/* Hidden Document / File Input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                          style={{ display: 'none' }}
                          onChange={handleSelectFiles}
                        />

                        {/* Voice Recording Bar OR Standard Composer Inputs */}
                        {isRecordingAudio ? (
                          <div className="qv-recording-bar">
                            <div className="qv-recording-status">
                              <div className="qv-recording-dot" />
                              <span className="qv-recording-time">{formatVoiceTime(recordingDuration)}</span>
                              <div className="qv-recording-waves">
                                <span />
                                <span />
                                <span />
                                <span />
                                <span />
                              </div>
                            </div>
                            <div className="qv-recording-actions">
                              <button
                                type="button"
                                className="qv-recording-cancel-btn"
                                onClick={cancelAudioRecording}
                                title="Discard voice recording"
                                aria-label="Discard recording"
                              >
                                <Trash2 size={18} />
                              </button>
                              <button
                                type="button"
                                className="qv-recording-send-btn"
                                onClick={stopAndSendAudioRecording}
                                title="Send voice message"
                                aria-label="Send voice message"
                                disabled={sending}
                              >
                                {sending ? <LoaderCircle size={18} className="spinner" /> : <Send size={18} />}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="network-message-input-row">
                            {/* 1. Dedicated Photo / Video Button */}
                            <button
                              type="button"
                              className="network-composer-action-btn"
                              onClick={() => photoInputRef.current?.click()}
                              aria-label="Attach photos or videos"
                              title="Photo / Video"
                              disabled={sending}
                            >
                              <ImageIcon size={18} />
                            </button>

                            {/* 2. Dedicated Voice Message Button */}
                            <button
                              type="button"
                              className="network-composer-action-btn"
                              onClick={startAudioRecording}
                              aria-label="Record voice message"
                              title="Voice message"
                              disabled={sending}
                            >
                              <Mic size={18} />
                            </button>

                            {/* 3. Dedicated File Attachment Button */}
                            <button
                              type="button"
                              className="network-composer-action-btn"
                              onClick={() => fileInputRef.current?.click()}
                              aria-label="Attach document or file"
                              title="Attach file"
                              disabled={sending}
                            >
                              <Paperclip size={18} />
                            </button>

                            <textarea
                              aria-label="Message"
                              maxLength={4000}
                              onChange={(event) => { setDraft(event.target.value); sendTypingSignal() }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                  event.preventDefault()
                                  event.currentTarget.form.requestSubmit()
                                }
                              }}
                              placeholder={pendingFiles.length > 0 ? "Add a caption... (optional, Enter to send)" : "Write a message... (Enter to send, Shift+Enter for a new line)"}
                              rows={2}
                              value={draft}
                            />
                            <EmojiPicker onSelect={(emoji) => { setDraft((current) => `${current}${emoji}`); sendTypingSignal() }} />
                            <button type="submit" disabled={(!draft.trim() && pendingFiles.length === 0) || sending} aria-label="Send message">
                              {sending ? <LoaderCircle size={18} className="spinner" /> : <Send size={18} />}
                            </button>
                          </div>
                        )}
                      </form>
                      <SharedMediaPanel
                        conversationId={activeConversation.id}
                        isOpen={showSharedMedia}
                        onClose={() => setShowSharedMedia(false)}
                        onOpenMedia={(item, list) => {
                          setLightboxMedia(item)
                          setLightboxMediaList(list)
                        }}
                      />
                      <MediaLightboxModal
                        isOpen={Boolean(lightboxMedia)}
                        activeMedia={lightboxMedia}
                        mediaList={lightboxMediaList}
                        onClose={() => setLightboxMedia(null)}
                      />
                    </>
                  ) : selectedConversationId ? (
                    <div className="network-chat-empty-state">
                      <span><MessageSquare size={24} /></span>
                      <h2>Loading conversation…</h2>
                      <p>Opening your conversation with this member.</p>
                    </div>
                  ) : (
                    <div className="network-chat-empty-state">
                      <span><MessageSquare size={24} /></span>
                      <h2>Your private conversations</h2>
                      <p>Select a conversation or message one of your friends.</p>
                      <Link to="/app/friends">Open friends</Link>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </>
    )}
  </section>
      <footer className="member-feed-footer">
        <span>QORVEXA <span>·</span> Connect Beyond Limits.</span>
        <span>Signed in as {currentUsername ? `@${currentUsername}` : currentUserName}</span>
      </footer>
      {referencedStoryViewer.isOpen && (
        <StoryViewerModal
          isOpen={referencedStoryViewer.isOpen}
          userStoryStacks={referencedStoryViewer.userStoryStacks}
          initialUserIndex={0}
          initialStoryIndex={0}
          onClose={() => setReferencedStoryViewer({ isOpen: false, userStoryStacks: [] })}
          currentUserId={user.id}
          ownProfile={ownProfile}
        />
      )}
      {reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />}
    </main>
  )
}

export default NetworkPage
