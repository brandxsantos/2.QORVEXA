import { useState } from 'react'

const emojis = ['😀', '😃', '😂', '🥰', '😍', '😮', '😢', '😭', '😡', '👍', '👎', '❤️', '💙', '🙏', '🎉', '🔥']

export default function EmojiPicker({ onSelect, label = 'Choose emoji' }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="qv-emoji-picker">
      <button
        type="button"
        className="qv-emoji-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ☺
      </button>
      {open && (
        <div className="qv-emoji-menu" role="group" aria-label={label}>
          {emojis.map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => {
                onSelect(emoji)
                setOpen(false)
              }}
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
