import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
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

function toIso(value: unknown, timestampCtor: typeof Timestamp): string {
  if (value instanceof timestampCtor) {
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

function defaultStartsOn(createdAt: unknown, timestampCtor: typeof Timestamp): string {
  if (createdAt instanceof timestampCtor) {
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
  timestampCtor: typeof Timestamp,
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
    : defaultStartsOn(data.createdAt, timestampCtor)
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
      createdAt: toIso(data.createdAt, timestampCtor),
    },
    needsScheduleMigration,
  }
}

async function migrateScheduleFields(
  fs: typeof import('firebase/firestore'),
  db: Awaited<ReturnType<typeof getFirestoreClient>>['db'],
  bill: RecurringBill,
): Promise<void> {
  await fs.updateDoc(fs.doc(db, COLLECTION, bill.id), {
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
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return

      const q = fs.query(
        fs.collection(db, COLLECTION),
        fs.where('userId', '==', userId),
      )
      const migrating = new Set<string>()

      unsubscribe = fs.onSnapshot(
        q,
        (snapshot) => {
          const items: RecurringBill[] = []
          let invalidId: string | null = null

          for (const docSnap of snapshot.docs) {
            const mapped = mapDoc(docSnap.id, docSnap.data(), fs.Timestamp)
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
              void migrateScheduleFields(fs, db, mapped.bill).catch(
                (err: unknown) => {
                  migrating.delete(mapped.bill.id)
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to migrate bill schedule fields.'
                  onError(new Error(message))
                },
              )
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

export async function createRecurringBill(
  userId: string,
  input: RecurringBillInput,
): Promise<string> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)
  const ref = await fs.addDoc(fs.collection(db, COLLECTION), {
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
    createdAt: fs.serverTimestamp(),
  })
  return ref.id
}

export async function updateRecurringBill(
  id: string,
  input: RecurringBillInput,
): Promise<void> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)
  await fs.updateDoc(fs.doc(db, COLLECTION, id), {
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
  const { fs, db } = await getFirestoreClient()
  await fs.deleteDoc(fs.doc(db, COLLECTION, id))
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

const FIXED_PHILIPPINE_REGULAR_HOLIDAYS = [
  [0, 1], // New Year's Day
  [3, 9], // Araw ng Kagitingan
  [4, 1], // Labor Day
  [5, 12], // Independence Day
  [10, 30], // Bonifacio Day
  [11, 25], // Christmas Day
  [11, 30], // Rizal Day
] as const

function lastMondayOfAugust(year: number): Date {
  const date = new Date(year, 7, 31)
  date.setDate(31 - ((date.getDay() + 6) % 7))
  return date
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Return whether a date is a Philippine weekend or regular national holiday. */
export function isPhilippineNonBankingDay(date: Date): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return true

  if (FIXED_PHILIPPINE_REGULAR_HOLIDAYS.some(([month, holidayDay]) =>
    date.getMonth() === month && date.getDate() === holidayDay,
  )) {
    return true
  }

  if (date.getMonth() === 7 && localDateKey(date) === localDateKey(lastMondayOfAugust(date.getFullYear()))) {
    return true
  }

  const easter = easterSunday(date.getFullYear())
  const maundyThursday = new Date(easter)
  maundyThursday.setDate(easter.getDate() - 3)
  const goodFriday = new Date(easter)
  goodFriday.setDate(easter.getDate() - 2)
  return localDateKey(date) === localDateKey(maundyThursday) || localDateKey(date) === localDateKey(goodFriday)
}

/** Move a due date forward to the next Philippine banking day. */
export function nextPhilippineBankingDay(date: Date): Date {
  const adjusted = new Date(date)
  while (isPhilippineNonBankingDay(adjusted)) {
    adjusted.setDate(adjusted.getDate() + 1)
  }
  return adjusted
}

/** Find a recommended payment date a number of banking days before a due date. */
export function previousPhilippineBankingDay(date: Date, bankingDays: number): Date {
  const recommended = new Date(date)
  let remaining = bankingDays
  while (remaining > 0) {
    recommended.setDate(recommended.getDate() - 1)
    if (!isPhilippineNonBankingDay(recommended)) remaining -= 1
  }
  return recommended
}

export function startOfLocalDay(d: Date): Date {
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
