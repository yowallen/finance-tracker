import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
import type { CreditCard } from '../types/creditCard'
import type {
  MonthlySavingsStats,
  MonthlySpendingStats,
  MonthlySummary,
  SavingsDirection,
  Transaction,
  TransactionInput,
} from '../types/transaction'
import { isCashIncome, isSavingsDeposit, isSavingsWithdraw } from '../types/transaction'
import { computeCashbackForTransaction } from './creditCards'

const COLLECTION = 'transactions'

function toIso(value: unknown, timestampCtor: typeof Timestamp): string {
  if (value instanceof timestampCtor) {
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
  timestampCtor: typeof Timestamp,
): Transaction | null {
  const userId = data.userId
  const type = data.type
  const amount = data.amount
  const category = data.category
  const description = data.description
  const occurredAt = data.occurredAt
  const savingsDirection = data.savingsDirection
  const creditCardId = data.creditCardId
  const cashbackEarned = typeof data.cashbackEarned === 'number' ? data.cashbackEarned : undefined
  const creditCardPayment = data.creditCardPayment
  const isAnnualFee = typeof data.isAnnualFee === 'boolean' ? data.isAnnualFee : undefined

  if (
    typeof userId !== 'string' ||
    (type !== 'income' &&
      type !== 'expense' &&
      type !== 'bill' &&
      type !== 'savings') ||
    typeof amount !== 'number' ||
    typeof category !== 'string' ||
    typeof description !== 'string' ||
    !(
      occurredAt instanceof timestampCtor || typeof occurredAt === 'string'
    )
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
    occurredAt: toIso(occurredAt, timestampCtor),
    createdAt: toIso(data.createdAt, timestampCtor),
    ...(typeof data.recurringBillId === 'string'
      ? { recurringBillId: data.recurringBillId }
      : {}),
    ...(typeof creditCardId === 'string' ? { creditCardId } : {}),
    ...(cashbackEarned !== undefined ? { cashbackEarned } : {}),
    ...(typeof creditCardPayment === 'boolean' ? { creditCardPayment } : {}),
    ...(data.cashbackCredit === true ? { cashbackCredit: true } : {}),
    ...(isAnnualFee !== undefined ? { isAnnualFee } : {}),
    ...(data.cashAdvance === true ? { cashAdvance: true } : {}),
    ...(typeof data.cashAdvanceMonthlyRate === 'number' && Number.isFinite(data.cashAdvanceMonthlyRate)
      ? { cashAdvanceMonthlyRate: data.cashAdvanceMonthlyRate }
      : {}),
    ...(typeof data.installmentPlanId === 'string' ? { installmentPlanId: data.installmentPlanId } : {}),
    ...(data.installmentPurchase === true ? { installmentPurchase: true } : {}),
    ...(type === 'savings'
      ? { savingsDirection: savingsDirection as SavingsDirection }
      : {}),
    ...(typeof data.importKey === 'string' ? { importKey: data.importKey } : {}),
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

/** Cash advance and Credit-to-Cash links are set on create only; edits keep them. */
function applyCashFields(payload: Record<string, unknown>, input: TransactionInput): void {
  if (input.cashAdvance) payload.cashAdvance = true
  if (typeof input.cashAdvanceMonthlyRate === 'number' && Number.isFinite(input.cashAdvanceMonthlyRate)) {
    payload.cashAdvanceMonthlyRate = input.cashAdvanceMonthlyRate
  }
  if (input.installmentPlanId) payload.installmentPlanId = input.installmentPlanId
  if (input.installmentPurchase) payload.installmentPurchase = true
}

export function subscribeTransactions(
  userId: string,
  onData: (transactions: Transaction[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return

      // Filter by userId only; sort client-side so no composite index is required.
      const q = fs.query(
        fs.collection(db, COLLECTION),
        fs.where('userId', '==', userId),
      )

      unsubscribe = fs.onSnapshot(
        q,
        (snapshot) => {
          const items: Transaction[] = []
          let invalidId: string | null = null
          for (const docSnap of snapshot.docs) {
            const mapped = mapDoc(docSnap.id, docSnap.data(), fs.Timestamp)
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

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<string> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)
  const occurred = new Date(input.occurredAt)

  const payload: Record<string, unknown> = {
    userId,
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    description: input.description.trim(),
    occurredAt: fs.Timestamp.fromDate(occurred),
    createdAt: fs.serverTimestamp(),
  }
  if (input.recurringBillId) {
    payload.recurringBillId = input.recurringBillId
  }
  if (input.creditCardId) {
    payload.creditCardId = input.creditCardId
  }
  if (typeof input.cashbackEarned === 'number') {
    payload.cashbackEarned = input.cashbackEarned
  } else {
    payload.cashbackEarned = 0
  }
  if (input.creditCardPayment) {
    payload.creditCardPayment = true
  }
  if (input.cashbackCredit) {
    payload.cashbackCredit = true
  }
  if (typeof input.isAnnualFee === 'boolean') {
    payload.isAnnualFee = input.isAnnualFee
  }
  applyCashFields(payload, input)
  if (input.type === 'savings' && input.savingsDirection) {
    payload.savingsDirection = input.savingsDirection
  }
  if (input.importKey) {
    payload.importKey = input.importKey
  }

  const ref = await fs.addDoc(fs.collection(db, COLLECTION), payload)

  return ref.id
}

/** Create many transactions in Firestore batches (max ~450 writes per commit). */
export async function createTransactionsBatch(
  userId: string,
  inputs: TransactionInput[],
  existingImportKeys: Set<string> = new Set(),
): Promise<{ created: number; skipped: number }> {
  if (inputs.length === 0) return { created: 0, skipped: 0 }

  const { fs, db } = await getFirestoreClient()
  const seen = new Set(existingImportKeys)
  let created = 0
  let skipped = 0
  let batch = fs.writeBatch(db)
  let ops = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = fs.writeBatch(db)
    ops = 0
  }

  for (const input of inputs) {
    if (input.importKey && seen.has(input.importKey)) {
      skipped += 1
      continue
    }
    validateInput(input)
    const occurred = new Date(input.occurredAt)
    const payload: Record<string, unknown> = {
      userId,
      type: input.type,
      amount: input.amount,
      category: input.category.trim(),
      description: input.description.trim(),
      occurredAt: fs.Timestamp.fromDate(occurred),
      createdAt: fs.serverTimestamp(),
      cashbackEarned: typeof input.cashbackEarned === 'number' ? input.cashbackEarned : 0,
    }
    if (input.recurringBillId) payload.recurringBillId = input.recurringBillId
    if (input.creditCardId) payload.creditCardId = input.creditCardId
    if (input.creditCardPayment) payload.creditCardPayment = true
    if (input.cashbackCredit) payload.cashbackCredit = true
    if (typeof input.isAnnualFee === 'boolean') payload.isAnnualFee = input.isAnnualFee
    applyCashFields(payload, input)
    if (input.type === 'savings' && input.savingsDirection) {
      payload.savingsDirection = input.savingsDirection
    }
    if (input.importKey) {
      payload.importKey = input.importKey
      seen.add(input.importKey)
    }

    const ref = fs.doc(fs.collection(db, COLLECTION))
    batch.set(ref, payload)
    ops += 1
    created += 1
    if (ops >= 450) await flush()
  }

  await flush()
  return { created, skipped }
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<void> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)
  const occurred = new Date(input.occurredAt)

  const payload: Record<string, unknown> = {
    type: input.type,
    amount: input.amount,
    category: input.category.trim(),
    description: input.description.trim(),
    occurredAt: fs.Timestamp.fromDate(occurred),
  }

  if (input.type === 'savings' && input.savingsDirection) {
    payload.savingsDirection = input.savingsDirection
  } else {
    payload.savingsDirection = null
  }

  if (input.creditCardId) {
    payload.creditCardId = input.creditCardId
  } else {
    payload.creditCardId = null
  }
  if (typeof input.cashbackEarned === 'number') {
    payload.cashbackEarned = input.cashbackEarned
  } else {
    payload.cashbackEarned = 0
  }
  if (input.creditCardPayment) {
    payload.creditCardPayment = true
  } else {
    payload.creditCardPayment = null
  }
  if (typeof input.isAnnualFee === 'boolean') {
    payload.isAnnualFee = input.isAnnualFee
  } else {
    payload.isAnnualFee = null
  }

  await fs.updateDoc(fs.doc(db, COLLECTION, id), payload)
}

export async function deleteTransaction(id: string): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.deleteDoc(fs.doc(db, COLLECTION, id))
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

export async function reconcileTransactionCashbackValues(
  userId: string,
  cards: CreditCard[],
  transactions: Transaction[],
): Promise<number> {
  const { fs, db } = await getFirestoreClient()
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const pending = transactions.filter((tx) => {
    if (tx.userId !== userId) return false
    if (!tx.creditCardId || tx.creditCardPayment === true) return false
    if (tx.type !== 'expense' && tx.type !== 'bill') return false
    const card = cardById.get(tx.creditCardId)
    return !!card
  }).map((tx) => {
    const card = cardById.get(tx.creditCardId!)
    if (!card) return null
    const nextValue = computeCashbackForTransaction(card, {
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      description: tx.description,
      creditCardId: tx.creditCardId,
      creditCardPayment: false,
      isAnnualFee: tx.isAnnualFee,
      cashAdvance: tx.cashAdvance,
      installmentPlanId: tx.installmentPlanId,
    })
    const currentValue = typeof tx.cashbackEarned === 'number' ? tx.cashbackEarned : 0

    if (Math.abs(currentValue - nextValue) < 0.01) {
      return null
    }

    return fs.updateDoc(fs.doc(db, COLLECTION, tx.id), {
      cashbackEarned: nextValue,
    })
  }).filter((item): item is Promise<void> => !!item)

  await Promise.all(pending)
  return pending.length
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
    if (tx.type === 'income') {
      if (isCashIncome(tx)) income += tx.amount
    } else if (tx.type === 'expense') {
      // Exclude credit card expenses from cash flow - they're paid later via creditCardPayment
      if (tx.creditCardId) {
        // Track as credit card charge but don't count as cash expense
      } else {
        expenses += tx.amount
      }
    } else if (tx.type === 'bill') {
      // Exclude credit card bills from cash flow - they're paid later via creditCardPayment
      if (tx.creditCardId) {
        // Track as credit card charge but don't count as cash bill
      } else {
        bills += tx.amount
      }
    } else if (tx.savingsDirection === 'withdraw') savingsWithdrawals += tx.amount
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

/**
 * Category breakdown of money spent (expenses + bills) for the given month's txs.
 * Savings transfers are excluded — they are not discretionary spend.
 */
export function computeMonthlySpendingStats(
  transactions: Transaction[],
): MonthlySpendingStats {
  const byCategory = new Map<string, { amount: number; count: number }>()

  for (const tx of transactions) {
    if (tx.type !== 'expense' && tx.type !== 'bill') continue
    const prev = byCategory.get(tx.category) ?? { amount: 0, count: 0 }
    byCategory.set(tx.category, {
      amount: prev.amount + tx.amount,
      count: prev.count + 1,
    })
  }

  let total = 0
  for (const row of byCategory.values()) total += row.amount

  const categories = [...byCategory.entries()]
    .map(([category, row]) => ({
      category,
      amount: row.amount,
      count: row.count,
      percent: total > 0 ? (row.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return { total, categories }
}

export interface MonthSpendingRow {
  year: number
  month: number
  stats: MonthlySpendingStats
}

/** Spending totals for a window of months ending at the selected month (inclusive). */
export function buildMonthlySpendingHistory(
  transactions: Transaction[],
  endYear: number,
  endMonth: number,
  monthsBack = 5,
): MonthSpendingRow[] {
  const rows: MonthSpendingRow[] = []
  for (let i = monthsBack; i >= 0; i -= 1) {
    const d = new Date(endYear, endMonth - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    rows.push({
      year,
      month,
      stats: computeMonthlySpendingStats(filterByMonth(transactions, year, month)),
    })
  }
  return rows
}

function monthEndExclusive(year: number, month: number): Date {
  return new Date(year, month + 1, 1)
}

/** Pot total from savings txs that occurred before `before` (exclusive). */
function potBalanceBefore(transactions: Transaction[], before: Date): number {
  let saved = 0
  const cutoff = before.getTime()
  for (const tx of transactions) {
    if (tx.type !== 'savings') continue
    const t = new Date(tx.occurredAt).getTime()
    if (Number.isNaN(t) || t >= cutoff) continue
    if (isSavingsWithdraw(tx)) saved -= tx.amount
    else saved += tx.amount
  }
  return Math.max(0, saved)
}

export function computeMonthlySavingsStats(
  monthTransactions: Transaction[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): MonthlySavingsStats {
  let deposits = 0
  let withdrawals = 0
  let depositCount = 0
  let withdrawCount = 0

  for (const tx of monthTransactions) {
    if (tx.type !== 'savings') continue
    if (isSavingsWithdraw(tx)) {
      withdrawals += tx.amount
      withdrawCount += 1
    } else if (isSavingsDeposit(tx)) {
      deposits += tx.amount
      depositCount += 1
    }
  }

  return {
    deposits,
    withdrawals,
    net: deposits - withdrawals,
    depositCount,
    withdrawCount,
    potBalance: potBalanceBefore(allTransactions, monthEndExclusive(year, month)),
  }
}

export interface MonthSavingsRow {
  year: number
  month: number
  stats: MonthlySavingsStats
}

export function buildMonthlySavingsHistory(
  transactions: Transaction[],
  endYear: number,
  endMonth: number,
  monthsBack = 5,
): MonthSavingsRow[] {
  const rows: MonthSavingsRow[] = []
  for (let i = monthsBack; i >= 0; i -= 1) {
    const d = new Date(endYear, endMonth - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    rows.push({
      year,
      month,
      stats: computeMonthlySavingsStats(
        filterByMonth(transactions, year, month),
        transactions,
        year,
        month,
      ),
    })
  }
  return rows
}
