import { useMemo, useState, type FormEvent } from 'react'
import { Banknote, CalendarClock, ShoppingBag } from 'lucide-react'
import { TransactionSheet } from './TransactionSheet'
import { formatDate, formatMoney, toDateInputValue } from '../lib/format'
import {
  BPI_CASH_PRESETS,
  bpiCashAdvanceLimitPercent,
  bpiCashAdvanceMonthlyRate,
  bpiCreditToCashRate,
  bpiCreditToCashServiceFee,
  computeInstallmentSchedule,
  computeMonthlyInstallment,
  splitInstallmentPurchase,
} from '../services/cardInstallments'
import type { CardInstallmentInput, InstallmentCreditLine } from '../types/cardInstallment'
import type { CreditCard, CreditCardStatement } from '../types/creditCard'
import { CATEGORIES } from '../types/transaction'

export interface CreditToCashRequest {
  plan: CardInstallmentInput
  recordIncome: boolean
}

export interface InstallmentPurchaseRequest {
  plan: CardInstallmentInput
  /** Spending category for the full purchase price. */
  category: string
}

export interface CashAdvanceRequest {
  cardId: string
  amount: number
  fee: number
  monthlyRate: number
  /** YYYY-MM-DD */
  date: string
  recordIncome: boolean
}

type CashMode = 'credit-to-cash' | 'cash-advance' | 'purchase'

const MODE_INTRO: Record<CashMode, string> = {
  'credit-to-cash': 'Turn part of your limit into cash sent to your bank account, paid back in fixed monthly installments on your statement.',
  'cash-advance': 'Withdraw cash at an ATM. Interest starts on the day it posts, and a flat fee is charged per withdrawal.',
  purchase: 'A product bought on installment uses your Madness Limit first. Only the monthly installment bills your statement.',
}

const SUBMIT_LABEL: Record<CashMode, string> = {
  'credit-to-cash': 'Add Credit-to-Cash',
  'cash-advance': 'Add cash advance',
  purchase: 'Add installment purchase',
}

interface CardCashSheetProps {
  /** Pool primary; its limit and statement cycle apply to every member. */
  card: CreditCard
  /** Cards that can take the cash, usually just `card`. */
  members: CreditCard[]
  statement: CreditCardStatement
  onClose: () => void
  onCreditToCash: (request: CreditToCashRequest) => Promise<void>
  onCashAdvance: (request: CashAdvanceRequest) => Promise<void>
  onInstallmentPurchase: (request: InstallmentPurchaseRequest) => Promise<void>
}

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Statement date that will include a transaction posted on `date`. */
function statementDateFor(dateInput: string, statementDay: number): Date {
  const [year, month, day] = dateInput.split('-').map(Number)
  return day <= statementDay
    ? new Date(year, month - 1, statementDay)
    : new Date(year, month, statementDay)
}

function inclusiveDays(fromInput: string, to: Date): number {
  const [year, month, day] = fromInput.split('-').map(Number)
  const from = new Date(year, month - 1, day)
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1)
}

