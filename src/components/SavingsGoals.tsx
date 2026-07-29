import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Check, MapPinned, PiggyBank, Plus } from 'lucide-react'
import { formatMoney } from '../lib/format'
import { fileToFirestoreImageDataUrl } from '../lib/imageData'
import type {
  SavingsGoal,
  SavingsGoalInput,
  SavingsJourney,
} from '../types/savingsGoal'
import { LoadingState } from './LoadingState'

interface SavingsGoalsProps {
  journey: SavingsJourney
  loading: boolean
  error: string | null
  onAdd: (input: SavingsGoalInput) => Promise<void>
  onUpdate: (id: string, input: SavingsGoalInput) => Promise<void>
  onContribute: (amount: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const emptyForm = (): SavingsGoalInput => ({
  name: '',
  targetAmount: 0,
  notes: '',
  imageDataUrl: null,
})

function formFromGoal(goal: SavingsGoal): SavingsGoalInput {
  return {
    name: goal.name,
    targetAmount: goal.targetAmount,
    notes: goal.notes,
    imageDataUrl: goal.imageDataUrl,
  }
}

export function SavingsGoals({
  journey,
  loading,
  error,
  onAdd,
  onUpdate,
  onContribute,
  onDelete,
}: SavingsGoalsProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SavingsGoal | null>(null)
  const [form, setForm] = useState<SavingsGoalInput>(emptyForm)
  const [targetText, setTargetText] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)

  const [showContribute, setShowContribute] = useState(false)
  const [contributeText, setContributeText] = useState('')
  const [contributeError, setContributeError] = useState<string | null>(null)
  const [contributeBusy, setContributeBusy] = useState(false)

  const reachedCount = journey.stops.filter((stop) => stop.reached).length

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setTargetText('')
    setFormError(null)
    setShowForm(true)
    setShowContribute(false)
  }

  function openEdit(goal: SavingsGoal) {
    setEditing(goal)
    setForm(formFromGoal(goal))
    setTargetText(String(goal.targetAmount))
    setFormError(null)
    setShowForm(true)
    setShowContribute(false)
  }

