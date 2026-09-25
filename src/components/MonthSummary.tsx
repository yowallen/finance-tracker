import { useState, type CSSProperties } from 'react'
import {
  CreditCard as CreditCardIcon,
  PiggyBank,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { BalanceOutlook } from './BalanceOutlook'
import { CreditLimitBar } from './CreditLimitBar'
import type { MonthBalanceOutlook } from '../services/balanceOutlook'
import type { MonthlySummary } from '../types/transaction'
import { formatMoney } from '../lib/format'
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
  onSelectMonth: (year: number, month: number) => void
  /** Whether the user has at least one active credit card. */
  hasActiveCards: boolean
  /** One statement per active card, so the overview can name each card. */
  cardSnapshots?: CreditCardStatement[]
  creditCards?: CreditCard[]
  /** Combined outstanding across active cards. */
  totalOutstanding?: number
  /** Combined available credit across active cards. */
  totalAvailableCredit?: number
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
  onSelectMonth,
  hasActiveCards,
  cardSnapshots = [],
  creditCards = [],
  totalOutstanding,
  totalAvailableCredit,
  onNavigateToCards,
}: MonthSummaryProps) {
  const netPositive = runningBalance >= 0
  const billsTotal = summary.bills + unpaidScheduledBills
  const [outlookVisible, setOutlookVisible] = useState(readStoredOutlookVisibility)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

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
    <section id="overview" className="month-summary" aria-labelledby="month-heading">
      <div className="month-nav">
        <h2 id="month-heading" tabIndex={-1}>Overview</h2>
      </div>

      <div className="summary-grid">
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
          <div className="cc-snapshot-list">
            {cardSnapshots.map((statement) => {
              const card = statement.card
              const overdue = Boolean(
                isCurrentMonth &&
                !statement.isPaid &&
                statement.dueDate.getTime() < today.getTime(),
              )
              const dueLabel = statement.dueDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: statement.dueDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
              })
              const members = card.sharedLimitGroupId
                ? creditCards.filter((item) => item.sharedLimitGroupId === card.sharedLimitGroupId)
                : [card]
              const shownMembers = members.length > 1 ? members : [card]
              const hasPoints = shownMembers.some((item) => item.rewardType === 'points')
              const hasCashback = shownMembers.some((item) => item.rewardType !== 'points' && (item.cashbackRules?.length ?? 0) > 0)
              return (
                <article
                  key={card.id}
                  className="cc-snapshot"
                  style={{ '--card-color': card.color ?? 'var(--accent)' } as CSSProperties}
                >
                  <header className="cc-snapshot-head">
                    <h4 className="cc-snapshot-name">
                      {shownMembers.map((member) => member.name).join(' · ')}
                    </h4>
                    <span className="cc-snapshot-number">
                      {shownMembers.map((member) => `•••• ${member.lastFour}`).join(' · ')}
                    </span>
                  </header>
                  <div className="cc-snapshot-stats">
                    <div className="cc-snapshot-stat">
                      <span className="cc-stat-label">Outstanding</span>
                      <strong className="cc-stat-value outstanding">{formatMoney(statement.outstandingBalance)}</strong>
                    </div>
                    <div className="cc-snapshot-stat">
                      <span className="cc-stat-label">Available</span>
                      <strong className="cc-stat-value available">{formatMoney(statement.availableCredit)}</strong>
                    </div>
                    {hasPoints ? (
                      <div className="cc-snapshot-stat">
                        <span className="cc-stat-label">Points</span>
                        <strong className="cc-stat-value">{statement.pointsEarned.toLocaleString()} pts</strong>
                      </div>
                    ) : hasCashback ? (
                      <div className="cc-snapshot-stat">
                        <span className="cc-stat-label">Cashback</span>
                        <strong className="cc-stat-value available">{formatMoney(statement.availableCashback)}</strong>
                      </div>
                    ) : (
                      <div className="cc-snapshot-stat">
                        <span className="cc-stat-label">Used</span>
                        <strong className="cc-stat-value">
                          {card.limit > 0
                            ? `${Math.min(100, (statement.outstandingBalance / card.limit) * 100).toFixed(0)}%`
                            : '0%'}
                        </strong>
                      </div>
                    )}
                    <div className={`cc-snapshot-stat ${overdue ? 'overdue' : ''}`}>
                      <span className="cc-stat-label">{overdue ? 'Overdue' : 'Due'}</span>
                      <strong className="cc-stat-value due">{formatMoney(statement.minimumPayment)}</strong>
                      <span className={`cc-stat-due-status ${overdue ? 'danger' : ''}`}>{dueLabel}</span>
                    </div>
                  </div>
                  {(card.madnessLimit ?? 0) > 0 && (
                    <CreditLimitBar
                      compact
                      cardName={card.name}
                      cardLimit={card.limit}
                      availableCredit={statement.availableCredit}
                      madnessLimit={card.madnessLimit ?? 0}
                      madnessUsed={card.madnessUsed ?? 0}
                    />
                  )}
                </article>
              )
            })}
          </div>
          {cardSnapshots.length > 1 && totalOutstanding !== undefined && totalAvailableCredit !== undefined && (
            <p className="cc-snapshot-total">
              All cards · outstanding {formatMoney(totalOutstanding)} · available {formatMoney(totalAvailableCredit)}
            </p>
          )}
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
