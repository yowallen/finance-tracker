import { useState, type SubmitEvent } from 'react'
import { BookMarked, Eye, EyeOff } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import type { ThemeMode } from '../lib/theme'

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
  onResetPassword: (email: string) => Promise<void>
  error: string | null
  theme: ThemeMode
  onToggleTheme: () => void
}

export function AuthForm({
  onSignIn,
  onSignUp,
  onResetPassword,
  error,
  theme,
  onToggleTheme,
}: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)
    setBusy(true)
    try {
      if (mode === 'reset') {
        await onResetPassword(email.trim())
        setLocalError('Password reset email sent. Check your inbox.')
      } else if (mode === 'signUp') {
        await onSignUp(email.trim(), password)
      } else {
        await onSignIn(email.trim(), password)
      }
    } catch {
      setLocalError(
        mode === 'reset'
          ? 'Could not send a reset email. Check the address and try again.'
          : mode === 'signUp'
            ? 'Could not create the account. Check the details and try again.'
            : 'Could not sign in. Check your email and password.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-theme">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="auth-panel">
        <p className="brand">
          <BookMarked className="brand-icon" aria-hidden="true" />
          Ledger
        </p>
        <h1>{mode === 'signUp' ? 'Start your ledger' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1>
        <p className="auth-sub">
          {mode === 'signUp'
            ? 'Create a private financial track for your own goals.'
            : mode === 'reset'
              ? 'We will send a secure link to reset your password.'
              : 'Sign in to continue your financial track.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <span className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </label>
          )}
          {mode === 'signIn' && (
            <button
              type="button"
              className="link-btn auth-forgot"
              onClick={() => { setMode('reset'); setLocalError(null) }}
            >
              Forgot password?
            </button>
          )}

          {(localError || error) && (
            <p className="form-error" role="alert">
              {localError ?? error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signUp' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}
          </button>
        </form>
        {mode === 'signIn' ? (
          <div className="auth-create">
            <p>New to Ledger?</p>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setMode('signUp'); setLocalError(null) }}
            >
              Create an account
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="link-btn auth-back"
            onClick={() => { setMode('signIn'); setLocalError(null) }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}
