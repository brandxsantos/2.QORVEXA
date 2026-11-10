import { useState, useRef, useEffect } from 'react'
import { Camera, RefreshCw, X, Send, Users, Star, AlertCircle, LoaderCircle } from 'lucide-react'
import { sendInstant } from '../../lib/instants.js'
import './Instants.css'

function describeCameraError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Please allow camera access in your browser settings.'
  }
  if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
    return 'No camera found on this device.'
  }
  if (err?.name === 'NotReadableError') {
    return 'The camera is already in use by another app or tab.'
  }
  return err?.message || 'Unable to open camera.'
}

export default function InstantCameraModal({ isOpen, onClose, onInstantSent, user }) {
  const [facingMode, setFacingMode] = useState('environment') // 'user' | 'environment'
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [audienceType, setAudienceType] = useState('friends') // 'friends' | 'close_friends'
  const [cameraError, setCameraError] = useState('')
  const [sending, setSending] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const videoRef = useRef(null)
  // The live stream is kept in a ref (not state) so that starting/stopping the
  // camera never changes callback identities and never re-triggers the effect.
  const streamRef = useRef(null)

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }

  // Start the camera exactly once per (open, facing mode, live-view, retry) combination.
  useEffect(() => {
    if (!isOpen || capturedBlob) return undefined

    let cancelled = false

    async function start() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported in this browser. A secure (HTTPS) connection is required.')
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false,
        })
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = mediaStream
        setCameraError('')
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          videoRef.current.play?.().catch?.(() => {})
        }
      } catch (err) {
        if (!cancelled) setCameraError(describeCameraError(err))
      }
    }

    start()

    return () => {
      cancelled = true
      stopStream()
    }
  }, [isOpen, facingMode, capturedBlob, retryKey])

  // Release the preview object URL when it is replaced or the modal unmounts.
  useEffect(() => {
    if (!previewUrl) return undefined
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function resetState() {
    stopStream()
    setCapturedBlob(null)
    setPreviewUrl('')
    setCaption('')
    setCameraError('')
    setSending(false)
  }

  function handleClose() {
    resetState()
    onClose()
  }

  function handleFlipCamera() {
    setFacingMode((mode) => (mode === 'user' ? 'environment' : 'user'))
  }

  function handleCapture() {
    const video = videoRef.current
    if (!video || !streamRef.current || !video.videoWidth) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob((blob) => {
      if (!blob) return
      stopStream()
      setCapturedBlob(blob)
      setPreviewUrl(URL.createObjectURL(blob))
    }, 'image/jpeg', 0.85)
  }

  function handleRetake() {
    setCapturedBlob(null) // effect restarts the camera
    setPreviewUrl('')
    setCameraError('')
  }

  async function handleSend() {
    if (!capturedBlob || !user?.id || sending) return
    setSending(true)
    setCameraError('')
    try {
      await sendInstant({ imageBlob: capturedBlob, caption, audienceType, userId: user.id })
      if (onInstantSent) onInstantSent()
      handleClose()
    } catch (err) {
      setCameraError(err.message || 'Failed to send Instant.')
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="instant-camera-overlay">
      <div className="instant-camera-top-bar">
        <button type="button" className="instant-icon-btn" onClick={handleClose} aria-label="Close camera">
          <X size={20} />
        </button>
        <div className="instant-camera-title">
          <Camera size={18} color="#06b6d4" />
          <span>QORVEXA INSTANT</span>
        </div>
        {!capturedBlob ? (
          <button
            type="button"
            className="instant-flip-btn"
            onClick={handleFlipCamera}
            aria-label="Flip camera"
            title="Switch camera"
          >
            <RefreshCw size={18} />
          </button>
        ) : (
          <div style={{ width: 48 }} />
        )}
      </div>

      <div className="instant-camera-viewport">
        {cameraError && (
          <div style={{ position: 'absolute', padding: 24, textAlign: 'center', maxWidth: 360, zIndex: 30 }}>
            <AlertCircle size={40} color="#ef4444" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ color: '#ffffff', fontSize: '0.95rem', marginBottom: 16 }}>{cameraError}</p>
            {!capturedBlob && (
              <button type="button" className="instant-retake-btn" onClick={() => setRetryKey((key) => key + 1)}>
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
          <img src={previewUrl} alt="Instant capture preview" className="instant-camera-preview-img" />
        )}

        {capturedBlob && (
          <div className="instant-preview-panel">
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
                <Star
                  size={15}
                  color={audienceType === 'close_friends' ? '#ffffff' : '#10b981'}
                  fill={audienceType === 'close_friends' ? '#ffffff' : 'none'}
                />
                <span>Close Friends</span>
              </button>
            </div>

            <div className="instant-preview-actions">
              <button type="button" className="instant-retake-btn" onClick={handleRetake} disabled={sending}>
                Retake
              </button>
              <button type="button" className="instant-send-btn" onClick={handleSend} disabled={sending}>
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

      {!capturedBlob && (
        <div className="instant-camera-controls">
          <div style={{ width: 48 }} />
          <button type="button" className="instant-shutter-btn" onClick={handleCapture} aria-label="Capture photo">
            <div className="instant-shutter-inner" />
          </button>
          <div style={{ width: 48 }} />
        </div>
      )}
    </div>
  )
}
