import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'

export default function MediaLightboxModal({
  isOpen,
  onClose,
  initialMedia,
  mediaList = [],
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [zoomLevel, setZoomLevel] = useState(1)

  useEffect(() => {
    if (initialMedia && mediaList.length > 0) {
      const idx = mediaList.findIndex((m) => m.id === initialMedia.id)
      setCurrentIndex(idx >= 0 ? idx : 0)
    } else {
      setCurrentIndex(0)
    }
    setZoomLevel(1)
  }, [initialMedia, mediaList, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1))
      if (e.key === 'ArrowRight') setCurrentIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, mediaList.length, onClose])

  if (!isOpen) return null

  const activeMedia = mediaList[currentIndex] || initialMedia
  if (!activeMedia) return null

  const isVideo = activeMedia.attachment_type === 'video'
  const hasMultiple = mediaList.length > 1

  const handlePrev = (e) => {
    e?.stopPropagation()
    setZoomLevel(1)
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1))
  }

  const handleNext = (e) => {
    e?.stopPropagation()
    setZoomLevel(1)
    setCurrentIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0))
  }

  const toggleZoom = (e) => {
    e?.stopPropagation()
    setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : 1))
  }

  return createPortal(
    <div className="qv-lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      {/* Top Bar Controls */}
      <div className="qv-lightbox-top-bar" onClick={(e) => e.stopPropagation()}>
        <div className="qv-lightbox-info">
          <span className="qv-lightbox-filename" title={activeMedia.original_filename}>
            {activeMedia.original_filename}
          </span>
          {hasMultiple && (
            <span className="qv-lightbox-counter">
              {currentIndex + 1} / {mediaList.length}
            </span>
          )}
        </div>

        <div className="qv-lightbox-actions">
          {!isVideo && (
            <button
              type="button"
              className="qv-lightbox-btn"
              onClick={toggleZoom}
              title={zoomLevel > 1 ? 'Zoom Out' : 'Zoom In'}
              aria-label="Zoom image"
            >
              {zoomLevel > 1 ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
            </button>
          )}

          <a
            href={activeMedia.signedUrl}
            download={activeMedia.original_filename}
            target="_blank"
            rel="noopener noreferrer"
            className="qv-lightbox-btn"
            title="Download"
            aria-label="Download media"
          >
            <Download size={18} />
          </a>

          <button
            type="button"
            className="qv-lightbox-btn qv-lightbox-btn--close"
            onClick={onClose}
            title="Close"
            aria-label="Close viewer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Media Content */}
      <div className="qv-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video
            key={activeMedia.id}
            src={activeMedia.signedUrl}
            controls
            autoPlay
            playsInline
            className="qv-lightbox-video"
          />
        ) : (
          <div
            className="qv-lightbox-image-wrap"
            style={{
              transform: `scale(${zoomLevel})`,
              cursor: zoomLevel > 1 ? 'zoom-out' : 'zoom-in',
            }}
            onClick={toggleZoom}
          >
            <img
              src={activeMedia.signedUrl}
              alt={activeMedia.original_filename}
              className="qv-lightbox-image"
            />
          </div>
        )}
      </div>

      {/* Multi-item arrows */}
      {hasMultiple && (
        <>
          <button
            type="button"
            className="qv-lightbox-arrow qv-lightbox-arrow--prev"
            onClick={handlePrev}
            aria-label="Previous item"
          >
            <ChevronLeft size={30} />
          </button>
          <button
            type="button"
            className="qv-lightbox-arrow qv-lightbox-arrow--next"
            onClick={handleNext}
            aria-label="Next item"
          >
            <ChevronRight size={30} />
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
