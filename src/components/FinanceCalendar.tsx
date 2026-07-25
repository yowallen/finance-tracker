import { useMemo, useState } from 'react'
import { formatMoney, formatDate, monthLabel } from '../lib/format'
import type { BillReminder } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'

interface FinanceCalendarProps {
  year: number
  month: number
  reminders: BillReminder[]
  transactions: Transaction[]
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

export function FinanceCalendar({
  year,
  month,
  reminders,
  transactions,
  onPrev,
  onNext,
}: FinanceCalendarProps) {
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month
  const [selectedDay, setSelectedDay] = useState<number | null>(
    isCurrentMonth ? today.getDate() : 1,
  )

  const cells = useMemo(() => buildMonthCells(year, month), [year, month])

  const eventsByDay = useMemo(() => {
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

    return map
  }, [reminders, transactions, year, month])

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

  return (
    <section className="finance-calendar" aria-labelledby="calendar-heading">
      <div className="calendar-header">
        <div className="month-nav">
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous month">
            ‹
          </button>
          <h2 id="calendar-heading">{monthLabel(year, month)}</h2>
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month">
            ›
          </button>
        </div>
        <p className="calendar-legend">
          <span className="legend-dot bill" /> Bill due
          <span className="legend-dot income" /> Income
          <span className="legend-dot expense" /> Expense / paid
        </p>
      </div>

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
            const billCount = events?.bills.length ?? 0
            const txCount = events?.transactions.length ?? 0
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
                  {(events?.transactions.some((t) => t.type === 'income') ?? false) && (
                    <span className="legend-dot income" />
                  )}
                  {(events?.transactions.some((t) => t.type !== 'income') ?? false) && (
                    <span className="legend-dot expense" />
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <aside className="calendar-detail">
          <h3>{selectedDateLabel}</h3>
          {!selected || (selected.bills.length === 0 && selected.transactions.length === 0) ? (
            <p className="muted">No bills or transactions on this day.</p>
          ) : (
            <ul className="calendar-detail-list">
              {selected.bills.map((bill) => (
                <li key={`bill-${bill.bill.id}`} className={`calendar-detail-item bill status-${bill.status}`}>
                  <div>
                    <span className={`reminder-status status-${bill.status}`}>{statusShort(bill)}</span>
                    <p className="tx-desc">{bill.bill.name}</p>
                    <p className="reminder-due">
                      Bill due · Payment {bill.paymentNumber}/{bill.totalPayments}
                    </p>
                  </div>
                  <strong className="tx-amount bill">{formatMoney(bill.bill.amount)}</strong>
                </li>
              ))}
              {selected.transactions.map((tx) => (
                <li key={`tx-${tx.id}`} className={`calendar-detail-item ${tx.type}`}>
                  <div>
                    <span className={`tx-type-badge ${tx.type}`}>{tx.type}</span>
                    <p className="tx-desc">{tx.description.trim() || tx.category}</p>
                    <time className="tx-when" dateTime={tx.occurredAt}>
                      {formatDate(tx.occurredAt)}
                    </time>
                  </div>
                  <strong className={`tx-amount ${tx.type}`}>
                    {tx.type === 'income' ? '+' : '−'}
                    {formatMoney(tx.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </aside>
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
