import { Check, CheckCheck } from 'lucide-react'
import ProtectedMediaImage from './ProtectedMediaImage.jsx'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export function formatStatusTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function MessageStatusIndicator({
  message,
  peerReadAt,
  peerDeliveredAt,
  peer,
  isLastSeen = false,
  formatTimeFn = formatStatusTime,
}) {
  if (!message) return null

  const msgTime = new Date(message.created_at).getTime()
  const readTime = peerReadAt ? new Date(peerReadAt).getTime() : 0
  const deliveredTime = peerDeliveredAt ? new Date(peerDeliveredAt).getTime() : 0

  const isSeen = readTime >= msgTime
  const isDelivered = deliveredTime >= msgTime

  const peerName = peer?.display_name || peer?.username || 'Recipient'
  const peerAvatar = peer?.avatar_url || peer?.avatar_url_resolved

  // 1. SEEN
  if (isSeen) {
    const seenLabel = `Seen by ${peerName} at ${formatTimeFn(peerReadAt)}`

    // On the last seen message (Messenger style), show the recipient's small circular avatar
    if (isLastSeen && peerAvatar) {
      return (
        <span
          className="qv-message-status-indicator is-seen has-avatar"
          title={seenLabel}
          aria-label={seenLabel}
        >
          <ProtectedMediaImage
            className="qv-message-status-seen-avatar"
            path={peerAvatar}
            alt={peerName}
            fallback={
              <span className="qv-message-status-seen-initials">
                {initials(peerName)}
              </span>
            }
          />
        </span>
      )
    }

    if (isLastSeen) {
      return (
        <span
          className="qv-message-status-indicator is-seen has-initials"
          title={seenLabel}
          aria-label={seenLabel}
        >
          <span className="qv-message-status-seen-initials">
            {initials(peerName)}
          </span>
        </span>
      )
    }

    // Earlier seen messages: subtle double check in active seen tint
    return (
      <span
        className="qv-message-status-indicator is-seen"
        title={seenLabel}
        aria-label={seenLabel}
      >
        <CheckCheck size={13} strokeWidth={2.4} />
      </span>
    )
  }

  // 2. DELIVERED
  if (isDelivered) {
    return (
      <span
        className="qv-message-status-indicator is-delivered"
        title={`Delivered to ${peerName}`}
        aria-label="Delivered"
      >
        <CheckCheck size={13} strokeWidth={2.2} />
      </span>
    )
  }

  // 3. SENT
  return (
    <span
      className="qv-message-status-indicator is-sent"
      title="Sent to server"
      aria-label="Sent"
    >
      <Check size={12} strokeWidth={2.2} />
    </span>
  )
}
