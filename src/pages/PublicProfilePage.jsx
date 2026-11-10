import AccountMenu from '../components/AccountMenu.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  AlertCircle,
  Compass,
  Rss,
  Repeat2,
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Bell,
  ExternalLink,
  Flag,
  Globe,
  GraduationCap,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MessageSquare,
  Shield,
  UserPlus,
  UserRoundX,
  Users,
  X,
  Phone,
UserRound,
  Pencil,
  Plus,
} from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import { authorizeRealtimeSession, getSupabaseClient } from '../lib/supabase.js'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import ProfilePhotoCropModal from '../components/ProfilePhotoCropModal.jsx'
import NotificationToast from '../components/NotificationToast.jsx'
import notificationToastText from '../lib/notificationToastText.js'
import PostComposer from '../components/PostComposer.jsx'
import PostReactionButton from '../components/PostReactionButton.jsx'
import PostShareButton from '../components/PostShareButton.jsx'
import PostActionMenu from '../components/PostActionMenu.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import SmartTextInput from '../components/social/SmartTextInput.jsx'
import LinkedText from '../components/social/LinkedText.jsx'
import BrandMark from '../components/BrandMark.jsx'
import ReportDialog from '../components/ReportDialog.jsx'

const postFields = 'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'
const availabilityEvent = 'qorvexa:availability-change'

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}
function formatBirthdate(value) {
  if (!value) return ''

  const [year, month, day] = value.split('-')

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))))
}

