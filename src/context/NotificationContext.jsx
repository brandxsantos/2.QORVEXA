import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import NotificationContext from './notificationContext.js'
import { useAuth } from './useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)

  // Unique identifier for this browser tab instance
  const tabIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 11)
  )

  // Track latest request timestamp and active user to prevent stale overwrites
  const latestRequestTimeRef = useRef(0)
  const activeUserIdRef = useRef(user?.id || null)
  activeUserIdRef.current = user?.id || null

  const debounceTimerRef = useRef(null)
  const broadcastChannelRef = useRef(null)

  // Authoritative unread count re-fetch directly from Supabase
  const refreshUnreadCount = useCallback(async () => {
    const currentUserId = activeUserIdRef.current
    if (!currentUserId) {
      setUnreadNotificationCount(0)
      return 0
    }

    const requestTime = Date.now()
    latestRequestTimeRef.current = requestTime

    try {
      const client = getSupabaseClient()
      const { count, error } = await client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUserId)
        .eq('is_read', false)

      if (error) throw error

      // Ensure response is for the latest request and current user
      if (
        requestTime >= latestRequestTimeRef.current &&
        activeUserIdRef.current === currentUserId
      ) {
        const finalCount = typeof count === 'number' ? count : 0
        setUnreadNotificationCount(finalCount)
        return finalCount
      }
    } catch (err) {
      console.warn('Failed to refresh unread notification count:', err)
    }
    return 0
  }, [])

  // Coalesce / debounce rapid refresh requests (e.g. bursts of events)
  const triggerDebouncedRefresh = useCallback((delay = 150) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      refreshUnreadCount()
    }, delay)
  }, [refreshUnreadCount])

  // Broadcast sync signal to other tabs (never sends authoritative count, only triggers re-fetch)
  const broadcastNotificationSync = useCallback(() => {
    const currentUserId = activeUserIdRef.current
    if (!currentUserId) return

    const message = {
      type: 'SYNC_NOTIFICATIONS',
      senderTabId: tabIdRef.current,
      userId: currentUserId,
      timestamp: Date.now(),
    }

    // 1. Primary: BroadcastChannel
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage(message)
      } catch (err) {
        console.warn('BroadcastChannel postMessage error:', err)
      }
    }

    // 2. Fallback / complementary: localStorage storage event
    try {
      localStorage.setItem(
        `qorvexa_notif_sync_${currentUserId}`,
        `${tabIdRef.current}_${Date.now()}`
      )
    } catch {
      // Ignore localStorage storage quota or disabled errors
    }
  }, [])

  // Manage Cross-Tab synchronization (BroadcastChannel + storage event fallback)
  useEffect(() => {
    const currentUserId = user?.id
    if (!currentUserId) {
      broadcastChannelRef.current = null
      return undefined
    }

    const channelName = `qorvexa_notifications_${currentUserId}`
    let bc = null

    const handleSyncSignal = (senderTabId, senderUserId) => {
      // Discard messages from self
      if (senderTabId === tabIdRef.current) return
      // Discard messages from different accounts
      if (senderUserId && senderUserId !== currentUserId) return

      // Re-fetch unread count without echoing broadcast (prevents broadcast loops)
      triggerDebouncedRefresh(50)
    }

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel(channelName)
        bc.onmessage = (event) => {
          const data = event?.data
          if (data?.type === 'SYNC_NOTIFICATIONS') {
            handleSyncSignal(data.senderTabId, data.userId)
          }
        }
        broadcastChannelRef.current = bc
      } catch (err) {
        console.warn('BroadcastChannel initialization failed, using storage fallback:', err)
      }
    }

    const handleStorageEvent = (event) => {
      if (event.key === `qorvexa_notif_sync_${currentUserId}` && event.newValue) {
        const [senderTabId] = event.newValue.split('_')
        handleSyncSignal(senderTabId, currentUserId)
      }
    }

    window.addEventListener('storage', handleStorageEvent)

    return () => {
      if (bc) {
        bc.onmessage = null
        bc.close()
        if (broadcastChannelRef.current === bc) {
          broadcastChannelRef.current = null
        }
      }
      window.removeEventListener('storage', handleStorageEvent)
    }
  }, [user?.id, triggerDebouncedRefresh])

  // Single authoritative Supabase Realtime subscription per tab
  useEffect(() => {
    const currentUserId = user?.id
    if (!currentUserId) {
      setUnreadNotificationCount(0)
      return undefined
    }

    let active = true
    const client = getSupabaseClient()

    // Immediate initial count query on mount / login
    refreshUnreadCount()

    const channel = client
      .channel(`user-notifications-sync-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (!active) return

          // 1. Recount from Supabase (debounced to coalesce bursts)
          triggerDebouncedRefresh(150)

          // 2. Broadcast signal to other open tabs
          broadcastNotificationSync()

          // 3. Dispatch intra-page event for active toasts and view updates
          window.dispatchEvent(
            new CustomEvent('qorvexa:notification-realtime', { detail: payload })
          )
        }
      )
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED' && active) {
          // Re-validate count once subscription establishes
          triggerDebouncedRefresh(100)
        }
      })

    return () => {
      active = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      client.removeChannel(channel)
    }
  }, [user?.id, refreshUnreadCount, triggerDebouncedRefresh, broadcastNotificationSync])

  // Foreground revalidation: refresh when tab becomes visible or receives focus
  useEffect(() => {
    const currentUserId = user?.id
    if (!currentUserId) return undefined

    let lastForegroundCheck = 0

    const handleForegroundCheck = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        // Throttle to at most once per 1.5 seconds
        if (now - lastForegroundCheck > 1500) {
          lastForegroundCheck = now
          refreshUnreadCount()
        }
      }
    }

    document.addEventListener('visibilitychange', handleForegroundCheck)
    window.addEventListener('focus', handleForegroundCheck)

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundCheck)
      window.removeEventListener('focus', handleForegroundCheck)
    }
  }, [user?.id, refreshUnreadCount])

  const contextValue = useMemo(
    () => ({
      unreadNotificationCount,
      setUnreadNotificationCount,
      refreshUnreadCount,
      broadcastNotificationSync,
    }),
    [unreadNotificationCount, refreshUnreadCount, broadcastNotificationSync]
  )

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  )
}

export default NotificationProvider
