import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
import type {
  CardInstallment,
  CardInstallmentInput,
  CardInstallmentSummary,
  InstallmentCreditLine,
  InstallmentScheduleRow,
} from '../types/cardInstallment'
import { INSTALLMENT_DATE_PATTERN, installmentLabel, validateCardInstallmentInput } from '../types/cardInstallment'
import type { CreditCard } from '../types/creditCard'
import type { Transaction } from '../types/transaction'
import { groupCreditCards, resolveCardIssuer } from './creditCards'

const COLLECTION = 'cardInstallments'

/**
 * Published BPI terms (bpi.com.ph Rates and Fees, Credit-to-Cash and Cash Advance pages, Oct 2026).
 * Rates are percentages per month.
 */
export const BPI_CASH_PRESETS = {
  creditToCash: {
    terms: [6, 12, 18, 24, 36],
    defaultRate: 1,
    rateByTerm: { 36: 0.99 } as Record<number, number>,
    serviceFeeThreshold: 50_000,
    serviceFeeUpToThreshold: 500,
    serviceFeeAboveThreshold: 700,
  },
  /** 0% installment at partner merchants; drawn from the Madness Limit first. */
  purchase: {
    terms: [3, 6, 9, 12, 18, 24, 36],
    defaultTerm: 12,
    defaultRate: 0,
  },
  cashAdvance: {
    fee: 200,
    monthlyRate: 3,
    freePlusMonthlyRate: 2.5,
    minimumAmount: 500,
    fullLimitCards: ['amore platinum', 'signature', 'platinum rewards'],
    seventyPercentCards: ['gold rewards'],
    defaultLimitPercent: 30,
  },
  unsupportedCards: ['omni', 'free+', 'free plus', 'ecredit', 'e-credit'],
} as const

export function bpiCreditToCashRate(termMonths: number): number {
  return BPI_CASH_PRESETS.creditToCash.rateByTerm[termMonths] ?? BPI_CASH_PRESETS.creditToCash.defaultRate
}

export function bpiCreditToCashServiceFee(principal: number): number {
  const preset = BPI_CASH_PRESETS.creditToCash
  return principal > preset.serviceFeeThreshold ? preset.serviceFeeAboveThreshold : preset.serviceFeeUpToThreshold
}

export function bpiCashAdvanceMonthlyRate(card: Pick<CreditCard, 'name'>): number {
  const name = card.name.toLowerCase()
  return name.includes('free+') || name.includes('free plus')
    ? BPI_CASH_PRESETS.cashAdvance.freePlusMonthlyRate
    : BPI_CASH_PRESETS.cashAdvance.monthlyRate
}

/** Cash advance limit as a percentage of the total credit limit, matched from the card name. */
export function bpiCashAdvanceLimitPercent(card: Pick<CreditCard, 'name'>): number {
  const name = card.name.toLowerCase()
  const preset = BPI_CASH_PRESETS.cashAdvance
  if (preset.fullLimitCards.some((marker) => name.includes(marker))) return 100
  if (preset.seventyPercentCards.some((marker) => name.includes(marker))) return 70
  return preset.defaultLimitPercent
}

