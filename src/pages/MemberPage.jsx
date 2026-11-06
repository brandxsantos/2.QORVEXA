import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Bell,
  Clock3,
  CornerDownRight,
  Flag,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Rss,
  ShieldCheck,
  Trash2,
  Users,
  UserPlus,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'
import ReportDialog from '../components/ReportDialog.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'

const postSelection = 'id, author_id, content, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'

function isPostsSetupError(error) {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || error.message?.includes('public.posts')
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

function MemberPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [draft, setDraft] = useState('')
  const [commentsByPost, setCommentsByPost] = useState({})
  const [commentsOpen, setCommentsOpen] = useState({})
  const [commentsStatus, setCommentsStatus] = useState({})
  const [commentDrafts, setCommentDrafts] = useState({})
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyTarget, setReplyTarget] = useState(null)
  const [feedStatus, setFeedStatus] = useState('loading')
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(null)
  const [deletingComment, setDeletingComment] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
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

  const loadComments = useCallback(async (postId) => {
    setCommentsStatus((current) => ({ ...current, [postId]: 'loading' }))

    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('comments')
        .select('id, post_id, author_id, parent_id, content, created_at, profiles!comments_author_id_fkey(username, display_name)')
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
        <nav className="network-nav" aria-label="Community navigation">
          <span className="network-nav-link is-active"><Rss size={15} aria-hidden="true" />Feed</span>
          <Link to="/app/discover" className="network-nav-link"><UserPlus size={15} aria-hidden="true" />Discover</Link>
          <Link to="/app/friends" className="network-nav-link"><Users size={15} aria-hidden="true" />Friends</Link>
          <Link to="/app/notifications" className="network-nav-link"><Bell size={15} aria-hidden="true" />Notifications</Link>
          <Link to="/app/messages" className="network-nav-link"><MessageCircle size={15} aria-hidden="true" />Messages</Link>
        </nav>
        <button className="button button--outline member-signout" type="button" onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={15} aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <AccountRestrictionNotice userId={user.id} />
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
                      <div className="member-post-footer">
                        <button className="member-comments-toggle" type="button" onClick={() => toggleComments(post.id)} aria-expanded={Boolean(commentsOpen[post.id])}>
                          <MessageCircle size={14} aria-hidden="true" />
                          <span>{commentsByPost[post.id] ? `${commentsByPost[post.id].length} comments` : 'View comments'}</span>
                        </button>
                        {post.author_id !== user.id && <button className="member-comments-toggle" type="button" onClick={() => setReportTarget({ reportedUserId: post.author_id, type: 'post', id: post.id })}><Flag size={13} aria-hidden="true" /><span>Report</span></button>}
                      </div>
                      {commentsOpen[post.id] && (
                        <section className="member-comments" aria-label="Comments">
                          {commentsStatus[post.id] === 'loading' ? (
                            <div className="member-comments-state" role="status"><LoaderCircle size={15} className="spinner" aria-hidden="true" /> Loading comments…</div>
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
                                        <div className="member-comment-avatar" aria-hidden="true">{getInitials(commentName)}</div>
                                        <div className="member-comment-body">
                                          <div className="member-comment-meta"><strong>{commentName}</strong>{commentAuthor?.username && <span>@{commentAuthor.username}</span>}<time dateTime={comment.created_at}>{formatPostDate(comment.created_at)}</time></div>
                                          <p>{comment.content}</p>
                                          <div className="member-comment-actions">
                                            <button type="button" onClick={() => setReplyTarget(replyTarget === comment.id ? null : comment.id)}>Reply</button>
                                            {comment.author_id !== user.id && <button type="button" onClick={() => setReportTarget({ reportedUserId: comment.author_id, type: 'comment', id: comment.id })}><Flag size={12} aria-hidden="true" /> Report</button>}
                                            {comment.author_id === user.id && (
                                              <button type="button" onClick={() => handleDeleteComment(comment)} disabled={deletingComment === comment.id}>
                                                <Trash2 size={12} aria-hidden="true" /> {deletingComment === comment.id ? 'Deleting…' : 'Delete'}
                                              </button>
                                            )}
                                          </div>
                                          {replyTarget === comment.id && (
                                            <form className="member-inline-comment-form" onSubmit={(event) => handleCommentSubmit(event, post.id, comment.id)}>
                                              <input
                                                aria-label={`Reply to ${commentName}`}
                                                maxLength={1000}
                                                onChange={(event) => setReplyDrafts((current) => ({ ...current, [comment.id]: event.target.value }))}
                                                placeholder={`Reply to ${commentName}…`}
                                                value={replyDrafts[comment.id] || ''}
                                              />
                                              <button type="submit" disabled={!replyDrafts[comment.id]?.trim() || Boolean(submittingComment)}>
                                                {submittingComment === `${post.id}:${comment.id}` ? 'Sending…' : 'Reply'}
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
                                            <div className="member-comment-avatar" aria-hidden="true">{getInitials(replyName)}</div>
                                            <div className="member-comment-body">
                                              <div className="member-comment-meta"><strong>{replyName}</strong>{replyAuthor?.username && <span>@{replyAuthor.username}</span>}<time dateTime={reply.created_at}>{formatPostDate(reply.created_at)}</time></div>
                                              <p>{reply.content}</p>
                                              {reply.author_id === user.id && (
                                                <div className="member-comment-actions">
                                                  <button type="button" onClick={() => handleDeleteComment(reply)} disabled={deletingComment === reply.id}>
                                                    <Trash2 size={12} aria-hidden="true" /> {deletingComment === reply.id ? 'Deleting…' : 'Delete'}
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
                                <input
                                  aria-label="Write a comment"
                                  maxLength={1000}
                                  onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                                  placeholder="Write a comment…"
                                  value={commentDrafts[post.id] || ''}
                                />
                                <button type="submit" disabled={!commentDrafts[post.id]?.trim() || Boolean(submittingComment)}>
                                  {submittingComment === `${post.id}:root` ? 'Sending…' : 'Comment'}
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
    </main>
  )
}

export default MemberPage
