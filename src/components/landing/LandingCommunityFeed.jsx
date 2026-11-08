import { useEffect, useState } from 'react'
import { Heart, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'

const postSelection =
  'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'

function getInitials(profile) {
  const name = profile?.display_name || profile?.username || '?'
  return name.slice(0, 1).toUpperCase()
}

function formatPostTime(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function LandingCommunityFeed() {
  const [posts, setPosts] = useState([])
  const [likeCounts, setLikeCounts] = useState({})
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true

    async function loadPublicPosts() {
      try {
        const client = getSupabaseClient()

        const { data, error } = await client
          .from('posts')
          .select(postSelection)
          .eq('post_visibility', 'public')
          .eq('is_hidden', false)
          .order('created_at', { ascending: false })
          .limit(3)

        if (error) throw error
        if (!active) return

        const visiblePosts = data || []
        setPosts(visiblePosts)

        if (visiblePosts.length) {
          const { data: counts, error: countError } = await client.rpc(
            'get_visible_post_like_counts',
            { target_post_ids: visiblePosts.map((post) => post.id) },
          )

          if (!countError && active) {
            const countMap = Object.fromEntries(
              (counts || []).map((item) => [item.post_id, Number(item.like_count)]),
            )
            setLikeCounts(countMap)
          }
        }

        if (active) setStatus('ready')
      } catch (error) {
        console.error('Landing community feed:', error)
        if (active) setStatus('error')
      }
    }

    loadPublicPosts()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="community-preview" aria-label="Recent public QORVEXA posts">
      <div className="preview-topbar">
        <div className="preview-window-dots" aria-hidden="true">
          <i /><i /><i />
        </div>
        <span>PUBLIC COMMUNITY</span>
        <span className="preview-live">
          <span className="label-dot" /> LIVE POSTS
        </span>
      </div>

      {status === 'loading' && (
        <div className="landing-feed-state" role="status">
          Loading community posts…
        </div>
      )}

      {status === 'error' && (
        <div className="landing-feed-state" role="status">
          Community posts are temporarily unavailable.
        </div>
      )}

      {status === 'ready' && posts.length === 0 && (
        <div className="landing-feed-state">
          <strong>The community starts with you.</strong>
          <span>Be among the first to share something on QORVEXA.</span>
          <Link to="/signup">Create your account <span aria-hidden="true">→</span></Link>
        </div>
      )}

      {status === 'ready' && posts.map((post) => {
        const profile = post.profiles
        const username = profile?.username
        const displayName = profile?.display_name || username || 'QORVEXA member'
        const hasImage = Boolean(
          post.media_path && post.media_type?.startsWith('image'),
        )

        return (
          <article className="preview-post landing-preview-post" key={post.id}>
            <div className="post-avatar landing-post-avatar">
              {profile?.avatar_url ? (
                <ProtectedMediaImage
                  path={profile.avatar_url}
                  alt={`${displayName}'s profile`}
                  className="landing-post-avatar-image"
                  loading="lazy"
                  fallback={getInitials(profile)}
                />
              ) : (
                getInitials(profile)
              )}
            </div>

            <div className="post-content">
              <div className="post-meta">
                {username ? (
                  <Link
                    className="landing-post-author"
                    to={`/profile/${encodeURIComponent(username)}`}
                  >
                    {displayName}
                  </Link>
                ) : (
                  <strong>{displayName}</strong>
                )}
                <span>· {formatPostTime(post.created_at)}</span>
              </div>

              {post.content && <p className="landing-post-text">{post.content}</p>}

              {hasImage && (
                <div className="landing-post-media">
                  <ProtectedMediaImage
                    path={post.media_path}
                    alt="Post attachment"
                    className="landing-post-media-image"
                    loading="lazy"
                  />
                </div>
              )}

              {post.media_path && !hasImage && (
                <span className="landing-post-attachment">Post attachment</span>
              )}

              <div className="post-actions">
                <span>
                  <Heart size={15} aria-hidden="true" />
                  {likeCounts[post.id] ?? 0}
                </span>
                <span>
                  <MessageCircle size={15} aria-hidden="true" />
                  Public post
                </span>
              </div>
            </div>
          </article>
        )
      })}

      <div className="preview-note">
        Public posts from the QORVEXA community
      </div>
    </div>
  )
}

export default LandingCommunityFeed
