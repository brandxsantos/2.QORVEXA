import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase.js'

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

function ProtectedMediaImage({ path, alt = '', className, loading, fallback }) {
  const [resolved, setResolved] = useState({ path: '', src: '', unavailable: false })
  const objectPath = getObjectPath(path)
  const externalSource = path?.startsWith('http') && !objectPath ? path : ''
  const placeholder = fallback || 'Image unavailable'
  const fallbackClass = [
    'protected-media-fallback',
    fallback && 'protected-media-fallback--avatar',
    className,
  ].filter(Boolean).join(' ')

  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (!objectPath) return undefined

    getSupabaseClient().storage.from('qorvexa-media')
      .download(objectPath)
      .then(({ data, error }) => {
        if (error) throw error
        objectUrl = URL.createObjectURL(data)
        if (active) setResolved({ path, src: objectUrl, unavailable: false })
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => {
        try {
          const { data: pubData } = getSupabaseClient()
            .storage.from('qorvexa-media')
            .getPublicUrl(objectPath)
          if (active && pubData?.publicUrl) {
            setResolved({ path, src: pubData.publicUrl, unavailable: false })
            return
          }
        } catch (_) {}
        if (active) setResolved({ path, src: '', unavailable: true })
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
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
