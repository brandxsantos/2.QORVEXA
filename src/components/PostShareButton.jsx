import { useState } from 'react'
import { Share2 } from 'lucide-react'

export default function PostShareButton({ url, title = 'Post on QORVEXA' }) {
  const [status, setStatus] = useState('')

  async function handleShare() {
    const fullUrl = new URL(url, window.location.origin).toString()

    if (navigator.share) {
      try {
        await navigator.share({ title, url: fullUrl })
        return
      } catch (error) {
        if (error.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl)
    } catch {
      const input = document.createElement('textarea')
      input.value = fullUrl
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      const copied = document.execCommand('copy')
      input.remove()
      if (!copied) return
    }

    setStatus('Copied!')
    window.setTimeout(() => setStatus(''), 1800)
  }

  return (
    <button className="member-comments-toggle member-post-action-btn" type="button" onClick={handleShare}>
      <Share2 size={14} aria-hidden="true" />
      <span className="member-action-label">{status || 'Share'}</span>
    </button>
  )
}
