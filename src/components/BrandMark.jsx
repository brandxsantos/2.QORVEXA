function BrandMark({ compact = false }) {
  return (
    <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`}>
      <img
        className="brand-symbol"
        src="/qorvexa-favicon.png?v=5"
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      {!compact && <span className="brand-wordmark">QORVEXA</span>}
    </span>
  )
}

export default BrandMark


