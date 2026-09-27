import { useRef, useState, type SubmitEvent } from 'react'
import { Check, Handshake, Plus, Pencil, Trash2 } from 'lucide-react'
import { formatMoney } from '../lib/format'
import {
  FREQUENCY_LABELS,
  type Paluwagan,
  type PaluwaganFrequency,
  type PaluwaganInput,
} from '../types/paluwagan'
import {
  markContribution,
  summarizePaluwagan,
} from '../services/paluwagan'
import { LoadingState } from './LoadingState'

interface PaluwaganSectionProps {
  circles: Paluwagan[]
  loading: boolean
  error: string | null
  onAdd: (input: PaluwaganInput) => Promise<void>
  onUpdate: (id: string, input: PaluwaganInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSetContributions: (id: string, contributions: Record<string, number[]>) => Promise<void>
}

interface MemberDraft {
  name: string
}

function todayInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function emptyForm(): {
  name: string
  contributionAmount: string
  frequency: PaluwaganFrequency
  startDate: string
  notes: string
  members: MemberDraft[]
} {
  return {
    name: '',
    contributionAmount: '',
    frequency: 'monthly',
    startDate: todayInput(),
    notes: '',
    members: [{ name: '' }, { name: '' }],
  }
}

function formFromCircle(circle: Paluwagan) {
  return {
    name: circle.name,
    contributionAmount: String(circle.contributionAmount),
    frequency: circle.frequency,
    startDate: circle.startDate,
    notes: circle.notes,
    members: [...circle.members]
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ name: m.name })),
  }
}