  function cancelForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm())
    setTargetText('')
    setFormError(null)
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setFormError(null)
    setImageBusy(true)
    try {
      const imageDataUrl = await fileToFirestoreImageDataUrl(file)
      setForm((prev) => ({ ...prev, imageDataUrl }))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not load image.')
    } finally {
      setImageBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const targetAmount = Number.parseFloat(targetText)
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setFormError('Enter a price greater than zero.')
      return
    }

    setBusy(true)
    try {
      const payload: SavingsGoalInput = {
        name: form.name.trim(),
        targetAmount,
        notes: form.notes.trim(),
        imageDataUrl: form.imageDataUrl,
      }
      if (editing) {
        await onUpdate(editing.id, payload)
      } else {
        await onAdd(payload)
      }
      cancelForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save goal.')
    } finally {
      setBusy(false)
    }
  }

  function openContribute() {
    setShowContribute(true)
    setContributeText('')
    setContributeError(null)
    setShowForm(false)
  }

  function cancelContribute() {
    setShowContribute(false)
    setContributeText('')
    setContributeError(null)
  }

  async function handleContribute(e: FormEvent) {
    e.preventDefault()
    setContributeError(null)
    const amount = Number.parseFloat(contributeText)
    if (!Number.isFinite(amount) || amount <= 0) {
      setContributeError('Enter an amount greater than zero.')
      return
    }

    setContributeBusy(true)
    try {
      await onContribute(amount)
      cancelContribute()
    } catch (err) {
      setContributeError(
        err instanceof Error ? err.message : 'Could not update savings.',
      )
    } finally {
      setContributeBusy(false)
    }
  }

  async function handleDelete(goal: SavingsGoal) {
    if (!window.confirm(`Remove “${goal.name}” from the savings track?`)) return
    await onDelete(goal.id)
  }

  const submitLabel = busy ? 'Saving…' : editing ? 'Save stop' : 'Add stop'

  return (
    <section className="savings-goals" aria-labelledby="savings-heading">
      <div className="reminders-header">
        <div>
          <h2 id="savings-heading" className="section-title">
            <MapPinned className="section-icon" aria-hidden="true" />
            Savings track
          </h2>
          <p className="reminders-sub">
            {journey.stops.length === 0
              ? 'Add wish-list stops — the priciest item sets the end of the bar'
              : `${formatMoney(journey.savedAmount)} saved · ${reachedCount}/${journey.stops.length} stops reached`}
          </p>
        </div>
        <div className="savings-header-actions">
          {!showContribute && (
            <button type="button" className="btn-ghost btn-with-icon" onClick={openContribute}>
              <PiggyBank aria-hidden="true" />
              Add to pot
            </button>
          )}
          {!showForm && (
            <button type="button" className="btn-primary btn-with-icon" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Add stop
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="banner-error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form className="reminder-form" onSubmit={handleSubmit}>
          <h3>{editing ? 'Edit stop' : 'New stop on the track'}</h3>
          <label>
            What do you want?
            <input
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Phone, laptop, motorcycle…"
            />
          </label>
          <label>
            Price
            <input
              inputMode="decimal"
              required
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder="25000"
            />
          </label>
          <label>
            Notes <span className="optional-hint">(optional)</span>
            <input
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Color, model, tip…"
            />
          </label>
          <div className="savings-image-field">
            <span className="savings-image-label">
              Photo <span className="optional-hint">(optional, stored in Firestore)</span>
            </span>
            {form.imageDataUrl ? (
              <div className="savings-image-preview">
                <img src={form.imageDataUrl} alt="" />
                <button
                  type="button"
                  className="link-btn danger"
                  onClick={() => setForm((prev) => ({ ...prev, imageDataUrl: null }))}
                  disabled={busy || imageBusy}
                >
                  Remove photo
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  void handleImageChange(e)
                }}
                disabled={busy || imageBusy}
              />
            )}
            {imageBusy && <p className="muted">Compressing photo…</p>}
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={cancelForm} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || imageBusy}>
              {submitLabel}
            </button>
          </div>
        </form>
      )}

      {showContribute && (
        <form className="reminder-form" onSubmit={handleContribute}>
          <h3>Add to savings pot</h3>
          <p className="reminders-sub">
            Creates a savings transaction and lowers your running balance. Delete that
            transaction later to put the money back.
          </p>
          <label>
            Amount
            <input
              inputMode="decimal"
              autoFocus
              value={contributeText}
              onChange={(e) => setContributeText(e.target.value)}
              placeholder="e.g. 500"
            />
          </label>
          {contributeError && (
            <p className="form-error" role="alert">
              {contributeError}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={cancelContribute}
              disabled={contributeBusy}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={contributeBusy}>
              {contributeBusy ? 'Updating…' : 'Add to pot'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingState variant="section" label="Loading savings track…" />
      ) : journey.stops.length === 0 ? (
        <p className="empty-state">
          No stops yet. Add a phone, laptop, or motorcycle — the most expensive one becomes the
          finish line.
        </p>
      ) : (
        <>
            <div className="savings-track-summary">
            <div>
              <span className="stat-label">Saved</span>
              <strong className="stat-value">{formatMoney(journey.savedAmount)}</strong>
            </div>
            <div>
              <span className="stat-label">Track limit</span>
              <strong className="stat-value">{formatMoney(journey.limit)}</strong>
            </div>
            <div>
              <span className="stat-label">
                {journey.nextStop ? 'Next stop' : 'Status'}
              </span>
              <strong className="stat-value">
                {journey.nextStop
                  ? `${journey.nextStop.goal.name} · ${formatMoney(journey.nextStop.goal.targetAmount)}`
                  : 'All stops reached'}
              </strong>
            </div>
          </div>

          <div
            className="savings-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(journey.percent)}
            aria-label={`Savings track ${Math.round(journey.percent)} percent toward ${formatMoney(journey.limit)}`}
          >
            <div className="savings-track-lane">
              <div className="savings-track-rail">
                <div className="savings-track-bar">
                  <div
                    className="savings-track-fill"
                    style={{ width: `${journey.percent}%` }}
                  />
                </div>

                {journey.stops.map((stop) => (
                  <div
                    key={stop.goal.id}
                    className={[
                      'savings-stop',
                      `savings-stop--${stop.placement}`,
                      stop.reached ? 'reached' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      left: `calc(${stop.positionPercent / 100} * (100% - 0.85rem) + 0.425rem)`,
                    }}
                  >
                    <span className="savings-stop-dot" aria-hidden="true" />
                    <span className="savings-stop-stem" aria-hidden="true" />
                    <div className="savings-stop-bubble">
                      {stop.goal.imageDataUrl && (
                        <img
                          className="savings-stop-thumb"
                          src={stop.goal.imageDataUrl}
                          alt=""
                        />
                      )}
                      <span className="savings-stop-name">{stop.goal.name}</span>
                      <span className="savings-stop-price">
                        {formatMoney(stop.goal.targetAmount)}
                      </span>
                      {stop.reached && (
                        <span className="savings-stop-check" aria-hidden="true">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                <div className="savings-track-ends">
                  <span>{formatMoney(0)}</span>
                  <span>{formatMoney(journey.limit)}</span>
                </div>
              </div>
            </div>
          </div>

          {journey.remainingToLimit > 0 && (
            <p className="savings-meta">
              {formatMoney(journey.remainingToLimit)} left to reach the finish line
              {journey.nextStop
                ? ` · ${formatMoney(Math.max(0, journey.nextStop.goal.targetAmount - journey.savedAmount))} to unlock ${journey.nextStop.goal.name}`
                : ''}
            </p>
          )}

          <ul className="savings-manage-list">
            {journey.stops.map((stop) => (
              <li key={stop.goal.id} className={stop.reached ? 'reached' : ''}>
                <div className="savings-manage-main">
                  {stop.goal.imageDataUrl && (
                    <img
                      className="savings-manage-thumb"
                      src={stop.goal.imageDataUrl}
                      alt=""
                    />
                  )}
                  <div>
                    <p className="tx-desc">
                      {stop.reached ? (
                        <Check className="inline-check" aria-hidden="true" />
                      ) : null}
                      {stop.goal.name}
                    </p>
                    <p className="reminder-due">
                      {formatMoney(stop.goal.targetAmount)}
                      {stop.goal.notes.trim() ? ` · ${stop.goal.notes}` : ''}
                    </p>
                  </div>
                </div>
                <div className="tx-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openEdit(stop.goal)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => {
                      void handleDelete(stop.goal)
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
