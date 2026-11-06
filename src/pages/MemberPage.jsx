import { LogOut, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'

function MemberPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const name = user.user_metadata?.display_name || user.user_metadata?.username || 'there'

  async function handleSignOut() {
    setError('')
    setSigningOut(true)

    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut()
      if (signOutError) throw signOutError
      navigate('/', { replace: true })
    } catch (signOutError) {
      setError(signOutError.message || 'We could not sign you out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main className="member-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />
      <header className="member-header">
        <Link className="brand-link" to="/"><BrandMark /></Link>
        <button className="button button--outline member-signout" type="button" onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={15} aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>
      <section className="member-welcome">
        <div className="member-icon"><ShieldCheck size={25} aria-hidden="true" /></div>
        <p className="eyebrow">YOUR ACCOUNT IS READY</p>
        <h1>Welcome to your<br /><span>next chapter, {name}.</span></h1>
        <p className="member-description">
          You’re signed in. Your QORVEXA community feed is the next part we’re building.
        </p>
        <div className="member-email">{user.email}</div>
        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      </section>
      <footer className="auth-footer">
        <span>QORVEXA <span>·</span> Connect Beyond Limits.</span>
        <Link to="/">Back to home</Link>
      </footer>
    </main>
  )
}

export default MemberPage
