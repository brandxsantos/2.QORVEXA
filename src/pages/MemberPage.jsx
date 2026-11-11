import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bell,
  Clock3,
  Compass,
  CornerDownRight,
  ExternalLink,
  Flag,
  Globe,
  LoaderCircle,
  Lock,
  LogOut,
  Bookmark,
  MessageCircle,
  Rss,
  Repeat2,
  ShieldCheck,
  Trash2,
  Users,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import { useAuth } from '../context/useAuth.js'
import { useNotifications } from '../context/useNotifications.js'
import { getSupabaseClient } from '../lib/supabase.js'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import NotificationToast from '../components/NotificationToast.jsx'
import notificationToastText from '../lib/notificationToastText.js'
import PostComposer from '../components/PostComposer.jsx'
import PostReactionButton from '../components/PostReactionButton.jsx'
import PostShareButton from '../components/PostShareButton.jsx'
import PostActionMenu from '../components/PostActionMenu.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import SmartTextInput from '../components/social/SmartTextInput.jsx'
import LinkedText from '../components/social/LinkedText.jsx'
import ProfilePhotoCropModal from '../components/ProfilePhotoCropModal.jsx'
import ReportDialog from '../components/ReportDialog.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'
import AppHeader from '../components/AppHeader.jsx'

const postSelection = 'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'

function isPostsSetupError(error) {
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)
    || error.message?.includes('public.posts')
    || error.message?.includes('public.post_reposts')
}