function profileInitials(profile) {
  return (profile.display_name || profile.username || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function PublicProfilePage() {
  const { username: routeUsername = '', postId: routePostId = '' } = useParams()
  const [directPostUsername, setDirectPostUsername] = useState('')
  const username = (routeUsername || directPostUsername).toLowerCase()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedPostId = searchParams.get('post') || routePostId
  const selectedCommentId = searchParams.get('comment')
  const previewRequested = searchParams.get('view') === 'public'
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [postCount, setPostCount] = useState(0)
  const [loadedPostCount, setLoadedPostCount] = useState(0)
  const [loadedAuthoredPostCount, setLoadedAuthoredPostCount] = useState(0)
  const [loadedRepostCount, setLoadedRepostCount] = useState(0)
  const [loadingMorePosts, setLoadingMorePosts] = useState(false)
  const [friends, setFriends] = useState([])
  const [friendSearch, setFriendSearch] = useState('')
  const [mutualFriends, setMutualFriends] = useState([])
  const [friendListVisible, setFriendListVisible] = useState(false)
  const [followStats, setFollowStats] = useState({ followerCount: 0, followingCount: 0, isFollowing: false })
  const [friendship, setFriendship] = useState({ accepted: false, outgoing: null, incoming: null })
  const [activeTab, setActiveTab] = useState('posts')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [likeCounts, setLikeCounts] = useState({})
  const [likedPostIds, setLikedPostIds] = useState(() => new Set())
  const [postReactions, setPostReactions] = useState({})
  const [commentsByPost, setCommentsByPost] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyTarget, setReplyTarget] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(() => new Set())
  const postsRef = useRef(posts)
  const commentsOpenRef = useRef(commentsOpen)

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  useEffect(() => {
    commentsOpenRef.current = commentsOpen
  }, [commentsOpen])
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [availability, setAvailability] = useState('offline')
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [notificationToast, setNotificationToast] = useState('')
  const [reportTarget, setReportTarget] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [selectedCropFile, setSelectedCropFile] = useState(null)
  const [isEditingBio, setIsEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [bioError, setBioError] = useState('')
  const profilePicInputRef = useRef(null)
  const profileLoadIdRef = useRef(0)

  // Listen to profile updates dispatched anywhere in the app
  useEffect(() => {
    function handleProfileUpdated(event) {
      const { avatar_url, bio, userId } = event.detail || {}
      if (userId && profile?.id && userId === profile.id) {
        setProfile((curr) => {
          if (!curr) return curr
          const next = { ...curr }
          if (avatar_url !== undefined) next.avatar_url = avatar_url
          if (bio !== undefined) next.bio = bio
          return next
        })
      }
    }
    window.addEventListener('qorvexa:profile-updated', handleProfileUpdated)
    return () => window.removeEventListener('qorvexa:profile-updated', handleProfileUpdated)
  }, [profile?.id])

  async function handleSaveBio() {
    const cleanBio = bioDraft.trim()
    if (cleanBio.length > 280) {
      setBioError('Bio must be 280 characters or fewer.')
      return
    }

    setSavingBio(true)
    setBioError('')
    try {
      const client = getSupabaseClient()
      const { error: updateError } = await client
        .from('profiles')
        .update({ bio: cleanBio })
        .eq('id', user.id)

      if (updateError) throw updateError

      setProfile((curr) => curr ? { ...curr, bio: cleanBio } : curr)
      setIsEditingBio(false)
      setNotice('Bio updated successfully.')

      window.dispatchEvent(
        new CustomEvent('qorvexa:profile-updated', {
          detail: { bio: cleanBio, userId: user.id },
        })
      )
    } catch (err) {
      setBioError(err.message || 'Failed to update bio.')
    } finally {
      setSavingBio(false)
    }
  }
  async function handleSignOut() {
  setError('')
  setSigningOut(true)

  try {
    const { error: signOutError } = await getSupabaseClient().auth.signOut()
    if (signOutError) throw signOutError
    navigate('/', { replace: true })
  } catch (signOutError) {
    setError(signOutError.message || 'We could not sign you out. Please try again.')
  } finally {
    setSigningOut(false)
  }
}

  const loadUnreadCounts = useCallback(async () => {
    if (!user) return
    const client = getSupabaseClient()
    const [notificationsResult, conversationsResult] = await Promise.all([
      client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
      client.rpc('get_conversation_summaries'),
    ])
    if (notificationsResult.error) throw notificationsResult.error
    if (conversationsResult.error) throw conversationsResult.error
    setUnreadNotificationCount(notificationsResult.count || 0)
    setUnreadMessageCount((conversationsResult.data || []).reduce((total, item) => total + Number(item.unread_count || 0), 0))
  }, [user])

  const loadProfile = useCallback(async () => {
    const loadId = ++profileLoadIdRef.current
    setLoading(true)
    setError('')
    setProfile(null)
    setPosts([])
    try {
      const client = getSupabaseClient()
      const { data: profileRows, error: profileError } = await client.rpc('get_public_profile', {
        target_username: username,
        public_preview: previewRequested,
      })
      if (profileError) throw profileError
      if (loadId !== profileLoadIdRef.current) return
      const member = profileRows?.[0] || null
      if (!member) {
        setPostCount(0)
        setLoadedPostCount(0)
        setLoadedAuthoredPostCount(0)
        setLoadedRepostCount(0)
        setFriends([])
        setFollowStats({ followerCount: 0, followingCount: 0, isFollowing: false })
        return
      }

      let postsQuery = client.from('posts')
        .select(postFields, { count: 'exact' })
        .eq('author_id', member.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (previewRequested && user?.id === member.id) {
        postsQuery = postsQuery.eq('post_visibility', 'public')
      }

      let repostQuery = client.from('post_reposts')
        .select('id, post_id, user_id, created_at, profiles!post_reposts_user_id_fkey(username, display_name, avatar_url), posts!post_reposts_post_id_fkey!inner(id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url))', { count: 'exact' })
        .eq('user_id', member.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (previewRequested && user?.id === member.id) {
        repostQuery = repostQuery.eq('posts.post_visibility', 'public')
      }

      const [postResult, repostResult, friendListResult, requestResult, ownFriendsResult, followStatsResult] = await Promise.all([
        postsQuery,
        repostQuery,
        client.rpc('get_profile_friends', { target_user_id: member.id }),
        user && user.id !== member.id
          ? client.from('friend_requests').select('id, sender_id, receiver_id, status, created_at')
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${member.id}),and(sender_id.eq.${member.id},receiver_id.eq.${user.id})`)
          : Promise.resolve({ data: [], error: null }),
        user && user.id !== member.id
          ? client.rpc('get_profile_friends', { target_user_id: user.id })
          : Promise.resolve({ data: [], error: null }),
        client.rpc('get_profile_follow_stats', { target_user_id: member.id }),
      ])
      if (loadId !== profileLoadIdRef.current) return
      for (const result of [postResult, repostResult, friendListResult, requestResult, ownFriendsResult, followStatsResult]) {
        if (result.error) throw result.error
      }

      const authoredPosts = (postResult.data || []).map((post) => ({
        ...post,
        feed_entry_id: `post:${post.id}`,
        feed_created_at: post.created_at,
        is_repost: false,
      }))
      const repostEntries = (repostResult.data || [])
        .filter((repost) => repost.posts)
        .map((repost) => ({
          ...repost.posts,
          feed_entry_id: `repost:${repost.id}`,
          feed_created_at: repost.created_at,
          reposted_by: repost.profiles,
          is_repost: true,
        }))

      let profilePosts = [...authoredPosts, ...repostEntries]
        .sort((a, b) => new Date(b.feed_created_at).getTime() - new Date(a.feed_created_at).getTime())

      if (selectedPostId && !profilePosts.some((post) => post.id === selectedPostId)) {
        let selectedPostQuery = client.from('posts')
          .select(postFields)
          .eq('id', selectedPostId)
          .eq('author_id', member.id)
        if (previewRequested && user?.id === member.id) {
          selectedPostQuery = selectedPostQuery.eq('post_visibility', 'public')
        }
        const { data: selectedPost, error: selectedPostError } = await selectedPostQuery.maybeSingle()
        if (selectedPostError) throw selectedPostError

        if (selectedPost) {
          profilePosts = [{
            ...selectedPost,
            feed_entry_id: `post:${selectedPost.id}`,
            feed_created_at: selectedPost.created_at,
            is_repost: false,
          }, ...profilePosts]
        } else {
          let selectedRepostQuery = client.from('post_reposts')
            .select('id, post_id, user_id, created_at, profiles!post_reposts_user_id_fkey(username, display_name, avatar_url), posts!post_reposts_post_id_fkey!inner(id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url))')
            .eq('user_id', member.id)
            .eq('post_id', selectedPostId)
          if (previewRequested && user?.id === member.id) {
            selectedRepostQuery = selectedRepostQuery.eq('posts.post_visibility', 'public')
          }
          const { data: selectedRepost, error: selectedRepostError } = await selectedRepostQuery.maybeSingle()
          if (selectedRepostError) throw selectedRepostError
          if (selectedRepost?.posts) {
            profilePosts = [{
              ...selectedRepost.posts,
              feed_entry_id: `repost:${selectedRepost.id}`,
              feed_created_at: selectedRepost.created_at,
              reposted_by: selectedRepost.profiles,
              is_repost: true,
            }, ...profilePosts]
          }
        }
      }

      const requestRows = requestResult.data || []
      const accepted = user ? await client.from('friendships')
        .select('user_low, user_high')
        .or(`and(user_low.eq.${user.id},user_high.eq.${member.id}),and(user_low.eq.${member.id},user_high.eq.${user.id})`)
        .maybeSingle() : { data: null, error: null }
      if (accepted.error) throw accepted.error
      if (loadId !== profileLoadIdRef.current) return
      const outgoing = requestRows.find((request) => request.status === 'pending' && request.sender_id === user?.id) || null
      const incoming = requestRows.find((request) => request.status === 'pending' && request.receiver_id === user?.id) || null
      const isFriend = Boolean(accepted.data)
      const profileFriends = friendListResult.data || []
      const myFriendIds = new Set((ownFriendsResult.data || []).map((friend) => friend.id))

      setProfile(member)
      setPosts(profilePosts)
      setPostCount(Number(postResult.count ?? (postResult.data || []).length) + Number(repostResult.count ?? (repostResult.data || []).length))
      setLoadedAuthoredPostCount((postResult.data || []).length)
      setLoadedRepostCount((repostResult.data || []).length)
      setLoadedPostCount((postResult.data || []).length + (repostResult.data || []).length)
      setFriends(profileFriends)
      setFriendship({ accepted: isFriend, outgoing, incoming })
      const followRow = followStatsResult.data?.[0]
      setFollowStats({
        followerCount: Number(followRow?.follower_count || 0),
        followingCount: Number(followRow?.following_count || 0),
        isFollowing: Boolean(followRow?.is_following),
      })
      setFriendListVisible(
        previewRequested && user?.id === member.id
          ? member.friends_visibility === 'everyone'
          : member.id === user?.id
            || member.friends_visibility === 'everyone'
            || (member.friends_visibility === 'friends' && isFriend),
      )
      setMutualFriends(previewRequested ? [] : profileFriends.filter((friend) => myFriendIds.has(friend.id)))

      const postIds = profilePosts.map((post) => post.id)
      if (postIds.length) {
        const [likesResult, likedResult, commentsResult] = await Promise.all([
          client.rpc('get_visible_post_like_counts', { target_post_ids: postIds }),
          user
            ? client.from('post_likes').select('post_id,reaction_type').eq('user_id', user.id).in('post_id', postIds)
            : Promise.resolve({ data: [], error: null }),
          client.from('comments')
            .select('id, post_id, author_id, parent_id, content, created_at, profiles!comments_author_id_fkey(username, display_name, avatar_url)')
            .in('post_id', postIds)
            .order('created_at', { ascending: true })
            .limit(500),
        ])
        if (loadId !== profileLoadIdRef.current) return
        if (likesResult.error) throw likesResult.error
        if (likedResult.error) throw likedResult.error
        if (commentsResult.error) throw commentsResult.error
        const counts = Object.fromEntries((likesResult.data || []).map((like) => [like.post_id, Number(like.like_count)]))
        const liked = new Set((likedResult.data || []).map((like) => like.post_id))
        const reactions = Object.fromEntries((likedResult.data || []).map((like) => [like.post_id, like.reaction_type]))
        const commentRows = commentsResult.data || []
        const groupedComments = Object.fromEntries(postIds.map((id) => [id, commentRows.filter((comment) => comment.post_id === id)]))
        setLikeCounts(counts)
        setLikedPostIds(liked)
        setPostReactions(reactions)
        setCommentsByPost(groupedComments)
      } else {
        setLikeCounts({})
        setLikedPostIds(new Set())
        setPostReactions({})
        setCommentsByPost({})
      }
    } catch (loadError) {
      if (loadId === profileLoadIdRef.current) {
        setError(loadError.message || 'This profile could not be loaded.')
      }
    } finally {
      if (loadId === profileLoadIdRef.current) setLoading(false)
    }
  }, [previewRequested, selectedPostId, user, username])

  useEffect(() => {
    if (!routePostId) return undefined

    let cancelled = false
    setLoading(true)
    setError('')
    setDirectPostUsername('')

    async function resolveDirectPost() {
      try {
        const { data, error: postError } = await getSupabaseClient()
          .from('posts')
          .select('id, profiles!posts_author_id_fkey(username)')
          .eq('id', routePostId)
          .maybeSingle()

        if (postError) throw postError
        if (cancelled) return

        const authorUsername = data?.profiles?.username
        if (!authorUsername) {
          setProfile(null)
          setPosts([])
          setError("This post is unavailable or you don't have permission to view it.")
          setLoading(false)
          return
        }

        setDirectPostUsername(authorUsername)
      } catch {
        if (!cancelled) {
          setProfile(null)
          setPosts([])
          setError("This post is unavailable or you don't have permission to view it.")
          setLoading(false)
        }
      }
    }

    void resolveDirectPost()
    return () => { cancelled = true }
  }, [routePostId])

  useEffect(() => {
    if (routePostId && !directPostUsername) return undefined
    const timer = window.setTimeout(() => { void loadProfile() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadProfile, routePostId, directPostUsername])
  useEffect(() => {
    if (!selectedPostId) return undefined

    if (!posts.some((post) => post.id === selectedPostId)) return undefined

    if (selectedCommentId) {
      const postComments = commentsByPost[selectedPostId]
      if (!postComments) return undefined

      setCommentsOpen((current) => {
        if (current.has(selectedPostId)) return current
        return new Set([...current, selectedPostId])
      })
    }
    const timer = window.setTimeout(() => {
      const target = (selectedCommentId ? document.getElementById(`post-comment-${selectedCommentId}`) : null)
        || document.getElementById(`post-${selectedPostId}`)

      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [selectedPostId, selectedCommentId, commentsByPost, posts])
  useEffect(() => {
    if (!profile?.id) return undefined

    let active = true
    let refreshTimer
    const client = getSupabaseClient()

    function scheduleProfileRefresh() {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (active) void loadProfile()
      }, 150)
    }

    const channel = client.channel(`profile-post-updates-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'posts',
        filter: `author_id=eq.${profile.id}`,
      }, scheduleProfileRefresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'post_likes',
      }, (payload) => {
        const reactionUserId = payload.new?.user_id || payload.old?.user_id
        if (reactionUserId && reactionUserId === user?.id) return

        const postId = payload.new?.post_id || payload.old?.post_id
        if (postId && postsRef.current.some((post) => post.id === postId)) {
          scheduleProfileRefresh()
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
      }, (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id
        if (
          postId &&
          postsRef.current.some((post) => post.id === postId) &&
          commentsOpenRef.current.has(postId)
        ) {
          scheduleProfileRefresh()
        }
      })
      .subscribe((channelStatus) => {
        if (active && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(channelStatus)) {
          setError('Live profile updates are temporarily unavailable. Reconnecting…')
        }
      })

    return () => {
      active = false
      window.clearTimeout(refreshTimer)
      client.removeChannel(channel)
    }
  }, [loadProfile, profile?.id, user?.id])

  useEffect(() => {
    if (!notificationToast) return undefined
    const timer = window.setTimeout(() => setNotificationToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notificationToast])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    const client = getSupabaseClient()
    const timer = window.setTimeout(() => {
      loadUnreadCounts().catch((loadError) => { if (active) setError(loadError.message || 'Unread counts could not be loaded.') })
    }, 0)
    const channel = client.channel(`profile-live-badges-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new?.actor_id !== user.id) {
          setNotificationToast(notificationToastText(payload.new?.type))
        }
        loadUnreadCounts().catch((loadError) => { if (active) setError(loadError.message || 'Notification counts could not be updated.') })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadUnreadCounts().catch((loadError) => { if (active) setError(loadError.message || 'Message counts could not be updated.') })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        loadUnreadCounts().catch((loadError) => { if (active) setError(loadError.message || 'Message counts could not be updated.') })
      })
      .subscribe((channelStatus) => {
        if (active && (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT')) {
          setError('Live notification counts are temporarily unavailable. Reconnecting...')
        }
      })
    return () => {
      active = false
      window.clearTimeout(timer)
      client.removeChannel(channel)
    }
  }, [loadUnreadCounts, user])

 
  useEffect(() => {
    if (!user || !profile?.id) return undefined

    let active = true
    let channel = null

    const client = getSupabaseClient()

    // When viewing your own profile, use your saved availability setting.
    if (user.id === profile.id) {
      const handleAvailabilityChange = (event) => {
        if (['online', 'busy', 'offline'].includes(event.detail?.availability)) {
          setAvailability(event.detail.availability)
        }
      }

      client.rpc('get_own_profile_settings')
        .then(({ data, error: settingsError }) => {
          if (settingsError) throw settingsError
          if (active) {
            setAvailability(data?.[0]?.availability_status || 'online')
          }
        })
        .catch((settingsError) => {
          if (active) {
            setError(settingsError.message || 'Your availability could not be loaded.')
          }
        })

      window.addEventListener(availabilityEvent, handleAvailabilityChange)

      return () => {
        active = false
        window.removeEventListener(availabilityEvent, handleAvailabilityChange)
      }
    }

    // Check whether this viewer is allowed to see the member's status.
    const canListen =
      profile.online_status_visibility === 'everyone' ||
      (profile.online_status_visibility === 'friends' && friendship.accepted)

    if (!canListen) {
      setAvailability('offline')
      return undefined
    }

    setAvailability('offline')

    async function subscribeToFriendPresence() {
      try {
        // Authenticate Realtime before creating the private channel.
        await authorizeRealtimeSession(client)

        if (!active) return

        const topic = `qorvexa-online-presence:${profile.id}`

        channel = client.channel(topic, {
          config: {
            private: true,
            presence: {
              key: user.id,
              enabled: true,
            },
          },
        })

        channel.on('presence', { event: 'sync' }, () => {
          if (!active) return

          const state = channel.presenceState()

          console.log('[QORVEXA Friend Presence]', {
            friendId: profile.id,
            viewerId: user.id,
            state,
          })

          const presences = Object.values(state).flat()

          const friendPresence = presences.find(
            (entry) => entry.user_id === profile.id,
          )

          setAvailability(
            ['online', 'busy'].includes(friendPresence?.availability)
              ? friendPresence.availability
              : 'offline',
          )
        })

        channel.subscribe((status, error) => {
          console.log('[QORVEXA Friend Presence Subscription]', {
            friendId: profile.id,
            topic,
            status,
            error: error?.message || null,
          })

          if (error) {
            console.error('[QORVEXA Friend Presence Error]', error)
          }

          if (!active) return

          if (
            ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)
          ) {
            setAvailability('offline')
          }
        })
      } catch (presenceError) {
        if (active) {
          console.error(
            '[QORVEXA Friend Presence Authorization Error]',
            presenceError,
          )
          setAvailability('offline')
        }
      }
    }

    subscribeToFriendPresence()

    return () => {
      active = false

      if (channel) {
        client.removeChannel(channel)
      }
    }
  }, [
    friendship.accepted,
    profile?.id,
    profile?.online_status_visibility,
    user,
  ])


  async function loadMorePosts() {
    if (!profile || loadingMorePosts) return
    setLoadingMorePosts(true)
    setError('')
    try {
      const client = getSupabaseClient()
      const authoredStart = loadedAuthoredPostCount
      const repostStart = loadedRepostCount
      const isPublicPreview = searchParams.get('view') === 'public' && user?.id === profile.id

      let postsQuery = client.from('posts')
        .select(postFields)
        .eq('author_id', profile.id)
        .order('created_at', { ascending: false })
        .range(authoredStart, authoredStart + 49)
      if (isPublicPreview) postsQuery = postsQuery.eq('post_visibility', 'public')

      let repostQuery = client.from('post_reposts')
        .select('id, post_id, user_id, created_at, profiles!post_reposts_user_id_fkey(username, display_name, avatar_url), posts!post_reposts_post_id_fkey!inner(id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url))')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .range(repostStart, repostStart + 49)
      if (isPublicPreview) repostQuery = repostQuery.eq('posts.post_visibility', 'public')

      const [postsResult, repostsResult] = await Promise.all([postsQuery, repostQuery])
      if (postsResult.error) throw postsResult.error
      if (repostsResult.error) throw repostsResult.error

      const newAuthoredPosts = (postsResult.data || []).map((post) => ({
        ...post,
        feed_entry_id: `post:${post.id}`,
        feed_created_at: post.created_at,
        is_repost: false,
      }))
      const newReposts = (repostsResult.data || [])
        .filter((repost) => repost.posts)
        .map((repost) => ({
          ...repost.posts,
          feed_entry_id: `repost:${repost.id}`,
          feed_created_at: repost.created_at,
          reposted_by: repost.profiles,
          is_repost: true,
        }))
      const newEntries = [...newAuthoredPosts, ...newReposts]
        .sort((a, b) => new Date(b.feed_created_at).getTime() - new Date(a.feed_created_at).getTime())

      const postIds = [...new Set(newEntries.map((post) => post.id))]
      if (postIds.length) {
        const [likesResult, likedResult, commentsResult] = await Promise.all([
          client.rpc('get_visible_post_like_counts', { target_post_ids: postIds }),
          user
            ? client.from('post_likes').select('post_id,reaction_type').eq('user_id', user.id).in('post_id', postIds)
            : Promise.resolve({ data: [], error: null }),
          client.from('comments')
            .select('id, post_id, author_id, parent_id, content, created_at, profiles!comments_author_id_fkey(username, display_name, avatar_url)')
            .in('post_id', postIds)
            .order('created_at', { ascending: true })
            .limit(500),
        ])
        for (const result of [likesResult, likedResult, commentsResult]) {
          if (result.error) throw result.error
        }
        setLikeCounts((current) => ({
          ...current,
          ...Object.fromEntries((likesResult.data || []).map((like) => [like.post_id, Number(like.like_count)])),
        }))
        setLikedPostIds((current) => new Set([...current, ...(likedResult.data || []).map((like) => like.post_id)]))
        setPostReactions((current) => ({
          ...current,
          ...Object.fromEntries((likedResult.data || []).map((like) => [like.post_id, like.reaction_type])),
        }))
        const groupedComments = Object.fromEntries(postIds.map((id) => [
          id,
          (commentsResult.data || []).filter((comment) => comment.post_id === id),
        ]))
        setCommentsByPost((current) => ({ ...current, ...groupedComments }))
      }

      setPosts((current) => {
        const existingIds = new Set(current.map((post) => post.feed_entry_id || `post:${post.id}`))
        return [...current, ...newEntries.filter((post) => !existingIds.has(post.feed_entry_id))]
          .sort((a, b) => new Date(b.feed_created_at || b.created_at).getTime() - new Date(a.feed_created_at || a.created_at).getTime())
      })
      setLoadedAuthoredPostCount(authoredStart + newAuthoredPosts.length)
      setLoadedRepostCount(repostStart + (repostsResult.data || []).length)
      setLoadedPostCount((current) => current + newEntries.length)
    } catch (loadError) {
      setError(loadError.message || 'More profile posts could not be loaded.')
    } finally {
      setLoadingMorePosts(false)
    }
  }

  const isProfileOwner = user?.id === profile?.id
  const isPublicPreview = previewRequested && isProfileOwner
  const isOwner = isProfileOwner && !isPublicPreview
  const isPostDetail = Boolean(routePostId)
  const canSeeOnline = (isPublicPreview
    ? profile?.profile_visibility === 'public' && profile?.online_status_visibility === 'everyone'
    : isProfileOwner)
    || profile?.online_status_visibility === 'everyone'
    || (profile?.online_status_visibility === 'friends' && friendship.accepted)
  const photos = useMemo(() => posts.filter((post) => post.media_path), [posts])
  const visiblePosts = selectedPostId ? posts.filter((post) => post.id === selectedPostId) : posts

  async function runAction(operation, successMessage = '') {
    setWorking(true)
    setError('')
    setNotice('')
    try {
      await operation()
      if (successMessage) setNotice(successMessage)
      await loadProfile()
    } catch (actionError) {
      setError(actionError.message || 'That action could not be completed.')
    } finally {
      setWorking(false)
    }
  }

  function toggleFollow() {
    const shouldUnfollow = followStats.isFollowing

    return runAction(async () => {
      const { error: rpcError } = await getSupabaseClient().rpc(
        shouldUnfollow ? 'unfollow_member' : 'follow_member',
        { target_user_id: profile.id }
      )
      if (rpcError) throw rpcError
    }, shouldUnfollow ? 'You unfollowed this member.' : 'You are now following this member.')
  }

  function sendFriendRequest() {
    return runAction(async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('send_friend_request', { target_user_id: profile.id })
      if (rpcError) throw rpcError
    }, 'Friend request sent.')
  }

  function cancelFriendRequest() {
    return runAction(async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('cancel_friend_request', { request_id: friendship.outgoing.id })
      if (rpcError) throw rpcError
    }, 'Friend request canceled.')
  }

  function respondToFriendRequest(accept) {
    return runAction(async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('respond_to_friend_request', {
        request_id: friendship.incoming.id,
        accept_request: accept,
      })
      if (rpcError) throw rpcError
    }, accept ? 'Friend request accepted.' : 'Friend request declined.')
  }

  function removeFriend() {
    if (!window.confirm(`Remove ${profile.display_name} from your friends?`)) return
    return runAction(async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('remove_friend', { target_user_id: profile.id })
      if (rpcError) throw rpcError
    }, 'Friend removed.')
  }

  async function messageFriend() {
    setWorking(true)
    setError('')
    try {
      const { data, error: rpcError } = await getSupabaseClient().rpc('start_direct_conversation', { target_user_id: profile.id })
      if (rpcError) throw rpcError
      navigate(`/app/messages/${encodeURIComponent(data)}`)
    } catch (actionError) {
      setError(actionError.message || 'This conversation could not be opened.')
    } finally {
      setWorking(false)
    }
  }

  async function blockProfile() {
    if (!window.confirm(`Block ${profile.display_name}? They will no longer be able to view your profile or posts, send friend requests, or access your conversations.`)) return
    await runAction(async () => {
      const { error: rpcError } = await getSupabaseClient().rpc('block_member', { target_user_id: profile.id })
      if (rpcError) throw rpcError
      navigate('/app/privacy')
    })
  }

  async function handlePostReaction(post, nextType) {
    if (isPublicPreview && isProfileOwner) return
    if (!user) {
      navigate('/login')
      return
    }

    const currentType = postReactions[post.id] || null
    const removeReaction = !nextType || nextType === currentType

    setWorking(true)
    setError('')

    try {
      const query = getSupabaseClient().from('post_likes')
      const result = removeReaction
        ? await query.delete().eq('post_id', post.id).eq('user_id', user.id)
        : await query.upsert(
            { post_id: post.id, user_id: user.id, reaction_type: nextType },
            { onConflict: 'post_id,user_id' },
          )

      if (result.error) throw result.error

      setPostReactions((current) => {
        const next = { ...current }
        if (removeReaction) delete next[post.id]
        else next[post.id] = nextType
        return next
      })

      setLikedPostIds((current) => {
        const next = new Set(current)
        if (removeReaction) next.delete(post.id)
        else next.add(post.id)
        return next
      })

      if (!currentType && !removeReaction) {
        setLikeCounts((current) => ({ ...current, [post.id]: (current[post.id] || 0) + 1 }))
      } else if (currentType && removeReaction) {
        setLikeCounts((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] || 0) - 1) }))
      }
    } catch (reactionError) {
      setError(reactionError.message || 'Your reaction could not be updated.')
    } finally {
      setWorking(false)
    }
  }
  async function submitComment(event, postId, parentId = null) {
    event.preventDefault()
    if (isPublicPreview && isProfileOwner) return
    if (!user) {
      navigate('/login')
      return
    }
    const key = parentId || postId
    const content = (parentId ? replyDrafts[parentId] : commentDrafts[postId])?.trim()
    if (!content) return
    setWorking(true)
    setError('')
    try {
      const { error: insertError } = await getSupabaseClient().from('comments').insert({
        post_id: postId,
        author_id: user.id,
        parent_id: parentId,
        content,
      })
      if (insertError) throw insertError
      setCommentDrafts((current) => ({ ...current, [postId]: '' }))
      setReplyDrafts((current) => ({ ...current, [key]: '' }))
      setReplyTarget('')
      await loadProfile()
    } catch (commentError) {
      setError(commentError.message || 'Your comment could not be published.')
    } finally {
      setWorking(false)
    }
  }

  const profileAction = isPublicPreview
    ? <Link className="network-button network-button--primary" to={`/profile/${encodeURIComponent(profile.username)}`}><ArrowLeft size={15} />Exit public preview</Link>
    : !user
      ? <Link className="network-button network-button--primary" to="/login"><UserPlus size={15} />Sign in to connect</Link>
           : isOwner
  ? null
  : friendship.accepted
        ? <>
          <button className="network-button network-button--primary" type="button" onClick={messageFriend} disabled={working}><MessageCircle size={15} />Message</button>
          <button className="network-button" type="button" onClick={removeFriend} disabled={working}><Users size={15} />Friends</button>
        </>
        : friendship.incoming
          ? <>
            <button className="network-button network-button--primary" type="button" onClick={() => respondToFriendRequest(true)} disabled={working}><Check size={15} />Accept request</button>
            <button className="network-button" type="button" onClick={() => respondToFriendRequest(false)} disabled={working}>Decline</button>
          </>
          : friendship.outgoing
            ? <button className="network-button" type="button" onClick={cancelFriendRequest} disabled={working}>Request sent · Cancel</button>
            : <button className="network-button network-button--primary" type="button" onClick={sendFriendRequest} disabled={working}><UserPlus size={15} />Add Friend</button>

  const tabs = [
    ['posts', 'Posts'],
    ['about', 'About'],
    ['friends', 'Friends'],
    ['photos', 'Photos'],
    ['activity', 'Activity'],
  ]

  return (
    <main className="member-page public-profile-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      {user && <NotificationToast message={notificationToast} onDismiss={() => setNotificationToast('')} />}
      <header className="member-header member-feed-header">
        <Link className="brand-link" to={user ? '/app' : '/'} aria-label="QORVEXA home"><BrandMark /></Link>
       <nav className="network-nav" aria-label="Community navigation">
  {user ? <>
    <Link className="network-nav-link" to="/app"><Rss size={15} aria-hidden="true" />Feed</Link>
    <Link className="network-nav-link" to="/app/discover"><UserPlus size={15} aria-hidden="true" />Discover</Link>
    <Link className="network-nav-link" to="/app/friends"><Users size={15} aria-hidden="true" />Friends</Link>
    <Link className="network-nav-link" to="/app/notifications"><Bell size={15} aria-hidden="true" />Notifications{unreadNotificationCount > 0 && <span className="network-badge">{unreadNotificationCount}</span>}</Link>
    <Link className="network-nav-link" to="/app/messages"><MessageCircle size={15} aria-hidden="true" />Messages{unreadMessageCount > 0 && <span className="network-badge">{unreadMessageCount}</span>}</Link>
    <AccountMenu onSignOut={handleSignOut} signingOut={signingOut} />
  </> : <><Link className="network-nav-link" to="/login">Sign in</Link><Link className="network-nav-link" to="/signup">Join QORVEXA</Link></>}
</nav>
      </header>

      <section className="public-profile-shell">
        {loading || authLoading ? (
          <div className="member-feed-state" role="status"><LoaderCircle className="spinner" size={20} />Loading profile...</div>
        ) : !profile ? (
          <div className="public-profile-not-found">
            <AlertCircle size={22} />
            <h1>Profile unavailable</h1>
            <p>This profile may not exist, may be private, or may not be visible to your account.</p>
            {error && <p role="alert">{error}</p>}
            {error && <button className="network-button" type="button" onClick={loadProfile}>Try again</button>}
            <Link className="member-home-link" to={user ? '/app' : '/'}><ArrowLeft size={14} />Return to QORVEXA</Link>
          </div>
        ) : (
          <>
            {!isPostDetail && (
            <section className="public-profile-card" aria-label={`${profile.display_name}'s profile`}>
              <div className="public-profile-cover">
                {profile.cover_photo_path && <ProtectedMediaImage path={profile.cover_photo_path} alt="" className="public-profile-cover-image" />}
              </div>
              <div className="public-profile-summary">
                <div className="public-profile-avatar-wrapper">
                  <div className="public-profile-avatar">
                    {profile.avatar_url
                        ? <ProtectedMediaImage path={profile.avatar_url} alt={`${profile.display_name}'s profile picture`} fallback={profileInitials(profile)} />
                      : <span>{profileInitials(profile)}</span>}
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      className="public-profile-avatar-camera-btn"
                      onClick={() => profilePicInputRef.current?.click()}
                      title="Update profile picture"
                      aria-label="Update profile picture"
                    >
                      <Camera size={16} />
                    </button>
                  )}
                </div>
                <div className="public-profile-heading">
                  <p className="eyebrow">QORVEXA MEMBER</p>
                  <h1>{profile.display_name}</h1>
                  <p className="public-profile-username">@{profile.username}</p>
                  {isOwner ? (
                    isEditingBio ? (
                      <div className="public-profile-bio-editor">
                        <textarea
                          className="public-profile-bio-textarea"
                          value={bioDraft}
                          onChange={(e) => setBioDraft(e.target.value)}
                          maxLength={280}
                          rows={3}
                          placeholder="Tell people something about yourself..."
                          autoFocus
                        />
                        <div className="public-profile-bio-editor-footer">
                          <span className="public-profile-bio-count">{bioDraft.length}/280</span>
                          <div className="public-profile-bio-editor-actions">
                            {bioDraft.trim() && (
                              <button
                                type="button"
                                className="public-profile-bio-clear-btn"
                                onClick={() => setBioDraft('')}
                                disabled={savingBio}
                              >
                                Clear
                              </button>
                            )}
                            <button
                              type="button"
                              className="network-button"
                              onClick={() => {
                                setIsEditingBio(false)
                                setBioError('')
                              }}
                              disabled={savingBio}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="network-button network-button--primary"
                              onClick={handleSaveBio}
                              disabled={savingBio}
                            >
                              {savingBio ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                        {bioError && <p className="public-profile-bio-error">{bioError}</p>}
                      </div>
                    ) : (
                      <div className="public-profile-bio-container">
                        {profile.bio ? (
                          <>
                            <p className="public-profile-bio">{profile.bio}</p>
                            <button
                              type="button"
                              className="public-profile-edit-bio-btn"
                              onClick={() => {
                                setBioDraft(profile.bio || '')
                                setIsEditingBio(true)
                                setBioError('')
                              }}
                              title="Edit bio"
                              aria-label="Edit bio"
                            >
                              <Pencil size={12} />
                              <span>Edit bio</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="public-profile-add-bio-btn"
                            onClick={() => {
                              setBioDraft('')
                              setIsEditingBio(true)
                              setBioError('')
                            }}
                          >
                            <Plus size={13} />
                            <span>Add bio</span>
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    profile.bio && <p className="public-profile-bio">{profile.bio}</p>
                  )}
                  <div className="public-profile-stats">
                    {friendListVisible && <span><strong>{friends.length}</strong> friends</span>}
                    <span><strong>{followStats.followerCount}</strong> followers</span>
                    <span><strong>{followStats.followingCount}</strong> following</span>
                    <span><strong>{postCount}</strong> posts</span>
                    {mutualFriends.length > 0 && <span><strong>{mutualFriends.length}</strong> mutual friends</span>}
                    <span><CalendarDays size={14} />Joined {formatDate(profile.created_at)}</span>
                    {canSeeOnline && <span className={`is-${availability}`}><i />{availability === 'busy' ? 'Busy' : availability === 'online' ? 'Online' : 'Offline'}</span>}
                  </div>
                </div>
                <div className="public-profile-actions">
                  {profileAction}
                  {user && !isOwner && !isPublicPreview && (
                    <button
                      className={`network-button ${followStats.isFollowing ? '' : 'network-button--primary'}`}
                      type="button"
                      onClick={toggleFollow}
                      disabled={working}
                    >
                      {followStats.isFollowing ? <><Check size={15} />Following</> : <><UserPlus size={15} />Follow</>}
                    </button>
                  )}
                  {isOwner && <>
                    <button
                      type="button"
                      className="network-button"
                      onClick={() => profilePicInputRef.current?.click()}
                    >
                      <Camera size={15} />Edit profile picture
                    </button>
                    <Link className="network-button" to="/app/profile#cover-photo"><Camera size={15} />Edit cover photo</Link>
                  </>}
                  {!isOwner && !isProfileOwner && user && <>
                    <button className="network-button" type="button" onClick={() => setReportTarget({ reportedUserId: profile.id, type: 'user', id: profile.id })}><Flag size={14} />Report</button>
                    <button className="network-button network-button--danger" type="button" onClick={blockProfile} disabled={working}><UserRoundX size={14} />Block</button>
                  </>}
                  {isOwner && <Link className="network-button" to={`/profile/${encodeURIComponent(profile.username)}?view=public`}>View as public</Link>}
                  {!user && <Link className="network-button" to="/signup">Join the community</Link>}
                </div>
              </div>
              <nav className="public-profile-tabs" aria-label="Profile sections">
                {tabs.map(([tab, label]) => (
                  <button type="button" key={tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => { setActiveTab(tab); if (selectedPostId) navigate(`/profile/${encodeURIComponent(profile.username)}`) }} aria-current={activeTab === tab ? 'page' : undefined}>
                    {label}{tab === 'friends' && friendListVisible && <span>{friends.length}</span>}
                  </button>
                ))}
              </nav>
            </section>
            )}

            {isOwner && (
              <>
                <input
                  ref={profilePicInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setSelectedCropFile(file)
                      setCropModalOpen(true)
                    }
                    e.target.value = ''
                  }}
                />
                <ProfilePhotoCropModal
                  isOpen={cropModalOpen}
                  initialFile={selectedCropFile}
                  userId={user?.id}
                  currentAvatarUrl={profile?.avatar_url}
                  onClose={() => {
                    setCropModalOpen(false)
                    setSelectedCropFile(null)
                  }}
                  onSuccess={(newPath, newPost) => {
                    setProfile((curr) => curr ? { ...curr, avatar_url: newPath } : curr)
                    setPosts((curr) => {
                      const updated = curr.map((post) => {
                        if (post.author_id === user?.id) {
                          return {
                            ...post,
                            profiles: { ...post.profiles, avatar_url: newPath },
                          }
                        }
                        return post
                      })
                      if (newPost) {
                        return [
                          {
                            ...newPost,
                            feed_entry_id: 'post:' + newPost.id,
                            feed_created_at: newPost.created_at,
                            is_repost: false,
                          },
                          ...updated,
                        ]
                      }
                      return updated
                    })
                    if (newPost) {
                      setPostCount((count) => count + 1)
                      setLoadedPostCount((count) => count + 1)
                      setLoadedAuthoredPostCount((count) => count + 1)
                    }
                    setNotice('Profile picture updated and posted to timeline.')
                  }}
                />
              </>
            )}

            {error && <div className="settings-message settings-message--error public-profile-message" role="alert"><AlertCircle size={16} />{error}</div>}
            {notice && <p className="settings-message settings-message--success public-profile-message" role="status">{notice}</p>}

            {!isPostDetail && isOwner && (
              <PostComposer
                userId={user.id}
                idPrefix="profile-post"
                onPublished={(post) => {
                  const profilePost = { ...post, feed_entry_id: `post:${post.id}`, feed_created_at: post.created_at, is_repost: false }
                  setPosts((current) => [profilePost, ...current.filter((item) => item.id !== post.id)].sort((a, b) => new Date(b.feed_created_at || b.created_at).getTime() - new Date(a.feed_created_at || a.created_at).getTime()))
                  setPostCount((count) => count + 1)
                  setLoadedPostCount((count) => count + 1)
                  setLoadedAuthoredPostCount((count) => count + 1)
                  if (selectedPostId) navigate(`/profile/${encodeURIComponent(profile.username)}`, { replace: true })
                }}
                onError={setError}
              />
            )}

            {(isPostDetail || activeTab === 'posts') && (
              <section className="public-profile-content" aria-label="Profile posts">
                {selectedPostId && <Link className="public-profile-back" to={`/profile/${encodeURIComponent(profile.username)}`}><ArrowLeft size={14} />{isPostDetail ? 'View profile' : 'All posts'}</Link>}
                {!visiblePosts.length
                  ? <div className="member-feed-empty"><span><MessageSquare size={20} /></span><h2>No visible posts yet</h2><p>Posts shared with you will appear here.</p></div>
                  : visiblePosts.map((post) => {
                    const postAuthor = post.profiles || profile
                    const postAuthorUrl = postAuthor?.username
                      ? `/profile/${encodeURIComponent(postAuthor.username)}`
                      : `/profile/${encodeURIComponent(profile.username)}`
                    return (
                    <article id={`post-${post.id}`} className={`member-post public-profile-post${selectedPostId ? ' is-detail' : ''}`} key={post.feed_entry_id || post.id}>
                      <div className="member-post-avatar">
                        {postAuthor.avatar_url ? <ProtectedMediaImage path={postAuthor.avatar_url} alt="" fallback={profileInitials(postAuthor)} /> : profileInitials(postAuthor)}
                      </div>
                      <div className="member-post-body">
                        {post.is_repost && <div className="member-post-meta member-post-repost-banner"><Repeat2 size={14} aria-hidden="true" /><span><Link to={`/profile/${encodeURIComponent(profile.username)}`}><strong>{profile.display_name || profile.username}</strong></Link> reposted</span></div>}
                        <div className="member-post-header">
                          <div className="member-post-header-author">
                            <div className="member-post-author-name">
                              <Link to={postAuthorUrl}><strong>{postAuthor.display_name || postAuthor.username}</strong></Link>
                              {post.media_path?.includes('/avatars/') && (
                                <span className="member-post-action-subtext"> updated their profile picture</span>
                              )}
                            </div>
                            <div className="member-post-author-sub">
                              {postAuthor?.username && <Link to={postAuthorUrl} className="member-post-username">@{postAuthor.username}</Link>}
                              {postAuthor?.username && <span className="member-post-author-dot" aria-hidden="true">·</span>}
                              <Link className="member-post-permalink" to={`/post/${post.id}`}>
                                <Clock3 size={12} aria-hidden="true" />
                                <span>{formatDate(post.is_repost ? post.feed_created_at : post.created_at)}</span>
                              </Link>
                            </div>
                          </div>
                          <div className="member-post-header-actions">
                            <PostActionMenu
                              items={[
                                {
                                  id: 'comments',
                                  label: commentsOpen.has(post.id) ? 'Hide comments' : 'View comments',
                                  icon: MessageCircle,
                                  onClick: () => setCommentsOpen((current) => {
                                    const next = new Set(current)
                                    if (next.has(post.id)) next.delete(post.id)
                                    else next.add(post.id)
                                    return next
                                  }),
                                },
                                {
                                  id: 'open-post',
                                  label: 'Open post',
                                  icon: ExternalLink,
                                  to: `/post/${post.id}`,
                                },
                                user && post.author_id !== user.id && !(isPublicPreview && isProfileOwner) && {
                                  id: 'report',
                                  label: 'Report post',
                                  icon: Flag,
                                  danger: true,
                                  onClick: () => setReportTarget({ reportedUserId: post.author_id, type: 'post', id: post.id }),
                                },
                              ]}
                            />
                          </div>
                        </div>
                        {isOwner && !post.is_repost && <span className="public-post-audience"><Shield size={12} />{post.post_visibility === 'only_me' ? 'Only me' : post.post_visibility === 'friends' ? 'Friends' : 'Public'}</span>}
                        {post.content && <p className="member-post-content"><LinkedText text={post.content} /></p>}
                        {post.media_path && (
                          <button
                            className={`public-profile-photo-button ${post.media_path.includes('/avatars/') ? 'member-post-media-link--avatar-post' : ''}`}
                            type="button"
                            onClick={() => setSelectedPhoto(post.media_path)}
                          >
                            <ProtectedMediaImage
                              className={`member-post-media ${post.media_path.includes('/avatars/') ? 'member-post-media--avatar-post' : ''}`}
                              path={post.media_path}
                              alt="Image attached to post"
                              loading="lazy"
                            />
                          </button>
                        )}
                        <div className="member-post-footer member-post-action-bar">
                          <PostReactionButton
                            reaction={postReactions[post.id]}
                            count={likeCounts[post.id] || 0}
                            disabled={working || (isPublicPreview && isProfileOwner)}
                            onReact={(type) => handlePostReaction(post, type)}
                          />
                          <button className={`member-comments-toggle${commentsOpen.has(post.id) ? ' is-active' : ''}`} type="button" onClick={() => setCommentsOpen((current) => {
                            const next = new Set(current)
                            if (next.has(post.id)) next.delete(post.id)
                            else next.add(post.id)
                            return next
                          })} aria-expanded={commentsOpen.has(post.id)}><MessageCircle size={14} /><span>{commentsByPost[post.id]?.length || 0} comments</span></button>
                          <PostShareButton url={`/post/${post.id}`} />
                          {!user && <Link className="member-comments-toggle" to="/login">Sign in to interact</Link>}
                        </div>
                        {commentsOpen.has(post.id) && <div className="public-profile-comments">
                          {(commentsByPost[post.id] || []).filter((comment) => !comment.parent_id).map((comment) => {
                            const commentAuthor = comment.profiles
                            const commentName = commentAuthor?.display_name || commentAuthor?.username || 'QORVEXA member'
                            const commentUrl = commentAuthor?.username ? `/profile/${encodeURIComponent(commentAuthor.username)}` : ''
                            const commentReplies = commentsByPost[post.id].filter((reply) => reply.parent_id === comment.id)
                            return <div id={`post-comment-${comment.id}`} className="public-profile-comment-thread" key={comment.id}>
                              <div className="public-profile-comment">
                                {commentUrl
                                  ? <Link to={commentUrl} className="public-profile-comment-avatar">{commentAuthor?.avatar_url ? <ProtectedMediaImage path={commentAuthor.avatar_url} alt="" fallback={profileInitials(commentAuthor)} /> : profileInitials(commentAuthor)}</Link>
                                  : <span className="public-profile-comment-avatar">{profileInitials({ display_name: commentName })}</span>}
                                <div><p>{commentUrl ? <Link to={commentUrl}><strong>{commentName}</strong></Link> : <strong>{commentName}</strong>} <LinkedText text={comment.content} /></p>
                                  {user && !(isPublicPreview && isProfileOwner) && <button type="button" onClick={() => setReplyTarget(replyTarget === comment.id ? '' : comment.id)}>Reply</button>}
                                  {replyTarget === comment.id && user && !(isPublicPreview && isProfileOwner) && <form className="member-inline-comment-form" onSubmit={(event) => submitComment(event, post.id, comment.id)}>
                                    <SmartTextInput maxLength={1000} value={replyDrafts[comment.id] || ''} onChange={(nextValue) => setReplyDrafts((current) => ({ ...current, [comment.id]: nextValue }))} placeholder={`Reply to ${commentName}...`} aria-label={`Reply to ${commentName}`} />
                                    <EmojiPicker onSelect={(emoji) => setReplyDrafts((current) => ({ ...current, [comment.id]: `${current[comment.id] || ''}${emoji}` }))} />
                                    <button type="submit" disabled={working || !replyDrafts[comment.id]?.trim()}>Reply</button>
                                  </form>}
                                </div>
                              </div>
                              {commentReplies.map((reply) => {
                                const replyAuthor = reply.profiles
                                const replyName = replyAuthor?.display_name || replyAuthor?.username || 'QORVEXA member'
                                const replyUrl = replyAuthor?.username ? `/profile/${encodeURIComponent(replyAuthor.username)}` : ''
                                return <div id={`post-comment-${reply.id}`} className="public-profile-comment public-profile-comment--reply" key={reply.id}>
                                  {replyUrl
                                    ? <Link to={replyUrl} className="public-profile-comment-avatar">{replyAuthor?.avatar_url ? <ProtectedMediaImage path={replyAuthor.avatar_url} alt="" fallback={profileInitials(replyAuthor)} /> : profileInitials(replyAuthor)}</Link>
                                    : <span className="public-profile-comment-avatar">{profileInitials({ display_name: replyName })}</span>}
                                  <p>{replyUrl ? <Link to={replyUrl}><strong>{replyName}</strong></Link> : <strong>{replyName}</strong>} <LinkedText text={reply.content} /></p>
                                </div>
                              })}
                            </div>
                          })}
                          {user && !(isPublicPreview && isProfileOwner) && <form className="member-inline-comment-form" onSubmit={(event) => submitComment(event, post.id)}>
                            <SmartTextInput maxLength={1000} value={commentDrafts[post.id] || ''} onChange={(nextValue) => setCommentDrafts((current) => ({ ...current, [post.id]: nextValue }))} placeholder="Write a comment..." aria-label="Write a comment" />
                            <EmojiPicker onSelect={(emoji) => setCommentDrafts((current) => ({ ...current, [post.id]: `${current[post.id] || ''}${emoji}` }))} />
                            <button type="submit" disabled={working || !commentDrafts[post.id]?.trim()}>Comment</button>
                          </form>}
                        </div>}
                      </div>
                    </article>
                    )
                  })}
              </section>
            )}
            {['posts', 'photos', 'activity'].includes(activeTab) && loadedPostCount < postCount && (
              <button className="public-profile-load-more" type="button" onClick={loadMorePosts} disabled={loadingMorePosts}>
                {loadingMorePosts ? <><LoaderCircle className="spinner" size={15} />Loading...</> : 'Load more posts'}
              </button>
            )}

            {!isPostDetail && activeTab === 'about' && (
              <section className="public-profile-about public-profile-content" aria-label="About">
                <h2>About {profile.display_name}</h2>
                <p className="public-profile-about-bio">{profile.bio || 'This member has not added a bio yet.'}</p>
                <ul>
  {profile.location && (
    <li>
      <MapPin size={17} />
      <span><strong>Location</strong>{profile.location}</span>
    </li>
  )}

  {profile.website && (
    <li>
      <Globe size={17} />
      <span>
        <strong>Website</strong>
        <a href={profile.website} target="_blank" rel="noreferrer">
          {profile.website}
        </a>
      </span>
    </li>
  )}

  {profile.education && (
    <li>
      <GraduationCap size={17} />
      <span><strong>Education</strong>{profile.education}</span>
    </li>
  )}

  {profile.workplace && (
    <li>
      <BriefcaseBusiness size={17} />
      <span><strong>Work</strong>{profile.workplace}</span>
    </li>
  )}

  {profile.gender && (
    <li>
      <UserRound size={17} />
      <span><strong>Gender</strong>{profile.gender}</span>
    </li>
  )}

  {profile.birthdate && (
    <li>
      <CalendarDays size={17} />
      <span>
        <strong>Birthdate</strong>
        {formatBirthdate(profile.birthdate)}
      </span>
    </li>
  )}

  {profile.phone_number && (
    <li>
      <Phone size={17} />
      <span><strong>Phone number</strong>{profile.phone_number}</span>
    </li>
  )}

  <li>
    <CalendarDays size={17} />
    <span><strong>Joined</strong>{formatDate(profile.created_at)}</span>
  </li>
</ul>
                {isOwner && <Link className="network-button" to="/app/profile">Edit your profile details</Link>}
              </section>
            )}

            {!isPostDetail && activeTab === 'friends' && (
              <section className="public-profile-content" aria-label="Friends">
                {!friendListVisible
                  ? <div className="member-feed-empty"><span><Users size={20} /></span><h2>Friends list is private</h2><p>{profile.display_name} has limited who can see this list.</p></div>
                  : friends.length
                    ? <>
                      <label className="public-profile-friend-search"><Users size={15} /><input value={friendSearch} onChange={(event) => setFriendSearch(event.target.value)} placeholder="Search friends..." aria-label="Search friends" /></label>
                      <div className="public-profile-friends-grid">{friends.filter((friend) => `${friend.display_name} ${friend.username}`.toLowerCase().includes(friendSearch.trim().toLowerCase())).map((friend) => (
                      <Link className="public-profile-friend-card" to={`/profile/${encodeURIComponent(friend.username)}`} key={friend.id}>
                        <span className="public-profile-friend-avatar">{friend.avatar_url ? <ProtectedMediaImage path={friend.avatar_url} alt="" fallback={profileInitials(friend)} /> : profileInitials(friend)}</span>
                        <span><strong>{friend.display_name}</strong><small>@{friend.username}</small></span>
                      </Link>
                      ))}</div>
                    </>
                    : <div className="member-feed-empty"><span><Users size={20} /></span><h2>No friends to show</h2><p>Accepted friends will appear here.</p></div>}
                {mutualFriends.length > 0 && <div className="public-profile-mutual"><h3>Mutual friends</h3>{mutualFriends.slice(0, 6).map((friend) => <Link key={friend.id} to={`/profile/${encodeURIComponent(friend.username)}`}>@{friend.username}</Link>)}</div>}
              </section>
            )}

            {!isPostDetail && activeTab === 'photos' && (
              <section className="public-profile-content" aria-label="Photos">
                {photos.length
                  ? <div className="public-profile-photo-grid">{photos.map((post) => <button type="button" key={post.id} onClick={() => setSelectedPhoto(post.media_path)} aria-label={`Open photo from ${formatDate(post.created_at)}`}><ProtectedMediaImage path={post.media_path} alt="Photo from a profile post" loading="lazy" /></button>)}</div>
                  : <div className="member-feed-empty"><span><Camera size={20} /></span><h2>No photos to show</h2><p>Photos shared with you will appear here.</p></div>}
              </section>
            )}

            {!isPostDetail && activeTab === 'activity' && (
              <section className="public-profile-content" aria-label="Public activity">
                <h2>Recent public activity</h2>
                <p className="public-profile-activity-note">Only posts visible to you are included. Private messages and account activity are never shown.</p>
                {posts.length ? posts.filter((post) => post.post_visibility === 'public' || isOwner || friendship.accepted).map((post) => (
                  <Link className="public-profile-activity-item" key={post.id} to={`/profile/${encodeURIComponent(profile.username)}?post=${post.id}`}>
                    <BookOpen size={16} /><span>{post.content || 'Shared a photo'}</span><time>{formatDate(post.created_at)}</time>
                  </Link>
                )) : <p>No public activity to show.</p>}
              </section>
            )}
          </>
        )}
      </section>

      {selectedPhoto && <div className="public-profile-photo-viewer" role="presentation" onClick={() => setSelectedPhoto(null)}>
        <button type="button" aria-label="Close photo" onClick={() => setSelectedPhoto(null)}><X size={21} /></button>
        <ProtectedMediaImage path={selectedPhoto} alt="Selected profile photo" />
      </div>}
      {reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />}
    </main>
  )
}

export default PublicProfilePage
