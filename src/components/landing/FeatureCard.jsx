function FeatureCard({ icon: Icon, number, title, description }) {
  return (
    <article className="feature-card">
      <div className="feature-card__top">
        <span className="feature-icon">
          <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span className="feature-number">{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  )
}

export default FeatureCard