export function CardCashSheet({
  card,
  members,
  statement,
  onClose,
  onCreditToCash,
  onCashAdvance,
  onInstallmentPurchase,
}: CardCashSheetProps) {
  const today = toDateInputValue(new Date())
  const madnessLimit = Math.max(0, card.madnessLimit ?? 0)
  const madnessAvailable = Math.max(0, madnessLimit - statement.madnessUsedEffective)
  const regularAvailable = Math.max(0, statement.availableCredit)

  const [mode, setMode] = useState<CashMode>('credit-to-cash')
  const [cardId, setCardId] = useState(members[0]?.id ?? card.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [c2cAmount, setC2cAmount] = useState('')
  const [creditLine, setCreditLine] = useState<InstallmentCreditLine>(madnessAvailable > 0 ? 'madness' : 'regular')
  const [term, setTerm] = useState(12)
  const [rate, setRate] = useState(String(bpiCreditToCashRate(12)))
  const [fee, setFee] = useState('')
  const [feeEdited, setFeeEdited] = useState(false)
  const [bookedOn, setBookedOn] = useState(today)
  const [notes, setNotes] = useState('')

  const selectedCard = members.find((member) => member.id === cardId) ?? card
  const [caAmount, setCaAmount] = useState('')
  const [caFee, setCaFee] = useState(String(BPI_CASH_PRESETS.cashAdvance.fee))
  const [caRate, setCaRate] = useState(String(bpiCashAdvanceMonthlyRate(card)))
  const [caDate, setCaDate] = useState(today)

  const [recordIncome, setRecordIncome] = useState(true)

  const [purchaseItem, setPurchaseItem] = useState('')
  const [purchaseCategory, setPurchaseCategory] = useState('Shopping')
  const [purchaseAmount, setPurchaseAmount] = useState('')
  const [purchaseTerm, setPurchaseTerm] = useState<number>(BPI_CASH_PRESETS.purchase.defaultTerm)
  const [purchaseRate, setPurchaseRate] = useState(String(BPI_CASH_PRESETS.purchase.defaultRate))
  const [purchaseDate, setPurchaseDate] = useState(today)

  const principal = parseAmount(c2cAmount)
  const rateValue = parseAmount(rate)
  const autoFee = principal > 0 ? bpiCreditToCashServiceFee(principal) : 0
  const feeValue = feeEdited ? parseAmount(fee) : autoFee
  const lineAvailable = creditLine === 'madness' ? madnessAvailable : regularAvailable

  const c2cPreview = useMemo(() => {
    if (principal <= 0 || term < 1) return null
    const schedule = computeInstallmentSchedule(
      { principal, termMonths: term, monthlyAddOnRate: rateValue, bookedOn },
      card,
    )
    const totalInterest = principal * (rateValue / 100) * term
    return {
      monthly: computeMonthlyInstallment(principal, term, rateValue),
      totalInterest,
      totalCost: totalInterest + feeValue,
      firstBilling: schedule[0]?.billingDate ?? null,
      lastBilling: schedule.at(-1)?.billingDate ?? null,
    }
  }, [principal, term, rateValue, bookedOn, card, feeValue])

  const caAmountValue = parseAmount(caAmount)
  const caFeeValue = parseAmount(caFee)
  const caRateValue = parseAmount(caRate)
  const caLimitPercent = bpiCashAdvanceLimitPercent(selectedCard)
  const caLimit = (card.limit * caLimitPercent) / 100
  const caStatementDate = statementDateFor(caDate, card.statementDay)
  const caDays = inclusiveDays(caDate, caStatementDate)
  const caInterest = (caAmountValue + caFeeValue) * (caRateValue / 100) * (12 / 360) * caDays

  const caWarnings: string[] = []
  if (caAmountValue > 0 && caAmountValue < BPI_CASH_PRESETS.cashAdvance.minimumAmount) {
    caWarnings.push(`BPI's minimum cash advance is ${formatMoney(BPI_CASH_PRESETS.cashAdvance.minimumAmount)}.`)
  }
  if (caAmountValue > caLimit) {
    caWarnings.push(`This card's cash advance limit is about ${caLimitPercent}% of the credit limit (${formatMoney(caLimit)}).`)
  }
  if (caAmountValue + caFeeValue > regularAvailable) {
    caWarnings.push(`The amount plus fee is more than your available credit (${formatMoney(regularAvailable)}).`)
  }

  const purchasePrice = parseAmount(purchaseAmount)
  const purchaseRateValue = parseAmount(purchaseRate)
  const purchaseSplit = purchasePrice > 0
    ? splitInstallmentPurchase(purchasePrice, madnessAvailable, regularAvailable)
    : null

  const purchaseSchedule = purchasePrice > 0
    ? computeInstallmentSchedule(
      { principal: purchasePrice, termMonths: purchaseTerm, monthlyAddOnRate: purchaseRateValue, bookedOn: purchaseDate },
      card,
    )
    : null
  const purchasePreview = purchaseSchedule && {
    monthly: computeMonthlyInstallment(purchasePrice, purchaseTerm, purchaseRateValue),
    totalInterest: purchasePrice * (purchaseRateValue / 100) * purchaseTerm,
    firstBilling: purchaseSchedule[0]?.billingDate ?? null,
    lastBilling: purchaseSchedule.at(-1)?.billingDate ?? null,
  }

  const purchaseWarnings: string[] = []
  if (purchasePrice > 0 && !purchaseSplit) {
    purchaseWarnings.push(
      `The price is more than your Madness Limit and regular credit combined (${formatMoney(madnessAvailable + regularAvailable)}).`,
    )
  } else if (purchaseSplit && purchaseSplit.madnessPortion > 0 && purchaseSplit.regularPortion > 0) {
    purchaseWarnings.push(
      `Your Madness Limit covers ${formatMoney(purchaseSplit.madnessPortion)}. The other ${formatMoney(purchaseSplit.regularPortion)} uses your regular credit limit.`,
    )
  } else if (purchaseSplit && madnessLimit > 0 && purchaseSplit.madnessPortion === 0) {
    purchaseWarnings.push('Your Madness Limit is used up, so this purchase uses your regular credit limit.')
  }

  function selectTerm(nextTerm: number) {
    setTerm(nextTerm)
    setRate(String(bpiCreditToCashRate(nextTerm)))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (mode === 'purchase') {
      if (!purchaseItem.trim()) {
        setError('Enter what you bought.')
        return
      }
      if (purchasePrice <= 0) {
        setError('Enter the purchase price.')
        return
      }
      if (!purchaseSplit) {
        setError(`That is more than your Madness Limit and regular credit combined (${formatMoney(madnessAvailable + regularAvailable)}).`)
        return
      }
      setBusy(true)
      try {
        await onInstallmentPurchase({
          plan: {
            cardId,
            kind: 'purchase',
            creditLine: purchaseSplit.creditLine,
            ...(purchaseSplit.madnessPrincipal !== undefined ? { madnessPrincipal: purchaseSplit.madnessPrincipal } : {}),
            principal: purchasePrice,
            monthlyAddOnRate: purchaseRateValue,
            termMonths: purchaseTerm,
            bookedOn: purchaseDate,
            notes: purchaseItem.trim(),
          },
          category: purchaseCategory,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the installment purchase.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (mode === 'credit-to-cash') {
      if (principal <= 0) {
        setError('Enter the amount you want to receive.')
        return
      }
      if (principal > lineAvailable + 0.005) {
        setError(`That is more than the available ${creditLine === 'madness' ? 'Madness Limit' : 'credit'} (${formatMoney(lineAvailable)}).`)
        return
      }
      if (feeEdited && (!Number.isFinite(Number.parseFloat(fee)) || Number.parseFloat(fee) < 0)) {
        setError('Service fee must be zero or greater.')
        return
      }
      setBusy(true)
      try {
        await onCreditToCash({
          plan: {
            cardId,
            creditLine,
            principal,
            monthlyAddOnRate: rateValue,
            termMonths: term,
            processingFee: feeValue,
            bookedOn,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
          recordIncome,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the Credit-to-Cash plan.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (caAmountValue <= 0) {
      setError('Enter the cash advance amount.')
      return
    }
    if (caFeeValue < 0 || caRateValue < 0) {
      setError('Fee and interest rate must be zero or greater.')
      return
    }
    setBusy(true)
    try {
      await onCashAdvance({
        cardId,
        amount: caAmountValue,
        fee: caFeeValue,
        monthlyRate: caRateValue,
        date: caDate,
        recordIncome,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the cash advance.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <TransactionSheet open title={`Cash & installments · ${card.name}`} onClose={onClose}>
      <form className="tx-form cc-form cash-form" onSubmit={handleSubmit}>
        <div className="type-tabs" role="tablist" aria-label="Cash option">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'credit-to-cash'}
            className={`type-tab ${mode === 'credit-to-cash' ? 'active income' : ''}`}
            onClick={() => setMode('credit-to-cash')}
          >
            <CalendarClock aria-hidden="true" />
            Credit-to-Cash
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'cash-advance'}
            className={`type-tab ${mode === 'cash-advance' ? 'active expense' : ''}`}
            onClick={() => setMode('cash-advance')}
          >
            <Banknote aria-hidden="true" />
            Cash advance
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'purchase'}
            className={`type-tab ${mode === 'purchase' ? 'active bill' : ''}`}
            onClick={() => setMode('purchase')}
          >
            <ShoppingBag aria-hidden="true" />
            Installment
          </button>
        </div>

        <p className="field-hint cash-form-intro">{MODE_INTRO[mode]}</p>

        {members.length > 1 && (
          <label>
            <span>Card</span>
            <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} •••• {member.lastFour}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'purchase' ? (
          <>
            <div className="form-row">
              <label>
                <span>Item</span>
                <input
                  type="text"
                  maxLength={60}
                  required
                  value={purchaseItem}
                  onChange={(e) => setPurchaseItem(e.target.value)}
                  placeholder="e.g. iPhone 17"
                />
              </label>
              <label>
                <span>Category</span>
                <select value={purchaseCategory} onChange={(e) => setPurchaseCategory(e.target.value)}>
                  {CATEGORIES.expense.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                <span>Price (₱)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  placeholder="0.00"
                />
                <span className="field-hint">
                  {madnessLimit > 0
                    ? `Madness available: ${formatMoney(madnessAvailable)} · Regular: ${formatMoney(regularAvailable)}`
                    : `Available: ${formatMoney(regularAvailable)}. Add your Madness Limit in the card settings.`}
                </span>
              </label>
              <label>
                <span>Purchase date</span>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                <span>Term</span>
                <select value={purchaseTerm} onChange={(e) => setPurchaseTerm(Number(e.target.value))}>
                  {BPI_CASH_PRESETS.purchase.terms.map((months) => (
                    <option key={months} value={months}>
                      {months} months
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Monthly add-on rate (%)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="10"
                  step="0.01"
                  required
                  value={purchaseRate}
                  onChange={(e) => setPurchaseRate(e.target.value)}
                />
                <span className="field-hint">0% at partner merchants. Enter the rate if your plan has add-on interest.</span>
              </label>
            </div>

            {purchasePreview && (
              <dl className="cash-preview" aria-live="polite">
                <div>
                  <dt>Monthly installment</dt>
                  <dd>{formatMoney(purchasePreview.monthly)}</dd>
                </div>
                <div>
                  <dt>Total add-on interest</dt>
                  <dd>{formatMoney(purchasePreview.totalInterest)}</dd>
                </div>
                {purchaseSplit && (
                  <>
                    <div>
                      <dt>On Madness Limit</dt>
                      <dd>{formatMoney(purchaseSplit.madnessPortion)}</dd>
                    </div>
                    <div>
                      <dt>On regular limit</dt>
                      <dd>{formatMoney(purchaseSplit.regularPortion)}</dd>
                    </div>
                  </>
                )}
                {purchasePreview.firstBilling && purchasePreview.lastBilling && (
                  <div className="cash-preview-wide">
                    <dt>Billed on statements</dt>
                    <dd>
                      {formatDate(purchasePreview.firstBilling.toISOString())} to{' '}
                      {formatDate(purchasePreview.lastBilling.toISOString())}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {purchaseWarnings.length > 0 && (
              <ul className="cash-warnings" role="status">
                {purchaseWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </>
        ) : mode === 'credit-to-cash' ? (
          <>
            <div className="form-row">
              <label>
                <span>Amount to receive (₱)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={c2cAmount}
                  onChange={(e) => setC2cAmount(e.target.value)}
                  placeholder="0.00"
                />
                <span className="field-hint">Available: {formatMoney(lineAvailable)}</span>
              </label>
              <label>
                <span>Credit line</span>
                <select
                  value={creditLine}
                  onChange={(e) => setCreditLine(e.target.value as InstallmentCreditLine)}
                >
                  <option value="regular">Regular credit limit</option>
                  {madnessLimit > 0 && <option value="madness">Madness Limit</option>}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                <span>Term</span>
                <select value={term} onChange={(e) => selectTerm(Number(e.target.value))}>
                  {BPI_CASH_PRESETS.creditToCash.terms.map((months) => (
                    <option key={months} value={months}>
                      {months} months
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Monthly add-on rate (%)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="10"
                  step="0.01"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
                <span className="field-hint">BPI standard rate; lower it if you have a promo offer.</span>
              </label>
            </div>

            <div className="form-row">
              <label>
                <span>Service fee (₱)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={feeEdited ? fee : String(autoFee)}
                  onChange={(e) => {
                    setFeeEdited(true)
                    setFee(e.target.value)
                  }}
                />
                <span className="field-hint">
                  ₱500 up to ₱50,000, ₱700 above. Billed on your next statement.
                </span>
              </label>
              <label>
                <span>Booking date</span>
                <input
                  type="date"
                  required
                  value={bookedOn}
                  onChange={(e) => setBookedOn(e.target.value)}
                />
              </label>
            </div>

            <label>
              <span>
                Label <span className="optional-hint">(optional)</span>
              </span>
              <input
                type="text"
                maxLength={60}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Tuition"
              />
            </label>

            {c2cPreview && (
              <dl className="cash-preview" aria-live="polite">
                <div>
                  <dt>Monthly installment</dt>
                  <dd>{formatMoney(c2cPreview.monthly)}</dd>
                </div>
                <div>
                  <dt>Total add-on interest</dt>
                  <dd>{formatMoney(c2cPreview.totalInterest)}</dd>
                </div>
                <div>
                  <dt>Service fee</dt>
                  <dd>{formatMoney(feeValue)}</dd>
                </div>
                <div>
                  <dt>Total cost of the cash</dt>
                  <dd>{formatMoney(c2cPreview.totalCost)}</dd>
                </div>
                {c2cPreview.firstBilling && c2cPreview.lastBilling && (
                  <div className="cash-preview-wide">
                    <dt>Billed on statements</dt>
                    <dd>
                      {formatDate(c2cPreview.firstBilling.toISOString())} to{' '}
                      {formatDate(c2cPreview.lastBilling.toISOString())}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </>
        ) : (
          <>
            <div className="form-row">
              <label>
                <span>Cash amount (₱)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={caAmount}
                  onChange={(e) => setCaAmount(e.target.value)}
                  placeholder="0.00"
                />
                <span className="field-hint">Cash advance limit: about {formatMoney(caLimit)}</span>
              </label>
              <label>
                <span>Withdrawal date</span>
                <input
                  type="date"
                  required
                  value={caDate}
                  onChange={(e) => setCaDate(e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                <span>Cash advance fee (₱)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={caFee}
                  onChange={(e) => setCaFee(e.target.value)}
                />
                <span className="field-hint">BPI charges ₱200 per withdrawal. Other banks' ATMs may add more.</span>
              </label>
              <label>
                <span>Monthly interest (%)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={caRate}
                  onChange={(e) => setCaRate(e.target.value)}
                />
              </label>
            </div>

            {caAmountValue > 0 && (
              <dl className="cash-preview" aria-live="polite">
                <div>
                  <dt>Charged to card</dt>
                  <dd>{formatMoney(caAmountValue + caFeeValue)}</dd>
                </div>
                <div>
                  <dt>Interest by {formatDate(caStatementDate.toISOString())}</dt>
                  <dd>{formatMoney(caInterest)}</dd>
                </div>
                <div className="cash-preview-wide">
                  <dt>Interest keeps running</dt>
                  <dd>until the advance and fee are paid in full</dd>
                </div>
              </dl>
            )}

            {caWarnings.length > 0 && (
              <ul className="cash-warnings" role="status">
                {caWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </>
        )}

        {mode !== 'purchase' && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={recordIncome}
              onChange={(e) => setRecordIncome(e.target.checked)}
            />
            <span>Record the cash received as income</span>
          </label>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {SUBMIT_LABEL[mode]}
          </button>
        </div>
      </form>
    </TransactionSheet>
  )
}
