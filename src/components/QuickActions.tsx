import { CalendarDays, CirclePlus, ListFilter, ReceiptText } from 'lucide-react'

interface QuickActionsProps {
  onAddTransaction: () => void
  onReviewBills: () => void
  onOpenCalendar: () => void
  onOpenHistory: () => void
}

export function QuickActions({
  onAddTransaction,
  onReviewBills,
  onOpenCalendar,
  onOpenHistory,
}: QuickActionsProps) {
  const actions = [
    {
      label: 'Add transaction',
      icon: CirclePlus,
      onClick: onAddTransaction,
      strong: true,
      ariaLabel: 'Add transaction',
    },
    {
      label: 'Review bills',
      icon: ReceiptText,
      onClick: onReviewBills,
      strong: false,
      ariaLabel: 'Review bills',
    },
    {
      label: 'Calendar',
      icon: CalendarDays,
      onClick: onOpenCalendar,
      strong: false,
      ariaLabel: 'Open calendar',
    },
    {
      label: 'History',
      icon: ListFilter,
      onClick: onOpenHistory,
      strong: false,
      ariaLabel: 'Open transaction history',
    },
  ]

  return (
    <nav className="quick-actions" aria-label="Quick actions">
      {actions.map(({ label, icon: Icon, onClick, strong, ariaLabel }) => (
        <button
          key={label}
          type="button"
          className={`quick-action ${strong ? 'primary' : ''}`}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
