import { useCallback, useEffect, useState } from 'react'
import { Bookmark, Clock3, LoaderCircle, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import BrandMark from '../components/BrandMark.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'

function postDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function BookmarksPage() {
  const { user } = useAuth()
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')

  const loadBookmarks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: resultError } = await getSupabaseClient()
        .from('post_bookmarks')
        .select('post_id, created_at, posts!inner(id, author_id, content, created_at, media_path, media_type, profiles!posts_author_id_fkey(username, display_name, avatar_url))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (resultError) throw resultError
      setBookmarks(data || [])
    } catch (loadError) {
      setError(loadError.message || 'Your bookmarks could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadBookmarks() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadBookmarks])

  async function removeBookmark(postId) {
    setWorkingId(postId)
    setError('')
    try {
      const { error: deleteError } = await getSupabaseClient()
        .from('post_bookmarks')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id)
      if (deleteError) throw deleteError
      setBookmarks((current) => current.filter((bookmark) => bookmark.post_id !== postId))
    } catch (deleteError) {
      setError(deleteError.message || 'The bookmark could not be removed.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <main className="member-page member-feed-page settings-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/app" aria-label="QORVEXA feed"><BrandMark /></Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link className="network-nav-link" to="/app">Feed</Link>
          <Link className="network-nav-link is-active" to="/app/bookmarks"><Bookmark size={15} />Bookmarks</Link>
          <Link className="network-nav-link" to="/app/privacy">Privacy</Link>
          <Link className="network-nav-link" to="/app/profile">Profile</Link>
        </nav>
      </header>
      <AccountRestrictionNotice userId={user.id} />
      <section className="settings-card bookmark-page" aria-labelledby="bookmarks-heading">
        <p className="eyebrow">YOUR COMMUNITY</p>
        <h1 id="bookmarks-heading">Saved posts</h1>
        <p className="settings-intro">Posts you bookmark are private to your account.</p>
        {error && <p className="settings-message settings-message--error" role="alert">{error}<button type="button" onClick={loadBookmarks}>Try again</button></p>}
        {loading ? <div className="member-feed-state" role="status"><LoaderCircle className="spinner" size={19} />Loading bookmarks…</div>
          : bookmarks.length === 0
            ? <div className="member-feed-empty"><span><Bookmark size={20} /></span><h2>No saved posts yet</h2><p>Use the bookmark button on a post to keep it here.</p><Link className="member-home-link" to="/app">Browse the feed</Link></div>
            : <div className="bookmark-list">{bookmarks.map(({ post_id: postId, posts: post }) => {
              const author = post.profiles
              const authorName = author?.display_name || author?.username || 'QORVEXA member'
              const profilePath = author?.username ? `/profile/${encodeURIComponent(author.username)}` : '/app'
              return (
                <article className="member-post bookmark-post" key={postId}>
                  <Link className="member-post-avatar" to={profilePath} aria-label={`View ${authorName}'s profile`}>
                    {author?.avatar_url ? <ProtectedMediaImage path={author.avatar_url} alt="" /> : authorName.slice(0, 1).toUpperCase()}
                  </Link>
                  <div className="member-post-body">
                    <div className="member-post-meta">
                      <div><Link to={profilePath}><strong>{authorName}</strong></Link>{author?.username && <Link className="member-post-username" to={profilePath}>@{author.username}</Link>}</div>
                      <time dateTime={post.created_at}><Clock3 size={13} />{postDate(post.created_at)}</time>
                    </div>
                    {post.content && <p className="member-post-content">{post.content}</p>}
                    {post.media_path && <ProtectedMediaImage className="member-post-media" path={post.media_path} alt="Image attached to saved post" loading="lazy" />}
                    <div className="member-post-footer">
                      <Link className="member-comments-toggle" to="/app"><Bookmark size={14} />Saved post</Link>
                      <button className="member-comments-toggle" type="button" disabled={workingId === postId} onClick={() => removeBookmark(postId)}>
                        {workingId === postId ? <LoaderCircle size={14} className="spinner" /> : <Trash2 size={14} />}
                        {workingId === postId ? 'Removing…' : 'Remove bookmark'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}</div>}
      </section>
      <footer className="member-feed-footer"><span>Signed in as {user.email}</span></footer>
    </main>
  )
}

export default BookmarksPage
