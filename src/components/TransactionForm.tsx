import { useState, type SubmitEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  PlusCircle,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  CATEGORIES,
  type SavingsDirection,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '../types/transaction'
import type { CreditCard } from '../types/creditCard'
import { computeCashbackForTransaction } from '../services/creditCards'
import { dateInputToIso, toDateInputValue } from '../lib/format'

interface TransactionFormProps {
  editing: Transaction | null
  creditCards: CreditCard[]
  onSubmit: (input: TransactionInput) => Promise<void>
  onCancelEdit: () => void
  hideHeading?: boolean
}

/** Types offered when creating a new transaction (savings comes from elsewhere). */
const CREATE_TYPES: TransactionType[] = ['expense', 'income', 'bill']

function createInitialState(editing: Transaction | null) {
  if (editing) {
    return {
      type: editing.type,
      amount: String(editing.amount),
      category: editing.category,
      description: editing.description,
      occurredAt: toDateInputValue(new Date(editing.occurredAt)),
      savingsDirection: (editing.savingsDirection ?? 'deposit') as SavingsDirection,
    }
  }

  return {
    type: 'expense' as TransactionType,
    amount: '',
    category: CATEGORIES.expense[0],
    description: '',
    occurredAt: toDateInputValue(new Date()),
    savingsDirection: 'deposit' as SavingsDirection,
  }
}

function descriptionPlaceholder(type: TransactionType): string {
  if (type === 'bill') return 'e.g. Meralco July bill'
  if (type === 'income') return 'e.g. Mid-month salary'
  if (type === 'savings') return 'e.g. Moved to savings pot'
  return 'e.g. Groceries at SM'
}

function availableTypes(editing: Transaction | null): TransactionType[] {
  if (!editing) return CREATE_TYPES
  if (editing.type === 'bill' || editing.type === 'savings') return [editing.type]
  return CREATE_TYPES
}

const TYPE_ICONS: Record<TransactionType, typeof ShoppingBag> = {
  expense: ShoppingBag,
  income: TrendingUp,
  bill: Receipt,
  savings: Wallet,
}

export function TransactionForm({
  editing,
  creditCards,
  onSubmit,
  onCancelEdit,
  hideHeading = false,
}: TransactionFormProps) {
  const initial = createInitialState(editing)
  const [type, setType] = useState<TransactionType>(initial.type)
  const [amount, setAmount] = useState(initial.amount)
  const [category, setCategory] = useState(initial.category)
  const [description, setDescription] = useState(initial.description)
  const [occurredAt, setOccurredAt] = useState(initial.occurredAt)
  const [savingsDirection, setSavingsDirection] = useState<SavingsDirection>(
    initial.savingsDirection,
  )
  const [creditCardId, setCreditCardId] = useState(editing?.creditCardId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const types = availableTypes(editing)
  const activeCards = creditCards.filter((c) => c.active)

  function selectType(next: TransactionType) {
    setType(next)
    const options = CATEGORIES[next]
    if (next === 'savings') {
      setSavingsDirection('deposit')
      setCategory(CATEGORIES.savings[0])
    } else {
      setCategory((prev) => (options.includes(prev) ? prev : options[0]))
    }
    // Reset credit card when type changes
    setCreditCardId('')
  }

  function selectSavingsDirection(next: SavingsDirection) {
    setSavingsDirection(next)
    setCategory(next === 'deposit' ? CATEGORIES.savings[0] : CATEGORIES.savings[1])
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const parsed = Number.parseFloat(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid amount greater than zero.')
      return
    }

    setBusy(true)
    try {
      const selectedCard = activeCards.find((card) => card.id === creditCardId)
      const resolvedCategory =
        type === 'savings'
          ? savingsDirection === 'deposit'
            ? CATEGORIES.savings[0]
            : CATEGORIES.savings[1]
          : category
      const annualFeeFlag = resolvedCategory.toLowerCase() === 'fee' || /annual fee/i.test(description.trim())
      const cashBackEarned = selectedCard && (type === 'expense' || type === 'bill')
        ? computeCashbackForTransaction(selectedCard, {
            type,
            amount: parsed,
            category: resolvedCategory,
            description: description.trim(),
            creditCardId: selectedCard.id,
            creditCardPayment: false,
            isAnnualFee: annualFeeFlag,
            cashAdvance: editing?.cashAdvance,
            installmentPlanId: editing?.installmentPlanId,
          })
        : 0

      await onSubmit({
        type,
        amount: parsed,
        category: resolvedCategory,
        description: description.trim(),
        occurredAt: dateInputToIso(occurredAt),
        ...(type === 'savings' ? { savingsDirection } : {}),
        ...(creditCardId && (type === 'expense' || type === 'bill') ? { creditCardId } : {}),
        cashbackEarned: cashBackEarned,
        isAnnualFee: annualFeeFlag,
      })
      if (!editing) {
        setAmount('')
        setDescription('')
        setOccurredAt(toDateInputValue(new Date()))
        setCreditCardId('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.')
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = busy
    ? 'Saving…'
    : editing
      ? 'Save changes'
      : 'Add entry'

  return (
    <section
      className={`tx-form-section${hideHeading ? ' tx-form-section--embedded' : ''}`}
      {...(hideHeading ? {} : { 'aria-labelledby': 'form-heading' })}
    >
      {!hideHeading && (
        <h2 id="form-heading" tabIndex={-1} className="section-title">
          {editing ? (
            <Pencil className="section-icon" aria-hidden="true" />
          ) : (
            <PlusCircle className="section-icon" aria-hidden="true" />
          )}
          {editing ? 'Edit transaction' : 'Add transaction'}
        </h2>
      )}

      <form className="tx-form" onSubmit={handleSubmit}>
        {types.length > 1 && (
          <div className="type-tabs" role="tablist" aria-label="Transaction type">
            {types.map((t) => {
              const Icon = TYPE_ICONS[t]
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={type === t}
                  className={`type-tab ${type === t ? 'active' : ''} ${t}`}
                  onClick={() => selectType(t)}
                >
                  <Icon aria-hidden="true" />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              )
            })}
          </div>
        )}

        {type === 'savings' && (
          <div className="type-tabs" role="tablist" aria-label="Savings direction">
            <button
              type="button"
              role="tab"
              aria-selected={savingsDirection === 'deposit'}
              className={`type-tab ${savingsDirection === 'deposit' ? 'active savings' : ''}`}
              onClick={() => selectSavingsDirection('deposit')}
            >
              <ArrowDownToLine aria-hidden="true" />
              Deposit (to pot)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={savingsDirection === 'withdraw'}
              className={`type-tab ${savingsDirection === 'withdraw' ? 'active income' : ''}`}
              onClick={() => selectSavingsDirection('withdraw')}
            >
              <ArrowUpFromLine aria-hidden="true" />
              Withdraw (from pot)
            </button>
          </div>
        )}

        <div className="form-row">
          <label>
            Amount (₱)
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'tx-form-error' : undefined}
            />
          </label>
          {type !== 'savings' && (
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES[type].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {(type === 'expense' || type === 'bill') && activeCards.length > 0 && (
          <label>
            <p style={{ margin: 0 }}>
              Credit Card <span className="optional-hint">(optional)</span>
            </p>
            <select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
              <option value="">No credit card (cash/debit)</option>
              {activeCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} •••• {card.lastFour}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <p style={{ margin: 0 }}>
            Description <span className="optional-hint">(optional)</span>
          </p>
          <input
            type="text"
            maxLength={120}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={descriptionPlaceholder(type)}
          />
        </label>

        <label>
          Date
          <input
            type="date"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </label>

        {error && (
          <p id="tx-form-error" className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          {editing && (
            <button type="button" className="btn-ghost" onClick={onCancelEdit} disabled={busy}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </section>
  )
}
