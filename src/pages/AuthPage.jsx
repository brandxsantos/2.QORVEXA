import { useState } from 'react'
import CustomSelect from '../components/CustomSelect.jsx'
import DatePicker from '../components/DatePicker.jsx'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { useAuth } from '../context/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'
import { isReservedUsername, isReservedDisplayName } from '../lib/reservedNames.js'

const usernamePattern = /^[a-z0-9_]{3,24}$/

function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading, error: authError } = useAuth()
  const isSignup = location.pathname === '/signup'
  const isRecoveryRoute = location.pathname === '/reset-password'
  const isRecovery = isRecoveryRoute && Boolean(user)
  const isForgotPassword = location.pathname === '/forgot-password' || (isRecoveryRoute && !user)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    searchParams.get('reset') === 'sent'
      ? 'If an account matches that email, a password reset link is on its way.'
      : '',
  )
  const visibleNotice = notice || (
    !loading && isRecoveryRoute && !user
      ? 'That reset link is invalid or expired. Enter your email to request a new one.'
      : ''
  )

  if (loading) {
    return (
      <div className="auth-loading" role="status">
        <LoaderCircle size={22} className="spinner" aria-hidden="true" />
        Checking your session…
      </div>
    )
  }

  if (user && !isRecovery) return <Navigate to="/app" replace />

  const title = isForgotPassword
    ? 'Reset your password.'
    : isRecovery
      ? 'Choose a new password.'
    : isSignup
      ? 'Find your people.'
      : 'Welcome back.'
  const description = isForgotPassword
    ? 'Enter the email address on your account and we’ll send you a reset link.'
    : isRecovery
      ? 'Choose a new password for your QORVEXA account.'
    : isSignup
      ? 'Create your QORVEXA account and join the conversation.'
      : 'Sign in to pick up where your community left off.'
  const eyebrow = isForgotPassword
    ? 'ACCOUNT RECOVERY'
    : isRecovery
      ? 'PASSWORD RESET'
    : isSignup
      ? 'CREATE AN ACCOUNT'
      : 'MEMBER ACCESS'

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()

    try {
      const supabase = getSupabaseClient()

      if (isForgotPassword) {
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })

        if (requestError) throw requestError

        setNotice('If an account matches that email, a password reset link is on its way.')
        return
      }

      const password = String(formData.get('password') ?? '')

      if (isRecovery) {
        const confirmPassword = String(formData.get('confirmPassword') ?? '')

        if (password.length < 8) {
          throw new Error('Choose a password with at least 8 characters.')
        }

        if (password !== confirmPassword) {
          throw new Error('Those passwords do not match.')
        }

        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError

        navigate('/app', { replace: true })
      } else if (isSignup) {
        const username = String(formData.get('username') ?? '').trim().toLowerCase()
        const displayName = String(formData.get('displayName') ?? '').trim()
        const confirmPassword = String(formData.get('confirmPassword') ?? '')
                const genderChoice = String(formData.get('gender') ?? '')
        const genderCustom = String(formData.get('genderCustom') ?? '').trim()
        const birthdate = String(formData.get('birthdate') ?? '')
        const phoneNumber = String(formData.get('phoneNumber') ?? '').trim()

        const gender = genderChoice === 'self_describe'
          ? genderCustom
          : genderChoice

        if (genderChoice === 'self_describe' && !genderCustom) {
          throw new Error('Please describe your gender or choose another option.')
        }

        if (gender.length > 50) {
          throw new Error('Gender description must not exceed 50 characters.')
        }

        if (birthdate) {
          const today = new Date()
          const todayString = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, '0'),
            String(today.getDate()).padStart(2, '0'),
          ].join('-')

          if (birthdate > todayString) {
            throw new Error('Birthdate cannot be in the future.')
          }
        }

        if (phoneNumber && !/^[+]?[\d\s().-]{7,32}$/.test(phoneNumber)) {
          throw new Error('Please enter a valid phone number.')
        }

        if (!usernamePattern.test(username)) {
          throw new Error('Use 3–24 characters for your username: lowercase letters, numbers, and underscores.')
        }

        if (isReservedUsername(username)) {
          throw new Error(`The username "@${username}" is reserved for platform administrators.`)
        }

        if (displayName.length < 2 || displayName.length > 60) {
          throw new Error('Your display name must be between 2 and 60 characters.')
        }

        if (isReservedDisplayName(displayName)) {
          throw new Error(`The display name "${displayName}" is reserved for platform administrators.`)
        }

        if (password.length < 8) {
          throw new Error('Choose a password with at least 8 characters.')
        }

        if (password !== confirmPassword) {
          throw new Error('Those passwords do not match.')
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
              data: {
    username,
    display_name: displayName,
    gender: gender || null,
    birthdate: birthdate || null,
    phone_number: phoneNumber || null,
  },
            emailRedirectTo: `${window.location.origin}/app`,
          },
        })

    if (signUpError) throw signUpError

