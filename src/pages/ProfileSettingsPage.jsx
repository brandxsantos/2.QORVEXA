import { useEffect, useState, useRef, useMemo } from 'react'
import {
  AlertCircle,
  LoaderCircle,
  Save,
  UserRound,
  ShieldCheck,
  Activity,
  Palette,
  Camera,
  Image as ImageIcon,
  Globe,
  MapPin,
  Briefcase,
  GraduationCap,
  Phone,
  Calendar,
  ArrowLeft,
  ExternalLink,
  RotateCcw,
  Check,
  CheckCircle2,
  Lock,
  Users,
  Eye,
  Sparkles,
} from 'lucide-react'
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
import { isReservedUsername, isReservedDisplayName } from '../lib/reservedNames.js'
import './ProfileSettingsPage.css'

const usernamePattern = /^[a-z0-9_]{3,24}$/
const maxAvatarBytes = 8 * 1024 * 1024
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const availabilityEvent = 'qorvexa:availability-change'

const STANDARD_GENDERS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
]

const PRIVACY_OPTIONS_GENERAL = [
  { value: 'public', label: 'Everyone', description: 'Visible to anyone on or off QORVEXA' },
  { value: 'friends', label: 'Friends only', description: 'Visible only to accepted friends' },
  { value: 'only_me', label: 'Only me', description: 'Private to you' },
]

const PRIVACY_OPTIONS_FRIENDS_LIST = [
  { value: 'everyone', label: 'Everyone', description: 'Anyone can see who you are friends with' },
  { value: 'friends', label: 'Friends only', description: 'Only your friends can see your friends list' },
  { value: 'only_me', label: 'Only me', description: 'Only you can see your friends list' },
]

const PRIVACY_OPTIONS_ONLINE_STATUS = [
  { value: 'everyone', label: 'Everyone', description: 'All users can see when you are active' },
  { value: 'friends', label: 'Friends only', description: 'Only your friends can see your active indicator' },
  { value: 'nobody', label: 'Nobody', description: 'Hide your online status completely' },
]

const PRIVACY_OPTIONS_PROFILE = [
  { value: 'public', label: 'Public', description: 'Anyone can view your profile and timeline' },
  { value: 'friends', label: 'Friends only', description: 'Only accepted friends can view your timeline' },
  { value: 'private', label: 'Private', description: 'Profile is private and requires approval' },
]

