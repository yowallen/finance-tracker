import { useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react'
import { CreditCard as CreditCardIcon, Pencil } from 'lucide-react'
import {
  CARD_COLORS,
  type CardIssuer,
  type CreditCard,
  type CreditCardInput,
  type PointsRule,
} from '../types/creditCard'
import { cardsCanShareLimit, resolveCardIssuer } from '../services/creditCards'

const COLOR_NAMES = [
  'Blue',
  'Red',
  'Green',
  'Orange',
  'Violet',
  'Cyan',
  'Pink',
  'Lime',
  'Amber',
  'Gray',
]

interface CreditCardFormProps {
  editing: CreditCard | null
  otherCards?: CreditCard[]
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
  minimumPaymentOverride?: number
  rewardName?: string
  rewardType?: 'cashback' | 'points'
  pointsPerSpend?: number
  pointsSpendIncrement?: number
  rewardDescription?: string
  cashbackCap?: number
  cashbackYearlyCap?: number
  cashbackMinSpend: number
  cashbackUsesFullThousandBlocks?: boolean
  cashbackRulesText: string
  pointsRules?: PointsRule[]
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
    minimumPaymentOverride: 850,
    cashbackCap: 15000,
    cashbackMinSpend: 1000,
    cashbackUsesFullThousandBlocks: true,
    cashbackRulesText: 'Groceries=4%; Shopping=4%; Utilities=1%; Health=1%; *=0.3%',
  },
  {
    id: 'bpi-rewards-card',
    label: 'BPI Rewards Card',
    minimumPaymentOverride: 850,
    rewardName: 'BPI Rewards Points',
    rewardType: 'points',
    pointsPerSpend: 1,
    pointsSpendIncrement: 35,
    rewardDescription: 'Redeem points for airline miles, shopping credits, dining vouchers, gift certificates, or annual membership fee payment.',
    cashbackMinSpend: 0,
    cashbackRulesText: '',
  },
  {
    id: 'bpi-petron',
    label: 'BPI Petron Card',
    rewardName: 'Petron Fuel Rebate',
    rewardType: 'cashback',
    rewardDescription: '3% rebate on Petron fuel only. Non-fuel purchases earn nothing. Fuel rebates stop at ₱15,000 for the calendar year.',
    cashbackMinSpend: 0,
    cashbackUsesFullThousandBlocks: false,
    cashbackYearlyCap: 15000,
    cashbackRulesText: 'Fuel=3%',
  },
  {
    id: 'eastwest-privilege-classic',
    label: 'EastWest Privilege Classic',
    rewardName: 'EastWest Limitless Rewards',
    rewardType: 'points',
    pointsPerSpend: 1,
    pointsSpendIncrement: 100,
    rewardDescription: '1 point per ₱100. EastWest drops the fraction on each transaction. Redeem for vouchers, miles, cash rebates, or an annual fee waiver. Visa and Mastercard Classic share this rate.',
    cashbackMinSpend: 0,
    cashbackRulesText: '',
  },
  {
    id: 'metrobank-platinum',
    label: 'Metrobank Platinum Mastercard',
    rewardName: 'Metrobank Rewards Points',
    rewardType: 'points',
    pointsPerSpend: 1,
    pointsSpendIncrement: 20,
    rewardDescription: '1 point per ₱20, counted on each purchase. Dining discounts are not tracked.',
    cashbackMinSpend: 0,
    cashbackRulesText: '',
  },
  {
    id: 'unionbank-rewards-platinum',
    label: 'UnionBank Rewards Platinum',
    rewardName: 'UnionBank Rewards Points',
    rewardType: 'points',
    pointsPerSpend: 1,
    pointsSpendIncrement: 30,
    rewardDescription: '1 point per ₱30. Food and Shopping earn 3 points per ₱30. Other purchases earn 1 point per ₱30.',
    cashbackMinSpend: 0,
    cashbackRulesText: '',
    pointsRules: [
      { pointsPerSpend: 3, pointsSpendIncrement: 30, categories: ['Food', 'Shopping'] },
      { pointsPerSpend: 1, pointsSpendIncrement: 30, categories: ['*'] },
    ],
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
      madnessLimit: editing.madnessLimit,
      madnessUsed: editing.madnessUsed,
      rewardName: editing.rewardName,
      rewardType: editing.rewardType,
      pointsPerSpend: editing.pointsPerSpend,
      pointsSpendIncrement: editing.pointsSpendIncrement,
      pointsRules: editing.pointsRules,
      rewardDescription: editing.rewardDescription,
      cashbackCap: editing.cashbackCap,
      cashbackYearlyCap: editing.cashbackYearlyCap,
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
    rewardName: undefined,
    rewardType: undefined,
    pointsPerSpend: undefined,
    pointsSpendIncrement: undefined,
    pointsRules: undefined,
    rewardDescription: undefined,
    madnessLimit: undefined,
    madnessUsed: undefined,
    cashbackCap: 3000,
    cashbackYearlyCap: undefined,
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

function splitCashbackRule(item: string): { category: string; rate: number } | null {
  const separator = item.lastIndexOf('=') >= 0 ? item.lastIndexOf('=') : item.lastIndexOf(':')
  if (separator <= 0) return null
  const category = item.slice(0, separator).trim()
  const rateText = item.slice(separator + 1).trim().replace(/%$/, '')
  const rate = Number(rateText)
  if (!category || !Number.isFinite(rate) || rate < 0 || rate > 100) return null
  return { category, rate }
}

function parseCashbackRules(raw: string): Array<{ rate: number; categories: string[] }> {
  return raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parsed = splitCashbackRule(item)
      if (!parsed) {
        throw new Error('Cashback rules must look like "Groceries=1%; *=0.3%".')
      }
      return { rate: parsed.rate, categories: [parsed.category] }
    })
}

