import { useEffect, useState } from 'react'
import { AlertCircle, LoaderCircle, Save, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { useTheme } from '../context/ThemeContext.jsx'
import { getSupabaseClient } from '../lib/supabase.js'
import ProtectedMediaImage from '../components/ProtectedMediaImage.jsx'
import BrandMark from '../components/BrandMark.jsx'
import AccountRestrictionNotice from '../components/AccountRestrictionNotice.jsx'
import AccountMenu from '../components/AccountMenu.jsx'
import CustomSelect from '../components/CustomSelect.jsx'
import ProfilePhotoCropModal from '../components/ProfilePhotoCropModal.jsx'

const usernamePattern = /^[a-z0-9_]{3,24}$/
const maxAvatarBytes = 8 * 1024 * 1024
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const availabilityEvent = 'qorvexa:availability-change'

function ProfileSettingsPage() {
  const { user } = useAuth()
  const { themePreference, setThemePreference } = useTheme()
  const [profile, setProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [website, setWebsite] = useState('')
  const [education, setEducation] = useState('')
  const [workplace, setWorkplace] = useState('')
  const [gender, setGender] = useState('')
const [genderCustom, setGenderCustom] = useState('')
const [birthdate, setBirthdate] = useState('')
const [phoneNumber, setPhoneNumber] = useState('')

const [genderVisibility, setGenderVisibility] = useState('only_me')
const [birthdateVisibility, setBirthdateVisibility] = useState('only_me')
const [phoneVisibility, setPhoneVisibility] = useState('only_me')
  const [profileVisibility, setProfileVisibility] = useState('public')
  const [friendsVisibility, setFriendsVisibility] = useState('everyone')
  const [onlineStatusVisibility, setOnlineStatusVisibility] = useState('friends')
  const [availabilityStatus, setAvailabilityStatus] = useState('online')
  const [locationVisibility, setLocationVisibility] = useState('public')
  const [websiteVisibility, setWebsiteVisibility] = useState('public')
  const [educationVisibility, setEducationVisibility] = useState('public')
  const [workplaceVisibility, setWorkplaceVisibility] = useState('public')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [selectedCropFile, setSelectedCropFile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    function handleProfileUpdated(event) {
      const { avatar_url, bio: updatedBio, userId } = event.detail || {}
      if (userId && user?.id && userId === user.id) {
        setProfile((curr) => {
          if (!curr) return curr
          const next = { ...curr }
          if (avatar_url !== undefined) next.avatar_url = avatar_url
          if (updatedBio !== undefined) next.bio = updatedBio
          return next
        })
        if (avatar_url !== undefined) {
          setAvatarFile(null)
          setAvatarPreview('')
        }
      }
    }
    window.addEventListener('qorvexa:profile-updated', handleProfileUpdated)
    return () => window.removeEventListener('qorvexa:profile-updated', handleProfileUpdated)
  }, [user?.id])

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  useEffect(() => {
    return () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }
  }, [coverPreview])

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const { data: rows, error: queryError } = await getSupabaseClient().rpc('get_own_profile_settings')
        if (queryError) throw queryError
        const data = rows?.[0]
        if (!data) throw new Error('Your profile settings could not be found.')
        if (!active) return
        setProfile(data)
        setUsername(data.username || '')
        setDisplayName(data.display_name || '')
        setBio(data.bio || '')
        setLocation(data.location || '')
        setWebsite(data.website || '')
        setEducation(data.education || '')
        setWorkplace(data.workplace || '')
        const standardGenders = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
]

if (standardGenders.includes(data.gender)) {
  setGender(data.gender)
  setGenderCustom('')
} else if (data.gender) {
  setGender('self_describe')
  setGenderCustom(data.gender)
} else {
  setGender('')
  setGenderCustom('')
}

setBirthdate(data.birthdate || '')
setPhoneNumber(data.phone_number || '')