function ProfileSettingsPage() {
  const { user } = useAuth()
  const { themePreference, setThemePreference } = useTheme()

  // Navigation tab
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'privacy' | 'activity' | 'appearance'

  // Profile data
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

  // Privacy states
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

  // Media files & modals
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [selectedCropFile, setSelectedCropFile] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Status
  const [status, setStatus] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Hidden file inputs
  const avatarInputRef = useRef(null)
  const coverInputRef = useRef(null)

  // Clean object URLs
  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  useEffect(() => {
    return () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }
  }, [coverPreview])

  // Profile-updated event listener
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

  // Load profile settings
  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const client = getSupabaseClient()
        const [settingsResult, roleResult] = await Promise.all([
          client.rpc('get_own_profile_settings'),
          client.rpc('admin_get_role'),
        ])
        if (settingsResult.error) throw settingsResult.error
        const data = settingsResult.data?.[0]
        if (!data) throw new Error('Your profile settings could not be found.')
        if (!active) return

        if (!roleResult?.error && roleResult?.data === 'super_admin') {
          setIsSuperAdmin(true)
        }

        setProfile(data)
        applyLoadedData(data)
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

  function applyLoadedData(data) {
    setUsername(data.username || '')
    setDisplayName(data.display_name || '')
    setBio(data.bio || '')
    setLocation(data.location || '')
    setWebsite(data.website || '')
    setEducation(data.education || '')
    setWorkplace(data.workplace || '')

    if (STANDARD_GENDERS.includes(data.gender)) {
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
  }

  // Detect unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!profile) return false
    const currentGender = gender === 'self_describe' ? genderCustom.trim() : gender
    const dbGender = profile.gender || ''

    if (displayName.trim() !== (profile.display_name || '').trim()) return true
    if (username.trim().toLowerCase() !== (profile.username || '').toLowerCase()) return true
    if (bio.trim() !== (profile.bio || '').trim()) return true
    if (location.trim() !== (profile.location || '').trim()) return true
    if (website.trim() !== (profile.website || '').trim()) return true
    if (education.trim() !== (profile.education || '').trim()) return true
    if (workplace.trim() !== (profile.workplace || '').trim()) return true
    if (currentGender !== dbGender) return true
    if ((birthdate || '') !== (profile.birthdate || '')) return true
    if ((phoneNumber || '').trim() !== (profile.phone_number || '').trim()) return true

    if (genderVisibility !== (profile.gender_visibility || 'only_me')) return true
    if (birthdateVisibility !== (profile.birthdate_visibility || 'only_me')) return true
    if (phoneVisibility !== (profile.phone_visibility || 'only_me')) return true
    if (profileVisibility !== (profile.profile_visibility || 'public')) return true
    if (friendsVisibility !== (profile.friends_visibility || 'everyone')) return true
    if (onlineStatusVisibility !== (profile.online_status_visibility || 'friends')) return true
    if (availabilityStatus !== (profile.availability_status || 'online')) return true
    if (locationVisibility !== (profile.location_visibility || 'public')) return true
    if (websiteVisibility !== (profile.website_visibility || 'public')) return true
    if (educationVisibility !== (profile.education_visibility || 'public')) return true
    if (workplaceVisibility !== (profile.workplace_visibility || 'public')) return true
    if (themePreference !== (profile.theme_preference || 'dark')) return true

    if (coverFile) return true
    if (avatarFile) return true

    return false
  }, [
    profile,
    themePreference,
    displayName,
    username,
    bio,
    location,
    website,
    education,
    workplace,
    gender,
    genderCustom,
    birthdate,
    phoneNumber,
    genderVisibility,
    birthdateVisibility,
    phoneVisibility,
    profileVisibility,
    friendsVisibility,
    onlineStatusVisibility,
    availabilityStatus,
    locationVisibility,
    websiteVisibility,
    educationVisibility,
    workplaceVisibility,
    coverFile,
    avatarFile,
  ])

  // Discard changes
  function handleDiscard() {
    if (!profile) return
    applyLoadedData(profile)
    setThemePreference(profile.theme_preference || 'dark')
    setCoverFile(null)
    setCoverPreview('')
    setAvatarFile(null)
    setAvatarPreview('')
    setError('')
    setNotice('')
  }

  // Cover photo selection
  function handleCoverSelected(event) {
    setError('')
    const file = event.target.files?.[0] || null
    if (file) {
      if (!imageTypes.includes(file.type) || file.size > maxAvatarBytes) {
        setError('Choose JPG, PNG, WebP, or GIF images under 8 MB.')
        return
      }
      setCoverFile(file)
      setCoverPreview(URL.createObjectURL(file))
    }
    event.target.value = ''
  }

  // Avatar file selection -> Opens Crop Modal
  function handleAvatarSelected(event) {
    setError('')
    const file = event.target.files?.[0] || null
    if (file) {
      if (!imageTypes.includes(file.type) || file.size > maxAvatarBytes) {
        setError('Choose JPG, PNG, WebP, or GIF images under 8 MB.')
        return
      }
      setSelectedCropFile(file)
      setCropModalOpen(true)
    }
    event.target.value = ''
  }

  // Save profile changes
  async function handleSave(event) {
    if (event) event.preventDefault()
    const cleanName = displayName.trim()
    const cleanUsername = username.trim().toLowerCase()
    const cleanBio = bio.trim()
    const cleanWebsite = website.trim()
    const cleanGender = gender === 'self_describe' ? genderCustom.trim() : gender
    const cleanBirthdate = birthdate || null
    const cleanPhoneNumber = phoneNumber.trim() || null

    if (gender === 'self_describe' && !cleanGender) {
      setError('Please describe your gender or choose another option.')
      setActiveTab('profile')
      return
    }

    if (cleanGender.length > 50) {
      setError('Gender must not exceed 50 characters.')
      setActiveTab('profile')
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
        setActiveTab('profile')
        return
      }
    }

    if (cleanPhoneNumber && !/^[+]?[\d\s().-]{7,32}$/.test(cleanPhoneNumber)) {
      setError('Please enter a valid phone number.')
      setActiveTab('profile')
      return
    }

    setError('')
    setNotice('')

    if (cleanName.length < 2 || cleanName.length > 60) {
      setError('Display name must be between 2 and 60 characters.')
      setActiveTab('profile')
      return
    }

    if (!isSuperAdmin && isReservedDisplayName(cleanName)) {
      setError(`The display name "${cleanName}" is reserved for platform administrators.`)
      setActiveTab('profile')
      return
    }

    if (!usernamePattern.test(cleanUsername)) {
      setError('Username must be 3-24 lowercase letters, numbers, or underscores.')
      setActiveTab('profile')
      return
    }

    if (!isSuperAdmin && isReservedUsername(cleanUsername)) {
      setError(`The username "@${cleanUsername}" is reserved for platform administrators.`)
      setActiveTab('profile')
      return
    }

    if (cleanBio.length > 280) {
      setError('Bio must be 280 characters or fewer.')
      setActiveTab('profile')
      return
    }

    if (cleanWebsite && !/^https?:\/\/\S+$/i.test(cleanWebsite)) {
      setError('Website must start with http:// or https://.')
      setActiveTab('profile')
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
          theme_preference: themePreference,
        })
        .eq('id', user.id)

      if (updateError) throw updateError
      profileUpdated = true

      const { data: rows, error: reloadError } = await client.rpc('get_own_profile_settings')
      if (reloadError) throw reloadError
      const data = rows?.[0]
      if (!data) throw new Error('Profile changes were saved but could not be reloaded.')

      setProfile(data)
      applyLoadedData(data)
      window.dispatchEvent(new CustomEvent(availabilityEvent, {
        detail: { availability: data.availability_status || 'online' },
      }))

      setAvatarFile(null)
      setAvatarPreview('')
      setCoverFile(null)
      setCoverPreview('')
      setNotice('Your profile was successfully updated.')

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

  const initials = (displayName || username || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <main className="member-page member-feed-page settings-page-wrapper">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />

      {/* TOP HEADER */}
      <header className="member-header member-feed-header">
        <Link className="brand-link" to="/app" aria-label="QORVEXA feed">
          <BrandMark />
        </Link>
        <nav className="network-nav" aria-label="Community navigation">
          <Link className="network-nav-link" to="/app">Feed</Link>
          <AccountMenu />
        </nav>
      </header>

      <AccountRestrictionNotice userId={user.id} />

      {/* PAGE BANNER & TITLE */}
      <div className="settings-header-banner">
        <Link to="/app" className="settings-back-link">
          <ArrowLeft size={16} />
          <span>Back to Feed</span>
        </Link>
        <div className="settings-title-group">
          <h1>Account Settings</h1>
          <p>Manage your profile, privacy, and account preferences.</p>
        </div>
      </div>

      {status === 'loading' ? (
        <div className="member-feed-state" role="status">
          <LoaderCircle className="spinner" size={20} />
          Loading your account settings...
        </div>
      ) : null}

      {status === 'ready' && (
        <div className="settings-main-layout">
          {/* LEFT COLUMN: NAVIGATION SIDEBAR */}
          <nav className="settings-nav-sidebar" aria-label="Settings categories">
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'profile' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <UserRound size={18} className="settings-nav-icon" />
              <span>Profile</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'privacy' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              <ShieldCheck size={18} className="settings-nav-icon" />
              <span>Privacy</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'activity' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              <Activity size={18} className="settings-nav-icon" />
              <span>Activity &amp; Status</span>
            </button>

            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'appearance' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              <Palette size={18} className="settings-nav-icon" />
              <span>Appearance</span>
            </button>
          </nav>

          {/* RIGHT COLUMN: TAB CONTENT */}
          <section className="settings-content-area" aria-live="polite">
            {error && (
              <div className="settings-alert-banner is-error" role="alert">
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="settings-alert-banner is-success" role="status">
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <span>{notice}</span>
              </div>
            )}

            {/* TAB 1: PROFILE */}
            {activeTab === 'profile' && (
              <>
                {/* 1. Profile Preview Card */}
                <div className="settings-modern-card settings-profile-preview">
                  <div className="settings-cover-container">
                    {coverPreview ? (
                      <img src={coverPreview} alt="Selected cover preview" className="settings-cover-img" />
                    ) : profile?.cover_photo_path ? (
                      <ProtectedMediaImage
                        path={profile.cover_photo_path}
                        alt="Current profile cover"
                        className="settings-cover-img"
                      />
                    ) : (
                      <div className="settings-cover-placeholder" />
                    )}

                    <button
                      type="button"
                      className="settings-cover-overlay-btn"
                      onClick={() => coverInputRef.current?.click()}
                      title="Change cover photo"
                    >
                      <ImageIcon size={15} />
                      <span>{coverPreview || profile?.cover_photo_path ? 'Change Cover' : 'Add Cover'}</span>
                    </button>

                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={handleCoverSelected}
                    />
                  </div>

                  <div className="settings-preview-body">
                    <div className="settings-avatar-wrapper">
                      <div className="settings-avatar-circle">
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="Avatar preview" />
                        ) : profile?.avatar_url ? (
                          <ProtectedMediaImage
                            path={profile.avatar_url}
                            alt="Current profile avatar"
                            fallback={initials}
                          />
                        ) : (
                          <UserRound size={36} aria-hidden="true" />
                        )}
                      </div>

                      <button
                        type="button"
                        className="settings-avatar-upload-badge"
                        onClick={() => avatarInputRef.current?.click()}
                        title="Change profile picture"
                        aria-label="Change profile picture"
                      >
                        <Camera size={15} />
                      </button>

                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={handleAvatarSelected}
                      />
                    </div>

                    <div className="settings-preview-meta">
                      <div className="settings-preview-names">
                        <h2 className="settings-preview-displayname">{displayName || 'Your Name'}</h2>
                        <div className="settings-preview-username">@{username || 'username'}</div>
                        <p className="settings-preview-bio">
                          {bio || 'Add a short bio to tell people about yourself…'}
                        </p>
                      </div>

                      <Link
                        to={`/profile/${encodeURIComponent(username || profile?.username || '')}`}
                        className="settings-view-public-btn"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>View Public Profile</span>
                        <ExternalLink size={14} />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* 2. Basic Information Form Card */}
                <div className="settings-modern-card">
                  <div className="settings-card-header">
                    <h2>Basic Information</h2>
                    <p>Update your personal details and how you appear to others on QORVEXA.</p>
                  </div>

                  <form className="settings-form-grid" onSubmit={handleSave}>
                    <div className="settings-field-group">
                      <label htmlFor="settings-displayName">
                        <span>Display Name</span>
                        <span className="settings-char-count">{displayName.length}/60</span>
                      </label>
                      <input
                        id="settings-displayName"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        minLength={2}
                        maxLength={60}
                        placeholder="Your full name"
                        required
                      />
                      <span className="settings-field-hint">Between 2 and 60 characters.</span>
                    </div>

                    <div className="settings-field-group">
                      <label htmlFor="settings-username">
                        <span>Username</span>
                        <span className="settings-char-count">@{username}</span>
                      </label>
                      <input
                        id="settings-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                        minLength={3}
                        maxLength={24}
                        pattern="[a-z0-9_]{3,24}"
                        placeholder="your_handle"
                        required
                      />
                      <span className="settings-field-hint">3–24 lowercase letters, numbers, or underscores.</span>
                    </div>

                    <div className="settings-field-group settings-field-full">
                      <label htmlFor="settings-bio">
                        <span>Description / Bio</span>
                        <span className="settings-char-count">{bio.length}/280</span>
                      </label>
                      <textarea
                        id="settings-bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={280}
                        rows={4}
                        placeholder="Tell people something about yourself, your interests, or what you work on…"
                      />
                    </div>

                    <div className="settings-field-group">
                      <label>Gender</label>
                      <CustomSelect
                        value={gender}
                        onChange={setGender}
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
                    </div>

                    {gender === 'self_describe' && (
                      <div className="settings-field-group">
                        <label htmlFor="settings-gender-custom">Describe your gender</label>
                        <input
                          id="settings-gender-custom"
                          type="text"
                          value={genderCustom}
                          onChange={(e) => setGenderCustom(e.target.value)}
                          maxLength={50}
                          placeholder="Your self-described gender"
                        />
                      </div>
                    )}

                    <div className="settings-field-group">
                      <label htmlFor="settings-birthdate">Birthdate</label>
                      <div className="settings-input-wrapper">
                        <Calendar size={16} className="settings-input-icon" />
                        <input
                          id="settings-birthdate"
                          type="date"
                          className="settings-field-with-icon"
                          value={birthdate}
                          max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
                          onChange={(e) => setBirthdate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="settings-field-group">
                      <label htmlFor="settings-phone">Phone Number</label>
                      <div className="settings-input-wrapper">
                        <Phone size={16} className="settings-input-icon" />
                        <input
                          id="settings-phone"
                          type="tel"
                          className="settings-field-with-icon"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          maxLength={32}
                          autoComplete="tel"
                          placeholder="+1 555 123 4567"
                        />
                      </div>
                    </div>

                    <div className="settings-field-group">
                      <label htmlFor="settings-location">Location</label>
                      <div className="settings-input-wrapper">
                        <MapPin size={16} className="settings-input-icon" />
                        <input
                          id="settings-location"
                          type="text"
                          className="settings-field-with-icon"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          maxLength={100}
                          placeholder="City, Country"
                        />
                      </div>
                    </div>

                    <div className="settings-field-group">
                      <label htmlFor="settings-website">Website</label>
                      <div className="settings-input-wrapper">
                        <Globe size={16} className="settings-input-icon" />
                        <input
                          id="settings-website"
                          type="url"
                          className="settings-field-with-icon"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          maxLength={200}
                          placeholder="https://example.com"
                        />
                      </div>
                    </div>

                    <div className="settings-field-group">
                      <label htmlFor="settings-education">Education</label>
                      <div className="settings-input-wrapper">
                        <GraduationCap size={16} className="settings-input-icon" />
                        <input
                          id="settings-education"
                          type="text"
                          className="settings-field-with-icon"
                          value={education}
                          onChange={(e) => setEducation(e.target.value)}
                          maxLength={120}
                          placeholder="University, College, or School"
                        />
                      </div>
                    </div>

                    <div className="settings-field-group">
                      <label htmlFor="settings-workplace">Workplace</label>
                      <div className="settings-input-wrapper">
                        <Briefcase size={16} className="settings-input-icon" />
                        <input
                          id="settings-workplace"
                          type="text"
                          className="settings-field-with-icon"
                          value={workplace}
                          onChange={(e) => setWorkplace(e.target.value)}
                          maxLength={120}
                          placeholder="Company, Organization, or Role"
                        />
                      </div>
                    </div>
                  </form>
                </div>
              </>
            )}

            {/* TAB 2: PRIVACY */}
            {activeTab === 'privacy' && (
              <>
                {/* Profile Privacy Card */}
                <div className="settings-modern-card">
                  <div className="settings-card-header">
                    <h2>Profile &amp; Community Privacy</h2>
                    <p>Control who can find your profile, view your posts, and see your connections.</p>
                  </div>

                  <div className="settings-privacy-list">
                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Eye size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Profile Visibility</h3>
                          <p>Controls who can view your profile and timeline posts.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={profileVisibility}
                          onChange={setProfileVisibility}
                          ariaLabel="Profile visibility"
                          options={PRIVACY_OPTIONS_PROFILE}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Users size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Friends List Visibility</h3>
                          <p>Controls who can view your list of accepted friends.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={friendsVisibility}
                          onChange={setFriendsVisibility}
                          ariaLabel="Friends list visibility"
                          options={PRIVACY_OPTIONS_FRIENDS_LIST}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Information Visibility Card */}
                <div className="settings-modern-card">
                  <div className="settings-card-header">
                    <h2>Personal Information Visibility</h2>
                    <p>Decide who is permitted to see each specific detail on your profile.</p>
                  </div>

                  <div className="settings-privacy-list">
                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Calendar size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Birthdate</h3>
                          <p>Choose who can see your birthday on your profile.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={birthdateVisibility}
                          onChange={setBirthdateVisibility}
                          ariaLabel="Birthdate visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Phone size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Phone Number</h3>
                          <p>Choose who can see your phone number.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={phoneVisibility}
                          onChange={setPhoneVisibility}
                          ariaLabel="Phone number visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <UserRound size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Gender</h3>
                          <p>Choose who can see your gender on your profile.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={genderVisibility}
                          onChange={setGenderVisibility}
                          ariaLabel="Gender visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <MapPin size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Location</h3>
                          <p>Choose who can see your city and country.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={locationVisibility}
                          onChange={setLocationVisibility}
                          ariaLabel="Location visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Globe size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Website</h3>
                          <p>Choose who can see your personal link.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={websiteVisibility}
                          onChange={setWebsiteVisibility}
                          ariaLabel="Website visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <GraduationCap size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Education</h3>
                          <p>Choose who can see your school or university.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={educationVisibility}
                          onChange={setEducationVisibility}
                          ariaLabel="Education visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Briefcase size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Workplace</h3>
                          <p>Choose who can see where you work.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={workplaceVisibility}
                          onChange={setWorkplaceVisibility}
                          ariaLabel="Workplace visibility"
                          options={PRIVACY_OPTIONS_GENERAL}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TAB 3: ACTIVITY & STATUS */}
            {activeTab === 'activity' && (
              <>
                <div className="settings-modern-card">
                  <div className="settings-card-header">
                    <h2>Online Status &amp; Privacy</h2>
                    <p>Manage who can see when you are active on the platform.</p>
                  </div>

                  <div className="settings-privacy-list">
                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Activity size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Online Status Visibility</h3>
                          <p>Controls who can see your active green indicator dot.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={onlineStatusVisibility}
                          onChange={setOnlineStatusVisibility}
                          ariaLabel="Online status visibility"
                          options={PRIVACY_OPTIONS_ONLINE_STATUS}
                        />
                      </div>
                    </div>

                    <div className="settings-privacy-row">
                      <div className="settings-privacy-info">
                        <div className="settings-privacy-icon-badge">
                          <Sparkles size={18} />
                        </div>
                        <div className="settings-privacy-text">
                          <h3>Current Availability</h3>
                          <p>Set your availability status across messenger and profile.</p>
                        </div>
                      </div>
                      <div className="settings-privacy-control">
                        <CustomSelect
                          value={availabilityStatus}
                          onChange={setAvailabilityStatus}
                          ariaLabel="Availability"
                          options={[
                            { value: 'online', label: '🟢 Online' },
                            { value: 'busy', label: '🟠 Busy' },
                            { value: 'offline', label: '⚪ Appear offline' },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="settings-info-callout">
                    <AlertCircle size={18} />
                    <span>
                      <strong>Privacy Note:</strong> Your availability status is displayed to other members only when your online-status privacy settings permit them to see your activity.
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* TAB 4: APPEARANCE */}
            {activeTab === 'appearance' && (
              <div className="settings-modern-card">
                <div className="settings-card-header">
                  <h2>Appearance &amp; Theme</h2>
                  <p>Customize the look and feel of QORVEXA. Your choice applies across your entire account.</p>
                </div>

                <div className="settings-theme-cards">
                  <button
                    type="button"
                    className={`settings-theme-option ${themePreference === 'dark' ? 'is-selected' : ''}`}
                    onClick={() => setThemePreference('dark')}
                  >
                    <div className="settings-theme-preview-box is-dark">
                      <Palette size={26} />
                    </div>
                    <div className="settings-theme-copy">
                      <strong>
                        <span>Dark Theme</span>
                        {themePreference === 'dark' && <Check size={16} color="#00d9f5" />}
                      </strong>
                      <small>Sleek dark interface designed for low-light environments.</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`settings-theme-option ${themePreference === 'light' ? 'is-selected' : ''}`}
                    onClick={() => setThemePreference('light')}
                  >
                    <div className="settings-theme-preview-box is-light">
                      <Palette size={26} />
                    </div>
                    <div className="settings-theme-copy">
                      <strong>
                        <span>Light Theme</span>
                        {themePreference === 'light' && <Check size={16} color="#0284c7" />}
                      </strong>
                      <small>Clean and crisp bright interface for daytime productivity.</small>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* STICKY BOTTOM SAVE ACTION BAR */}
      {status === 'ready' && (
        <aside className="settings-sticky-save-bar" aria-label="Save settings">
          <div className="settings-save-status">
            <span className={`settings-status-pulse ${hasUnsavedChanges ? '' : 'is-clean'}`} />
            <span>{hasUnsavedChanges ? 'You have unsaved changes' : 'All changes saved'}</span>
          </div>

          <div className="settings-save-actions">
            <button
              type="button"
              className="settings-discard-btn"
              onClick={handleDiscard}
              disabled={!hasUnsavedChanges || saving}
            >
              Discard
            </button>

            <button
              type="button"
              className="settings-save-btn"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
            >
              {saving ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* FOOTER */}
      <footer className="member-feed-footer" style={{ marginTop: '3rem' }}>
        <span>Signed in as {user.email}</span>
      </footer>

      {/* PROFILE PHOTO CROP MODAL */}
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
          setNotice('Profile picture updated and posted to your timeline.')
        }}
      />
    </main>
  )
}

export default ProfileSettingsPage
