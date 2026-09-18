import { CalendarDays, List, Plus, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'

interface MobileBottomNavProps {
  onGoOverview: () => void
  onGoCalendar: () => void
  onOpenAdd: () => void
  onGoHistory: () => void
}

const SECTION_IDS = ['overview', 'calendar', 'history']

export function MobileBottomNav({
  onGoOverview,
  onGoCalendar,
  onOpenAdd,
  onGoHistory,
}: MobileBottomNavProps) {
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (visible?.target?.id) {
          setActiveSection(visible.target.id)
        }
      },
      {
        rootMargin: '-30% 0px -45% 0px',
        threshold: [0.2, 0.4, 0.6],
      },
    )

    SECTION_IDS.forEach((id) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <button
        type="button"
        className={`mobile-bottom-nav__item ${activeSection === 'overview' ? 'active' : ''}`}
        onClick={onGoOverview}
        aria-current={activeSection === 'overview' ? 'page' : undefined}
      >
        <Wallet aria-hidden="true" />
        <span>Overview</span>
      </button>
      <button
        type="button"
        className={`mobile-bottom-nav__item ${activeSection === 'calendar' ? 'active' : ''}`}
        onClick={onGoCalendar}
        aria-current={activeSection === 'calendar' ? 'page' : undefined}
      >
        <CalendarDays aria-hidden="true" />
        <span>Calendar</span>
      </button>
      <button
        type="button"
        className="mobile-bottom-nav__item mobile-bottom-nav__item--add"
        onClick={onOpenAdd}
        aria-label="Add transaction"
      >
        <Plus aria-hidden="true" />
        <span>Add</span>
      </button>
      <button
        type="button"
        className={`mobile-bottom-nav__item ${activeSection === 'history' ? 'active' : ''}`}
        onClick={onGoHistory}
        aria-current={activeSection === 'history' ? 'page' : undefined}
      >
        <List aria-hidden="true" />
        <span>History</span>
      </button>
    </nav>
  )
}
