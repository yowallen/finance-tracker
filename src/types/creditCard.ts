import type { Transaction } from './transaction'

export interface CashbackRule {
  id?: string
  label?: string
  rate: number
  categories: string[]
}

export function parseCashbackRules(input: string): CashbackRule[] {
  if (!input.trim()) return []

  const rules: CashbackRule[] = []

  for (const part of input.split(/[,;\n]/)) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const match = trimmed.match(/^(.+?)(?:\s*[:=]\s*|\s+)(\d+(?:\.\d+)?)\s*%?$/i)
    if (!match) continue

    const category = match[1].trim()
    const rate = Number.parseFloat(match[2])
    if (!category || Number.isNaN(rate) || rate < 0 || rate > 100) continue

    rules.push({
      id: category.toLowerCase().replace(/\s+/g, '-'),
      label: category,
      rate,
      categories: [category],
    })
  }

  return rules
}

export interface CreditCard {
  id: string
  userId: string
  name: string
  lastFour: string
  limit: number
  statementDay: number
  /** Actual calendar day the payment is due; legacy cards may use dueDayOffset. */
  dueDay?: number
  /** Legacy number of days after the statement date. */
  dueDayOffset?: number
  color?: string
  active: boolean
  createdAt: string
  /** Annual Percentage Rate (e.g., 3.5 for 3.5%) */
  apr?: number
  /** How interest is computed: 'daily' (daily balance) or 'monthly' (monthly balance) */
  interestCalculationMethod?: 'daily' | 'monthly'
  /** Grace period in days after due date before interest accrues */
  gracePeriodDays?: number
  /** Issuer-provided minimum payment override */
  minimumPaymentOverride?: number
  /** Reward name, such as "Amore Cashback". */
  rewardName?: string
  /** Default cashback rate as a percentage, e.g. 1 for 1%. */
  cashbackRate?: number
  /** Maximum cashback earned in one statement/period. */
  cashbackCap?: number
  /** Cashback already available at the start of the current statement period. */
  cashbackStartingBalance?: number
  /** Cashback already redeemed and no longer available to spend. */
  cashbackRedeemed?: number
  /** Minimum transaction amount in pesos needed before cashback is earned. */
  cashbackMinSpend?: number
  /** Legacy categories eligible for cashback; if omitted, all card spend qualifies. */
  cashbackCategories?: string[]
  /** Tiered perk rules, e.g. [{ rate: 1, categories: ['groceries'] }, { rate: 0.3, categories: ['*'] }]. */
  cashbackRules?: CashbackRule[]
}

export interface CreditCardInput {
  name: string
  lastFour: string
  limit: number
  statementDay: number
  dueDay?: number
  dueDayOffset?: number
  color?: string
  active?: boolean
  apr?: number
  interestCalculationMethod?: 'daily' | 'monthly'
  gracePeriodDays?: number
  minimumPaymentOverride?: number
  rewardName?: string
  cashbackRate?: number
  cashbackCap?: number
  cashbackStartingBalance?: number
  cashbackRedeemed?: number
  cashbackMinSpend?: number
  cashbackCategories?: string[]
  cashbackRules?: CashbackRule[]
}

export interface StatementPeriod {
  statementDate: Date
  dueDate: Date
  startDate: Date
  endDate: Date
}

export interface CreditCardStatement {
  card: CreditCard
  statementDate: Date
  dueDate: Date
  previousBalance: number
  newCharges: number
  paymentsCredits: number
  interestCharged: number
  statementBalance: number
  outstandingBalance: number
  minimumPayment: number
  availableCredit: number
  isPaid: boolean
  cashbackEligibleSpend: number
  cashbackEarned: number
  cashbackRedeemed: number
  availableCashback: number
  transactions: Transaction[]
  transactionHistory: Transaction[]
}

export const CARD_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6B7280', // gray
] as const

