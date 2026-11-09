import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Smile } from 'lucide-react'

const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'care', emoji: '🤗', label: 'Care' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'angry', emoji: '😡', label: 'Angry' },
]

export default function MessageInteractions({
  message,
  replyMessage,
  reactions = [],
  currentUserId,
  onReply,
  onReact,
  onJump,
  footer = null,
  bubbleClassName = '',
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ top: 12, left: 12 })
  const triggerRef = useRef(null)
  const pickerRef = useRef(null)
  const isOwn = message.sender_id === currentUserId

  useLayoutEffect(() => {
    if (!pickerOpen) return

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const picker = pickerRef.current
      if (!trigger || !picker) return

      const rect = picker.getBoundingClientRect()
      const margin = 12
      const gap = 8
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
      const preferredLeft = trigger.left + trigger.width / 2 - rect.width / 2
      const left = Math.min(Math.max(margin, preferredLeft), maxLeft)

      let top = trigger.top - rect.height - gap
      if (top < margin) top = trigger.bottom + gap
      if (top + rect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - rect.height - margin)
      }

      setPickerPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [pickerOpen])

  useEffect(() => {
    if (!pickerOpen) return

    const closeOnOutsideClick = (event) => {
      if (
        !pickerRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) setPickerOpen(false)
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPickerOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [pickerOpen])

  const groupedReactions = REACTIONS.map((reaction) => {
    const matching = reactions.filter((item) => item.reaction_type === reaction.type)
    const names = matching.map((item) =>
      item.user_id === currentUserId ? 'You' : item.reactor_name || 'QORVEXA member',
    )

    return {
      ...reaction,
      count: matching.length,
      active: matching.some((item) => item.user_id === currentUserId),
      names,
    }
  }).filter((reaction) => reaction.count > 0)

  function chooseReaction(type) {
    onReact?.(message, type)
    setPickerOpen(false)
  }

  return (
    <div className={`qv-message-layout${isOwn ? ' is-own' : ' is-incoming'}`}>
      <div className={`qv-message-bubble-content ${bubbleClassName}`.trim()}>
        {replyMessage && (
          <button
            type="button"
            className="qv-message-reply-preview"
            onClick={() => onJump?.(replyMessage.id)}
            title="Jump to original message"
          >
            <MessageCircle size={12} />
            <span>
              <strong>Replying to {replyMessage.sender_id === currentUserId ? 'yourself' : 'message'}</strong>
              <span>{replyMessage.content}</span>
            </span>
          </button>
        )}

        <p className="qv-message-content">{message.content}</p>

        {footer && <div className="qv-message-footer">{footer}</div>}
      </div>

      <div className="qv-message-side-actions">
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setPickerOpen((open) => !open)}
          aria-label="React to message"
          aria-expanded={pickerOpen}
          title="React"
        >
          <Smile size={15} />
        </button>
        <button
          type="button"
          onClick={() => onReply?.(message)}
          aria-label="Reply to message"
          title="Reply"
        >
          <MessageCircle size={15} />
        </button>

        {pickerOpen && createPortal(
          <div
            ref={pickerRef}
            className="qv-message-reaction-picker qv-message-reaction-picker--floating"
            role="group"
            aria-label="Choose a reaction"
            style={{
              position: 'fixed',
              top: pickerPosition.top,
              left: pickerPosition.left,
              right: 'auto',
              bottom: 'auto',
              zIndex: 10000,
            }}
          >
            {REACTIONS.map((reaction) => (
              <button
                type="button"
                key={reaction.type}
                onClick={() => chooseReaction(reaction.type)}
                title={reaction.label}
                aria-label={reaction.label}
              >
                {reaction.emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>

      {groupedReactions.length > 0 && (
        <div className="qv-message-reaction-list">
          {groupedReactions.map((reaction) => (
            <button
              type="button"
              key={reaction.type}
              className={`qv-message-reaction${reaction.active ? ' is-active' : ''}`}
              onClick={() => chooseReaction(reaction.type)}
              title={`${reaction.label}: ${reaction.names.join(', ')}`}
              aria-label={`${reaction.label}: ${reaction.count}. Reacted by ${reaction.names.join(', ')}`}
            >
              <span>{reaction.emoji}</span>
              <span>{reaction.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
