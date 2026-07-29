import { useState } from 'react'
import { BalanceOutlook } from './BalanceOutlook'
import type { MonthBalanceOutlook } from '../services/balanceOutlook'
import type { MonthlySummary } from '../types/transaction'
import { formatMoney, monthLabel } from '../lib/format'

const OUTLOOK_STORAGE_KEY = 'ledger.showBalanceOutlook'

interface MonthSummaryProps {
  year: number
  month: number
  summary: MonthlySummary
  /** Unpaid scheduled bills for this month (not yet recorded as transactions). */
  unpaidScheduledBills: number
  unpaidCount: number
  monthNet: number
  runningBalance: number
  /** Total currently in the shared savings pot. */
  savingsPot: number
  outlookRows: MonthBalanceOutlook[]
  onPrev: () => void
  onNext: () => void
  onSelectMonth: (year: number, month: number) => void
}

function readStoredOutlookVisibility(): boolean {
  try {
    return localStorage.getItem(OUTLOOK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function MonthSummary({
  year,
  month,
  summary,
  unpaidScheduledBills,
  unpaidCount,
  monthNet,
  runningBalance,
  savingsPot,
  outlookRows,
  onPrev,
  onNext,
  onSelectMonth,
}: MonthSummaryProps) {
  const netPositive = runningBalance >= 0
  const billsTotal = summary.bills + unpaidScheduledBills
  const [outlookVisible, setOutlookVisible] = useState(readStoredOutlookVisibility)

  function toggleOutlook() {
    setOutlookVisible((prev) => {
      const next = !prev
      try {
        localStorage.setItem(OUTLOOK_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Ignore storage failures (private mode, etc.)
      }
      return next
    })
  }

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
          {savingsPot > 0 && (
            <span className="stat-meta savings-earmark">
              In savings {formatMoney(savingsPot)}
            </span>
          )}
        </article>
      </div>

      {outlookRows.length > 0 && (
        <div className="summary-outlook">
          <button
            type="button"
            className="text-btn"
            onClick={toggleOutlook}
            aria-expanded={outlookVisible}
          >
            {outlookVisible ? 'Hide month-by-month balance' : 'Show month-by-month balance'}
          </button>
          {outlookVisible && (
            <BalanceOutlook
              rows={outlookRows}
              selectedYear={year}
              selectedMonth={month}
              onSelectMonth={onSelectMonth}
            />
          )}
        </div>
      )}
    </section>
  )
}