setGenderVisibility(data.gender_visibility || 'only_me')
setBirthdateVisibility(data.birthdate_visibility || 'only_me')
setPhoneVisibility(data.phone_visibility || 'only_me')
        setProfileVisibility(data.profile_visibility || 'public')
        setFriendsVisibility(data.friends_visibility || 'everyone')
        setOnlineStatusVisibility(data.online_status_visibility || 'friends')
        setAvailabilityStatus(data.availability_status || 'online')
        setLocationVisibility(data.location_visibility || 'public')
        setWebsiteVisibility(data.website_visibility || 'public')
        setEducationVisibility(data.education_visibility || 'public')
        setWorkplaceVisibility(data.workplace_visibility || 'public')
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
    const cleanWebsite = website.trim()
    const cleanGender = gender === 'self_describe'
  ? genderCustom.trim()
  : gender

const cleanBirthdate = birthdate || null
const cleanPhoneNumber = phoneNumber.trim() || null

if (gender === 'self_describe' && !cleanGender) {
  setError('Please describe your gender or choose another option.')
  return
}

if (cleanGender.length > 50) {
  setError('Gender must not exceed 50 characters.')
  return
}

if (cleanBirthdate) {
  const today = new Date()
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  if (cleanBirthdate > todayString) {
    setError('Birthdate cannot be in the future.')
    return
  }
}

if (cleanPhoneNumber && !/^[+]?[\d\s().-]{7,32}$/.test(cleanPhoneNumber)) {
  setError('Please enter a valid phone number.')
  return
}
    setError('')
    setNotice('')
    if (cleanName.length < 2 || cleanName.length > 60) {
      setError('Display name must be between 2 and 60 characters.')
      return
    }
    if (!usernamePattern.test(cleanUsername)) {
      setError('Username must be 3-24 lowercase letters, numbers, or underscores.')
      return
    }
    if (cleanBio.length > 280) {
      setError('Bio must be 280 characters or fewer.')
      return
    }
    if ([avatarFile, coverFile].some((file) => file && (!imageTypes.includes(file.type) || file.size > maxAvatarBytes))) {
      setError('Choose JPG, PNG, WebP, or GIF images under 8 MB.')
      return
    }
    if (cleanWebsite && !/^https?:\/\/\S+$/i.test(cleanWebsite)) {
      setError('Website must start with http:// or https://.')
      return
    }

    setSaving(true)
    const uploadedPaths = []
    let profileUpdated = false
    try {
      const client = getSupabaseClient()
      let avatarUrl = profile.avatar_url
      let coverPhotoPath = profile.cover_photo_path
      for (const [file, folder] of [[avatarFile, 'avatars'], [coverFile, 'covers']]) {
        if (!file) continue
        const path = `${user.id}/${folder}/${crypto.randomUUID()}`
        const { error: uploadError } = await client.storage
          .from('qorvexa-media')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (uploadError) throw uploadError
        uploadedPaths.push(path)
        if (folder === 'avatars') avatarUrl = path
        else coverPhotoPath = path
      }
      const { error: updateError } = await client
        .from('profiles')
        .update({
          username: cleanUsername,
          display_name: cleanName,
          bio: cleanBio,
          avatar_url: avatarUrl,
          cover_photo_path: coverPhotoPath,
          location: location.trim(),
          website: cleanWebsite,
          education: education.trim(),
          workplace: workplace.trim(),
          profile_visibility: profileVisibility,
          friends_visibility: friendsVisibility,
          online_status_visibility: onlineStatusVisibility,
          availability_status: availabilityStatus,
          location_visibility: locationVisibility,
          website_visibility: websiteVisibility,
          education_visibility: educationVisibility,
          workplace_visibility: workplaceVisibility,
          gender: cleanGender || null,
gender_visibility: genderVisibility,
birthdate: cleanBirthdate,
birthdate_visibility: birthdateVisibility,
phone_number: cleanPhoneNumber,
phone_visibility: phoneVisibility,
        })
        .eq('id', user.id)
      if (updateError) throw updateError
      profileUpdated = true
      const { data: rows, error: reloadError } = await client.rpc('get_own_profile_settings')
      if (reloadError) throw reloadError
      const data = rows?.[0]
      if (!data) throw new Error('Profile changes were saved but could not be reloaded.')
      setProfile(data)
      setUsername(data.username)
      setDisplayName(data.display_name)
      setBio(data.bio)
      setLocation(data.location)
      setWebsite(data.website)
      setEducation(data.education)
      setWorkplace(data.workplace)
      const standardGenders = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
]

