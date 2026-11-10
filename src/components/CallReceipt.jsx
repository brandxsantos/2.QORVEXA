import { Phone, Video, PhoneMissed, PhoneOff } from 'lucide-react'
import './CallReceipt.css'

function formatDuration(acceptedAt, endedAt) {
  if (!acceptedAt || !endedAt) return ''

  const seconds = Math.max(0, Math.floor(
    (new Date(endedAt).getTime() - new Date(acceptedAt).getTime()) / 1000,
  ))

  if (!Number.isFinite(seconds)) return ''

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function getCallLabel(session, currentUserId) {
  const isCaller = session.caller_id === currentUserId
  const callName = session.call_type === 'video' ? 'video call' : 'voice call'

  switch (session.status) {
    case 'ended':
      return {
        label: isCaller ? `Outgoing ${callName}` : `Incoming ${callName}`,
        duration: formatDuration(session.accepted_at, session.ended_at),
      }
    case 'declined':
      return {
        label: isCaller ? 'Call declined' : 'Declined call',
        duration: '',
      }
    case 'cancelled':
      return {
        label: 'Call cancelled',
        duration: '',
      }
    case 'expired':
      return {
        label: isCaller ? 'No answer' : `Missed ${callName}`,
        duration: '',
      }
    case 'accepted':
      return {
        label: `${isCaller ? 'Outgoing' : 'Incoming'} ${callName} · In progress`,
        duration: '',
      }
    case 'ringing':
      return {
        label: isCaller ? `Calling · ${callName}` : `Incoming ${callName}`,
        duration: '',
      }
    default:
      return { label: callName, duration: '' }
  }
}

export default function CallReceipt({ session, currentUserId }) {
  if (!session || !currentUserId) return null

  const isCaller = session.caller_id === currentUserId
  const isVideo = session.call_type === 'video'
  const isMissed = ['expired', 'declined', 'cancelled'].includes(session.status)
  const { label, duration } = getCallLabel(session, currentUserId)
  const timestamp = session.created_at

  const getIcon = () => {
    if (isMissed) {
      return !isCaller ? <PhoneMissed size={17} /> : <PhoneOff size={17} />
    }
    return isVideo ? <Video size={17} /> : <Phone size={17} />
  }

  return (
    <div className={`q-call-receipt ${isCaller ? 'q-call-receipt--own' : 'q-call-receipt--peer'} ${isMissed ? 'q-call-receipt--missed' : ''}`} role="note">
      <div className="q-call-receipt-card">
        <span className={`q-call-receipt-icon ${isMissed ? 'q-call-receipt-icon--missed' : ''}`} aria-hidden="true">
          {getIcon()}
        </span>
        <span className="q-call-receipt-details">
          <span className="q-call-receipt-label">
            {label}{duration ? ` · ${duration}` : ''}
          </span>
          {timestamp && (
            <time className="q-call-receipt-time" dateTime={timestamp}>
              {new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }).format(new Date(timestamp))}
            </time>
          )}
        </span>
      </div>
    </div>
  )
}