function formatDue(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function PaluwaganSection({
  circles,
  loading,
  error,
  onAdd,
  onUpdate,
  onDelete,
  onSetContributions,
}: Readonly<PaluwaganSectionProps>) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Paluwagan | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const addTriggerRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  function openCreate() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(circle: Paluwagan) {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditing(circle)
    setForm(formFromCircle(circle))
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    requestAnimationFrame(() => {
      const target = returnFocusRef.current ?? addTriggerRef.current
      target?.focus()
      returnFocusRef.current = null
    })
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const amount = Number.parseFloat(form.contributionAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter a contribution amount greater than zero.')
      return
    }
    const members = form.members
      .map((m) => m.name.trim())
      .filter(Boolean)
      .map((name, order) => ({ name, order }))
    if (members.length < 2) {
      setFormError('Add at least two members.')
      return
    }

    const payload: PaluwaganInput = {
      name: form.name.trim(),
      contributionAmount: amount,
      frequency: form.frequency,
      startDate: form.startDate,
      members,
      notes: form.notes.trim(),
      contributions: editing?.contributions ?? {},
      active: editing?.active ?? true,
    }

    setBusy(true)
    try {
      if (editing) await onUpdate(editing.id, payload)
      else await onAdd(payload)
      closeForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save paluwagan.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(circle: Paluwagan) {
    if (!window.confirm(`Delete “${circle.name}”? This cannot be undone.`)) return
    setActionId(circle.id)
    try {
      await onDelete(circle.id)
    } finally {
      setActionId(null)
    }
  }

  async function togglePaid(circle: Paluwagan, memberId: string) {
    const summary = summarizePaluwagan(circle)
    const paid = (circle.contributions[memberId] ?? []).includes(summary.currentRound)
    const next = markContribution(circle, memberId, summary.currentRound, !paid)
    setActionId(`${circle.id}:${memberId}`)
    try {
      await onSetContributions(circle.id, next.contributions)
    } finally {
      setActionId(null)
    }
  }

  const activeCircles = circles.filter((c) => c.active)

  return (
    <section id="paluwagan" className="paluwagan-section" aria-labelledby="paluwagan-heading">
      <div className="reminders-header">
        <div>
          <h2 id="paluwagan-heading" tabIndex={-1} className="section-title">
            <Handshake className="section-icon" aria-hidden="true" />
            Paluwagan
          </h2>
          <p className="reminders-sub">
            Track rotating savings circles — who pays, who receives, and what is due next.
          </p>
        </div>
        {!showForm && (
          <button
            ref={addTriggerRef}
            type="button"
            className="btn-primary btn-with-icon"
            onClick={openCreate}
          >
            <Plus aria-hidden="true" />
            New circle
          </button>
        )}
      </div>

      {error && (
        <p className="banner-error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form className="reminder-form paluwagan-form" onSubmit={handleSubmit}>
          <h3>{editing ? 'Edit paluwagan' : 'New paluwagan'}</h3>
          <div className="form-row">
            <label>
              Name
              <input
                type="text"
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Office lunch pot"
              />
            </label>
            <label>
              Contribution (₱)
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                value={form.contributionAmount}
                onChange={(e) => setForm((f) => ({ ...f, contributionAmount: e.target.value }))}
                placeholder="1000"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Frequency
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, frequency: e.target.value as PaluwaganFrequency }))
                }
              >
                {(Object.keys(FREQUENCY_LABELS) as PaluwaganFrequency[]).map((key) => (
                  <option key={key} value={key}>
                    {FREQUENCY_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
          </div>
          <div className="paluwagan-members-edit">
            <p className="biller-presets__label">Members (payout order)</p>
            {form.members.map((member, index) => (
              <div key={index} className="paluwagan-member-row">
                <span className="paluwagan-member-order">{index + 1}</span>
                <input
                  type="text"
                  required={index < 2}
                  maxLength={60}
                  value={member.name}
                  onChange={(e) =>
                    setForm((f) => {
                      const members = [...f.members]
                      members[index] = { name: e.target.value }
                      return { ...f, members }
                    })
                  }
                  placeholder={`Member ${index + 1}`}
                />
                {form.members.length > 2 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove member ${index + 1}`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        members: f.members.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setForm((f) => ({ ...f, members: [...f.members, { name: '' }] }))}
            >
              Add member
            </button>
          </div>
          <label>
            Notes <span className="optional-hint">(optional)</span>
            <input
              type="text"
              maxLength={160}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="GCash group, rules, etc."
            />
          </label>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={closeForm} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {editing ? 'Save changes' : 'Create circle'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingState variant="section" label="Loading paluwagan…" />
      ) : activeCircles.length === 0 && !showForm ? (
        <p className="empty-state">
          No circles yet. Start one to track contributions and payout order.
        </p>
      ) : (
        <div className="paluwagan-list">
          {activeCircles.map((circle) => {
            const summary = summarizePaluwagan(circle)
            return (
              <article key={circle.id} className="paluwagan-card">
                <header className="paluwagan-card__header">
                  <div>
                    <h3>{circle.name}</h3>
                    <p>
                      {FREQUENCY_LABELS[circle.frequency]} · {formatMoney(circle.contributionAmount)}{' '}
                      each · pot {formatMoney(summary.potSize)}
                    </p>
                  </div>
                  <div className="paluwagan-card__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Edit ${circle.name}`}
                      onClick={() => openEdit(circle)}
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Delete ${circle.name}`}
                      disabled={actionId === circle.id}
                      onClick={() => void handleDelete(circle)}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                </header>
                <dl className="paluwagan-card__stats">
                  <div>
                    <dt>Round</dt>
                    <dd>
                      {summary.currentRound + 1} / {summary.totalRounds}
                    </dd>
                  </div>
                  <div>
                    <dt>Receives</dt>
                    <dd>{summary.nextRecipient?.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd>{formatDue(summary.nextDueDate)}</dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>
                      {summary.paidThisRound}/{circle.members.length}
                    </dd>
                  </div>
                </dl>
                <ul className="paluwagan-member-list">
                  {[...circle.members]
                    .sort((a, b) => a.order - b.order)
                    .map((member) => {
                      const paid = (circle.contributions[member.id] ?? []).includes(
                        summary.currentRound,
                      )
                      const isRecipient = summary.nextRecipient?.id === member.id
                      return (
                        <li key={member.id} className={isRecipient ? 'recipient' : ''}>
                          <div>
                            <span>
                              {member.order + 1}. {member.name}
                            </span>
                            {isRecipient && <small>Receives this round</small>}
                          </div>
                          <button
                            type="button"
                            className={`btn-ghost paluwagan-paid-btn${paid ? ' paid' : ''}`}
                            disabled={actionId === `${circle.id}:${member.id}`}
                            onClick={() => void togglePaid(circle, member.id)}
                          >
                            {paid ? (
                              <>
                                <Check aria-hidden="true" size={14} /> Paid
                              </>
                            ) : (
                              'Mark paid'
                            )}
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
