import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Bookmark,
  Check,
  CheckCheck,
  Clock3,
  LoaderCircle,
  LogOut,
  MessageCircle,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import { useAuth } from '../context/useAuth.js'
import { authorizeRealtimeSession, getSupabaseClient } from '../lib/supabase.js'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import NotificationToast from '../components/NotificationToast.jsx'
import notificationToastText from '../lib/notificationToastText.js'
import ReportDialog from '../components/ReportDialog.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'
import AccountMenu from '../components/AccountMenu.jsx'

const profileFields = 'id, username, display_name, bio, avatar_url, profile_visibility, online_status_visibility'
const requestFields = 'id, sender_id, receiver_id, status, created_at'
const messageFields = 'id, conversation_id, sender_id, content, created_at'
const notificationFields = 'id, user_id, actor_id, type, reference_id, post_id, conversation_id, preview, is_read, created_at, profiles!notifications_actor_id_fkey(username, display_name, avatar_url)'
const notificationFilters = [
  ['all', 'All notifications'],
  ['friend_request', 'Friend requests'],
  ['message', 'Messages'],
  ['post_like', 'Reactions'],
  ['comment', 'Comments & replies'],
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

function conversationPeerReadAt(conversation, userId) {
  return conversation.user_low === userId
    ? conversation.user_high_last_read_at
    : conversation.user_low_last_read_at
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
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSection = location.pathname.split('/')[2] || 'friends'
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
  const [messages, setMessages] = useState([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
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

  const pathConversationId = location.pathname.match(/^\/app\/messages\/([^/]+)$/)?.[1]
  const selectedConversationId = pathConversationId || searchParams.get('conversation')
  const currentUserName = user.user_metadata?.display_name || user.user_metadata?.username || 'QORVEXA member'
  const currentUsername = user.user_metadata?.username
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
    const [profilesResult, ownProfileResult, ownSettingsResult, requestsResult, friendshipsResult, notificationsResult, conversationsResult, unreadCountResult, conversationSummariesResult, blocksResult] = await Promise.all([
      client.from('profiles').select(profileFields).neq('id', user.id).order('created_at', { ascending: false }).range(0, 199),
      client.from('profiles').select('username').eq('id', user.id).maybeSingle(),
      client.rpc('get_own_profile_settings'),
      client.from('friend_requests').select(requestFields).or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(200),
      client.from('friendships').select('user_low, user_high, created_at').or(`user_low.eq.${user.id},user_high.eq.${user.id}`).order('created_at', { ascending: false }).limit(200),
      client.from('notifications').select(notificationFields).eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      client.from('conversations').select('id, user_low, user_high, user_low_last_read_at, user_high_last_read_at, created_at, updated_at').or(`user_low.eq.${user.id},user_high.eq.${user.id}`).order('updated_at', { ascending: false }).limit(100),
      client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
      client.rpc('get_conversation_summaries'),
      client.from('blocked_users').select('blocked_id').eq('blocker_id', user.id),
    ])

    for (const result of [profilesResult, ownProfileResult, ownSettingsResult, requestsResult, friendshipsResult, notificationsResult, conversationsResult, unreadCountResult, conversationSummariesResult, blocksResult]) {
      if (result.error) throw result.error
    }

    const conversationRows = conversationsResult.data || []
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
    setOwnUsername(ownProfileResult.data?.username || '')
    setAvailabilityById((current) => ({ ...current, [user.id]: ownSettingsResult.data?.[0]?.availability_status || 'online' }))
    setDiscoveryLoadedCount(profilesResult.data?.length || 0)
    setHasMoreDiscoverProfiles((profilesResult.data?.length || 0) === 200)

    setRequests(requestsResult.data || [])
    setFriendships(friendshipsResult.data || [])
    setBlockedIds(new Set((blocksResult.data || []).map((item) => item.blocked_id)))
    setNotifications(notificationsResult.data || [])
    setUnreadNotificationCount(unreadCountResult.count || 0)
    const acceptedFriendIds = new Set((friendshipsResult.data || []).map((friendship) => (
      friendship.user_low === user.id ? friendship.user_high : friendship.user_low
    )))
    setConversations(conversationRows.filter((conversation) => {
      const peerId = conversation.user_low === user.id ? conversation.user_high : conversation.user_low
      return acceptedFriendIds.has(peerId)
    }).map((conversation) => {
      const peerId = conversation.user_low === user.id ? conversation.user_high : conversation.user_low
      const summary = summariesByConversationId[conversation.id]
      const lastMessage = summary?.last_message_id
        ? {
            id: summary.last_message_id,
            content: summary.last_message_content,
            sender_id: summary.last_message_sender_id,
            created_at: summary.last_message_created_at,
          }
        : null
      return { ...conversation, peerId, peer: profileById[peerId], lastMessage, unreadCount: Number(summary?.unread_count || 0) }
    }))
    setStatus('ready')
  }, [user.id])

  const handleNetworkLoadError = useCallback((loadError) => {
    setError(loadError.message || 'The network could not be loaded.')
    setStatus(isNetworkSetupError(loadError) ? 'setup' : 'error')
  }, [])

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      setMessages([])
      setHasMoreMessages(false)
      return
    }
    const { data, error: queryError } = await getSupabaseClient()
      .from('messages')
      .select(messageFields)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (queryError) throw queryError
    setMessages((data || []).reverse())
    setHasMoreMessages((data || []).length === 100)
    const { error: notificationReadError } = await getSupabaseClient()
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('type', 'message')
      .eq('conversation_id', conversationId)
      .eq('is_read', false)
    if (notificationReadError) throw notificationReadError
    const { error: readError } = await getSupabaseClient().rpc('mark_conversation_read', {
      target_conversation_id: conversationId,
    })
    if (readError) throw readError
  }, [user.id])

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

  useEffect(() => {
    if (!selectedConversationId || activeSection !== 'messages' || status !== 'ready') return undefined
    let active = true
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    // Surface load failures from the active conversation's asynchronous requests.
    // eslint-disable-next-line react/set-state-in-effect
    loadMessages(selectedConversationId)
      .then(() => active ? loadNetwork() : undefined)
      .catch((loadError) => { if (active) handleMessageLoadError(loadError) })

    const client = getSupabaseClient()
    const channel = client.channel(`conversation-${selectedConversationId}`, { config: { private: true } })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConversationId}`,
      }, () => {
        loadMessages(selectedConversationId).then(loadNetwork).catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${selectedConversationId}`,
      }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
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
          setError('The live conversation connection was interrupted. Reconnecting…')
        }
      })
    chatChannelRef.current = channel

    return () => {
      active = false
      if (chatChannelRef.current === channel) chatChannelRef.current = null
      client.removeChannel(channel)
    }
  }, [activeSection, handleMessageLoadError, loadMessages, loadNetwork, selectedConversationId, status, user.id])

  useEffect(() => {
    if (skipNextMessageScrollRef.current) {
      skipNextMessageScrollRef.current = false
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

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
        const isCurrentConversationMessage = notification?.type === 'message'
          && activeSection === 'messages'
          && notification.conversation_id === selectedConversationId
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
          setError('Live notifications are temporarily unavailable. Reconnecting…')
        }
      })
    return () => { client.removeChannel(channel) }
  }, [activeSection, loadNetwork, selectedConversationId, user.id])

  useEffect(() => {
    const client = getSupabaseClient()
    const channel = client.channel(`user-network-updates-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadNetwork().catch((loadError) => setError(loadError.message))
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setError('Live network updates are temporarily unavailable. Reconnecting…')
        }
      })
    return () => { client.removeChannel(channel) }
  }, [loadNetwork, user.id])

  const friendIds = useMemo(() => new Set(friendships.map((friendship) => (
    friendship.user_low === user.id ? friendship.user_high : friendship.user_low
  ))), [friendships, user.id])
  const incomingRequests = requests.filter((request) => request.receiver_id === user.id && request.status === 'pending')
  const outgoingByUser = new Map(requests
    .filter((request) => request.sender_id === user.id && request.status === 'pending')
    .map((request) => [request.receiver_id, request]))
  const profileById = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles])
  const activeConversation = conversations.find((conversation) => conversation.id === selectedConversationId)
  const watchedPresenceIds = new Set(presenceTargetIds.split(',').filter(Boolean))
  const profileAvailability = (profile) => !profile || !watchedPresenceIds.has(profile.id)
    ? undefined
    : availabilityById[profile.id] || 'offline'
  useEffect(() => {
    if (status === 'ready' && selectedConversationId && !activeConversation) {
      navigate('/app/messages', { replace: true })
    } else if (status === 'ready' && !pathConversationId && activeConversation) {
      navigate(`/app/messages/${encodeURIComponent(activeConversation.id)}`, { replace: true })
    }
  }, [activeConversation, navigate, pathConversationId, selectedConversationId, status])
  const unreadMessages = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)
  const filteredNotifications = notifications.filter((notification) => {
    if (notificationFilter === 'all') return true
    if (notificationFilter === 'friend_request') return ['friend_request', 'friend_request_accepted'].includes(notification.type)
    if (notificationFilter === 'other') return !['friend_request', 'friend_request_accepted', 'message', 'post_like', 'comment', 'reply'].includes(notification.type)
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
      await loadNetwork()
      navigate(`/app/messages/${encodeURIComponent(data)}`)
    } catch (actionError) {
      setError(actionError.message || 'Could not open this conversation.')
    } finally {
      setWorkingId('')
    }
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
    if (notification.type === 'message' && notification.conversation_id) {
      navigate(`/app/messages/${encodeURIComponent(notification.conversation_id)}`)
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
          navigate(`/profile/${encodeURIComponent(author.username)}?post=${postId}`)
          return
        }
      }
    }
    navigate('/app/friends')
  }

  async function handleSendMessage(event) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || sending || !activeConversation) return
    setSending(true)
    setError('')
    try {
      const { data, error: insertError } = await getSupabaseClient()
        .from('messages')
        .insert({
          conversation_id: activeConversation.id,
          sender_id: user.id,
          content,
        })
        .select(messageFields)
        .single()
      if (insertError) throw insertError
      setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data])
      setDraft('')
      setTypingConversationId('')
    } catch (sendError) {
      setError(sendError.message || 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  async function loadOlderMessages() {
    const oldestMessage = messages[0]
    if (!activeConversation || !oldestMessage || loadingOlderMessages) return
    setLoadingOlderMessages(true)
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('messages')
        .select(messageFields)
        .eq('conversation_id', activeConversation.id)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(100)
      if (queryError) throw queryError
      skipNextMessageScrollRef.current = true
      setMessages((current) => [...(data || []).reverse(), ...current])
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

  return (
    <main className="member-page member-feed-page network-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <NotificationToast message={notificationToast} onDismiss={() => setNotificationToast('')} />
      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/app" aria-label="QORVEXA feed"><BrandMark /></Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link to="/app" className="network-nav-link">Feed</Link>
          <Link to="/app/discover" className={`network-nav-link${activeSection === 'discover' ? ' is-active' : ''}`}><UserPlus size={15} aria-hidden="true" />Discover</Link>
          <Link to="/app/friends" className={`network-nav-link${activeSection === 'friends' ? ' is-active' : ''}`}><Users size={15} aria-hidden="true" />Friends</Link>
          <Link to="/app/notifications" className={`network-nav-link${activeSection === 'notifications' ? ' is-active' : ''}`}>
          <Bell size={15} aria-hidden="true" />Notifications{unreadNotificationCount > 0 && <span className="network-badge">{unreadNotificationCount}</span>}
          </Link>
          <Link to="/app/messages" className={`network-nav-link${activeSection === 'messages' ? ' is-active' : ''}`}><MessageSquare size={15} aria-hidden="true" />Messages{unreadMessages > 0 && <span className="network-badge">{unreadMessages}</span>}</Link>
      
   {ownUsername && <Link to={`/profile/${encodeURIComponent(ownUsername)}`} className="network-nav-link"><UserRound size={15} aria-hidden="true" />My profile</Link>}
<AccountMenu onSignOut={handleSignOut} signingOut={signingOut} />
        </nav>
 
      </header>

      <AccountRestrictionNotice userId={user.id} />
      <section className={`network-content network-content--${activeSection}`}>
        <div className="network-heading">
          <div><p className="eyebrow">YOUR COMMUNITY</p><h1>{pageTitles[activeSection] || 'Your network'}</h1></div>
          {['friends', 'discover'].includes(activeSection) && (
            <label className="network-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeSection === 'friends' ? 'friends' : 'people'}…`} /></label>
          )}
        </div>

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
          <div className="network-loading" role="status"><LoaderCircle size={20} className="spinner" aria-hidden="true" />Loading your network…</div>
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
                  const notificationText = notification.type === 'friend_request' ? 'sent you a friend request.'
                    : notification.type === 'friend_request_accepted' ? 'accepted your friend request.'
                      : notification.type === 'message' ? 'sent you a message.'
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
                }) : <div className="network-empty"><Bell size={21} /><h2>{notifications.length ? 'No matching notifications' : 'You’re all caught up'}</h2><p>{notifications.length ? 'Choose another category to see more activity.' : 'Friend requests, messages, reactions, and comments will appear here.'}</p></div>}
              </section>
            )}

            {activeSection === 'messages' && (
              <div className="network-messenger">
                <aside className={`network-conversation-list${selectedConversationId ? ' network-conversation-list--mobile-hidden' : ''}`}>
                  <div className="network-conversation-heading"><h2>Messages</h2><span>{conversations.length}</span></div>
                  <label className="network-search network-search--conversation"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations…" /></label>
                  {conversations.filter((conversation) => profileName(conversation.peer).toLowerCase().includes(query.trim().toLowerCase()) || conversation.peer?.username?.toLowerCase().includes(query.trim().toLowerCase())).map((conversation) => (
                    <div
                      className={`network-conversation-row${conversation.id === selectedConversationId ? ' is-selected' : ''}`}
                      key={conversation.id}
                      onClick={() => navigate(`/app/messages/${encodeURIComponent(conversation.id)}`)}
                    >
                      <UserIdentity profile={conversation.peer} availability={profileAvailability(conversation.peer)} small onClick={(event) => event.stopPropagation()} />
                      <Link className="network-conversation-summary" to={`/app/messages/${encodeURIComponent(conversation.id)}`} onClick={(event) => event.stopPropagation()}>
                        <span>{conversation.lastMessage?.content || 'Start a conversation'}<small>Open conversation</small></span>
                        {conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}
                      </Link>
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
                      </header>
                      <div className="network-message-list">
                        {hasMoreMessages && <button className="network-load-older" type="button" onClick={loadOlderMessages} disabled={loadingOlderMessages}>{loadingOlderMessages ? 'Loading…' : 'Load older messages'}</button>}
                        {messages.map((message) => (
                          <article className={`network-message${message.sender_id === user.id ? ' network-message--own' : ''}`} key={message.id}>
                            <div className="network-message-bubble">
                              <p>{message.content}</p>
                              <div><time dateTime={message.created_at}>{formatTime(message.created_at, true)}</time>
                                {message.sender_id === user.id && (
                                  <span className="network-message-receipt" title="Read status based on recipient's last opened time">
                                    {new Date(conversationPeerReadAt(activeConversation, user.id)) >= new Date(message.created_at)
                                      ? <CheckCheck size={12} aria-label="Read" />
                                      : <Check size={12} aria-label="Sent" />}
                                  </span>
                                )}
                                {message.sender_id === user.id && (
                                  <button type="button" aria-label="Delete message" onClick={() => deleteMessage(message)} disabled={workingId === message.id}><Trash2 size={12} /></button>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                        {typingConversationId === selectedConversationId && <div className="network-typing"><Link to={`/profile/${encodeURIComponent(activeConversation.peer?.username || '')}`}>{profileName(activeConversation.peer)}</Link> is typing…</div>}
                        <div ref={messagesEndRef} />
                        {!messages.length && <div className="network-chat-empty">Say hello and start the conversation.</div>}
                      </div>
                      <form className="network-message-form" onSubmit={handleSendMessage}>
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
                          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                          rows={2}
                          value={draft}
                        />
                        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message">
                          {sending ? <LoaderCircle size={18} className="spinner" /> : <Send size={18} />}
                        </button>
                      </form>
                    </>
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
      </section>
      <footer className="member-feed-footer">
        <span>QORVEXA <span>·</span> Connect Beyond Limits.</span>
        <span>Signed in as {currentUsername ? `@${currentUsername}` : currentUserName}</span>
      </footer>
      {reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />}
    </main>
  )
}

export default NetworkPage
