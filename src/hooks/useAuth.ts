import { useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!auth) {
      setState({ user: null, loading: false, error: null })
      return undefined
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setState({ user, loading: false, error: null })
      },
      (error) => {
        setState({ user: null, loading: false, error: error.message })
      },
    )
    return unsubscribe
  }, [])

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
      const message = err instanceof Error ? err.message : 'Sign up failed.'
      setState((prev) => ({ ...prev, error: message }))
      throw err
    }
  }

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
    signUp,
    signIn,
    logOut,
  }
}
