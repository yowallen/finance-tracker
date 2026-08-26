import { lazy, Suspense } from 'react'
import { AuthForm } from './components/AuthForm'
import { LoadingState } from './components/LoadingState'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import './App.css'

// The whole signed-in tree (Firestore data layer included) loads on demand,
// keeping the entry chunk to the sign-in experience.
const LedgerApp = lazy(() => import('./components/LedgerApp'))

function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  if (authLoading) {
    return (
      <div className="boot">
        <LoadingState variant="page" label="Signing you in…" />
      </div>
    )
  }

  if (!user) {
    return (
      <AuthForm
        onSignIn={signIn}
        error={authError}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div className="boot">
          <LoadingState variant="page" label="Preparing your ledger…" />
        </div>
      }
    >
      <LedgerApp user={user} theme={theme} onToggleTheme={toggleTheme} onLogOut={logOut} />
    </Suspense>
  )
}

export default App