function summarizeCashbackRules(raw: string): string[] {
  if (!raw.trim()) return []

  const lines: string[] = []
  for (const item of raw.split(/[,;\n]/)) {
    const parsed = splitCashbackRule(item.trim())
    if (!parsed) continue
    const lowered = parsed.category.toLowerCase()
    const label = parsed.category === '*' || lowered === 'all' || lowered === 'all other eligible spend'
      ? 'All other eligible spend'
      : parsed.category
    const formattedRate = Number.isInteger(parsed.rate) ? `${parsed.rate}` : parsed.rate.toFixed(1).replace(/\.0$/, '')
    lines.push(`${label}: ${formattedRate}%`)
  }
  return lines
}

function validateCardFields(input: {
  name: string
  lastFour: string
  parsedLimit: number
  parsedDueDayOffset: number
  parsedApr: number | undefined
  parsedGracePeriodDays: number | undefined
  parsedMinimumPaymentOverride: number | undefined
  parsedMadnessLimit: number | undefined
  parsedMadnessUsed: number
  parsedCashbackCap: number | undefined
  parsedCashbackStartingBalance: number
  parsedCashbackMinSpend: number
}): FieldErrors {
  const nextErrors: FieldErrors = {}
  if (!input.name.trim()) nextErrors.name = 'Card name is required.'
  if (!/^\d{4}$/.test(input.lastFour)) nextErrors.lastFour = 'Enter exactly 4 numbers.'
  if (!Number.isFinite(input.parsedLimit) || input.parsedLimit <= 0) {
    nextErrors.limit = 'Enter a credit limit greater than zero.'
  }
  if (!Number.isInteger(input.parsedDueDayOffset) || input.parsedDueDayOffset < 1 || input.parsedDueDayOffset > 60) {
    nextErrors.dueDayOffset = 'Enter a whole number from 1 to 60.'
  }
  if (input.parsedApr !== undefined && (!Number.isFinite(input.parsedApr) || input.parsedApr < 0 || input.parsedApr > 100)) {
    nextErrors.apr = 'APR must be between 0 and 100.'
  }
  if (input.parsedGracePeriodDays !== undefined && (!Number.isInteger(input.parsedGracePeriodDays) || input.parsedGracePeriodDays < 0 || input.parsedGracePeriodDays > 60)) {
    nextErrors.gracePeriodDays = 'Grace period must be between 0 and 60.'
  }
  if (input.parsedMinimumPaymentOverride !== undefined && (!Number.isFinite(input.parsedMinimumPaymentOverride) || input.parsedMinimumPaymentOverride < 0)) {
    nextErrors.minimumPaymentOverride = 'Enter zero or a positive amount.'
  }
  if (input.parsedMadnessLimit !== undefined && (!Number.isFinite(input.parsedMadnessLimit) || input.parsedMadnessLimit < 0)) {
    nextErrors.minimumPaymentOverride = 'Madness Limit must be zero or greater.'
  }
  if (!Number.isFinite(input.parsedMadnessUsed) || input.parsedMadnessUsed < 0 || (input.parsedMadnessLimit !== undefined && input.parsedMadnessUsed > input.parsedMadnessLimit)) {
    nextErrors.minimumPaymentOverride = 'Madness Limit used must be between zero and the Madness Limit.'
  }
  if (input.parsedCashbackCap !== undefined && (!Number.isFinite(input.parsedCashbackCap) || input.parsedCashbackCap < 0)) {
    nextErrors.cashbackRate = 'Cashback cap must be zero or greater.'
  }
  if (!Number.isFinite(input.parsedCashbackStartingBalance) || input.parsedCashbackStartingBalance < 0) {
    nextErrors.cashbackRate = 'Starting cashback balance must be zero or greater.'
  }
  if (!Number.isFinite(input.parsedCashbackMinSpend) || input.parsedCashbackMinSpend < 0) {
    nextErrors.cashbackRate = 'Cashback minimum spend must be zero or greater.'
  }
  return nextErrors
}

