import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase.js'
import ProtectedMediaImage from '../ProtectedMediaImage.jsx'

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
  const [suggestionType, setSuggestionType] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const Element = as === 'textarea' ? 'textarea' : 'input'
  const listId = `${props.id || 'social-input'}-suggestions`

  const beforeCaret = value.slice(0, caret)

  const mentionMatch = beforeCaret.match(/(^|[\s([{])@([a-z0-9_]{1,24})$/i)
  const mentionQuery = mentionMatch?.[2]?.toLowerCase() || ''

  const hashtagMatch = beforeCaret.match(/(^|[\s([{])#([a-z0-9_]{1,50})$/i)
  const hashtagQuery = hashtagMatch?.[2]?.toLowerCase() || ''

  const activeSuggestions = suggestions

  useEffect(() => {
    let active = true

    async function searchSuggestions() {
      if (mentionMatch && mentionQuery.length > 0) {
        setSuggestionType('mention')
        setSuggestions([])
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

        return
      }

      if (hashtagMatch && hashtagQuery.length > 0) {
        setSuggestionType('hashtag')
        setSuggestions([])
        setLoading(true)

        try {
          const { data, error } = await getSupabaseClient().rpc(
            'search_hashtag_suggestions',
            {
              search_prefix: hashtagQuery,
              result_limit: 6,
            }
          )

          if (!active) return
          if (error) throw error

          setSuggestions(data || [])
          setActiveIndex(0)
        } catch {
          if (active) setSuggestions([])
        } finally {
          if (active) setLoading(false)
        }

        return
      }

      setSuggestions([])
      setSuggestionType(null)
      setLoading(false)
    }

    const timer = window.setTimeout(searchSuggestions, 180)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [
    mentionQuery,
    hashtagQuery,
    Boolean(mentionMatch),
    Boolean(hashtagMatch),
  ])

  function updateCaret(event) {
    setCaret(event.target.selectionStart ?? event.target.value.length)
  }

  function insertSuggestion(item) {
    if (!inputRef.current) return

    const match = suggestionType === 'mention'
      ? mentionMatch
      : hashtagMatch

    if (!match) return

    const triggerPosition =
      caret - match[0].length + match[1].length

    const insertion = suggestionType === 'mention'
      ? `@${item.username} `
      : `#${item.hashtag} `

    const nextValue =
      value.slice(0, triggerPosition) +
      insertion +
      value.slice(caret)

    onChange(nextValue)
    setSuggestions([])
    setSuggestionType(null)

    const nextCaret = triggerPosition + insertion.length

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCaret, nextCaret)
      setCaret(nextCaret)
    })
  }

  function handleKeyDown(event) {
    if (activeSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => (
          (current + 1) % activeSuggestions.length
        ))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => (
          (current - 1 + activeSuggestions.length) %
          activeSuggestions.length
        ))
        return
      }

      if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        activeSuggestions[activeIndex]
      ) {
        event.preventDefault()
        insertSuggestion(activeSuggestions[activeIndex])
        return
      }

      if (event.key === 'Escape') {
        setSuggestions([])
        setSuggestionType(null)
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
        aria-controls={activeSuggestions.length ? listId : undefined}
        aria-expanded={activeSuggestions.length > 0}
      />

      {activeSuggestions.length > 0 && (
        <div className="smart-mention-list" id={listId} role="listbox">
          {suggestionType === 'mention' &&
            activeSuggestions.map((profile, index) => (
              <button
                type="button"
                key={profile.id}
                className={`smart-mention-option${index === activeIndex ? ' is-active' : ''}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertSuggestion(profile)}
              >
                <span className="smart-mention-avatar">
                  {profile.avatar_url
                    ? (
                      <ProtectedMediaImage
                        path={profile.avatar_url}
                        alt=""
                        fallback={
                          profile.display_name?.charAt(0) ||
                          profile.username.charAt(0)
                        }
                      />
                    )
                    : (
                      profile.display_name?.charAt(0) ||
                      profile.username.charAt(0)
                    )}
                </span>
                <span className="smart-mention-details">
                  <strong>
                    {profile.display_name || profile.username}
                  </strong>
                  <small>@{profile.username}</small>
                </span>
              </button>
            ))}

          {suggestionType === 'hashtag' &&
            activeSuggestions.map((item, index) => (
              <button
                type="button"
                key={item.hashtag}
                className={`smart-mention-option${index === activeIndex ? ' is-active' : ''}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertSuggestion(item)}
              >
                <span className="smart-mention-avatar">
                  #
                </span>
                <span className="smart-mention-details">
                  <strong>#{item.hashtag}</strong>
                  <small>
                    {Number(item.post_count).toLocaleString()} {Number(item.post_count) === 1 ? 'post' : 'posts'}
                  </small>
                </span>
              </button>
            ))}
        </div>
      )}

      {loading && (
        <span className="smart-mention-loading">
          {suggestionType === 'hashtag'
            ? 'Searching hashtags…'
            : 'Searching members…'}
        </span>
      )}
    </div>
  )
}

export default SmartTextInput
