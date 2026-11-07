import { useEffect } from 'react'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'

const availabilityEvent = 'qorvexa:availability-change'
const presenceStatusEvent = 'qorvexa:presence-status'

function PresenceTracker() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return undefined

    let active = true
    let subscribed = false
    let availability = null
    const client = getSupabaseClient()
    const channel = client.channel(`qorvexa-online-presence:${user.id}`, {
      config: { presence: { key: user.id }, private: true },
    })

    function reportPresenceError(error, fallback) {
      const message = error?.message || fallback
      console.error(message, error)
      window.dispatchEvent(new CustomEvent(presenceStatusEvent, { detail: { message } }))
    }

    function clearPresenceError() {
      window.dispatchEvent(new CustomEvent(presenceStatusEvent, { detail: { message: '' } }))
    }

    async function syncPresence() {
      if (!active || !subscribed || !availability) return

      if (document.visibilityState === 'visible' && availability !== 'offline') {
        const status = await channel.track({
          user_id: user.id,
          availability,
          online_at: new Date().toISOString(),
        })
        if (status !== 'ok') throw new Error(`Availability could not be published (${status}).`)
        const { error } = await client.rpc('touch_last_active')
        if (error) throw error
      } else {
        const { error } = await client.rpc('touch_last_active')
        if (error) throw error
        const status = await channel.untrack()
        if (status !== 'ok') throw new Error(`Availability could not be cleared (${status}).`)
      }
      clearPresenceError()
    }

    function handleAvailabilityChange(event) {
      if (['online', 'offline', 'busy'].includes(event.detail?.availability)) {
        availability = event.detail.availability
        syncPresence().catch((error) => reportPresenceError(error, 'Availability could not be updated.'))
      }
    }

    function handleVisibilityChange() {
      syncPresence().catch((error) => reportPresenceError(error, 'Availability could not be updated.'))
    }

    channel.subscribe((status, error) => {
      if (!active) return
      subscribed = status === 'SUBSCRIBED'
      if (subscribed) {
        clearPresenceError()
        syncPresence().catch((presenceError) => reportPresenceError(presenceError, 'Availability could not be updated.'))
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        reportPresenceError(error, 'Live availability disconnected.')
      }
    })

    client.rpc('get_own_profile_settings')
      .then(({ data, error }) => {
        if (error) throw error
        if (!active) return
        availability = data?.[0]?.availability_status || 'online'
        if (subscribed) syncPresence().catch((presenceError) => reportPresenceError(presenceError, 'Availability could not be updated.'))
      })
      .catch((error) => reportPresenceError(error, 'Availability preference could not be loaded.'))

    window.addEventListener(availabilityEvent, handleAvailabilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        client.rpc('touch_last_active').then(({ error }) => {
          if (error) reportPresenceError(error, 'Last-active time could not be updated.')
        })
      }
    }, 60_000)

    return () => {
      active = false
      window.removeEventListener(availabilityEvent, handleAvailabilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(heartbeat)
      client.removeChannel(channel)
    }
  }, [user])

  return null
}

export default PresenceTracker
