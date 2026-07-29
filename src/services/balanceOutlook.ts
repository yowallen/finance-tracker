import {
  dueDateForMonth,
  isBillDueInMonth,
} from './recurringBills'
import { computeMonthlySummary, filterByMonth } from './transactions'
import type { RecurringBill } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'

export interface MonthBalanceOutlook {
  year: number
  month: number
  income: number
  expenses: number
  recordedBills: number
  /** Total of recurring bills scheduled for this month. */
  scheduledBills: number
  /** Scheduled bills not yet marked paid. */
  unpaidScheduledBills: number
  unpaidCount: number
  scheduledCount: number
  /**
   * This month only: income - expenses - recorded bills - unpaid scheduled bills.
   */
  monthNet: number
  /**
   * Cumulative balance through this month (prior months' nets + this monthNet).
   */
  runningBalance: number
}

function monthKey(year: number, month: number): number {
  return year * 12 + month
}

function fromMonthKey(index: number): { year: number; month: number } {
  return {
    year: Math.floor(index / 12),
    month: ((index % 12) + 12) % 12,
  }
}

function earliestMonthIndex(
  bills: RecurringBill[],
  transactions: Transaction[],
  fallbackYear: number,
  fallbackMonth: number,
): number {
  let earliest = monthKey(fallbackYear, fallbackMonth)

  for (const tx of transactions) {
    const d = new Date(tx.occurredAt)
    if (Number.isNaN(d.getTime())) continue
    earliest = Math.min(earliest, monthKey(d.getFullYear(), d.getMonth()))
  }

  for (const bill of bills) {
    if (!bill.active) continue
    const [y, m] = bill.startsOn.split('-').map(Number)
    if (!y || !m) continue
    earliest = Math.min(earliest, monthKey(y, m - 1))
  }

  return earliest
}

export function computeMonthBalance(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
  runningBalance = 0,
): MonthBalanceOutlook {
  const monthly = filterByMonth(transactions, year, month)
  const summary = computeMonthlySummary(monthly)

  const paidRecurringIds = new Set(
    monthly
      .filter((tx) => tx.type === 'bill' && typeof tx.recurringBillId === 'string')
      .map((tx) => tx.recurringBillId as string),
  )

  const dueBills = bills.filter(
    (bill) => bill.active && isBillDueInMonth(bill, year, month),
  )

  let scheduledBills = 0
  let unpaidScheduledBills = 0
  let unpaidCount = 0

  for (const bill of dueBills) {
    scheduledBills += bill.amount
    if (!paidRecurringIds.has(bill.id)) {
      unpaidScheduledBills += bill.amount
      unpaidCount += 1
    }
  }

  const monthNet =
    summary.income -
    summary.expenses -
    summary.bills -
    summary.savings -
    unpaidScheduledBills

  return {
    year,
    month,
    income: summary.income,
    expenses: summary.expenses,
    recordedBills: summary.bills,
    scheduledBills,
    unpaidScheduledBills,
    unpaidCount,
    scheduledCount: dueBills.length,
    monthNet,
    runningBalance: runningBalance + monthNet,
  }
}

/**
 * Build outlook from the viewed month through the next `monthsAhead` months.
 * Running balance carries prior history (from earliest tx/bill) into each month.
 */
export function buildBalanceOutlook(
  bills: RecurringBill[],
  transactions: Transaction[],
  startYear: number,
  startMonth: number,
  monthsAhead = 11,
): MonthBalanceOutlook[] {
  const startIndex = monthKey(startYear, startMonth)
  const endIndex = startIndex + monthsAhead
  const epoch = earliestMonthIndex(bills, transactions, startYear, startMonth)

  let running = 0
  const rows: MonthBalanceOutlook[] = []

  for (let index = epoch; index <= endIndex; index += 1) {
    const { year, month } = fromMonthKey(index)
    const row = computeMonthBalance(bills, transactions, year, month, running)
    running = row.runningBalance
    if (index >= startIndex) {
      rows.push(row)
    }
  }

  return rows
}

