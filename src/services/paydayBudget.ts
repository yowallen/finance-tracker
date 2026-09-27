import { getFirestoreClient } from '../lib/firebase'
import { isPhilippineNonBankingDay } from './recurringBills'
import type { Unsubscribe } from 'firebase/firestore'
import type { BillReminder } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'
import {
  DEFAULT_PAYDAY_SETTINGS,
  PAYDAY_PRESETS,
  type PaydayPeriod,
  type PaydayPeriodSummary,
  type PaydayScheduleId,
  type PaydaySettings,
} from '../types/paydayBudget'

const COLLECTION = 'paydayBudgets'
const STORAGE_PREFIX = 'ledger.paydayBudget:'

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

export function readLocalPaydaySettings(userId: string): PaydaySettings | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    return mapSettings(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return null
  }
}

function writeLocalPaydaySettings(userId: string, settings: PaydaySettings): void {
  const [firstDay, secondDay] = paydayDays(settings)
  localStorage.setItem(storageKey(userId), JSON.stringify({
    schedule: settings.schedule,
    firstDay,
    secondDay,
    allowance: Math.max(0, settings.allowance),
    rollover: settings.rollover,
    monthlyGross: Math.max(0, settings.monthlyGross),
    deMinimisPerPayday: Math.max(0, settings.deMinimisPerPayday),
  }))
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'permission-denied'
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function paydayDate(year: number, month: number, day: number): Date {
  const clamped = Math.min(Math.max(1, day), lastDayOfMonth(year, month))
  const release = new Date(year, month, clamped)
  while (isPhilippineNonBankingDay(release)) {
    release.setDate(release.getDate() - 1)
  }
  return release
}

function daysBetween(start: Date, end: Date): number {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime()
  return Math.round(ms / 86_400_000)
}

export function paydayDays(settings: Pick<PaydaySettings, 'firstDay' | 'secondDay'>): [number, number] {
  const first = Math.min(settings.firstDay, settings.secondDay)
  const second = Math.max(settings.firstDay, settings.secondDay)
  return [first, second]
}

/** Periods that overlap the calendar month. A period runs from the day after one payday through the next. */
export function periodsOverlappingMonth(
  year: number,
  month: number,
  settings: Pick<PaydaySettings, 'firstDay' | 'secondDay'>,
  today = new Date(),
): PaydayPeriod[] {
  const [earlier, later] = paydayDays(settings)
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month, lastDayOfMonth(year, month))
  const paydays: Date[] = []

  for (let offset = -1; offset <= 2; offset += 1) {
    const cursor = new Date(year, month + offset, 1)
    for (const day of [earlier, later]) {
      paydays.push(paydayDate(cursor.getFullYear(), cursor.getMonth(), day))
    }
  }

  paydays.sort((a, b) => a.getTime() - b.getTime())
  const unique = paydays.filter((date, index) => index === 0 || date.getTime() !== paydays[index - 1].getTime())
  const todayDay = startOfDay(today)
  const periods: PaydayPeriod[] = []

  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = addDays(unique[index], 1)
    const end = unique[index + 1]
    if (end < monthStart || start > monthEnd) continue
    periods.push({
      start,
      end,
      active: todayDay >= start && todayDay <= end,
    })
  }

  return periods
}

function inPeriod(date: Date, period: PaydayPeriod): boolean {
  const day = startOfDay(date)
  return day >= startOfDay(period.start) && day <= startOfDay(period.end)
}

function transactionDay(occurredAt: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(occurredAt)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const parsed = new Date(occurredAt)
  return startOfDay(parsed)
}

/** Period funding: fixed allowance when set; otherwise logged income in the period. */
export function periodFunding(allowance: number, income: number): number {
  return allowance > 0 ? allowance : income
}

/** How many prior payday periods to walk when rolling leftovers into the first visible card. */
const ROLLOVER_LOOKBACK_PERIODS = 24

function paydaysNear(
  anchor: Date,
  settings: Pick<PaydaySettings, 'firstDay' | 'secondDay'>,
  monthRadius = 14,
): Date[] {
  const [earlier, later] = paydayDays(settings)
  const paydays: Date[] = []
  for (let offset = -monthRadius; offset <= monthRadius; offset += 1) {
    const cursor = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)
    paydays.push(paydayDate(cursor.getFullYear(), cursor.getMonth(), earlier))
    paydays.push(paydayDate(cursor.getFullYear(), cursor.getMonth(), later))
  }
  paydays.sort((a, b) => a.getTime() - b.getTime())
  return paydays.filter(
    (date, index) => index === 0 || date.getTime() !== paydays[index - 1].getTime(),
  )
}

