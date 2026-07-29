import { ChartPie } from 'lucide-react'
import { formatMoney, monthLabel } from '../lib/format'
import type { MonthSpendingRow } from '../services/transactions'
import type { MonthlySpendingStats } from '../types/transaction'

interface SpendingStatsProps {
  year: number
  month: number
  stats: MonthlySpendingStats
  history: MonthSpendingRow[]
  onSelectMonth: (year: number, month: number) => void
}

function shortMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year, month, 1))
}

export function SpendingStats({
  year,
  month,
  stats,
  history,
  onSelectMonth,
}: SpendingStatsProps) {
  const maxHistory = Math.max(...history.map((row) => row.stats.total), 1)

  return (
    <section className="spending-stats" aria-labelledby="spending-heading">
      <div className="spending-stats-header">
        <div>
          <h2 id="spending-heading" className="section-title">
            <ChartPie className="section-icon" aria-hidden="true" />
            Spending
          </h2>
          <p className="reminders-sub">
            How you spent in {monthLabel(year, month)} — expenses and bills by category
          </p>
        </div>
        <strong className="spending-total">{formatMoney(stats.total)}</strong>
      </div>

      {history.length > 1 && (
        <div className="spending-history" role="list" aria-label="Monthly spend history">
          {history.map((row) => {
            const selected = row.year === year && row.month === month
            const height = Math.max(8, (row.stats.total / maxHistory) * 100)
            return (
              <button
                key={`${row.year}-${row.month}`}
                type="button"
                role="listitem"
                className={`spending-history-col ${selected ? 'selected' : ''}`}
                onClick={() => onSelectMonth(row.year, row.month)}
                aria-pressed={selected}
                title={`${monthLabel(row.year, row.month)}: ${formatMoney(row.stats.total)}`}
              >
                <span className="spending-history-bar-wrap">
                  <span
                    className="spending-history-bar"
                    style={{ height: `${height}%` }}
                  />
                </span>
                <span className="spending-history-label">
                  {shortMonthLabel(row.year, row.month)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {stats.categories.length === 0 ? (
        <p className="empty-state">No expenses or bills recorded this month.</p>
      ) : (
        <ul className="spending-category-list">
          {stats.categories.map((row) => (
            <li key={row.category}>
              <div className="spending-category-top">
                <span className="spending-category-name">{row.category}</span>
                <span className="spending-category-amount">
                  {formatMoney(row.amount)}
                </span>
              </div>
              <div
                className="spending-category-track"
                role="presentation"
              >
                <span
                  className="spending-category-fill"
                  style={{ width: `${row.percent}%` }}
                />
              </div>
              <div className="spending-category-meta">
                <span>{row.percent.toFixed(0)}%</span>
                <span>
                  {row.count} {row.count === 1 ? 'entry' : 'entries'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
