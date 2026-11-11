
import { createClient } from '@supabase/supabase-js'

let supabase

export function getSupabaseClient() {
  const { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = import.meta.env

  if (!VITE_SUPABASE_URL || !VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    )
  }

  if (!supabase) {
 supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    logLevel: 'debug',
  },
})
  }

  return supabase
}

let realtimeAuthPromise = null
let lastAuthorizedToken = null

export async function authorizeRealtimeSession(client = getSupabaseClient()) {
  if (realtimeAuthPromise) {
    return realtimeAuthPromise
  }

  realtimeAuthPromise = (async () => {
    try {
      const { data, error } = await client.auth.getSession()
      if (error) throw error

      const session = data?.session
      const accessToken = session?.access_token

      if (!accessToken) {
        throw new Error('A signed-in session is required to authorize Realtime subscriptions.')
      }

      if (accessToken !== lastAuthorizedToken) {
        await client.realtime.setAuth(accessToken)
        lastAuthorizedToken = accessToken
      }
      return accessToken
    } finally {
      realtimeAuthPromise = null
    }
  })()

  return realtimeAuthPromise
}

let ownSettingsCache = { data: null, timestamp: 0, promise: null }

export function invalidateOwnProfileSettingsCache() {
  ownSettingsCache = { data: null, timestamp: 0, promise: null }
}

export async function getOwnProfileSettingsCached(client = getSupabaseClient(), maxAgeMs = 15000) {
  const now = Date.now()
  if (ownSettingsCache.data && now - ownSettingsCache.timestamp < maxAgeMs) {
    return { data: ownSettingsCache.data, error: null }
  }
  if (ownSettingsCache.promise) {
    return ownSettingsCache.promise
  }

  ownSettingsCache.promise = client
    .rpc('get_own_profile_settings')
    .then((result) => {
      if (!result.error && result.data) {
        ownSettingsCache.data = result.data
        ownSettingsCache.timestamp = Date.now()
      }
      return result
    })
    .finally(() => {
      ownSettingsCache.promise = null
    })

  return ownSettingsCache.promise
}
