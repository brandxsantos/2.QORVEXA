
import { useEffect } from 'react'
import { useAuth } from '../context/useAuth.js'
import {
  authorizeRealtimeSession,
  getSupabaseClient,
} from '../lib/supabase.js'

const availabilityEvent = 'qorvexa:availability-change'
const presenceStatusEvent = 'qorvexa:presence-status'

function PresenceTracker() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return undefined

    let active = true
    let subscribed = false
    let availability = null
    let channel = null

    const client = getSupabaseClient()

    function reportPresenceError(error, fallback) {
      const message = error?.message || fallback

      console.error('[QORVEXA Presence Error]', error || fallback)

      window.dispatchEvent(
        new CustomEvent(presenceStatusEvent, {
          detail: { message },
        }),
      )
    }

    function clearPresenceError() {
      window.dispatchEvent(
        new CustomEvent(presenceStatusEvent, {
          detail: { message: '' },
        }),
      )
    }

    async function syncPresence() {
      if (!active || !subscribed || !channel || !availability) return

      if (
        document.visibilityState === 'visible' &&
        availability !== 'offline'
      ) {
        const status = await channel.track({
          user_id: user.id,
          availability,
          online_at: new Date().toISOString(),
        })

        if (status !== 'ok') {
          throw new Error(
            `Availability could not be published (${status}).`,
          )
        }

        const { error } = await client.rpc('touch_last_active')
        if (error) throw error
      } else {
        const { error } = await client.rpc('touch_last_active')
        if (error) throw error

        const status = await channel.untrack()

        if (status !== 'ok') {
          throw new Error(
            `Availability could not be cleared (${status}).`,
          )
        }
      }

      if (active) clearPresenceError()
    }

    function handleAvailabilityChange(event) {
      const nextAvailability = event.detail?.availability

      if (['online', 'offline', 'busy'].includes(nextAvailability)) {
        availability = nextAvailability

        syncPresence().catch((error) => {
          if (active) {
            reportPresenceError(
              error,
              'Availability could not be updated.',
            )
          }
        })
      }
    }

    function handleVisibilityChange() {
      syncPresence().catch((error) => {
        if (active) {
          reportPresenceError(
            error,
            'Availability could not be updated.',
          )
        }
      })
    }

    async function startPresence() {
      try {
        // Set the authenticated JWT before creating the private channel.
        await authorizeRealtimeSession(client)

        if (!active) return

        channel = client.channel(
          `qorvexa-online-presence:${user.id}`,
          {
            config: {
              private: true,
              presence: {
                key: user.id,
                enabled: true,
              },
            },
          },
        )

        channel.subscribe((status, error) => {
          console.log('[QORVEXA Presence Debug] Channel subscription:', {
            status,
            topic: `qorvexa-online-presence:${user.id}`,
            error: error?.message || null,
          })

          if (!active) return

          subscribed = status === 'SUBSCRIBED'

          if (subscribed) {
            clearPresenceError()

            syncPresence().catch((presenceError) => {
              if (active) {
                reportPresenceError(
                  presenceError,
                  'Availability could not be updated.',
                )
              }
            })
          } else if (
            ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)
          ) {
            reportPresenceError(
              error,
              'Live availability disconnected.',
            )
          }
        })

        const { data, error } = await client.rpc(
          'get_own_profile_settings',
        )

        if (error) throw error
        if (!active) return

        availability =
          data?.[0]?.availability_status || 'online'

        if (subscribed) {
          await syncPresence()
        }
      } catch (error) {
        if (active) {
          reportPresenceError(
            error,
            'Live availability could not be authorized.',
          )
        }
      }
    }

    window.addEventListener(
      availabilityEvent,
      handleAvailabilityChange,
    )

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    const heartbeat = window.setInterval(() => {
      if (
        active &&
        document.visibilityState === 'visible'
      ) {
        client.rpc('touch_last_active').then(({ error }) => {
          if (error && active) {
            reportPresenceError(
              error,
              'Last-active time could not be updated.',
            )
          }
        })
      }
    }, 60_000)

    startPresence()

    // React executes this cleanup when the component unmounts
    // or the logged-in user changes.
    return () => {
      active = false
      subscribed = false

      window.removeEventListener(
        availabilityEvent,
        handleAvailabilityChange,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )

      window.clearInterval(heartbeat)

      if (channel) {
        client.removeChannel(channel)
        channel = null
      }
    }
  }, [user])

  return null
}

export default PresenceTracker
