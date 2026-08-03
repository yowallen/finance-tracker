import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMoney, formatDate, monthLabel } from '../lib/format'
import {
  computeAverageDailyBalance,
  computeRunningBalanceForDay,
} from '../services/balanceOutlook'
import type { BillReminder, RecurringBill } from '../types/recurringBill'
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
  onPrev: () => void
  onNext: () => void
}

interface DayEvents {
  day: number
  bills: BillReminder[]
  transactions: Transaction[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  onPrev,
  onNext,
}: FinanceCalendarProps) {
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month
  const [selectedDay, setSelectedDay] = useState<number | null>(
    isCurrentMonth ? today.getDate() : 1,
  )

  const cells = buildMonthCells(year, month)
  const eventsByDay = buildEventsByDay(reminders, transactions, year, month)

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
  )
  const balancePositive = dayRunningBalance >= 0

  const averageDaily = computeAverageDailyBalance(
    bills,
    allTransactions,
    year,
    month,
    isCurrentMonth ? today.getDate() : undefined,
  )
  const adbPositive = averageDaily.averageDailyBalance >= 0

  return (
    <section className="finance-calendar" aria-labelledby="calendar-heading">
      <div className="calendar-header">
        <div className="month-nav">
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous month">
            <ChevronLeft aria-hidden="true" />
          </button>
          <h2 id="calendar-heading" className="section-title">
            <CalendarDays className="section-icon" aria-hidden="true" />
            {monthLabel(year, month)}
          </h2>
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <p className="calendar-legend">
          <span className="legend-dot bill" />Bill due
          <span className="legend-dot income" />Income
          <span className="legend-dot expense" />Expense
        </p>
      </div>

      {/* Average Daily Balance moved below the calendar layout to reduce visual clutter */}

      <div className="calendar-layout">
        <div className="calendar-grid" role="grid" aria-label={`Calendar for ${monthLabel(year, month)}`}>
          {WEEKDAYS.map((label) => (
            <div key={label} className="calendar-weekday" role="columnheader">
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
            const isToday = isCurrentMonth && day === today.getDate()
            const isSelected = day === activeDay
            const hasOverdue = events?.bills.some((b) => b.status === 'overdue') ?? false

            return (
              <button
                key={day}
                type="button"
                role="gridcell"
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
                aria-label={`${day}, ${billCount} bills, ${txCount} transactions`}
              >
                <span className="calendar-day-num">{day}</span>
                <span className="calendar-dots" aria-hidden="true">
                  {billCount > 0 && <span className="legend-dot bill" />}
                  {(visibleEvents?.some((t) => t.type === 'income' || isSavingsWithdraw(t)) ?? false) && (
                    <span className="legend-dot income" />
                  )}
                  {(visibleEvents?.some(
                    (t) => t.type !== 'income' && t.type !== 'bill' && !isSavingsWithdraw(t),
                  ) ?? false) && (
                    <span className="legend-dot expense" />
                  )}
                  {(visibleEvents?.some((t) => t.type === 'bill') ?? false) && (
                    <span className="legend-dot bill" />
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
          {!selected || (selected.bills.length === 0 && visibleTransactions?.length === 0) ? (
            <p className="muted">No bills or transactions on this day.</p>
          ) : (
            <ul className="calendar-detail-list">
              {selected.bills.map((bill) => (
                <li key={`bill-${bill.bill.id}`} className={`calendar-detail-item bill status-${bill.status}`}>
                  <div>
                    <span className={`reminder-status status-${bill.status}`}>{statusShort(bill)}</span>
                    <p className="tx-desc">{bill.bill.name}</p>
                    <p className="reminder-due">
                      {bill.status === 'paid'
                        ? `Paid · Payment ${bill.paymentNumber}/${bill.totalPayments}`
                        : `Bill due · Payment ${bill.paymentNumber}/${bill.totalPayments}`}
                    </p>
                  </div>
                  <strong className={`tx-amount ${bill.status === 'paid' ? 'bill' : 'bill'}`}>
                    {bill.status === 'paid' ? '−' : ''}
                    {formatMoney(bill.bill.amount)}
                  </strong>
                </li>
              ))}
              {visibleTransactions?.map((tx) => {
                const isInflow = tx.type === 'income' || isSavingsWithdraw(tx)
                const amountClass = isInflow ? 'income' : tx.type === 'bill' ? 'bill' : tx.type
                return (
                <li key={`tx-${tx.id}`} className={`calendar-detail-item ${tx.type}`}>
                  <div>
                    <span className={`tx-type-badge ${tx.type}`}>{tx.type}</span>
                    <p className="tx-desc">{tx.description.trim() || tx.category}</p>
                    <time className="tx-when" dateTime={tx.occurredAt}>
                      {formatDate(tx.occurredAt)}
                    </time>
                  </div>
                  <strong className={`tx-amount ${amountClass}`}>
                    {isInflow ? '+' : tx.type === 'bill' ? '−' : '−'}
                    {formatMoney(tx.amount)}
                  </strong>
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

function statusShort(reminder: BillReminder): string {
  if (reminder.status === 'paid') return 'Paid'
  if (reminder.status === 'overdue') return 'Overdue'
  if (reminder.status === 'due-soon') return 'Due soon'
  if (reminder.status === 'unpaid') return 'Unpaid'
  return 'Upcoming'
}
