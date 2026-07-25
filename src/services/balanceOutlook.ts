import {
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
