import { useState } from 'react'
import { formatMoney, monthLabel } from '../lib/format'
import type { MonthBalanceOutlook } from '../services/balanceOutlook'

const STORAGE_KEY = 'ledger.showBalanceOutlook'

interface BalanceOutlookProps {
  rows: MonthBalanceOutlook[]
  selectedYear: number
  selectedMonth: number
  onSelectMonth: (year: number, month: number) => void
}

function readStoredVisibility(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function BalanceOutlook({
  rows,
  selectedYear,
  selectedMonth,
  onSelectMonth,
}: BalanceOutlookProps) {
  const [visible, setVisible] = useState(readStoredVisibility)

  function toggleVisible() {
    setVisible((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Ignore storage failures (private mode, etc.)
      }
      return next
    })
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <section className="balance-outlook" aria-labelledby="outlook-heading">
      <div className="outlook-header">
        <div>
          <h2 id="outlook-heading">Month-by-month balance</h2>
          {visible && (
            <p className="outlook-sub">
              Running balance carries each month forward (prior months + this month’s net)
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-ghost outlook-toggle"
          onClick={toggleVisible}
          aria-expanded={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {visible && (
        <div className="outlook-track">
          {rows.map((row) => {
            const selected =
              row.year === selectedYear && row.month === selectedMonth
            const positive = row.runningBalance >= 0

            return (
              <button
                key={`${row.year}-${row.month}`}
                type="button"
                className={`outlook-card ${selected ? 'selected' : ''} ${positive ? 'positive' : 'negative'}`}
                onClick={() => onSelectMonth(row.year, row.month)}
              >
                <span className="outlook-month">{monthLabel(row.year, row.month)}</span>
                <strong className="outlook-net">{formatMoney(row.runningBalance)}</strong>
                <span className="outlook-meta">
                  Month {formatMoney(row.monthNet)} · Bills {formatMoney(row.scheduledBills)}
                </span>
                <span className="outlook-meta soft">
                  {row.unpaidCount > 0
                    ? `${row.unpaidCount} unpaid`
                    : row.scheduledCount > 0
                      ? 'All bills paid'
                      : 'No scheduled bills'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
