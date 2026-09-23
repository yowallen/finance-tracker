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
  minimumPaymentOverride?: string
  cashbackRate?: string
}

type RewardPreset = {
  id: string
  label: string
  cashbackCap?: number
  cashbackMinSpend: number
  cashbackUsesFullThousandBlocks?: boolean
  cashbackRulesText: string
}

const REWARD_PRESETS: RewardPreset[] = [
  {
    id: 'custom',
    label: 'Custom',
    cashbackCap: undefined,
    cashbackMinSpend: 1000,
    cashbackRulesText: '*=0.3%',
  },
  {
    id: 'bpi-amore-classic',
    label: 'BPI Amore Cashback Classic',
    cashbackCap: 15000,
    cashbackMinSpend: 1000,
    cashbackUsesFullThousandBlocks: true,
    cashbackRulesText: 'Groceries=4%; Shopping=4%; Utilities=1%; Health=1%; *=0.3%',
  },
  {
    id: 'bpi-amore-plus',
    label: 'BPI Amore Cashback Plus',
    cashbackCap: 5000,
    cashbackMinSpend: 1000,
    cashbackRulesText: 'Groceries=1.5%; Dining=1%; Shopping=0.5%; *=0.3%',
  },
  {
    id: 'generic-cashback',
    label: 'General cashback card',
    cashbackCap: 2500,
    cashbackMinSpend: 1000,
    cashbackRulesText: '*=1%',
  },
]

