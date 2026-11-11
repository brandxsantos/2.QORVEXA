import { useEffect, useRef, useState } from 'react'

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
  const containerRef = useRef(null)
  const selected = POST_REACTIONS.find((item) => item.type === reaction)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={`qv-reaction-picker${open ? ' is-open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className={`member-comments-toggle member-post-action-btn${selected ? ' is-active' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-pressed={Boolean(selected)}
        onClick={() => setOpen((value) => !value)}
        onContextMenu={(event) => {
          event.preventDefault()
          setOpen(true)
        }}
      >
        <span className="member-reaction-emoji" aria-hidden="true">{selected?.emoji || '👍'}</span>
        <span className="member-action-label">{selected?.label || 'Like'}{count > 0 ? ` · ${count}` : ''}</span>
      </button>
      {open && (
        <div className="qv-reaction-menu" role="group" aria-label="Choose a reaction">
          {POST_REACTIONS.map((item) => (
            <button
              type="button"
              key={item.type}
              title={item.label}
              aria-label={item.label}
              className={`qv-reaction-item${reaction === item.type ? ' is-selected' : ''}`}
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
