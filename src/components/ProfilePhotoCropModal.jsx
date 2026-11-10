import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Cropper from 'react-easy-crop'
import {
  X,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  AlertCircle,
  LoaderCircle,
  Camera,
  Eye,
  Globe,
  Users,
  Lock,
  ChevronDown,
} from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase.js'
import './ProfilePhotoCropModal.css'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB
const TARGET_SIZE = 512

const AUDIENCE_OPTIONS = [
  { value: 'public', label: 'Public', description: 'Anyone on QORVEXA can see this post', Icon: Globe },
  { value: 'friends', label: 'Friends', description: 'Only your accepted friends can see it', Icon: Users },
  { value: 'only_me', label: 'Only me', description: 'Only visible to you', Icon: Lock },
]

/**
 * Validates basic file format and size limits.
 */
function validateImageFile(file) {
  if (!file) throw new Error('Please select an image file.')
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('Unsupported format. Please choose a JPG, PNG, WebP, or GIF image.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File size exceeds the 8 MB limit. Please choose a smaller image.')
  }
}

/**
 * Reads a File or Blob into a Base64 data URL.
 * Base64 data URLs never expire, never suffer from CORS issues, and cannot be revoked.
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read image file from your device.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Decodes an image source into an HTMLImageElement for canvas cropping.
 */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image data for cropping.'))
    img.src = src

    if (img.complete && img.naturalWidth > 0) {
      resolve(img)
    }
  })
}

/**
 * Crops the image using an offscreen canvas to a 512x512 square image.
 * Returns { blob, type: 'image/jpeg' }
 */
async function getCroppedImageBlob(imageSrc, pixelCrop, targetSize = TARGET_SIZE) {
  const image = await loadImageElement(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Could not initialize canvas context for cropping.')
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height

  // Safe integer clamped crop box
  const cropX = Math.max(0, Math.min(naturalWidth - 1, Math.round(pixelCrop?.x || 0)))
  const cropY = Math.max(0, Math.min(naturalHeight - 1, Math.round(pixelCrop?.y || 0)))
  const cropWidth = Math.max(1, Math.min(naturalWidth - cropX, Math.round(pixelCrop?.width || naturalWidth)))
  const cropHeight = Math.max(1, Math.min(naturalHeight - cropY, Math.round(pixelCrop?.height || naturalHeight)))

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetSize,
    targetSize
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to export cropped image from canvas.'))
          return
        }
        resolve({ blob, type: 'image/jpeg' })
      },
      'image/jpeg',
      0.92
    )
  })
}