function paydayStrictlyBefore(
  date: Date,
  settings: Pick<PaydaySettings, 'firstDay' | 'secondDay'>,
): Date | null {
  const day = startOfDay(date).getTime()
  const prior = paydaysNear(date, settings).filter((payday) => startOfDay(payday).getTime() < day)
  return prior.length > 0 ? prior[prior.length - 1] : null
}

/** Prior payday periods oldest→newest ending just before `periodStart`. */
function priorPeriodsBefore(
  periodStart: Date,
  settings: Pick<PaydaySettings, 'firstDay' | 'secondDay'>,
  limit = ROLLOVER_LOOKBACK_PERIODS,
): PaydayPeriod[] {
  const periods: PaydayPeriod[] = []
  let end = addDays(periodStart, -1)

  for (let index = 0; index < limit; index += 1) {
    const startPayday = paydayStrictlyBefore(end, settings)
    if (!startPayday) break
    const start = addDays(startPayday, 1)
    if (startOfDay(start).getTime() > startOfDay(end).getTime()) break
    periods.unshift({ start, end, active: false })
    end = startPayday
  }

  return periods
}

export function summarizePaydayPeriods(
  periods: PaydayPeriod[],
  settings: Pick<PaydaySettings, 'allowance' | 'rollover' | 'firstDay' | 'secondDay'>,
  transactions: Transaction[],
  reminders: BillReminder[],
  today = new Date(),
): PaydayPeriodSummary[] {
  let carry = 0
  if (settings.rollover && periods.length > 0) {
    carry = rolloverInto(periods[0].start, settings, transactions, reminders)
  }

  return periods.map((period) => {
    const rolloverIn = settings.rollover ? carry : 0
    const totals = periodTotals(period, transactions, reminders)
    const funded = periodFunding(settings.allowance, totals.income)
    const left = funded + rolloverIn - totals.spent - totals.stillDue
    const todayDay = startOfDay(today)
    const daysRemaining = todayDay < period.start
      ? daysBetween(period.start, period.end) + 1
      : todayDay > period.end
        ? 0
        : daysBetween(todayDay, period.end) + 1
    if (settings.rollover) carry = left
    return {
      ...period,
      ...totals,
      rolloverIn,
      allowance: settings.allowance,
      left,
      daysRemaining,
      perDay: period.active && daysRemaining > 0 ? left / daysRemaining : null,
    }
  })
}

function periodTotals(
  period: PaydayPeriod,
  transactions: Transaction[],
  reminders: BillReminder[],
): { income: number; spent: number; stillDue: number } {
  let income = 0
  let spent = 0
  for (const tx of transactions) {
    if (!inPeriod(transactionDay(tx.occurredAt), period)) continue
    if (tx.type === 'income') {
      income += tx.amount
      continue
    }
    // Cash/debit only: card charges wait until the statement payment hits cash.
    if (tx.type === 'expense') {
      if (!tx.creditCardId) spent += tx.amount
      continue
    }
    if (tx.type === 'bill') {
      if (tx.creditCardPayment === true) spent += tx.amount
      else if (!tx.creditCardId) spent += tx.amount
    }
  }

  let stillDue = 0
  for (const reminder of reminders) {
    if (reminder.status === 'paid' || reminder.payWithCreditCard) continue
    const due = reminder.actualDueDate ?? reminder.dueDate
    if (!inPeriod(due, period)) continue
    stillDue += reminder.bill.amount
  }

  return { income, spent, stillDue }
}

/**
 * Leftover rolled into a period start by walking prior payday periods
 * (not just the immediate previous one), so month views stay consistent.
 * Periods before any ledger activity are ignored so fixed allowances
 * do not invent years of unspent budget.
 */
function earliestLedgerDay(
  transactions: Transaction[],
  reminders: BillReminder[],
): Date | null {
  let earliest: Date | null = null
  for (const tx of transactions) {
    const day = transactionDay(tx.occurredAt)
    if (!earliest || day.getTime() < earliest.getTime()) earliest = day
  }
  for (const reminder of reminders) {
    const day = startOfDay(reminder.actualDueDate ?? reminder.dueDate)
    if (!earliest || day.getTime() < earliest.getTime()) earliest = day
  }
  return earliest
}

