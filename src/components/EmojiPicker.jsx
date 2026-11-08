import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { createPortal } from 'react-dom'

const groups = [
  {
    name: 'Smileys',
    icon: '😀',
    items: [
      ['😀', 'grinning happy smile'], ['😃', 'smiling happy'], ['😄', 'smile eyes'],
      ['😁', 'beaming grin'], ['😆', 'laughing'], ['😂', 'tears joy laugh'],
      ['🤣', 'rolling floor laughing'], ['🥹', 'touched holding tears'],
      ['😊', 'blush happy'], ['😇', 'angel innocent'], ['🙂', 'slight smile'],
      ['🙃', 'upside down'], ['😉', 'wink'], ['😍', 'heart eyes love'],
      ['🥰', 'smiling hearts love'], ['😘', 'kiss'], ['😋', 'yummy'],
      ['😎', 'cool sunglasses'], ['🤩', 'star struck excited'], ['🥳', 'party'],
      ['😭', 'crying tears'], ['😢', 'sad cry'], ['🥺', 'pleading'],
      ['😤', 'frustrated'], ['😡', 'angry'], ['🤯', 'mind blown'],
      ['😱', 'scream shocked'], ['🤔', 'thinking'], ['🫡', 'salute'],
      ['🤗', 'hug'], ['🤭', 'giggle'], ['😴', 'sleep']
    ]
  },
  {
    name: 'Hands',
    icon: '👋',
    items: [
      ['👋', 'wave hello goodbye'], ['🤚', 'raised hand'], ['✋', 'stop hand'],
      ['🖐️', 'hand fingers'], ['👌', 'okay'], ['🤌', 'pinched fingers'],
      ['🤏', 'small'], ['✌️', 'peace'], ['🤞', 'fingers crossed'],
      ['🫰', 'finger heart'], ['🤟', 'love you'], ['🤘', 'rock on'],
      ['🤙', 'call me'], ['👈', 'point left'], ['👉', 'point right'],
      ['👆', 'point up'], ['👇', 'point down'], ['☝️', 'index finger'],
      ['👍', 'thumbs up like'], ['👎', 'thumbs down dislike'],
      ['✊', 'fist'], ['👊', 'punch fist bump'], ['👏', 'clap applause'],
      ['🙌', 'celebrate hands'], ['👐', 'open hands'], ['🤲', 'palms'],
      ['🙏', 'pray thanks please'], ['💪', 'strong muscle']
    ]
  },
  {
    name: 'Hearts',
    icon: '❤️',
    items: [
      ['❤️', 'red heart love'], ['🩷', 'pink heart'], ['🧡', 'orange heart'],
      ['💛', 'yellow heart'], ['💚', 'green heart'], ['💙', 'blue heart'],
      ['🩵', 'light blue heart'], ['💜', 'purple heart'], ['🤎', 'brown heart'],
      ['🖤', 'black heart'], ['🩶', 'gray heart'], ['🤍', 'white heart'],
      ['💔', 'broken heart'], ['❤️‍🔥', 'heart fire'], ['❤️‍🩹', 'healing heart'],
      ['💕', 'two hearts'], ['💞', 'revolving hearts'], ['💓', 'beating heart'],
      ['💗', 'growing heart'], ['💖', 'sparkling heart'], ['💘', 'cupid heart'],
      ['💝', 'heart gift']
    ]
  },
  {
    name: 'Celebration',
    icon: '🎉',
    items: [
      ['🎉', 'party popper celebrate'], ['🎊', 'confetti'], ['🎈', 'balloon'],
      ['🎂', 'birthday cake'], ['🎁', 'gift present'], ['🏆', 'trophy winner'],
      ['🥇', 'gold medal'], ['🔥', 'fire hot'], ['✨', 'sparkles'],
      ['⭐', 'star'], ['🌟', 'glowing star'], ['💫', 'dizzy star'],
      ['⚡', 'lightning'], ['💥', 'boom'], ['🌈', 'rainbow'],
      ['☀️', 'sun'], ['🌻', 'sunflower'], ['🍀', 'lucky clover']
    ]
  },
  {
    name: 'Food',
    icon: '🍕',
    items: [
      ['🍕', 'pizza'], ['🍔', 'burger'], ['🍟', 'fries'], ['🌭', 'hotdog'],
      ['🍿', 'popcorn'], ['🍩', 'donut'], ['🍪', 'cookie'], ['🎂', 'cake'],
      ['🍫', 'chocolate'], ['🍓', 'strawberry'], ['🍉', 'watermelon'],
      ['🍒', 'cherries'], ['🥑', 'avocado'], ['☕', 'coffee'], ['🧋', 'milk tea'],
      ['🥤', 'drink'], ['🍜', 'noodles'], ['🍣', 'sushi']
    ]
  },
  {
    name: 'Animals',
    icon: '🐶',
    items: [
      ['🐶', 'dog'], ['🐱', 'cat'], ['🐭', 'mouse'], ['🐹', 'hamster'],
      ['🐰', 'rabbit'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
      ['🐨', 'koala'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐔', 'chicken'],
      ['🐧', 'penguin'], ['🦋', 'butterfly'], ['🐢', 'turtle'], ['🦄', 'unicorn']
    ]
  },
  {
    name: 'Symbols',
    icon: '💯',
    items: [
      ['💯', '100 perfect'], ['✅', 'check done'], ['❌', 'cross no'],
      ['⚠️', 'warning'], ['❗', 'exclamation'], ['❓', 'question'],
      ['💬', 'speech message'], ['💭', 'thought'], ['🔔', 'bell notification'],
      ['🎵', 'music note'], ['🔒', 'lock'], ['💡', 'idea lightbulb'],
      ['🚀', 'rocket launch'], ['📌', 'pin'], ['👀', 'eyes looking'],
      ['💤', 'sleep zzz'], ['♻️', 'recycle'], ['➕', 'plus']
    ]
  }
]

export default function EmojiPicker({ onSelect, label = 'Choose emoji' }) {
  const [open, setOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState('Smileys')
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState({ top: 12, left: 12 })

  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (term) {
      return groups.flatMap((group) => group.items)
        .filter(([emoji, keywords]) => `${emoji} ${keywords}`.toLowerCase().includes(term))
    }
    return groups.find((group) => group.name === activeGroup)?.items || groups[0].items
  }, [activeGroup, search])

  useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const menu = menuRef.current

      if (!trigger || !menu) return

      const menuRect = menu.getBoundingClientRect()
      const margin = 12
      const gap = 8

      const maxLeft = Math.max(
        margin,
        window.innerWidth - menuRect.width - margin
      )

      const left = Math.min(Math.max(margin, trigger.left), maxLeft)

      let top = trigger.top - menuRect.height - gap

      if (top < margin) {
        top = trigger.bottom + gap
      }

      if (top + menuRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - menuRect.height - margin)
      }

      setPosition({ top, left })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, activeGroup, search])

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event) => {
      if (
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function chooseEmoji(emoji) {
    onSelect?.(emoji)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="qv-emoji-picker">
      <button
        ref={triggerRef}
        type="button"
        className="qv-emoji-trigger"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Smile size={21} strokeWidth={2} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="qv-emoji-menu qv-emoji-menu--enhanced qv-emoji-menu--floating"
          role="dialog"
          aria-label={label}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            right: 'auto',
            bottom: 'auto',
            zIndex: 10000,
          }}
        >
          <input
            className="qv-emoji-search"
            type="search"
            placeholder="Search emojis..."
            aria-label="Search emojis"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {!search && (
            <div className="qv-emoji-categories" aria-label="Emoji categories">
              {groups.map((group) => (
                <button
                  type="button"
                  key={group.name}
                  className={activeGroup === group.name ? 'is-active' : ''}
                  onClick={() => setActiveGroup(group.name)}
                  aria-label={group.name}
                  title={group.name}
                >
                  {group.icon}
                </button>
              ))}
            </div>
          )}

          <div className="qv-emoji-grid">
            {visibleItems.map(([emoji, keywords]) => (
              <button
                type="button"
                key={`${emoji}-${keywords}`}
                onClick={() => chooseEmoji(emoji)}
                aria-label={`Insert ${keywords}`}
                title={keywords}
              >
                {emoji}
              </button>
            ))}
            {!visibleItems.length && <p className="qv-emoji-empty">No emojis found.</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
