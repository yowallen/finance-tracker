import { useState } from 'react'
import { CalendarDays, CreditCard as CreditCardIcon } from 'lucide-react'
import { formatMoney, formatDate, monthLabel } from '../lib/format'
import {
  computeAverageDailyBalance,
  computeRunningBalanceForDay,
} from '../services/balanceOutlook'
import type { BillReminder, RecurringBill, RecurringBillInput } from '../types/recurringBill'
import { creditLimitsAsOfDay, type CreditCardPaymentBill } from '../services/creditCardBills'
import type { CreditCard } from '../types/creditCard'
import type { CardInstallment } from '../types/cardInstallment'
import type { Transaction } from '../types/transaction'
import { isSavingsWithdraw } from '../types/transaction'

interface FinanceCalendarProps {
  year: number
  month: number
  reminders: BillReminder[]
  /** All transactions (not just the viewed month) for running balance. */
  allTransactions: Transaction[]
  /** Month-scoped transactions for day markers. */
  transactions: Transaction[]
  bills: RecurringBill[]
  ccPaymentBills: CreditCardPaymentBill[]
  cards: CreditCard[]
  /** Ledger charges plus installment postings. These reduce the credit limit. */
  cardActivity: Transaction[]
  installmentPlans: CardInstallment[]
  onUpdate: (id: string, input: RecurringBillInput) => Promise<void>
}

interface DayEvents {
  day: number
  bills: BillReminder[]
  transactions: Transaction[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isCreditLimitCharge(tx: Transaction): boolean {
  return Boolean(tx.creditCardId)
    && tx.creditCardPayment !== true
    && tx.cashbackCredit !== true
    && tx.installmentPurchase !== true
    && (tx.type === 'expense' || tx.type === 'bill')
}

function buildMonthCells(year: number, month: number): Array<number | null> {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<number | null> = []

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  return cells
}

function buildEventsByDay(
  reminders: BillReminder[],
  transactions: Transaction[],
  year: number,
  month: number,
): Map<number, DayEvents> {
  const map = new Map<number, DayEvents>()

  function ensure(day: number): DayEvents {
    let entry = map.get(day)
    if (!entry) {
      entry = { day, bills: [], transactions: [] }
      map.set(day, entry)
    }
    return entry
  }

  for (const reminder of reminders) {
    if (reminder.dueDate.getFullYear() !== year || reminder.dueDate.getMonth() !== month) continue
    ensure(reminder.dueDate.getDate()).bills.push(reminder)
  }
  for (const tx of transactions) {
    const d = new Date(tx.occurredAt)
    if (d.getFullYear() === year && d.getMonth() === month) {
      ensure(d.getDate()).transactions.push(tx)
    }
  }

  for (const entry of map.values()) {
    const paidBillIds = new Set(
      entry.bills
        .filter((bill) => bill.status === 'paid')
        .map((bill) => bill.bill.id),
    )
    if (paidBillIds.size > 0) {
      entry.transactions = entry.transactions.filter(
        (tx) =>
          !(
            tx.type === 'bill' &&
            typeof tx.recurringBillId === 'string' &&
            paidBillIds.has(tx.recurringBillId)
          ),
      )
    }
  }

  return map
}

export function FinanceCalendar({
  year,
  month,
  reminders,
  allTransactions,
  transactions,
  bills,
  ccPaymentBills,
  cards,
  cardActivity,
  installmentPlans,
  onUpdate,
}: FinanceCalendarProps) {
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month
  const [selectedDay, setSelectedDay] = useState<number | null>(
    isCurrentMonth ? today.getDate() : 1,
  )

  const cells = buildMonthCells(year, month)
  const seenTransactionIds = new Set(transactions.map((tx) => tx.id))
  const postedCardCharges = cardActivity.filter(
    (tx) => isCreditLimitCharge(tx) && !seenTransactionIds.has(tx.id),
  )
  const eventsByDay = buildEventsByDay(
    reminders,
    [...transactions, ...postedCardCharges],
    year,
    month,
  )

  // Clamp selection when the month has fewer days (no effect needed).
  const daysInView = new Date(year, month + 1, 0).getDate()
  const activeDay =
    selectedDay != null && selectedDay >= 1 && selectedDay <= daysInView
      ? selectedDay
      : isCurrentMonth
        ? today.getDate()
        : 1

  const selected = eventsByDay.get(activeDay)

  const selectedDateLabel = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month, activeDay))

  const selectedDayEvents = eventsByDay.get(activeDay)
  const paidReminderBillIds = new Set(
    selectedDayEvents?.bills
      .filter((bill) => bill.status === 'paid')
      .map((bill) => bill.bill.id),
  )
  const visibleTransactions = selectedDayEvents?.transactions.filter(
    (tx) =>
      !(
        tx.type === 'bill' &&
        typeof tx.recurringBillId === 'string' &&
        paidReminderBillIds.has(tx.recurringBillId)
      ),
  )

