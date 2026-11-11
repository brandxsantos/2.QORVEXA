import { useContext } from 'react'
import NotificationContext from './notificationContext.js'

const DEFAULT_NOTIFICATION_VALUE = {
  unreadNotificationCount: 0,
  setUnreadNotificationCount: () => {},
  refreshUnreadCount: async () => 0,
  broadcastNotificationSync: () => {},
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  return context || DEFAULT_NOTIFICATION_VALUE
}

export default useNotifications
