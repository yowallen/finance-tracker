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
  /** True for a credit-card annual fee or card fee, which never earns cashback. */
  isAnnualFee?: boolean
  /** Required when type is savings. */
  savingsDirection?: SavingsDirection
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
  isAnnualFee?: boolean
  savingsDirection?: SavingsDirection
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