  const dayRunningBalance = computeRunningBalanceForDay(
    bills,
    allTransactions,
    year,
    month,
    activeDay,
    ccPaymentBills,
  )
  const balancePositive = dayRunningBalance >= 0

  const averageDaily = computeAverageDailyBalance(
    bills,
    allTransactions,
    year,
    month,
    isCurrentMonth ? today.getDate() : undefined,
    ccPaymentBills,
  )
  const adbPositive = averageDaily.averageDailyBalance >= 0
  const creditAsOfDay = cards.length === 0
    ? { limits: [], cardBills: 0 }
    : creditLimitsAsOfDay(cards, cardActivity, installmentPlans, year, month, activeDay, reminders)
  const availableCredit = Math.max(
    0,
    creditAsOfDay.limits.reduce((sum, limit) => sum + limit.available, 0) - creditAsOfDay.cardBills,
  )

  /** Toggle whether a bill for the current viewed month should be paid with a credit card. */
  async function handleToggleCreditCardPayment(reminder: BillReminder) {
    const bill = reminder.bill
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    const currentMonths = bill.creditCardMonths ?? []
    const isEnabled = currentMonths.includes(monthKey)
    const updatedMonths = isEnabled
      ? currentMonths.filter((m) => m !== monthKey)
      : [...currentMonths, monthKey]

    await onUpdate(bill.id, {
      ...formFromBill(bill),
      creditCardMonths: updatedMonths,
    })
  }

  function formFromBill(bill: RecurringBill): RecurringBillInput {
    return {
      name: bill.name,
      amount: bill.amount,
      category: bill.category,
      dueDay: bill.dueDay,
      startsOn: bill.startsOn,
      durationValue: bill.durationValue,
      durationUnit: bill.durationUnit,
      notes: bill.notes,
      active: bill.active,
      creditCardMonths: bill.creditCardMonths,
    }
  }

