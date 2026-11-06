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

function ProtectedMediaImage({ path, alt = '', className, loading }) {
  const [resolved, setResolved] = useState({ path: '', src: '', unavailable: false })
  const objectPath = getObjectPath(path)
  const externalSource = path?.startsWith('http') && !objectPath ? path : ''

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
        if (active) setResolved({ path, src: '', unavailable: true })
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectPath, path])

  if (!objectPath) {
    return externalSource ? <img src={externalSource} alt={alt} className={className} loading={loading} /> : null
  }
  if (resolved.path !== path || !resolved.src) {
    return resolved.path === path && resolved.unavailable
      ? <span className="protected-media-unavailable" role="img" aria-label={`${alt || 'Image'} unavailable`}>Image unavailable</span>
      : null
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
