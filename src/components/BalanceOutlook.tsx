import { formatMoney, monthLabel } from '../lib/format'
import type { MonthBalanceOutlook } from '../services/balanceOutlook'

interface BalanceOutlookProps {
  rows: MonthBalanceOutlook[]
  selectedYear: number
  selectedMonth: number
  onSelectMonth: (year: number, month: number) => void
}

export function BalanceOutlook({
  rows,
  selectedYear,
  selectedMonth,
  onSelectMonth,
}: BalanceOutlookProps) {
  if (rows.length === 0) {
    return null
  }

  return (
    <div className="balance-outlook" aria-labelledby="outlook-heading">
      <p id="outlook-heading" className="outlook-sub">
        Running balance carries each month forward (prior months + this month’s net)
      </p>
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
    </div>
  )
}
