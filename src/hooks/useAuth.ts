import { useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { claimLegacyPersonalData } from '../services/legacyData'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

function ownerEmail(): string | null {
  const value = import.meta.env.VITE_OWNER_EMAIL
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().toLowerCase()
}

function isAuthorizedEmail(email: string | null | undefined): boolean {
  const allowed = ownerEmail()
  if (!allowed) return true
  return (email ?? '').trim().toLowerCase() === allowed
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    loading: Boolean(auth),
    error: null,
  }))

  useEffect(() => {
    const firebaseAuth = auth
    if (!firebaseAuth) {
      return undefined
    }

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        void (async () => {
          if (user && !isAuthorizedEmail(user.email)) {
            await signOut(firebaseAuth)
            setState({
              user: null,
              loading: false,
              error: 'This Ledger is private. Your account is not authorized.',
            })
            return
          }

          if (user) {
            try {
              await claimLegacyPersonalData(user.uid)
            } catch (err) {
              console.error('Failed to claim legacy personal data', err)
            }
          }

          setState({ user, loading: false, error: null })
        })()
      },
      (error) => {
        setState({ user: null, loading: false, error: error.message })
      },
    )
    return unsubscribe
  }, [])

  async function signIn(email: string, password: string): Promise<void> {
    setState((prev) => ({ ...prev, error: null }))
    if (!auth) {
      const message = 'Authentication is unavailable because Firebase is not configured.'
      setState((prev) => ({ ...prev, error: message }))
      throw new Error(message)
    }

    if (!isAuthorizedEmail(email)) {
      const message = 'This Ledger is private. Your account is not authorized.'
      setState((prev) => ({ ...prev, error: message }))
      throw new Error(message)
    }

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed.'
      setState((prev) => ({ ...prev, error: message }))
      throw err
    }
  }

  async function logOut(): Promise<void> {
    if (!auth) {
      return
    }

    await signOut(auth)
  }

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    signIn,
    logOut,
  }
}
