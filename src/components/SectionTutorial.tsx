import { useEffect, useId, useState } from 'react'

const STORAGE_PREFIX = 'ledger.tutorialSeen:'

export const TUTORIAL_STEPS = [
  {
    id: 'month-nav',
    title: 'Choose a month',
    body: 'The arrows move between months. Balances, bills, and history on this page all follow the month you pick.',
  },
  {
    id: 'overview',
    title: 'Overview',
    body: 'This is the month at a glance: running balance, income, expenses, and bills. If you add credit cards, each card gets its own snapshot here.',
  },
  {
    id: 'quick-actions',
    title: 'Shortcuts',
    body: 'Add a transaction, jump to bills, open history, or go to your credit cards without scrolling.',
  },
  {
    id: 'calendar',
    title: 'Calendar',
    body: 'Pick a day to see what is due and what you already spent. Dots mark bills, income, and expenses.',
  },
  {
    id: 'reminders',
    title: 'Bills',
    body: 'Recurring bills live here. Add rent, utilities, or a card payment, then mark each one paid when you have sent the money.',
  },
  {
    id: 'history',
    title: 'Transactions',
    body: 'The latest transactions for this month stay here. View all opens the full history, where you can sort, edit, or delete a row.',
  },
  {
    id: 'credit-cards',
    title: 'Credit cards',
    body: 'Add a card to track its limit, what you still owe, and rewards. A Madness Limit stays separate from everyday available credit.',
  },
  {
    id: 'savings',
    title: 'Savings',
    body: 'Set a goal and move money into the savings pot. The pot is shared across goals, and it is kept out of your spending balance.',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    body: 'Spending and savings charts compare this month with recent ones. Select a bar to jump to that month.',
  },
] as const

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

function scrollTargetIntoTutorialView(id: string) {
  const element = document.getElementById(id)
  if (!element) return

  const monthBar = document.querySelector('.month-selector')
  const panel = document.querySelector('.tutorial-panel')
  const topInset = (monthBar?.getBoundingClientRect().height ?? 72) + 16
  const bottomInset = (panel?.getBoundingClientRect().height ?? 220) + 24
  const rect = element.getBoundingClientRect()
  const visibleTop = topInset
  const visibleBottom = window.innerHeight - bottomInset
  const visibleMiddle = visibleTop + (visibleBottom - visibleTop) / 2
  const elementMiddle = rect.top + Math.min(rect.height, visibleBottom - visibleTop) / 2
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  window.scrollBy({
    top: elementMiddle - visibleMiddle,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  })
}

export function hasSeenTutorial(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === '1'
  } catch {
    return false
  }
}

function markTutorialSeen(userId: string): void {
  try {
    localStorage.setItem(storageKey(userId), '1')
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
}

interface SectionTutorialProps {
  userId: string
  open: boolean
  onClose: () => void
}

export function SectionTutorial({ userId, open, onClose }: SectionTutorialProps) {
  const titleId = useId()
  const [stepIndex, setStepIndex] = useState(0)
  const step = TUTORIAL_STEPS[stepIndex]
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1

  useEffect(() => {
    if (!open) return undefined
    const previous = document.querySelector<HTMLElement>('.tutorial-target')
    previous?.classList.remove('tutorial-target')
    const target = document.getElementById(step.id)
    target?.classList.add('tutorial-target')
    const frame = window.requestAnimationFrame(() => {
      scrollTargetIntoTutorialView(step.id)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      target?.classList.remove('tutorial-target')
    }
  }, [open, step.id])

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        markTutorialSeen(userId)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, userId])

  if (!open || !step) return null

  function finish() {
    markTutorialSeen(userId)
    onClose()
    setStepIndex(0)
  }

  return (
    <section className="tutorial-panel" role="dialog" aria-labelledby={titleId}>
      <p className="tutorial-progress">
        Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
      </p>
      <h2 id={titleId}>{step.title}</h2>
      <p>{step.body}</p>
      <div className="tutorial-actions">
        <button type="button" className="btn-ghost" onClick={finish}>
          Skip
        </button>
        <div className="tutorial-nav">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={stepIndex === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (isLast) finish()
              else setStepIndex((index) => index + 1)
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </section>
  )
}