export default function ProfilePhotoCropModal({
  isOpen,
  initialFile = null,
  userId,
  currentAvatarUrl = '',
  _currentAvatarUrl = '',
  onClose,
  onSuccess,
}) {
  const [imageSrc, setImageSrc] = useState('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const [generatingPreview, setGeneratingPreview] = useState(false)
  const [caption, setCaption] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)
  const audienceRef = useRef(null)

  const selectedAudience = AUDIENCE_OPTIONS.find((opt) => opt.value === visibility) || AUDIENCE_OPTIONS[0]

  const loadFile = useCallback(async (file) => {
    setError('')
    try {
      validateImageFile(file)
      const dataUrl = await readFileAsDataUrl(file)

      // Test decoding before proceeding
      const img = await loadImageElement(dataUrl)
      if (!img.naturalWidth || !img.naturalHeight) {
        throw new Error('The selected image has invalid dimensions or is corrupted.')
      }

      setImageSrc(dataUrl)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setPreviewMode(false)
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return ''
      })
    } catch (err) {
      console.error('[QORVEXA] Error loading image:', err)
      setError(err?.message || 'Unable to process the chosen image.')
    }
  }, [])

  // Clean up any preview object URLs when closing
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // Handle modal open / close lifecycle
  useEffect(() => {
    if (!isOpen) {
      setImageSrc('')
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return ''
      })
      setPreviewMode(false)
      setCaption('')
      setVisibility('public')
      setAudienceOpen(false)
      setError('')
      setLoading(false)
      return
    }

    if (initialFile) {
      loadFile(initialFile)
    }
  }, [isOpen, initialFile, loadFile])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !loading) {
        if (audienceOpen) {
          setAudienceOpen(false)
          return
        }
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, audienceOpen, onClose])

  // Handle outside click for audience dropdown
  useEffect(() => {
    if (!audienceOpen) return
    function handleClickOutside(e) {
      if (audienceRef.current && !audienceRef.current.contains(e.target)) {
        setAudienceOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [audienceOpen])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      loadFile(file)
    }
    e.target.value = ''
  }

  const onCropCompleteHandler = useCallback((_croppedArea, completedPixels) => {
    setCroppedAreaPixels(completedPixels)
  }, [])

  const handleReset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  // Generate preview on demand when toggled
  const handleTogglePreview = async () => {
    if (!previewMode) {
      if (!imageSrc) return
      setGeneratingPreview(true)
      try {
        let cropCoords = croppedAreaPixels
        if (!cropCoords) {
          const img = await loadImageElement(imageSrc)
          const size = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height)
          cropCoords = {
            x: Math.round(((img.naturalWidth || img.width) - size) / 2),
            y: Math.round(((img.naturalHeight || img.height) - size) / 2),
            width: size,
            height: size,
          }
        }
        const { blob } = await getCroppedImageBlob(imageSrc, cropCoords, TARGET_SIZE)
        const url = URL.createObjectURL(blob)
        setPreviewUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
          return url
        })
        setPreviewMode(true)
      } catch (err) {
        console.error('[QORVEXA] Error generating preview:', err)
        setError(err?.message || 'Failed to generate photo preview.')
      } finally {
        setGeneratingPreview(false)
      }
    } else {
      setPreviewMode(false)
    }
  }

  const handleSave = async () => {
    if (!imageSrc) {
      setError('Please select an image before saving.')
      return
    }

    setLoading(true)
    setError('')

    let uploadedPath = null
    const previousAvatar = currentAvatarUrl || _currentAvatarUrl || null
    const client = getSupabaseClient()

    try {
      // 1. Resolve session & authenticated user ID
      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw sessionError

      const effectiveUserId = userId || sessionData?.session?.user?.id
      if (!effectiveUserId) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      // 2. Process crop with fallback to center square if onCropComplete hasn't fired yet
      let cropCoords = croppedAreaPixels
      if (!cropCoords) {
        const img = await loadImageElement(imageSrc)
        const size = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height)
        cropCoords = {
          x: Math.round(((img.naturalWidth || img.width) - size) / 2),
          y: Math.round(((img.naturalHeight || img.height) - size) / 2),
          width: size,
          height: size,
        }
      }

      const { blob, type } = await getCroppedImageBlob(imageSrc, cropCoords, TARGET_SIZE)

      // 3. Upload to qorvexa-media storage bucket under authenticated user's avatars folder
      // Matching existing path convention: ${effectiveUserId}/avatars/${uuid}
      const filename = crypto.randomUUID()
      uploadedPath = `${effectiveUserId}/avatars/${filename}`

      const fileToUpload = new File([blob], filename, { type })

      const { error: uploadError } = await client.storage
        .from('qorvexa-media')
        .upload(uploadedPath, fileToUpload, {
          contentType: type,
          upsert: false,
        })

      if (uploadError) {
        console.error('[QORVEXA] Storage upload error:', uploadError)
        throw new Error(uploadError.message || uploadError.error || 'Failed to upload image to storage.')
      }

      // 4. Update the user's profile record in Supabase
      const { error: updateError } = await client
        .from('profiles')
        .update({ avatar_url: uploadedPath })
        .eq('id', effectiveUserId)

      if (updateError) {
        console.error('[QORVEXA] Profile update error:', updateError)
        // Rollback: delete the newly uploaded file to avoid orphaned storage objects
        await client.storage.from('qorvexa-media').remove([uploadedPath])
        throw new Error(updateError.message || updateError.error || 'Failed to update profile avatar.')
      }

      // 5. Automatically create a corresponding post using the EXISTING QORVEXA POSTS SYSTEM
      const postSelection = 'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'
      const trimmedCaption = caption.trim()

      const { data: newPost, error: postError } = await client
        .from('posts')
        .insert({
          author_id: effectiveUserId,
          content: trimmedCaption,
          media_path: uploadedPath,
          media_type: 'image',
          post_visibility: visibility,
        })
        .select(postSelection)
        .single()

      if (postError) {
        console.error('[QORVEXA] Post creation error on profile photo update:', postError)
        // Rollback: restore previous avatar url in profile and remove uploaded storage file
        await client.from('profiles').update({ avatar_url: previousAvatar }).eq('id', effectiveUserId)
        await client.storage.from('qorvexa-media').remove([uploadedPath])
        throw new Error(postError.message || postError.error || 'Failed to post profile picture update to your timeline.')
      }

      // 6. Dispatch a global profile-updated event so all parts of the app update live
      window.dispatchEvent(
        new CustomEvent('qorvexa:profile-updated', {
          detail: {
            avatar_url: uploadedPath,
            userId: effectiveUserId,
          },
        })
      )

      onSuccess?.(uploadedPath, newPost)
      onClose?.()
    } catch (err) {
      console.error('[QORVEXA] Error saving profile photo:', err)
      const message =
        err?.message ||
        err?.error_description ||
        (typeof err?.error === 'string' ? err.error : err?.error?.message) ||
        (typeof err === 'string' ? err : '') ||
        'Failed to save profile photo. Please try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="q-photo-crop-overlay" role="presentation">
      <div
        className="q-photo-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="q-photo-crop-title"
      >
        {/* Modal Header */}
        <div className="q-photo-crop-header">
          <div className="q-photo-crop-header-title">
            <Camera size={20} className="q-photo-crop-header-icon" />
            <h2 id="q-photo-crop-title">Edit Profile Picture</h2>
          </div>
          <button
            type="button"
            className="q-photo-crop-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close photo editor"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="q-photo-crop-body">
          {error && (
            <div className="q-photo-crop-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!imageSrc ? (
            /* Upload Empty State */
            <div className="q-photo-crop-dropzone">
              <div className="q-photo-crop-dropzone-icon">
                <Upload size={36} />
              </div>
              <h3>Choose a photo to adjust</h3>
              <p>Supports JPG, PNG, WebP, or GIF up to 8 MB.</p>
              <button
                type="button"
                className="q-photo-crop-select-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload from device
              </button>
            </div>
          ) : previewMode ? (
            /* Final Preview Mode */
            <div className="q-photo-crop-preview-view">
              <div className="q-photo-crop-preview-display">
                <div className="q-photo-crop-preview-avatar-large">
                  <img src={previewUrl || imageSrc} alt="Profile photo preview" />
                </div>
                <div className="q-photo-crop-preview-info">
                  <h4>Looking good!</h4>
                  <p>Here is how your profile picture will appear across QORVEXA.</p>
                  <div className="q-photo-crop-preview-samples">
                    <div className="q-photo-crop-sample-item">
                      <div className="q-photo-crop-preview-avatar-med">
                        <img src={previewUrl || imageSrc} alt="Medium preview" />
                      </div>
                      <span>Feed &amp; Profile</span>
                    </div>
                    <div className="q-photo-crop-sample-item">
                      <div className="q-photo-crop-preview-avatar-sm">
                        <img src={previewUrl || imageSrc} alt="Small preview" />
                      </div>
                      <span>Chat Heads</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline Post Preview Card */}
              <div className="q-photo-crop-preview-card">
                <div className="q-photo-crop-preview-card-header">
                  <span className="q-photo-crop-preview-card-title">Timeline Post Preview</span>
                  <span className="q-photo-crop-preview-card-audience">
                    <selectedAudience.Icon size={12} />
                    <span>{selectedAudience.label}</span>
                  </span>
                </div>
                {caption.trim() ? (
                  <p className="q-photo-crop-preview-caption-text">{caption.trim()}</p>
                ) : (
                  <p className="q-photo-crop-preview-caption-empty">No caption provided (photo-only update)</p>
                )}
              </div>
            </div>
          ) : (
            /* Active Cropping Workspace */
            <div className="q-photo-crop-workspace-container">
              <div className="q-photo-crop-workspace">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={true}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropCompleteHandler}
                />
              </div>

              {/* Workspace Controls */}
              <div className="q-photo-crop-controls">
                {/* Zoom Control */}
                <div className="q-photo-crop-zoom-row">
                  <button
                    type="button"
                    className="q-photo-crop-zoom-step"
                    onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(2))))}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <input
                    type="range"
                    className="q-photo-crop-zoom-slider"
                    min={1}
                    max={3}
                    step={0.02}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    aria-label="Zoom adjustment slider"
                  />
                  <button
                    type="button"
                    className="q-photo-crop-zoom-step"
                    onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <span className="q-photo-crop-zoom-label">{Math.round(zoom * 100)}%</span>
                </div>

                {/* Sub Controls: Reset & Replace */}
                <div className="q-photo-crop-actions-row">
                  <button
                    type="button"
                    className="q-photo-crop-sub-btn"
                    onClick={handleReset}
                    title="Reset position and zoom"
                  >
                    <RotateCcw size={14} />
                    <span>Reset adjustments</span>
                  </button>

                  <button
                    type="button"
                    className="q-photo-crop-sub-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Choose a different image"
                  >
                    <Upload size={14} />
                    <span>Choose another photo</span>
                  </button>
                </div>
              </div>

              {/* Timeline Post Details: Audience & Caption */}
              <div className="q-photo-crop-post-section">
                <div className="q-photo-crop-post-header-row">
                  <span className="q-photo-crop-post-heading">Post to Timeline</span>
                  <div className="q-photo-crop-audience-wrap" ref={audienceRef}>
                    <button
                      type="button"
                      className="q-photo-crop-audience-trigger"
                      onClick={() => setAudienceOpen((prev) => !prev)}
                      aria-haspopup="listbox"
                      aria-expanded={audienceOpen}
                      title="Select who can see this profile update post"
                    >
                      <selectedAudience.Icon size={13} className="q-photo-crop-audience-icon" />
                      <span>{selectedAudience.label}</span>
                      <ChevronDown size={13} className={`q-photo-crop-chevron ${audienceOpen ? 'is-open' : ''}`} />
                    </button>
                    {audienceOpen && (
                      <div className="q-photo-crop-audience-popover" role="listbox">
                        {AUDIENCE_OPTIONS.map((opt) => {
                          const OptIcon = opt.Icon
                          const isSelected = visibility === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`q-photo-crop-audience-item ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => {
                                setVisibility(opt.value)
                                setAudienceOpen(false)
                              }}
                            >
                              <span className="q-photo-crop-audience-icon-badge">
                                <OptIcon size={14} />
                              </span>
                              <div className="q-photo-crop-audience-text">
                                <span className="q-photo-crop-audience-name">{opt.label}</span>
                                <span className="q-photo-crop-audience-desc">{opt.description}</span>
                              </div>
                              {isSelected && <Check size={14} className="q-photo-crop-audience-check" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="q-photo-crop-caption-wrap">
                  <textarea
                    className="q-photo-crop-caption-input"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, 1000))}
                    placeholder="Write an optional caption for your profile picture update..."
                    rows={2}
                    maxLength={1000}
                  />
                  <div className="q-photo-crop-caption-meta">
                    <span className="q-photo-crop-char-count">{caption.length}/1,000</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Modal Footer */}
        <div className="q-photo-crop-footer">
          <button
            type="button"
            className="q-photo-crop-btn q-photo-crop-btn--secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          {imageSrc && (
            <button
              type="button"
              className="q-photo-crop-btn q-photo-crop-btn--preview"
              onClick={handleTogglePreview}
              disabled={loading || generatingPreview}
            >
              {generatingPreview ? (
                <>
                  <LoaderCircle size={15} className="q-photo-crop-spinner" />
                  <span>Preparing preview...</span>
                </>
              ) : (
                <>
                  <Eye size={15} />
                  <span>{previewMode ? 'Back to Crop' : 'Preview Result'}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className="q-photo-crop-btn q-photo-crop-btn--primary"
            onClick={handleSave}
            disabled={loading || !imageSrc}
          >
            {loading ? (
              <>
                <LoaderCircle size={16} className="q-photo-crop-spinner" />
                <span>Saving &amp; Posting...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Save Profile Picture</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
