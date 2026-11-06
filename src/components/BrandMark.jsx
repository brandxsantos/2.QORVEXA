function BrandMark({ compact = false }) {
  return (
    <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`}>
      <svg
        className="brand-symbol"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20 3.5 36.5 13v14L20 36.5 3.5 27V13L20 3.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="m13 26 7-13 7 13M15.5 21.5h9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <circle cx="20" cy="20" r="2" fill="currentColor" />
      </svg>
      {!compact && <span className="brand-wordmark">QORVEXA</span>}
    </span>
  )
}

export default BrandMark
