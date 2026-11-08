import { Link } from 'react-router-dom'

function LinkedText({ text = '' }) {
  const pattern = /(^|[\s([{])([#@])([\p{L}\p{N}_]+)/gu
  const parts = []
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, prefix, symbol, value] = match
    const tokenStart = match.index + prefix.length

    if (tokenStart > lastIndex) {
      parts.push(text.slice(lastIndex, tokenStart))
    }

    const href = symbol === '@'
      ? `/profile/${encodeURIComponent(value)}`
      : `/hashtag/${encodeURIComponent(value)}`

    parts.push(
      <Link
        key={`${tokenStart}-${symbol}-${value}`}
        className={symbol === '@' ? 'social-mention' : 'social-hashtag'}
        to={href}
      >
        {symbol}{value}
      </Link>
    )

    lastIndex = tokenStart + symbol.length + value.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <>{parts}</>
}

export default LinkedText
