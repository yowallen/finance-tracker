import { useState, type FormEvent } from 'react'
import { formatMoney, formatYearMonth, monthLabel, toMonthInputValue } from '../lib/format'
import {
  durationInMonths,
  endsOnFor,
} from '../services/recurringBills'
import { CATEGORIES } from '../types/transaction'
import type {
  BillReminder,
  DurationUnit,
  RecurringBill,
  RecurringBillInput,
} from '../types/recurringBill'

interface BillRemindersProps {
  year: number
  month: number
  reminders: BillReminder[]
  loading: boolean
  error: string | null
  onAdd: (input: RecurringBillInput) => Promise<void>
  onUpdate: (id: string, input: RecurringBillInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMarkPaid: (reminder: BillReminder) => Promise<void>
}

function statusLabel(reminder: BillReminder): string {
  switch (reminder.status) {
    case 'paid':
      return 'Paid'
    case 'overdue':
      return `Overdue by ${Math.abs(reminder.daysUntilDue)} day${Math.abs(reminder.daysUntilDue) === 1 ? '' : 's'}`
    case 'due-soon':
      return reminder.daysUntilDue === 0
        ? 'Due today'
        : `Due in ${reminder.daysUntilDue} day${reminder.daysUntilDue === 1 ? '' : 's'}`
    case 'unpaid':
      return 'Not paid'
    default:
      return `Due day ${reminder.bill.dueDay}`
  }
}

function formatDueDate(date: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function scheduleSummary(input: Pick<RecurringBillInput, 'startsOn' | 'durationValue' | 'durationUnit'>): string {
  if (!input.startsOn || !input.durationValue || input.durationValue < 1) {
    return 'Set how long you need to keep paying this bill.'
  }
  const total = durationInMonths(input.durationValue, input.durationUnit)
  const endsOn = endsOnFor(input)
  const unitLabel = input.durationUnit === 'years'
    ? input.durationValue === 1
      ? 'year'
      : 'years'
    : input.durationValue === 1
      ? 'month'
      : 'months'
  return `Pays for ${input.durationValue} ${unitLabel} · ${total} payment${total === 1 ? '' : 's'} · through ${formatYearMonth(endsOn)}`
}

const emptyForm = (): RecurringBillInput => ({
  name: '',
  amount: 0,
  category: CATEGORIES.bill[0],
  dueDay: 1,
  startsOn: toMonthInputValue(new Date()),
  durationValue: 12,
  durationUnit: 'months',
  notes: '',
  active: true,
})

function formFromBill(bill: RecurringBill): RecurringBillInput {
  return {
    name: bill.name,
    amount: bill.amount,
    category: bill.category,
    dueDay: bill.dueDay,
    startsOn: bill.startsOn,
    durationValue: bill.durationValue,
    durationUnit: bill.durationUnit,
    notes: bill.notes,
    active: bill.active,
  }
}

export function BillReminders({
  year,
  month,
  reminders,
  loading,
  error,
  onAdd,
  onUpdate,
  onDelete,
  onMarkPaid,
}: BillRemindersProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RecurringBill | null>(null)
  const [form, setForm] = useState<RecurringBillInput>(emptyForm)
  const [amountText, setAmountText] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)

  const needsAttention = reminders.filter(
    (r) => r.status === 'overdue' || r.status === 'due-soon',
  ).length

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setAmountText('')
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(bill: RecurringBill) {
    setEditing(bill)
    setForm(formFromBill(bill))
    setAmountText(String(bill.amount))
    setFormError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number.parseFloat(amountText)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter a valid amount greater than zero.')
      return
    }
    const dueDay = Number(form.dueDay)
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setFormError('Due day must be between 1 and 31.')
      return
    }
    const durationValue = Number(form.durationValue)
    if (!Number.isInteger(durationValue) || durationValue < 1) {
      setFormError('Enter how many months or years you need to pay.')
      return
    }

