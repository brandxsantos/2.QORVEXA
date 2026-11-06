import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Clock3,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Rss,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'

const postSelection = 'id, author_id, content, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'

function isPostsSetupError(error) {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || error.message?.includes('public.posts')
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

function MemberPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [draft, setDraft] = useState('')
  const [feedStatus, setFeedStatus] = useState('loading')
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const name = user.user_metadata?.display_name || user.user_metadata?.username || 'QORVEXA member'
  const username = user.user_metadata?.username

  const loadPosts = useCallback(async () => {
    const { data, error: queryError } = await getSupabaseClient()
      .from('posts')
      .select(postSelection)
      .order('created_at', { ascending: false })
      .limit(50)

    if (queryError) throw queryError
    return data
  }, [])

  useEffect(() => {
    let active = true

    loadPosts()
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

    return () => {
      active = false
    }
  }, [loadPosts])

  async function handlePublish(event) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || publishing) return

    setError('')
    setPublishing(true)

    try {
      const { data, error: insertError } = await getSupabaseClient()
        .from('posts')
        .insert({ author_id: user.id, content })
        .select(postSelection)
        .single()

      if (insertError) throw insertError
      setPosts((currentPosts) => [data, ...currentPosts])
      setDraft('')
    } catch (publishError) {
      setError(publishError.message || 'Your post could not be published.')
      if (isPostsSetupError(publishError)) setFeedStatus('setup')
    } finally {
      setPublishing(false)
    }
  }

  async function handleRefresh() {
    setError('')
    setFeedStatus('loading')

    try {
      setPosts(await loadPosts())
      setFeedStatus('ready')
    } catch (loadError) {
      setError(loadError.message || 'The feed could not be refreshed.')
      setFeedStatus(isPostsSetupError(loadError) ? 'setup' : 'error')
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

  return (
    <main className="member-page member-feed-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/" aria-label="QORVEXA home"><BrandMark /></Link>
        <div className="member-header-center"><Rss size={16} aria-hidden="true" /><span>COMMUNITY FEED</span></div>
        <button className="button button--outline member-signout" type="button" onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={15} aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <div className="member-feed-layout">
        <aside className="member-profile-card">
          <div className="member-profile-cover" aria-hidden="true" />
          <div className="member-profile-details">
            <div className="member-avatar" aria-hidden="true">{getInitials(name)}</div>
            <h1>{name}</h1>
            {username && <p className="member-username">@{username}</p>}
            <p className="member-profile-email">{user.email}</p>
            <div className="member-profile-divider" />
            <div className="member-profile-status"><ShieldCheck size={16} aria-hidden="true" /><span>Signed in securely</span></div>
            <Link to="/" className="member-home-link">Back to QORVEXA home</Link>
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

          <form className="member-composer" onSubmit={handlePublish}>
            <label className="member-composer-label" htmlFor="post-content">What’s on your mind?</label>
            <textarea
              id="post-content"
              maxLength={1000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Share an idea, a moment, or something you’re working on…"
              rows={4}
              value={draft}
            />
            <div className="member-composer-footer">
              <span>{draft.length}/1000</span>
              <button className="member-publish-button" type="submit" disabled={!draft.trim() || publishing}>
                {publishing ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
                {publishing ? 'Publishing…' : 'Publish post'}
              </button>
            </div>
          </form>

          {error && (
            <div className="member-feed-error" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>{feedStatus === 'setup' ? 'Feed setup required' : 'Something went wrong'}</strong>
                <span>{feedStatus === 'setup'
                  ? 'Apply the posts migration in Supabase SQL Editor, then refresh this page.'
                  : error}</span>
                {feedStatus === 'setup'
                  ? <code>supabase/migrations/20261107010000_posts_feed.sql</code>
                  : <button type="button" onClick={handleRefresh}>Try again</button>}
              </div>
            </div>
          )}

          {feedStatus === 'loading' ? (
            <div className="member-feed-state" role="status"><LoaderCircle size={20} className="spinner" aria-hidden="true" /> Loading community posts…</div>
          ) : feedStatus === 'ready' && posts.length === 0 ? (
            <div className="member-feed-empty">
              <span><Users size={20} aria-hidden="true" /></span>
              <h3>Your community starts here</h3>
              <p>No posts yet. Share the first update and welcome everyone in.</p>
            </div>
          ) : (
            <div className="member-post-list">
              {posts.map((post) => {
                const author = post.profiles
                const authorName = author?.display_name || author?.username || 'QORVEXA member'
                return (
                  <article className="member-post" key={post.id}>
                    <div className="member-post-avatar" aria-hidden="true">{getInitials(authorName)}</div>
                    <div className="member-post-body">
                      <div className="member-post-meta">
                        <div><strong>{authorName}</strong>{author?.username && <span>@{author.username}</span>}</div>
                        <time dateTime={post.created_at}><Clock3 size={13} aria-hidden="true" />{formatPostDate(post.created_at)}</time>
                      </div>
                      <p className="member-post-content">{post.content}</p>
                      <div className="member-post-footer"><MessageCircle size={14} aria-hidden="true" /><span>Comments aren’t available yet</span></div>
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
    </main>
  )
}

export default MemberPage
