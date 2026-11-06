import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from '../BrandMark.jsx'

function AuthLayout({ children, eyebrow, title, description }) {
  return (
    <main className="auth-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <header className="auth-header">
        <Link className="brand-link" to="/" aria-label="QORVEXA home">
          <BrandMark />
        </Link>
        <Link className="auth-back-link" to="/">
          <ArrowLeft size={15} aria-hidden="true" /> Back to home
        </Link>
      </header>

      <section className="auth-main">
        <div className="auth-intro">
          <span className="auth-intro-icon"><Sparkles size={17} aria-hidden="true" /></span>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          <div className="auth-privacy-note">
            <ShieldCheck size={16} aria-hidden="true" />
            Your account is protected with Supabase Authentication.
          </div>
        </div>
        <div className="auth-panel">{children}</div>
      </section>

      <footer className="auth-footer">
        <span>QORVEXA <span>·</span> Connect Beyond Limits.</span>
        <span>Be kind. Stay curious.</span>
      </footer>
    </main>
  )
}

export default AuthLayout
