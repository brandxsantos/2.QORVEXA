import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Archive,
  Eye,
  Calendar,
  Sparkles,
  Trash2,
  Share2,
  LoaderCircle,
  AlertCircle,
  Users,
  ChevronLeft,
} from 'lucide-react'
import { fetchStoryArchive, deleteStory, repostStoryFromArchive } from '../../lib/stories.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'
import StoryThumbnail from './StoryThumbnail.jsx'
import './Instants.css'

function formatShortDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function StoryArchiveModal({ isOpen, onClose, user, onStoryReposted }) {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStory, setSelectedStory] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionFeedback, setActionFeedback] = useState('')

  const loadArchive = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchStoryArchive(user.id)
      setStories(data || [])
    } catch (err) {
      console.warn('Archive load error:', err)
      setError('Could not load your story archive.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (isOpen) {
      loadArchive()
      setSelectedStory(null)
      setActionFeedback('')
    }
  }, [isOpen, loadArchive])

  const handleDelete = async (storyId) => {
    if (!confirm('Are you sure you want to permanently delete this story from your archive?')) return
    setActionLoading(true)
    try {
      await deleteStory(storyId, user.id)
      setStories((prev) => prev.filter((s) => s.id !== storyId))
      setSelectedStory(null)
      setActionFeedback('Story deleted successfully.')
      setTimeout(() => setActionFeedback(''), 2500)
    } catch (err) {
      alert(err.message || 'Could not delete story.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRepost = async (story) => {
    setActionLoading(true)
    try {
      await repostStoryFromArchive({
        imagePath: story.image_path,
        caption: story.caption,
        audienceType: story.audience_type,
        userId: user.id,
      })
      setActionFeedback('Story reposted to your active stories for 24h!')
      onStoryReposted?.()
      setTimeout(() => {
        setActionFeedback('')
        onClose?.()
      }, 1200)
    } catch (err) {
      alert(err.message || 'Could not repost story.')
    } finally {
      setActionLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="story-archive-overlay" onClick={onClose}>
      <div
        className="story-archive-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-title"
      >
        {/* Header */}
        <div className="story-archive-header">
          <div className="story-archive-header-left">
            {selectedStory ? (
              <button
                type="button"
                className="story-archive-back-btn"
                onClick={() => setSelectedStory(null)}
                aria-label="Back to grid"
              >
                <ChevronLeft size={20} />
                <span>Archive</span>
              </button>
            ) : (
              <>
                <Archive size={20} className="story-archive-icon" />
                <h2 id="archive-title">Story Archive</h2>
              </>
            )}
          </div>

          <button
            type="button"
            className="story-studio-close"
            onClick={onClose}
            aria-label="Close archive"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div className="story-archive-feedback animate-fade-in">
            <Sparkles size={15} />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="story-archive-body">
          {loading ? (
            <div className="story-archive-loading">
              <LoaderCircle size={28} className="animate-spin" />
              <span>Loading archive…</span>
            </div>
          ) : error ? (
            <div className="story-archive-error">
              <AlertCircle size={24} />
              <p>{error}</p>
              <button type="button" onClick={loadArchive}>
                Retry
              </button>
            </div>
          ) : stories.length === 0 ? (
            <div className="story-archive-empty">
              <Archive size={36} />
              <h3>Your Archive is Empty</h3>
              <p>Stories you publish will automatically be preserved in your private archive.</p>
            </div>
          ) : selectedStory ? (
            /* Story Detail & Insights View */
            <div className="story-archive-detail">
              <div className="story-archive-preview-frame">
                <StoryThumbnail
                  imagePath={selectedStory.image_path}
                  alt="Archived story"
                  className="story-archive-full-img"
                />
              </div>

              <div className="story-archive-meta-panel">
                <div className="story-archive-meta-row">
                  <span className="story-archive-meta-date">
                    <Calendar size={14} />
                    {formatShortDate(selectedStory.created_at)}
                  </span>
                  <span className={`story-archive-status-tag ${selectedStory.is_expired ? 'is-expired' : 'is-active'}`}>
                    {selectedStory.is_expired ? 'Expired' : 'Active Story'}
                  </span>
                </div>

                {selectedStory.caption && (
                  <p className="story-archive-caption">"{selectedStory.caption}"</p>
                )}

                {/* Viewers Insight */}
                <div className="story-archive-viewers-box">
                  <div className="story-archive-viewers-count">
                    <Eye size={16} />
                    <strong>{selectedStory.view_count} views</strong>
                  </div>

                  {selectedStory.viewers?.length > 0 ? (
                    <div className="story-archive-viewers-chips">
                      {selectedStory.viewers.map((v) => (
                        <div key={v.id} className="story-viewer-chip" title={v.display_name}>
                          <div className="story-viewer-chip-avatar">
                            {v.avatar_url ? (
                              <ProtectedMediaImage
                                path={v.avatar_url}
                                alt={v.display_name}
                                fallback={<span>{(v.display_name[0] || '?').toUpperCase()}</span>}
                              />
                            ) : (
                              <span>{(v.display_name[0] || '?').toUpperCase()}</span>
                            )}
                          </div>
                          <span>{v.display_name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="story-archive-no-viewers">No recorded viewers.</span>
                  )}
                </div>

                {/* Action Buttons: Repost & Delete */}
                <div className="story-archive-actions">
                  <button
                    type="button"
                    className="story-archive-repost-btn"
                    onClick={() => handleRepost(selectedStory)}
                    disabled={actionLoading}
                  >
                    <Share2 size={16} />
                    <span>Repost (24h)</span>
                  </button>

                  <button
                    type="button"
                    className="story-archive-delete-btn"
                    onClick={() => handleDelete(selectedStory.id)}
                    disabled={actionLoading}
                    title="Delete permanently"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Grid View */
            <div className="story-archive-grid">
              {stories.map((story) => (
                <div
                  key={story.id}
                  className="story-archive-card"
                  onClick={() => setSelectedStory(story)}
                  role="button"
                  tabIndex={0}
                >
                  <StoryThumbnail
                    imagePath={story.image_path}
                    alt="Archived story thumbnail"
                    className="story-archive-card-thumb"
                  />
                  <div className="story-archive-card-gradient" />
                  <div className="story-archive-card-bottom">
                    <span className="story-archive-card-date">
                      {formatShortDate(story.created_at)}
                    </span>
                    <span className="story-archive-card-views">
                      <Eye size={12} /> {story.view_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
