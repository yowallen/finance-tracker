import type { Transaction } from './transaction'

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
  minimumPayment: number
  availableCredit: number
  isPaid: boolean
  transactions: Transaction[]
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
  projectedBalances: ProjectedBalance[]
  totalInterestIfMinPay: number
  monthsToPayoffMinPay: number
  totalInterestIfFixedPay: number
  monthsToPayoffFixedPay: number
  fixedPaymentAmount: number
}