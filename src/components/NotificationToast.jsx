import { Bell, X } from 'lucide-react'

function NotificationToast({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className="notification-toast" role="status" aria-live="polite">
      <Bell size={16} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}><X size={15} aria-hidden="true" /></button>
    </div>
  )
}

export default NotificationToast
