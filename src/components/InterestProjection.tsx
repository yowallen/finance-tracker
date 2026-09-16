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
import type { InterestProjection } from '../types/creditCard'

interface InterestProjectionProps {
  projection: InterestProjection
  onClose: () => void
}

function monthLabel(month: number, year: number): string {
  const date = new Date(year, month, 1)
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

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
  const [showTable, setShowTable] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)
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
    if (viewMode === 'min') {
      return {
        totalInterest: projection.totalInterestIfMinPay,
        monthsToPayoff: projection.monthsToPayoffMinPay,
        monthlyPayment: 'Minimum (3% or ₱100)',
        projectedBalances: projection.projectedBalances.filter(p => p.month < projection.monthsToPayoffMinPay),
      }
    }
    return {
      totalInterest: projection.totalInterestIfFixedPay,
      monthsToPayoff: projection.monthsToPayoffFixedPay,
      monthlyPayment: formatMoney(customFixedPayment),
      projectedBalances: projection.projectedBalances.filter(p => p.month < projection.monthsToPayoffFixedPay),
    }
  }, [viewMode, projection, customFixedPayment])

  const maxBalance = useMemo(() => {
    const balances = currentProjection.projectedBalances.map(p => p.startingBalance)
    return Math.max(...balances, projection.currentBalance)
  }, [currentProjection.projectedBalances, projection.currentBalance])

  const savingsAmount = projection.totalInterestIfMinPay - projection.totalInterestIfFixedPay
  const monthsSaved = projection.monthsToPayoffMinPay - projection.monthsToPayoffFixedPay

  // Chart dimensions - responsive
  const chartHeight = 200
  const chartPadding = { top: 20, right: 20, bottom: 40, left: 60 }

  // Chart width based on container
  const [chartWidth, setChartWidth] = useState(480)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Generate chart path data
  const chartPath = useMemo(() => {
    if (currentProjection.projectedBalances.length === 0) return ''
    const points = currentProjection.projectedBalances.map((p, i) => {
      const x = chartPadding.left + (i / Math.max(1, currentProjection.projectedBalances.length - 1)) * (chartWidth - chartPadding.left - chartPadding.right)
      const y = chartPadding.top + (1 - p.endingBalance / maxBalance) * (chartHeight - chartPadding.top - chartPadding.bottom)
      return { x, y }
    })
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }, [currentProjection.projectedBalances, maxBalance])

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

  // Generate x-axis labels
  const xAxisLabels = useMemo(() => {
    if (currentProjection.projectedBalances.length === 0) return []
    const step = Math.max(1, Math.ceil(currentProjection.projectedBalances.length / 6))
    return currentProjection.projectedBalances
      .filter((_, idx) => idx % step === 0)
      .map((p, idx) => ({
        month: p.month,
        year: p.year,
        label: monthLabel(p.month % 12, p.year),
        x: chartPadding.left + (idx * step / Math.max(1, currentProjection.projectedBalances.length - 1)) * (chartWidth - chartPadding.left - chartPadding.right),
      }))
  }, [currentProjection.projectedBalances, chartWidth])

  // Generate y-axis labels
  const yAxisLabels = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map((ratio, _i) => ({
      value: formatMoney(maxBalance * ratio),
      y: chartPadding.top + (1 - ratio) * (chartHeight - chartPadding.top - chartPadding.bottom),
    }))
  }, [maxBalance])

  // Generate grid lines
  const gridLines = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map((ratio, _i) => ({
      y: chartPadding.top + ratio * (chartHeight - chartPadding.top - chartPadding.bottom),
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
              <label className="ip-fixed-label">
                <span>Monthly payment amount:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="100"
                  step="100"
                  value={customFixedPayment}
                  onChange={(e) => setCustomFixedPayment(Math.max(100, Number.parseFloat(e.target.value) || 0))}
                  className="ip-fixed-input-field"
                  aria-label="Fixed monthly payment amount in pesos"
                />
              </label>
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
                <TrendingDown className="ip-savings-icon" aria-hidden="true" />
                <div className="ip-savings-details">
                  <span>
                    Save <strong>{formatMoney(savingsAmount)}</strong> in interest
                  </span>
                  <span>
                    Pay off <strong>{monthsSaved}</strong> months faster
                  </span>
                </div>
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
                      monthLabel(p.month % 12, p.year),
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
                <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                  {/* Grid lines */}
                  <g className="ip-chart-grid" stroke="var(--line)" strokeWidth="0.5">
                    {gridLines.map((line, i) => (
                      <line
                        key={i}
                        x1={chartPadding.left}
                        y1={line.y}
                        x2={chartWidth - chartPadding.right}
                        y2={line.y}
                      />
                    ))}
                  </g>

                  {/* Y-axis labels */}
                  <g className="ip-chart-y-labels" fontSize="11" fill="var(--muted)" textAnchor="end" dominantBaseline="middle">
                    {yAxisLabels.map((label, i) => (
                      <text key={i} x={chartPadding.left - 8} y={label.y}>
                        {label.value}
                      </text>
                    ))}
                  </g>

                  {/* X-axis labels */}
                  <g className="ip-chart-x-labels" fontSize="11" fill="var(--muted)" textAnchor="middle" dominantBaseline="hanging">
                    {xAxisLabels.map((label) => (
                      <text key={label.month} x={label.x} y={chartHeight - chartPadding.bottom + 8}>
                        {label.label}
                      </text>
                    ))}
                  </g>

                  {/* X-axis line */}
                  <line
                    x1={chartPadding.left}
                    y1={chartHeight - chartPadding.bottom}
                    x2={chartWidth - chartPadding.right}
                    y2={chartHeight - chartPadding.bottom}
                    stroke="var(--line)"
                    strokeWidth="1"
                  />

                  {/* Y-axis line */}
                  <line
                    x1={chartPadding.left}
                    y1={chartPadding.top}
                    x2={chartPadding.left}
                    y2={chartHeight - chartPadding.bottom}
                    stroke="var(--line)"
                    strokeWidth="1"
                  />

                  {/* Area under curve (optional subtle fill) */}
                  {currentProjection.projectedBalances.length > 0 && (
                    <path
                      className="ip-chart-area"
                      d={[
                        `M ${chartPadding.left} ${chartHeight - chartPadding.bottom}`,
                        chartPath,
                        `L ${chartWidth - chartPadding.right} ${chartHeight - chartPadding.bottom}`,
                        'Z',
                      ].join(' ')}
                      fill="var(--accent-soft)"
                      opacity="0.3"
                    />
                  )}

                  {/* Balance line */}
                  {currentProjection.projectedBalances.length > 0 && (
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

                  {/* Data points */}
                  {currentProjection.projectedBalances.map((p, i) => {
                    const x = chartPadding.left + (i / Math.max(1, currentProjection.projectedBalances.length - 1)) * (chartWidth - chartPadding.left - chartPadding.right)
                    const y = chartPadding.top + (1 - p.endingBalance / maxBalance) * (chartHeight - chartPadding.top - chartPadding.bottom)
                    return (
                      <circle
                        key={i}
                        className="ip-chart-point"
                        cx={x}
                        cy={y}
                        r="5"
                        fill="var(--accent)"
                        stroke="var(--surface)"
                        strokeWidth="2"
                        tabIndex={0}
                        role="button"
                        aria-label={`${monthLabel(p.month % 12, p.year)}: Balance ${formatMoney(p.endingBalance)}, Interest ${formatMoney(p.interestCharged)}, Payment ${formatMoney(p.payment)}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            // Could show tooltip here
                          }
                        }}
                      />
                    )
                  })}
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
                        <td>{monthLabel(p.month % 12, p.year)}</td>
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
                      <td>{monthLabel(p.month % 12, p.year)}</td>
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