import { useEffect, useState } from 'react'
import { AlertCircle, LoaderCircle, Save, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'
import BrandMark from '../components/BrandMark.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'

const usernamePattern = /^[a-z0-9_]{3,24}$/
const maxAvatarBytes = 8 * 1024 * 1024
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function ProfileSettingsPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [status, setStatus] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const { data, error: queryError } = await getSupabaseClient()
          .from('profiles')
          .select('id, username, display_name, bio, avatar_url')
          .eq('id', user.id)
          .single()
        if (queryError) throw queryError
        if (!active) return
        setProfile(data)
        setUsername(data.username || '')
        setDisplayName(data.display_name || '')
        setBio(data.bio || '')
        setStatus('ready')
      } catch (loadError) {
        if (!active) return
        setError(loadError.message || 'Your profile could not be loaded.')
        setStatus('error')
      }
    }
    loadProfile()
    return () => { active = false }
  }, [user.id])

  async function handleSave(event) {
    event.preventDefault()
    const cleanName = displayName.trim()
    const cleanUsername = username.trim().toLowerCase()
    const cleanBio = bio.trim()
    setError('')
    setNotice('')
    if (cleanName.length < 2 || cleanName.length > 60) {
      setError('Display name must be between 2 and 60 characters.')
      return
    }
    if (!usernamePattern.test(cleanUsername)) {
      setError('Username must be 3–24 lowercase letters, numbers, or underscores.')
      return
    }
    if (cleanBio.length > 280) {
      setError('Bio must be 280 characters or fewer.')
      return
    }
    if (avatarFile && (!imageTypes.includes(avatarFile.type) || avatarFile.size > maxAvatarBytes)) {
      setError('Choose a JPG, PNG, WebP, or GIF image under 8 MB.')
      return
    }

    setSaving(true)
    let uploadedPath = ''
    try {
      const client = getSupabaseClient()
      let avatarUrl = profile.avatar_url
      if (avatarFile) {
        const extension = avatarFile.name.split('.').pop()?.toLowerCase() || 'image'
        uploadedPath = `${user.id}/avatars/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await client.storage
          .from('qorvexa-media')
          .upload(uploadedPath, avatarFile, { contentType: avatarFile.type, upsert: false })
        if (uploadError) throw uploadError
        avatarUrl = client.storage.from('qorvexa-media').getPublicUrl(uploadedPath).data.publicUrl
      }
      const { data, error: updateError } = await client
        .from('profiles')
        .update({
          username: cleanUsername,
          display_name: cleanName,
          bio: cleanBio,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id)
        .select('id, username, display_name, bio, avatar_url')
        .single()
      if (updateError) throw updateError
      setProfile(data)
      setUsername(data.username)
      setDisplayName(data.display_name)
      setBio(data.bio)
      setAvatarFile(null)
      setAvatarPreview('')
      setNotice('Your profile was updated.')
    } catch (saveError) {
      let message = saveError.code === '23505'
        ? 'That username is already taken.'
        : saveError.message || 'Your profile could not be saved.'
      if (uploadedPath) {
        const { error: cleanupError } = await getSupabaseClient().storage
          .from('qorvexa-media')
          .remove([uploadedPath])
        if (cleanupError) message += ' The uploaded avatar could not be cleaned up.'
      }
      setError(message)
    } finally {
      setSaving(false)
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
          <Link className="network-nav-link" to="/app/bookmarks">Bookmarks</Link>
          <Link className="network-nav-link" to="/app/privacy">Privacy</Link>
          <Link className="network-nav-link is-active" to="/app/profile">Profile</Link>
        </nav>
      </header>
      <AccountRestrictionNotice userId={user.id} />
      <section className="settings-card" aria-labelledby="profile-settings-heading">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1 id="profile-settings-heading">Edit your profile</h1>
        <p className="settings-intro">Choose how you appear to other QORVEXA members.</p>
        {status === 'loading' ? <div className="member-feed-state" role="status"><LoaderCircle className="spinner" size={19} />Loading profile…</div> : null}
        {error && <div className="settings-message settings-message--error" role="alert"><AlertCircle size={16} />{error}</div>}
        {notice && <p className="settings-message settings-message--success" role="status">{notice}</p>}
        {status === 'ready' && (
          <form className="settings-form" onSubmit={handleSave}>
            <label className="settings-avatar-field">
              <span className="settings-avatar-preview">
                {avatarFile
                  ? <img src={avatarPreview} alt="Selected avatar preview" />
                  : profile.avatar_url
                    ? <img src={profile.avatar_url} alt="Current profile avatar" />
                    : <UserRound size={25} aria-hidden="true" />}
              </span>
              <span><strong>Profile picture</strong><small>JPG, PNG, WebP, or GIF · up to 8 MB</small></span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  setError('')
                  const file = event.target.files?.[0] || null
                  setAvatarFile(file)
                  setAvatarPreview(file ? URL.createObjectURL(file) : '')
                }}
              />
            </label>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={60} required /></label>
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" required /><small>3–24 lowercase letters, numbers, or underscores.</small></label>
            <label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={280} rows={4} placeholder="A little about you…" /><small>{bio.length}/280</small></label>
            <button className="member-publish-button" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        )}
      </section>
      <footer className="member-feed-footer"><span>Signed in as {user.email}</span></footer>
    </main>
  )
}

export default ProfileSettingsPage
