import { useState, useEffect, useRef } from 'react'
import { TrendingDown, TrendingUp, Minus, ChevronDown, BarChart2 } from 'lucide-react'
import { formatMoney } from '../lib/format'
import type { UtilizationHistory } from '../types/creditCard'

interface UtilizationChartProps {
  history: UtilizationHistory
}

function formatMonth(date: string): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(date))
}

function trendLabel(trend: UtilizationHistory['trend']): string {
  if (trend === 'improving') return 'Improving'
  if (trend === 'worsening') return 'Worsening'
  return 'Stable'
}

const TrendIcon = ({ trend }: { trend: UtilizationHistory['trend'] }) => {
  if (trend === 'improving') return <TrendingDown aria-hidden="true" />
  if (trend === 'worsening') return <TrendingUp aria-hidden="true" />
  return <Minus aria-hidden="true" />
}

export function UtilizationChart({ history }: UtilizationChartProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const contentRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLElement>(null)

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mediaQuery.addEventListener?.('change', handler)
    return () => mediaQuery.removeEventListener?.('change', handler)
  }, [])

  // Handle smooth height animation for details element
  useEffect(() => {
    const content = contentRef.current
    const summary = summaryRef.current
    if (!content || !summary) return

    if (isOpen) {
      content.style.height = 'auto'
      const height = content.scrollHeight
      if (!reducedMotion) {
        content.style.height = '0px'
        // Force reflow
        content.offsetHeight
        content.style.height = `${height}px`
      } else {
        content.style.height = `${height}px`
      }
    } else {
      const height = content.scrollHeight
      content.style.height = `${height}px`
      // Force reflow
      content.offsetHeight
      if (!reducedMotion) {
        content.style.height = '0px'
      } else {
        content.style.height = '0px'
      }
    }
  }, [isOpen, reducedMotion])

  // Clean up height after animation
  useEffect(() => {
    if (isOpen && !reducedMotion) {
      const content = contentRef.current
      if (!content) return
      const handleTransitionEnd = (e: TransitionEvent) => {
        if (e.propertyName === 'height' && e.target === content) {
          content.style.height = 'auto'
          content.removeEventListener('transitionend', handleTransitionEnd)
        }
      }
      content.addEventListener('transitionend', handleTransitionEnd)
      return () => content.removeEventListener('transitionend', handleTransitionEnd)
    }
  }, [isOpen, reducedMotion])

  const values = history.snapshots.map((snapshot) => snapshot.utilizationPercent)
  const maxValue = Math.max(100, ...values)
  const chartWidth = 520
  const chartHeight = 150
  const padding = { top: 12, right: 12, bottom: 28, left: 12 }
  const usableWidth = chartWidth - padding.left - padding.right
  const usableHeight = chartHeight - padding.top - padding.bottom

  const pointFor = (value: number, index: number) => ({
    x: padding.left + (index / Math.max(1, values.length - 1)) * usableWidth,
    y: padding.top + (1 - value / maxValue) * usableHeight,
  })

  const points = values.map(pointFor)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <details className="utilization-panel" open={isOpen} onToggle={() => setIsOpen(!isOpen)}>
      <summary ref={summaryRef} className="utilization-panel-summary" aria-expanded={isOpen}>
        <div className="utilization-panel-header">
          <div>
            <h4 className="utilization-panel-title">Utilization history</h4>
            <p className="utilization-panel-subtitle">Last {history.snapshots.length} statement cycles</p>
          </div>
          <span className={`utilization-trend ${history.trend}`}>
            <TrendIcon trend={history.trend} />
            {trendLabel(history.trend)}
          </span>
        </div>
        <div className="utilization-metrics">
          <span>Current <strong>{history.currentUtilization.toFixed(1)}%</strong></span>
          <span>Average <strong>{history.averageUtilization.toFixed(1)}%</strong></span>
          <span>Peak <strong>{history.peakUtilization.percent.toFixed(1)}%</strong></span>
        </div>
        <div className="utilization-panel-toggle">
          <BarChart2 className="utilization-toggle-icon" aria-hidden="true" />
          <span>{isOpen ? 'Hide chart' : 'Show chart'}</span>
          <ChevronDown className={`utilization-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true" />
        </div>
      </summary>

      <div ref={contentRef} className="utilization-panel-content" style={{ overflow: 'hidden' }}>
        <div className="utilization-chart-wrap" style={{ paddingTop: '0.55rem' }}>
          {history.snapshots.length > 0 ? (
            <svg
              className="utilization-chart"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label={`${history.cardName} utilization history. Current ${history.currentUtilization.toFixed(1)} percent.`}
            >
              {[30, 50].map((threshold) => {
                const y = padding.top + (1 - threshold / maxValue) * usableHeight
                return (
                  <g key={threshold}>
                    <line x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} className={`utilization-threshold threshold-${threshold}`} />
                    <text x={chartWidth - padding.right} y={y - 3} textAnchor="end" className="utilization-threshold-label">{threshold}%</text>
                  </g>
                )
              })}
              <path d={path} className="utilization-line" />
              {points.map((point, index) => (
                <circle key={history.snapshots[index].date} cx={point.x} cy={point.y} r="3.5" className="utilization-point">
                  <title>{`${formatMonth(history.snapshots[index].date)}: ${values[index].toFixed(1)}% (${formatMoney(history.snapshots[index].statementBalance)})`}</title>
                </circle>
              ))}
              {history.snapshots.map((snapshot, index) => (
                <text key={snapshot.date} x={points[index].x} y={chartHeight - 8} textAnchor="middle" className="utilization-axis-label">
                  {formatMonth(snapshot.date)}
                </text>
              ))}
            </svg>
          ) : (
            <p className="utilization-empty">No statement history yet.</p>
          )}
        </div>
        <p className="utilization-caption">Under 30% is a common credit-health target; 50% marks higher utilization.</p>
      </div>
    </details>
  )
}