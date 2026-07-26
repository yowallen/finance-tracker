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
  BillReminder,
  BillReminderStatus,
  DurationUnit,
  RecurringBill,
  RecurringBillInput,
} from '../types/recurringBill'
import type { Transaction } from '../types/transaction'

const COLLECTION = 'recurringBills'
const STARTS_ON_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function monthIndexFromStartsOn(startsOn: string): number {
  const [y, m] = startsOn.split('-').map(Number)
  return y * 12 + (m - 1)
}

function startsOnFromMonthIndex(index: number): string {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function durationInMonths(
  value: number,
  unit: DurationUnit,
): number {
  return unit === 'years' ? value * 12 : value
}

export function totalPaymentsFor(bill: Pick<RecurringBill, 'durationValue' | 'durationUnit'>): number {
  return durationInMonths(bill.durationValue, bill.durationUnit)
}

export function endsOnFor(bill: Pick<RecurringBill, 'startsOn' | 'durationValue' | 'durationUnit'>): string {
  const start = monthIndexFromStartsOn(bill.startsOn)
  const total = totalPaymentsFor(bill)
  return startsOnFromMonthIndex(start + total - 1)
}

export function isBillDueInMonth(
  bill: Pick<RecurringBill, 'startsOn' | 'durationValue' | 'durationUnit'>,
  year: number,
  month: number,
): boolean {
  const start = monthIndexFromStartsOn(bill.startsOn)
  const view = year * 12 + month
  const end = start + totalPaymentsFor(bill) - 1
  return view >= start && view <= end
}

export function paymentNumberForMonth(
  bill: Pick<RecurringBill, 'startsOn'>,
  year: number,
  month: number,
): number {
  const start = monthIndexFromStartsOn(bill.startsOn)
  const view = year * 12 + month
  return view - start + 1
}

function defaultStartsOn(createdAt: unknown): string {
  if (createdAt instanceof Timestamp) {
    return toMonthInputValue(createdAt.toDate())
  }
  if (typeof createdAt === 'string') {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) {
      return toMonthInputValue(d)
    }
  }
  return toMonthInputValue(new Date())
}

function toMonthInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

interface MappedBill {
  bill: RecurringBill
  /** True when schedule fields were filled in for a pre-duration document. */
  needsScheduleMigration: boolean
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
): MappedBill | null {
  const userId = data.userId
  const name = data.name
  const amount = data.amount
  const category = data.category
  const dueDay = data.dueDay
  const notes = data.notes
  const active = data.active

  if (
    typeof userId !== 'string' ||
    typeof name !== 'string' ||
    typeof amount !== 'number' ||
    typeof category !== 'string' ||
    typeof dueDay !== 'number' ||
    typeof notes !== 'string' ||
    typeof active !== 'boolean'
  ) {
    return null
  }

  const rawStartsOn = data.startsOn
  const rawDurationValue = data.durationValue
  const rawDurationUnit = data.durationUnit

  const hasValidStartsOn =
    typeof rawStartsOn === 'string' && STARTS_ON_PATTERN.test(rawStartsOn)
  const hasValidDuration =
    typeof rawDurationValue === 'number' &&
    Number.isFinite(rawDurationValue) &&
    rawDurationValue >= 1
  const hasValidUnit =
    rawDurationUnit === 'months' || rawDurationUnit === 'years'

  const needsScheduleMigration =
    !hasValidStartsOn || !hasValidDuration || !hasValidUnit

  const startsOn = hasValidStartsOn
    ? rawStartsOn
    : defaultStartsOn(data.createdAt)
  const durationValue = hasValidDuration ? rawDurationValue : 12
  const durationUnit: DurationUnit = hasValidUnit ? rawDurationUnit : 'months'

  return {
    bill: {
      id,
      userId,
      name,
      amount,
      category,
      dueDay,
      startsOn,
      durationValue,
      durationUnit,
      notes,
      active,
      createdAt: toIso(data.createdAt),
    },
    needsScheduleMigration,
  }
}

async function migrateScheduleFields(bill: RecurringBill): Promise<void> {
  if (!db) {
    return
  }

  await updateDoc(doc(db, COLLECTION, bill.id), {
    startsOn: bill.startsOn,
    durationValue: bill.durationValue,
    durationUnit: bill.durationUnit,
  })
}

