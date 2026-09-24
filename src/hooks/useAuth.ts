import { useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
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
        setState({ user, loading: false, error: null })
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

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed.'
      setState((prev) => ({ ...prev, error: message }))
      throw err
    }
  }

  async function signUp(email: string, password: string): Promise<void> {
    setState((prev) => ({ ...prev, error: null }))
    if (!auth) {
      const message = 'Authentication is unavailable because Firebase is not configured.'
      setState((prev) => ({ ...prev, error: message }))
      throw new Error(message)
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Account creation failed.'
      setState((prev) => ({ ...prev, error: message }))
      throw err
    }
  }

  async function resetPassword(email: string): Promise<void> {
    setState((prev) => ({ ...prev, error: null }))
    if (!auth) {
      const message = 'Authentication is unavailable because Firebase is not configured.'
      setState((prev) => ({ ...prev, error: message }))
      throw new Error(message)
    }

    try {
      await sendPasswordResetEmail(auth, email)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password reset failed.'
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
    signUp,
    resetPassword,
    logOut,
  }
}