function isCommentsSetupError(error) {
  return error.code === '42P01'
    || error.code === 'PGRST200'
    || error.code === 'PGRST205'
    || error.message?.includes('public.comments')
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function formatPostDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function shouldKeepPostAfterDelete(item, deletedPost) {
  if (!item || !deletedPost) return true
  if (item.id && deletedPost.id && item.id === deletedPost.id) {
    return false
  }
  if (
    typeof item.feed_entry_id === 'string' &&
    item.feed_entry_id &&
    typeof deletedPost.feed_entry_id === 'string' &&
    deletedPost.feed_entry_id &&
    item.feed_entry_id === deletedPost.feed_entry_id
  ) {
    return false
  }
  if (item.original_post_id && deletedPost.id && item.original_post_id === deletedPost.id) {
    return false
  }
  if (item.post_id && deletedPost.id && item.post_id === deletedPost.id) {
    return false
  }
  return true
}

function MemberPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [feedFilter, setFeedFilter] = useState('for-you')
  const [friendIds, setFriendIds] = useState(() => new Set())
  const [followingIds, setFollowingIds] = useState(() => new Set())
  const [memberProfile, setMemberProfile] = useState(null)
  const [likeCounts, setLikeCounts] = useState({})
  const { unreadNotificationCount } = useNotifications()
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [notificationToast, setNotificationToast] = useState('')
  const [likedPostIds, setLikedPostIds] = useState(() => new Set())
  const [postReactions, setPostReactions] = useState({})
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState(() => new Set())
  const [repostCounts, setRepostCounts] = useState({})
  const [repostedPostIds, setRepostedPostIds] = useState(() => new Set())
  const [postActionId, setPostActionId] = useState('')
  const [commentsByPost, setCommentsByPost] = useState({})
  const [commentsOpen, setCommentsOpen] = useState({})
  const commentsOpenRef = useRef(commentsOpen)
  const currentFeedLoaderRef = useRef(null)
  const [commentsStatus, setCommentsStatus] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyTarget, setReplyTarget] = useState(null)
  const [feedStatus, setFeedStatus] = useState('loading')
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(null)
  const [deletingComment, setDeletingComment] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [selectedCropFile, setSelectedCropFile] = useState(null)
  const accountMenuRef = useRef(null)
  const avatarInputRef = useRef(null)

  function openAccountMenu() {
    if (!accountMenuRef.current) return
    accountMenuRef.current.open = true
    accountMenuRef.current.querySelector('summary')?.focus()
  }

  function handleAvatarFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedCropFile(file)
    setCropModalOpen(true)
    event.target.value = ''
  }

  // Real-time synchronization for profile changes (photo, bio)
  useEffect(() => {
    function handleProfileUpdated(event) {
      const { avatar_url, bio, userId } = event.detail || {}
      if (userId && user?.id && userId === user.id) {
        setMemberProfile((current) => {
          if (!current) return current
          const next = { ...current }
          if (avatar_url !== undefined) next.avatar_url = avatar_url
          if (bio !== undefined) next.bio = bio
          return next
        })
        if (avatar_url) {
          setPosts((currentPosts) => currentPosts.map((post) => {
            if (post.author_id === user.id) {
              return {
                ...post,
                profiles: { ...post.profiles, avatar_url },
              }
            }
            return post
          }))
        }
      }
    }
    window.addEventListener('qorvexa:profile-updated', handleProfileUpdated)
    return () => window.removeEventListener('qorvexa:profile-updated', handleProfileUpdated)
  }, [user?.id])
  const name = memberProfile?.display_name || user.user_metadata?.display_name || user.user_metadata?.username || 'QORVEXA member'
  const username = memberProfile?.username || user.user_metadata?.username || ''

  useEffect(() => { commentsOpenRef.current = commentsOpen }, [commentsOpen])

  useEffect(() => {
    if (!notificationToast) return undefined
    const timer = window.setTimeout(() => setNotificationToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notificationToast])

  useEffect(() => {
    function handleRealtimeNotification(event) {
      const payload = event.detail
      if (payload?.eventType === 'INSERT' && payload?.new?.actor_id !== user.id) {
        setNotificationToast(notificationToastText(payload.new?.type))
      }
    }
    window.addEventListener('qorvexa:notification-realtime', handleRealtimeNotification)
    return () => window.removeEventListener('qorvexa:notification-realtime', handleRealtimeNotification)
  }, [user.id])

  useEffect(() => {
    let active = true
    getSupabaseClient().from('profiles')
      .select('id, username, display_name, bio, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data, error: profileError }) => {
        if (!active) return
        if (profileError) {
          setError(profileError.message || 'Your profile could not be loaded.')
          return
        }
        setMemberProfile(data)
      })
    return () => { active = false }
  }, [user.id])


  const loadPosts = useCallback(async (authorIds = null, publicOnly = false) => {
    if (authorIds !== null && authorIds.length === 0) {
      setLikeCounts({})
      setLikedPostIds(new Set())
      setPostReactions({})
      setBookmarkedPostIds(new Set())
      setRepostCounts({})
      setRepostedPostIds(new Set())
      return []
    }

    const client = getSupabaseClient()
    let query = client
      .from('posts')
      .select(postSelection)
      .order('created_at', { ascending: false })

    if (authorIds !== null) {
      query = query.in('author_id', authorIds)
    }

    if (publicOnly) {
      query = query.eq('post_visibility', 'public')
    }

    const { data, error: queryError } = await query.limit(50)

    if (queryError) throw queryError
    const postRows = data || []
    let repostQuery = client
      .from('post_reposts')
      .select('id, post_id, user_id, created_at, profiles!post_reposts_user_id_fkey(username, display_name, avatar_url), posts!post_reposts_post_id_fkey!inner(id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url))')
      .order('created_at', { ascending: false })

    if (authorIds !== null) {
      repostQuery = repostQuery.in('user_id', authorIds)
    }

    if (publicOnly) {
      repostQuery = repostQuery.eq('posts.post_visibility', 'public')
    }

    const { data: repostRows, error: repostQueryError } = await repostQuery.limit(50)
    if (repostQueryError) throw repostQueryError

    const repostEntries = (repostRows || [])
      .filter((repost) => repost.posts)
      .map((repost) => ({
        ...repost.posts,
        feed_entry_id: `repost:${repost.id}`,
        feed_author_id: repost.user_id,
        feed_created_at: repost.created_at,
        reposted_by: repost.profiles,
        is_repost: true,
      }))

    const feedEntries = [
      ...postRows.map((post) => ({
        ...post,
        feed_entry_id: `post:${post.id}`,
        feed_author_id: post.author_id,
        feed_created_at: post.created_at,
        is_repost: false,
      })),
      ...repostEntries,
    ]

    const postIds = [...new Set(feedEntries.map((post) => post.id))]

    if (postIds.length) {
      const [likesResult, likedResult, bookmarksResult, repostsResult] = await Promise.all([
        client.rpc('get_visible_post_like_counts', { target_post_ids: postIds }),
        client.from('post_likes').select('post_id,reaction_type').eq('user_id', user.id).in('post_id', postIds),
        client.from('post_bookmarks').select('post_id').eq('user_id', user.id).in('post_id', postIds),
        client.from('post_reposts').select('post_id,user_id').in('post_id', postIds),
      ])

      if (likesResult.error) throw likesResult.error
      if (likedResult.error) throw likedResult.error
      if (bookmarksResult.error) throw bookmarksResult.error
      if (repostsResult.error) throw repostsResult.error

      const counts = Object.fromEntries((likesResult.data || []).map((like) => [like.post_id, Number(like.like_count)]))
      const likedIds = new Set((likedResult.data || []).map((like) => like.post_id))
      const reactions = Object.fromEntries((likedResult.data || []).map((like) => [like.post_id, like.reaction_type]))
      const repostCounts = (repostsResult.data || []).reduce((counts, repost) => {
        counts[repost.post_id] = (counts[repost.post_id] || 0) + 1
        return counts
      }, {})
      const repostedIds = new Set((repostsResult.data || [])
        .filter((repost) => repost.user_id === user.id)
        .map((repost) => repost.post_id))

      setLikeCounts(counts)
      setLikedPostIds(likedIds)
      setPostReactions(reactions)
      setBookmarkedPostIds(new Set((bookmarksResult.data || []).map((bookmark) => bookmark.post_id)))
      setRepostCounts(repostCounts)
      setRepostedPostIds(repostedIds)
    } else {
      setLikeCounts({})
      setLikedPostIds(new Set())
      setPostReactions({})
      setBookmarkedPostIds(new Set())
      setRepostCounts({})
      setRepostedPostIds(new Set())
    }

    return feedEntries
  }, [user.id])


  const loadFeedRelationships = useCallback(async () => {
    const client = getSupabaseClient()

    const [friendshipsResult, followingResult] = await Promise.all([
      client.from('friendships')
        .select('user_low, user_high')
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
        .limit(500),
      client.from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .limit(500),
    ])

    if (friendshipsResult.error) throw friendshipsResult.error
    if (followingResult.error) throw followingResult.error

    const nextFriendIds = new Set(
      (friendshipsResult.data || []).map((friendship) => (
        friendship.user_low === user.id ? friendship.user_high : friendship.user_low
      ))
    )
    const nextFollowingIds = new Set(
      (followingResult.data || []).map((follow) => follow.following_id)
    )

    setFriendIds(nextFriendIds)
    setFollowingIds(nextFollowingIds)
  }, [user.id])
    const loadCurrentFeedPosts = useCallback(() => {
    if (feedFilter === 'following') {
      return loadPosts([...followingIds], true)
    }

    if (feedFilter === 'friends') {
      return loadPosts([...friendIds], false)
    }

    return loadPosts()
  }, [feedFilter, followingIds, friendIds, loadPosts])

  currentFeedLoaderRef.current = loadCurrentFeedPosts

  useEffect(() => {
    let active = true

    loadFeedRelationships().catch((loadError) => {
      if (active) setError(loadError.message || 'Your feed relationships could not be loaded.')
    })
  

    return () => { active = false }
  }, [loadFeedRelationships])
  const loadMemberBadges = useCallback(async () => {
    const client = getSupabaseClient()
    const conversationsResult = await client.rpc('get_conversation_summaries')
    if (conversationsResult.error) throw conversationsResult.error
    setUnreadMessageCount((conversationsResult.data || []).reduce((total, item) => total + Number(item.unread_count || 0), 0))
  }, [])

  const loadComments = useCallback(async (postId) => {
    setCommentsStatus((current) => ({ ...current, [postId]: 'loading' }))

    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('comments')
        .select('id, post_id, author_id, parent_id, content, created_at, profiles!comments_author_id_fkey(username, display_name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (queryError) throw queryError
      setCommentsByPost((current) => ({ ...current, [postId]: data }))
      setCommentsStatus((current) => ({ ...current, [postId]: 'ready' }))
    } catch (loadError) {
      setCommentsStatus((current) => ({
        ...current,
        [postId]: isCommentsSetupError(loadError) ? 'setup' : 'error',
      }))
      setError(loadError.message || 'Comments could not be loaded.')
    }
  }, [])

 
  useEffect(() => {
    let active = true

    setFeedStatus('loading')

    const timer = window.setTimeout(() => {
      loadCurrentFeedPosts()
        .then((data) => {
          if (!active) return
          setPosts(data)
          setFeedStatus('ready')
          setError('')
        })
        .catch((loadError) => {
          if (!active) return
          setError(loadError.message || 'The feed could not be loaded.')
          setFeedStatus(isPostsSetupError(loadError) ? 'setup' : 'error')
        })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [loadCurrentFeedPosts])


  useEffect(() => {
    let active = true
    const client = getSupabaseClient()
    let refreshTimer
    const badgeLoadTimer = window.setTimeout(() => {
      loadMemberBadges().catch((loadError) => { if (active) setError(loadError.message || 'Unread counts could not be loaded.') })
    }, 0)
    const channel = client.channel(`member-feed-updates-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => {
          currentFeedLoaderRef.current?.()
            .then((data) => { if (active) setPosts(data) })
            .catch((loadError) => { if (active) setError(loadError.message || 'The feed could not be updated.') })
        }, 80)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => {
        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => {
          loadPosts()
            .then((data) => { if (active) setPosts(data) })
            .catch((loadError) => { if (active) setError(loadError.message || 'Reaction updates could not be loaded.') })
        }, 80)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reposts' }, () => {
        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => {
          currentFeedLoaderRef.current?.()
            .then((data) => { if (active) setPosts(data) })
            .catch((loadError) => { if (active) setError(loadError.message || 'Repost updates could not be loaded.') })
        }, 80)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        const postId = payload.new?.post_id || payload.old?.post_id
        if (postId && commentsOpenRef.current[postId]) {
          loadComments(postId).catch((loadError) => { if (active) setError(loadError.message) })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadMemberBadges().catch((loadError) => { if (active) setError(loadError.message || 'Message counts could not be updated.') })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        loadMemberBadges().catch((loadError) => { if (active) setError(loadError.message || 'Message counts could not be updated.') })
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setError('Live feed updates are temporarily unavailable. Reconnecting...')
        }
      })

    return () => {
      active = false
      window.clearTimeout(refreshTimer)
      window.clearTimeout(badgeLoadTimer)
      client.removeChannel(channel)
    }
  }, [loadComments, loadMemberBadges, user.id])

  async function handlePostReaction(post, nextType) {
    if (postActionId) return

    const currentType = postReactions[post.id] || null
    const removeReaction = !nextType || nextType === currentType

    setPostActionId(post.id)
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
      setPostActionId('')
    }
  }

  async function toggleBookmark(post) {
    if (postActionId) return
    const isBookmarked = bookmarkedPostIds.has(post.id)
    setPostActionId(post.id)
    setError('')
    try {
      const query = getSupabaseClient().from('post_bookmarks')
      const result = isBookmarked
        ? await query.delete().eq('post_id', post.id).eq('user_id', user.id)
        : await query.insert({ post_id: post.id, user_id: user.id })
      if (result.error) throw result.error
      setBookmarkedPostIds((current) => {
        const next = new Set(current)
        if (isBookmarked) next.delete(post.id)
        else next.add(post.id)
        return next
      })
    } catch (bookmarkError) {
      setError(bookmarkError.message || 'Your bookmark could not be updated.')
    } finally {
      setPostActionId('')
    }
  }

  async function toggleRepost(post) {
    if (postActionId || post.author_id === user.id) return

    const isReposted = repostedPostIds.has(post.id)
    setPostActionId(post.id)
    setError('')

    try {
      const query = getSupabaseClient().from('post_reposts')
      const result = isReposted
        ? await query.delete().eq('post_id', post.id).eq('user_id', user.id)
        : await query.insert({ post_id: post.id, user_id: user.id })

      if (result.error) throw result.error

      const updatedPosts = await currentFeedLoaderRef.current?.()
      if (updatedPosts) setPosts(updatedPosts)
    } catch (repostError) {
      setError(repostError.message || 'Your repost could not be updated.')
    } finally {
      setPostActionId('')
    }
  }

  async function handleRefresh() {
    setError('')
    setFeedStatus('loading')

    try {
      setPosts(await loadCurrentFeedPosts())
      setFeedStatus('ready')
    } catch (loadError) {
      setError(loadError.message || 'The feed could not be refreshed.')
      setFeedStatus(isPostsSetupError(loadError) ? 'setup' : 'error')
    }
  }

  async function toggleComments(postId) {
    const opening = !commentsOpen[postId]
    setCommentsOpen((current) => ({ ...current, [postId]: opening }))
    if (opening && commentsStatus[postId] !== 'ready') await loadComments(postId)
  }

  async function handleCommentSubmit(event, postId, parentId = null) {
    event.preventDefault()
    const draftKey = parentId || postId
    const draftValue = parentId ? replyDrafts[draftKey] : commentDrafts[draftKey]
    const content = (draftValue || '').trim()
    const requestKey = `${postId}:${parentId || 'root'}`
    if (!content || submittingComment) return

    setError('')
    setSubmittingComment(requestKey)

    try {
      const { error: insertError } = await getSupabaseClient()
        .from('comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          parent_id: parentId,
          content,
        })

      if (insertError) throw insertError
      if (parentId) {
        setReplyDrafts((current) => ({ ...current, [draftKey]: '' }))
        setReplyTarget(null)
      } else {
        setCommentDrafts((current) => ({ ...current, [draftKey]: '' }))
      }
      await loadComments(postId)
    } catch (submitError) {
      setError(submitError.message || 'Your comment could not be published.')
      if (isCommentsSetupError(submitError)) {
        setCommentsStatus((current) => ({ ...current, [postId]: 'setup' }))
      }
    } finally {
      setSubmittingComment(null)
    }
  }

  async function handleDeleteComment(comment) {
    if (!window.confirm('Delete this comment? Replies to it will also be deleted.')) return
    setDeletingComment(comment.id)
    setError('')

    try {
      const { error: deleteError } = await getSupabaseClient()
        .from('comments')
        .delete()
        .eq('id', comment.id)

      if (deleteError) throw deleteError
      await loadComments(comment.post_id)
    } catch (deleteError) {
      setError(deleteError.message || 'The comment could not be deleted.')
    } finally {
      setDeletingComment(null)
    }
  }

  async function handleDeletePost(post) {
    if (!post || post.author_id !== user.id) return
    const confirmed = window.confirm('Are you sure you want to delete this post? This action cannot be undone.')
    if (!confirmed) return

    setPostActionId(post.id)
    setError('')

    try {
      const { error: deleteError } = await getSupabaseClient()
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('author_id', user.id)

      if (deleteError) throw deleteError

      setPosts((currentPosts) => currentPosts.filter((item) => shouldKeepPostAfterDelete(item, post)))
      setCommentsOpen((current) => {
        const next = { ...current }
        delete next[post.id]
        return next
      })
      setCommentsByPost((current) => {
        const next = { ...current }
        delete next[post.id]
        return next
      })
      setNotificationToast('Post deleted.')
    } catch (deleteError) {
      setError(deleteError.message || 'The post could not be deleted.')
    } finally {
      setPostActionId('')
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

  const visiblePosts = [...posts]
    .filter((post) => {
      if (feedFilter === 'following') {
        return followingIds.has(post.feed_author_id || post.author_id) && post.post_visibility === 'public'
      }

      if (feedFilter === 'friends') {
        return friendIds.has(post.feed_author_id || post.author_id)
      }

      return true
    })
    .sort((a, b) => {
      if (feedFilter === 'for-you') {
        const score = (post) => (
          (friendIds.has(post.feed_author_id || post.author_id) ? 2 : 0)
          + (followingIds.has(post.feed_author_id || post.author_id) ? 1 : 0)
        )
        const priorityDifference = score(b) - score(a)
        if (priorityDifference !== 0) return priorityDifference
      }

      return new Date(b.feed_created_at || b.created_at).getTime() - new Date(a.feed_created_at || a.created_at).getTime()
    })
  return (
    <main className="member-page member-feed-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <NotificationToast message={notificationToast} onDismiss={() => setNotificationToast('')} />
      <AppHeader
        activeSection="feed"
        username={username}
        unreadMessageCount={unreadMessageCount}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />

      <AccountRestrictionNotice userId={user.id} />
      <div className="member-feed-layout">
        <aside className="member-profile-card">
          <div className="member-profile-cover" aria-hidden="true" />
          <div className="member-profile-details">
            <Link to={`/profile/${encodeURIComponent(username || '')}`} className="member-avatar" aria-label={`View ${name}'s profile`}>
              {memberProfile?.avatar_url ? <ProtectedMediaImage path={memberProfile.avatar_url} alt="" fallback={getInitials(name)} /> : getInitials(name)}
            </Link>
            <h1><Link to={`/profile/${encodeURIComponent(username || '')}`}>{name}</Link></h1>
            {username && <p className="member-username">@{username}</p>}
            <p className="member-profile-email">{user.email}</p>
            {memberProfile?.bio ? (
              <p className="member-profile-bio">{memberProfile.bio}</p>
            ) : (
              <p className="member-profile-bio member-profile-bio--empty">
                <Link to={username ? `/profile/${encodeURIComponent(username)}` : '/app/profile'}>Tell people something about yourself...</Link>
              </p>
            )}
            <nav className="member-profile-links" aria-label="Account settings">
              <Link to="/app/profile" className="member-home-link">Edit Profile</Link>
              <button
                type="button"
                className="member-home-link"
                onClick={() => avatarInputRef.current?.click()}
              >
                Edit Profile Picture
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={handleAvatarFileChange}
              />
              <Link to="/app/privacy" className="member-home-link">Privacy &amp; blocked accounts</Link>
            </nav>
            <div className="member-profile-divider" />
            <div className="member-profile-status"><ShieldCheck size={16} aria-hidden="true" /><span>Signed in securely</span></div>
          </div>
        </aside>

        <section className="member-feed" aria-label="Community feed">
          <div className="member-feed-heading">
            <div>
              <p className="eyebrow">YOUR COMMUNITY</p>
              <h2>Community feed</h2>
              <p>Share an update with the QORVEXA community.</p>
            </div>
            <span className="member-feed-live"><i /> MEMBERS</span>
          </div>

          <PostComposer
            userId={user.id}
            idPrefix="feed-post"
            onPublished={(post) => setPosts((currentPosts) => [post, ...currentPosts])}
            onError={(message, publishError) => {
              setError(message)
              if (publishError && isPostsSetupError(publishError)) setFeedStatus('setup')
            }}
          />

          <div className="member-feed-tabs" role="tablist" aria-label="Choose feed">
            {[
              { id: 'for-you', label: 'For You' },
              { id: 'following', label: 'Following' },
              { id: 'friends', label: 'Friends' },
              { id: 'latest', label: 'Latest' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={feedFilter === tab.id}
                className={`member-feed-tab${feedFilter === tab.id ? ' is-active' : ''}`}
                onClick={() => setFeedFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {error && (
            <div className="member-feed-error" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>{feedStatus === 'setup' ? 'Feed setup required' : 'Something went wrong'}</strong>
                <span>{feedStatus === 'setup'
                  ? 'Apply the community features migration in Supabase SQL Editor, then refresh this page.'
                  : error}</span>
                {feedStatus === 'setup'
                  ? <><code>supabase/migrations/20261107030000_community_features.sql</code><code>supabase/migrations/20261107032000_public_profiles.sql</code><code>supabase/migrations/20261110010000_post_reposts.sql</code></>
                  : <button type="button" onClick={handleRefresh}>Try again</button>}
              </div>
            </div>
          )}

          {feedStatus === 'loading' ? (
            <div className="member-feed-state" role="status"><LoaderCircle size={20} className="spinner" aria-hidden="true" /> Loading community posts...</div>
          ) : feedStatus === 'ready' && visiblePosts.length === 0 ? (
            <div className="member-feed-empty">
              <span><Users size={20} aria-hidden="true" /></span>
              <h3>
                {feedFilter === 'following'
                  ? 'No posts from followed members yet'
                  : feedFilter === 'friends'
                    ? "Your friends haven't posted yet"
                    : feedFilter === 'latest'
                      ? 'No community posts yet'
                      : 'Your feed is getting ready'}
              </h3>
              <p>
                {feedFilter === 'following'
                  ? 'Follow members to see their public posts here.'
                  : feedFilter === 'friends'
                    ? 'Connect with members and their posts will appear here.'
                    : feedFilter === 'latest'
                      ? 'There are no posts currently available to you.'
                      : 'Follow members, add friends, or share the first update with your community.'}
              </p>
            </div>
          ) : (
            <div className="member-post-list">
              {visiblePosts.map((post) => {
                const author = post.profiles
                const authorName = author?.display_name || author?.username || 'QORVEXA member'
                const authorProfile = author?.username ? `/profile/${encodeURIComponent(author.username)}` : ''
                return (
                  <article className="member-post" key={post.feed_entry_id || post.id}>
                    {authorProfile
                      ? <Link to={authorProfile} className="member-post-avatar" aria-label={`View ${authorName}'s profile`}>
                        {author?.avatar_url ? <ProtectedMediaImage path={author.avatar_url} alt="" fallback={getInitials(authorName)} /> : getInitials(authorName)}
                      </Link>
                      : <div className="member-post-avatar" aria-hidden="true">{getInitials(authorName)}</div>}
                    <div className="member-post-body">
                      {post.is_repost && (
                        <div className="member-post-meta member-post-repost-banner">
                          <Repeat2 size={14} aria-hidden="true" />
                          {post.reposted_by?.username
                            ? <span><Link to={`/profile/${encodeURIComponent(post.reposted_by.username)}`}><strong>{post.reposted_by.display_name || post.reposted_by.username}</strong></Link> reposted</span>
                            : <span>A QORVEXA member reposted</span>}
                        </div>
                      )}
                      <div className="member-post-header">
                        <div className="member-post-header-author">
                          <div className="member-post-author-name">
                            {authorProfile ? <Link to={authorProfile}><strong>{authorName}</strong></Link> : <strong>{authorName}</strong>}
                            {(post.media_path?.includes('/posts/avatar-') || post.media_path?.includes('/avatars/')) && (
                              <span className="member-post-action-subtext"> updated their profile picture</span>
                            )}
                          </div>
                          <div className="member-post-author-sub">
                            {author?.username && <Link to={authorProfile} className="member-post-username">@{author.username}</Link>}
                            {author?.username && <span className="member-post-author-dot" aria-hidden="true">·</span>}
                            <Link className="member-post-permalink" to={`/post/${post.id}`} aria-label={`Open post from ${formatPostDate(post.feed_created_at || post.created_at)}`}>
                              <Clock3 size={12} aria-hidden="true" />
                              <span>{formatPostDate(post.feed_created_at || post.created_at)}</span>
                            </Link>
                            {post.author_id === user.id && (
                              <>
                                <span className="member-post-author-dot" aria-hidden="true">·</span>
                                <span className="member-post-audience-badge" title={`Audience: ${post.post_visibility === 'only_me' ? 'Only me' : post.post_visibility === 'friends' ? 'Friends' : 'Public'}`}>
                                  {post.post_visibility === 'only_me' ? <Lock size={11} aria-hidden="true" /> : post.post_visibility === 'friends' ? <Users size={11} aria-hidden="true" /> : <Globe size={11} aria-hidden="true" />}
                                  <span>{post.post_visibility === 'only_me' ? 'Only me' : post.post_visibility === 'friends' ? 'Friends' : 'Public'}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="member-post-header-actions">
                          <PostActionMenu
                            items={[
                              {
                                id: 'bookmark',
                                label: bookmarkedPostIds.has(post.id) ? 'Saved' : 'Save post',
                                icon: Bookmark,
                                active: bookmarkedPostIds.has(post.id),
                                disabled: postActionId === post.id,
                                onClick: () => toggleBookmark(post),
                              },
                              {
                                id: 'comments',
                                label: commentsOpen[post.id] ? 'Hide comments' : 'View comments',
                                icon: MessageCircle,
                                onClick: () => toggleComments(post.id),
                              },
                              {
                                id: 'open-post',
                                label: 'Open post',
                                icon: ExternalLink,
                                to: `/post/${post.id}`,
                              },
                              post.author_id === user.id && {
                                id: 'delete-post',
                                label: 'Delete post',
                                icon: Trash2,
                                danger: true,
                                disabled: postActionId === post.id,
                                onClick: () => handleDeletePost(post),
                              },
                              post.author_id !== user.id && {
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
                      {post.content && <p className="member-post-content"><LinkedText text={post.content} /></p>}
                      {post.media_path && (
                        <Link
                          to={`/post/${post.id}`}
                          className={`member-post-media-link ${(post.media_path.includes('/posts/avatar-') || post.media_path.includes('/avatars/')) ? 'member-post-media-link--avatar-post' : ''}`}
                        >
                          <ProtectedMediaImage
                            className={`member-post-media ${(post.media_path.includes('/posts/avatar-') || post.media_path.includes('/avatars/')) ? 'member-post-media--avatar-post' : ''}`}
                            path={post.media_path}
                            alt="Image attached to post"
                            loading="lazy"
                          />
                        </Link>
                      )}
                      <div className="member-post-footer member-post-action-bar">
                        <PostReactionButton
                          reaction={postReactions[post.id]}
                          count={likeCounts[post.id] || 0}
                          disabled={postActionId === post.id}
                          onReact={(type) => handlePostReaction(post, type)}
                        />
                        <button
                          className={`member-comments-toggle member-post-action-btn${commentsOpen[post.id] ? ' is-active' : ''}`}
                          type="button"
                          onClick={() => toggleComments(post.id)}
                          aria-expanded={Boolean(commentsOpen[post.id])}
                        >
                          <MessageCircle size={15} aria-hidden="true" />
                          <span className="member-action-label">{commentsByPost[post.id]?.length ? `${commentsByPost[post.id].length} comments` : 'Comment'}</span>
                        </button>
                        {post.author_id !== user.id && (
                          <button
                            className={`member-comments-toggle member-post-action-btn${repostedPostIds.has(post.id) ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => toggleRepost(post)}
                            disabled={Boolean(postActionId)}
                            aria-pressed={repostedPostIds.has(post.id)}
                          >
                            <Repeat2 size={15} aria-hidden="true" />
                            <span className="member-action-label">{repostedPostIds.has(post.id) ? 'Undo repost' : 'Repost'}</span>
                            {repostCounts[post.id] > 0 && <span className="member-repost-count">{repostCounts[post.id]}</span>}
                          </button>
                        )}
                        <PostShareButton url={`/post/${post.id}`} />
                      </div>
                      {commentsOpen[post.id] && (
                        <section className="member-comments" aria-label="Comments">
                          {commentsStatus[post.id] === 'loading' ? (
                            <div className="member-comments-state" role="status"><LoaderCircle size={15} className="spinner" aria-hidden="true" /> Loading comments...</div>
                          ) : commentsStatus[post.id] === 'setup' ? (
                            <div className="member-comments-error" role="alert">
                              <strong>Comments need one database migration.</strong>
                              <span>Run this script once in the Supabase SQL Editor:</span>
                              <code>supabase/migrations/20261107011500_comments.sql</code>
                            </div>
                          ) : commentsStatus[post.id] === 'error' ? (
                            <div className="member-comments-error" role="alert">
                              <span>{error || 'Comments could not be loaded.'}</span>
                              <button type="button" onClick={() => loadComments(post.id)}>Try again</button>
                            </div>
                          ) : (
                            <>
                              {(commentsByPost[post.id] || [])
                                .filter((comment) => !comment.parent_id)
                                .map((comment) => {
                                  const commentAuthor = comment.profiles
                                  const commentName = commentAuthor?.display_name || commentAuthor?.username || 'QORVEXA member'
                                  const replies = commentsByPost[post.id].filter((reply) => reply.parent_id === comment.id)
                                  return (
                                    <div className="member-comment-thread" key={comment.id}>
                                      <div className="member-comment">
                                        {commentAuthor?.username
                                          ? <Link to={`/profile/${encodeURIComponent(commentAuthor.username)}`} className="member-comment-avatar" aria-label={`View ${commentName}'s profile`}>
                                            {commentAuthor?.avatar_url ? <ProtectedMediaImage path={commentAuthor.avatar_url} alt="" fallback={getInitials(commentName)} /> : getInitials(commentName)}
                                          </Link>
                                          : <div className="member-comment-avatar" aria-hidden="true">{getInitials(commentName)}</div>}
                                        <div className="member-comment-body">
                                        <div className="member-comment-meta">
                                          {commentAuthor?.username ? <Link to={`/profile/${encodeURIComponent(commentAuthor.username)}`}><strong>{commentName}</strong></Link> : <strong>{commentName}</strong>}
                                          {commentAuthor?.username && <Link to={`/profile/${encodeURIComponent(commentAuthor.username)}`}>@{commentAuthor.username}</Link>}
                                          <time dateTime={comment.created_at}>{formatPostDate(comment.created_at)}</time>
                                        </div>
                                          <p><LinkedText text={comment.content} /></p>
                                          <div className="member-comment-actions">
                                            <button type="button" onClick={() => setReplyTarget(replyTarget === comment.id ? null : comment.id)}>Reply</button>
                                            {comment.author_id !== user.id && <button type="button" onClick={() => setReportTarget({ reportedUserId: comment.author_id, type: 'comment', id: comment.id })}><Flag size={12} aria-hidden="true" /> Report</button>}
                                            {comment.author_id === user.id && (
                                              <button type="button" onClick={() => handleDeleteComment(comment)} disabled={deletingComment === comment.id}>
                                                <Trash2 size={12} aria-hidden="true" /> {deletingComment === comment.id ? 'Deleting...' : 'Delete'}
                                              </button>
                                            )}
                                          </div>
                                          {replyTarget === comment.id && (
                                            <form className="member-inline-comment-form" onSubmit={(event) => handleCommentSubmit(event, post.id, comment.id)}>
                                              <SmartTextInput
                                                aria-label={`Reply to ${commentName}`}
                                                maxLength={1000}
                                                onChange={(nextValue) => setReplyDrafts((current) => ({ ...current, [comment.id]: nextValue }))}
                                                placeholder={`Reply to ${commentName}...`}
                                                value={replyDrafts[comment.id] || ''}
                                              />
                                              <EmojiPicker onSelect={(emoji) => setReplyDrafts((current) => ({ ...current, [comment.id]: `${current[comment.id] || ''}${emoji}` }))} />
                                              <button type="submit" disabled={!replyDrafts[comment.id]?.trim() || Boolean(submittingComment)}>
                                                {submittingComment === `${post.id}:${comment.id}` ? 'Sending...' : 'Reply'}
                                              </button>
                                            </form>
                                          )}
                                        </div>
                                      </div>
                                      {replies.map((reply) => {
                                        const replyAuthor = reply.profiles
                                        const replyName = replyAuthor?.display_name || replyAuthor?.username || 'QORVEXA member'
                                        return (
                                          <div className="member-comment member-comment--reply" key={reply.id}>
                                            <CornerDownRight size={14} aria-hidden="true" />
                                            {replyAuthor?.username
                                              ? <Link to={`/profile/${encodeURIComponent(replyAuthor.username)}`} className="member-comment-avatar" aria-label={`View ${replyName}'s profile`}>
                                                {replyAuthor?.avatar_url ? <ProtectedMediaImage path={replyAuthor.avatar_url} alt="" fallback={getInitials(replyName)} /> : getInitials(replyName)}
                                              </Link>
                                              : <div className="member-comment-avatar" aria-hidden="true">{getInitials(replyName)}</div>}
                                            <div className="member-comment-body">
                                              <div className="member-comment-meta">
                                                {replyAuthor?.username ? <Link to={`/profile/${encodeURIComponent(replyAuthor.username)}`}><strong>{replyName}</strong></Link> : <strong>{replyName}</strong>}
                                                {replyAuthor?.username && <Link to={`/profile/${encodeURIComponent(replyAuthor.username)}`}>@{replyAuthor.username}</Link>}
                                                <time dateTime={reply.created_at}>{formatPostDate(reply.created_at)}</time>
                                              </div>
                                              <p><LinkedText text={reply.content} /></p>
                                              {reply.author_id === user.id && (
                                                <div className="member-comment-actions">
                                                  <button type="button" onClick={() => handleDeleteComment(reply)} disabled={deletingComment === reply.id}>
                                                    <Trash2 size={12} aria-hidden="true" /> {deletingComment === reply.id ? 'Deleting...' : 'Delete'}
                                                  </button>
                                                </div>
                                              )}
                                              {reply.author_id !== user.id && <div className="member-comment-actions"><button type="button" onClick={() => setReportTarget({ reportedUserId: reply.author_id, type: 'comment', id: reply.id })}><Flag size={12} aria-hidden="true" /> Report</button></div>}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                })}
                              <form className="member-inline-comment-form" onSubmit={(event) => handleCommentSubmit(event, post.id)}>
                                <SmartTextInput
                                  aria-label="Write a comment"
                                  maxLength={1000}
                                  onChange={(nextValue) => setCommentDrafts((current) => ({ ...current, [post.id]: nextValue }))}
                                  placeholder="Write a comment..."
                                  value={commentDrafts[post.id] || ''}
                                />
                                <EmojiPicker onSelect={(emoji) => setCommentDrafts((current) => ({ ...current, [post.id]: `${current[post.id] || ''}${emoji}` }))} />
                                <button type="submit" disabled={!commentDrafts[post.id]?.trim() || Boolean(submittingComment)}>
                                  {submittingComment === `${post.id}:root` ? 'Sending...' : 'Comment'}
                                </button>
                              </form>
                              {(commentsByPost[post.id] || []).length === 0 && (
                                <p className="member-comments-empty">No comments yet. Start the conversation.</p>
                              )}
                            </>
                          )}
                        </section>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="member-feed-footer">
        <span>QORVEXA <span>·</span> Connect Beyond Limits.</span>
        <span>Posts are visible to signed-in members.</span>
      </footer>
      {reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />}
      <ProfilePhotoCropModal
        isOpen={cropModalOpen}
        initialFile={selectedCropFile}
        userId={user?.id}
        currentAvatarUrl={memberProfile?.avatar_url}
        onClose={() => {
          setCropModalOpen(false)
          setSelectedCropFile(null)
        }}
        onSuccess={(newPath, newPost) => {
          setMemberProfile((current) => current ? { ...current, avatar_url: newPath } : current)
          setPosts((currentPosts) => {
            const updated = currentPosts.map((post) => {
              if (post.author_id === user?.id) {
                return {
                  ...post,
                  profiles: { ...post.profiles, avatar_url: newPath },
                }
              }
              return post
            })
            if (newPost) {
              return [newPost, ...updated]
            }
            return updated
          })
          setNotificationToast('Profile picture updated and posted to timeline.')
        }}
      />
    </main>
  )
}

export default MemberPage
