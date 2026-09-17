import { usePaymentAllocation } from '../hooks/usePaymentAllocation'
import { formatMoney } from '../lib/format'
import type { CreditCard, CreditCardStatement, PaymentAllocationPlan } from '../types/creditCard'

interface PaymentAllocationProps {
  cards: CreditCard[]
  statements: CreditCardStatement[]
  onApply: (plan: PaymentAllocationPlan) => Promise<void>
}

const strategyLabels = {
  'highest-interest-first': 'Avalanche: highest APR first',
  'lowest-balance-first': 'Snowball: lowest balance first',
  proportional: 'Proportional to balance',
} as const

export function PaymentAllocation({ cards, statements, onApply }: PaymentAllocationProps) {
  const allocation = usePaymentAllocation(cards, statements)
  const hasBalances = allocation.plan.allocations.length > 1

  if (!hasBalances) return null

  async function applyPlan() {
    if (allocation.plan.totalPayment <= 0) return
    await onApply(allocation.plan)
  }

  return (
    <section className="payment-allocation" aria-labelledby="allocation-heading">
      <div className="payment-allocation-header">
        <div>
          <h3 id="allocation-heading">Allocate a multi-card payment</h3>
          <p>Cover minimums first, then direct extra money using your selected strategy.</p>
        </div>
        <span className="payment-allocation-total">
          {formatMoney(allocation.plan.totalPayment)}
        </span>
      </div>

      <div className="payment-allocation-controls">
        <label>
          Total payment (₱)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={allocation.totalPayment || ''}
            onChange={(event) => allocation.setTotalPayment(Number(event.target.value) || 0)}
            placeholder="0.00"
          />
        </label>
        <label>
          Strategy
          <select
            value={allocation.strategy}
            onChange={(event) => allocation.setStrategy(event.target.value as typeof allocation.strategy)}
          >
            {Object.entries(strategyLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="payment-allocation-list">
        {allocation.plan.allocations.map((item) => (
          <div className="payment-allocation-row" key={item.cardId}>
            <div>
              <strong>{item.cardName}</strong>
              <span>{item.cardApr > 0 ? `${item.cardApr.toFixed(2)}% APR · ` : ''}Balance {formatMoney(item.currentBalance)}</span>
            </div>
            <div className="payment-allocation-amount">
              <small>Minimum {formatMoney(item.minimumPayment)}</small>
              <strong>{formatMoney(item.allocatedAmount)}</strong>
            </div>
          </div>
        ))}
      </div>

      {allocation.plan.remainingUnallocated > 0.01 && (
        <p className="payment-allocation-note">
          {formatMoney(allocation.plan.remainingUnallocated)} remains unallocated because all card balances are covered.
        </p>
      )}

      <button type="button" className="btn-primary" disabled={allocation.plan.totalPayment <= 0} onClick={() => void applyPlan()}>
        Apply allocation
      </button>
    </section>
  )
}
