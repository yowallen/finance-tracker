import { useState, type FormEvent } from 'react'
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
        <p className="brand">Ledger</p>
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
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
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
