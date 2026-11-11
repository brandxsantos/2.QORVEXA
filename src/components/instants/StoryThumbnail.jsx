import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase.js'

// In-memory cache for resolved story thumbnail URLs to prevent flicker/reloading
const thumbnailCache = new Map()

export function extractStoragePath(rawPath) {
  if (!rawPath) return ''
  let p = rawPath.trim()
  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const u = new URL(p)
      const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+)$/)
      if (match) p = decodeURIComponent(match[1])
      else return p // already full external or signed URL
    } catch (_) {
      return p
    }
  }
  // Strip leading slashes and bucket prefix
  p = p.replace(/^\/+/, '')
  p = p.replace(/^qorvexa-instants\/+/, '')
  p = p.replace(/^qorvexa-media\/+/, '')
  return p
}

export default function StoryThumbnail({
  imagePath,
  alt = 'Story preview',
  className = '',
  fallbackInitials = '',
}) {
  const [src, setSrc] = useState(() => (imagePath ? thumbnailCache.get(imagePath) || '' : ''))
  const [loading, setLoading] = useState(() => !thumbnailCache.has(imagePath))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!imagePath) {
      setLoading(false)
      setFailed(true)
      return
    }

    // Direct blob/data or cached URL
    if (imagePath.startsWith('blob:') || imagePath.startsWith('data:')) {
      setSrc(imagePath)
      setLoading(false)
      setFailed(false)
      return
    }

    if (thumbnailCache.has(imagePath)) {
      setSrc(thumbnailCache.get(imagePath))
      setLoading(false)
      setFailed(false)
      return
    }

    let active = true
    setLoading(true)
    setFailed(false)

    const cleanPath = extractStoragePath(imagePath)
    if (!cleanPath) {
      if (imagePath.startsWith('http')) {
        setSrc(imagePath)
        thumbnailCache.set(imagePath, imagePath)
        setLoading(false)
      } else {
        setFailed(true)
        setLoading(false)
      }
      return
    }

    const client = getSupabaseClient()

    // 1. Try createSignedUrl from private bucket
    client.storage
      .from('qorvexa-instants')
      .createSignedUrl(cleanPath, 3600)
      .then(({ data, error }) => {
        if (!active) return
        if (!error && data?.signedUrl) {
          thumbnailCache.set(imagePath, data.signedUrl)
          setSrc(data.signedUrl)
          setLoading(false)
          return
        }

        // 2. Fallback: try download as object URL
        client.storage
          .from('qorvexa-instants')
          .download(cleanPath)
          .then(({ data: blobData, error: dlErr }) => {
            if (!active) return
            if (!dlErr && blobData) {
              const objUrl = URL.createObjectURL(blobData)
              thumbnailCache.set(imagePath, objUrl)
              setSrc(objUrl)
              setLoading(false)
              return
            }

            // 3. Fallback: getPublicUrl
            try {
              const { data: pubData } = client.storage
                .from('qorvexa-instants')
                .getPublicUrl(cleanPath)
              if (pubData?.publicUrl) {
                thumbnailCache.set(imagePath, pubData.publicUrl)
                setSrc(pubData.publicUrl)
                setLoading(false)
                return
              }
            } catch (_) {}

            setFailed(true)
            setLoading(false)
          })
          .catch(() => {
            if (active) {
              setFailed(true)
              setLoading(false)
            }
          })
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
    return <div className={`story-thumb-skeleton animate-pulse ${className}`} />
  }

  if (failed || !src) {
    return (
      <div className={`story-thumb-fallback ${className}`}>
        {fallbackInitials ? (
          <span className="story-thumb-initials">{fallbackInitials}</span>
        ) : (
          <div className="story-thumb-fallback-pattern" />
        )}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`story-thumb-img ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
