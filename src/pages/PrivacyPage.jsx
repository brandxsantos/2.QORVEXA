import { ArrowLeft, ArrowUp, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'

const sections = [
  {
    title: '1. About This Privacy Policy',
    content: [
      'This Privacy Policy explains how QORVEXA collects, uses, stores, protects, and shares personal information when you create an account or use the platform.',
      'QORVEXA is a social networking platform that allows members to create profiles, publish posts, interact with other members, exchange messages, and use community features.',
      'This policy is intended to explain our data practices in accordance with applicable privacy laws, including the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), where applicable.'
    ]
  },
  {
    title: '2. Information We Collect',
    content: [
      'We collect information that you provide when creating an account, completing your profile, using platform features, or communicating with other members.'
    ],
    bullets: [
      'Account information: email address, username, display name, and account identifier.',
      'Authentication information: account credentials and authentication-related information processed through Supabase Auth. QORVEXA does not need access to your password in readable plain text.',
      'Profile information: biography, profile photo, cover photo, location, website, education, workplace, gender, birthdate, phone number, and profile visibility preferences when you choose to provide them.',
      'Community activity: posts, comments, replies, likes, bookmarks, friend requests, friendships, and other interactions.',
      'Communications: messages exchanged through QORVEXA messaging features and related conversation information.',
      'Platform activity: notifications, account preferences, reports, moderation records, and security-related information needed to operate and protect the service.',
      'Uploaded content: images and other supported media files that you choose to upload.'
    ]
  },
  {
    title: '3. Information You Choose to Provide',
    content: [
      'You decide which optional profile details and content to provide. Some information is necessary to create and maintain an account, while other details are optional.',
      'Please avoid publishing sensitive personal information in public profile fields, posts, comments, or other areas that may be visible to other members.',
      'You are responsible for ensuring that information you submit is accurate and that you have the right to share any content you upload.'
    ]
  },
  {
    title: '4. Social and Community Activity',
    content: [
      'When you use QORVEXA, the platform processes information needed to provide social features. This can include posts, comments, replies, reactions, bookmarks, friend requests, friendships, messages, notifications, and reports.',
      'Information associated with these activities may be processed to display content, deliver messages, maintain conversations, notify members, and support community safety.'
    ]
  },
  {
    title: '5. How We Use Your Information',
    content: [
      'QORVEXA uses personal information for legitimate platform operations and other purposes permitted by applicable law, including:'
    ],
    bullets: [
      'Create, authenticate, and maintain member accounts.',
      'Display profiles and provide profile visibility controls.',
      'Publish and display posts, comments, and other community content.',
      'Enable friendships, messaging, notifications, and other social features.',
      'Store and deliver uploaded profile photos, cover photos, and post media.',
      'Protect accounts, investigate suspicious activity, and help prevent abuse, spam, fraud, or unauthorized access.',
      'Review reports, enforce the Terms of Service, and apply appropriate moderation actions.',
      'Respond to support requests and communicate important service or policy updates.',
      'Maintain, troubleshoot, and improve platform reliability, functionality, and security.',
      'Comply with applicable legal obligations and respond to lawful requests.'
    ]
  },
  {
    title: '6. Profile, Post, and Message Visibility',
    content: [
      'QORVEXA provides visibility settings for supported profile information and posts. Depending on the feature and your selected settings, information may be available to the public, friends, or only you.',
      'Posts support public, friends, and only-me visibility options. Profile visibility and certain profile details also have visibility controls.',
      'Your choices do not necessarily control information that another member has independently copied, saved, or shared. Content you make public may be viewed or redistributed by others.',
      'Messages are designed for the participants in the relevant conversation. They are processed by the platform to deliver and maintain the messaging service and may be reviewed where reasonably necessary for security, moderation, support, or legal compliance.',
      'Visibility controls are subject to platform functionality, security restrictions, applicable law, and changes to the service.'
    ]
  },
  {
    title: '7. Sharing and Service Providers',
    content: [
      'QORVEXA may use third-party infrastructure providers to operate essential platform functions. These providers may process information on behalf of the platform as needed to deliver their services.',
      'Current infrastructure includes:'
    ],
    bullets: [
      'Supabase: authentication, database services, file storage, and realtime functionality.',
      'Cloudflare: website hosting and delivery through Cloudflare Pages and related infrastructure.'
    ],
    ending: 'We may also disclose information when required by law, to respond to valid legal processes, to protect members and the platform, or in connection with a legitimate business transfer where permitted by applicable law. We do not disclose personal information for unrelated purposes without an appropriate legal basis.'
  },
  {
    title: '8. Storage and Security',
    content: [
      'QORVEXA uses technical and organizational measures intended to protect personal information against unauthorized access, disclosure, alteration, loss, or misuse.',
      'These measures include account authentication, database access controls, and access policies for supported profile, post, and media features.',
      'Uploaded media is stored using the QORVEXA media storage service. Access is subject to the applicable profile and post visibility rules.',
      'No website, database, or online transmission method can be guaranteed to be completely secure. Members should use strong passwords and keep their login credentials confidential.'
    ]
  },
  {
    title: '9. Data Retention and Account Deletion',
    content: [
      'We retain personal information for as long as reasonably necessary to provide the service, maintain account records, protect the platform, resolve disputes, enforce our Terms of Service, and meet applicable legal obligations.',
      'Some information may remain in backups, security records, or other retained systems for a limited period after a deletion request where necessary for legitimate operational or legal purposes.',
      'If you want to request account or personal information deletion, contact the QORVEXA privacy contact listed below. We will review and handle requests in accordance with applicable law and our operational requirements.'
    ]
  },
  {
    title: '10. Cookies and Similar Technologies',
    content: [
      'QORVEXA and its infrastructure providers may use essential browser technologies, such as cookies or similar mechanisms, when needed for authentication, session management, security, and reliable website operation.',
      'The technologies used may depend on the services and infrastructure required to operate the platform. You can manage cookies through your browser settings, although disabling essential technologies may affect some features.'
    ]
  },
  {
    title: '11. Children’s Privacy',
    content: [
      'QORVEXA is intended for individuals who are at least 18 years old. The platform is not intended for children under 18.',
      'We do not knowingly seek to collect personal information from individuals under 18. If you believe that a person under 18 has created an account or provided personal information, please contact us so that we can review the matter and take appropriate action.'
    ]
  },
  {
    title: '12. International Data Processing',
    content: [
      'Our infrastructure providers may process or store information in locations outside your country, depending on their systems and service arrangements.',
      'Where personal information is transferred internationally, QORVEXA will take steps required by applicable privacy laws to protect that information.'
    ]
  },
  {
    title: '13. Your Privacy Rights',
    content: [
      'Subject to applicable law, you may have the right to request access to your personal information, correct inaccurate information, request deletion or blocking, object to certain processing, or withdraw consent where consent is the applicable legal basis.',
      'You may also have the right to raise a concern or lodge a complaint with the appropriate privacy regulator, including the Philippine National Privacy Commission where applicable.',
      'To exercise a privacy right, submit a request using the contact information below. We may need to verify your identity before processing a request. Some requests may be limited by legal obligations or other lawful grounds.'
    ]
  },
  {
    title: '14. Changes to This Privacy Policy',
    content: [
      'We may update this Privacy Policy as QORVEXA develops, introduces new features, changes its service providers, or responds to legal requirements.',
      'The latest version will be published on this page with its updated date. Where required, we will provide additional notice of material changes.'
    ]
  }
]

function PrivacyPage() {
  return (
    <main className="terms-page" id="top">
      <div className="matrix-grid" aria-hidden="true" />

      <header className="terms-header">
        <Link className="brand-link" to="/" aria-label="QORVEXA home">
          <BrandMark />
        </Link>
        <Link className="terms-back-link" to="/signup">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to registration
        </Link>
      </header>

      <article className="terms-document">
        <div className="terms-eyebrow">
          <ShieldCheck size={16} aria-hidden="true" />
          PRIVACY & DATA PROTECTION
        </div>

        <h1>Privacy Policy</h1>
        <p className="terms-intro">
          How QORVEXA handles your information while helping you connect,
          communicate, and participate in the community.
        </p>

        <div className="terms-meta">
          <span>Effective date: November 8, 2026</span>
          <span>Last updated: November 8, 2026</span>
        </div>

        <div className="terms-notice">
          Please read this Privacy Policy to understand what information
          QORVEXA processes, why it is used, and what choices and rights
          may be available to you.
        </div>

        <nav className="terms-toc" aria-label="Privacy Policy contents">
          <h2>On this page</h2>
          <div>
            {sections.map((section, index) => (
              <a key={section.title} href={`#privacy-section-${index + 1}`}>
                {section.title}
              </a>
            ))}
            <a href="#privacy-contact">15. Contact Information</a>
          </div>
        </nav>

        <div className="terms-content">
          {sections.map((section, index) => (
            <section
              className="terms-section"
              id={`privacy-section-${index + 1}`}
              key={section.title}
            >
              <h2>{section.title}</h2>
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.ending && <p>{section.ending}</p>}
            </section>
          ))}

          <section className="terms-section" id="privacy-contact">
            <h2>15. Contact Information</h2>
            <p>
              For privacy questions, requests, complaints, or concerns about
              how QORVEXA handles personal information, contact the platform
              using the official details below.
            </p>
            <div className="terms-contact-details">
              <p><strong>Platform:</strong> QORVEXA</p>
              <p><strong>Operator / Personal Information Controller:</strong> BrandXSaints</p>
              <p><strong>Business Address:</strong> Philippines</p>
              <p><strong>Privacy Contact Email:</strong> brandizsantos13@gmail.com</p>
              <p><strong>Support Email:</strong> brandizsantos82@gmail.com</p>
            </div>
          </section>
        </div>

        <div className="terms-acceptance">
          By creating an account, you acknowledge that you have been given
          access to this Privacy Policy and understand how QORVEXA handles
          personal information as described here.
        </div>

        <div className="terms-bottom-actions">
          <Link className="button button--primary" to="/signup">
            Return to create account
          </Link>
          <a className="terms-top-link" href="#top">
            <ArrowUp size={15} aria-hidden="true" />
            Back to top
          </a>
        </div>
      </article>

      <footer className="terms-footer">
        <Link to="/">QORVEXA</Link>
        <span>Connect Beyond Limits.</span>
        <span>© 2026 QORVEXA</span>
      </footer>
    </main>
  )
}

export default PrivacyPage

