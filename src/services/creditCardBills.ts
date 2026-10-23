import type { CreditCard } from '../types/creditCard'
import type { CreditCardStatement } from '../types/creditCard'
import type { CardInstallment } from '../types/cardInstallment'
import { installmentLabel } from '../types/cardInstallment'
import type { RecurringBill, BillReminder, BillReminderStatus } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'
import { computeInstallmentSchedule, summarizeCardInstallments } from './cardInstallments'
import { computePoolStatement, computeStatementPeriod, groupCreditCards } from './creditCards'
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
  /** Minimum that settles this cycle. The rest carries to the next statement. */
  minimumPayment?: number
  /** Actual due date for this statement */
  dueDate: Date
  /** Recommended payment date before the actual bank deadline */
  scheduledDueDate: Date
  /** Recommended payment day of month */
  dueDay: number
  /** Category for the payment transaction */
  category: string
  /** Card color for UI */
  color?: string
  /** Statement this payment covers. */
  statementDate: Date
  /**
   * True when this statement is shown only so its new installments can be reminded.
   * The full card payment is still due in a later month.
   */
  installmentsOnly?: boolean
  /** Credit-to-Cash and installment-purchase amortizations included in `amount`. */
  installments?: ReminderInstallmentLine[]
}

export interface ReminderInstallmentLine {
  label: string
  amount: number
  number?: number
  term?: number
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
    const recommendedPaymentDate = previousPhilippineBankingDay(dueDate, 3)
    const installments = statement.transactions
      .filter((tx) => typeof tx.installmentNumber === 'number')
      .map((tx) => ({
        label: tx.description,
        amount: tx.amount,
        ...(typeof tx.installmentNumber === 'number' ? { number: tx.installmentNumber } : {}),
        ...(typeof tx.installmentTerm === 'number' ? { term: tx.installmentTerm } : {}),
      }))

    bills.push({
      id: `cc-payment:${card.id}:${statement.statementDate.toISOString().slice(0, 10)}`,
      cardId: card.id,
      cardName: card.name,
      lastFour: card.lastFour,
      amount: statement.statementBalance,
      minimumPayment: statement.minimumPayment,
      dueDate,
      scheduledDueDate: recommendedPaymentDate,
      dueDay: recommendedPaymentDate.getDate(),
      category: 'Credit card payment',
      color: card.color,
      statementDate: statement.statementDate,
      ...(installments.length > 0 ? { installments } : {}),
    })
  }

  return bills
}

function sameMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month
}

/** "iPhone 15 installment 1/24" and "iPhone 15 installment 2/24" are the same plan. */
function installmentPlanKey(line: ReminderInstallmentLine): string {
  const name = line.label.replace(/ installment \d+\/\d+$/, '')
  return `${name}|${line.term ?? ''}`
}

/**
 * Bills whose payment falls in the viewed month, plus the next statement that
 * has an installment plan not already listed on this month's payment.
 */
export function reminderBillsForMonth(
  bills: CreditCardPaymentBill[],
  year: number,
  month: number,
): CreditCardPaymentBill[] {
  const dueThisMonth = bills.filter((bill) => sameMonth(bill.scheduledDueDate, year, month))
  const shownPlans = new Set(
    dueThisMonth.flatMap((bill) =>
      (bill.installments ?? []).map((line) => `${bill.cardId}:${installmentPlanKey(line)}`),
    ),
  )
  const viewStart = new Date(year, month, 1).getTime()
  const horizon = new Date(year, month + 2, 1).getTime()
  const upcoming = bills
    .filter((bill) => !sameMonth(bill.scheduledDueDate, year, month))
    .map((bill) => {
      const fresh = (bill.installments ?? []).filter(
        (line) => !shownPlans.has(`${bill.cardId}:${installmentPlanKey(line)}`),
      )
      return { bill, fresh }
    })
    .filter(({ bill, fresh }) =>
      fresh.length > 0
      && bill.statementDate.getTime() >= viewStart
      && bill.statementDate.getTime() < horizon,
    )
    .sort((a, b) => a.bill.statementDate.getTime() - b.bill.statementDate.getTime())

  const earliestByCard = new Map<string, CreditCardPaymentBill>()
  for (const { bill, fresh } of upcoming) {
    if (earliestByCard.has(bill.cardId)) continue
    earliestByCard.set(bill.cardId, {
      ...bill,
      installments: fresh,
      installmentsOnly: true,
    })
  }

  return [...dueThisMonth, ...earliestByCard.values()]
}

