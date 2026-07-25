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

  if (
    typeof userId !== 'string' ||
    (type !== 'income' && type !== 'expense' && type !== 'bill') ||
    typeof amount !== 'number' ||
    typeof category !== 'string' ||
    typeof description !== 'string' ||
    !(occurredAt instanceof Timestamp || typeof occurredAt === 'string')
  ) {
    return null
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
  }
}

export function subscribeTransactions(
  userId: string,
  onData: (transactions: Transaction[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
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

  const ref = await addDoc(collection(db, COLLECTION), payload)

  return ref.id
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  const occurred = new Date(input.occurredAt)
  if (Number.isNaN(occurred.getTime())) {
    throw new Error('Invalid date.')
  }

  await updateDoc(doc(db, COLLECTION, id), {
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    description: input.description.trim(),
    occurredAt: Timestamp.fromDate(occurred),
  })
}

export async function deleteTransaction(id: string): Promise<void> {
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

  for (const tx of transactions) {
    if (tx.type === 'income') income += tx.amount
    else if (tx.type === 'expense') expenses += tx.amount
    else bills += tx.amount
  }

  return {
    income,
    expenses,
    bills,
    net: income - expenses - bills,
    count: transactions.length,
  }
}
