import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CreditCard as CreditCardIcon, Pencil } from 'lucide-react'
import {
  CARD_COLORS,
  type CreditCard,
  type CreditCardInput,
} from '../types/creditCard'

const COLOR_NAMES = [
  'Blue',
  'Teal',
  'Green',
  'Amber',
  'Violet',
  'Pink',
  'Cyan',
  'Lime',
  'Orange',
  'Gray',
]

interface CreditCardFormProps {
  editing: CreditCard | null
  onSubmit: (input: CreditCardInput) => Promise<void>
  onCancelEdit: () => void
}

interface FieldErrors {
  name?: string
  lastFour?: string
  limit?: string
  dueDayOffset?: string
  apr?: string
  gracePeriodDays?: string
}

function createInitialState(editing: CreditCard | null): CreditCardInput {
  if (editing) {
    return {
      name: editing.name,
      lastFour: editing.lastFour,
      limit: editing.limit,
      statementDay: editing.statementDay,
      dueDayOffset: editing.dueDayOffset,
      color: editing.color ?? CARD_COLORS[0],
      active: editing.active,
      apr: editing.apr,
      interestCalculationMethod: editing.interestCalculationMethod,
      gracePeriodDays: editing.gracePeriodDays,
    }
  }

  return {
    name: '',
    lastFour: '',
    limit: 50000,
    statementDay: 15,
    dueDayOffset: 21,
    color: CARD_COLORS[0],
    active: true,
    apr: undefined,
    interestCalculationMethod: 'daily',
    gracePeriodDays: 21,
  }
}

function ordinal(day: number): string {
  if (day === 1 || day === 21) return `${day}st`
  if (day === 2 || day === 22) return `${day}nd`
  if (day === 3 || day === 23) return `${day}rd`
  return `${day}th`
}

