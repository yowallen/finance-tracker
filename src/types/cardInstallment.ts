/** Which credit line an installment plan draws from. */
export type InstallmentCreditLine = 'regular' | 'madness'

/** Credit-to-Cash turns limit into cash; a purchase is a product bought on installment. */
export type InstallmentKind = 'credit-to-cash' | 'purchase'

export interface CardInstallment {
  id: string
  userId: string
  cardId: string
  /** Missing on plans saved before purchases existed; treat as Credit-to-Cash. */
  kind?: InstallmentKind
  creditLine: InstallmentCreditLine
  /**
   * Part of the principal on the Madness Limit when a Madness-line plan spills over to the
   * regular limit. Missing means the whole principal is on `creditLine`.
   */
  madnessPrincipal?: number
  /** Cash received or purchase price, in pesos. */
  principal: number
  /** Monthly add-on rate as a percentage, e.g. 1 for 1%. */
  monthlyAddOnRate: number
  termMonths: number
  /** One-time service fee posted to the card; not deducted from the cash received. */
  processingFee?: number
  /** Date the plan was booked, YYYY-MM-DD. */
  bookedOn: string
  notes?: string
  createdAt: string
}

export interface CardInstallmentInput {
  cardId: string
  kind?: InstallmentKind
  creditLine: InstallmentCreditLine
  madnessPrincipal?: number
  principal: number
  monthlyAddOnRate: number
  termMonths: number
  processingFee?: number
  bookedOn: string
  notes?: string
}

/** One computed monthly amortization of a plan. */
export interface InstallmentScheduleRow {
  number: number
  /** Statement date the amortization bills on. */
  billingDate: Date
  principalPortion: number
  interestPortion: number
  amount: number
}

/** Per-card rollup of installment plans as of a date. */
export interface CardInstallmentSummary {
  plan: CardInstallment
  monthlyPayment: number
  billedCount: number
  remainingCount: number
  /** Principal not yet billed to a statement. */
  unbilledPrincipal: number
  nextBillingDate: Date | null
  totalInterest: number
}

export const INSTALLMENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function installmentKind(plan: Pick<CardInstallment, 'kind'>): InstallmentKind {
  return plan.kind ?? 'credit-to-cash'
}

export function installmentLabel(plan: Pick<CardInstallment, 'kind' | 'notes'>): string {
  const notes = plan.notes?.trim()
  if (notes) return notes
  return installmentKind(plan) === 'purchase' ? 'Installment purchase' : 'Credit-to-Cash'
}

/** Share of the principal (0 to 1) that sits on the Madness Limit. */
export function madnessShare(plan: Pick<CardInstallment, 'creditLine' | 'madnessPrincipal' | 'principal'>): number {
  if (plan.creditLine !== 'madness' || plan.principal <= 0) return 0
  if (plan.madnessPrincipal === undefined) return 1
  return Math.min(1, Math.max(0, plan.madnessPrincipal / plan.principal))
}

export function validateCardInstallmentInput(input: CardInstallmentInput): void {
  if (!input.cardId) {
    throw new Error('Choose a card for this plan.')
  }
  if (input.kind !== undefined && input.kind !== 'credit-to-cash' && input.kind !== 'purchase') {
    throw new Error('Unknown installment type.')
  }
  if (input.creditLine !== 'regular' && input.creditLine !== 'madness') {
    throw new Error('Choose the credit line this plan uses.')
  }
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  if (
    input.madnessPrincipal !== undefined &&
    (input.creditLine !== 'madness' ||
      !Number.isFinite(input.madnessPrincipal) ||
      input.madnessPrincipal <= 0 ||
      input.madnessPrincipal > input.principal)
  ) {
    throw new Error('The Madness Limit portion must be between zero and the full amount.')
  }
  if (!Number.isFinite(input.monthlyAddOnRate) || input.monthlyAddOnRate < 0 || input.monthlyAddOnRate > 10) {
    throw new Error('Monthly add-on rate must be between 0% and 10%.')
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 60) {
    throw new Error('Term must be between 1 and 60 months.')
  }
  if (input.processingFee !== undefined && (!Number.isFinite(input.processingFee) || input.processingFee < 0)) {
    throw new Error('Service fee must be zero or greater.')
  }
  if (!INSTALLMENT_DATE_PATTERN.test(input.bookedOn) || Number.isNaN(new Date(`${input.bookedOn}T00:00:00`).getTime())) {
    throw new Error('Booking date is invalid.')
  }
}