    setBusy(true)
    try {
      const payload: RecurringBillInput = {
        ...form,
        amount,
        dueDay,
        durationValue,
        name: form.name.trim(),
        notes: form.notes.trim(),
      }
      if (editing) {
        await onUpdate(editing.id, payload)
      } else {
        await onAdd(payload)
      }
      setEditing(null)
      setShowForm(false)
      setForm(emptyForm())
      setAmountText('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save bill.')
    } finally {
      setBusy(false)
    }
  }

  function cancelForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm())
    setAmountText('')
    setFormError(null)
  }

  async function handleMarkPaid(reminder: BillReminder) {
    setPayingId(reminder.bill.id)
    try {
      await onMarkPaid(reminder)
    } finally {
      setPayingId(null)
    }
  }

  const submitLabel = busy ? 'Saving…' : editing ? 'Save bill' : 'Add reminder'

  return (
    <section className="bill-reminders" aria-labelledby="reminders-heading">
      <div className="reminders-header">
        <div>
          <h2 id="reminders-heading">Monthly bill reminders</h2>
          <p className="reminders-sub">
            {needsAttention > 0
              ? `${needsAttention} bill${needsAttention === 1 ? '' : 's'} need attention this month`
              : 'Set due dates and how long you need to keep paying'}
          </p>
        </div>
        {!showForm && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            Add bill
          </button>
        )}
      </div>

      {error && (
        <p className="banner-error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form className="reminder-form" onSubmit={handleSubmit}>
          <h3>{editing ? 'Edit monthly bill' : 'New monthly bill'}</h3>
          <div className="form-row">
            <label>
              Name
              <input
                type="text"
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Meralco, Rent, Netflix"
              />
            </label>
            <label>
              Amount (₱)
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.bill.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due day each month
              <input
                type="number"
                min={1}
                max={31}
                required
                value={form.dueDay}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDay: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Starts
              <input
                type="month"
                required
                value={form.startsOn}
                onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
              />
            </label>
            <label>
              Pay for
              <div className="duration-fields">
                <input
                  type="number"
                  min={1}
                  max={600}
                  required
                  value={form.durationValue}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationValue: Number(e.target.value),
                    }))
                  }
                />
                <select
                  value={form.durationUnit}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationUnit: e.target.value as DurationUnit,
                    }))
                  }
                >
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </label>
          </div>
          <p className="schedule-hint">{scheduleSummary(form)}</p>
          <label>
            Notes <span className="optional-hint">(optional)</span>
            <input
              type="text"
              maxLength={160}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Account number, tips, etc."
            />
          </label>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={cancelForm} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {submitLabel}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading reminders…</p>
      ) : reminders.length === 0 ? (
        <p className="empty-state">
          No bills due in {monthLabel(year, month)}. Add a reminder with a start month and
          how long you need to pay (e.g. 12 months or 2 years).
        </p>
      ) : (
        <ul className="reminder-list">
          {reminders.map((reminder) => (
            <li key={reminder.bill.id} className={`reminder-item status-${reminder.status}`}>
              <div className="reminder-main">
                <div className="reminder-top">
                  <span className={`reminder-status status-${reminder.status}`}>
                    {statusLabel(reminder)}
                  </span>
                  <span className="tx-category">{reminder.bill.category}</span>
                </div>
                <p className="tx-desc">{reminder.bill.name}</p>
                <p className="reminder-due">
                  Due {formatDueDate(reminder.dueDate)} · Payment {reminder.paymentNumber} of{' '}
                  {reminder.totalPayments} · ends {formatYearMonth(reminder.endsOn)}
                  {reminder.bill.notes ? ` · ${reminder.bill.notes}` : ''}
                </p>
              </div>
              <div className="reminder-side">
                <strong className="tx-amount bill">{formatMoney(reminder.bill.amount)}</strong>
                <div className="tx-actions">
                  {reminder.status !== 'paid' && (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={payingId === reminder.bill.id}
                      onClick={() => void handleMarkPaid(reminder)}
                    >
                      {payingId === reminder.bill.id ? 'Saving…' : 'Mark paid'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openEdit(reminder.bill)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => {
                      if (window.confirm(`Remove reminder for “${reminder.bill.name}”?`)) {
                        void onDelete(reminder.bill.id)
                      }
                    }}
                  >
                    Remove
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
