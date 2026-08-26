import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
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

function toIso(value: unknown, timestampCtor: typeof Timestamp): string {
  if (value instanceof timestampCtor) {
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
  timestampCtor: typeof Timestamp,
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
    createdAt: toIso(data.createdAt, timestampCtor),
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
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return

      const q = fs.query(
        fs.collection(db, GOALS_COLLECTION),
        fs.where('userId', '==', userId),
      )

      unsubscribe = fs.onSnapshot(
        q,
        (snapshot) => {
          const items: SavingsGoal[] = []
          let invalidId: string | null = null

          for (const docSnap of snapshot.docs) {
            const mapped = mapGoalDoc(docSnap.id, docSnap.data(), fs.Timestamp)
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
    })
    .catch((err: unknown) => {
      if (!disposed) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    })

  return () => {
    disposed = true
    unsubscribe()
  }
}

export function subscribeSavingsPool(
  userId: string,
  onData: (pool: SavingsPool) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return

      const ref = fs.doc(db, POOLS_COLLECTION, userId)

      unsubscribe = fs.onSnapshot(
        ref,
        (snapshot) => {
          onData(mapPoolData(userId, snapshot.data()))
        },
        (error) => onError(error),
      )
    })
    .catch((err: unknown) => {
      if (!disposed) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    })

  return () => {
    disposed = true
    unsubscribe()
  }
}

export async function createSavingsGoal(
  userId: string,
  input: SavingsGoalInput,
): Promise<string> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)
  const ref = await fs.addDoc(fs.collection(db, GOALS_COLLECTION), {
    userId,
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    notes: input.notes.trim(),
    imageDataUrl: input.imageDataUrl,
    createdAt: fs.serverTimestamp(),
  })
  return ref.id
}

export async function updateSavingsGoal(
  id: string,
  input: SavingsGoalInput,
): Promise<void> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)
  await fs.updateDoc(fs.doc(db, GOALS_COLLECTION, id), {
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
  const { fs, db } = await getFirestoreClient()
  if (!Number.isFinite(savedAmount) || savedAmount < 0) {
    throw new Error('Saved amount cannot be negative.')
  }

  await fs.setDoc(
    fs.doc(db, POOLS_COLLECTION, userId),
    {
      userId,
      savedAmount,
      createdAt: fs.serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.deleteDoc(fs.doc(db, GOALS_COLLECTION, id))
}