// Detect an email that is already registered in Supabase.
if (data.user && data.user.identities?.length === 0) {
  throw new Error(
    'This email address is already associated with a QORVEXA account. Please log in or use another email address.',
  )
}

if (data.session) {
  navigate('/app', { replace: true })
} else {
  setNotice('Check your email for a verification link to finish creating your account.')
}
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) throw signInError

        navigate('/app', { replace: true })
      }
    } catch (submitError) {
      setError(
        submitError.code === '23505'
          ? 'That username is already taken. Try another one.'
          : submitError.message || 'We could not complete that request. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout eyebrow={eyebrow} title={title} description={description}>
      <div className="auth-panel-heading">
        <span>{isForgotPassword ? 'PASSWORD RESET' : isSignup ? 'YOUR DETAILS' : 'SIGN IN'}</span>
        <span className="auth-step">{isSignup ? '01 / 01' : 'SECURE ACCESS'}</span>
      </div>

      {authError && <p className="form-message form-message--error" role="alert">{authError}</p>}
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {visibleNotice && (
        <p
          className={`form-message ${isRecoveryRoute && !user ? 'form-message--error' : 'form-message--success'}`}
          role="status"
        >
          {visibleNotice}
        </p>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        {isSignup && (
          <>
            <label className="form-field">
              <span>Display name</span>
              <input
                type="text"
                name="displayName"
                placeholder="How should we call you?"
                autoComplete="name"
                minLength={2}
                maxLength={60}
                required
              />
            </label>
            <label className="form-field">
              <span>Username</span>
              <div className="input-with-prefix">
                <span aria-hidden="true">@</span>
                <input
                  type="text"
                  name="username"
                  placeholder="your_handle"
                  autoComplete="username"
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_]{3,24}"
                  title="Use 3–24 letters, numbers, or underscores."
                  required
                />
              </div>
              <small>3–24 letters, numbers, or underscores.</small>
            </label>
                        <label className="form-field">
              <span>Gender <small>(Optional)</small></span>
              <CustomSelect
  name="gender"
  defaultValue=""
  ariaLabel="Gender"
  options={[
    { value: '', label: 'Prefer not to specify' },
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Non-binary', label: 'Non-binary' },
    { value: 'self_describe', label: 'Self-describe' },
    { value: 'Prefer not to say', label: 'Prefer not to say' },
  ]}
/>
            </label>

            <label className="form-field">
              <span>Self-description <small>(If applicable)</small></span>
              <input
                type="text"
                name="genderCustom"
                placeholder="Describe your gender"
                maxLength={50}
              />
            </label>

            <label className="form-field">
              <span>Birthdate <small>(Optional)</small></span>
              <DatePicker name="birthdate" />
            </label>

            <label className="form-field">
              <span>Phone number <small>(Optional)</small></span>
              <input
                type="tel"
                name="phoneNumber"
                placeholder="+63 912 345 6789"
                autoComplete="tel"
                maxLength={32}
              />
            </label>
          </>
          
        )}

        {!isRecovery && (
          <label className="form-field">
            <span>Email address</span>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
        )}

        {(!isForgotPassword || isRecovery) && (
          <label className="form-field">
            <span>Password</span>
            <span className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder={isSignup || isRecovery ? 'At least 8 characters' : 'Enter your password'}
                autoComplete={isSignup || isRecovery ? 'new-password' : 'current-password'}
                minLength={isSignup || isRecovery ? 8 : undefined}
                maxLength={128}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword
                  ? <EyeOff size={17} aria-hidden="true" />
                  : <Eye size={17} aria-hidden="true" />}
              </button>
            </span>
          </label>
        )}

        {(isSignup || isRecovery) && (
          <>
            <label className="form-field">
              <span>Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="Enter your password again"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            {isSignup && (
              <label className="terms-field">
                <input type="checkbox" name="terms" required />
               <span>
  I agree to the <Link to="/terms">Terms of Service</Link> and{' '}
  <Link to="/privacy">Privacy Policy</Link>.
</span>
              </label>
            )}
          </>
        )}

        {!isSignup && !isForgotPassword && !isRecovery && (
          <div className="form-options">
            <span className="session-note">Your session stays on this device.</span>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        )}

        <button className="button button--primary auth-submit" type="submit" disabled={submitting}>
          {submitting && <LoaderCircle size={17} className="spinner" aria-hidden="true" />}
          {submitting
            ? 'Please wait…'
            : isForgotPassword
              ? 'Send reset link'
              : isSignup
                ? 'Create account'
                : isRecovery
                  ? 'Update password'
                : 'Log in'}
        </button>
      </form>

      <div className="auth-switch">
        {isForgotPassword ? (
          <Link to="/login">Back to log in</Link>
        ) : isRecovery ? (
          <Link to="/login">Cancel password reset</Link>
        ) : isSignup ? (
          <>Already have an account? <Link to="/login">Log in</Link></>
        ) : (
          <>New to QORVEXA? <Link to="/signup">Create an account</Link></>
        )}
      </div>
      <p className="auth-data-note">We never display your email on your public profile.</p>
    </AuthLayout>
  )
}

export default AuthPage
