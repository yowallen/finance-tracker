import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TrendingDown,
  Calculator,
  CreditCard as CreditCardIcon,
  X,
  ChevronDown,
  ChevronUp,
  Download,
  Table,
  BarChart2,
} from 'lucide-react'
import { formatMoney } from '../lib/format'
import { projectInterest } from '../services/creditCards'
import type { InterestProjection } from '../types/creditCard'

interface InterestProjectionProps {
  projection: InterestProjection
  onClose: () => void
}

function monthLabel(month: number, year: number): string {
  const date = new Date(year, month, 1)
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function projectionMonthLabel(monthOffset: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + monthOffset)
  return monthLabel(date.getMonth(), date.getFullYear())
}

function formatAxisMoney(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: 'compact',
    maximumFractionDigits: amount >= 1000 ? 1 : 0,
  }).format(amount)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

const CHART_HEIGHT = 228
const CHART_PADDING = { top: 16, right: 16, bottom: 40, left: 48 }

// Focus trap hook for modal accessibility
function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive) return

    const container = containerRef.current
    if (!container) return

    // Store the element that had focus before modal opened
    previousActiveElement.current = document.activeElement as HTMLElement

    // Get all focusable elements
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), details > summary'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus first element
    firstElement?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        return false // Let parent handle close
      }

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab - going backwards
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement?.focus()
          }
        } else {
          // Tab - going forwards
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement?.focus()
          }
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Restore focus to trigger element
      previousActiveElement.current?.focus()
    }
  }, [isActive])

  return containerRef
}

