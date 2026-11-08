import { useState } from 'react'

export const POST_REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'care', emoji: '🥰', label: 'Care' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'angry', emoji: '😡', label: 'Angry' },
]

export default function PostReactionButton({ reaction, count = 0, disabled = false, onReact }) {
  const [open, setOpen] = useState(false)
  const selected = POST_REACTIONS.find((item) => item.type === reaction)

  return (
    <div className="qv-reaction-picker">
      <button
        type="button"
        className={`member-comments-toggle${selected ? ' is-active' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-pressed={Boolean(selected)}
        onClick={() => setOpen((value) => !value)}
        onContextMenu={(event) => {
          event.preventDefault()
          setOpen(true)
        }}
      >
        <span aria-hidden="true">{selected?.emoji || '👍'}</span>
        <span>{selected?.label || 'Like'} · {count}</span>
      </button>
      {open && (
        <div className="qv-reaction-menu" role="group" aria-label="Choose a reaction">
          {POST_REACTIONS.map((item) => (
            <button
              type="button"
              key={item.type}
              title={item.label}
              aria-label={item.label}
              className={reaction === item.type ? 'is-selected' : ''}
              disabled={disabled}
              onClick={() => {
                onReact(item.type)
                setOpen(false)
              }}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