function LabeledField({
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string
  hint?: string
  hintId?: string
  error?: string
  errorId?: string
  children: ReactNode
}) {
  return (
    <label>
      <span>{label}</span>
      {children}
      {hint ? <span id={hintId} className="field-hint">{hint}</span> : null}
      {error ? (
        <span id={errorId} className="field-error" role="alert">{error}</span>
      ) : null}
    </label>
  )
}

export function CreditCardForm({
  editing,
  otherCards = [],
  onSubmit,
  onCancelEdit,
}: Readonly<CreditCardFormProps>) {
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
  const [madnessLimit, setMadnessLimit] = useState(initial.madnessLimit !== undefined ? String(initial.madnessLimit) : '')
  const [madnessUsed, setMadnessUsed] = useState(initial.madnessUsed !== undefined ? String(initial.madnessUsed) : '0')
  const [rewardName, setRewardName] = useState(initial.rewardName ?? '')
  const [rewardType, setRewardType] = useState(initial.rewardType)
  const [pointsPerSpend, setPointsPerSpend] = useState(initial.pointsPerSpend)
  const [pointsSpendIncrement, setPointsSpendIncrement] = useState(initial.pointsSpendIncrement)
  const [pointsRules, setPointsRules] = useState(initial.pointsRules)
  const [rewardDescription, setRewardDescription] = useState(initial.rewardDescription ?? '')
  const [cashbackCap, setCashbackCap] = useState(initial.cashbackCap !== undefined ? String(initial.cashbackCap) : '')
  const [cashbackYearlyCap, setCashbackYearlyCap] = useState(initial.cashbackYearlyCap)
  const [cashbackStartingBalance, setCashbackStartingBalance] = useState(initial.cashbackStartingBalance !== undefined ? String(initial.cashbackStartingBalance) : '0')
  const [cashbackMinSpend, setCashbackMinSpend] = useState(initial.cashbackMinSpend !== undefined ? String(initial.cashbackMinSpend) : '1000')
  const [cashbackUsesFullThousandBlocks, setCashbackUsesFullThousandBlocks] = useState(
    initial.cashbackUsesFullThousandBlocks ?? false,
  )
  const [cashbackRulesText, setCashbackRulesText] = useState(
    (initial.rewardType === 'points' ? [] : initial.cashbackRules ?? [{ rate: 1, categories: ['Groceries'] }, { rate: 0.3, categories: ['*'] }])
      .map((rule) => {
        const categories = rule.categories ?? []
        const categoryText = categories.length > 0 ? categories.join(', ') : '*'
        return `${categoryText}=${rule.rate}%`
      })
      .join('; '),
  )
  const [sharesWith, setSharesWith] = useState(() => {
    if (!editing?.sharedLimitGroupId) return ''
    return otherCards.find((card) => card.sharedLimitGroupId === editing.sharedLimitGroupId && card.id !== editing.id)?.id ?? ''
  })
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    const match = REWARD_PRESETS.find((preset) => {
      if (preset.id === 'custom') return false
      return (preset.cashbackCap ?? 0) === (initial.cashbackCap ?? 0)
        && (preset.cashbackMinSpend ?? 0) === (initial.cashbackMinSpend ?? 0)
        && Boolean(preset.cashbackUsesFullThousandBlocks) === Boolean(initial.cashbackUsesFullThousandBlocks)
        && preset.rewardType === initial.rewardType
        && preset.pointsPerSpend === initial.pointsPerSpend
        && preset.pointsSpendIncrement === initial.pointsSpendIncrement
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
    if (!name.trim() && preset.id !== 'custom') {
      setName(preset.label)
    }
    setRewardName(preset.rewardName ?? '')
    setRewardType(preset.rewardType)
    setPointsPerSpend(preset.pointsPerSpend)
    setPointsSpendIncrement(preset.pointsSpendIncrement)
    setPointsRules(preset.pointsRules)
    setCashbackYearlyCap(preset.cashbackYearlyCap)
    setRewardDescription(preset.rewardDescription ?? '')
    setMinimumPaymentOverride(preset.minimumPaymentOverride !== undefined ? String(preset.minimumPaymentOverride) : '')
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

  function issuerForCard(): CardIssuer | undefined {
    if (selectedPreset.startsWith('bpi')) return 'bpi'
    if (selectedPreset.startsWith('eastwest')) return 'eastwest'
    if (selectedPreset.startsWith('metrobank')) return 'metrobank'
    if (selectedPreset.startsWith('unionbank')) return 'unionbank'
    return resolveCardIssuer({ name, issuer: editing?.issuer })
  }

  const shareTarget = otherCards.find((card) => card.id === sharesWith)
  const followsSharedLimit = Boolean(shareTarget) && editing?.sharedLimitPrimary !== true
  const sameBankCards = otherCards.filter((card) => card.id !== editing?.id && cardsCanShareLimit(
    { name, issuer: issuerForCard() },
    card,
  ))

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setErrors({})

    const limitSource = followsSharedLimit ? shareTarget : undefined
    const parsedLimit = limitSource ? limitSource.limit : Number.parseFloat(limit)
    const parsedStatementDay = limitSource ? limitSource.statementDay : Number.parseInt(statementDay, 10)
    const parsedDueDayOffset = limitSource
      ? (limitSource.dueDayOffset ?? Number.parseInt(dueDayOffset, 10))
      : Number.parseInt(dueDayOffset, 10)
    const parsedApr = limitSource
      ? limitSource.apr
      : (apr.trim() !== '' ? Number.parseFloat(apr) : undefined)
    const parsedGracePeriodDays = gracePeriodDays.trim() !== '' ? Number.parseInt(gracePeriodDays, 10) : undefined
    const parsedMinimumPaymentOverride = minimumPaymentOverride.trim() !== '' ? Number.parseFloat(minimumPaymentOverride) : undefined
    const parsedMadnessLimit = madnessLimit.trim() !== '' ? Number.parseFloat(madnessLimit) : undefined
    const parsedMadnessUsed = madnessUsed.trim() !== '' ? Number.parseFloat(madnessUsed) : 0
    const parsedCashbackCap = cashbackCap.trim() !== '' ? Number.parseFloat(cashbackCap) : undefined
    const parsedCashbackStartingBalance = cashbackStartingBalance.trim() !== '' ? Number.parseFloat(cashbackStartingBalance) : 0
    const parsedCashbackMinSpend = cashbackMinSpend.trim() !== '' ? Number.parseFloat(cashbackMinSpend) : 1000
    let parsedCashbackRules: Array<{ rate: number; categories: string[] }> = []
    if (rewardType !== 'points') {
      try {
        parsedCashbackRules = parseCashbackRules(cashbackRulesText)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cashback rules must look like "Groceries=1%; *=0.3%".')
        return
      }
    }
    const nextErrors = validateCardFields({
      name,
      lastFour,
      parsedLimit,
      parsedDueDayOffset,
      parsedApr,
      parsedGracePeriodDays,
      parsedMinimumPaymentOverride,
      parsedMadnessLimit,
      parsedMadnessUsed,
      parsedCashbackCap,
      parsedCashbackStartingBalance,
      parsedCashbackMinSpend,
    })

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
        dueDay: limitSource?.dueDay,
        dueDayOffset: parsedDueDayOffset,
        color,
        active,
        apr: parsedApr,
        interestCalculationMethod,
        gracePeriodDays: parsedGracePeriodDays,
        minimumPaymentOverride: parsedMinimumPaymentOverride,
        madnessLimit: parsedMadnessLimit,
        madnessUsed: parsedMadnessUsed,
        rewardName: rewardName.trim() || undefined,
        rewardType,
        pointsPerSpend,
        pointsSpendIncrement,
        pointsRules,
        rewardDescription: rewardDescription.trim() || undefined,
        cashbackCap: parsedCashbackCap,
        cashbackYearlyCap,
        cashbackUsesFullThousandBlocks,
        cashbackStartingBalance: parsedCashbackStartingBalance,
        cashbackMinSpend: parsedCashbackMinSpend,
        cashbackRules: parsedCashbackRules,
        issuer: issuerForCard(),
        sharedLimitWithId: sharesWith || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save credit card.')
    } finally {
      setBusy(false)
    }
  }

  let submitLabel = 'Add card'
  if (busy) submitLabel = 'Saving…'
  else if (editing) submitLabel = 'Save changes'

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
          <LabeledField label="Card name" error={errors.name} errorId="cc-form-error-name">
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
          </LabeledField>
          <LabeledField label="Last 4 digits" error={errors.lastFour} errorId="cc-form-error-last-four">
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
          </LabeledField>
        </div>

        <LabeledField
          label="Shares a limit with"
          hint={followsSharedLimit && shareTarget
            ? `Limit, statement day, due day, and APR follow ${shareTarget.name}.`
            : 'Only cards from the same bank can share a credit line.'}
        >
          <select
            value={sharesWith}
            onChange={(event) => setSharesWith(event.target.value)}
            aria-label="Shares a limit with"
          >
            <option value="">No shared limit</option>
            {sameBankCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name} •••• {card.lastFour}
              </option>
            ))}
          </select>
        </LabeledField>

        <div className="form-row">
          <LabeledField label="Credit limit (₱)" error={errors.limit} errorId="cc-form-error-limit">
            <input
              ref={limitRef}
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              required
              disabled={followsSharedLimit}
              value={followsSharedLimit && shareTarget ? String(shareTarget.limit) : limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="50000"
              aria-invalid={errors.limit ? true : undefined}
              aria-describedby={errors.limit ? 'cc-form-error-limit' : undefined}
            />
          </LabeledField>
          <LabeledField label="Statement day">
            <select
              value={followsSharedLimit && shareTarget ? String(shareTarget.statementDay) : statementDay}
              onChange={(e) => setStatementDay(e.target.value)}
              aria-label="Statement day"
              disabled={followsSharedLimit}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {ordinal(day)}
                </option>
              ))}
            </select>
          </LabeledField>
        </div>

        <div className="form-row">
          <LabeledField label="Madness Limit (₱) (optional)" hint="Separate BPI installment and Credit-to-Cash line">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={madnessLimit}
              onChange={(e) => setMadnessLimit(e.target.value)}
              placeholder="e.g. 100000"
            />
          </LabeledField>
          <LabeledField label="Madness used outside tracked plans (₱)" hint="Installments not added through Cash & installments. Tracked plans are counted automatically.">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={madnessUsed}
              onChange={(e) => setMadnessUsed(e.target.value)}
              placeholder="0"
            />
          </LabeledField>
        </div>

        <div className="form-row">
          <LabeledField
            label="Days after statement"
            hint="After the statement closes; moved to the next banking day when needed"
            hintId="cc-form-hint-due-day-offset"
            error={errors.dueDayOffset}
            errorId="cc-form-error-due-day-offset"
          >
            <input
              ref={dueDayRef}
              type="number"
              inputMode="numeric"
              min="1"
              max="60"
              step="1"
              required
              disabled={followsSharedLimit}
              value={followsSharedLimit && shareTarget?.dueDayOffset !== undefined ? String(shareTarget.dueDayOffset) : dueDayOffset}
              onChange={(e) => setDueDayOffset(e.target.value)}
              placeholder="21"
              aria-invalid={errors.dueDayOffset ? true : undefined}
              aria-describedby={errors.dueDayOffset ? 'cc-form-error-due-day-offset' : 'cc-form-hint-due-day-offset'}
            />
          </LabeledField>
          <LabeledField
            label="APR (%) (optional)"
            hint="Annual percentage rate"
            hintId="cc-form-hint-apr"
            error={errors.apr}
            errorId="cc-form-error-apr"
          >
            <input
              ref={aprRef}
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              disabled={followsSharedLimit}
              value={followsSharedLimit && shareTarget?.apr !== undefined ? String(shareTarget.apr) : apr}
              onChange={(e) => setApr(e.target.value)}
              placeholder="3.5"
              aria-invalid={errors.apr ? true : undefined}
              aria-describedby={errors.apr ? 'cc-form-error-apr' : 'cc-form-hint-apr'}
            />
          </LabeledField>
        </div>

        <div className="form-row">
          <LabeledField label="Interest method">
            <select
              value={interestCalculationMethod}
              onChange={(e) => setInterestCalculationMethod(e.target.value as 'daily' | 'monthly')}
              aria-label="Interest calculation method"
            >
              <option value="daily">Daily balance</option>
              <option value="monthly">Monthly balance</option>
            </select>
          </LabeledField>
          <LabeledField
            label="Grace period (days)"
            hint="Days after due date before interest accrues"
            hintId="cc-form-hint-grace-period"
            error={errors.gracePeriodDays}
            errorId="cc-form-error-grace-period"
          >
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
          </LabeledField>
        </div>

        <LabeledField
          label="Minimum payment override (₱) (optional)"
          hint="Override the issuer minimum for this card"
          hintId="cc-form-hint-minimum-payment"
          error={errors.minimumPaymentOverride}
          errorId="cc-form-error-minimum-payment"
        >
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
        </LabeledField>

        <div className="form-row">
          <LabeledField label="Reward preset" hint="The card name identifies the rewards program.">
            <select
              value={selectedPreset}
              onChange={(e) => {
                const nextPresetId = e.target.value
                if (nextPresetId === 'custom') {
                  setSelectedPreset('custom')
                  setRewardName('')
                  setRewardType(undefined)
                  setPointsPerSpend(undefined)
                  setPointsSpendIncrement(undefined)
                  setRewardDescription('')
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
          </LabeledField>
          {rewardType !== 'points' && (
            <LabeledField label="Cashback cap (₱) (optional)">
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
            </LabeledField>
          )}
        </div>

        {rewardType !== 'points' && (
          <>
            <div className="form-row">
              <LabeledField label="Starting cashback balance (₱)">
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
              </LabeledField>
              <LabeledField label="Min spend for cashback (₱)">
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
              </LabeledField>
            </div>

            <LabeledField label="Cashback rules">
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
            </LabeledField>
          </>
        )}

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
