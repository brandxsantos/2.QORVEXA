import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase.js'

const mediaUrlCache = new Map()
const inflightDownloads = new Map()

function getObjectPath(value) {
  if (!value) return null
  if (!value.startsWith('http')) return value

  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/qorvexa-media\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

function resolveMediaObject(objectPath) {
  if (mediaUrlCache.has(objectPath)) {
    return Promise.resolve(mediaUrlCache.get(objectPath))
  }
  if (inflightDownloads.has(objectPath)) {
    return inflightDownloads.get(objectPath)
  }

  const client = getSupabaseClient()
  const promise = client.storage
    .from('qorvexa-media')
    .download(objectPath)
    .then(({ data, error }) => {
      if (error) throw error
      const objectUrl = URL.createObjectURL(data)
      const entry = { src: objectUrl, unavailable: false }
      mediaUrlCache.set(objectPath, entry)
      return entry
    })
    .catch(() => {
      try {
        const { data: pubData } = client.storage
          .from('qorvexa-media')
          .getPublicUrl(objectPath)
        if (pubData?.publicUrl) {
          const entry = { src: pubData.publicUrl, unavailable: false }
          mediaUrlCache.set(objectPath, entry)
          return entry
        }
      } catch (_) {}
      return { src: '', unavailable: true }
    })
    .finally(() => {
      inflightDownloads.delete(objectPath)
    })

  inflightDownloads.set(objectPath, promise)
  return promise
}

function ProtectedMediaImage({ path, alt = '', className, loading, fallback }) {
  const objectPath = getObjectPath(path)
  const [resolved, setResolved] = useState(() => {
    if (objectPath && mediaUrlCache.has(objectPath)) {
      const cached = mediaUrlCache.get(objectPath)
      return { path, src: cached.src, unavailable: cached.unavailable }
    }
    return { path: '', src: '', unavailable: false }
  })
  const externalSource = path?.startsWith('http') && !objectPath ? path : ''
  const placeholder = fallback || 'Image unavailable'
  const fallbackClass = [
    'protected-media-fallback',
    fallback && 'protected-media-fallback--avatar',
    className,
  ].filter(Boolean).join(' ')

  useEffect(() => {
    let active = true
    if (!objectPath) return undefined

    if (mediaUrlCache.has(objectPath)) {
      const cached = mediaUrlCache.get(objectPath)
      setResolved({ path, src: cached.src, unavailable: cached.unavailable })
      return undefined
    }

    resolveMediaObject(objectPath).then((entry) => {
      if (active) {
        setResolved({ path, src: entry.src, unavailable: entry.unavailable })
      }
    })

    return () => {
      active = false
    }
  }, [objectPath, path])

  if (!objectPath) {
    if (!externalSource) return null
    if (resolved.path === path && resolved.unavailable) {
      return <span className={fallbackClass} role="img" aria-label={`${alt || placeholder} unavailable`}>{placeholder}</span>
    }
    return <img
      src={externalSource}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setResolved({ path, src: '', unavailable: true })}
    />
  }
  if (resolved.path !== path || !resolved.src) {
    return resolved.path === path && resolved.unavailable
      ? <span className={fallbackClass} role="img" aria-label={`${alt || placeholder} unavailable`}>{placeholder}</span>
      : (fallback ? <span className={fallbackClass}>{fallback}</span> : null)
  }
  return <img
    src={resolved.src}
    alt={alt}
    className={className}
    loading={loading}
    onError={() => setResolved({ path, src: '', unavailable: true })}
  />
}

export default ProtectedMediaImage