if (standardGenders.includes(data.gender)) {
  setGender(data.gender)
  setGenderCustom('')
} else if (data.gender) {
  setGender('self_describe')
  setGenderCustom(data.gender)
} else {
  setGender('')
  setGenderCustom('')
}

setBirthdate(data.birthdate || '')
setPhoneNumber(data.phone_number || '')

setGenderVisibility(data.gender_visibility || 'only_me')
setBirthdateVisibility(data.birthdate_visibility || 'only_me')
setPhoneVisibility(data.phone_visibility || 'only_me')
      setProfileVisibility(data.profile_visibility)
      setFriendsVisibility(data.friends_visibility)
      setOnlineStatusVisibility(data.online_status_visibility)
      setAvailabilityStatus(data.availability_status || 'online')
      window.dispatchEvent(new CustomEvent(availabilityEvent, {
        detail: { availability: data.availability_status || 'online' },
      }))
      setLocationVisibility(data.location_visibility)
      setWebsiteVisibility(data.website_visibility)
      setEducationVisibility(data.education_visibility)
      setWorkplaceVisibility(data.workplace_visibility)
      setAvatarFile(null)
      setAvatarPreview('')
      setCoverFile(null)
      setCoverPreview('')
      setNotice('Your profile was updated.')
      window.dispatchEvent(
        new CustomEvent('qorvexa:profile-updated', {
          detail: {
            bio: data.bio,
            avatar_url: data.avatar_url,
            userId: user.id,
          },
        })
      )
    } catch (saveError) {
      let message = saveError.code === '23505'
        ? 'That username is already taken.'
        : saveError.message || 'Your profile could not be saved.'
      if (profileUpdated) message = `Your profile was saved, but its latest values could not be loaded. ${message}`
      if (uploadedPaths.length && !profileUpdated) {
        const { error: cleanupError } = await getSupabaseClient().storage
          .from('qorvexa-media')
          .remove(uploadedPaths)
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
        
          <AccountMenu />
        </nav>
      </header>
      <AccountRestrictionNotice userId={user.id} />
      <section className="settings-card" aria-labelledby="profile-settings-heading">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1 id="profile-settings-heading">Edit your profile</h1>
        <p className="settings-intro">Choose how you appear to other QORVEXA members and control what they can see.</p>
        {status === 'loading' ? <div className="member-feed-state" role="status"><LoaderCircle className="spinner" size={19} />Loading profile...</div> : null}
        {error && <div className="settings-message settings-message--error" role="alert"><AlertCircle size={16} />{error}</div>}
        {notice && <p className="settings-message settings-message--success" role="status">{notice}</p>}
        {status === 'ready' && (
          <form className="settings-form" onSubmit={handleSave}>
            <label id="profile-picture" className="settings-avatar-field">
              <span className="settings-avatar-preview">
                {profile.avatar_url
                  ? <ProtectedMediaImage path={profile.avatar_url} alt="Current profile avatar" fallback={(profile.display_name || profile.username || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()} />
                  : <UserRound size={25} aria-hidden="true" />}
              </span>
              <span><strong>Profile picture</strong><small>JPG, PNG, WebP, or GIF | up to 8 MB · Crop &amp; Adjust</small></span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  setError('')
                  const file = event.target.files?.[0] || null
                  if (file) {
                    setSelectedCropFile(file)
                    setCropModalOpen(true)
                  }
                  event.target.value = ''
                }}
              />
            </label>
            <label id="cover-photo" className="settings-avatar-field">
              <span className="settings-cover-preview">
                {coverFile
                  ? <img src={coverPreview} alt="Selected cover preview" />
                  : profile.cover_photo_path
                    ? <ProtectedMediaImage path={profile.cover_photo_path} alt="Current profile cover" />
                    : <span>QORVEXA cover</span>}
              </span>
              <span><strong>Cover photo</strong><small>JPG, PNG, WebP, or GIF | up to 8 MB</small></span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
                const file = event.target.files?.[0] || null
                setCoverFile(file)
                setCoverPreview(file ? URL.createObjectURL(file) : '')
              }} />
            </label>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={60} required /></label>
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" required /><small>3-24 lowercase letters, numbers, or underscores.</small></label>
            <label>Description / Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={280} rows={4} placeholder="Tell people something about yourself..." /><small>{bio.length}/280 characters</small></label>
            <label>
  Gender
 <CustomSelect
  value={gender}
  onChange={setGender}
  className="profile-detail-control"
  ariaLabel="Gender"
  options={[
    { value: '', label: 'Prefer not to specify' },
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Non-binary', label: 'Non-binary' },
    { value: 'self_describe', label: 'Self-describe' },
    { value: 'Prefer not to say', label: 'Prefer not to say' },
  ]}
/>
</label>

{gender === 'self_describe' && (
  <label>
    Describe your gender
    <input
      value={genderCustom}
      onChange={(event) => setGenderCustom(event.target.value)}
      maxLength={50}
      placeholder="Your description"
    />
  </label>
)}

<label>
  Gender visibility
  <CustomSelect
    value={genderVisibility}
    onChange={setGenderVisibility}
    ariaLabel="Gender visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Birthdate visibility
  <CustomSelect
    value={birthdateVisibility}
    onChange={setBirthdateVisibility}
    ariaLabel="Birthdate visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Phone number visibility
  <CustomSelect
    value={phoneVisibility}
    onChange={setPhoneVisibility}
    ariaLabel="Phone number visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Location visibility
  <CustomSelect
    value={locationVisibility}
    onChange={setLocationVisibility}
    ariaLabel="Location visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Website visibility
  <CustomSelect
    value={websiteVisibility}
    onChange={setWebsiteVisibility}
    ariaLabel="Website visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Education visibility
  <CustomSelect
    value={educationVisibility}
    onChange={setEducationVisibility}
    ariaLabel="Education visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Workplace visibility
  <CustomSelect
    value={workplaceVisibility}
    onChange={setWorkplaceVisibility}
    ariaLabel="Workplace visibility"
    options={[
      { value: 'public', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Profile visibility
  <CustomSelect
    value={profileVisibility}
    onChange={setProfileVisibility}
    ariaLabel="Profile visibility"
    options={[
      { value: 'public', label: 'Public' },
      { value: 'friends', label: 'Friends only' },
      { value: 'private', label: 'Private' },
    ]}
  />
  <small>Controls who can view your profile and its posts.</small>
</label>

<label>
  Friends list visibility
  <CustomSelect
    value={friendsVisibility}
    onChange={setFriendsVisibility}
    ariaLabel="Friends list visibility"
    options={[
      { value: 'everyone', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'only_me', label: 'Only me' },
    ]}
  />
</label>

<label>
  Online status visibility
  <CustomSelect
    value={onlineStatusVisibility}
    onChange={setOnlineStatusVisibility}
    ariaLabel="Online status visibility"
    options={[
      { value: 'everyone', label: 'Everyone' },
      { value: 'friends', label: 'Friends only' },
      { value: 'nobody', label: 'Nobody' },
    ]}
  />
</label>

<label>
  Birthdate
  <input
  className="profile-detail-control"
  type="date"
  value={birthdate}
  max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
  onChange={(event) => setBirthdate(event.target.value)}
/>
</label>

<label>
  Birthdate visibility
<select className="profile-detail-control" value={birthdateVisibility} onChange={(event) => setBirthdateVisibility(event.target.value)}>
    <option value="public">Everyone</option>
    <option value="friends">Friends only</option>
    <option value="only_me">Only me</option>
  </select>
</label>

<label>
  Phone number
  <input
    type="tel"
    value={phoneNumber}
    onChange={(event) => setPhoneNumber(event.target.value)}
    maxLength={32}
    autoComplete="tel"
    placeholder="+63 912 345 6789"
  />
</label>

<label>
  Phone number visibility
  <select value={phoneVisibility} onChange={(event) => setPhoneVisibility(event.target.value)}>
    <option value="public">Everyone</option>
    <option value="friends">Friends only</option>
    <option value="only_me">Only me</option>
  </select>
</label>
            <label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={100} /></label>
            <label>Location visibility<select value={locationVisibility} onChange={(event) => setLocationVisibility(event.target.value)}><option value="public">Everyone</option><option value="friends">Friends only</option><option value="only_me">Only me</option></select></label>
            <label>Website<input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={200} placeholder="https://example.com" /></label>
            <label>Website visibility<select value={websiteVisibility} onChange={(event) => setWebsiteVisibility(event.target.value)}><option value="public">Everyone</option><option value="friends">Friends only</option><option value="only_me">Only me</option></select></label>
            <label>Education<input value={education} onChange={(event) => setEducation(event.target.value)} maxLength={120} /></label>
            <label>Education visibility<select value={educationVisibility} onChange={(event) => setEducationVisibility(event.target.value)}><option value="public">Everyone</option><option value="friends">Friends only</option><option value="only_me">Only me</option></select></label>
            <label>Workplace<input value={workplace} onChange={(event) => setWorkplace(event.target.value)} maxLength={120} /></label>
            <label>Workplace visibility<select value={workplaceVisibility} onChange={(event) => setWorkplaceVisibility(event.target.value)}><option value="public">Everyone</option><option value="friends">Friends only</option><option value="only_me">Only me</option></select></label>
            <label>Profile visibility<select value={profileVisibility} onChange={(event) => setProfileVisibility(event.target.value)}><option value="public">Public</option><option value="friends">Friends only</option><option value="private">Private</option></select><small>Controls who can view your profile and its posts.</small></label>
            <label>Friends list visibility<select value={friendsVisibility} onChange={(event) => setFriendsVisibility(event.target.value)}><option value="everyone">Everyone</option><option value="friends">Friends only</option><option value="only_me">Only me</option></select></label>
            <label>Online status visibility<select value={onlineStatusVisibility} onChange={(event) => setOnlineStatusVisibility(event.target.value)}><option value="everyone">Everyone</option><option value="friends">Friends only</option><option value="nobody">Nobody</option></select></label>
          <label>
  Availability
  <CustomSelect
    value={availabilityStatus}
    onChange={setAvailabilityStatus}
    ariaLabel="Availability"
    options={[
      { value: 'online', label: 'Online' },
      { value: 'busy', label: 'Busy' },
      { value: 'offline', label: 'Appear offline' },
    ]}
  />
  <small>Your availability is shown only when your online-status privacy settings allow it.</small>
</label>

<label>
  Appearance
  <CustomSelect
    value={themePreference}
    onChange={setThemePreference}
    ariaLabel="Appearance"
    options={[
      { value: 'dark', label: 'Dark theme' },
      { value: 'light', label: 'Light theme' },
    ]}
  />
  <small>Choose how QORVEXA looks across your account.</small>
</label>
            <Link className="network-nav-link" to={`/profile/${encodeURIComponent(username)}`}>View your public profile</Link>
            <button className="member-publish-button" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />}
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        )}
      </section>
      <footer className="member-feed-footer"><span>Signed in as {user.email}</span></footer>
      <ProfilePhotoCropModal
        isOpen={cropModalOpen}
        initialFile={selectedCropFile}
        userId={user?.id}
        currentAvatarUrl={profile?.avatar_url}
        onClose={() => {
          setCropModalOpen(false)
          setSelectedCropFile(null)
        }}
        onSuccess={(newPath) => {
          setProfile((curr) => curr ? { ...curr, avatar_url: newPath } : curr)
          setNotice('Profile picture updated successfully.')
        }}
      />
    </main>
  )
}

export default ProfileSettingsPage







