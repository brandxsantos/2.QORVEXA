import { useEffect, useState } from 'react'
import { ArrowUp, ImagePlus, LoaderCircle } from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase.js'

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const maxImageBytes = 8 * 1024 * 1024
const postSelection = 'id, author_id, content, media_path, media_type, post_visibility, created_at, profiles!posts_author_id_fkey(username, display_name, avatar_url)'

function PostComposer({ userId, onPublished, onError, idPrefix = 'post' }) {
  const [draft, setDraft] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState('')
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    return () => { if (mediaPreview) URL.revokeObjectURL(mediaPreview) }
  }, [mediaPreview])

  function chooseImage(event) {
    const file = event.target.files?.[0] || null
    setMediaFile(file)
    setMediaPreview(file ? URL.createObjectURL(file) : '')
    event.target.value = ''
  }

  async function handlePublish(event) {
    event.preventDefault()
    const content = draft.trim()
    if ((!content && !mediaFile) || publishing) return
    if (content.length > 1000) {
      onError('Post text must be 1,000 characters or fewer.')
      return
    }
    if (mediaFile && (!imageTypes.includes(mediaFile.type) || mediaFile.size > maxImageBytes)) {
      onError('Choose a JPG, PNG, WebP, or GIF image under 8 MB.')
      return
    }

    onError('')
    setPublishing(true)
    let uploadedPath = ''
    try {
      let mediaPath = null
      let mediaType = null
      if (mediaFile) {
        const extension = mediaFile.name.split('.').pop()?.toLowerCase() || 'image'
        uploadedPath = `${userId}/posts/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await getSupabaseClient().storage
          .from('qorvexa-media')
          .upload(uploadedPath, mediaFile, { contentType: mediaFile.type, upsert: false })
        if (uploadError) throw uploadError
        mediaPath = uploadedPath
        mediaType = 'image'
      }

      const { data, error: insertError } = await getSupabaseClient()
        .from('posts')
        .insert({
          author_id: userId,
          content,
          media_path: mediaPath,
          media_type: mediaType,
          post_visibility: visibility,
        })
        .select(postSelection)
        .single()
      if (insertError) throw insertError

      onPublished(data)
      setDraft('')
      setVisibility('public')
      setMediaFile(null)
      setMediaPreview('')
    } catch (publishError) {
      if (uploadedPath) {
        const { error: cleanupError } = await getSupabaseClient().storage
          .from('qorvexa-media')
          .remove([uploadedPath])
        if (cleanupError) {
          onError(`${publishError.message || 'Your post could not be published.'} The uploaded image could not be cleaned up.`)
          return
        }
      }
      onError(publishError.message || 'Your post could not be published.', publishError)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <form className="member-composer" onSubmit={handlePublish}>
      <label className="member-composer-label" htmlFor={`${idPrefix}-content`}>What’s on your mind?</label>
      <textarea
        id={`${idPrefix}-content`}
        maxLength={1000}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Share an idea, a moment, or something you’re working on…"
        rows={4}
        value={draft}
      />
      <label className="member-post-visibility">Post audience
        <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
          <option value="public">Public</option>
          <option value="friends">Friends</option>
          <option value="only_me">Only me</option>
        </select>
      </label>
      {mediaPreview && (
        <div className="member-media-preview">
          <img src={mediaPreview} alt="Selected post image preview" />
          <button type="button" onClick={() => { setMediaFile(null); setMediaPreview('') }}>Remove image</button>
        </div>
      )}
      <div className="member-media-picker">
        <label className="member-comments-toggle" htmlFor={`${idPrefix}-media-file`}><ImagePlus size={15} />Add an image</label>
        <input id={`${idPrefix}-media-file`} type="file" accept={imageTypes.join(',')} onChange={chooseImage} />
        <span>JPG, PNG, WebP, or GIF · up to 8 MB</span>
      </div>
      <div className="member-composer-footer">
        <span>{draft.length}/1000</span>
        <button className="member-publish-button" type="submit" disabled={publishing || (!draft.trim() && !mediaFile)}>
          {publishing ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
          {publishing ? 'Publishing…' : 'Publish post'}
        </button>
      </div>
    </form>
  )
}

export default PostComposer