  return (
    <section id="calendar" className="finance-calendar" aria-labelledby="calendar-heading">
      <div className="calendar-header">
        <div className="month-nav">
          <h2 id="calendar-heading" tabIndex={-1} className="section-title">
            <CalendarDays className="section-icon" aria-hidden="true" />
            Calendar
          </h2>
        </div>
        <p className="calendar-legend">
          <span className="legend-dot bill" />Bill due
          <span className="legend-dot income" />Income
          <span className="legend-dot expense" />Expense
          {cards.length > 0 && (
            <>
              <span className="legend-dot card" />Credit limit
            </>
          )}
        </p>
      </div>

      {/* Average Daily Balance moved below the calendar layout to reduce visual clutter */}

      <div className="calendar-layout">
        {/* Plain group + buttons: a real ARIA grid would require row
            structure we don't have, and broken grid semantics are worse
            than none for screen readers. */}
        <div className="calendar-grid" role="group" aria-label={`Calendar for ${monthLabel(year, month)}`}>
          {WEEKDAYS.map((label) => (
            <div key={label} className="calendar-weekday" aria-hidden="true">
              {label}
            </div>
          ))}
          {cells.map((day, index) => {
            if (day == null) {
              return <div key={`empty-${index}`} className="calendar-cell empty" />
            }

            const events = eventsByDay.get(day)
            const paidBillIds = new Set(
              events?.bills
                .filter((bill) => bill.status === 'paid')
                .map((bill) => bill.bill.id),
            )
            const visibleEvents = events?.transactions.filter(
              (tx) =>
                !(
                  tx.type === 'bill' &&
                  typeof tx.recurringBillId === 'string' &&
                  paidBillIds.has(tx.recurringBillId)
                ),
            )
            const billCount = events?.bills.length ?? 0
            const txCount = visibleEvents?.length ?? 0
            const cardCount = visibleEvents?.filter((tx) =>
              isCreditLimitCharge(tx)
              || tx.installmentPurchase === true
              || tx.cashbackCredit === true
              || (Boolean(tx.creditCardId) && tx.type === 'income'),
            ).length ?? 0
            const billTransactionCount = visibleEvents?.filter(
              (tx) => tx.type === 'bill' && !isCreditLimitCharge(tx),
            ).length ?? 0
            const incomeCount = visibleEvents?.filter(
              (tx) => (tx.type === 'income' || isSavingsWithdraw(tx)) && tx.cashbackCredit !== true && !tx.creditCardId,
            ).length ?? 0
            const expenseCount = visibleEvents?.filter(
              (tx) => tx.type !== 'income' && tx.type !== 'bill' && !isSavingsWithdraw(tx) && !isCreditLimitCharge(tx) && tx.installmentPurchase !== true,
            ).length ?? 0
            const isToday = isCurrentMonth && day === today.getDate()
            const isSelected = day === activeDay
            const hasOverdue = events?.bills.some((b) => b.status === 'overdue') ?? false

            return (
              <button
                key={day}
                type="button"
                className={[
                  'calendar-cell',
                  isToday ? 'today' : '',
                  isSelected ? 'selected' : '',
                  billCount + txCount > 0 ? 'has-events' : '',
                  hasOverdue ? 'has-overdue' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelectedDay(day)}
                aria-pressed={isSelected}
                aria-label={`${day}, ${billCount} bills, ${cardCount} credit limit charges, ${txCount} transactions`}
              >
                <span className="calendar-day-num">{day}</span>
                <span className="calendar-dots" aria-hidden="true">
                  {billCount + billTransactionCount > 0 && (
                    <span className="legend-dot bill">
                      {billCount + billTransactionCount > 1 ? billCount + billTransactionCount : null}
                    </span>
                  )}
                  {cardCount > 0 && (
                    <span className="legend-dot card">
                      {cardCount > 1 ? cardCount : null}
                    </span>
                  )}
                  {incomeCount > 0 && (
                    <span className="legend-dot income">
                      {incomeCount > 1 ? incomeCount : null}
                    </span>
                  )}
                  {expenseCount > 0 && (
                    <span className="legend-dot expense">
                      {expenseCount > 1 ? expenseCount : null}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <aside className="calendar-detail">
          <h3>{selectedDateLabel}</h3>
          <div className={`calendar-day-balance ${balancePositive ? 'positive' : 'negative'}`}>
            <span className="stat-label">Daily balance</span>
            <strong className="stat-value">{formatMoney(dayRunningBalance)}</strong>
            <span className="stat-meta">As of this day · includes unpaid bills due by now</span>
          </div>
          {creditAsOfDay.limits.length > 0 && (
            <div className="calendar-day-balance">
              <span className="stat-label">Available credit</span>
              <strong className="stat-value">{formatMoney(availableCredit)}</strong>
              <span className="stat-meta">
                {creditAsOfDay.limits.length === 1
                  ? `of ${formatMoney(creditAsOfDay.limits[0].limit)} · after card charges and card bills due by now`
                  : 'After card charges and card bills due by now'}
              </span>
              {(creditAsOfDay.limits.length > 1 || creditAsOfDay.cardBills > 0) && (
                <ul className="calendar-credit-limits">
                  {creditAsOfDay.limits.map((limit) => (
                    <li key={limit.id}>
                      <span>{limit.name} ···· {limit.lastFour}</span>
                      <strong>{formatMoney(limit.available)} of {formatMoney(limit.limit)}</strong>
                    </li>
                  ))}
                  {creditAsOfDay.cardBills > 0 && (
                    <li>
                      <span>Bills on a card</span>
                      <strong>−{formatMoney(creditAsOfDay.cardBills)}</strong>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
          {!selected || (selected.bills.length === 0 && visibleTransactions?.length === 0) ? (
            <p className="muted">No bills or transactions on this day.</p>
          ) : (
            <ul className="calendar-detail-list">
              {selected.bills.map((bill) => {
                const onCard = bill.payWithCreditCard === true && !bill.isCreditCardPayment && !bill.isInstallmentPart
                return (
                  <li key={`bill-${bill.bill.id}`} className={`calendar-detail-item bill${onCard ? ' card' : ''} status-${bill.status}`}>
                    <div className="calendar-detail-main">
                      <span className={`reminder-status status-${bill.status}`}>{statusShort(bill)}</span>
                      <p className="tx-desc">{bill.bill.name}</p>
                      <p className="reminder-due">{billDetailNote(bill)}</p>
                    </div>
                    <div className="calendar-detail-actions">
                      <strong className={`tx-amount ${onCard ? 'card' : 'bill'}`}>
                        {bill.status === 'paid' || onCard ? '−' : ''}
                        {formatMoney(bill.bill.amount)}
                      </strong>
                      {bill.status !== 'paid' && !bill.isCreditCardPayment && !bill.isInstallmentPart && (
                        <button
                          type="button"
                          className={`icon-btn icon-btn--cc ${bill.payWithCreditCard ? 'active' : ''}`}
                          onClick={() => void handleToggleCreditCardPayment(bill)}
                          disabled={bill.bill.category === 'Loan'}
                          aria-label={bill.bill.category === 'Loan'
                            ? 'Loans cannot be paid with credit card'
                            : bill.payWithCreditCard
                              ? 'Remove credit card payment flag'
                              : 'Mark as paid with credit card. Deducts from the credit limit'}
                          aria-pressed={bill.bill.category === 'Loan' ? false : bill.payWithCreditCard}
                          title={bill.bill.category === 'Loan'
                            ? 'Loans cannot be paid with a credit card.'
                            : bill.payWithCreditCard
                              ? 'This bill is deducted from the credit limit. Click to remove it.'
                              : 'Put this bill on a credit card. It deducts from the credit limit.'}
                        >
                          <CreditCardIcon aria-hidden="true" />
                        </button>
                      )}
                      {bill.status !== 'paid' && bill.isCreditCardPayment && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--cc"
                          disabled
                          aria-label="Credit card payments can only be paid with cash or debit"
                          title="Credit card payments can only be paid with cash or debit"
                        >
                          <CreditCardIcon aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
              {visibleTransactions?.map((tx) => {
                const onLimit = isCreditLimitCharge(tx)
                const limitCredit = tx.cashbackCredit === true || (Boolean(tx.creditCardId) && tx.type === 'income')
                const installmentPurchase = tx.installmentPurchase === true
                const isInflow = !limitCredit && (tx.type === 'income' || isSavingsWithdraw(tx))
                const amountClass = onLimit || installmentPurchase
                  ? 'card'
                  : limitCredit
                    ? 'income'
                    : isInflow
                      ? 'income'
                      : tx.type === 'bill'
                        ? 'bill'
                        : tx.type
                const itemClass = onLimit || installmentPurchase || limitCredit ? 'card' : tx.type
                return (
                <li key={`tx-${tx.id}`} className={`calendar-detail-item ${itemClass}`}>
                  <div className="calendar-detail-main">
                    <span className={`tx-type-badge ${itemClass}`}>
                      {onLimit || installmentPurchase || limitCredit ? 'Credit limit' : tx.type}
                    </span>
                    <p className="tx-desc">{tx.description.trim() || tx.category}</p>
                    <p className="reminder-due">
                      {onLimit
                        ? 'Deducted from the credit limit'
                        : installmentPurchase
                          ? 'Uses the credit limit in monthly deductions'
                          : limitCredit
                            ? 'Added to the credit limit'
                            : formatDate(tx.occurredAt)}
                    </p>
                  </div>
                  <div className="calendar-detail-actions">
                    <strong className={`tx-amount ${amountClass}`}>
                      {limitCredit || isInflow ? '+' : '−'}
                      {formatMoney(tx.amount)}
                    </strong>
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </aside>
      </div>

      <div
        className={`calendar-adb ${adbPositive ? 'positive' : 'negative'}`}
        aria-label="Average daily balance for this month"
      >
        <div className="calendar-adb-main">
          <span className="stat-label">Average Daily Balance</span>
          <strong className="stat-value">{formatMoney(averageDaily.averageDailyBalance)}</strong>
        </div>
        <p className="stat-meta">
          {isCurrentMonth
            ? `Month-to-date · average of end-of-day balances for days 1–${averageDaily.daysAveraged}`
            : `Full month · average of end-of-day balances across ${averageDaily.daysAveraged} days`}
          {' · '}
          includes unpaid bills due in the averaged period
        </p>
      </div>
    </section>
  )
}

function billDetailNote(reminder: BillReminder): string {
  if (reminder.isInstallmentPart) {
    const included = reminder.bill.notes || 'Included in the card payment'
    return `${included} · Installment ${reminder.paymentNumber} of ${reminder.totalPayments}`
  }
  if (reminder.isCreditCardPayment) {
    if (reminder.status === 'paid' && reminder.minimumSettled) {
      return 'Minimum paid · the rest stays on the card'
    }
    if (reminder.status === 'paid') {
      return `Paid · Payment ${reminder.paymentNumber}/${reminder.totalPayments}`
    }
    return 'Stays on the card until you pay · not taken from this balance'
  }
  if (reminder.payWithCreditCard && reminder.status !== 'paid') {
    return 'Deducted from the credit limit'
  }
  if (reminder.status === 'paid') {
    return `Paid · Payment ${reminder.paymentNumber}/${reminder.totalPayments}`
  }
  return `Bill due · Payment ${reminder.paymentNumber}/${reminder.totalPayments}`
}

function statusShort(reminder: BillReminder): string {
  if (reminder.status === 'paid') return reminder.minimumSettled ? 'Minimum paid' : 'Paid'
  if (reminder.status === 'overdue') return 'Overdue'
  if (reminder.status === 'due-soon') return 'Due soon'
  if (reminder.status === 'unpaid') return 'Unpaid'
  return 'Upcoming'
}
