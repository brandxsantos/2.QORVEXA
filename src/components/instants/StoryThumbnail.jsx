import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase.js'

const STORY_BUCKET = 'qorvexa-instants'
const SIGNED_URL_TTL_SECONDS = 3600
// Refresh signed URLs 5 minutes before their 1-hour expiration
const SIGNED_URL_SAFETY_BUFFER_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 100

// Cache key -> { url: string, isObjectUrl: boolean, expiresAt: number | null, refCount: number, evicted: boolean }
const thumbnailCache = new Map()
// Cache key -> Promise<{ url: string, isObjectUrl: boolean, expiresAt: number | null }>
const inflightRequests = new Map()

export function extractStoragePath(rawPath) {
  if (!rawPath) return ''
  let p = String(rawPath).trim()
  if (!p) return ''

  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const u = new URL(p)
      const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+)$/)
      if (match) {
        p = decodeURIComponent(match[1])
      } else {
        return ''
      }
    } catch (_) {
      return ''
    }
  }

  // Strip leading slashes and bucket prefix
  p = p.replace(/^\/+/, '')
  p = p.replace(/^qorvexa-instants\/+/, '')
  p = p.replace(/^qorvexa-media\/+/, '')
  return p
}

function isEntryExpired(entry) {
  if (!entry) return true
  if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
    return true
  }
  return false
}

function disposeEntryUrl(entry) {
  if (!entry || !entry.isObjectUrl || !entry.url) return
  try {
    URL.revokeObjectURL(entry.url)
  } catch (_) {}
  entry.url = ''
}

function evictCacheEntry(cacheKey) {
  if (!cacheKey) return
  const entry = thumbnailCache.get(cacheKey)
  if (!entry) return

  thumbnailCache.delete(cacheKey)
  entry.evicted = true
  if (entry.refCount <= 0) {
    disposeEntryUrl(entry)
  }
}

function getValidCacheEntry(cacheKey) {
  if (!cacheKey) return null
  const entry = thumbnailCache.get(cacheKey)
  if (!entry) return null

  if (isEntryExpired(entry)) {
    evictCacheEntry(cacheKey)
    return null
  }

  // Refresh LRU order
  thumbnailCache.delete(cacheKey)
  thumbnailCache.set(cacheKey, entry)
  return entry
}

function pruneCacheBeforeInsert() {
  if (thumbnailCache.size < MAX_CACHE_ENTRIES) return

  for (const [key, entry] of thumbnailCache.entries()) {
    if (thumbnailCache.size < MAX_CACHE_ENTRIES) break
    if (isEntryExpired(entry) || entry.refCount <= 0) {
      evictCacheEntry(key)
    }
  }
}

function retainCacheEntry(cacheKey) {
  if (!cacheKey) return null
  const entry = thumbnailCache.get(cacheKey)
  if (!entry) return null
  entry.refCount += 1
  return entry
}

function releaseCacheEntry(entry) {
  if (!entry) return
  entry.refCount = Math.max(0, entry.refCount - 1)
  if (entry.refCount === 0 && entry.evicted) {
    disposeEntryUrl(entry)
  }
}

function resolveStoryThumbnail(cleanPath) {
  const existing = getValidCacheEntry(cleanPath)
  if (existing) {
    return Promise.resolve(existing)
  }

  if (inflightRequests.has(cleanPath)) {
    return inflightRequests.get(cleanPath)
  }

  const client = getSupabaseClient()

  const requestPromise = (async () => {
    // 1. Primary: Request signed URL from private qorvexa-instants bucket
    try {
      const { data, error } = await client.storage
        .from(STORY_BUCKET)
        .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS)

      if (!error && data?.signedUrl) {
        const entry = {
          url: data.signedUrl,
          isObjectUrl: false,
          expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_SAFETY_BUFFER_MS,
          refCount: 0,
          evicted: false,
        }
        pruneCacheBeforeInsert()
        thumbnailCache.set(cleanPath, entry)
        return entry
      }
    } catch (_) {}

    // 2. Fallback: Authenticated download as Blob Object URL from private qorvexa-instants bucket
    try {
      const { data: blobData, error: dlErr } = await client.storage
        .from(STORY_BUCKET)
        .download(cleanPath)

      if (!dlErr && blobData) {
        const objUrl = URL.createObjectURL(blobData)
        const entry = {
          url: objUrl,
          isObjectUrl: true,
          expiresAt: null,
          refCount: 0,
          evicted: false,
        }
        pruneCacheBeforeInsert()
        thumbnailCache.set(cleanPath, entry)
        return entry
      }
    } catch (_) {}

    return null
  })().finally(() => {
    inflightRequests.delete(cleanPath)
  })

  inflightRequests.set(cleanPath, requestPromise)
  return requestPromise
}

export default function StoryThumbnail({
  imagePath,
  alt = 'Story preview',
  className = '',
  fallbackInitials = '',
}) {
  const cleanPath = extractStoragePath(imagePath)
  const isDirectSource =
    Boolean(imagePath) &&
    (imagePath.startsWith('blob:') ||
      imagePath.startsWith('data:') ||
      ((imagePath.startsWith('http://') || imagePath.startsWith('https://')) && !cleanPath))

  const [state, setState] = useState(() => {
    if (!imagePath) {
      return { src: '', loading: false, failed: true }
    }
    if (isDirectSource) {
      return { src: imagePath, loading: false, failed: false }
    }
    const cached = getValidCacheEntry(cleanPath)
    if (cached) {
      return { src: cached.url, loading: false, failed: false }
    }
    return { src: '', loading: true, failed: false }
  })

  useEffect(() => {
    if (!imagePath) {
      setState({ src: '', loading: false, failed: true })
      return undefined
    }

    if (isDirectSource) {
      setState({ src: imagePath, loading: false, failed: false })
      return undefined
    }

    if (!cleanPath) {
      setState({ src: '', loading: false, failed: true })
      return undefined
    }

    const cached = getValidCacheEntry(cleanPath)
    if (cached) {
      const retained = retainCacheEntry(cleanPath)
      setState({ src: cached.url, loading: false, failed: false })
      return () => {
        releaseCacheEntry(retained)
      }
    }

    let active = true
    let retainedEntry = null
    setState({ src: '', loading: true, failed: false })

    resolveStoryThumbnail(cleanPath)
      .then((entry) => {
        if (!active) return
        if (entry && entry.url) {
          retainedEntry = retainCacheEntry(cleanPath) || entry
          setState({ src: entry.url, loading: false, failed: false })
        } else {
          setState({ src: '', loading: false, failed: true })
        }
      })
      .catch(() => {
        if (active) {
          setState({ src: '', loading: false, failed: true })
        }
      })

    return () => {
      active = false
      if (retainedEntry) {
        releaseCacheEntry(retainedEntry)
      }
    }
  }, [imagePath, cleanPath, isDirectSource])

  const handleImageError = () => {
    if (cleanPath) {
      evictCacheEntry(cleanPath)
    }
    setState({ src: '', loading: false, failed: true })
  }

  if (state.loading) {
    return <div className={`story-thumb-skeleton animate-pulse ${className}`} />
  }

  if (state.failed || !state.src) {
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
      src={state.src}
      alt={alt}
      className={`story-thumb-img ${className}`}
      loading="lazy"
      onError={handleImageError}
    />
  )
}
