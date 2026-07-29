import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type {
  MonthlySummary,
  SavingsDirection,
  Transaction,
  TransactionInput,
} from '../types/transaction'

const COLLECTION = 'transactions'

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
): Transaction | null {
  const userId = data.userId
  const type = data.type
  const amount = data.amount
  const category = data.category
  const description = data.description
  const occurredAt = data.occurredAt
  const savingsDirection = data.savingsDirection

  if (
    typeof userId !== 'string' ||
    (type !== 'income' &&
      type !== 'expense' &&
      type !== 'bill' &&
      type !== 'savings') ||
    typeof amount !== 'number' ||
    typeof category !== 'string' ||
    typeof description !== 'string' ||
    !(occurredAt instanceof Timestamp || typeof occurredAt === 'string')
  ) {
    return null
  }

  if (type === 'savings') {
    if (savingsDirection !== 'deposit' && savingsDirection !== 'withdraw') {
      return null
    }
  }

  return {
    id,
    userId,
    type,
    amount,
    category,
    description,
    occurredAt: toIso(occurredAt),
    createdAt: toIso(data.createdAt),
    ...(typeof data.recurringBillId === 'string'
      ? { recurringBillId: data.recurringBillId }
      : {}),
    ...(type === 'savings'
      ? { savingsDirection: savingsDirection as SavingsDirection }
      : {}),
  }
}

function validateInput(input: TransactionInput): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  if (!input.category.trim()) {
    throw new Error('Category is required.')
  }
  const occurred = new Date(input.occurredAt)
  if (Number.isNaN(occurred.getTime())) {
    throw new Error('Invalid date.')
  }
  if (input.type === 'savings') {
    if (input.savingsDirection !== 'deposit' && input.savingsDirection !== 'withdraw') {
      throw new Error('Savings transfers need a deposit or withdraw direction.')
    }
  }
}

export function subscribeTransactions(
  userId: string,
  onData: (transactions: Transaction[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase is not configured. Data sync is unavailable.'))
    return () => {}
  }

  // Filter by userId only; sort client-side so no composite index is required.
  const q = query(collection(db, COLLECTION), where('userId', '==', userId))

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Transaction[] = []
      let invalidId: string | null = null
      for (const docSnap of snapshot.docs) {
        const mapped = mapDoc(docSnap.id, docSnap.data())
        if (mapped) {
          items.push(mapped)
        } else {
          invalidId = docSnap.id
        }
      }
      items.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )
      onData(items)
      if (invalidId) {
        onError(
          new Error(
            `Transaction ${invalidId} has invalid or incomplete data.`,
          ),
        )
      }
    },
    (error) => onError(error),
  )
}

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<string> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  validateInput(input)
  const occurred = new Date(input.occurredAt)

  const payload: Record<string, unknown> = {
    userId,
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    description: input.description.trim(),
    occurredAt: Timestamp.fromDate(occurred),
    createdAt: serverTimestamp(),
  }
  if (input.recurringBillId) {
    payload.recurringBillId = input.recurringBillId
  }
  if (input.type === 'savings' && input.savingsDirection) {
    payload.savingsDirection = input.savingsDirection
  }

  const ref = await addDoc(collection(db, COLLECTION), payload)

  return ref.id
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  validateInput(input)
  const occurred = new Date(input.occurredAt)

  const payload: Record<string, unknown> = {
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    description: input.description.trim(),
    occurredAt: Timestamp.fromDate(occurred),
  }

  if (input.type === 'savings' && input.savingsDirection) {
    payload.savingsDirection = input.savingsDirection
  } else {
    payload.savingsDirection = null
  }

  await updateDoc(doc(db, COLLECTION, id), payload)
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  await deleteDoc(doc(db, COLLECTION, id))
}

export function filterByMonth(
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  return transactions.filter((tx) => {
    const d = new Date(tx.occurredAt)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

export function computeMonthlySummary(
  transactions: Transaction[],
): MonthlySummary {
  let income = 0
  let expenses = 0
  let bills = 0
  let savingsDeposits = 0
  let savingsWithdrawals = 0

  for (const tx of transactions) {
    if (tx.type === 'income') income += tx.amount
    else if (tx.type === 'expense') expenses += tx.amount
    else if (tx.type === 'bill') bills += tx.amount
    else if (tx.savingsDirection === 'withdraw') savingsWithdrawals += tx.amount
    else savingsDeposits += tx.amount
  }

  const savings = savingsDeposits - savingsWithdrawals

  return {
    income,
    expenses,
    bills,
    savings,
    net: income + savingsWithdrawals - expenses - bills - savingsDeposits,
    count: transactions.length,
  }
}
