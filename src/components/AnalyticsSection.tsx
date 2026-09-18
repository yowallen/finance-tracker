import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { SavingsStats } from './SavingsStats'
import { SpendingStats } from './SpendingStats'
import type { MonthSavingsRow, MonthSpendingRow } from '../services/transactions'
import type { MonthlySavingsStats, MonthlySpendingStats } from '../types/transaction'

interface AnalyticsSectionProps {
  year: number
  month: number
  spendingStats: MonthlySpendingStats
  spendingHistory: MonthSpendingRow[]
  savingsStats: MonthlySavingsStats
  savingsHistory: MonthSavingsRow[]
  onSelectMonth: (year: number, month: number) => void
}

export function AnalyticsSection({
  year,
  month,
  spendingStats,
  spendingHistory,
  savingsStats,
  savingsHistory,
  onSelectMonth,
}: AnalyticsSectionProps) {
  const [expanded, setExpanded] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches,
  )

  return (
    <section id="analytics" className="analytics-section" aria-labelledby="analytics-heading">
      <div className="analytics-header">
        <h2 id="analytics-heading" tabIndex={-1} className="section-title">
          <BarChart3 className="section-icon" aria-hidden="true" />
          Analytics
        </h2>
        <button
          type="button"
          className="text-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide analytics' : 'Show analytics'}
        </button>
      </div>

      {expanded && (
        <div className="stats-row">
          <SpendingStats
            year={year}
            month={month}
            stats={spendingStats}
            history={spendingHistory}
            onSelectMonth={onSelectMonth}
          />
          <SavingsStats
            year={year}
            month={month}
            stats={savingsStats}
            history={savingsHistory}
            onSelectMonth={onSelectMonth}
          />
        </div>
      )}
    </section>
  )
}
