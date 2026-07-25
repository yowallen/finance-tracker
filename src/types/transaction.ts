export type TransactionType = 'income' | 'expense' | 'bill'

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
}

export interface TransactionInput {
  type: TransactionType
  amount: number
  category: string
  description: string
  occurredAt: string
  recurringBillId?: string
}

export interface MonthlySummary {
  income: number
  expenses: number
  bills: number
  net: number
  count: number
}

export const CATEGORIES: Record<TransactionType, string[]> = {
  income: ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
  expense: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Other'],
  bill: ['Rent', 'Utilities', 'Internet', 'Phone', 'Subscription', 'Insurance', 'Loan', 'Other'],
}
