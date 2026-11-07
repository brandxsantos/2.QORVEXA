
import { useEffect } from 'react'
import { useAuth } from '../context/useAuth.js'
import { authorizeRealtimeSession, getSupabaseClient } from '../lib/supabase.js'

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
      if (!active || !subscribed || !availability) return

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

      clearPresenceError()
    }

    function handleAvailabilityChange(event) {
      if (['online', 'offline', 'busy'].includes(event.detail?.availability)) {
        availability = event.detail.availability

        syncPresence().catch((error) =>
          reportPresenceError(error, 'Availability could not be updated.'),
        )
      }
    }

    function handleVisibilityChange() {
      syncPresence().catch((error) =>
        reportPresenceError(error, 'Availability could not be updated.'),
      )
    }

   authorizeRealtimeSession(client)
  .then(() => {
    if (!active) return

    // Create the private channel only after Realtime auth is set.
    channel = client.channel(
      `qorvexa-online-presence:${user.id}`,
      {
        config: {
          presence: { key: user.id },
          private: true,
        },
      },
    )

    channel.subscribe((status, error) => {
          console.log('[QORVEXA Presence Debug] Channel subscription:', {
            status,
            topic: `qorvexa-online-presence:${user.id}`,
          })

          if (error) {
            console.dir(error)

            console.log(
              '[QORVEXA Presence Debug] Full subscription error:',
              JSON.stringify(
                error,
                Object.getOwnPropertyNames(error),
                2,
              ),
            )

            if (error.cause) {
              console.log(
                '[QORVEXA Presence Debug] Error cause:',
                error.cause,
              )
            }
          }

          if (!active) return

          subscribed = status === 'SUBSCRIBED'

          if (subscribed) {
            clearPresenceError()

            syncPresence().catch((presenceError) =>
              reportPresenceError(
                presenceError,
                'Availability could not be updated.',
              ),
            )
          } else if (
            ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)
          ) {
            reportPresenceError(error, 'Live availability disconnected.')
          }
        })
      })
      .catch((error) => {
        if (active) {
          reportPresenceError(
            error,
            'Live availability could not be authorized.',
          )
        }
      })

    client.rpc('get_own_profile_settings')
      .then(({ data, error }) => {
        if (error) throw error
        if (!active) return

        availability = data?.[0]?.availability_status || 'online'

        if (subscribed) {
          syncPresence().catch((presenceError) =>
            reportPresenceError(
              presenceError,
              'Availability could not be updated.',
            ),
          )
        }
      })
      .catch((error) =>
        reportPresenceError(
          error,
          'Availability preference could not be loaded.',
        ),
      )

    window.addEventListener(availabilityEvent, handleAvailabilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        client.rpc('touch_last_active').then(({ error }) => {
          if (error) {
            reportPresenceError(
              error,
              'Last-active time could not be updated.',
            )
          }
        })
      }
    }, 60_000)

    return () => {
      active = false

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
}
    }
  }, [user])

  return null
}

export default PresenceTracker
