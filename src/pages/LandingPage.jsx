import {
  ArrowDown,
  ArrowRight,
  Code2,
  Globe2,
  Heart,
  LockKeyhole,
  MessageCircle,
  Radio,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'
import FeatureCard from '../components/landing/FeatureCard.jsx'

const features = [
  {
    icon: Users,
    number: '01',
    title: 'Find your people',
    description:
      'Meet curious minds, creators, and builders who are excited about the same things you are.',
  },
  {
    icon: MessageCircle,
    number: '02',
    title: 'Make it a conversation',
    description:
      'Share what you are working on, exchange ideas, and keep the good conversations going.',
  },
  {
    icon: LockKeyhole,
    number: '03',
    title: 'Built with care',
    description:
      'Privacy and thoughtful community tools are part of the foundation, not an afterthought.',
  },
]

function LandingPage() {
  return (
    <main className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <div className="matrix-grid" aria-hidden="true" />

      <header className="site-header">
        <a className="brand-link" href="#top" aria-label="QORVEXA home">
          <BrandMark />
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#features">The vision</a>
          <a href="#community">Community</a>
        </nav>
        <div className="header-actions">
          <Link className="login-link" to="/login">Log in</Link>
          <Link className="button button--small button--outline" to="/signup">
            Get started <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section className="hero-section page-width" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> A NEW SOCIAL SPACE</p>
          <h1 id="hero-title">
            Connect
            <br />
            beyond <span>limits.</span>
          </h1>
          <p className="hero-description">
            A place for the curious, the creative, and the people building what comes next.
            Find your community and make something meaningful together.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/signup">
              Get started <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="text-link" href="#features">
              Explore the vision <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="hero-caption">
            <span className="caption-line" />
            <span>Made for people who think beyond the feed.</span>
          </div>
        </div>

        <div className="hero-art" aria-label="Preview of the QORVEXA community">
          <div className="orbit orbit--outer" aria-hidden="true" />
          <div className="orbit orbit--inner" aria-hidden="true" />
          <div className="orbit-core" aria-hidden="true">
            <BrandMark compact />
          </div>
          <div className="orbit-node orbit-node--top"><Code2 size={17} /></div>
          <div className="orbit-node orbit-node--right"><Globe2 size={17} /></div>
          <div className="orbit-node orbit-node--bottom"><Sparkles size={17} /></div>
          <div className="orbit-node orbit-node--left"><Radio size={17} /></div>
          <div className="floating-label floating-label--top">
            <span className="label-dot" /> Ideas in motion
          </div>
          <div className="floating-label floating-label--bottom">
            <Users size={15} aria-hidden="true" /> A community without borders
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="QORVEXA tagline">
        <div className="ticker-track">
          <span>CONNECT BEYOND LIMITS</span><span className="ticker-star">âœ³</span>
          <span>FIND YOUR PEOPLE</span><span className="ticker-star">âœ³</span>
          <span>BUILD WHAT&apos;S NEXT</span><span className="ticker-star">âœ³</span>
          <span>CONNECT BEYOND LIMITS</span><span className="ticker-star">âœ³</span>
          <span>FIND YOUR PEOPLE</span><span className="ticker-star">âœ³</span>
          <span>BUILD WHAT&apos;S NEXT</span><span className="ticker-star">âœ³</span>
        </div>
      </section>

      <section className="features-section page-width" id="features">
        <div className="section-heading">
          <p className="eyebrow"><span className="eyebrow-dot" /> THE QORVEXA VISION</p>
          <h2>More than a feed.<br /><span>A place to belong.</span></h2>
          <p className="section-description">
            Social should bring people closer to the things they care about. We&apos;re building
            a space that starts with people and grows with its community.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => <FeatureCard key={feature.number} {...feature} />)}
        </div>
      </section>

      <section className="community-section page-width" id="community">
        <div className="community-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT TAB, MAYBE?</p>
          <h2>Good things happen<br />when we <span>find each other.</span></h2>
          <p>
            QORVEXA is at the beginning. We&apos;re shaping the experience around meaningful
            conversations, shared curiosity, and communities that feel like yours.
          </p>
          <Link className="button button--primary" to="/signup">
            Join QORVEXA <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>

        <div className="community-preview" aria-label="Illustrative community preview">
          <div className="preview-topbar">
            <div className="preview-window-dots" aria-hidden="true"><i /><i /><i /></div>
            <span>COMMUNITY PREVIEW</span>
            <span className="preview-live"><span className="label-dot" /> EARLY BUILD</span>
          </div>
          <article className="preview-post">
            <div className="post-avatar avatar--cyan">K</div>
            <div className="post-content">
              <div className="post-meta"><strong>kai.builds</strong><span>in Makers &amp; Ideas</span><span>Â· 2m</span></div>
              <p>What if the internet felt a little more like your favorite corner of a cafÃ©?</p>
              <div className="post-tags"><span>#community</span><span>#buildinpublic</span></div>
              <div className="post-actions">
                <span><Heart size={15} aria-hidden="true" /> 24</span>
                <span><MessageCircle size={15} aria-hidden="true" /> 8 replies</span>
              </div>
            </div>
          </article>
          <article className="preview-post preview-post--second">
            <div className="post-avatar avatar--violet">N</div>
            <div className="post-content">
              <div className="post-meta"><strong>nora.codes</strong><span>in Creative Tech</span><span>Â· 8m</span></div>
              <p>Shipped a tiny experiment today. Small steps count. âœ¨</p>
              <div className="post-actions">
                <span><Heart size={15} aria-hidden="true" /> 12</span>
                <span><MessageCircle size={15} aria-hidden="true" /> 3 replies</span>
              </div>
            </div>
          </article>
          <div className="preview-note">
            <Zap size={14} aria-hidden="true" />
            Illustrative preview Â· social features are still in development
          </div>
        </div>
      </section>

      <section className="access-section page-width" id="account-access">
        <div className="access-card">
          <div className="access-icon"><LockKeyhole size={21} aria-hidden="true" /></div>
          <div>
            <p className="eyebrow">MEMBER ACCESS</p>
            <h2>Your next conversation starts here.</h2>
            <p>
              Create an account to get started, or log in if youâ€™re already part of QORVEXA.
            </p>
          </div>
          <div className="access-actions">
            <Link className="button button--primary" to="/signup">Create account</Link>
            <Link className="text-link access-link" to="/login">Log in <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <footer className="site-footer page-width">
        <a className="brand-link" href="#top" aria-label="QORVEXA home"><BrandMark /></a>
        <p className="footer-tagline">Connect Beyond Limits.</p>
        <nav className="footer-nav" aria-label="Footer navigation">
          <a href="#features">About</a>
          <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
          <a href="#contact">Contact</a>
        </nav>
        <div className="footer-disclosures">
          <p id="privacy"><strong>Privacy:</strong> Learn how QORVEXA collects, uses, and protects your information in our <Link to="/privacy">Privacy Policy</Link>.</p>
         
          <p id="contact"><strong>Contact:</strong> Contact details will be published before early access opens.</p>
        </div>
        <p className="copyright">Â© 2026 QORVEXA. Built for the curious.</p>
      </footer>
    </main>
  )
}

export default LandingPage

