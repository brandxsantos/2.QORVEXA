import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  Image as ImageIcon,
  Camera,
  Type,
  Sparkles,
  Pencil,
  RotateCw,
  FlipHorizontal,
  Plus,
  Trash2,
  Check,
  LoaderCircle,
  AlertCircle,
  Star,
  Users,
  Globe,
  Undo2,
  Smile,
  RefreshCw,
} from 'lucide-react'
import { createStory, publishBatchStories } from '../../lib/stories.js'
import './Instants.css'

const BG_PRESETS = [
  { id: 'sunset', name: 'Sunset', gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)' },
  { id: 'cyber', name: 'Cyber', gradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #9333ea 100%)' },
  { id: 'aurora', name: 'Aurora', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #0f766e 100%)' },
  { id: 'violet', name: 'Violet', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #ec4899 100%)' },
  { id: 'midnight', name: 'Midnight', gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
  { id: 'noir', name: 'Noir', gradient: '#090d16' },
]

const FONT_PRESETS = [
  { id: 'modern', name: 'Modern', fontFamily: 'system-ui, -apple-system, sans-serif' },
  { id: 'serif', name: 'Serif', fontFamily: 'Georgia, Cambria, serif' },
  { id: 'neon', name: 'Neon', fontFamily: '"Courier New", Courier, monospace' },
  { id: 'impact', name: 'Impact', fontFamily: 'Impact, Haettenschweiler, sans-serif' },
]

const STICKER_LIST = ['🔥', '❤️', '✨', '💯', '🎉', '🌟', '🍕', '🚀', '😎', '👑', '🌈', '👏']
const PEN_COLORS = ['#ffffff', '#00d9f5', '#facc15', '#f43f5e', '#10b981', '#a855f7']

export default function StoryStudioModal({
  isOpen,
  onClose,
  onStoryPublished,
  user,
  initialMode = 'choose', // 'choose' | 'camera' | 'gallery' | 'text'
}) {
  // studio mode: 'choose' | 'camera' | 'text' | 'editor'
  const [studioMode, setStudioMode] = useState('choose')

  // Multi-slide media support
  // Slide shape: { id, imageBlob, previewUrl, caption, rotation, flipped, isText, textConfig, drawings: [] }
  const [slides, setSlides] = useState([])
  const [activeSlideIdx, setActiveSlideIdx] = useState(0)

  // Camera state
  const [cameraFacing, setCameraFacing] = useState('user') // 'user' | 'environment'
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  // Text Story creator state
  const [textContent, setTextContent] = useState('')
  const [textBg, setTextBg] = useState(BG_PRESETS[0])
  const [textFont, setTextFont] = useState(FONT_PRESETS[0])
  const [textColor, setTextColor] = useState('#ffffff')
  const [textAlign, setTextAlign] = useState('center')

  // Creative overlays in Editor mode
  const [activeTool, setActiveTool] = useState('none') // 'none' | 'pen' | 'stickers'
  const [penColor, setPenColor] = useState('#00d9f5')
  const [penSize, setPenSize] = useState(6)
  const [stickersOnSlide, setStickersOnSlide] = useState([]) // [{ id, emoji, x, y }]

  // Canvas drawing state
  const drawCanvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawHistory, setDrawHistory] = useState([])

  // Publishing state
  const [audienceType, setAudienceType] = useState('friends') // 'friends' | 'close_friends' | 'public'
  const [captionInput, setCaptionInput] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishProgress, setPublishProgress] = useState(null) // { current, total, percent }
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)

  // Clean up object URLs when closing
  const cleanupSlides = useCallback(() => {
    slides.forEach((s) => {
      if (s.previewUrl && !s.previewUrl.startsWith('data:')) {
        URL.revokeObjectURL(s.previewUrl)
      }
    })
    setSlides([])
    setActiveSlideIdx(0)
    setStickersOnSlide([])
    setDrawHistory([])
  }, [slides])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  // Handle open/close and initial mode
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      cleanupSlides()
      setStudioMode('choose')
      setError('')
      setPublishing(false)
      setPublishProgress(null)
      setActiveTool('none')
    } else {
      setError('')
      if (initialMode === 'camera') {
        startCamera('user')
      } else if (initialMode === 'gallery') {
        setStudioMode('choose')
        setTimeout(() => fileInputRef.current?.click(), 80)
      } else if (initialMode === 'text') {
        setStudioMode('text')
      } else {
        setStudioMode('choose')
      }
    }
  }, [isOpen, initialMode, stopCamera, cleanupSlides])

  // Camera Management
  const startCamera = async (facing = 'user') => {
    stopCamera()
    setError('')
    setStudioMode('camera')
    setCameraFacing(facing)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      console.warn('Camera access failed:', err)
      setError('Unable to access device camera. Please upload photos from your gallery.')
      setStudioMode('choose')
    }
  }

  const flipCamera = () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user'
    startCamera(nextFacing)
  }

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
        const newSlide = {
          id: crypto.randomUUID(),
          imageBlob: blob,
          previewUrl: URL.createObjectURL(blob),
          caption: '',
          rotation: 0,
          flipped: false,
          isText: false,
        }
        setSlides([newSlide])
        setActiveSlideIdx(0)
        setStudioMode('editor')
      }
    }, 'image/jpeg', 0.92)
  }

  // Gallery File Selection (Supports multiple photos!)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const validFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!validFiles.length) {
      setError('Please select valid image files (JPG, PNG, WebP).')
      return
    }

    const newSlides = validFiles.map((file) => ({
      id: crypto.randomUUID(),
      imageBlob: file,
      previewUrl: URL.createObjectURL(file),
      caption: '',
      rotation: 0,
      flipped: false,
      isText: false,
    }))

    setSlides((prev) => [...prev, ...newSlides])
    setActiveSlideIdx(slides.length)
    setStudioMode('editor')
    e.target.value = ''
  }

  // Render Text Story to High-Res Canvas Image Blob
  const renderTextStoryToBlob = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')

    // 1. Draw Background
    if (textBg.gradient.startsWith('linear-gradient')) {
      const grad = ctx.createLinearGradient(0, 0, 1080, 1920)
      if (textBg.id === 'sunset') {
        grad.addColorStop(0, '#f43f5e')
        grad.addColorStop(1, '#fb923c')
      } else if (textBg.id === 'cyber') {
        grad.addColorStop(0, '#06b6d4')
        grad.addColorStop(0.5, '#3b82f6')
        grad.addColorStop(1, '#9333ea')
      } else if (textBg.id === 'aurora') {
        grad.addColorStop(0, '#10b981')
        grad.addColorStop(0.5, '#059669')
        grad.addColorStop(1, '#0f766e')
      } else if (textBg.id === 'violet') {
        grad.addColorStop(0, '#8b5cf6')
        grad.addColorStop(0.5, '#d946ef')
        grad.addColorStop(1, '#ec4899')
      } else {
        grad.addColorStop(0, '#1e293b')
        grad.addColorStop(1, '#0f172a')
      }
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = textBg.gradient
    }
    ctx.fillRect(0, 0, 1080, 1920)

    // 2. Draw Subtle Radial Vignette
    const vignette = ctx.createRadialGradient(540, 960, 200, 540, 960, 960)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, 1080, 1920)

    // 3. Draw Story Typography
    ctx.fillStyle = textColor
    ctx.textAlign = textAlign
    ctx.textBaseline = 'middle'

    const fontSize = 68
    ctx.font = `bold ${fontSize}px ${textFont.fontFamily}`

    // Word wrap text
    const maxWidth = 880
    const words = (textContent.trim() || 'Tap to edit story').split(' ')
    const lines = []
    let currentLine = words[0] || ''

    for (let i = 1; i < words.length; i++) {
      const word = words[i]
      const width = ctx.measureText(currentLine + ' ' + word).width
      if (width < maxWidth) {
        currentLine += ' ' + word
      } else {
        lines.push(currentLine)
        currentLine = word
      }
    }
    lines.push(currentLine)

    const lineHeight = fontSize * 1.35
    const totalBlockHeight = lines.length * lineHeight
    let startY = (1920 - totalBlockHeight) / 2 + lineHeight / 2

    const startX = textAlign === 'center' ? 540 : textAlign === 'left' ? 100 : 980

    lines.forEach((line) => {
      // Glow shadow for neon/modern
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
      ctx.shadowBlur = 16
      ctx.fillText(line, startX, startY)
      startY += lineHeight
    })

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob)
      }, 'image/jpeg', 0.92)
    })
  }

  const handleFinishTextStory = async () => {
    if (!textContent.trim()) {
      setError('Please enter some text for your story.')
      return
    }
    const blob = await renderTextStoryToBlob()
    const newSlide = {
      id: crypto.randomUUID(),
      imageBlob: blob,
      previewUrl: URL.createObjectURL(blob),
      caption: '',
      rotation: 0,
      flipped: false,
      isText: true,
      textConfig: { text: textContent, bg: textBg.id, font: textFont.id },
    }
    setSlides([newSlide])
    setActiveSlideIdx(0)
    setStudioMode('editor')
  }

  // Active slide helpers
  const currentSlide = slides[activeSlideIdx] || null

  const handleRotateCurrent = () => {
    if (!currentSlide) return
    setSlides((prev) =>
      prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, rotation: (s.rotation + 90) % 360 } : s))
    )
  }

  const handleFlipCurrent = () => {
    if (!currentSlide) return
    setSlides((prev) =>
      prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, flipped: !s.flipped } : s))
    )
  }

  const handleDeleteCurrentSlide = () => {
    if (!slides.length) return
    const nextSlides = slides.filter((_, idx) => idx !== activeSlideIdx)
    if (!nextSlides.length) {
      setSlides([])
      setStudioMode('choose')
    } else {
      setSlides(nextSlides)
      setActiveSlideIdx(Math.max(0, activeSlideIdx - 1))
    }
  }

  // Add Sticker to current slide
  const handleAddSticker = (emoji) => {
    setStickersOnSlide((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        emoji,
        slideIdx: activeSlideIdx,
        x: 45 + Math.random() * 10,
        y: 40 + Math.random() * 20,
      },
    ])
    setActiveTool('none')
  }

  // Canvas Drawing Handlers
  const startDrawing = (e) => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = penColor
    ctx.lineWidth = penSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    setIsDrawing(true)
  }

  const drawMove = (e) => {
    if (!isDrawing) return
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const ctx = canvas.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = drawCanvasRef.current
    if (canvas) {
      setDrawHistory((prev) => [...prev, canvas.toDataURL()])
    }
  }

  const clearDrawing = () => {
    const canvas = drawCanvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setDrawHistory([])
    }
  }

  // Merge Overlays (Drawings + Stickers + Rotation) before publishing
  const bakeFinalSlideBlob = async (slide, slideIndex) => {
    // If no adjustments, return original imageBlob
    const currentDrawCanvas = drawCanvasRef.current
    const slideStickers = stickersOnSlide.filter((s) => s.slideIdx === slideIndex)

    if (slide.rotation === 0 && !slide.flipped && !slideStickers.length && !drawHistory.length) {
      return slide.imageBlob
    }

    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const isRotated90 = slide.rotation === 90 || slide.rotation === 270
        canvas.width = isRotated90 ? img.height : img.width
        canvas.height = isRotated90 ? img.width : img.height

        const ctx = canvas.getContext('2d')
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((slide.rotation * Math.PI) / 180)
        ctx.scale(slide.flipped ? -1 : 1, 1)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)
        ctx.setTransform(1, 0, 0, 1, 0, 0) // reset transform

        // Render drawings if active slide
        if (slideIndex === activeSlideIdx && currentDrawCanvas) {
          ctx.drawImage(currentDrawCanvas, 0, 0, canvas.width, canvas.height)
        }

        // Render stickers
        slideStickers.forEach((st) => {
          ctx.font = '64px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const posX = (st.x / 100) * canvas.width
          const posY = (st.y / 100) * canvas.height
          ctx.fillText(st.emoji, posX, posY)
        })

        canvas.toBlob((blob) => {
          resolve(blob || slide.imageBlob)
        }, 'image/jpeg', 0.92)
      }
      img.onerror = () => resolve(slide.imageBlob)
      img.src = slide.previewUrl
    })
  }

  // Publish Story or Batch Slides
  const handlePublish = async () => {
    if (!slides.length || publishing || !user?.id) return
    setPublishing(true)
    setError('')

    try {
      const bakedSlides = []
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        const finalBlob = await bakeFinalSlideBlob(slide, i)
        bakedSlides.push({
          imageBlob: finalBlob,
          caption: i === activeSlideIdx ? captionInput.trim() : slide.caption || '',
          audienceType,
        })
      }

      await publishBatchStories({
        slides: bakedSlides,
        userId: user.id,
        onProgress: (prog) => setPublishProgress(prog),
      })

      // Clean up & trigger parent refresh
      onStoryPublished?.()
      setTimeout(() => {
        onClose?.()
      }, 500)
    } catch (err) {
      console.error('Publish error:', err)
      setError(err.message || 'Failed to publish stories. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="story-studio-overlay" onClick={onClose}>
      <div
        className="story-studio-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-title"
      >
        {/* Hidden File Input for Gallery */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* ============================================================== */}
        {/* MODE 1: CHOOSE CREATION TYPE */}
        {/* ============================================================== */}
        {studioMode === 'choose' && (
          <div className="story-studio-choose">
            <div className="story-studio-topbar">
              <span className="story-studio-badge">
                <Sparkles size={14} /> Story Studio
              </span>
              <button type="button" className="story-studio-close" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="story-studio-welcome">
              <h2 id="studio-title">Create a Story</h2>
              <p>Share photos, text, or moments with your friends for 24 hours.</p>
            </div>

            <div className="story-studio-options-grid">
              <button
                type="button"
                className="story-studio-opt-btn"
                onClick={() => startCamera('user')}
              >
                <div className="story-studio-opt-icon story-studio-opt-camera">
                  <Camera size={28} />
                </div>
                <strong>Camera</strong>
                <span>Snap live photo</span>
              </button>

              <button
                type="button"
                className="story-studio-opt-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="story-studio-opt-icon story-studio-opt-gallery">
                  <ImageIcon size={28} />
                </div>
                <strong>Photo Gallery</strong>
                <span>Upload single or multiple</span>
              </button>

              <button
                type="button"
                className="story-studio-opt-btn"
                onClick={() => setStudioMode('text')}
              >
                <div className="story-studio-opt-icon story-studio-opt-text">
                  <Type size={28} />
                </div>
                <strong>Text Story</strong>
                <span>Typography & gradients</span>
              </button>
            </div>

            {error && (
              <div className="story-studio-error animate-fade-in">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* MODE 2: LIVE CAMERA VIEW */}
        {/* ============================================================== */}
        {studioMode === 'camera' && (
          <div className="story-studio-camera-view">
            <div className="story-camera-topbar">
              <button
                type="button"
                className="story-studio-icon-btn"
                onClick={() => {
                  stopCamera()
                  setStudioMode('choose')
                }}
                aria-label="Back"
              >
                <X size={20} />
              </button>

              <span className="story-camera-title">Live Camera</span>

              <button
                type="button"
                className="story-studio-icon-btn"
                onClick={flipCamera}
                title="Flip Camera"
                aria-label="Flip Camera"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            <div className="story-camera-viewport">
              <video ref={videoRef} autoPlay playsInline muted className="story-camera-video" />
            </div>

            <div className="story-camera-bottombar">
              <button
                type="button"
                className="story-shutter-btn"
                onClick={capturePhoto}
                title="Capture photo"
                aria-label="Capture photo"
              >
                <div className="story-shutter-inner" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODE 3: TEXT STORY CREATOR */}
        {/* ============================================================== */}
        {studioMode === 'text' && (
          <div className="story-studio-text-creator">
            <div className="story-text-topbar">
              <button
                type="button"
                className="story-studio-icon-btn"
                onClick={() => setStudioMode('choose')}
              >
                <X size={20} />
              </button>

              <div className="story-font-selector">
                {FONT_PRESETS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`story-font-btn ${textFont.id === f.id ? 'is-active' : ''}`}
                    onClick={() => setTextFont(f)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="story-text-done-btn"
                onClick={handleFinishTextStory}
              >
                Next
              </button>
            </div>

            {/* Live Text Canvas Preview */}
            <div
              className="story-text-canvas"
              style={{ background: textBg.gradient }}
            >
              <textarea
                className="story-text-input"
                style={{
                  fontFamily: textFont.fontFamily,
                  color: textColor,
                  textAlign,
                }}
                placeholder="Type your story here…"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                maxLength={400}
                autoFocus
              />
            </div>

            {/* Gradient Background Swatches */}
            <div className="story-text-bottom-controls">
              <div className="story-bg-swatches">
                {BG_PRESETS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    className={`story-bg-swatch ${textBg.id === bg.id ? 'is-active' : ''}`}
                    style={{ background: bg.gradient }}
                    onClick={() => setTextBg(bg)}
                    title={bg.name}
                  />
                ))}
              </div>

              <div className="story-text-alignment-row">
                {['left', 'center', 'right'].map((align) => (
                  <button
                    key={align}
                    type="button"
                    className={`story-align-btn ${textAlign === align ? 'is-active' : ''}`}
                    onClick={() => setTextAlign(align)}
                  >
                    {align.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODE 4: FULL STUDIO EDITOR & MULTI-SLIDE PUBLISHER */}
        {/* ============================================================== */}
        {studioMode === 'editor' && currentSlide && (
          <div className="story-studio-editor">
            {/* Top Toolbar */}
            <div className="story-editor-topbar">
              <button
                type="button"
                className="story-studio-icon-btn"
                onClick={() => {
                  cleanupSlides()
                  setStudioMode('choose')
                }}
                aria-label="Discard story"
              >
                <X size={20} />
              </button>

              <div className="story-editor-tools">
                <button
                  type="button"
                  className={`story-tool-btn ${activeTool === 'pen' ? 'is-active' : ''}`}
                  onClick={() => setActiveTool(activeTool === 'pen' ? 'none' : 'pen')}
                  title="Draw on Story"
                >
                  <Pencil size={17} />
                </button>

                <button
                  type="button"
                  className={`story-tool-btn ${activeTool === 'stickers' ? 'is-active' : ''}`}
                  onClick={() => setActiveTool(activeTool === 'stickers' ? 'none' : 'stickers')}
                  title="Add Stickers"
                >
                  <Smile size={17} />
                </button>

                <button
                  type="button"
                  className="story-tool-btn"
                  onClick={handleRotateCurrent}
                  title="Rotate 90°"
                >
                  <RotateCw size={17} />
                </button>

                <button
                  type="button"
                  className="story-tool-btn"
                  onClick={handleFlipCurrent}
                  title="Flip Horizontal"
                >
                  <FlipHorizontal size={17} />
                </button>

                {slides.length > 1 && (
                  <button
                    type="button"
                    className="story-tool-btn story-tool-delete"
                    onClick={handleDeleteCurrentSlide}
                    title="Delete this slide"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Draw Palette (Visible when pen is active) */}
            {activeTool === 'pen' && (
              <div className="story-pen-palette animate-fade-in">
                <div className="story-pen-colors">
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`story-pen-color-dot ${penColor === c ? 'is-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setPenColor(c)}
                    />
                  ))}
                </div>
                <div className="story-pen-sizes">
                  {[3, 7, 14].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`story-pen-size-btn ${penSize === s ? 'is-active' : ''}`}
                      onClick={() => setPenSize(s)}
                    >
                      <span style={{ width: s * 1.5, height: s * 1.5, borderRadius: '50%', background: '#fff' }} />
                    </button>
                  ))}
                </div>
                <button type="button" className="story-pen-clear-btn" onClick={clearDrawing}>
                  Clear
                </button>
              </div>
            )}

            {/* Sticker Drawer (Visible when stickers are active) */}
            {activeTool === 'stickers' && (
              <div className="story-stickers-tray animate-fade-in">
                {STICKER_LIST.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="story-sticker-item"
                    onClick={() => handleAddSticker(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Preview & Drawing Canvas Area */}
            <div className="story-editor-canvas-stage">
              <div
                className="story-editor-media-container"
                style={{
                  transform: `rotate(${currentSlide.rotation}deg) scaleX(${currentSlide.flipped ? -1 : 1})`,
                }}
              >
                <img
                  src={currentSlide.previewUrl}
                  alt="Story preview"
                  className="story-editor-img"
                  onDragStart={(e) => e.preventDefault()}
                />
              </div>

              {/* HTML5 Canvas overlay for drawing */}
              <canvas
                ref={drawCanvasRef}
                className={`story-drawing-canvas ${activeTool === 'pen' ? 'is-active' : ''}`}
                width={720}
                height={1280}
                onMouseDown={startDrawing}
                onMouseMove={drawMove}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={drawMove}
                onTouchEnd={endDrawing}
              />

              {/* Render placed stickers */}
              {stickersOnSlide
                .filter((st) => st.slideIdx === activeSlideIdx)
                .map((st) => (
                  <div
                    key={st.id}
                    className="story-placed-sticker"
                    style={{ left: `${st.x}%`, top: `${st.y}%` }}
                  >
                    {st.emoji}
                  </div>
                ))}
            </div>

            {/* Multi-Slide Carousel Strip (If > 1 slide or add more) */}
            <div className="story-editor-slide-strip">
              {slides.map((s, idx) => (
                <div
                  key={s.id}
                  className={`story-strip-thumbnail ${idx === activeSlideIdx ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveSlideIdx(idx)
                    setCaptionInput(s.caption || '')
                  }}
                >
                  <img src={s.previewUrl} alt={`Slide ${idx + 1}`} />
                  <span className="story-strip-badge">{idx + 1}</span>
                </div>
              ))}

              {/* Add more button */}
              <button
                type="button"
                className="story-strip-add-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Add another photo"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Publishing Settings & Actions */}
            <div className="story-editor-footer">
              <div className="story-editor-caption-row">
                <input
                  type="text"
                  className="story-caption-input"
                  placeholder="Add a caption to this moment…"
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  maxLength={180}
                  disabled={publishing}
                />
              </div>

              <div className="story-publish-controls">
                {/* Audience Selector */}
                <div className="story-audience-pills">
                  <button
                    type="button"
                    className={`story-audience-pill ${audienceType === 'friends' ? 'is-active' : ''}`}
                    onClick={() => setAudienceType('friends')}
                    disabled={publishing}
                  >
                    <Users size={14} />
                    <span>Friends</span>
                  </button>

                  <button
                    type="button"
                    className={`story-audience-pill is-close-friends ${
                      audienceType === 'close_friends' ? 'is-active' : ''
                    }`}
                    onClick={() => setAudienceType('close_friends')}
                    disabled={publishing}
                  >
                    <Star size={14} />
                    <span>Close Friends</span>
                  </button>

                  <button
                    type="button"
                    className={`story-audience-pill ${audienceType === 'public' ? 'is-active' : ''}`}
                    onClick={() => setAudienceType('public')}
                    disabled={publishing}
                  >
                    <Globe size={14} />
                    <span>Public</span>
                  </button>
                </div>

                {/* Publish Button */}
                <button
                  type="button"
                  className="story-publish-action-btn"
                  onClick={handlePublish}
                  disabled={publishing}
                >
                  {publishing ? (
                    <>
                      <LoaderCircle size={16} className="animate-spin" />
                      <span>
                        {publishProgress
                          ? `Publishing ${publishProgress.current}/${publishProgress.total}…`
                          : 'Publishing…'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>{slides.length > 1 ? `Share ${slides.length} Stories` : 'Share Story'}</span>
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="story-studio-error animate-fade-in">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
