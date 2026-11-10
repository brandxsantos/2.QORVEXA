import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getSupabaseClient } from '../lib/supabase.js'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'qorvexa_theme'

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreferenceState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'light' || saved === 'dark') return saved
    } catch {
      // fallback
    }
    return typeof document !== 'undefined' && document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme
      : 'dark'
  })

  // Apply theme to DOM and localStorage
  const setThemePreference = useCallback((nextTheme) => {
    const validTheme = nextTheme === 'light' ? 'light' : 'dark'
    setThemePreferenceState(validTheme)

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = validTheme
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) {
        meta.setAttribute('content', validTheme === 'light' ? '#f1f5f9' : '#171D2B')
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, validTheme)
    } catch {
      // storage unavailable
    }

    // Persist to Supabase if authenticated
    const client = getSupabaseClient()
    client.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id
      if (userId) {
        client
          .from('profiles')
          .update({ theme_preference: validTheme })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) {
              console.warn('[QORVEXA Theme] Failed to sync preference to database:', error.message)
            }
          })
      }
    })
  }, [])

  // Sync initial DOM attribute
  useEffect(() => {
    document.documentElement.dataset.theme = themePreference
  }, [themePreference])

  // Sync from Supabase profile on auth state change
  useEffect(() => {
    let active = true
    let requestId = 0
    const client = getSupabaseClient()

    async function loadTheme(user) {
      const currentRequest = ++requestId

      if (!user) return

      try {
        const { data, error } = await client.rpc('get_own_profile_settings')

        if (!active || currentRequest !== requestId) return

        if (error) {
          console.error('[QORVEXA Theme] Could not load preference:', error.message)
          return
        }

        const remotePref = data?.[0]?.theme_preference
        if (remotePref === 'light' || remotePref === 'dark') {
          setThemePreferenceState(remotePref)
          document.documentElement.dataset.theme = remotePref
          try {
            localStorage.setItem(STORAGE_KEY, remotePref)
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn('[QORVEXA Theme] Error loading remote theme preference:', err)
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      Promise.resolve().then(() => loadTheme(session?.user ?? null))
    })

    return () => {
      active = false
      requestId += 1
      subscription.unsubscribe()
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ themePreference, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider.')
  }

  return context
}