function createInitialState(editing: CreditCard | null): CreditCardInput {
  if (editing) {
    const dueDayOffset = editing.dueDayOffset ?? (() => {
      if (editing.dueDay === undefined) return 21
      const statementDate = new Date(2026, 0, editing.statementDay)
      const dueDate = new Date(2026, editing.dueDay <= editing.statementDay ? 1 : 0, editing.dueDay)
      return Math.round((dueDate.getTime() - statementDate.getTime()) / (1000 * 60 * 60 * 24))
    })()

    return {
      name: editing.name,
      lastFour: editing.lastFour,
      limit: editing.limit,
      statementDay: editing.statementDay,
      dueDayOffset,
      color: editing.color ?? CARD_COLORS[0],
      active: editing.active,
      apr: editing.apr,
      interestCalculationMethod: editing.interestCalculationMethod,
      gracePeriodDays: editing.gracePeriodDays,
      minimumPaymentOverride: editing.minimumPaymentOverride,
      cashbackCap: editing.cashbackCap,
      cashbackUsesFullThousandBlocks: editing.cashbackUsesFullThousandBlocks,
      cashbackStartingBalance: editing.cashbackStartingBalance ?? 0,
      cashbackMinSpend: editing.cashbackMinSpend ?? 1000,
      cashbackRules: editing.cashbackRules ?? [{ rate: 1, categories: ['Groceries'] }, { rate: 0.3, categories: ['*'] }],
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
    cashbackCap: 3000,
    cashbackMinSpend: 1000,
    cashbackUsesFullThousandBlocks: false,
    cashbackRules: [{ rate: 1, categories: ['Groceries'] }, { rate: 0.3, categories: ['*'] }],
  }
}

function ordinal(day: number): string {
  if (day === 1 || day === 21) return `${day}st`
  if (day === 2 || day === 22) return `${day}nd`
  if (day === 3 || day === 23) return `${day}rd`
  return `${day}th`
}

function summarizeCashbackRules(raw: string): string[] {
  if (!raw.trim()) {
    return []
  }

  return raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+?)(?:\s*[:=]\s*|\s+)(\d+(?:\.\d+)?)\s*%?$/i)
      if (!match) {
        return null
      }

      const category = match[1].trim()
      const rate = Number.parseFloat(match[2])
      if (!category || Number.isNaN(rate) || rate < 0 || rate > 100) {
        return null
      }

      const label = category === '*' || category.toLowerCase() === 'all' || category.toLowerCase() === 'all other eligible spend'
        ? 'All other eligible spend'
        : category

      const formattedRate = Number.isInteger(rate) ? `${rate}` : rate.toFixed(1).replace(/\.0$/, '')
      return `${label}: ${formattedRate}%`
    })
    .filter((item): item is string => item !== null)
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
  const [minimumPaymentOverride, setMinimumPaymentOverride] = useState(initial.minimumPaymentOverride !== undefined ? String(initial.minimumPaymentOverride) : '')
  const [cashbackCap, setCashbackCap] = useState(initial.cashbackCap !== undefined ? String(initial.cashbackCap) : '')
  const [cashbackStartingBalance, setCashbackStartingBalance] = useState(initial.cashbackStartingBalance !== undefined ? String(initial.cashbackStartingBalance) : '0')
  const [cashbackMinSpend, setCashbackMinSpend] = useState(initial.cashbackMinSpend !== undefined ? String(initial.cashbackMinSpend) : '1000')
  const [cashbackUsesFullThousandBlocks, setCashbackUsesFullThousandBlocks] = useState(
    initial.cashbackUsesFullThousandBlocks ?? false,
  )
  const [cashbackRulesText, setCashbackRulesText] = useState(
    (initial.cashbackRules ?? [{ rate: 1, categories: ['Groceries'] }, { rate: 0.3, categories: ['*'] }])
      .map((rule) => {
        const categories = rule.categories ?? []
        const categoryText = categories.length > 0 ? categories.join(', ') : '*'
        return `${categoryText}=${rule.rate}%`
      })
      .join('; '),
  )
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    const match = REWARD_PRESETS.find((preset) => {
      if (preset.id === 'custom') return false
      return (preset.cashbackCap ?? 0) === (initial.cashbackCap ?? 0)
        && (preset.cashbackMinSpend ?? 0) === (initial.cashbackMinSpend ?? 0)
        && Boolean(preset.cashbackUsesFullThousandBlocks) === Boolean(initial.cashbackUsesFullThousandBlocks)
    })
    return match?.id ?? 'custom'
  })
  const cashbackRuleSummary = summarizeCashbackRules(cashbackRulesText)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const lastFourRef = useRef<HTMLInputElement>(null)
  const limitRef = useRef<HTMLInputElement>(null)
  const dueDayRef = useRef<HTMLInputElement>(null)
  const aprRef = useRef<HTMLInputElement>(null)
  const gracePeriodDaysRef = useRef<HTMLInputElement>(null)
  const minimumPaymentOverrideRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => nameRef.current?.focus())
  }, [])

  function applyRewardPreset(presetId: string) {
    const preset = REWARD_PRESETS.find((item) => item.id === presetId)
    if (!preset) {
      setSelectedPreset('custom')
      return
    }

    setSelectedPreset(preset.id)
    setCashbackCap(preset.cashbackCap !== undefined ? String(preset.cashbackCap) : '')
    setCashbackMinSpend(String(preset.cashbackMinSpend))
    setCashbackUsesFullThousandBlocks(Boolean(preset.cashbackUsesFullThousandBlocks))
    setCashbackRulesText(preset.cashbackRulesText)
  }

  function focusFirstError(nextErrors: FieldErrors) {
    if (nextErrors.name) {
      nameRef.current?.focus()
    } else if (nextErrors.lastFour) {
      lastFourRef.current?.focus()
    } else if (nextErrors.limit) {
      limitRef.current?.focus()
    } else if (nextErrors.dueDayOffset) {
      dueDayRef.current?.focus()
    } else if (nextErrors.apr) {
      aprRef.current?.focus()
    } else if (nextErrors.gracePeriodDays) {
      gracePeriodDaysRef.current?.focus()
    } else if (nextErrors.minimumPaymentOverride) {
      minimumPaymentOverrideRef.current?.focus()
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrors({})

    const parsedLimit = Number.parseFloat(limit)
    const parsedStatementDay = Number.parseInt(statementDay, 10)
    const parsedDueDayOffset = Number.parseInt(dueDayOffset, 10)
    const parsedApr = apr.trim() !== '' ? Number.parseFloat(apr) : undefined
    const parsedGracePeriodDays = gracePeriodDays.trim() !== '' ? Number.parseInt(gracePeriodDays, 10) : undefined
    const parsedMinimumPaymentOverride = minimumPaymentOverride.trim() !== '' ? Number.parseFloat(minimumPaymentOverride) : undefined
    const parsedCashbackCap = cashbackCap.trim() !== '' ? Number.parseFloat(cashbackCap) : undefined
    const parsedCashbackStartingBalance = cashbackStartingBalance.trim() !== '' ? Number.parseFloat(cashbackStartingBalance) : 0
    const parsedCashbackMinSpend = cashbackMinSpend.trim() !== '' ? Number.parseFloat(cashbackMinSpend) : 1000
    const parsedCashbackRules = cashbackRulesText
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(/^(.+?)(?:\s*[:=]\s*|\s+)(\d+(?:\.\d+)?)\s*%?$/i)
        if (!match) {
          throw new Error('Cashback rules must look like "Groceries=1%; *=0.3%".')
        }

        const category = match[1].trim()
        const rate = Number.parseFloat(match[2])
        if (!category || Number.isNaN(rate) || rate < 0 || rate > 100) {
          throw new Error('Cashback rules must have valid category names and percentages.')
        }

        return {
          rate,
          categories: [category],
        }
      })
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
      parsedDueDayOffset > 60
    ) {
      nextErrors.dueDayOffset = 'Enter a whole number from 1 to 60.'
    }
    if (parsedApr !== undefined && (!Number.isFinite(parsedApr) || parsedApr < 0 || parsedApr > 100)) {
      nextErrors.apr = 'APR must be between 0 and 100.'
    }
    if (parsedGracePeriodDays !== undefined && (!Number.isInteger(parsedGracePeriodDays) || parsedGracePeriodDays < 0 || parsedGracePeriodDays > 60)) {
      nextErrors.gracePeriodDays = 'Grace period must be between 0 and 60.'
    }
    if (parsedMinimumPaymentOverride !== undefined && (!Number.isFinite(parsedMinimumPaymentOverride) || parsedMinimumPaymentOverride < 0)) {
      nextErrors.minimumPaymentOverride = 'Enter zero or a positive amount.'
    }
    if (parsedCashbackCap !== undefined && (!Number.isFinite(parsedCashbackCap) || parsedCashbackCap < 0)) {
      nextErrors.cashbackRate = 'Cashback cap must be zero or greater.'
    }
    if (!Number.isFinite(parsedCashbackStartingBalance) || parsedCashbackStartingBalance < 0) {
      nextErrors.cashbackRate = 'Starting cashback balance must be zero or greater.'
    }
    if (!Number.isFinite(parsedCashbackMinSpend) || parsedCashbackMinSpend < 0) {
      nextErrors.cashbackRate = 'Cashback minimum spend must be zero or greater.'
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
        minimumPaymentOverride: parsedMinimumPaymentOverride,
        cashbackCap: parsedCashbackCap,
        cashbackUsesFullThousandBlocks,
        cashbackStartingBalance: parsedCashbackStartingBalance,
        cashbackMinSpend: parsedCashbackMinSpend,
        cashbackRules: parsedCashbackRules,
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
            Days after statement
            <input
              ref={dueDayRef}
              type="number"
              inputMode="numeric"
              min="1"
              max="60"
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
              After the statement closes; moved to the next banking day when needed
            </span>
            {errors.dueDayOffset && (
              <span id="cc-form-error-due-day-offset" className="field-error" role="alert">
                {errors.dueDayOffset}
              </span>
            )}
          </label>
          <label>
            APR (%) (optional)
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
              Annual percentage rate
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

        <label>
          Minimum payment override (₱) (optional)
          <input
            ref={minimumPaymentOverrideRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={minimumPaymentOverride}
            onChange={(e) => setMinimumPaymentOverride(e.target.value)}
            placeholder="e.g. 850"
            aria-invalid={errors.minimumPaymentOverride ? true : undefined}
            aria-describedby={errors.minimumPaymentOverride ? 'cc-form-error-minimum-payment' : 'cc-form-hint-minimum-payment'}
          />
          <span id="cc-form-hint-minimum-payment" className="field-hint">
            Override the issuer minimum for this card
          </span>
          {errors.minimumPaymentOverride && (
            <span id="cc-form-error-minimum-payment" className="field-error" role="alert">
              {errors.minimumPaymentOverride}
            </span>
          )}
        </label>

        <div className="form-row">
          <label>
            Reward preset
            <select
              value={selectedPreset}
              onChange={(e) => {
                const nextPresetId = e.target.value
                if (nextPresetId === 'custom') {
                  setSelectedPreset('custom')
                  return
                }
                applyRewardPreset(nextPresetId)
              }}
            >
              {REWARD_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="field-hint">
              The card name identifies the rewards program.
            </span>
          </label>
          <label>
            Cashback cap (₱) (optional)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cashbackCap}
              onChange={(e) => {
                setCashbackCap(e.target.value)
                if (selectedPreset !== 'custom') {
                  setSelectedPreset('custom')
                }
              }}
              placeholder="3000"
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Starting cashback balance (₱)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cashbackStartingBalance}
              onChange={(e) => {
                setCashbackStartingBalance(e.target.value)
                if (selectedPreset !== 'custom') {
                  setSelectedPreset('custom')
                }
              }}
              placeholder="0"
            />
          </label>
          <label>
            Min spend for cashback (₱)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cashbackMinSpend}
              onChange={(e) => {
                setCashbackMinSpend(e.target.value)
                if (selectedPreset !== 'custom') {
                  setSelectedPreset('custom')
                }
              }}
              placeholder="1000"
            />
          </label>
        </div>

        <label>
          Cashback rules
          <input
            type="text"
            value={cashbackRulesText}
            onChange={(e) => {
              setCashbackRulesText(e.target.value)
              if (selectedPreset !== 'custom') {
                setSelectedPreset('custom')
              }
            }}
            placeholder="Groceries=1%; *=0.3%"
          />
          {cashbackRuleSummary.length > 0 && (
            <span className="field-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              {cashbackRuleSummary.map((rule) => (
                <span key={rule} style={{ display: 'block' }}>
                  {rule}
                </span>
              ))}
            </span>
          )}
        </label>

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
