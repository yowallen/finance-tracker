import { useMemo, useRef, useState } from 'react'
import {
  List,
  Pencil,
  Trash2,
  CreditCard as CreditCardIcon,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Calendar,
  DollarSign,
  Tag,
  MoreHorizontal,
} from 'lucide-react'
import type { Transaction } from '../types/transaction'
import type { CreditCard } from '../types/creditCard'
import { isSavingsWithdraw } from '../types/transaction'
import { formatDate, formatMoney } from '../lib/format'
import { LoadingState } from './LoadingState'

type SortField = 'date' | 'amount' | 'type' | 'category'
type SortDirection = 'asc' | 'desc'

interface TransactionListProps {
  transactions: Transaction[]
  loading: boolean
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => Promise<void>
  cardById?: Map<string, CreditCard>
}

function sortTransactions(
  transactions: Transaction[],
  field: SortField,
  direction: SortDirection,
): Transaction[] {
  const sorted = [...transactions].sort((a, b) => {
    let comparison = 0
    switch (field) {
      case 'date':
        comparison = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
        break
      case 'amount':
        comparison = a.amount - b.amount
        break
      case 'type': {
        const typeOrder: Record<string, number> = { income: 0, savings: 1, bill: 2, expense: 3 }
        comparison = (typeOrder[a.type] ?? 4) - (typeOrder[b.type] ?? 4)
        break
      }
      case 'category':
        comparison = a.category.localeCompare(b.category)
        break
    }
    return direction === 'asc' ? comparison : -comparison
  })
  return sorted
}

interface SortConfig {
  field: SortField
  direction: SortDirection
}

const SORT_FIELD_LABELS: Record<SortField, string> = {
  date: 'Date',
  amount: 'Amount',
  type: 'Type',
  category: 'Category',
}

const SORT_FIELD_ICONS: Record<SortField, React.ReactNode> = {
  date: <Calendar className="sort-header-icon" aria-hidden="true" />,
  amount: <DollarSign className="sort-header-icon" aria-hidden="true" />,
  type: <Tag className="sort-header-icon" aria-hidden="true" />,
  category: <MoreHorizontal className="sort-header-icon" aria-hidden="true" />,
}