/**
 * Payments that settle an issued statement: after it closes, and before the next one opens.
 * A payment inside the closing period is already baked into the statement balance.
 */
function paymentsAfterStatement(
  bill: Pick<CreditCardPaymentBill, 'cardId' | 'statementDate'>,
  transactions: Transaction[],
): Transaction[] {
  const statement = startOfLocalDay(bill.statementDate)
  const start = new Date(statement)
  start.setDate(start.getDate() + 1)
  const nextStatement = new Date(statement)
  nextStatement.setMonth(nextStatement.getMonth() + 1)
  const end = new Date(nextStatement)
  end.setDate(end.getDate() - 1)
  end.setHours(23, 59, 59, 999)
  const startMs = start.getTime()
  const endMs = end.getTime()

  return transactions.filter((tx) => {
    if (tx.creditCardPayment !== true || tx.creditCardId !== bill.cardId) return false
    const occurred = new Date(tx.occurredAt).getTime()
    return Number.isFinite(occurred) && occurred >= startMs && occurred <= endMs
  })
}

export interface CalendarCreditLimit {
  id: string
  name: string
  lastFour: string
  limit: number
  available: number
}

/**
 * Available credit on each card as of a calendar day.
 * Posted card charges reduce the limit. A bill flagged to be paid with a card
 * reduces it too, until that charge is recorded on a card.
 * `cardBills` is the part that is not tied to one card when several limits exist.
 */
export function creditLimitsAsOfDay(
  cards: CreditCard[],
  cardTransactions: Transaction[],
  plans: CardInstallment[],
  year: number,
  month: number,
  day: number,
  reminders: BillReminder[] = [],
): { limits: CalendarCreditLimit[]; cardBills: number } {
  const asOf = new Date(year, month, day, 23, 59, 59, 999)
  const asOfMs = asOf.getTime()
  const through = cardTransactions.filter((tx) => {
    const time = new Date(tx.occurredAt).getTime()
    return Number.isFinite(time) && time <= asOfMs
  })
  const summaries = summarizeCardInstallments(
    cards.map((card) => card.id),
    plans,
    cards,
    asOf,
  )
  const limits = groupCreditCards(cards)
    .filter((pool) => pool.primary.active)
    .map((pool) => {
      const statement = computePoolStatement(pool, through, year, month, summaries)
      return {
        id: pool.id,
        name: pool.cards.map((card) => card.name).join(' · '),
        lastFour: pool.cards.map((card) => card.lastFour).join(' · '),
        limit: pool.primary.limit,
        available: statement.availableCredit,
      }
    })

  const cardBills = reminders.reduce((sum, reminder) => {
    if (!reminder.payWithCreditCard || reminder.isCreditCardPayment || reminder.isInstallmentPart) return sum
    if (reminder.status === 'paid') return sum
    const due = reminder.dueDate
    if (due.getFullYear() !== year || due.getMonth() !== month || due.getDate() > day) return sum
    const monthStart = new Date(year, month, 1).getTime()
    const alreadyCharged = through.some((tx) => {
      if (tx.recurringBillId !== reminder.bill.id || typeof tx.creditCardId !== 'string') return false
      const time = new Date(tx.occurredAt).getTime()
      return time >= monthStart && time <= asOfMs
    })
    if (alreadyCharged) return sum
    return sum + reminder.bill.amount
  }, 0)
  const roundedBills = Math.round(cardBills * 100) / 100

  if (limits.length === 1 && roundedBills > 0) {
    limits[0] = {
      ...limits[0],
      available: Math.max(0, Math.round((limits[0].available - roundedBills) * 100) / 100),
    }
    return { limits, cardBills: 0 }
  }

  return { limits, cardBills: roundedBills }
}

/**
 * Cash to hold back for this statement.
 * Nothing paid yet: the statement balance, since it may still be paid in full.
 * Minimum met: nothing. The unpaid balance stays on the card for the next statement.
 * Short of the minimum: only the rest of the minimum, not the whole balance.
 */
