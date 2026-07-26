import type { Transaction } from '../types/transaction'
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
      <h2 id="list-heading">Transactions</h2>

      {loading ? (
        <LoadingState variant="section" label="Loading transactions…" />
      ) : transactions.length === 0 ? (
        <p className="empty-state">
          No transactions this month yet. Add a bill, expense, or income above.
        </p>
      ) : (
        <ul className="tx-list">
          {transactions.map((tx) => (
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
                <strong className={`tx-amount ${tx.type}`}>
                  {tx.type === 'income' ? '+' : '−'}
                  {formatMoney(tx.amount)}
                </strong>
                <div className="tx-actions">
                  <button type="button" className="link-btn" onClick={() => onEdit(tx)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => {
                      void onDelete(tx.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
