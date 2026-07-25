import type { MonthlySummary } from '../types/transaction'
import { formatMoney, monthLabel } from '../lib/format'

interface MonthSummaryProps {
  year: number
  month: number
  summary: MonthlySummary
  /** Unpaid scheduled bills for this month (not yet recorded as transactions). */
  unpaidScheduledBills: number
  unpaidCount: number
  monthNet: number
  runningBalance: number
  onPrev: () => void
  onNext: () => void
}

export function MonthSummary({
  year,
  month,
  summary,
  unpaidScheduledBills,
  unpaidCount,
  monthNet,
  runningBalance,
  onPrev,
  onNext,
}: MonthSummaryProps) {
  const netPositive = runningBalance >= 0
  const billsTotal = summary.bills + unpaidScheduledBills

  return (
    <section className="month-summary" aria-labelledby="month-heading">
      <div className="month-nav">
        <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous month">
          ‹
        </button>
        <h2 id="month-heading">{monthLabel(year, month)}</h2>
        <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="summary-grid">
        <article className="stat income">
          <span className="stat-label">Income</span>
          <strong className="stat-value">{formatMoney(summary.income)}</strong>
        </article>
        <article className="stat expense">
          <span className="stat-label">Expenses</span>
          <strong className="stat-value">{formatMoney(summary.expenses)}</strong>
        </article>
        <article className="stat bill">
          <span className="stat-label">Bills</span>
          <strong className="stat-value">{formatMoney(billsTotal)}</strong>
          {unpaidCount > 0 && (
            <span className="stat-meta">
              {formatMoney(unpaidScheduledBills)} unpaid upcoming
            </span>
          )}
        </article>
        <article className={`stat net ${netPositive ? 'positive' : 'negative'}`}>
          <span className="stat-label">Running balance</span>
          <strong className="stat-value">{formatMoney(runningBalance)}</strong>
          <span className="stat-meta">
            This month {formatMoney(monthNet)} · carries over from prior months
          </span>
        </article>
      </div>
    </section>
  )
}
