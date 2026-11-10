import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, RefreshCw, X, Send, Users, Star, AlertCircle, LoaderCircle } from 'lucide-react'
import { sendInstant } from '../../lib/instants.js'
import './Instants.css'

export default function InstantCameraModal({ isOpen, onClose, onInstantSent, user }) {
  const [stream, setStream] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' or 'environment'
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [audienceType, setAudienceType] = useState('friends') // 'friends' | 'close_friends'
  const [cameraError, setCameraError] = useState('')
  const [sending, setSending] = useState(false)

  const videoRef = useRef(null)

  const stopCameraStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
  }, [stream])

  const startCamera = useCallback(async (mode) => {
    stopCameraStream()
    setCameraError('')
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported in this browser or context.')
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      })

      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device.')
      } else {
        setCameraError(err.message || 'Unable to open camera.')
      }
    }
  }, [stopCameraStream])

  // Lifecycle when modal opens / closes
  useEffect(() => {
    if (isOpen && !capturedBlob) {
      startCamera(facingMode)
    } else if (!isOpen) {
      stopCameraStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setCapturedBlob(null)
      setPreviewUrl('')
      setCaption('')
      setCameraError('')
      setSending(false)
    }

    return () => {
      stopCameraStream()
    }
  }, [isOpen, facingMode, capturedBlob, startCamera, stopCameraStream, previewUrl])

  // Attach stream when video element mounts
  useEffect(() => {
    if (videoRef.current && stream && !capturedBlob) {
      videoRef.current.srcObject = stream
    }
  }, [stream, capturedBlob])

  const handleFlipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextMode)
    startCamera(nextMode)
  }

  const handleCapture = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const videoWidth = video.videoWidth || 1080
    const videoHeight = video.videoHeight || 1920

    const canvas = document.createElement('canvas')
    canvas.width = videoWidth
    canvas.height = videoHeight
    const ctx = canvas.getContext('2d')

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob((blob) => {
      if (blob) {
        stopCameraStream()
        setCapturedBlob(blob)
        setPreviewUrl(URL.createObjectURL(blob))
      }
    }, 'image/jpeg', 0.85)
  }

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setCapturedBlob(null)
    setPreviewUrl('')
    setCameraError('')
    startCamera(facingMode)
  }

  const handleSend = async () => {
    if (!capturedBlob || !user?.id || sending) return
    setSending(true)
    setCameraError('')
    try {
      await sendInstant({
        imageBlob: capturedBlob,
        caption,
        audienceType,
        userId: user.id,
      })

      if (onInstantSent) onInstantSent()
      onClose()
    } catch (err) {
      setCameraError(err.message || 'Failed to send Instant.')
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="instant-camera-overlay">
      {/* Top Bar */}
      <div className="instant-camera-top-bar">
        <button
          type="button"
          className="instant-icon-btn"
          onClick={onClose}
          aria-label="Close camera"
        >
          <X size={20} />
        </button>
        <div className="instant-camera-title">
          <Camera size={18} color="#06b6d4" />
          <span>QORVEXA INSTANT</span>
        </div>
        {!capturedBlob && (
          <button
            type="button"
            className="instant-flip-btn"
            onClick={handleFlipCamera}
            aria-label="Flip camera"
            title="Switch camera"
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>

      {/* Main Viewport */}
      <div className="instant-camera-viewport">
        {cameraError && (
          <div style={{ padding: 24, textAlign: 'center', maxWidth: 360, zIndex: 10 }}>
            <AlertCircle size={40} color="#ef4444" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ color: '#ffffff', fontSize: '0.95rem', marginBottom: 16 }}>{cameraError}</p>
            {!capturedBlob && (
              <button
                type="button"
                className="instant-retake-btn"
                onClick={() => startCamera(facingMode)}
              >
                Try Again
              </button>
            )}
          </div>
        )}

        {!capturedBlob ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`instant-camera-video ${facingMode === 'user' ? 'mirrored' : ''}`}
          />
        ) : (
          <img
            src={previewUrl}
            alt="Instant capture preview"
            className="instant-camera-preview-img"
          />
        )}

        {/* Preview and Send Panel */}
        {capturedBlob && (
          <div className="instant-preview-panel">
            {/* Caption Input */}
            <div className="instant-caption-input-wrapper">
              <textarea
                className="instant-caption-textarea"
                placeholder="Add an optional caption…"
                value={caption}
                maxLength={300}
                onChange={(e) => setCaption(e.target.value)}
                disabled={sending}
              />
              <span className="instant-char-counter">{caption.length}/300</span>
            </div>

            {/* Audience Selector */}
            <div className="instant-audience-selector">
              <button
                type="button"
                className={`instant-audience-pill ${audienceType === 'friends' ? 'is-active' : ''}`}
                onClick={() => setAudienceType('friends')}
                disabled={sending}
              >
                <Users size={15} />
                <span>Friends</span>
              </button>
              <button
                type="button"
                className={`instant-audience-pill is-close-friends ${audienceType === 'close_friends' ? 'is-active' : ''}`}
                onClick={() => setAudienceType('close_friends')}
                disabled={sending}
              >
                <Star size={15} color={audienceType === 'close_friends' ? '#ffffff' : '#10b981'} fill={audienceType === 'close_friends' ? '#ffffff' : 'none'} />
                <span>Close Friends</span>
              </button>
            </div>

            {/* Actions */}
            <div className="instant-preview-actions">
              <button
                type="button"
                className="instant-retake-btn"
                onClick={handleRetake}
                disabled={sending}
              >
                Retake
              </button>
              <button
                type="button"
                className="instant-send-btn"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin" />
                    <span>Sending…</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Send Instant</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Shutter Controls */}
      {!capturedBlob && (
        <div className="instant-camera-controls">
          <div style={{ width: 48 }} />
          <button
            type="button"
            className="instant-shutter-btn"
            onClick={handleCapture}
            aria-label="Capture photo"
          >
            <div className="instant-shutter-inner" />
          </button>
          <div style={{ width: 48 }} />
        </div>
      )}
    </div>
  )
}