export function InterestProjection({ projection, onClose }: InterestProjectionProps) {
  const [viewMode, setViewMode] = useState<'fixed' | 'min'>('fixed')
  const [customFixedPayment, setCustomFixedPayment] = useState(projection.fixedPaymentAmount)
  const minimumPayment = projection.projectedBalancesMinPay[0]?.payment ?? 0
  const [showTable, setShowTable] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mediaQuery.addEventListener?.('change', handler)
    return () => mediaQuery.removeEventListener?.('change', handler)
  }, [])

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Focus trap
  const modalRef = useFocusTrap(true)

  const currentProjection = useMemo(() => {
    const recalculated = viewMode === 'fixed'
      ? projectInterest(
          {
            id: projection.cardId,
            name: projection.cardName,
            apr: projection.apr,
            userId: '',
            lastFour: '',
            limit: Number.POSITIVE_INFINITY,
            statementDay: 1,
            active: true,
            createdAt: '',
            dueDay: 1,
            minimumPaymentOverride: projection.minimumPaymentOverride,
          },
          projection.currentBalance,
          24,
          customFixedPayment,
        )
      : projection
    if (viewMode === 'min') {
      const projectedBalances = projection.projectedBalancesMinPay.filter(
        p => p.month < projection.monthsToPayoffMinPay,
      )
      return {
        totalInterest: projection.totalInterestIfMinPay,
        monthsToPayoff: projection.monthsToPayoffMinPay,
        monthlyPayment: formatMoney(projectedBalances[0]?.payment ?? 0),
        projectedBalances,
      }
    }
    return {
      totalInterest: recalculated.totalInterestIfFixedPay,
      monthsToPayoff: recalculated.monthsToPayoffFixedPay,
      monthlyPayment: formatMoney(recalculated.fixedPaymentAmount),
      projectedBalances: recalculated.projectedBalances.filter(p => p.month < recalculated.monthsToPayoffFixedPay),
    }
  }, [viewMode, projection, customFixedPayment])

  const maxBalance = useMemo(() => {
    const balances = currentProjection.projectedBalances.map(p => p.startingBalance)
    return Math.max(...balances, projection.currentBalance, 1)
  }, [currentProjection.projectedBalances, projection.currentBalance])

  const savingsAmount = projection.totalInterestIfMinPay - projection.totalInterestIfFixedPay
  const monthsSaved = projection.monthsToPayoffMinPay - projection.monthsToPayoffFixedPay

  const [chartWidth, setChartWidth] = useState(480)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const chartPoints = useMemo(() => {
    if (currentProjection.projectedBalances.length === 0) return []
    const count = Math.max(1, currentProjection.projectedBalances.length - 1)
    const plotWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
    return currentProjection.projectedBalances.map((point, index) => ({
      x: CHART_PADDING.left + (index / count) * plotWidth,
      y: CHART_PADDING.top + (1 - point.endingBalance / maxBalance) * plotHeight,
      data: point,
    }))
  }, [currentProjection.projectedBalances, maxBalance, chartWidth])

  const chartPath = useMemo(
    () => chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
    [chartPoints],
  )

  const chartAreaPath = useMemo(() => {
    if (chartPoints.length === 0) return ''
    const first = chartPoints[0]
    const last = chartPoints[chartPoints.length - 1]
    const baseline = CHART_HEIGHT - CHART_PADDING.bottom
    return `M ${first.x} ${baseline} ${chartPoints.map((point) => `L ${point.x} ${point.y}`).join(' ')} L ${last.x} ${baseline} Z`
  }, [chartPoints])

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width)
      }
    })
    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [])

  const xAxisLabels = useMemo(() => {
    if (chartPoints.length === 0) return []
    const step = Math.max(1, Math.ceil(chartPoints.length / 6))
    return chartPoints
      .filter((_, index) => index % step === 0 || index === chartPoints.length - 1)
      .map((point) => ({
        month: point.data.month,
        year: point.data.year,
        label: projectionMonthLabel(point.data.month),
        x: point.x,
      }))
  }, [chartPoints])

  const yAxisLabels = useMemo(() => {
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: formatAxisMoney(maxBalance * ratio),
      y: CHART_PADDING.top + (1 - ratio) * plotHeight,
    }))
  }, [maxBalance])

  const gridLines = useMemo(() => {
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: CHART_PADDING.top + ratio * plotHeight,
    }))
  }, [])

  return (
    <div
      ref={modalRef}
      className="interest-projection-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ip-title"
      style={{ animationDuration: reducedMotion ? '0ms' : '200ms' }}
    >
      <div
        className="interest-projection-backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{ animationDuration: reducedMotion ? '0ms' : '200ms' }}
      />
      <div
        className="interest-projection-content"
        style={{ animationDuration: reducedMotion ? '0ms' : '250ms' }}
      >
        <header className="ip-header">
          <h2 id="ip-title" className="ip-title">
            <CreditCardIcon className="ip-title-icon" aria-hidden="true" />
            Interest Projection — {projection.cardName}
          </h2>
          <button
            type="button"
            className="icon-btn ip-close"
            onClick={onClose}
            aria-label="Close projection"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="ip-body">
          {/* Card Info */}
          <div className="ip-card-info">
            <div className="ip-info-row">
              <span className="ip-info-label">APR</span>
              <strong className="ip-info-value">{projection.apr.toFixed(2)}%</strong>
            </div>
            <div className="ip-info-row">
              <span className="ip-info-label">Daily Rate</span>
              <strong className="ip-info-value">{formatPercent(projection.dailyInterestRate)}</strong>
            </div>
            <div className="ip-info-row">
              <span className="ip-info-label">Monthly Rate</span>
              <strong className="ip-info-value">{formatPercent(projection.monthlyInterestRate)}</strong>
            </div>
            <div className="ip-info-row">
              <span className="ip-info-label">Current Balance</span>
              <strong className="ip-info-value">{formatMoney(projection.currentBalance)}</strong>
            </div>
          </div>

          {/* Scenario Selector */}
          <div className="ip-scenario-selector" role="radiogroup" aria-label="Payment scenario">
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'min'}
              className={`ip-scenario-btn ${viewMode === 'min' ? 'active' : ''}`}
              onClick={() => setViewMode('min')}
            >
              <Calculator className="ip-scenario-icon" aria-hidden="true" />
              Minimum Payment Only
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'fixed'}
              className={`ip-scenario-btn ${viewMode === 'fixed' ? 'active' : ''}`}
              onClick={() => setViewMode('fixed')}
            >
              <TrendingDown className="ip-scenario-icon" aria-hidden="true" />
              Fixed Payment
            </button>
          </div>

          {/* Fixed Payment Input */}
          {viewMode === 'fixed' && (
            <div className="ip-fixed-input">
              <label className="ip-fixed-label" htmlFor="ip-fixed-amount">
                Monthly payment amount
              </label>
              <div className="ip-fixed-field">
                <span className="ip-fixed-prefix" aria-hidden="true">₱</span>
                <input
                  id="ip-fixed-amount"
                  type="number"
                  inputMode="decimal"
                  min={minimumPayment}
                  step="100"
                  value={customFixedPayment}
                  onChange={(e) => setCustomFixedPayment(Math.max(minimumPayment, Number.parseFloat(e.target.value) || 0))}
                  className="ip-fixed-input-field"
                  aria-label="Fixed monthly payment amount in pesos"
                />
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="ip-summary" role="list" aria-label="Projection summary">
            <article className="ip-stat" role="listitem">
              <span className="ip-stat-label">Total Interest</span>
              <strong className="ip-stat-value danger">{formatMoney(currentProjection.totalInterest)}</strong>
            </article>
            <article className="ip-stat" role="listitem">
              <span className="ip-stat-label">Months to Payoff</span>
              <strong className="ip-stat-value">{currentProjection.monthsToPayoff}</strong>
            </article>
            <article className="ip-stat" role="listitem">
              <span className="ip-stat-label">Monthly Payment</span>
              <strong className="ip-stat-value ok">{currentProjection.monthlyPayment}</strong>
            </article>
            <article className="ip-stat" role="listitem">
              <span className="ip-stat-label">Total Paid</span>
              <strong className="ip-stat-value">{formatMoney(projection.currentBalance + currentProjection.totalInterest)}</strong>
            </article>
          </div>

          {/* Comparison */}
          <div className="ip-comparison">
            <h3 className="ip-comparison-title">Scenario Comparison</h3>
            <div className="ip-comparison-grid">
              <div className="ip-comparison-card min">
                <h4>Minimum Payment</h4>
                <p className="ip-comparison-interest">{formatMoney(projection.totalInterestIfMinPay)} interest</p>
                <p className="ip-comparison-months">{projection.monthsToPayoffMinPay} months</p>
              </div>
              <div className="ip-comparison-card fixed">
                <h4>Fixed Payment ({formatMoney(customFixedPayment)}/mo)</h4>
                <p className="ip-comparison-interest">{formatMoney(projection.totalInterestIfFixedPay)} interest</p>
                <p className="ip-comparison-months">{projection.monthsToPayoffFixedPay} months</p>
              </div>
              <div className="ip-comparison-savings">
                <h4>
                  <TrendingDown className="ip-savings-icon" aria-hidden="true" />
                  You save
                </h4>
                <p className="ip-comparison-interest">{formatMoney(savingsAmount)}</p>
                <p className="ip-comparison-months">{monthsSaved} months faster</p>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="ip-chart-section">
            <div className="ip-chart-header">
              <h3 className="ip-chart-title">Balance Projection</h3>
              <div className="ip-chart-actions">
                <button
                  type="button"
                  className="ip-chart-toggle"
                  onClick={() => setShowTable(!showTable)}
                  aria-expanded={showTable}
                  aria-controls="amortization-table"
                >
                  {showTable ? (
                    <>
                      <BarChart2 className="ip-toggle-icon" aria-hidden="true" />
                      Show Chart
                    </>
                  ) : (
                    <>
                      <Table className="ip-toggle-icon" aria-hidden="true" />
                      Show Table
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="ip-chart-toggle"
                  onClick={() => {
                    // Export to CSV
                    const headers = ['Month', 'Starting Balance', 'Interest', 'Payment', 'Principal', 'Ending Balance']
                    const rows = currentProjection.projectedBalances.map(p => [
                      projectionMonthLabel(p.month),
                      formatMoney(p.startingBalance),
                      formatMoney(p.interestCharged),
                      formatMoney(p.payment),
                      formatMoney(p.payment - p.interestCharged),
                      formatMoney(p.endingBalance),
                    ])
                    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                    const link = document.createElement('a')
                    link.href = URL.createObjectURL(blob)
                    link.download = `${projection.cardName.replace(/\s+/g, '_')}_amortization_${new Date().toISOString().slice(0, 10)}.csv`
                    link.click()
                    URL.revokeObjectURL(link.href)
                  }}
                  aria-label="Export amortization schedule as CSV"
                >
                  <Download className="ip-toggle-icon" aria-hidden="true" />
                </button>
              </div>
            </div>

            {!showTable && (
              <div
                ref={chartContainerRef}
                className="ip-chart"
                role="img"
                aria-label={`Line chart showing balance projection from ${formatMoney(projection.currentBalance)} to ${formatMoney(currentProjection.projectedBalances[currentProjection.projectedBalances.length - 1]?.endingBalance ?? 0)} over ${currentProjection.projectedBalances.length} months`}
              >
                <svg
                  width="100%"
                  viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <g className="ip-chart-grid" stroke="var(--line)" strokeWidth="0.5">
                    {gridLines.map((line, i) => (
                      <line
                        key={i}
                        x1={CHART_PADDING.left}
                        y1={line.y}
                        x2={chartWidth - CHART_PADDING.right}
                        y2={line.y}
                      />
                    ))}
                  </g>

                  <g className="ip-chart-y-labels" fontSize="11" fill="var(--muted)" textAnchor="end" dominantBaseline="middle">
                    {yAxisLabels.map((label, i) => (
                      <text key={i} x={CHART_PADDING.left - 8} y={label.y}>
                        {label.value}
                      </text>
                    ))}
                  </g>

                  <g className="ip-chart-x-labels" fontSize="11" fill="var(--muted)" textAnchor="middle" dominantBaseline="hanging">
                    {xAxisLabels.map((label) => (
                      <text key={`${label.year}-${label.month}`} x={label.x} y={CHART_HEIGHT - CHART_PADDING.bottom + 10}>
                        {label.label}
                      </text>
                    ))}
                  </g>

                  <line
                    x1={CHART_PADDING.left}
                    y1={CHART_HEIGHT - CHART_PADDING.bottom}
                    x2={chartWidth - CHART_PADDING.right}
                    y2={CHART_HEIGHT - CHART_PADDING.bottom}
                    stroke="var(--line)"
                    strokeWidth="1"
                  />

                  <line
                    x1={CHART_PADDING.left}
                    y1={CHART_PADDING.top}
                    x2={CHART_PADDING.left}
                    y2={CHART_HEIGHT - CHART_PADDING.bottom}
                    stroke="var(--line)"
                    strokeWidth="1"
                  />

                  {chartAreaPath && (
                    <path
                      className="ip-chart-area"
                      d={chartAreaPath}
                      fill="var(--accent-soft)"
                      opacity="0.35"
                    />
                  )}

                  {chartPath && (
                    <path
                      className="ip-chart-line"
                      d={chartPath}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {chartPoints.map((point) => (
                    <circle
                      key={`${point.data.year}-${point.data.month}`}
                      className="ip-chart-point"
                      cx={point.x}
                      cy={point.y}
                      r="4.5"
                      fill="var(--accent)"
                      stroke="var(--surface)"
                      strokeWidth="2"
                      tabIndex={0}
                      role="img"
                      aria-label={`${projectionMonthLabel(point.data.month)}: Balance ${formatMoney(point.data.endingBalance)}, Interest ${formatMoney(point.data.interestCharged)}, Payment ${formatMoney(point.data.payment)}`}
                    />
                  ))}
                </svg>
                <p className="ip-chart-caption">
                  Line shows ending balance each month. Assumes no new charges.
                </p>
              </div>
            )}

            {/* Table View (accessible alternative) */}
            {showTable && (
              <div className="ip-chart-table-wrapper" role="region" aria-label="Balance projection data table">
                <table className="ip-chart-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Starting Balance</th>
                      <th scope="col">Interest</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Principal</th>
                      <th scope="col">Ending Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProjection.projectedBalances.map((p) => (
                      <tr key={p.month}>
                        <td>{projectionMonthLabel(p.month)}</td>
                        <td>{formatMoney(p.startingBalance)}</td>
                        <td className="danger">{formatMoney(p.interestCharged)}</td>
                        <td>{formatMoney(p.payment)}</td>
                        <td className="ok">{formatMoney(p.payment - p.interestCharged)}</td>
                        <td><strong>{formatMoney(p.endingBalance)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td></td>
                      <td className="danger"><strong>{formatMoney(currentProjection.totalInterest)}</strong></td>
                      <td><strong>{formatMoney(currentProjection.projectedBalances.reduce((sum, p) => sum + p.payment, 0))}</strong></td>
                      <td className="ok"><strong>{formatMoney(currentProjection.projectedBalances.reduce((sum, p) => sum + p.payment - p.interestCharged, 0))}</strong></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Amortization Table */}
          <details className="ip-amortization" id="amortization-table">
            <summary>
              <span>Amortization Schedule ({currentProjection.projectedBalances.length} months)</span>
              {showTable ? <ChevronUp className="ip-summary-chevron" aria-hidden="true" /> : <ChevronDown className="ip-summary-chevron" aria-hidden="true" />}
            </summary>
            <div className="ip-table-wrapper">
              <table className="ip-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Starting Balance</th>
                    <th scope="col">Interest</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Principal</th>
                    <th scope="col">Ending Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProjection.projectedBalances.map((p) => (
                    <tr key={p.month}>
                      <td>{projectionMonthLabel(p.month)}</td>
                      <td>{formatMoney(p.startingBalance)}</td>
                      <td className="danger">{formatMoney(p.interestCharged)}</td>
                      <td>{formatMoney(p.payment)}</td>
                      <td className="ok">{formatMoney(p.payment - p.interestCharged)}</td>
                      <td><strong>{formatMoney(p.endingBalance)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td></td>
                    <td className="danger"><strong>{formatMoney(currentProjection.totalInterest)}</strong></td>
                    <td><strong>{formatMoney(currentProjection.projectedBalances.reduce((sum, p) => sum + p.payment, 0))}</strong></td>
                    <td className="ok"><strong>{formatMoney(currentProjection.projectedBalances.reduce((sum, p) => sum + p.payment - p.interestCharged, 0))}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}