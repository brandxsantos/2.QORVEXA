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

    function applySessionUser(nextUser, nextError = null) {
      setAuthState((prev) => {
        if (
          !prev.loading &&
          prev.error === nextError &&
          prev.user?.id === nextUser?.id &&
          prev.user?.updated_at === nextUser?.updated_at
        ) {
          return prev
        }
        return { user: nextUser, loading: false, error: nextError }
      })
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        applySessionUser(session?.user ?? null, null)
      }
    })

    client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      applySessionUser(data.session?.user ?? null, error?.message ?? null)
    }).catch((error) => {
      if (active) {
        applySessionUser(null, error.message)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [clientState])

  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>
}
