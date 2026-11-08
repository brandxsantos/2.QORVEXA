import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase.js'

function SmartTextInput({
  as = 'input',
  value = '',
  onChange,
  rows,
  className = '',
  ...props
}) {
  const inputRef = useRef(null)
  const [caret, setCaret] = useState(0)
  const [suggestions, setSuggestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const Element = as === 'textarea' ? 'textarea' : 'input'
  const listId = `${props.id || 'social-input'}-mention-suggestions`

  const beforeCaret = value.slice(0, caret)
  const mentionMatch = beforeCaret.match(/(^|[\s([{])@([a-z0-9_]{1,24})$/i)
  const mentionQuery = mentionMatch?.[2]?.toLowerCase() || ''

  useEffect(() => {
    let active = true

    if (!mentionMatch || mentionQuery.length < 1) {
      setSuggestions([])
      setLoading(false)
      return undefined
    }

    const timer = window.setTimeout(async () => {
      setLoading(true)

      try {
        const { data, error } = await getSupabaseClient()
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .ilike('username', `${mentionQuery}%`)
          .order('username', { ascending: true })
          .limit(6)

        if (!active) return
        if (error) throw error

        setSuggestions(data || [])
        setActiveIndex(0)
      } catch {
        if (active) setSuggestions([])
      } finally {
        if (active) setLoading(false)
      }
    }, 180)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [mentionQuery, Boolean(mentionMatch)])

  function updateCaret(event) {
    setCaret(event.target.selectionStart ?? event.target.value.length)
  }

  function selectSuggestion(profile) {
    if (!mentionMatch || !inputRef.current) return

    const atPosition = caret - mentionMatch[0].length + mentionMatch[1].length
    const insertion = `@${profile.username} `
    const nextValue = value.slice(0, atPosition) + insertion + value.slice(caret)

    onChange(nextValue)
    setSuggestions([])

    const nextCaret = atPosition + insertion.length

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCaret, nextCaret)
      setCaret(nextCaret)
    })
  }

  function handleKeyDown(event) {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => (current + 1) % suggestions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => (
          current - 1 + suggestions.length
        ) % suggestions.length)
        return
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && suggestions[activeIndex]) {
        event.preventDefault()
        selectSuggestion(suggestions[activeIndex])
        return
      }

      if (event.key === 'Escape') {
        setSuggestions([])
        return
      }
    }

    props.onKeyDown?.(event)
  }

  return (
    <div className="smart-text-input-wrap">
      <Element
        {...props}
        ref={inputRef}
        rows={Element === 'textarea' ? rows : undefined}
        className={className}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setCaret(event.target.selectionStart ?? event.target.value.length)
        }}
        onClick={updateCaret}
        onKeyUp={updateCaret}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={suggestions.length ? listId : undefined}
        aria-expanded={suggestions.length > 0}
      />

      {suggestions.length > 0 && (
        <div className="smart-mention-list" id={listId} role="listbox">
          {suggestions.map((profile, index) => (
            <button
              type="button"
              key={profile.id}
              className={`smart-mention-option${index === activeIndex ? ' is-active' : ''}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(profile)}
            >
              <span className="smart-mention-avatar">
                {profile.display_name?.charAt(0) || profile.username.charAt(0)}
              </span>
              <span className="smart-mention-details">
                <strong>{profile.display_name || profile.username}</strong>
                <small>@{profile.username}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && mentionMatch && suggestions.length === 0 && (
        <span className="smart-mention-loading">Searching members…</span>
      )}
    </div>
  )
}

export default SmartTextInput
