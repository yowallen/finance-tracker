import type { CreditCard } from '../types/creditCard'
import type { CreditCardStatement } from '../types/creditCard'
import type { RecurringBill, BillReminder, BillReminderStatus } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'
import { previousPhilippineBankingDay, startOfLocalDay } from './recurringBills'

/**
 * A virtual recurring bill representing a credit card payment.
 * These are not stored in Firestore - they're derived from credit card settings.
 */
export interface CreditCardPaymentBill {
  /** Unique identifier: `cc-payment:${cardId}` */
  id: string
  /** The credit card this payment is for */
  cardId: string
  /** Card name for display */
  cardName: string
  /** Last 4 digits for display */
  lastFour: string
  /** Statement balance for the current month (amount to pay) */
  amount: number
  /** Actual due date for this statement */
  dueDate: Date
  /** Configured payment date before banking-day adjustment */
  scheduledDueDate: Date
  /** Configured day of month */
  dueDay: number
  /** Category for the payment transaction */
  category: string
  /** Card color for UI */
  color?: string
}

/**
 * Generate virtual recurring bills for credit card payments.
 * One per active card with a statement balance > 0.
 */
export function generateCreditCardPaymentBills(
  cards: CreditCard[],
  statements: CreditCardStatement[],
): CreditCardPaymentBill[] {
  const bills: CreditCardPaymentBill[] = []

  for (const statement of statements) {
    const card = cards.find((candidate) => candidate.id === statement.card.id)
    if (!card) continue
    if (!card.active) continue

    // Only create a payment bill if there's a balance to pay
    if (statement.statementBalance <= 0) continue

    const dueDate = new Date(statement.dueDate)
    const scheduledDueDate = new Date(dueDate)
    if (card.dueDay !== undefined) {
      const scheduledMonth = statement.statementDate.getMonth() + (card.dueDay <= card.statementDay ? 1 : 0)
      const lastDay = new Date(statement.statementDate.getFullYear(), scheduledMonth + 1, 0).getDate()
      scheduledDueDate.setFullYear(
        statement.statementDate.getFullYear(),
        scheduledMonth,
        Math.min(card.dueDay, lastDay),
      )
    }

    bills.push({
      id: `cc-payment:${card.id}:${statement.statementDate.toISOString().slice(0, 10)}`,
      cardId: card.id,
      cardName: card.name,
      lastFour: card.lastFour,
      amount: statement.statementBalance,
      dueDate,
      scheduledDueDate,
      dueDay: previousPhilippineBankingDay(dueDate, 3).getDate(),
      category: 'Credit card payment',
      color: card.color,
    })
  }

  return bills
}

/**
 * Convert a credit card payment bill to a BillReminder for display.
 */
export function creditCardBillToReminder(
  ccBill: CreditCardPaymentBill,
  year: number,
  month: number,
  monthTransactions: Transaction[],
  today: Date = new Date(),
): BillReminder {
  const todayStart = startOfLocalDay(today)
  const viewingCurrent =
    today.getFullYear() === year && today.getMonth() === month
  const viewingPast =
    year < today.getFullYear() ||
    (year === today.getFullYear() && month < today.getMonth())

  const actualDueDate = new Date(ccBill.dueDate)
  const recommendedPaymentDate = previousPhilippineBankingDay(actualDueDate, 3)
  const dueDate = recommendedPaymentDate
  const dueStart = startOfLocalDay(actualDueDate)
  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntilDue = Math.round((dueStart.getTime() - todayStart.getTime()) / msPerDay)

  // Check if already paid this month (creditCardPayment transaction for this card)
  const paid = monthTransactions.find(
    (tx) =>
      tx.type === 'bill' &&
      tx.creditCardPayment === true &&
      tx.creditCardId === ccBill.cardId &&
      // Check if transaction is in the same statement period
      isInStatementPeriod(tx.occurredAt, actualDueDate),
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

  // Create a minimal RecurringBill-like object for the reminder
  const virtualBill: RecurringBill = {
    id: ccBill.id,
    userId: '', // Not stored in Firestore
    name: `Credit Card Payment - ${ccBill.cardName}`,
    amount: ccBill.amount,
    category: ccBill.category,
    dueDay: ccBill.dueDay,
    startsOn: `${recommendedPaymentDate.getFullYear()}-${String(recommendedPaymentDate.getMonth() + 1).padStart(2, '0')}`,
    durationValue: 1,
    durationUnit: 'months',
    notes: `•••• ${ccBill.lastFour}`,
    active: true,
    createdAt: new Date().toISOString(),
  }

  return {
    bill: virtualBill,
    dueDate,
    status,
    daysUntilDue,
    paidTransactionId: paid?.id ?? null,
    paymentNumber: 1,
    totalPayments: 1,
    endsOn: `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`,
    recommendedPaymentDate,
    actualDueDate,
    // Mark this as a credit card payment bill for special handling
    isCreditCardPayment: true,
    creditCardId: ccBill.cardId,
    cardColor: ccBill.color,
  }
}

/**
 * Check if a transaction date falls within the statement period
 * for a credit card payment due in the given month.
 */
function isInStatementPeriod(
  occurredAt: string,
  dueDate: Date,
): boolean {
  const txDate = new Date(occurredAt)
  // Consider a window around the due date (e.g., 5 days before to 5 days after)
  const windowStart = new Date(dueDate)
  windowStart.setDate(windowStart.getDate() - 5)
  const windowEnd = new Date(dueDate)
  windowEnd.setDate(windowEnd.getDate() + 5)
  return txDate >= windowStart && txDate <= windowEnd
}

/**
 * Create a transaction input for paying a credit card bill.
 */
export function createCreditCardPaymentTransaction(
  ccBill: CreditCardPaymentBill,
  year: number,
  month: number,
  day?: number,
): {
  type: 'bill'
  amount: number
  category: string
  description: string
  occurredAt: string
  creditCardId: string
  creditCardPayment: true
} {
  const paymentDay = day ?? new Date().getDate()
  const occurred = new Date(year, month, paymentDay, 12, 0, 0, 0)

  return {
    type: 'bill',
    amount: ccBill.amount,
    category: ccBill.category,
    description: `Payment to ${ccBill.cardName} •••• ${ccBill.lastFour}`,
    occurredAt: occurred.toISOString(),
    creditCardId: ccBill.cardId,
    creditCardPayment: true,
  }
}
