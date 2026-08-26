import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const

const hasRequiredConfig = requiredKeys.every((key) => Boolean(firebaseConfig[key]))

if (!hasRequiredConfig) {
  console.warn('Firebase config is incomplete. Continuing in demo mode without Firestore persistence.')
}

// Auth initializes eagerly (the sign-in screen needs it); the Firestore SDK
// is loaded on demand so it stays out of the initial bundle.
export const app = hasRequiredConfig ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const isFirebaseConfigured = hasRequiredConfig

type FirestoreModule = typeof import('firebase/firestore')

let firestoreClient: Promise<{
  fs: FirestoreModule
  db: Firestore
}> | null = null

/**
 * Loads the Firestore SDK + database handle, caching the result.
 * Rejects when Firebase isn't configured; callers surface that as an error.
 */
export function getFirestoreClient(): Promise<{
  fs: FirestoreModule
  db: Firestore
}> {
  if (!firestoreClient) {
    if (!app) {
      return Promise.reject(
        new Error('Firebase is not configured. Data sync is unavailable.'),
      )
    }

    firestoreClient = import('firebase/firestore').then((fs) => ({
      fs,
      db: fs.getFirestore(app),
    }))
  }
  return firestoreClient
}
