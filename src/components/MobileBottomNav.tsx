import { CalendarDays, List, Plus, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'

interface MobileBottomNavProps {
  onGoOverview: () => void
  onGoCalendar: () => void
  onOpenAdd: () => void
  onGoHistory: () => void
  historyOpen?: boolean
}

const SECTION_IDS = ['overview', 'calendar', 'history']

export function MobileBottomNav({
  onGoOverview,
  onGoCalendar,
  onOpenAdd,
  onGoHistory,
  historyOpen = false,
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

  const currentSection = historyOpen ? 'history' : activeSection

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <button
        type="button"
        className={`mobile-bottom-nav__item ${currentSection === 'overview' ? 'active' : ''}`}
        onClick={onGoOverview}
        aria-current={currentSection === 'overview' ? 'page' : undefined}
      >
        <Wallet aria-hidden="true" />
        <span>Overview</span>
      </button>
      <button
        type="button"
        className={`mobile-bottom-nav__item ${currentSection === 'calendar' ? 'active' : ''}`}
        onClick={onGoCalendar}
        aria-current={currentSection === 'calendar' ? 'page' : undefined}
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
        className={`mobile-bottom-nav__item ${currentSection === 'history' ? 'active' : ''}`}
        onClick={onGoHistory}
        aria-current={currentSection === 'history' ? 'page' : undefined}
      >
        <List aria-hidden="true" />
        <span>History</span>
      </button>
    </nav>
  )
}
