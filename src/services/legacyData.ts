import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

/** Previous unauthenticated owner id used while auth was disabled. */
export const LEGACY_USER_ID = 'personal'

const MIGRATION_FLAG_PREFIX = 'ledger.claimedLegacyData:'

function migrationFlagKey(uid: string): string {
  return `${MIGRATION_FLAG_PREFIX}${uid}`
}

function alreadyClaimed(uid: string): boolean {
  try {
    return localStorage.getItem(migrationFlagKey(uid)) === '1'
  } catch {
    return false
  }
}

function markClaimed(uid: string): void {
  try {
    localStorage.setItem(migrationFlagKey(uid), '1')
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
}

/**
 * Moves docs still tagged with the pre-auth `personal` userId onto the signed-in user.
 * Safe to call repeatedly; no-ops once localStorage says this uid already claimed.
 */
export async function claimLegacyPersonalData(uid: string): Promise<void> {
  if (!db || !uid || alreadyClaimed(uid)) return

  const collections = ['transactions', 'recurringBills'] as const

  for (const name of collections) {
    const snap = await getDocs(
      query(collection(db, name), where('userId', '==', LEGACY_USER_ID)),
    )

    // Firestore batches are capped at 500 ops.
    let batch = writeBatch(db)
    let ops = 0

    for (const docSnap of snap.docs) {
      batch.update(docSnap.ref, { userId: uid })
      ops += 1
      if (ops >= 450) {
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }
    }

    if (ops > 0) {
      await batch.commit()
    }
  }

  markClaimed(uid)
}