export function subscribeRecurringBills(
  userId: string,
  onData: (bills: RecurringBill[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!db) {
    onError(new Error('Firebase is not configured. Data sync is unavailable.'))
    return () => {}
  }

  const q = query(collection(db, COLLECTION), where('userId', '==', userId))
  const migrating = new Set<string>()

  return onSnapshot(
    q,
    (snapshot) => {
      const items: RecurringBill[] = []
      let invalidId: string | null = null

      for (const docSnap of snapshot.docs) {
        const mapped = mapDoc(docSnap.id, docSnap.data())
        if (!mapped) {
          invalidId = docSnap.id
          continue
        }

        items.push(mapped.bill)

        if (
          mapped.needsScheduleMigration &&
          !migrating.has(mapped.bill.id)
        ) {
          migrating.add(mapped.bill.id)
          void migrateScheduleFields(mapped.bill).catch((err: unknown) => {
            migrating.delete(mapped.bill.id)
            const message =
              err instanceof Error
                ? err.message
                : 'Failed to migrate bill schedule fields.'
            onError(new Error(message))
          })
        }
      }

      items.sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name))
      onData(items)

      if (invalidId) {
        onError(
          new Error(
            `Recurring bill ${invalidId} has invalid or incomplete core data.`,
          ),
        )
      }
    },
    (error) => onError(error),
  )
}

export async function createRecurringBill(
  userId: string,
  input: RecurringBillInput,
): Promise<string> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  validateInput(input)
  const ref = await addDoc(collection(db, COLLECTION), {
    userId,
    name: input.name.trim(),
    amount: input.amount,
    category: input.category.trim(),
    dueDay: Math.trunc(input.dueDay),
    startsOn: input.startsOn,
    durationValue: Math.trunc(input.durationValue),
    durationUnit: input.durationUnit,
    notes: input.notes.trim(),
    active: input.active ?? true,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateRecurringBill(
  id: string,
  input: RecurringBillInput,
): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  validateInput(input)
  await updateDoc(doc(db, COLLECTION, id), {
    name: input.name.trim(),
    amount: input.amount,
    category: input.category.trim(),
    dueDay: Math.trunc(input.dueDay),
    startsOn: input.startsOn,
    durationValue: Math.trunc(input.durationValue),
    durationUnit: input.durationUnit,
    notes: input.notes.trim(),
    active: input.active ?? true,
  })
}

export async function deleteRecurringBill(id: string): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured. Data sync is unavailable.')
  }

  await deleteDoc(doc(db, COLLECTION, id))
}

function validateInput(input: RecurringBillInput): void {
  if (!input.name.trim()) throw new Error('Bill name is required.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    throw new Error('Due day must be between 1 and 31.')
  }
  if (!STARTS_ON_PATTERN.test(input.startsOn)) {
    throw new Error('Start month must be a valid YYYY-MM value.')
  }
  if (
    !Number.isInteger(input.durationValue) ||
    input.durationValue < 1 ||
    input.durationValue > 600
  ) {
    throw new Error('Duration must be a whole number between 1 and 600.')
  }
  if (input.durationUnit !== 'months' && input.durationUnit !== 'years') {
    throw new Error('Duration unit must be months or years.')
  }
}

/** Due date for a bill in a given month (clamps day to month length). */
export function dueDateForMonth(
  year: number,
  month: number,
  dueDay: number,
): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(dueDay, lastDay)
  return new Date(year, month, day, 23, 59, 59, 999)
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function buildBillReminders(
  bills: RecurringBill[],
  monthTransactions: Transaction[],
  year: number,
  month: number,
  today: Date = new Date(),
): BillReminder[] {
  const todayStart = startOfLocalDay(today)
  const viewingCurrent =
    today.getFullYear() === year && today.getMonth() === month
  const viewingPast =
    year < today.getFullYear() ||
    (year === today.getFullYear() && month < today.getMonth())

  return bills
    .filter((b) => b.active && isBillDueInMonth(b, year, month))
    .map((bill) => {
      const dueDate = dueDateForMonth(year, month, bill.dueDay)
      const dueStart = startOfLocalDay(dueDate)
      const msPerDay = 24 * 60 * 60 * 1000
      const daysUntilDue = Math.round(
        (dueStart.getTime() - todayStart.getTime()) / msPerDay,
      )

      const paid = monthTransactions.find(
        (tx) => tx.type === 'bill' && tx.recurringBillId === bill.id,
      )

      let status: BillReminderStatus
      if (paid) {
        status = 'paid'
      } else if (viewingPast) {
        status = 'unpaid'
      } else if (viewingCurrent && daysUntilDue < 0) {
        status = 'overdue'
      } else if (viewingCurrent && daysUntilDue <= 3) {
        status = 'due-soon'
      } else {
        status = 'upcoming'
      }

      return {
        bill,
        dueDate,
        status,
        daysUntilDue,
        paidTransactionId: paid?.id ?? null,
        paymentNumber: paymentNumberForMonth(bill, year, month),
        totalPayments: totalPaymentsFor(bill),
        endsOn: endsOnFor(bill),
      }
    })
    .sort((a, b) => {
      const rank: Record<BillReminderStatus, number> = {
        overdue: 0,
        'due-soon': 1,
        upcoming: 2,
        unpaid: 3,
        paid: 4,
      }
      return rank[a.status] - rank[b.status] || a.bill.dueDay - b.bill.dueDay
    })
}