/** BPI cards that offer Credit-to-Cash and Cash Advance. */
export function supportsBpiCashFeatures(card: Pick<CreditCard, 'name' | 'issuer'>): boolean {
  if (resolveCardIssuer(card) !== 'bpi') return false
  const name = card.name.toLowerCase()
  return !BPI_CASH_PRESETS.unsupportedCards.some((marker) => name.includes(marker))
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export interface InstallmentLineSplit {
  creditLine: InstallmentCreditLine
  /** Set only when the purchase spills over from the Madness Limit to the regular limit. */
  madnessPrincipal?: number
  madnessPortion: number
  regularPortion: number
}

/**
 * BPI books installment purchases on the Madness Limit first; whatever doesn't fit goes on the
 * regular limit. Returns null when both lines together can't cover the amount.
 */
export function splitInstallmentPurchase(
  amount: number,
  madnessAvailable: number,
  regularAvailable: number,
): InstallmentLineSplit | null {
  const madness = Math.max(0, Math.floor(madnessAvailable * 100) / 100)
  const regular = Math.max(0, regularAvailable)
  if (amount <= 0 || amount > madness + regular + 0.005) return null
  if (madness <= 0) {
    return { creditLine: 'regular', madnessPortion: 0, regularPortion: amount }
  }
  if (amount <= madness) {
    return { creditLine: 'madness', madnessPortion: amount, regularPortion: 0 }
  }
  return {
    creditLine: 'madness',
    madnessPrincipal: madness,
    madnessPortion: madness,
    regularPortion: roundMoney(amount - madness),
  }
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function computeMonthlyInstallment(principal: number, termMonths: number, monthlyAddOnRate: number): number {
  return roundMoney(principal / termMonths) + roundMoney(principal * (monthlyAddOnRate / 100))
}

/**
 * Amortizations bill on the statement date of each cycle, starting with the first
 * statement date after the booking date. The last row absorbs principal rounding.
 */
export function computeInstallmentSchedule(
  plan: Pick<CardInstallment, 'principal' | 'termMonths' | 'monthlyAddOnRate' | 'bookedOn'>,
  card: Pick<CreditCard, 'statementDay'>,
): InstallmentScheduleRow[] {
  const booked = parseLocalDate(plan.bookedOn)
  let firstYear = booked.getFullYear()
  let firstMonth = booked.getMonth()
  if (booked.getDate() >= card.statementDay) {
    firstMonth += 1
  }
  const firstDate = new Date(firstYear, firstMonth, 1)
  firstYear = firstDate.getFullYear()
  firstMonth = firstDate.getMonth()

  const principalPortion = roundMoney(plan.principal / plan.termMonths)
  const interestPortion = roundMoney(plan.principal * (plan.monthlyAddOnRate / 100))
  const rows: InstallmentScheduleRow[] = []
  let principalBilled = 0

  for (let index = 0; index < plan.termMonths; index += 1) {
    const isLast = index === plan.termMonths - 1
    const principalPart = isLast ? roundMoney(plan.principal - principalBilled) : principalPortion
    principalBilled = roundMoney(principalBilled + principalPart)
    rows.push({
      number: index + 1,
      billingDate: new Date(firstYear, firstMonth + index, card.statementDay, 12, 0, 0, 0),
      principalPortion: principalPart,
      interestPortion,
      amount: roundMoney(principalPart + interestPortion),
    })
  }

  return rows
}

/** Shared-limit members bill on the pool primary's statement cycle. */
function billingCardFor(cardId: string, cards: CreditCard[]): CreditCard | undefined {
  const pool = groupCreditCards(cards).find((item) => item.cards.some((card) => card.id === cardId))
  return pool?.primary ?? cards.find((card) => card.id === cardId)
}

/** In-memory card charges for every amortization; these are never written to Firestore. */
export function buildInstallmentCharges(plans: CardInstallment[], cards: CreditCard[]): Transaction[] {
  const charges: Transaction[] = []
  for (const plan of plans) {
    const card = cards.find((item) => item.id === plan.cardId)
    const billingCard = billingCardFor(plan.cardId, cards)
    if (!card || !billingCard) continue
    const label = installmentLabel(plan)
    for (const row of computeInstallmentSchedule(plan, billingCard)) {
      charges.push({
        id: `installment:${plan.id}:${row.number}`,
        userId: plan.userId,
        type: 'bill',
        amount: row.amount,
        category: 'Installment',
        description: `${label} installment ${row.number}/${plan.termMonths}`,
        occurredAt: row.billingDate.toISOString(),
        createdAt: plan.createdAt,
        creditCardId: plan.cardId,
        installmentPlanId: plan.id,
        installmentNumber: row.number,
        installmentTerm: plan.termMonths,
      })
    }
  }
  return charges
}

export function isInstallmentCharge(tx: Pick<Transaction, 'installmentNumber'>): boolean {
  return typeof tx.installmentNumber === 'number'
}

/** Rollup of each plan on the given cards; rows billed on or before `asOf` count as billed. */
export function summarizeCardInstallments(
  cardIds: string[],
  plans: CardInstallment[],
  cards: CreditCard[],
  asOf: Date,
): CardInstallmentSummary[] {
  const ids = new Set(cardIds)
  const cutoff = asOf.getTime()
  const summaries: CardInstallmentSummary[] = []

  for (const plan of plans) {
    if (!ids.has(plan.cardId)) continue
    const billingCard = billingCardFor(plan.cardId, cards)
    if (!billingCard) continue
    const schedule = computeInstallmentSchedule(plan, billingCard)
    const billed = schedule.filter((row) => row.billingDate.getTime() <= cutoff)
    const principalBilled = billed.reduce((sum, row) => sum + row.principalPortion, 0)
    const next = schedule.find((row) => row.billingDate.getTime() > cutoff) ?? null
    summaries.push({
      plan,
      monthlyPayment: schedule[0]?.amount ?? 0,
      billedCount: billed.length,
      remainingCount: schedule.length - billed.length,
      unbilledPrincipal: Math.max(0, roundMoney(plan.principal - principalBilled)),
      nextBillingDate: next?.billingDate ?? null,
      totalInterest: roundMoney(schedule.reduce((sum, row) => sum + row.interestPortion, 0)),
    })
  }

  return summaries.sort((a, b) => b.plan.bookedOn.localeCompare(a.plan.bookedOn))
}

function toIso(value: unknown, timestampCtor: typeof Timestamp): string {
  if (value instanceof timestampCtor) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
  timestampCtor: typeof Timestamp,
): CardInstallment | null {
  const {
    userId,
    cardId,
    kind,
    creditLine,
    madnessPrincipal,
    principal,
    monthlyAddOnRate,
    termMonths,
    processingFee,
    bookedOn,
    notes,
  } = data
  if (
    typeof userId !== 'string' ||
    typeof cardId !== 'string' ||
    (creditLine !== 'regular' && creditLine !== 'madness') ||
    typeof principal !== 'number' ||
    typeof monthlyAddOnRate !== 'number' ||
    typeof termMonths !== 'number' ||
    !Number.isInteger(termMonths) ||
    termMonths < 1 ||
    typeof bookedOn !== 'string' ||
    !INSTALLMENT_DATE_PATTERN.test(bookedOn)
  ) {
    return null
  }

  return {
    id,
    userId,
    cardId,
    ...(kind === 'credit-to-cash' || kind === 'purchase' ? { kind } : {}),
    creditLine,
    ...(creditLine === 'madness' && typeof madnessPrincipal === 'number' && madnessPrincipal > 0
      ? { madnessPrincipal }
      : {}),
    principal,
    monthlyAddOnRate,
    termMonths,
    bookedOn,
    ...(typeof processingFee === 'number' ? { processingFee } : {}),
    ...(typeof notes === 'string' && notes.trim() ? { notes } : {}),
    createdAt: toIso(data.createdAt, timestampCtor),
  }
}

export function subscribeCardInstallments(
  userId: string,
  onData: (plans: CardInstallment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return

      const q = fs.query(fs.collection(db, COLLECTION), fs.where('userId', '==', userId))
      unsubscribe = fs.onSnapshot(
        q,
        (snapshot) => {
          const items: CardInstallment[] = []
          let invalidId: string | null = null
          for (const docSnap of snapshot.docs) {
            const mapped = mapDoc(docSnap.id, docSnap.data(), fs.Timestamp)
            if (mapped) {
              items.push(mapped)
            } else {
              invalidId = docSnap.id
            }
          }
          onData(items)
          if (invalidId) {
            onError(new Error(`Installment plan ${invalidId} has invalid or incomplete data.`))
          }
        },
        (error) => onError(error),
      )
    })
    .catch((err: unknown) => {
      if (!disposed) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    })

  return () => {
    disposed = true
    unsubscribe()
  }
}

function toPayload(input: CardInstallmentInput): Record<string, unknown> {
  return {
    cardId: input.cardId,
    kind: input.kind ?? 'credit-to-cash',
    creditLine: input.creditLine,
    madnessPrincipal: input.madnessPrincipal ?? null,
    principal: input.principal,
    monthlyAddOnRate: input.monthlyAddOnRate,
    termMonths: input.termMonths,
    bookedOn: input.bookedOn,
    processingFee: input.processingFee ?? null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  }
}

export async function createCardInstallment(
  userId: string,
  input: CardInstallmentInput,
  id?: string,
): Promise<string> {
  validateCardInstallmentInput(input)
  const { fs, db } = await getFirestoreClient()
  const payload = { ...toPayload(input), userId, createdAt: fs.serverTimestamp() }

  if (id) {
    await fs.setDoc(fs.doc(db, COLLECTION, id), payload)
    return id
  }
  const ref = await fs.addDoc(fs.collection(db, COLLECTION), payload)
  return ref.id
}

export async function updateCardInstallment(id: string, input: CardInstallmentInput): Promise<void> {
  validateCardInstallmentInput(input)
  const { fs, db } = await getFirestoreClient()
  await fs.updateDoc(fs.doc(db, COLLECTION, id), toPayload(input))
}

export async function deleteCardInstallment(id: string): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.deleteDoc(fs.doc(db, COLLECTION, id))
}
