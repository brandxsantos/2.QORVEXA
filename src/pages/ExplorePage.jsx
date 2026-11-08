import { useEffect, useState } from 'react'
import {
  Compass,
  Rss,
  Bell,
  MessageCircle,
  Search,
  TrendingUp,
  Users,
  UserPlus,
  UserRound,
  Hash,
  Heart,
  Clock3,
  LoaderCircle,
  ArrowUpRight,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import AccountMenu from '../components/AccountMenu.jsx'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import LinkedText from '../components/social/LinkedText.jsx'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'

const postSelection = 'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'
const profileFields = 'id, username, display_name, bio, avatar_url, created_at'

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function profileName(profile) {
  return profile?.display_name || profile?.username || 'QORVEXA member'
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function extractHashtags(posts) {
  const counts = new Map()

  posts.forEach((post) => {
    const tagsInPost = new Set(
      [...(post.content || '').matchAll(/(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]{1,50})/g)]
        .map((match) => match[2].toLowerCase()),
    )

    tagsInPost.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1))
  })

  return [...counts.entries()]
    .map(([tag, postCount]) => ({ tag, postCount }))
    .sort((a, b) => b.postCount - a.postCount || a.tag.localeCompare(b.tag))
    .slice(0, 10)
}

function ExplorePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [popularPosts, setPopularPosts] = useState([])
  const [trendingTags, setTrendingTags] = useState([])
  const [newMembers, setNewMembers] = useState([])
  const [ownUsername, setOwnUsername] = useState(user.user_metadata?.username || '')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadExplore() {
      setLoading(true)
      setError('')

      try {
        const client = getSupabaseClient()
        const [postsResult, membersResult, ownProfileResult] = await Promise.all([
          client.from('posts')
            .select(postSelection)
            .eq('post_visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(200),
          client.from('profiles')
            .select(profileFields)
            .neq('id', user.id)
            .order('created_at', { ascending: false })
            .limit(6),
          client.from('profiles')
            .select('username')
            .eq('id', user.id)
            .maybeSingle(),
        ])

        if (postsResult.error) throw postsResult.error
        if (membersResult.error) throw membersResult.error

        const postRows = postsResult.data || []
        const postIds = postRows.map((post) => post.id)
        let counts = {}

        if (postIds.length) {
          const { data, error: likesError } = await client.rpc(
            'get_visible_post_like_counts',
            { target_post_ids: postIds },
          )

          if (likesError) throw likesError

          counts = Object.fromEntries(
            (data || []).map((item) => [item.post_id, Number(item.like_count) || 0]),
          )
        }

        if (!active) return

        setOwnUsername(ownProfileResult.data?.username || '')
        setPosts(postRows)
        setTrendingTags(extractHashtags(postRows))
        setPopularPosts(
          [...postRows]
            .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)
              || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 8)
            .map((post) => ({ ...post, likeCount: counts[post.id] || 0 })),
        )
        setNewMembers(membersResult.data || [])
      } catch (loadError) {
        if (active) setError(loadError.message || 'Explore could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadExplore()
    return () => { active = false }
  }, [user.id])

  async function handleSearch(event) {
    event.preventDefault()
    const term = searchTerm.trim().replace(/^#/, '').replace(/[%_]/g, '')
    if (!term) {
      setSearchResults(null)
      return
    }

    setSearching(true)
    setError('')

    try {
      const client = getSupabaseClient()
      const pattern = `%${term}%`

      const [usernameResult, displayNameResult, postsResult] = await Promise.all([
        client.from('profiles')
          .select(profileFields)
          .ilike('username', pattern)
          .neq('id', user.id)
          .limit(8),
        client.from('profiles')
          .select(profileFields)
          .ilike('display_name', pattern)
          .neq('id', user.id)
          .limit(8),
        client.from('posts')
          .select(postSelection)
          .eq('post_visibility', 'public')
          .ilike('content', pattern)
          .order('created_at', { ascending: false })
          .limit(12),
      ])

      if (usernameResult.error) throw usernameResult.error
      if (displayNameResult.error) throw displayNameResult.error
      if (postsResult.error) throw postsResult.error

      const peopleMap = new Map()
      ;[...(usernameResult.data || []), ...(displayNameResult.data || [])]
        .forEach((profile) => peopleMap.set(profile.id, profile))

      const matchingPosts = postsResult.data || []
      const tagMap = new Map()

      matchingPosts.forEach((post) => {
        const matches = [...(post.content || '').matchAll(/(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]{1,50})/g)]
        matches.forEach((match) => {
          const tag = match[2].toLowerCase()
          if (tag.includes(term.toLowerCase())) {
            tagMap.set(tag, (tagMap.get(tag) || 0) + 1)
          }
        })
      })

      const topics = [...tagMap.entries()]
        .map(([tag, postCount]) => ({ tag, postCount }))
        .sort((a, b) => b.postCount - a.postCount)

      setSearchResults({
        people: [...peopleMap.values()].slice(0, 8),
        posts: matchingPosts,
        topics,
      })
    } catch (searchError) {
      setError(searchError.message || 'Search could not be completed.')
    } finally {
      setSearching(false)
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

  function renderPost(post) {
    const author = post.profiles
    const authorName = profileName(author)
    const profileUrl = author?.username
      ? `/profile/${encodeURIComponent(author.username)}`
      : ''

    return (
      <article className="explore-post" key={post.id}>
        <div className="explore-post-header">
          {profileUrl ? (
            <Link to={profileUrl} className="explore-avatar" aria-label={`View ${authorName}'s profile`}>
              {author?.avatar_url
                ? <ProtectedMediaImage path={author.avatar_url} alt="" fallback={initials(authorName)} />
                : initials(authorName)}
            </Link>
          ) : (
            <span className="explore-avatar">{initials(authorName)}</span>
          )}
          <div className="explore-post-author">
            {profileUrl ? <Link to={profileUrl}><strong>{authorName}</strong></Link> : <strong>{authorName}</strong>}
            {author?.username && <span>@{author.username}</span>}
          </div>
          <time dateTime={post.created_at}><Clock3 size={13} />{formatDate(post.created_at)}</time>
        </div>
        {post.content && <p className="explore-post-content"><LinkedText text={post.content} /></p>}
        {post.media_path && (
          <Link
            to={profileUrl ? `${profileUrl}?post=${post.id}` : '/app'}
            className="explore-post-media-link"
          >
            <ProtectedMediaImage
              className="explore-post-media"
              path={post.media_path}
              alt="Image attached to post"
              loading="lazy"
            />
          </Link>
        )}
        <div className="explore-post-footer">
          <span><Heart size={14} />{post.likeCount || 0} reactions</span>
          {profileUrl && <Link to={`${profileUrl}?post=${post.id}`}>View post <ArrowUpRight size={13} /></Link>}
        </div>
      </article>
    )
  }

  return (
    <main className="member-page member-feed-page explore-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />

      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/app" aria-label="QORVEXA feed"><BrandMark /></Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link to="/app" className="network-nav-link"><Rss size={15} aria-hidden="true" />Feed</Link>
          <Link to="/app/explore" className="network-nav-link is-active"><Compass size={15} />Explore</Link>
          <Link to="/app/discover" className="network-nav-link"><UserPlus size={15} aria-hidden="true" />Discover</Link>
          <Link to="/app/friends" className="network-nav-link"><Users size={15} />Friends</Link>
          <Link to="/app/notifications" className="network-nav-link"><Bell size={15} aria-hidden="true" />Notifications</Link>
          <Link to="/app/messages" className="network-nav-link"><MessageCircle size={15} aria-hidden="true" />Messages</Link>
          {ownUsername && <Link to={`/profile/${encodeURIComponent(ownUsername)}`} className="network-nav-link"><UserRound size={15} aria-hidden="true" />My profile</Link>}
          <AccountMenu onSignOut={handleSignOut} signingOut={signingOut} />
        </nav>
      </header>

      <section className="network-content explore-content">
        <div className="network-heading explore-heading">
          <div>
            <p className="eyebrow">YOUR COMMUNITY</p>
            <h1>Explore QORVEXA</h1>
            <p>Find conversations, trending topics, and new people.</p>
          </div>
        </div>

        <form className="explore-search" onSubmit={handleSearch}>
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search people, posts, or topics..."
            aria-label="Search people, posts, or topics"
          />
          <button type="submit" disabled={searching || !searchTerm.trim()}>
            {searching ? <LoaderCircle size={16} className="spinner" /> : 'Search'}
          </button>
        </form>

        {error && <p className="explore-error" role="alert">{error}</p>}

        {searchResults ? (
          <div className="explore-results">
            <div className="explore-section-heading">
              <div><p className="eyebrow">SEARCH RESULTS</p><h2>Results for Ã¢â‚¬Å“{searchTerm.trim()}Ã¢â‚¬Â</h2></div>
              <button type="button" onClick={() => setSearchResults(null)}>Clear results</button>
            </div>

            <section className="explore-section">
              <h3><Users size={17} />People</h3>
              {searchResults.people.length ? (
                <div className="explore-member-grid">
                  {searchResults.people.map((profile) => (
                    <Link className="explore-member-card" to={profile.username ? `/profile/${encodeURIComponent(profile.username)}` : '/app/discover'} key={profile.id}>
                      <span className="explore-avatar">
                        {profile.avatar_url
                          ? <ProtectedMediaImage path={profile.avatar_url} alt="" fallback={initials(profileName(profile))} />
                          : initials(profileName(profile))}
                      </span>
                      <strong>{profileName(profile)}</strong>
                      {profile.username && <small>@{profile.username}</small>}
                      {profile.bio && <p>{profile.bio}</p>}
                    </Link>
                  ))}
                </div>
              ) : <p className="explore-empty">No matching people found.</p>}
            </section>

            <section className="explore-section">
              <h3><Hash size={17} />Topics</h3>
              {searchResults.topics.length ? (
                <div className="explore-tag-list">
                  {searchResults.topics.map((topic) => (
                    <Link to={`/hashtag/${encodeURIComponent(topic.tag)}`} className="explore-tag" key={topic.tag}>
                      <strong>#{topic.tag}</strong><span>{topic.postCount} matching posts</span>
                    </Link>
                  ))}
                </div>
              ) : <p className="explore-empty">No matching topics found in these posts.</p>}
            </section>

            <section className="explore-section">
              <h3><Search size={17} />Posts</h3>
              {searchResults.posts.length
                ? searchResults.posts.map((post) => renderPost(post))
                : <p className="explore-empty">No matching public posts found.</p>}
            </section>
          </div>
        ) : (
          <>
            <div className="explore-grid">
              <section className="explore-panel explore-trending">
                <div className="explore-section-heading">
                  <div><p className="eyebrow">WHAT'S POPULAR</p><h2><TrendingUp size={19} />Trending hashtags</h2></div>
                </div>
                {loading ? <p className="explore-empty">Loading trending topics...</p> : trendingTags.length ? (
                  <div className="explore-tag-list">
                    {trendingTags.slice(0, 8).map((topic, index) => (
                      <Link to={`/hashtag/${encodeURIComponent(topic.tag)}`} className="explore-tag" key={topic.tag}>
                        <span className="explore-tag-rank">{index + 1}</span>
                        <strong>#{topic.tag}</strong>
                        <span>{topic.postCount} {topic.postCount === 1 ? 'post' : 'posts'}</span>
                      </Link>
                    ))}
                  </div>
                ) : <p className="explore-empty">Hashtags will appear here as public posts are shared.</p>}
              </section>

              <section className="explore-panel explore-members">
                <div className="explore-section-heading">
                  <div><p className="eyebrow">MEET THE COMMUNITY</p><h2><Users size={19} />New members</h2></div>
                  <Link to="/app/discover">Discover all <ArrowUpRight size={13} /></Link>
                </div>
                {loading ? <p className="explore-empty">Loading members...</p> : newMembers.length ? (
                  <div className="explore-member-list">
                    {newMembers.map((profile) => (
                      <Link to={profile.username ? `/profile/${encodeURIComponent(profile.username)}` : '/app/discover'} className="explore-member-row" key={profile.id}>
                        <span className="explore-avatar">
                          {profile.avatar_url
                            ? <ProtectedMediaImage path={profile.avatar_url} alt="" fallback={initials(profileName(profile))} />
                            : initials(profileName(profile))}
                        </span>
                        <span><strong>{profileName(profile)}</strong>{profile.username && <small>@{profile.username}</small>}</span>
                        <ArrowUpRight size={14} />
                      </Link>
                    ))}
                  </div>
                ) : <p className="explore-empty">New members will appear here.</p>}
              </section>
            </div>

            <section className="explore-section explore-popular">
              <div className="explore-section-heading">
                <div><p className="eyebrow">COMMUNITY HIGHLIGHTS</p><h2><Heart size={19} />Popular public posts</h2></div>
              </div>
              {loading ? <p className="explore-empty">Loading public posts...</p> : popularPosts.length
                ? popularPosts.map((post) => renderPost(post))
                : <p className="explore-empty">Public posts will appear here as the community grows.</p>}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

export default ExplorePage



