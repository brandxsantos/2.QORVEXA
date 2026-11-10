import { useState, useEffect, useCallback } from 'react'
import { X, Images, Film, FileText, Download, LoaderCircle, Inbox } from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase.js'
import { getSharedMediaGallery, formatFileSize, getFileExtension } from '../lib/messageAttachments.js'

export default function SharedMediaPanel({
  isOpen,
  onClose,
  conversationId,
  peerName = 'Friend',
  onOpenMedia = null,
  isFloating = false,
}) {
  const [activeTab, setActiveTab] = useState('photo') // 'photo' | 'video' | 'file'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadMedia = useCallback(async () => {
    if (!conversationId || !isOpen) return
    setLoading(true)
    setError('')
    try {
      const client = getSupabaseClient()
      const data = await getSharedMediaGallery(client, {
        conversationId,
        type: activeTab,
        limit: 100,
      })
      setItems(data || [])
    } catch (err) {
      console.warn('[SharedMediaPanel] Load error:', err.message)
      setError('Unable to load shared media.')
    } finally {
      setLoading(false)
    }
  }, [conversationId, isOpen, activeTab])

  useEffect(() => {
    loadMedia()
  }, [loadMedia])

  if (!isOpen) return null

  return (
    <aside className={`qv-shared-media-panel${isFloating ? ' is-floating' : ''}`} aria-label="Shared media">
      {/* Header */}
      <div className="qv-shared-media-header">
        <div className="qv-shared-media-title">
          <h3>Shared Media</h3>
          <span className="qv-shared-media-subtitle">{peerName}</span>
        </div>
        <button
          type="button"
          className="qv-shared-media-close"
          onClick={onClose}
          aria-label="Close shared media"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="qv-shared-media-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'photo'}
          className={`qv-shared-media-tab${activeTab === 'photo' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('photo')}
        >
          <Images size={15} />
          <span>Photos</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'video'}
          className={`qv-shared-media-tab${activeTab === 'video' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('video')}
        >
          <Film size={15} />
          <span>Videos</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'file'}
          className={`qv-shared-media-tab${activeTab === 'file' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          <FileText size={15} />
          <span>Files</span>
        </button>
      </div>

      {/* Body Content */}
      <div className="qv-shared-media-body">
        {loading ? (
          <div className="qv-shared-media-loading">
            <LoaderCircle size={22} className="animate-spin" />
            <span>Loading media…</span>
          </div>
        ) : error ? (
          <div className="qv-shared-media-empty">
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="qv-shared-media-empty">
            <Inbox size={28} />
            <h4>No shared {activeTab === 'photo' ? 'photos' : activeTab === 'video' ? 'videos' : 'files'}</h4>
            <p>Shared items will appear here.</p>
          </div>
        ) : activeTab === 'photo' ? (
          <div className="qv-shared-media-photo-grid">
            {items.map((item) => (
              <div
                key={item.id}
                className="qv-shared-photo-cell"
                onClick={() => onOpenMedia?.(item, items)}
                role="button"
                tabIndex={0}
              >
                <img src={item.signedUrl} alt={item.original_filename} loading="lazy" />
              </div>
            ))}
          </div>
        ) : activeTab === 'video' ? (
          <div className="qv-shared-media-video-grid">
            {items.map((item) => (
              <div
                key={item.id}
                className="qv-shared-video-cell"
                onClick={() => onOpenMedia?.(item, items)}
                role="button"
                tabIndex={0}
              >
                <video src={item.signedUrl} preload="metadata" />
                <div className="qv-shared-video-cell-overlay">
                  <span className="qv-shared-video-size">{formatFileSize(item.file_size)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="qv-shared-media-file-list">
            {items.map((file) => (
              <a
                key={file.id}
                href={file.signedUrl}
                download={file.original_filename}
                target="_blank"
                rel="noopener noreferrer"
                className="qv-shared-file-row"
              >
                <div className="qv-shared-file-icon">
                  <FileText size={18} />
                  <small>{getFileExtension(file.original_filename)}</small>
                </div>
                <div className="qv-shared-file-info">
                  <span className="qv-shared-file-name" title={file.original_filename}>
                    {file.original_filename}
                  </span>
                  <span className="qv-shared-file-meta">
                    {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="qv-shared-file-download">
                  <Download size={15} />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