export function creditCardCashStillDue(
  bill: Pick<CreditCardPaymentBill, 'cardId' | 'amount' | 'statementDate' | 'minimumPayment'>,
  transactions: Transaction[],
): number {
  const paid = paymentsAfterStatement(bill, transactions).reduce((sum, tx) => sum + tx.amount, 0)
  if (paid <= 0.001) return Math.max(0, bill.amount)
  const minimum = typeof bill.minimumPayment === 'number'
    ? Math.min(Math.max(0, bill.minimumPayment), bill.amount)
    : bill.amount
  if (minimum <= 0.001 || paid + 0.001 >= minimum) return 0
  return Math.round((minimum - paid) * 100) / 100
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
  const recommendedPaymentDate = new Date(ccBill.scheduledDueDate)
  const dueDate = recommendedPaymentDate
  const dueStart = startOfLocalDay(dueDate)
  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntilDue = Math.round((dueStart.getTime() - todayStart.getTime()) / msPerDay)

  const appliedPayments = paymentsAfterStatement(ccBill, monthTransactions)
  const paidTotal = appliedPayments.reduce((sum, tx) => sum + tx.amount, 0)
  const cashStillDue = creditCardCashStillDue(ccBill, monthTransactions)
  const minimumSettled = cashStillDue <= 0.001 && paidTotal > 0.001 && paidTotal + 0.001 < ccBill.amount
  const paid = appliedPayments[0]

  let status: BillReminderStatus
  if (paid && cashStillDue <= 0.001) {
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
    cashStillDue,
    ...(minimumSettled ? { minimumSettled: true } : {}),
    ...(ccBill.installments ? { installments: ccBill.installments } : {}),
  }
}

/** One reminder row per amortization. The amount stays inside the card payment, so these rows are not a second bill. */
export function expandInstallmentReminders(reminder: BillReminder): BillReminder[] {
  const lines = reminder.installments ?? []
  if (lines.length === 0) return []
  const cardName = reminder.bill.name.replace(/^Credit Card Payment - /, '')

  return lines.map((line, index) => ({
    ...reminder,
    bill: {
      ...reminder.bill,
      id: `${reminder.bill.id}:installment:${index}`,
      name: line.label,
      amount: line.amount,
      category: 'Installment',
      notes: `Included in the ${cardName} payment`,
    },
    paymentNumber: line.number ?? index + 1,
    totalPayments: line.term ?? Math.max(lines.length, 1),
    isCreditCardPayment: false,
    isInstallmentPart: true,
    installments: undefined,
  }))
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month
}

function planReminderKey(cardId: string, label: string, term?: number): string {
  return `${cardId}:${installmentPlanKey({ label, amount: 0, term })}`
}

/** Installment rows for plans whose next bill is this month, next month, or was booked this month. */
export function upcomingInstallmentReminders(
  plans: CardInstallment[],
  cards: CreditCard[],
  year: number,
  month: number,
  monthTransactions: Transaction[],
  coveredKeys: Set<string>,
): BillReminder[] {
  const viewed = monthIndex(year, month)
  const reminders: BillReminder[] = []

  for (const plan of plans) {
    const pool = groupCreditCards(cards).find((item) => item.cards.some((card) => card.id === plan.cardId))
    const billingCard = pool?.primary ?? cards.find((card) => card.id === plan.cardId)
    if (!billingCard?.active) continue

    const schedule = computeInstallmentSchedule(plan, billingCard)
    const [bookedYear, bookedMonth] = plan.bookedOn.split('-').map(Number)
    const booked = monthIndex(bookedYear, (bookedMonth ?? 1) - 1)
    const row = schedule.find((item) => {
      const billed = monthIndex(item.billingDate.getFullYear(), item.billingDate.getMonth())
      return billed === viewed || billed === viewed + 1 || (booked === viewed && item.number === 1)
    })
    if (!row) continue

    const label = `${installmentLabel(plan)} installment ${row.number}/${plan.termMonths}`
    if (coveredKeys.has(planReminderKey(billingCard.id, label, plan.termMonths))) continue

    const fee = row.number === 1 ? Math.max(0, plan.processingFee ?? 0) : 0
    const period = computeStatementPeriod(billingCard, row.billingDate.getFullYear(), row.billingDate.getMonth())
    const payBy = previousPhilippineBankingDay(period.dueDate, 3)
    const parent = creditCardBillToReminder(
      {
        id: `installment-plan:${plan.id}:${row.number}`,
        cardId: billingCard.id,
        cardName: billingCard.name,
        lastFour: billingCard.lastFour,
        amount: Math.round((row.amount + fee) * 100) / 100,
        dueDate: period.dueDate,
        scheduledDueDate: payBy,
        dueDay: payBy.getDate(),
        category: 'Credit card payment',
        color: billingCard.color,
        statementDate: row.billingDate,
        installmentsOnly: true,
        installments: [{
          label,
          amount: Math.round((row.amount + fee) * 100) / 100,
          number: row.number,
          term: plan.termMonths,
        }],
      },
      year,
      month,
      monthTransactions,
    )
    reminders.push(...expandInstallmentReminders(parent))
  }

  return reminders
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
