
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

export async function authorizeRealtimeSession(client = getSupabaseClient()) {
  const { data, error } = await client.auth.getSession()
  if (error) throw error

  const session = data?.session
  const accessToken = session?.access_token

  if (!accessToken) {
    throw new Error('A signed-in session is required to authorize Realtime subscriptions.')
  }

  await client.realtime.setAuth(accessToken)
  return accessToken
}
