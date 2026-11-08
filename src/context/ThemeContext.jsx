import { createContext, useContext, useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreference] = useState('dark')

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference
  }, [themePreference])

  useEffect(() => {
    let active = true
    let requestId = 0
    const client = getSupabaseClient()

    async function loadTheme(user) {
      const currentRequest = ++requestId

      if (!user) {
        if (active) setThemePreference('dark')
        return
      }

      const { data, error } = await client.rpc('get_own_profile_settings')

      if (!active || currentRequest !== requestId) return

      if (error) {
        console.error('[QORVEXA Theme] Could not load preference:', error.message)
        return
      }

      const preference = data?.[0]?.theme_preference
      setThemePreference(preference === 'light' ? 'light' : 'dark')
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
