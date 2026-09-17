import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CreditCard as CreditCardIcon,
  PiggyBank,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { BalanceOutlook } from './BalanceOutlook'
import type { MonthBalanceOutlook } from '../services/balanceOutlook'
import type { MonthlySummary } from '../types/transaction'
import { formatMoney, monthLabel } from '../lib/format'
import type { CreditCard, CreditCardStatement } from '../types/creditCard'

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
  isCurrentMonth?: boolean
  /** Total currently in the shared savings pot. */
  savingsPot: number
  outlookRows: MonthBalanceOutlook[]
  onPrev: () => void
  onNext: () => void
  onSelectMonth: (year: number, month: number) => void
  /** Whether the user has at least one active credit card. */
  hasActiveCards: boolean
  /** Credit card summary data */
  totalOutstanding?: number
  totalAvailableCredit?: number
  nextDueStatement?: { card: CreditCard; statement: CreditCardStatement } | null
  aggregateUtilization?: { totalBalance: number; totalLimit: number; utilizationPercent: number }
  onNavigateToCards?: () => void
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
  isCurrentMonth,
  savingsPot,
  outlookRows,
  onPrev,
  onNext,
  onSelectMonth,
  hasActiveCards,
  totalOutstanding,
  totalAvailableCredit,
  nextDueStatement,
  aggregateUtilization,
  onNavigateToCards,
}: MonthSummaryProps) {
  const netPositive = runningBalance >= 0
  const billsTotal = summary.bills + unpaidScheduledBills
  const [outlookVisible, setOutlookVisible] = useState(readStoredOutlookVisibility)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = nextDueStatement?.statement.dueDate
  const nextDueIsOverdue = Boolean(
    isCurrentMonth && dueDate && dueDate.getTime() < today.getTime(),
  )

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
          <ChevronLeft aria-hidden="true" />
        </button>
        <h2 id="month-heading">{monthLabel(year, month)}</h2>
        <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className="summary-grid">
        <article className="stat income">
          <span className="stat-label">
            <TrendingUp className="stat-icon" aria-hidden="true" />
            Income
          </span>
          <strong className="stat-value">{formatMoney(summary.income)}</strong>
        </article>
        <article className="stat expense">
          <span className="stat-label">
            <ShoppingBag className="stat-icon" aria-hidden="true" />
            Expenses
          </span>
          <strong className="stat-value">{formatMoney(summary.expenses)}</strong>
        </article>
        <article className="stat bill">
          <span className="stat-label">
            <Receipt className="stat-icon" aria-hidden="true" />
            Bills
          </span>
          <strong className="stat-value">{formatMoney(billsTotal)}</strong>
          {unpaidCount > 0 && (
            <span className="stat-meta">
              {formatMoney(unpaidScheduledBills)} unpaid upcoming
            </span>
          )}
        </article>
        <article className={`stat net ${netPositive ? 'positive' : 'negative'}`}>
          <span className="stat-label">
            <Wallet className="stat-icon" aria-hidden="true" />
            Running balance
          </span>
          <strong className="stat-value">{formatMoney(runningBalance)}</strong>
          <span className="stat-meta">
            {isCurrentMonth ? 'So far this month' : 'This month'} {formatMoney(monthNet)} · carries over from prior months
          </span>
          {savingsPot > 0 && (
            <span className="stat-meta savings-earmark">
              <PiggyBank className="stat-icon" aria-hidden="true" />
              In savings {formatMoney(savingsPot)}
            </span>
          )}
        </article>
      </div>

      {hasActiveCards && (
        <div className="summary-credit-cards" aria-labelledby="cc-summary-heading">
          <h3 id="cc-summary-heading" className="cc-summary-title">
            <CreditCardIcon className="section-icon" aria-hidden="true" />
            Credit card snapshot
            {onNavigateToCards && (
              <button
                type="button"
                className="text-btn cc-summary-link"
                onClick={onNavigateToCards}
              >
                Manage
              </button>
            )}
          </h3>
          <div className="cc-summary-grid">
            {totalOutstanding !== undefined && (
              <article className="cc-stat outstanding">
                <span className="cc-stat-label">Total outstanding</span>
                <strong className="cc-stat-value">{formatMoney(totalOutstanding)}</strong>
              </article>
            )}
            {totalAvailableCredit !== undefined && (
              <article className="cc-stat available">
                <span className="cc-stat-label">Available credit</span>
                <strong className="cc-stat-value">{formatMoney(totalAvailableCredit)}</strong>
              </article>
            )}
            {aggregateUtilization && (
              <article className="cc-stat utilization">
                <span className="cc-stat-label">Utilization</span>
                <strong className="cc-stat-value">{aggregateUtilization.utilizationPercent.toFixed(1)}%</strong>
                <span className="cc-stat-meta">
                  {formatMoney(aggregateUtilization.totalBalance)} of {formatMoney(aggregateUtilization.totalLimit)} used
                </span>
              </article>
            )}
            {nextDueStatement && (
              <article className={`cc-stat due ${nextDueIsOverdue ? 'overdue' : ''}`}>
                <span className="cc-stat-label">Next due</span>
                <strong className="cc-stat-value">
                  {formatMoney(nextDueStatement.statement.minimumPayment)}
                </strong>
                <span className="cc-stat-meta">
                  Minimum payment · {nextDueStatement.card.name} · ••••{' '}
                  {nextDueStatement.card.lastFour}
                </span>
                <span className={`cc-stat-due-status ${nextDueIsOverdue ? 'danger' : ''}`}>
                  {nextDueIsOverdue ? 'Overdue · ' : 'Due '}
                  {nextDueStatement.statement.dueDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: nextDueStatement.statement.dueDate.getFullYear() !== today.getFullYear()
                      ? 'numeric'
                      : undefined,
                  })}
                </span>
              </article>
            )}
          </div>
        </div>
      )}

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
