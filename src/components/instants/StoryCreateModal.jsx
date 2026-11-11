import { useState, useRef, useEffect } from 'react'
import { X, Image as ImageIcon, Camera, LoaderCircle, Star, Users, Check, RefreshCw } from 'lucide-react'
import { createStory } from '../../lib/instants.js'
import './Instants.css'

export default function StoryCreateModal({ isOpen, onClose, onStoryPublished, user }) {
  const [mode, setMode] = useState('choose') // 'choose' | 'camera' | 'preview'
  const [imageBlob, setImageBlob] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [audienceType, setAudienceType] = useState('friends')
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  // Clean up object URL when closing or changing
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  // Stop camera when unmounting or switching away from camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setMode('choose')
      setImageBlob(null)
      setImagePreviewUrl('')
      setCaption('')
      setError('')
    }
  }, [isOpen])

  // Start camera mode
  const startCamera = async () => {
    setError('')
    setMode('camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      console.error('Camera error:', err)
      setError('Unable to access device camera. Please upload an image from gallery.')
      setMode('choose')
    }
  }

  // Snap photo from video
  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 720
    canvas.height = video.videoHeight || 1280
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob((blob) => {
      if (blob) {
        stopCamera()
        setImageBlob(blob)
        setImagePreviewUrl(URL.createObjectURL(blob))
        setMode('preview')
      }
    }, 'image/jpeg', 0.9)
  }

  // Handle gallery file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.')
      return
    }

    stopCamera()
    setImageBlob(file)
    setImagePreviewUrl(URL.createObjectURL(file))
    setMode('preview')
  }

  // Publish Story
  const handlePublish = async () => {
    if (!imageBlob || !user?.id || publishing) return
    setPublishing(true)
    setError('')

    try {
      await createStory({
        imageBlob,
        caption,
        audienceType,
        userId: user.id,
      })
      onStoryPublished?.()
      onClose?.()
    } catch (err) {
      console.error('Failed to publish story:', err)
      setError(err.message || 'Failed to publish story. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="instant-modal-overlay">
      <div className="instant-modal-card story-create-modal">
        {/* Modal Header */}
        <div className="instant-modal-header">
          <div>
            <h3>Add to Your Story</h3>
            <p>Share a 24-hour visual moment with your friends</p>
          </div>
          <button
            type="button"
            className="instant-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="story-modal-error">
            <span>{error}</span>
          </div>
        )}

        {/* 1. CHOOSE SOURCE MODE */}
        {mode === 'choose' && (
          <div className="story-choose-mode">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            <button
              type="button"
              className="story-source-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="story-source-icon story-source-icon--gallery">
                <ImageIcon size={28} />
              </div>
              <div>
                <strong>Choose from Gallery</strong>
                <p>Upload a photo from your device</p>
              </div>
            </button>

            <button
              type="button"
              className="story-source-btn"
              onClick={startCamera}
            >
              <div className="story-source-icon story-source-icon--camera">
                <Camera size={28} />
              </div>
              <div>
                <strong>Take a Photo</strong>
                <p>Use your camera to snap a new photo</p>
              </div>
            </button>
          </div>
        )}

        {/* 2. LIVE CAMERA MODE */}
        {mode === 'camera' && (
          <div className="story-camera-live">
            <div className="story-camera-viewport">
              <video ref={videoRef} playsInline autoPlay muted />
            </div>
            <div className="story-camera-actions">
              <button
                type="button"
                className="story-cancel-btn"
                onClick={() => {
                  stopCamera()
                  setMode('choose')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="story-capture-shutter-btn"
                onClick={capturePhoto}
                title="Capture photo"
              >
                <div className="story-capture-shutter-inner" />
              </button>
            </div>
          </div>
        )}

        {/* 3. PREVIEW & PUBLISH MODE */}
        {mode === 'preview' && (
          <div className="story-preview-mode">
            {/* Image Preview */}
            <div className="story-preview-container">
              <img src={imagePreviewUrl} alt="Story preview" />
              <button
                type="button"
                className="story-retake-action-btn"
                onClick={() => {
                  setImageBlob(null)
                  setImagePreviewUrl('')
                  setMode('choose')
                }}
                title="Choose another photo"
              >
                <RefreshCw size={14} />
                <span>Change Photo</span>
              </button>
            </div>

            {/* Caption Input */}
            <div className="story-form-field">
              <input
                type="text"
                placeholder="Add a caption… (optional)"
                value={caption}
                maxLength={300}
                onChange={(e) => setCaption(e.target.value)}
                className="story-caption-input"
              />
            </div>

            {/* Audience Picker */}
            <div className="story-audience-picker">
              <span className="story-audience-label">Share with:</span>
              <div className="story-audience-options">
                <button
                  type="button"
                  className={`story-audience-opt ${audienceType === 'friends' ? 'is-active' : ''}`}
                  onClick={() => setAudienceType('friends')}
                >
                  <Users size={14} />
                  <span>Friends</span>
                  {audienceType === 'friends' && <Check size={14} />}
                </button>
                <button
                  type="button"
                  className={`story-audience-opt story-audience-opt--cf ${audienceType === 'close_friends' ? 'is-active' : ''}`}
                  onClick={() => setAudienceType('close_friends')}
                >
                  <Star size={14} color="#10b981" />
                  <span>Close Friends</span>
                  {audienceType === 'close_friends' && <Check size={14} />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="story-publish-actions">
              <button
                type="button"
                className="story-cancel-btn"
                onClick={onClose}
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="story-publish-btn"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" />
                    <span>Publishing…</span>
                  </>
                ) : (
                  <span>Publish Story</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
