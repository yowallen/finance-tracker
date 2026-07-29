import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { createTransaction } from './transactions'
import type {
  SavingsGoal,
  SavingsGoalInput,
  SavingsJourney,
  SavingsPool,
  SavingsStop,
} from '../types/savingsGoal'

const GOALS_COLLECTION = 'savingsGoals'
const POOLS_COLLECTION = 'savingsPools'

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function mapGoalDoc(
  id: string,
  data: Record<string, unknown>,
): SavingsGoal | null {
  const userId = data.userId
  const name = data.name
  const targetAmount = data.targetAmount
  const notes = data.notes
  const imageDataUrl = data.imageDataUrl

  if (
    typeof userId !== 'string' ||
    typeof name !== 'string' ||
    typeof targetAmount !== 'number' ||
    !Number.isFinite(targetAmount) ||
    targetAmount <= 0 ||
    typeof notes !== 'string'
  ) {
    return null
  }

  const image =
    typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')
      ? imageDataUrl
      : null

  return {
    id,
    userId,
    name,
    targetAmount,
    notes,
    imageDataUrl: image,
    createdAt: toIso(data.createdAt),
  }
}

function mapPoolData(userId: string, data: Record<string, unknown> | undefined): SavingsPool {
  const savedAmount = data?.savedAmount
  if (typeof savedAmount === 'number' && Number.isFinite(savedAmount) && savedAmount >= 0) {
    return { userId, savedAmount }
  }
  return { userId, savedAmount: 0 }
}

function validateInput(input: SavingsGoalInput): void {
  if (!input.name.trim()) {
    throw new Error('Goal name is required.')
  }
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    throw new Error('Target amount must be greater than zero.')
  }
  if (
    input.imageDataUrl != null &&
    !input.imageDataUrl.startsWith('data:image/')
  ) {
    throw new Error('Goal image must be a valid image data URL.')
  }
}

/** Build the shared timeline: bar end = most expensive goal. */
export function buildSavingsJourney(
  goals: SavingsGoal[],
  savedAmount: number,
): SavingsJourney {
  const sorted = [...goals].sort((a, b) => {
    if (a.targetAmount !== b.targetAmount) {
      return a.targetAmount - b.targetAmount
    }
    return a.name.localeCompare(b.name)
  })

  const limit = sorted.reduce(
    (max, goal) => Math.max(max, goal.targetAmount),
    0,
  )
  const percent =
    limit <= 0 ? 0 : Math.min(100, (savedAmount / limit) * 100)
  const remainingToLimit = Math.max(0, limit - savedAmount)

  const stops: SavingsStop[] = sorted.map((goal, index) => ({
    goal,
    positionPercent: limit <= 0 ? 0 : (goal.targetAmount / limit) * 100,
    reached: savedAmount + 1e-9 >= goal.targetAmount,
    placement: index % 2 === 0 ? 'above' : 'below',
  }))

  const nextStop = stops.find((stop) => !stop.reached) ?? null

  return {
    savedAmount,
    limit,
    percent,
    remainingToLimit,
    stops,
    nextStop,
  }
}

export function subscribeSavingsGoals(
  userId: string,
  onData: (goals: SavingsGoal[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase is not configured. Data sync is unavailable.'))
    return () => {}
  }

  const q = query(collection(db, GOALS_COLLECTION), where('userId', '==', userId))

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavingsGoal[] = []
      let invalidId: string | null = null

      for (const docSnap of snapshot.docs) {
        const mapped = mapGoalDoc(docSnap.id, docSnap.data())
        if (mapped) {
          items.push(mapped)
        } else {
          invalidId = docSnap.id
        }
      }

      items.sort((a, b) => a.targetAmount - b.targetAmount || a.name.localeCompare(b.name))
      onData(items)
      if (invalidId) {
        onError(
          new Error(`Savings goal ${invalidId} has invalid or incomplete data.`),
        )
      }
    },
    (error) => onError(error),
  )
}

export function subscribeSavingsPool(
  userId: string,
  onData: (pool: SavingsPool) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase is not configured. Data sync is unavailable.'))
    return () => {}
  }

  const ref = doc(db, POOLS_COLLECTION, userId)

  return onSnapshot(
    ref,
    (snapshot) => {
      onData(mapPoolData(userId, snapshot.data()))
    },
    (error) => onError(error),
  )
}

export async function createSavingsGoal(
  userId: string,
  input: SavingsGoalInput,
): Promise<string> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  validateInput(input)
  const ref = await addDoc(collection(db, GOALS_COLLECTION), {
    userId,
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    notes: input.notes.trim(),
    imageDataUrl: input.imageDataUrl,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateSavingsGoal(
  id: string,
  input: SavingsGoalInput,
): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  validateInput(input)
  await updateDoc(doc(db, GOALS_COLLECTION, id), {
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    notes: input.notes.trim(),
    imageDataUrl: input.imageDataUrl,
  })
}

/**
 * Move money into or out of the savings pot via a ledger transaction.
 * Positive amount = deposit (reduces running balance). Negative = withdraw.
 * Optionally seeds a one-time opening deposit from a legacy pool balance.
 */
export async function recordSavingsTransfer(
  userId: string,
  amount: number,
  options: { currentSaved: number; seedLegacyPool?: number },
): Promise<void> {
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('Enter a non-zero amount to add or remove.')
  }

  const seed = options.seedLegacyPool ?? 0
  let available = options.currentSaved

  if (seed > 0) {
    const seedDate = new Date()
    await createTransaction(userId, {
      type: 'savings',
      amount: seed,
      category: 'Savings deposit',
      description: 'Opening savings balance',
      occurredAt: new Date(
        seedDate.getFullYear(),
        seedDate.getMonth(),
        seedDate.getDate(),
        12,
        0,
        0,
        0,
      ).toISOString(),
      savingsDirection: 'deposit',
    })
    await setSavingsPoolAmount(userId, 0)
    available = seed
  }

  if (amount < 0 && Math.abs(amount) > available) {
    throw new Error('Cannot remove more than you have saved.')
  }

  const direction = amount > 0 ? 'deposit' : 'withdraw'
  const abs = Math.abs(amount)
  const now = new Date()
  const occurredAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
    0,
  ).toISOString()

  await createTransaction(userId, {
    type: 'savings',
    amount: abs,
    category: direction === 'deposit' ? 'Savings deposit' : 'Savings withdrawal',
    description:
      direction === 'deposit'
        ? 'Moved to savings pot'
        : 'Moved back from savings pot',
    occurredAt,
    savingsDirection: direction,
  })
}

export async function setSavingsPoolAmount(
  userId: string,
  savedAmount: number,
): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }
  if (!Number.isFinite(savedAmount) || savedAmount < 0) {
    throw new Error('Saved amount cannot be negative.')
  }

  await setDoc(
    doc(db, POOLS_COLLECTION, userId),
    {
      userId,
      savedAmount,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  await deleteDoc(doc(db, GOALS_COLLECTION, id))
}