export function CreditCardForm({
  editing,
  onSubmit,
  onCancelEdit,
}: CreditCardFormProps) {
  const initial = createInitialState(editing)
  const [name, setName] = useState(initial.name)
  const [lastFour, setLastFour] = useState(initial.lastFour)
  const [limit, setLimit] = useState(String(initial.limit))
  const [statementDay, setStatementDay] = useState(String(initial.statementDay))
  const [dueDayOffset, setDueDayOffset] = useState(String(initial.dueDayOffset))
  const [color, setColor] = useState(initial.color ?? CARD_COLORS[0])
  const [active, setActive] = useState(initial.active ?? true)
  const [apr, setApr] = useState(initial.apr !== undefined ? String(initial.apr) : '')
  const [interestCalculationMethod, setInterestCalculationMethod] = useState(initial.interestCalculationMethod ?? 'daily')
  const [gracePeriodDays, setGracePeriodDays] = useState(initial.gracePeriodDays !== undefined ? String(initial.gracePeriodDays) : '21')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const lastFourRef = useRef<HTMLInputElement>(null)
  const limitRef = useRef<HTMLInputElement>(null)
  const dueDayOffsetRef = useRef<HTMLInputElement>(null)
  const aprRef = useRef<HTMLInputElement>(null)
  const gracePeriodDaysRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => nameRef.current?.focus())
  }, [])

  function focusFirstError(nextErrors: FieldErrors) {
    if (nextErrors.name) {
      nameRef.current?.focus()
    } else if (nextErrors.lastFour) {
      lastFourRef.current?.focus()
    } else if (nextErrors.limit) {
      limitRef.current?.focus()
    } else if (nextErrors.dueDayOffset) {
      dueDayOffsetRef.current?.focus()
    } else if (nextErrors.apr) {
      aprRef.current?.focus()
    } else if (nextErrors.gracePeriodDays) {
      gracePeriodDaysRef.current?.focus()
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrors({})

    const parsedLimit = Number.parseFloat(limit)
    const parsedStatementDay = Number.parseInt(statementDay, 10)
    const parsedDueDayOffset = Number.parseInt(dueDayOffset, 10)
    const parsedApr = apr ? Number.parseFloat(apr) : undefined
    const parsedGracePeriodDays = gracePeriodDays ? Number.parseInt(gracePeriodDays, 10) : undefined
    const nextErrors: FieldErrors = {}

    if (!name.trim()) {
      nextErrors.name = 'Card name is required.'
    }
    if (!/^\d{4}$/.test(lastFour)) {
      nextErrors.lastFour = 'Enter exactly 4 numbers.'
    }
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      nextErrors.limit = 'Enter a credit limit greater than zero.'
    }
    if (
      !Number.isInteger(parsedDueDayOffset) ||
      parsedDueDayOffset < 1 ||
      parsedDueDayOffset > 31
    ) {
      nextErrors.dueDayOffset = 'Enter a whole number from 1 to 31.'
    }
    if (parsedApr !== undefined && (!Number.isFinite(parsedApr) || parsedApr < 0 || parsedApr > 100)) {
      nextErrors.apr = 'APR must be between 0 and 100.'
    }
    if (parsedGracePeriodDays !== undefined && (!Number.isInteger(parsedGracePeriodDays) || parsedGracePeriodDays < 0 || parsedGracePeriodDays > 60)) {
      nextErrors.gracePeriodDays = 'Grace period must be between 0 and 60.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      focusFirstError(nextErrors)
      return
    }

    setBusy(true)
    try {
      await onSubmit({
        name,
        lastFour,
        limit: parsedLimit,
        statementDay: parsedStatementDay,
        dueDayOffset: parsedDueDayOffset,
        color,
        active,
        apr: parsedApr,
        interestCalculationMethod,
        gracePeriodDays: parsedGracePeriodDays,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save credit card.')
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = busy
    ? 'Saving…'
    : editing
      ? 'Save changes'
      : 'Add card'

  return (
    <section className="cc-form-section" aria-labelledby="cc-form-heading">
      <h3 id="cc-form-heading" tabIndex={-1} className="cc-form-heading">
        {editing ? (
          <Pencil className="section-icon" aria-hidden="true" />
        ) : (
          <CreditCardIcon className="section-icon" aria-hidden="true" />
        )}
        {editing ? 'Edit credit card' : 'Add credit card'}
      </h3>

      <form className="tx-form cc-form" onSubmit={handleSubmit} noValidate>
        <div className="form-row">
          <label>
            Card name
            <input
              ref={nameRef}
              type="text"
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BPI Mastercard"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'cc-form-error-name' : undefined}
            />
            {errors.name && (
              <span id="cc-form-error-name" className="field-error" role="alert">
                {errors.name}
              </span>
            )}
          </label>
          <label>
            Last 4 digits
            <input
              ref={lastFourRef}
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              required
              maxLength={4}
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              aria-invalid={errors.lastFour ? true : undefined}
              aria-describedby={errors.lastFour ? 'cc-form-error-last-four' : undefined}
            />
            {errors.lastFour && (
              <span id="cc-form-error-last-four" className="field-error" role="alert">
                {errors.lastFour}
              </span>
            )}
          </label>
        </div>

        <div className="form-row">
          <label>
            Credit limit (₱)
            <input
              ref={limitRef}
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              required
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="50000"
              aria-invalid={errors.limit ? true : undefined}
              aria-describedby={errors.limit ? 'cc-form-error-limit' : undefined}
            />
            {errors.limit && (
              <span id="cc-form-error-limit" className="field-error" role="alert">
                {errors.limit}
              </span>
            )}
          </label>
          <label>
            Statement day
            <select
              value={statementDay}
              onChange={(e) => setStatementDay(e.target.value)}
              aria-label="Statement day"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {ordinal(day)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            Due day offset
            <input
              ref={dueDayOffsetRef}
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              step="1"
              required
              value={dueDayOffset}
              onChange={(e) => setDueDayOffset(e.target.value)}
              placeholder="21"
              aria-invalid={errors.dueDayOffset ? true : undefined}
              aria-describedby={
                errors.dueDayOffset
                  ? 'cc-form-error-due-day-offset'
                  : 'cc-form-hint-due-day-offset'
              }
            />
            <span id="cc-form-hint-due-day-offset" className="field-hint">
              Days after the statement date
            </span>
            {errors.dueDayOffset && (
              <span id="cc-form-error-due-day-offset" className="field-error" role="alert">
                {errors.dueDayOffset}
              </span>
            )}
          </label>
          <label>
            APR (%)
            <input
              ref={aprRef}
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={apr}
              onChange={(e) => setApr(e.target.value)}
              placeholder="3.5"
              aria-invalid={errors.apr ? true : undefined}
              aria-describedby={errors.apr ? 'cc-form-error-apr' : 'cc-form-hint-apr'}
            />
            <span id="cc-form-hint-apr" className="field-hint">
              Annual percentage rate (optional)
            </span>
            {errors.apr && (
              <span id="cc-form-error-apr" className="field-error" role="alert">
                {errors.apr}
              </span>
            )}
          </label>
        </div>

        <div className="form-row">
          <label>
            Interest method
            <select
              value={interestCalculationMethod}
              onChange={(e) => setInterestCalculationMethod(e.target.value as 'daily' | 'monthly')}
              aria-label="Interest calculation method"
            >
              <option value="daily">Daily balance</option>
              <option value="monthly">Monthly balance</option>
            </select>
          </label>
          <label>
            Grace period (days)
            <input
              ref={gracePeriodDaysRef}
              type="number"
              inputMode="numeric"
              min="0"
              max="60"
              step="1"
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(e.target.value)}
              placeholder="21"
              aria-invalid={errors.gracePeriodDays ? true : undefined}
              aria-describedby={errors.gracePeriodDays ? 'cc-form-error-grace-period' : 'cc-form-hint-grace-period'}
            />
            <span id="cc-form-hint-grace-period" className="field-hint">
              Days after due date before interest accrues
            </span>
            {errors.gracePeriodDays && (
              <span id="cc-form-error-grace-period" className="field-error" role="alert">
                {errors.gracePeriodDays}
              </span>
            )}
          </label>
        </div>

        <div className="form-row">
          <fieldset className="cc-color-field">
            <legend>Card color</legend>
            <div className="color-options">
              {CARD_COLORS.map((c, index) => (
                <label key={c} className={`color-option ${color === c ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="credit-card-color"
                    value={c}
                    checked={color === c}
                    onChange={() => setColor(c)}
                  />
                  <span className="color-swatch" style={{ backgroundColor: c }} aria-hidden="true" />
                  <span className="color-name">{COLOR_NAMES[index] ?? c}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>Active card</span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onCancelEdit} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </section>
  )
}
