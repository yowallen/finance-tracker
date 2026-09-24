import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '../lib/format'

interface MonthSelectorProps {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
}

export function MonthSelector({ year, month, onPrev, onNext }: MonthSelectorProps) {
  return (
    <nav id="month-nav" className="month-selector" aria-label="Month navigation">
      <button
        type="button"
        className="icon-btn"
        onClick={onPrev}
        aria-label="Previous month"
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <h2 className="month-selector__heading" aria-live="polite">
        {monthLabel(year, month)}
      </h2>

      <button
        type="button"
        className="icon-btn"
        onClick={onNext}
        aria-label="Next month"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </nav>
  )
}
