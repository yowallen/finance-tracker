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
  return (
    <section className="tx-list-section" aria-labelledby="list-heading">
      <h2 id="list-heading" className="section-title">
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
        <ul className="tx-list">
          {transactions.map((tx) => {
            const isInflow = tx.type === 'income' || isSavingsWithdraw(tx)
            return (
              <li key={tx.id} className={`tx-item ${tx.type}`}>
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
                        void onDelete(tx.id)
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
