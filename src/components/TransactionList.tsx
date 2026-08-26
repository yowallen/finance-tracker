import { useRef } from 'react'
import { List, Pencil, Trash2 } from 'lucide-react'
import type { Transaction } from '../types/transaction'
import { isSavingsWithdraw } from '../types/transaction'
import { formatDate, formatMoney } from '../lib/format'
import { LoadingState } from './LoadingState'

interface TransactionListProps {
  transactions: Transaction[]
  loading: boolean
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => Promise<void>
}

export function TransactionList({
  transactions,
  loading,
  onEdit,
  onDelete,
}: TransactionListProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

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

  return (
    <section className="tx-list-section" aria-labelledby="list-heading">
      <h2 ref={headingRef} id="list-heading" tabIndex={-1} className="section-title">
        <List className="section-icon" aria-hidden="true" />
        Transactions
      </h2>

      {loading ? (
        <LoadingState variant="section" label="Loading transactions…" />
      ) : transactions.length === 0 ? (
        <p className="empty-state">
          No transactions this month yet. Add an expense or income above.
        </p>
      ) : (
        <ul ref={listRef} className="tx-list">
          {transactions.map((tx) => {
            const isInflow = tx.type === 'income' || isSavingsWithdraw(tx)
            return (
              <li key={tx.id} data-tx-id={tx.id} className={`tx-item ${tx.type}`}>
                <div className="tx-main">
                  <div className="tx-top">
                    <span className={`tx-type-badge ${tx.type}`}>{tx.type}</span>
                    <span className="tx-category">{tx.category}</span>
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
                      className="link-btn btn-with-icon"
                      onClick={() => onEdit(tx)}
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-btn danger btn-with-icon"
                      onClick={() => {
                        void handleDelete(tx.id)
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Delete
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