export function validateCreditCardInput(input: CreditCardInput): void {
  if (!input.name.trim()) {
    throw new Error('Card name is required.')
  }
  if (!/^\d{4}$/.test(input.lastFour)) {
    throw new Error('Last 4 digits must be exactly 4 numbers.')
  }
  if (!Number.isFinite(input.limit) || input.limit <= 0) {
    throw new Error('Credit limit must be a positive number.')
  }
  if (!Number.isInteger(input.statementDay) || input.statementDay < 1 || input.statementDay > 28) {
    throw new Error('Statement day must be between 1 and 28.')
  }
  if (input.dueDay === undefined && input.dueDayOffset === undefined) {
    throw new Error('Due day is required.')
  }
  if (input.dueDay !== undefined && (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)) {
    throw new Error('Due day must be between 1 and 31.')
  }
  if (input.dueDayOffset !== undefined && (!Number.isInteger(input.dueDayOffset) || input.dueDayOffset < 1 || input.dueDayOffset > 31)) {
    throw new Error('Due day offset must be between 1 and 31.')
  }
  if (input.apr !== undefined && (!Number.isFinite(input.apr) || input.apr < 0 || input.apr > 100)) {
    throw new Error('APR must be a number between 0 and 100.')
  }
  if (input.gracePeriodDays !== undefined && (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0 || input.gracePeriodDays > 60)) {
    throw new Error('Grace period must be a whole number between 0 and 60.')
  }
  if (input.minimumPaymentOverride !== undefined && (!Number.isFinite(input.minimumPaymentOverride) || input.minimumPaymentOverride < 0)) {
    throw new Error('Minimum payment override must be zero or greater.')
  }
  if (input.rewardName !== undefined && typeof input.rewardName !== 'string') {
    throw new Error('Reward name must be text if provided.')
  }
  if (input.cashbackRate !== undefined && (!Number.isFinite(input.cashbackRate) || input.cashbackRate < 0 || input.cashbackRate > 100)) {
    throw new Error('Cashback rate must be between 0 and 100.')
  }
  if (input.cashbackCap !== undefined && (!Number.isFinite(input.cashbackCap) || input.cashbackCap < 0)) {
    throw new Error('Cashback cap must be zero or greater.')
  }
  if (input.cashbackStartingBalance !== undefined && (!Number.isFinite(input.cashbackStartingBalance) || input.cashbackStartingBalance < 0)) {
    throw new Error('Starting cashback balance must be zero or greater.')
  }
  if (input.cashbackRedeemed !== undefined && (!Number.isFinite(input.cashbackRedeemed) || input.cashbackRedeemed < 0)) {
    throw new Error('Redeemed cashback must be zero or greater.')
  }
  if (input.cashbackMinSpend !== undefined && (!Number.isFinite(input.cashbackMinSpend) || input.cashbackMinSpend < 0)) {
    throw new Error('Cashback minimum spend must be zero or greater.')
  }
  if (input.cashbackCategories !== undefined && (
    !Array.isArray(input.cashbackCategories) ||
    input.cashbackCategories.some((category) => typeof category !== 'string' || !category.trim())
  )) {
    throw new Error('Cashback categories must be a list of text values.')
  }
  if (input.cashbackRules !== undefined && (
    !Array.isArray(input.cashbackRules) ||
    input.cashbackRules.some((rule) => {
      if (typeof rule?.rate !== 'number' || !Number.isFinite(rule.rate) || rule.rate < 0 || rule.rate > 100) {
        return true
      }
      return !Array.isArray(rule.categories) || rule.categories.some((category) => typeof category !== 'string' || !category.trim())
    })
  )) {
    throw new Error('Cashback rules must contain valid percentages and category lists.')
  }
}

/**
 * Interest projection types
 */
export interface ProjectedBalance {
  month: number  // 0 = current, 1 = next, etc.
  year: number
  startingBalance: number
  interestCharged: number
  payment: number
  endingBalance: number
  isPaidOff: boolean
}

export interface InterestProjection {
  cardId: string
  cardName: string
  apr: number
  currentBalance: number
  monthlyInterestRate: number
  dailyInterestRate: number
  minimumPaymentOverride?: number
  projectedBalances: ProjectedBalance[]
  projectedBalancesMinPay: ProjectedBalance[]
  totalInterestIfMinPay: number
  monthsToPayoffMinPay: number
  totalInterestIfFixedPay: number
  monthsToPayoffFixedPay: number
  fixedPaymentAmount: number
}

export interface UtilizationSnapshot {
  date: string
  year: number
  month: number
  outstandingBalance: number
  limit: number
  utilizationPercent: number
  cardId: string
}

export interface UtilizationHistory {
  cardId: string
  cardName: string
  limit: number
  snapshots: UtilizationSnapshot[]
  averageUtilization: number
  peakUtilization: { percent: number; date: string }
  currentUtilization: number
  trend: 'improving' | 'stable' | 'worsening'
}

export type PaymentAllocationStrategy =
  | 'highest-interest-first'
  | 'lowest-balance-first'
  | 'proportional'

export interface PaymentAllocation {
  cardId: string
  cardName: string
  cardApr: number
  currentBalance: number
  minimumPayment: number
  allocatedAmount: number
  isMinimumOnly: boolean
}

export interface PaymentAllocationPlan {
  strategy: PaymentAllocationStrategy
  totalPayment: number
  allocations: PaymentAllocation[]
  remainingUnallocated: number
}