function rolloverInto(
  periodStart: Date,
  settings: Pick<PaydaySettings, 'allowance' | 'firstDay' | 'secondDay'>,
  transactions: Transaction[],
  reminders: BillReminder[],
): number {
  const earliest = earliestLedgerDay(transactions, reminders)
  if (!earliest) return 0

  let carry = 0
  for (const period of priorPeriodsBefore(periodStart, settings)) {
    const totals = periodTotals(period, transactions, reminders)
    const empty = totals.income === 0 && totals.spent === 0 && totals.stillDue === 0
    if (empty && startOfDay(period.end).getTime() < earliest.getTime()) {
      continue
    }
    carry =
      periodFunding(settings.allowance, totals.income) +
      carry -
      totals.spent -
      totals.stillDue
  }
  return carry
}

export function settingsFromPreset(id: PaydayScheduleId, current: PaydaySettings): PaydaySettings {
  if (id === 'custom') return { ...current, schedule: 'custom' }
  const preset = PAYDAY_PRESETS.find((item) => item.id === id)
  if (!preset) return current
  return { ...current, schedule: preset.id, firstDay: preset.firstDay, secondDay: preset.secondDay }
}

function mapSettings(data: Record<string, unknown> | undefined): PaydaySettings {
  if (!data) return DEFAULT_PAYDAY_SETTINGS
  const schedule = data.schedule
  const known = schedule === '15-30' || schedule === '5-20' || schedule === '10-25' || schedule === '5-26' || schedule === 'custom'
  const firstDay = typeof data.firstDay === 'number' ? data.firstDay : DEFAULT_PAYDAY_SETTINGS.firstDay
  const secondDay = typeof data.secondDay === 'number' ? data.secondDay : DEFAULT_PAYDAY_SETTINGS.secondDay
  const allowance = typeof data.allowance === 'number' && Number.isFinite(data.allowance) ? data.allowance : 0
  const monthlyGross = typeof data.monthlyGross === 'number' && Number.isFinite(data.monthlyGross) ? data.monthlyGross : 0
  const deMinimisPerPayday = typeof data.deMinimisPerPayday === 'number' && Number.isFinite(data.deMinimisPerPayday) ? data.deMinimisPerPayday : 0
  return {
    schedule: known ? schedule : 'custom',
    firstDay: Math.min(31, Math.max(1, Math.round(firstDay))),
    secondDay: Math.min(31, Math.max(1, Math.round(secondDay))),
    allowance: Math.max(0, allowance),
    rollover: data.rollover === true,
    monthlyGross: Math.max(0, monthlyGross),
    deMinimisPerPayday: Math.max(0, deMinimisPerPayday),
  }
}

export function subscribePaydaySettings(
  userId: string,
  onData: (settings: PaydaySettings) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return
      const local = readLocalPaydaySettings(userId)
      if (local) onData(local)
      unsubscribe = fs.onSnapshot(
        fs.doc(db, COLLECTION, userId),
        (snapshot) => onData(mapSettings(snapshot.data() as Record<string, unknown> | undefined)),
        (error) => {
          if (isPermissionDenied(error) && local) return
          onError(error)
        },
      )
    })
    .catch((err: unknown) => {
      if (!disposed) onError(err instanceof Error ? err : new Error(String(err)))
    })

  return () => {
    disposed = true
    unsubscribe()
  }
}

export async function savePaydaySettings(userId: string, settings: PaydaySettings): Promise<void> {
  const [firstDay, secondDay] = paydayDays(settings)
  const payload = {
    userId,
    schedule: settings.schedule,
    firstDay,
    secondDay,
    allowance: Math.max(0, settings.allowance),
    rollover: settings.rollover,
    monthlyGross: Math.max(0, settings.monthlyGross),
    deMinimisPerPayday: Math.max(0, settings.deMinimisPerPayday),
  }
  writeLocalPaydaySettings(userId, settings)
  const { fs, db } = await getFirestoreClient()
  try {
    await fs.setDoc(fs.doc(db, COLLECTION, userId), payload)
  } catch (error) {
    if (isPermissionDenied(error)) return
    throw error
  }
}
