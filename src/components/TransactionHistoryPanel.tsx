import { useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { CreditCard } from '../types/creditCard'
import type { Transaction } from '../types/transaction'
import { TransactionHistoryBody } from './TransactionList'

interface TransactionHistoryPanelProps {
  open: boolean
  /** While the edit sheet is open, this panel stays up but stops taking keys. */
  suspended: boolean
  transactions: Transaction[]
  allTransactions?: Transaction[]
  loading: boolean
  onClose: () => void
  onAdd: () => void
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => Promise<void>
  cardById?: Map<string, CreditCard>
}

export function TransactionHistoryPanel({
  open,
  suspended,
  transactions,
  allTransactions,
  loading,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  cardById,
}: Readonly<TransactionHistoryPanelProps>) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open || suspended) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, suspended])

  if (!open) return null

  const countLabel = transactions.length === 1 ? '1 this month' : `${transactions.length} this month`

  return (
    <div className="history-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="history-panel"
        role="dialog"
        aria-modal={suspended ? undefined : true}
        aria-labelledby="history-panel-heading"
        inert={suspended || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="history-panel__header">
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Back to ledger"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="history-panel__titles">
            <h2 id="history-panel-heading" tabIndex={-1} className="section-title">
              Transactions
            </h2>
            <p className="tx-list-count">{countLabel}</p>
          </div>
          <button type="button" className="text-btn tx-view-all history-panel__add" onClick={onAdd}>
            Add
          </button>
        </div>
        <div className="history-panel__body">
          <TransactionHistoryBody
            transactions={transactions}
            allTransactions={allTransactions}
            loading={loading}
            onEdit={onEdit}
            onDelete={onDelete}
            cardById={cardById}
          />
        </div>
      </div>
    </div>
  )
}
