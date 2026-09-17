import {
  dueDateForMonth,
  isBillDueInMonth,
} from './recurringBills'
import { computeMonthlySummary, filterByMonth } from './transactions'
import type { CreditCardPaymentBill } from './creditCardBills'
import type { RecurringBill } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'

/** Checks if a bill is flagged to be paid with credit card for a given month. */
function isBillPaidWithCreditCard(bill: RecurringBill, year: number, month: number): boolean {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  return bill.creditCardMonths?.includes(monthKey) ?? false
}

/** Checks if a transaction is a credit card payment (bill type with creditCardPayment flag). */
function isCreditCardPayment(tx: Transaction): boolean {
  return tx.type === 'bill' && tx.creditCardPayment === true
}

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
  ccPaymentBills: CreditCardPaymentBill[] = [],
): MonthBalanceOutlook {
  const monthly = filterByMonth(transactions, year, month)
  const summary = computeMonthlySummary(monthly)

  const paidRecurringIds = new Set(
    monthly
      .filter((tx) => tx.type === 'bill' && typeof tx.recurringBillId === 'string')
      .map((tx) => tx.recurringBillId as string),
  )

  // Also track paid credit card payment bills (by cardId + statement period)
  const paidCcPaymentIds = new Set(
    monthly
      .filter((tx) => tx.type === 'bill' && tx.creditCardPayment === true && typeof tx.creditCardId === 'string')
      .map((tx) => `${tx.creditCardId}:${new Date(tx.occurredAt).toISOString().slice(0, 7)}`),
  )

  // Credit card payments (bill type with creditCardPayment: true) are treated as bill outflows
  const creditCardPayments = monthly.filter(isCreditCardPayment)
  const creditCardPaymentTotal = creditCardPayments.reduce((sum, tx) => sum + tx.amount, 0)

  const dueBills = bills.filter(
    (bill) => bill.active && isBillDueInMonth(bill, year, month),
  )

  // Filter credit card payment bills due in this month
  const dueCcPaymentBills = ccPaymentBills.filter(
    (bill) => bill.scheduledDueDate.getFullYear() === year && bill.scheduledDueDate.getMonth() === month,
  )

  let scheduledBills = 0
  let unpaidScheduledBills = 0
  let unpaidCount = 0

  for (const bill of dueBills) {
    scheduledBills += bill.amount
    // Exclude bills flagged as paid with credit card for this month from cash flow
    const isCreditCardMonth = isBillPaidWithCreditCard(bill, year, month)
    if (!paidRecurringIds.has(bill.id) && !isCreditCardMonth) {
      unpaidScheduledBills += bill.amount
      unpaidCount += 1
    }
  }

  // Add credit card payment bills to scheduled/unpaid
  for (const ccBill of dueCcPaymentBills) {
    scheduledBills += ccBill.amount
    // Credit card payment bills are always paid with cash/debit, never with credit card
    // Check if already paid (by cardId + statement month)
    const ccBillKey = `${ccBill.cardId}:${ccBill.dueDate.toISOString().slice(0, 7)}`
    if (!paidCcPaymentIds.has(ccBillKey)) {
      unpaidScheduledBills += ccBill.amount
      unpaidCount += 1
    }
  }

  const monthNet =
    summary.income -
    summary.expenses -
    summary.bills -
    creditCardPaymentTotal -
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
    scheduledCount: dueBills.length + dueCcPaymentBills.length,
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
  ccPaymentBills: CreditCardPaymentBill[] = [],
): MonthBalanceOutlook[] {
  const startIndex = monthKey(startYear, startMonth)
  const endIndex = startIndex + monthsAhead
  const epoch = earliestMonthIndex(bills, transactions, startYear, startMonth)

  let running = 0
  const rows: MonthBalanceOutlook[] = []

  for (let index = epoch; index <= endIndex; index += 1) {
    const { year, month } = fromMonthKey(index)
    const row = computeMonthBalance(bills, transactions, year, month, running, ccPaymentBills)
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
  ccPaymentBills: CreditCardPaymentBill[] = [],
): MonthBalanceOutlook {
  const rows = buildBalanceOutlook(bills, transactions, year, month, 0, ccPaymentBills)
  return rows[0] ?? computeMonthBalance(bills, transactions, year, month, 0, ccPaymentBills)
}

/** Net change within a month using only activity on or before `day`. */
export function computeMonthNetThroughDay(
  bills: RecurringBill[],
  transactions: Transaction[],
  year: number,
  month: number,
  day: number,
  ccPaymentBills: CreditCardPaymentBill[] = [],
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
  let creditCardPayments = 0
  let savingsDeposits = 0
  let savingsWithdrawals = 0
  const paidRecurringIds = new Set<string>()
  const paidCcPaymentIds = new Set<string>()

  for (const tx of monthly) {
    if (tx.type === 'income') income += tx.amount
    else if (tx.type === 'expense') {
      // Exclude credit card expenses from cash flow - they're paid later via creditCardPayment
      if (tx.creditCardId) {
        // Track as credit card charge but don't count as cash expense
      } else {
        expenses += tx.amount
      }
    } else if (tx.type === 'bill') {
      if (tx.creditCardPayment === true) {
        creditCardPayments += tx.amount
        if (tx.creditCardId) {
          paidCcPaymentIds.add(`${tx.creditCardId}:${new Date(tx.occurredAt).toISOString().slice(0, 7)}`)
        }
      } else if (tx.creditCardId) {
        // Credit card bill (not a payment) - don't count as cash bill, paid later via creditCardPayment
      } else {
        recordedBills += tx.amount
        if (tx.recurringBillId) paidRecurringIds.add(tx.recurringBillId)
      }
    } else if (tx.savingsDirection === 'withdraw') {
      savingsWithdrawals += tx.amount
    } else if (tx.type === 'savings') {
      savingsDeposits += tx.amount
    }
  }

  let unpaidScheduledBills = 0
  for (const bill of bills) {
    if (!bill.active || !isBillDueInMonth(bill, year, month)) continue
    // Exclude bills flagged as paid with credit card for this month from cash flow
    const isCreditCardMonth = isBillPaidWithCreditCard(bill, year, month)
    const dueDay = dueDateForMonth(year, month, bill.dueDay).getDate()
    if (dueDay <= clampedDay && !paidRecurringIds.has(bill.id) && !isCreditCardMonth) {
      unpaidScheduledBills += bill.amount
    }
  }

  // Add credit card payment bills due on or before the clamped day
  for (const ccBill of ccPaymentBills) {
    if (ccBill.scheduledDueDate.getFullYear() !== year || ccBill.scheduledDueDate.getMonth() !== month) continue
    const ccBillKey = `${ccBill.cardId}:${ccBill.scheduledDueDate.toISOString().slice(0, 7)}`
    const dueDay = ccBill.scheduledDueDate.getDate()
    if (dueDay <= clampedDay && !paidCcPaymentIds.has(ccBillKey)) {
      unpaidScheduledBills += ccBill.amount
    }
  }

  return (
    income +
    savingsWithdrawals -
    expenses -
    recordedBills -
    creditCardPayments -
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
  ccPaymentBills: CreditCardPaymentBill[] = [],
): number {
  const targetIndex = monthKey(year, month)
  const epoch = earliestMonthIndex(bills, transactions, year, month)

  let running = 0
  for (let index = epoch; index < targetIndex; index += 1) {
    const { year: y, month: m } = fromMonthKey(index)
    running = computeMonthBalance(bills, transactions, y, m, running, ccPaymentBills).runningBalance
  }

  return running + computeMonthNetThroughDay(bills, transactions, year, month, day, ccPaymentBills)
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
  ccPaymentBills: CreditCardPaymentBill[] = [],
): number {
  const targetIndex = monthKey(year, month)
  const epoch = earliestMonthIndex(bills, transactions, year, month)

  let running = 0
  for (let index = epoch; index < targetIndex; index += 1) {
    const { year: y, month: m } = fromMonthKey(index)
    running = computeMonthBalance(bills, transactions, y, m, running, ccPaymentBills).runningBalance
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
  ccPaymentBills: CreditCardPaymentBill[] = [],
): AverageDailyBalanceResult {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lastDay =
    throughDay == null
      ? daysInMonth
      : Math.min(Math.max(throughDay, 1), daysInMonth)

  const prior = priorMonthRunningBalance(bills, transactions, year, month, ccPaymentBills)

  let sum = 0
  let lastDayBalance = prior
  for (let day = 1; day <= lastDay; day += 1) {
    lastDayBalance = prior + computeMonthNetThroughDay(bills, transactions, year, month, day, ccPaymentBills)
    sum += lastDayBalance
  }

  return {
    averageDailyBalance: sum / lastDay,
    daysAveraged: lastDay,
    daysInMonth,
    lastDayBalance,
  }
}
