import { useState, type FormEvent } from 'react'
import { BookMarked, Eye, EyeOff } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import type { ThemeMode } from '../lib/theme'

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<void>
  error: string | null
  theme: ThemeMode
  onToggleTheme: () => void
}

export function AuthForm({
  onSignIn,
  error,
  theme,
  onToggleTheme,
}: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    setBusy(true)
    try {
      await onSignIn(email.trim(), password)
    } catch {
      setLocalError('Could not sign in. Check your email and password.')
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
        <h1>Welcome back</h1>
        <p className="auth-sub">
          Private personal finance tracker — sign in to continue.
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
          <label>
            Password
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
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

          {(localError || error) && (
            <p className="form-error" role="alert">
              {localError ?? error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
