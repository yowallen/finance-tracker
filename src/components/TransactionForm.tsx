import { useState, type FormEvent } from 'react'
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
import { dateInputToIso, toDateInputValue } from '../lib/format'

interface TransactionFormProps {
  editing: Transaction | null
  onSubmit: (input: TransactionInput) => Promise<void>
  onCancelEdit: () => void
}

/** Types offered when creating a new transaction (bills/savings come from elsewhere). */
const CREATE_TYPES: TransactionType[] = ['expense', 'income']

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
  onSubmit,
  onCancelEdit,
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const types = availableTypes(editing)

  function selectType(next: TransactionType) {
    setType(next)
    const options = CATEGORIES[next]
    if (next === 'savings') {
      setSavingsDirection('deposit')
      setCategory(CATEGORIES.savings[0])
    } else {
      setCategory((prev) => (options.includes(prev) ? prev : options[0]))
    }
  }

  function selectSavingsDirection(next: SavingsDirection) {
    setSavingsDirection(next)
    setCategory(next === 'deposit' ? CATEGORIES.savings[0] : CATEGORIES.savings[1])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = Number.parseFloat(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid amount greater than zero.')
      return
    }

    setBusy(true)
    try {
      await onSubmit({
        type,
        amount: parsed,
        category:
          type === 'savings'
            ? savingsDirection === 'deposit'
              ? CATEGORIES.savings[0]
              : CATEGORIES.savings[1]
            : category,
        description: description.trim(),
        occurredAt: dateInputToIso(occurredAt),
        ...(type === 'savings' ? { savingsDirection } : {}),
      })
      if (!editing) {
        setAmount('')
        setDescription('')
        setOccurredAt(toDateInputValue(new Date()))
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
    <section className="tx-form-section" aria-labelledby="form-heading">
      <h2 id="form-heading" className="section-title">
        {editing ? (
          <Pencil className="section-icon" aria-hidden="true" />
        ) : (
          <PlusCircle className="section-icon" aria-hidden="true" />
        )}
        {editing ? 'Edit transaction' : 'Add transaction'}
      </h2>

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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
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

        <label>
          Description <span className="optional-hint">(optional)</span>
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
          <p className="form-error" role="alert">
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
