export type TransactionType = 'income' | 'expense' | 'bill' | 'savings'

/** Deposit moves cash into the savings pot; withdraw moves it back. */
export type SavingsDirection = 'deposit' | 'withdraw'

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  category: string
  description: string
  /** ISO date string for when the transaction occurred (date only). */
  occurredAt: string
  createdAt: string
  /** Links a payment to a recurring monthly bill reminder. */
  recurringBillId?: string
  /** Links a transaction to a credit card. */
  creditCardId?: string
  /** Cashback earned on this card charge for the applicable reward rate. */
  cashbackEarned?: number
  /** True when this transaction is a payment toward a credit card balance. */
  creditCardPayment?: boolean
  /** True for redeemed cashback posted as a card credit; lowers the card balance but is not cash income. */
  cashbackCredit?: boolean
  /** True for a credit-card annual fee or card fee, which never earns cashback. */
  isAnnualFee?: boolean
  /** True for a cash advance or its fee; earns no rewards and accrues interest from posting. */
  cashAdvance?: boolean
  /** Monthly finance charge rate (percent) applied to a cash advance, e.g. 3 for 3%. */
  cashAdvanceMonthlyRate?: number
  /** Links a transaction to an installment plan (proceeds, service fee, purchase, or a computed amortization). */
  installmentPlanId?: string
  /**
   * Full price of a product bought on installment. Counts in spending stats but never in card
   * balances; the plan's monthly amortizations bill the card instead.
   */
  installmentPurchase?: boolean
  /** 1-based amortization number; only set on computed installment charges, never stored. */
  installmentNumber?: number
  /** Total amortizations in the plan; only set on computed installment charges. */
  installmentTerm?: number
  /** Required when type is savings. */
  savingsDirection?: SavingsDirection
  /** Fingerprint for CSV/SMS import dedupe (source + date + amount + description). */
  importKey?: string
}

export interface TransactionInput {
  type: TransactionType
  amount: number
  category: string
  description: string
  occurredAt: string
  recurringBillId?: string
  creditCardId?: string
  cashbackEarned?: number
  creditCardPayment?: boolean
  cashbackCredit?: boolean
  isAnnualFee?: boolean
  cashAdvance?: boolean
  cashAdvanceMonthlyRate?: number
  installmentPlanId?: string
  installmentPurchase?: boolean
  savingsDirection?: SavingsDirection
  importKey?: string
}

/** Cash income only: excludes redeemed cashback posted as a card credit. */
export function isCashIncome(tx: Pick<Transaction, 'type' | 'cashbackCredit'>): boolean {
  return tx.type === 'income' && tx.cashbackCredit !== true
}

export interface MonthlySummary {
  income: number
  expenses: number
  bills: number
  /** Net moved into the savings pot this month (deposits − withdrawals). */
  savings: number
  net: number
  count: number
}

/** One category row in a monthly spending breakdown. */
export interface SpendingCategoryStat {
  category: string
  amount: number
  percent: number
  count: number
}

export interface MonthlySpendingStats {
  total: number
  categories: SpendingCategoryStat[]
}

/** Deposits / withdrawals for one month's savings activity. */
export interface MonthlySavingsStats {
  deposits: number
  withdrawals: number
  /** deposits − withdrawals for the month */
  net: number
  depositCount: number
  withdrawCount: number
  /** Pot balance after all savings txs through the end of this month */
  potBalance: number
}

export const CATEGORIES: Record<TransactionType, string[]> = {
  income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
  expense: ['Food', 'Groceries', 'Shopping', 'Entertainment', 'Health', 'Fuel', 'Other'],
  bill: ['Rent', 'Utilities', 'Phone', 'Subscription', 'Insurance', 'Loan', 'Fee', 'Other'],
  savings: ['Savings deposit', 'Savings withdrawal'],
}

export function isSavingsDeposit(tx: Pick<Transaction, 'type' | 'savingsDirection'>): boolean {
  return tx.type === 'savings' && tx.savingsDirection !== 'withdraw'
}

export function isSavingsWithdraw(tx: Pick<Transaction, 'type' | 'savingsDirection'>): boolean {
  return tx.type === 'savings' && tx.savingsDirection === 'withdraw'
}

/** Running total in the shared savings pot from ledger entries. */
export function computeSavingsPotTotal(transactions: Transaction[]): number {
  let saved = 0
  for (const tx of transactions) {
    if (tx.type !== 'savings') continue
    if (tx.savingsDirection === 'withdraw') saved -= tx.amount
    else saved += tx.amount
  }
  return Math.max(0, saved)
}
