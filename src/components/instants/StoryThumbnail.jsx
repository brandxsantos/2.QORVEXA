import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { getSupabaseClient } from '../../lib/supabase.js'

export default function StoryThumbnail({ imagePath, alt = 'Story preview', className = '' }) {
  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!imagePath) {
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setFailed(false)

    getSupabaseClient().storage
      .from('qorvexa-instants')
      .createSignedUrl(imagePath, 3600)
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data?.signedUrl) {
          setFailed(true)
        } else {
          setSrc(data.signedUrl)
        }
        setLoading(false)
      })
      .catch(() => {
        if (active) {
          setFailed(true)
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [imagePath])

  if (loading) {
    return (
      <div className={`qv-story-thumb-placeholder ${className}`}>
        <Sparkles size={14} className="animate-pulse" />
      </div>
    )
  }

  if (failed || !src) {
    return (
      <div className={`qv-story-thumb-placeholder ${className}`}>
        <Sparkles size={14} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`qv-story-thumb-img ${className}`}
      loading="lazy"
    />
  )
}
