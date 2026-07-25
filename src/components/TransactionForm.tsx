import { useState, type FormEvent } from 'react'
import { CATEGORIES, type Transaction, type TransactionInput, type TransactionType } from '../types/transaction'
import { dateInputToIso, toDateInputValue } from '../lib/format'

interface TransactionFormProps {
  editing: Transaction | null
  onSubmit: (input: TransactionInput) => Promise<void>
  onCancelEdit: () => void
}

function createInitialState(editing: Transaction | null) {
  if (editing) {
    return {
      type: editing.type,
      amount: String(editing.amount),
      category: editing.category,
      description: editing.description,
      occurredAt: toDateInputValue(new Date(editing.occurredAt)),
    }
  }

  return {
    type: 'bill' as TransactionType,
    amount: '',
    category: CATEGORIES.bill[0],
    description: '',
    occurredAt: toDateInputValue(new Date()),
  }
}

function descriptionPlaceholder(type: TransactionType): string {
  if (type === 'bill') return 'e.g. Meralco July bill'
  if (type === 'income') return 'e.g. Mid-month salary'
  return 'e.g. Groceries at SM'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function selectType(next: TransactionType) {
    setType(next)
    const options = CATEGORIES[next]
    setCategory((prev) => (options.includes(prev) ? prev : options[0]))
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
        category,
        description: description.trim(),
        occurredAt: dateInputToIso(occurredAt),
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
      <h2 id="form-heading">{editing ? 'Edit transaction' : 'Add transaction'}</h2>

      <form className="tx-form" onSubmit={handleSubmit}>
        <div className="type-tabs" role="tablist" aria-label="Transaction type">
          {(['bill', 'expense', 'income'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={type === t}
              className={`type-tab ${type === t ? 'active' : ''} ${t}`}
              onClick={() => selectType(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

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
