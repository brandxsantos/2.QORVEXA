import { ArrowLeft, ArrowUp, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark.jsx'

const sections = [
  {
    title: '1. Acceptance of These Terms',
    content: [
      'Welcome to QORVEXA. These Terms of Service govern your access to and use of the QORVEXA website, applications, features, and services (collectively, the Platform).',
      'By creating an account or using QORVEXA, you confirm that you have read and agree to these Terms and our Privacy Policy. If you do not agree, do not use the Platform.',
    ],
  },
  {
    title: '2. Eligibility and Registration',
    content: [
      'You must be at least 18 years old to create and maintain a QORVEXA account.',
      'You agree to provide accurate, current, and complete registration information and to update it when necessary. You must not impersonate another person or create an account using misleading information.',
      'You may not sell, rent, transfer, or provide unauthorized access to your account.',
    ],
  },
  {
    title: '3. Account Security',
    content: [
      'You are responsible for safeguarding your login credentials and for activity conducted through your account, subject to rights and protections provided by applicable law.',
      'Notify us promptly if you suspect unauthorized access to your account. You must not attempt to access another personâ€™s account, bypass security controls, or interfere with account authentication.',
    ],
  },
  {
    title: '4. User Content and Ownership',
    content: [
      'You retain ownership of content you create and share on QORVEXA, to the extent that you own the applicable rights. User Content may include profile information, photographs, posts, comments, and messages.',
      'By submitting content, you grant QORVEXA a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, and technically process that content only as reasonably necessary to operate, maintain, secure, and provide the Platform.',
      'This license ends when you delete the content or your account, except where continued retention is reasonably necessary for backups, security, legal compliance, dispute resolution, or enforcement of these Terms.',
      'You are responsible for ensuring that you have the rights and permissions needed to upload and share your content.',
    ],
  },
  {
    title: '5. Community Standards and Prohibited Conduct',
    content: [
      'QORVEXA aims to provide a respectful and safe social networking environment. You agree not to use the Platform to:',
    ],
    bullets: [
      'Harass, threaten, stalk, intimidate, bully, or target another person.',
      'Publish hate speech, threats, or content encouraging violence or harm.',
      'Share another personâ€™s private information without lawful authority or permission.',
      'Impersonate individuals, organizations, or public officials.',
      'Commit fraud, scams, phishing, or other deceptive activities.',
      'Distribute malware, malicious links, or harmful software.',
      'Spam users or conduct unauthorized advertising.',
      'Publish child sexual abuse material, sexually exploitative content, or non-consensual intimate images.',
      'Promote or facilitate unlawful activities.',
      'Infringe copyright, trademark, privacy, or other legal rights.',
      'Use bots or unauthorized automation to manipulate accounts or Platform features.',
      'Attempt unauthorized access to QORVEXA systems, databases, or other accounts.',
      'Interfere with the security, availability, or normal operation of the Platform.',
    ],
    ending:
      'You must comply with applicable laws and regulations when using QORVEXA.',
  },
  {
    title: '6. Posts, Profiles, and Visibility',
    content: [
      'Depending on available features and your privacy settings, profile information, posts, comments, and other activity may be visible to other users or the public.',
      'You are responsible for reviewing your content and visibility settings before publishing. Do not publish information that you do not want others to access.',
      'We cannot guarantee that content can be completely retrieved or erased after other users have viewed, copied, downloaded, or shared it.',
    ],
  },
  {
    title: '7. Friends, Messaging, and Blocking',
    content: [
      'QORVEXA may provide friend requests, connections, direct messaging, and blocking features. You agree to use these features respectfully and lawfully.',
      'You must not use messaging or friendship features to harass, threaten, defraud, spam, or intimidate others.',
      'Blocking another account may limit interactions but cannot necessarily remove information previously copied, shared, or retained by recipients. Do not assume private messages are legally privileged or cannot be saved or shared.',
    ],
  },
  {
    title: '8. Reporting and Content Moderation',
    content: [
      'You may report accounts or content that you believe violate these Terms. We may review reports and take reasonable action, including removing content, issuing warnings, limiting features, or suspending or terminating accounts.',
      'We may act without prior notice when reasonably necessary to protect users, prevent harm, investigate abuse, address security risks, or comply with law.',
      'We do not guarantee that every report will result in removal or that all harmful content will be detected immediately. Where appropriate, we may provide an opportunity to appeal moderation decisions.',
    ],
  },
  {
    title: '9. Privacy and Personal Information',
    content: [
      'Your use of QORVEXA is also governed by our Privacy Policy. It explains how personal information is collected, used, stored, disclosed, and protected.',
      'We intend to handle personal information in accordance with applicable data protection laws, including the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), where applicable.',
      'Nothing in these Terms removes or limits privacy rights granted to you by applicable law.',
    ],
  },
  {
    title: '10. QORVEXA Intellectual Property',
    content: [
      'The QORVEXA name, branding, logos, original software, website design, interface elements, and other Platform materials are owned by or licensed to QORVEXA unless otherwise indicated.',
      'You may not copy, reproduce, modify, distribute, reverse engineer, sell, or commercially exploit Platform materials without prior written permission, except where applicable law permits.',
      'These Terms do not transfer ownership of QORVEXA intellectual property to you.',
    ],
  },
  {
    title: '11. Copyright and Intellectual Property Complaints',
    content: [
      'If you believe content on QORVEXA infringes your copyright or other intellectual property rights, contact us with your name and contact information, identification of the protected work, the location of the content, and an explanation of the rights you believe have been violated.',
      'We may remove or restrict content while reviewing a complaint and may take appropriate action against repeat infringers.',
    ],
  },
  {
    title: '12. Third-Party Services and Links',
    content: [
      'QORVEXA may rely on third-party services, infrastructure, software, or external websites to operate certain features.',
      'Third-party services are subject to their own terms and privacy policies. We are not responsible for third-party websites or services that we do not control.',
    ],
  },
  {
    title: '13. Platform Availability and Changes',
    content: [
      'We aim to maintain a reliable and secure Platform but do not guarantee uninterrupted, error-free, or continuous availability.',
      'We may update, modify, suspend, or discontinue features for maintenance, security, technical, operational, or legal reasons. Where reasonably practicable, we will provide notice of significant changes.',
    ],
  },
  {
    title: '14. Suspension and Account Termination',
    content: [
      'You may stop using QORVEXA at any time and may request account deletion through available account settings or by contacting us.',
      'We may restrict, suspend, or terminate accounts for material violations of these Terms, threats to user safety, fraud, abuse, unauthorized activity, lawful orders, or material security risks.',
      'Where appropriate and legally permissible, we may provide notice and an opportunity to address a violation.',
      'Account deletion does not necessarily erase information we are legally required or reasonably permitted to retain, including security records, backups, and information needed to resolve disputes.',
    ],
  },
  {
    title: '15. Disclaimers',
    content: [
      'To the extent permitted by applicable law, QORVEXA is provided on an â€œas availableâ€ basis. We do not guarantee that the Platform will always be available, that user-generated content will be accurate or lawful, that every user is who they claim to be, or that all harmful conduct will be detected or prevented.',
      'Users are responsible for their own interactions and decisions when communicating with other users.',
      'Nothing in this section excludes warranties or rights that cannot lawfully be excluded.',
    ],
  },
  {
    title: '16. Limitation of Liability',
    content: [
      'To the maximum extent permitted by applicable law, QORVEXA and its operators shall not be liable for indirect, incidental, special, or consequential losses arising from use of the Platform, including losses resulting from user-generated content, user interactions, or temporary service interruptions.',
      'This provision does not exclude or limit liability where such exclusion or limitation is prohibited by law, including liability arising from fraud, willful misconduct, or other non-waivable legal obligations.',
      'Nothing in these Terms removes rights or remedies available under applicable consumer protection or other laws.',
    ],
  },
  {
    title: '17. Responsibility for Violations',
    content: [
      'To the extent permitted by law, you are responsible for claims, losses, and reasonable expenses arising from your unlawful conduct, infringement of another personâ€™s rights, or material violation of these Terms.',
      'You are not required to assume responsibility for our own unlawful acts or liabilities that cannot legally be transferred to you.',
    ],
  },
  {
    title: '18. Changes to These Terms',
    content: [
      'We may revise these Terms as QORVEXA develops or as legal and operational requirements change. We will update the â€œLast Updatedâ€ date when changes are made.',
      'For material changes, we will provide reasonable notice through the Platform or another appropriate method where required.',
      'Your continued use after revised Terms become effective constitutes acceptance where permitted by law. If you do not agree, you should stop using the Platform.',
    ],
  },
  {
    title: '19. Governing Law and Disputes',
    content: [
      'These Terms are governed by the laws of the Republic of the Philippines, without disregarding mandatory legal protections that may apply to users in other jurisdictions.',
      'Disputes shall be handled by competent courts or authorities in accordance with applicable law and mandatory jurisdictional rules.',
      'Nothing in this section prevents you from exercising rights or filing complaints with government agencies where legally available.',
    ],
  },
  {
    title: '20. Severability',
    content: [
      'If any provision of these Terms is found invalid or unenforceable, the remaining provisions will continue to apply to the extent legally permitted.',
    ],
  },
  {
    title: '21. Entire Agreement',
    content: [
      'These Terms, together with the Privacy Policy and any additional terms presented for specific QORVEXA features, govern your use of the Platform.',
      'If a specific feature has additional terms, those terms apply to that feature to the extent of any conflict.',
    ],
  },
]

function TermsPage() {
  return (
    <main className="terms-page">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
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
          COMMUNITY GUIDELINES & LEGAL
        </div>

        <h1>Terms of Service</h1>
        <p className="terms-intro">
          The rules and responsibilities that help keep QORVEXA a respectful,
          secure, and welcoming place to connect.
        </p>

        <div className="terms-meta">
          <span>Effective date: November 8, 2026</span>
          <span>Last updated: November 8, 2026</span>
        </div>

        <div className="terms-notice">
          By creating an account or using QORVEXA, you agree to these Terms.
          Please read them carefully before continuing.
        </div>

        <nav className="terms-toc" aria-label="Terms of Service contents">
          <h2>On this page</h2>
          <div>
            {sections.map((section, index) => (
              <a key={section.title} href={`#terms-section-${index + 1}`}>
                {section.title}
              </a>
            ))}
            <a href="#terms-contact">22. Contact Information</a>
          </div>
        </nav>

        <div className="terms-content">
          {sections.map((section, index) => (
            <section
              className="terms-section"
              id={`terms-section-${index + 1}`}
              key={section.title}
            >
              <h2>{section.title}</h2>
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              {section.ending && <p>{section.ending}</p>}
            </section>
          ))}

          <section className="terms-section" id="terms-contact">
            <h2>22. Contact Information</h2>
            <p>
              For questions, complaints, legal notices, or concerns about these
              Terms, contact the QORVEXA operator using the official contact
              information below.
            </p>
            <div className="terms-contact-details">
              <p><strong>Platform:</strong> QORVEXA</p>
              <p><strong>Operator / Brand:</strong> BrandXSaints</p>
              <p><strong>Business Address:</strong> Philippines</p>
              <p><strong>Contact Email:</strong> brandizsantos82@gmail.com</p>
              <p><strong>Privacy Inquiries:</strong> brandizsantos13@gmail.com</p>
            </div>
          </section>
        </div>

        <div className="terms-acceptance">
          By creating a QORVEXA account, you confirm that you have read and
          agreed to these Terms of Service and have been given access to the
          QORVEXA Privacy Policy.
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
        <span>Â© 2026 QORVEXA</span>
      </footer>
    </main>
  )
}

export default TermsPage
