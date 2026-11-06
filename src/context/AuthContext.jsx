import { useEffect, useState } from 'react'
import AuthContext from './authContext.js'
import { getSupabaseClient } from '../lib/supabase.js'

export function AuthProvider({ children }) {
  const [clientState] = useState(() => {
    try {
      return { client: getSupabaseClient(), error: null }
    } catch (error) {
      return { client: null, error: error.message }
    }
  })
  const [authState, setAuthState] = useState(() => ({
    user: null,
    loading: Boolean(clientState.client),
    error: clientState.error,
  }))

  useEffect(() => {
    let active = true
    const { client } = clientState
    if (!client) return undefined

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setAuthState({ user: session?.user ?? null, loading: false, error: null })
      }
    })

    client.auth.getSession().then(({ data, error }) => {
      if (!active) return

      setAuthState({
        user: data.session?.user ?? null,
        loading: false,
        error: error?.message ?? null,
      })
    }).catch((error) => {
      if (active) {
        setAuthState({ user: null, loading: false, error: error.message })
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [clientState])

  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>
}