function SortHeaderButton({
  label,
  icon,
  isActive,
  direction,
  onClick,
  onKeyDown,
}: {
  field: SortField
  label: string
  icon: React.ReactNode
  isActive: boolean
  direction: SortDirection
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  return (
    <button
      type="button"
      className={`sort-header-btn ${isActive ? 'active' : ''} ${direction}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      aria-pressed={isActive}
      title={isActive ? `Sorted by ${label} (${direction === 'asc' ? 'ascending' : 'descending'}). Click to reverse.` : `Sort by ${label}`}
    >
      <span className="sort-header-content">
        {icon}
        <span className="sort-header-label">{label}</span>
      </span>
      <span className="sort-header-indicator" aria-hidden="true">
        {isActive ? (
          direction === 'asc' ? <ChevronUp className="sort-arrow" /> : <ChevronDown className="sort-arrow" />
        ) : (
          <ArrowUpDown className="sort-arrow inactive" />
        )}
      </span>
    </button>
  )
}

function SortDropdown({
  value,
  onChange,
}: {
  value: SortConfig
  onChange: (config: SortConfig) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const options: Array<{ field: SortField; direction: SortDirection; label: string }> = [
    { field: 'date', direction: 'desc', label: 'Date (newest first)' },
    { field: 'date', direction: 'asc', label: 'Date (oldest first)' },
    { field: 'amount', direction: 'desc', label: 'Amount (highest first)' },
    { field: 'amount', direction: 'asc', label: 'Amount (lowest first)' },
    { field: 'type', direction: 'asc', label: 'Type (Income → Savings → Bill → Expense)' },
    { field: 'type', direction: 'desc', label: 'Type (Expense → Bill → Savings → Income)' },
    { field: 'category', direction: 'asc', label: 'Category (A–Z)' },
    { field: 'category', direction: 'desc', label: 'Category (Z–A)' },
  ]

  const handleOptionClick = (field: SortField, direction: SortDirection) => {
    onChange({ field, direction })
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')?.item(-1)?.focus()
    }
  }

  const handleMenuKeyDown = (e: React.KeyboardEvent, index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    if (!items) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[Math.min(index + 1, items.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[Math.max(index - 1, 0)]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const option = options[index]
      handleOptionClick(option.field, option.direction)
    }
  }

  return (
    <div className="sort-dropdown" role="menu">
      <button
        ref={buttonRef}
        type="button"
        className={`sort-dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Sort by ${SORT_FIELD_LABELS[value.field]} (${value.direction === 'asc' ? 'ascending' : 'descending'})`}
      >
        <span className="sort-dropdown-icon" aria-hidden="true">
          <ArrowUpDown />
        </span>
        <span className="sort-dropdown-text">
          {SORT_FIELD_LABELS[value.field]}: {value.direction === 'asc' ? '↑' : '↓'}
        </span>
        <span className="sort-dropdown-chevron" aria-hidden="true">
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="sort-dropdown-menu"
          role="listbox"
          aria-label="Sort options"
        >
          {options.map((option, index) => (
            <button
              key={`${option.field}-${option.direction}`}
              type="button"
              role="menuitem"
              className={`sort-dropdown-item ${value.field === option.field && value.direction === option.direction ? 'selected' : ''}`}
              onClick={() => handleOptionClick(option.field, option.direction)}
              onKeyDown={(e) => handleMenuKeyDown(e, index)}
              tabIndex={value.field === option.field && value.direction === option.direction ? 0 : -1}
              aria-selected={value.field === option.field && value.direction === option.direction}
            >
              <span className="sort-dropdown-item-label">{option.label}</span>
              {value.field === option.field && value.direction === option.direction && (
                <span className="sort-dropdown-check" aria-hidden="true">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TransactionList({
  transactions,
  loading,
  onEdit,
  onDelete,
  cardById,
}: TransactionListProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'date', direction: 'desc' })

  const sortedTransactions = useMemo(
    () => sortTransactions(transactions, sortConfig.field, sortConfig.direction),
    [transactions, sortConfig.field, sortConfig.direction],
  )

  // Delete without a confirm dialog; keep keyboard users anchored by moving
  // focus to the neighbouring row (or the heading when the list empties).
  async function handleDelete(id: string) {
    const container = listRef.current
    const rows = container?.querySelectorAll<HTMLLIElement>('.tx-item')
    const deletedIndex = rows
      ? Array.from(rows).findIndex((row) => row.dataset.txId === id)
      : -1

    try {
      await onDelete(id)
    } finally {
      requestAnimationFrame(() => {
        const remaining = listRef.current?.querySelectorAll<HTMLLIElement>('.tx-item')
        if (remaining && deletedIndex >= 0 && remaining.length > 0) {
          const neighbor = remaining[Math.min(deletedIndex, remaining.length - 1)]
          neighbor.querySelector('button')?.focus()
        } else {
          headingRef.current?.focus()
        }
      })
    }
  }

  const handleSortClick = (field: SortField) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const handleSortKeyDown = (e: React.KeyboardEvent, field: SortField) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSortClick(field)
    }
  }

  return (
    <section className="tx-list-section" aria-labelledby="list-heading">
      <div className="tx-list-header">
        <h2 ref={headingRef} id="list-heading" tabIndex={-1} className="section-title">
          <List className="section-icon" aria-hidden="true" />
          Transactions
        </h2>

        {/* Sort header row - clickable column headers */}
        <div className="sort-header-row" role="row" aria-label="Transaction columns">
          <SortHeaderButton
            field="date"
            label="Date"
            icon={SORT_FIELD_ICONS.date}
            isActive={sortConfig.field === 'date'}
            direction={sortConfig.direction}
            onClick={() => handleSortClick('date')}
            onKeyDown={(e) => handleSortKeyDown(e, 'date')}
          />
          <SortHeaderButton
            field="category"
            label="Category"
            icon={SORT_FIELD_ICONS.category}
            isActive={sortConfig.field === 'category'}
            direction={sortConfig.direction}
            onClick={() => handleSortClick('category')}
            onKeyDown={(e) => handleSortKeyDown(e, 'category')}
          />
          <SortHeaderButton
            field="type"
            label="Type"
            icon={SORT_FIELD_ICONS.type}
            isActive={sortConfig.field === 'type'}
            direction={sortConfig.direction}
            onClick={() => handleSortClick('type')}
            onKeyDown={(e) => handleSortKeyDown(e, 'type')}
          />
          <SortHeaderButton
            field="amount"
            label="Amount"
            icon={SORT_FIELD_ICONS.amount}
            isActive={sortConfig.field === 'amount'}
            direction={sortConfig.direction}
            onClick={() => handleSortClick('amount')}
            onKeyDown={(e) => handleSortKeyDown(e, 'amount')}
          />
        </div>

        {/* Dropdown fallback for mobile / dense sorting options */}
        <SortDropdown value={sortConfig} onChange={setSortConfig} />
      </div>

      {loading ? (
        <LoadingState variant="section" label="Loading transactions…" />
      ) : sortedTransactions.length === 0 ? (
        <p className="empty-state">
          No transactions this month yet. Add an expense or income above.
        </p>
      ) : (
        <ul ref={listRef} className="tx-list" role="list">
          {sortedTransactions.map((tx) => {
            const isInflow = tx.type === 'income' || isSavingsWithdraw(tx)
            return (
              <li key={tx.id} data-tx-id={tx.id} className={`tx-item ${tx.type}`} role="listitem">
                <div className="tx-main">
                  <div className="tx-top">
                    <span className={`tx-type-badge ${tx.type}`}>{tx.type}</span>
                    <span className="tx-category">{tx.category}</span>
                    {tx.creditCardId && (() => {
                      const card = cardById?.get(tx.creditCardId)
                      const cardLabel = card ? `•••• ${card.lastFour}` : 'Deleted Card'
                      const badgeText = tx.creditCardPayment === true
                        ? `Payment to ${cardLabel}`
                        : `Charged to ${cardLabel}`

                      return (
                        <span className={`tx-cc-badge ${tx.creditCardPayment === true ? 'payment' : ''}`}>
                          <CreditCardIcon className="tx-cc-icon" aria-hidden="true" />
                          {badgeText}
                        </span>
                      )
                    })()}
                  </div>
                  {tx.description.trim() ? (
                    <p className="tx-desc">{tx.description}</p>
                  ) : (
                    <p className="tx-desc muted">{tx.category}</p>
                  )}
                  <time className="tx-when" dateTime={tx.occurredAt}>
                    {formatDate(tx.occurredAt)}
                  </time>
                </div>
                <div className="tx-side">
                  <strong className={`tx-amount ${isInflow ? 'income' : tx.type}`}>
                    {isInflow ? '+' : '−'}
                    {formatMoney(tx.amount)}
                  </strong>
                  <div className="tx-actions">
                    <button
                      type="button"
                      className="icon-btn icon-btn--edit"
                      onClick={() => onEdit(tx)}
                      aria-label={`Edit ${tx.description.trim() || tx.category}`}
                      title="Edit transaction"
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => {
                        void handleDelete(tx.id)
                      }}
                      aria-label={`Delete ${tx.description.trim() || tx.category}`}
                      title="Delete transaction"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}