/** Running balance for a single month, including all prior months. */
export function computeRunningBalanceForMonth(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
): MonthBalanceOutlook {
  const rows = buildBalanceOutlook(bills, transactions, year, month, 0)
  return rows[0] ?? computeMonthBalance(bills, transactions, year, month, 0)
}

/** Net change within a month using only activity on or before `day`. */
function monthNetThroughDay(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
  day: number,
): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const clampedDay = Math.min(Math.max(day, 1), daysInMonth)

  const monthly = filterByMonth(transactions, year, month).filter((tx) => {
    const d = new Date(tx.occurredAt)
    return d.getDate() <= clampedDay
  })

  let income = 0
  let expenses = 0
  let recordedBills = 0
  let savingsDeposits = 0
  let savingsWithdrawals = 0
  const paidRecurringIds = new Set<string>()

  for (const tx of monthly) {
    if (tx.type === 'income') income += tx.amount
    else if (tx.type === 'expense') expenses += tx.amount
    else if (tx.type === 'bill') {
      recordedBills += tx.amount
      if (tx.recurringBillId) paidRecurringIds.add(tx.recurringBillId)
    } else if (tx.savingsDirection === 'withdraw') {
      savingsWithdrawals += tx.amount
    } else if (tx.type === 'savings') {
      savingsDeposits += tx.amount
    }
  }

  let unpaidScheduledBills = 0
  for (const bill of bills) {
    if (!bill.active || !isBillDueInMonth(bill, year, month)) continue
    const dueDay = dueDateForMonth(year, month, bill.dueDay).getDate()
    if (dueDay <= clampedDay && !paidRecurringIds.has(bill.id)) {
      unpaidScheduledBills += bill.amount
    }
  }

  return (
    income +
    savingsWithdrawals -
    expenses -
    recordedBills -
    savingsDeposits -
    unpaidScheduledBills
  )
}

/**
 * Running balance as of a specific calendar day (inclusive).
 * Includes prior months in full, then this month's activity through that day.
 */
export function computeRunningBalanceForDay(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
  day: number,
): number {
  const targetIndex = monthKey(year, month)
  const epoch = earliestMonthIndex(bills, transactions, year, month)

  let running = 0
  for (let index = epoch; index < targetIndex; index += 1) {
    const { year: y, month: m } = fromMonthKey(index)
    running = computeMonthBalance(bills, transactions, y, m, running).runningBalance
  }

  return running + monthNetThroughDay(bills, transactions, year, month, day)
}

export interface AverageDailyBalanceResult {
  /** Mean of end-of-day running balances across the averaged days. */
  averageDailyBalance: number
  /** Days included in the average (full month, or month-to-date). */
  daysAveraged: number
  /** Days in the calendar month. */
  daysInMonth: number
  /** End-of-day balance on the last day included in the average. */
  lastDayBalance: number
}

function priorMonthRunningBalance(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
): number {
  const targetIndex = monthKey(year, month)
  const epoch = earliestMonthIndex(bills, transactions, year, month)

  let running = 0
  for (let index = epoch; index < targetIndex; index += 1) {
    const { year: y, month: m } = fromMonthKey(index)
    running = computeMonthBalance(bills, transactions, y, m, running).runningBalance
  }
  return running
}

/**
 * Average Daily Balance for a month: mean of end-of-day running balances.
 * Banks typically use this over the statement month vs a required minimum.
 *
 * When `throughDay` is set (e.g. today in the current month), only days 1..throughDay
 * are averaged — matching month-to-date ADB. Omit it for the full calendar month
 * (includes scheduled unpaid bills on future due dates).
 */
export function computeAverageDailyBalance(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
  throughDay?: number,
): AverageDailyBalanceResult {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lastDay =
    throughDay == null
      ? daysInMonth
      : Math.min(Math.max(throughDay, 1), daysInMonth)

  const prior = priorMonthRunningBalance(bills, transactions, year, month)

  let sum = 0
  let lastDayBalance = prior
  for (let day = 1; day <= lastDay; day += 1) {
    lastDayBalance = prior + monthNetThroughDay(bills, transactions, year, month, day)
    sum += lastDayBalance
  }

  return {
    averageDailyBalance: sum / lastDay,
    daysAveraged: lastDay,
    daysInMonth,
    lastDayBalance,
  }
}
