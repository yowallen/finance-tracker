import { PiggyBank } from 'lucide-react'
import { formatMoney, monthLabel } from '../lib/format'
import type { MonthSavingsRow } from '../services/transactions'
import type { MonthlySavingsStats } from '../types/transaction'

interface SavingsStatsProps {
  year: number
  month: number
  stats: MonthlySavingsStats
  history: MonthSavingsRow[]
  onSelectMonth: (year: number, month: number) => void
}

function shortMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    year: '2-digit',
  }).format(new Date(year, month, 1))
}

export function SavingsStats({
  year,
  month,
  stats,
  history,
  onSelectMonth,
}: SavingsStatsProps) {
  const totalHistory = history.reduce((sum, row) => sum + row.stats.deposits, 0)
  const hasActivity = stats.depositCount + stats.withdrawCount > 0

  return (
    <section className="spending-stats savings-stats" aria-labelledby="savings-stats-heading">
      <div className="spending-stats-header">
        <div>
          <h2 id="savings-stats-heading" className="section-title">
            <PiggyBank className="section-icon" aria-hidden="true" />
            Savings
          </h2>
          <p className="reminders-sub">
            Money moved into the pot in {monthLabel(year, month)}
          </p>
        </div>
        <strong
          className={`spending-total savings-net ${stats.net >= 0 ? 'positive' : 'negative'}`}
        >
          {stats.net >= 0 ? '+' : '−'}
          {formatMoney(Math.abs(stats.net))}
        </strong>
      </div>

      {history.length > 1 && (
        <div className="spending-history" role="list" aria-label="Monthly savings history">
          {history.map((row) => {
            const selected = row.year === year && row.month === month
            const share = totalHistory > 0 ? (row.stats.deposits / totalHistory) * 100 : 0
            const height = Math.max(8, share)
            return (
              <button
                key={`${row.year}-${row.month}`}
                type="button"
                role="listitem"
                className={`spending-history-col ${selected ? 'selected' : ''}`}
                onClick={() => onSelectMonth(row.year, row.month)}
                aria-pressed={selected}
                title={`${monthLabel(row.year, row.month)}: deposited ${formatMoney(row.stats.deposits)}, net ${formatMoney(row.stats.net)} • ${share.toFixed(0)}% of this period`}
              >
                <span className="spending-history-bar-wrap">
                  <span
                    className="spending-history-bar"
                    style={{ height: `${height}%` }}
                  />
                </span>
                <span className="spending-history-label">
                  <span>{shortMonthLabel(row.year, row.month)}</span>
                  <span className="spending-history-percent">{share.toFixed(0)}%</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!hasActivity ? (
        <p className="empty-state">No savings deposits or withdrawals this month.</p>
      ) : (
        <ul className="spending-category-list">
          <li>
            <div className="spending-category-top">
              <span className="spending-category-name">Deposited</span>
              <span className="spending-category-amount">
                {formatMoney(stats.deposits)}
              </span>
            </div>
            <div className="spending-category-track" role="presentation">
              <span
                className="spending-category-fill savings-fill"
                style={{
                  width: `${stats.deposits + stats.withdrawals > 0 ? (stats.deposits / (stats.deposits + stats.withdrawals)) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="spending-category-meta">
              <span>
                {stats.depositCount}{' '}
                {stats.depositCount === 1 ? 'deposit' : 'deposits'}
              </span>
            </div>
          </li>
          <li>
            <div className="spending-category-top">
              <span className="spending-category-name">Withdrawn</span>
              <span className="spending-category-amount">
                {formatMoney(stats.withdrawals)}
              </span>
            </div>
            <div className="spending-category-track" role="presentation">
              <span
                className="spending-category-fill savings-withdraw-fill"
                style={{
                  width: `${stats.deposits + stats.withdrawals > 0 ? (stats.withdrawals / (stats.deposits + stats.withdrawals)) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="spending-category-meta">
              <span>
                {stats.withdrawCount}{' '}
                {stats.withdrawCount === 1 ? 'withdrawal' : 'withdrawals'}
              </span>
            </div>
          </li>
        </ul>
      )}

      <p className="savings-pot-balance">
        Pot balance at month end · {formatMoney(stats.potBalance)}
      </p>
    </section>
  )
}
