import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Hash, LoaderCircle } from 'lucide-react'
import BrandMark from '../components/BrandMark.jsx'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import LinkedText from '../components/social/LinkedText.jsx'
import { getSupabaseClient } from '../lib/supabase.js'

const postSelection = 'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'

function formatPostDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function HashtagPage() {
  const { tag: routeTag = '' } = useParams()
  const tag = decodeURIComponent(routeTag).replace(/^#/, '')
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadHashtagPosts() {
      setStatus('loading')
      setError('')
      setPosts([])

      if (!/^[\p{L}\p{N}_]+$/u.test(tag)) {
        setError('This hashtag is not valid.')
        setStatus('error')
        return
      }

      try {
        const { data, error: queryError } = await getSupabaseClient()
          .from('posts')
          .select(postSelection)
          .ilike('content', `%#${tag}%`)
          .order('created_at', { ascending: false })
          .limit(100)

        if (queryError) throw queryError

        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const hashtagPattern = new RegExp(`(^|[\\s([{])#${escapedTag}(?=$|[^\\p{L}\\p{N}_])`, 'iu')
        const matchingPosts = (data || []).filter((post) => hashtagPattern.test(post.content || ''))

        if (active) {
          setPosts(matchingPosts)
          setStatus('ready')
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'The hashtag feed could not be loaded.')
          setStatus('error')
        }
      }
    }

    loadHashtagPosts()

    return () => {
      active = false
    }
  }, [tag])

  return (
    <main className="member-page member-feed-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />

      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/" aria-label="QORVEXA home">
          <BrandMark />
        </Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link to="/" className="network-nav-link">
            <ArrowLeft size={15} aria-hidden="true" />
            Home
          </Link>
          <Link to="/login" className="network-nav-link">Sign in</Link>
        </nav>
      </header>

      <div className="member-feed-layout hashtag-feed-layout">
        <section className="member-feed" aria-label={`Posts tagged ${tag}`}>
          <div className="member-feed-heading">
            <div>
              <p className="eyebrow">EXPLORE THE COMMUNITY</p>
              <h2><Hash size={24} aria-hidden="true" />{tag}</h2>
              <p>Posts shared with this hashtag.</p>
            </div>
            <span className="member-feed-live"><i /> HASHTAG</span>
          </div>

          {status === 'loading' && (
            <div className="member-feed-state" role="status">
              <LoaderCircle size={20} className="spinner" aria-hidden="true" />
              Loading hashtag posts...
            </div>
          )}

          {status === 'error' && (
            <div className="member-feed-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {status === 'ready' && posts.length === 0 && (
            <div className="member-feed-empty">
              <span><Hash size={20} aria-hidden="true" /></span>
              <h3>No posts found</h3>
              <p>There are no visible posts using #{tag} yet.</p>
              <Link to="/login" className="member-home-link">Join the conversation</Link>
            </div>
          )}

          {status === 'ready' && posts.length > 0 && (
            <div className="member-post-list">
              {posts.map((post) => {
                const author = post.profiles
                const authorName = author?.display_name || author?.username || 'QORVEXA member'
                const authorProfile = author?.username
                  ? `/profile/${encodeURIComponent(author.username)}`
                  : ''

                return (
                  <article className="member-post" key={post.id}>
                    {authorProfile ? (
                      <Link to={authorProfile} className="member-post-avatar" aria-label={`View ${authorName}'s profile`}>
                        {author?.avatar_url
                          ? <ProtectedMediaImage path={author.avatar_url} alt="" fallback={getInitials(authorName)} />
                          : getInitials(authorName)}
                      </Link>
                    ) : (
                      <div className="member-post-avatar" aria-hidden="true">{getInitials(authorName)}</div>
                    )}

                    <div className="member-post-body">
                      <div className="member-post-meta">
                        <div>
                          {authorProfile
                            ? <Link to={authorProfile}><strong>{authorName}</strong></Link>
                            : <strong>{authorName}</strong>}
                          {author?.username && (
                            <Link to={authorProfile} className="member-post-username">@{author.username}</Link>
                          )}
                        </div>
                        <Link
                          className="member-post-permalink"
                          to={authorProfile ? `${authorProfile}?post=${post.id}` : '/login'}
                        >
                          {formatPostDate(post.created_at)}
                        </Link>
                      </div>

                      {post.content && (
                        <p className="member-post-content">
                          <LinkedText text={post.content} />
                        </p>
                      )}

                      {post.media_path && (
                        <Link
                          to={authorProfile ? `${authorProfile}?post=${post.id}` : '/login'}
                          className="member-post-media-link"
                        >
                          <ProtectedMediaImage
                            className="member-post-media"
                            path={post.media_path}
                            alt="Image attached to post"
                            loading="lazy"
                          />
                        </Link>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default HashtagPage
