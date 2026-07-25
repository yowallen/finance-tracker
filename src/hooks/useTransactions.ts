import { useEffect, useMemo, useState } from 'react'
import {
  computeMonthlySummary,
  createTransaction,
  deleteTransaction,
  filterByMonth,
  subscribeTransactions,
  updateTransaction,
} from '../services/transactions'
import type { Transaction, TransactionInput } from '../types/transaction'

export function useTransactions(userId: string | undefined, year: number, month: number) {
  const [all, setAll] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setAll([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeTransactions(
      userId,
      (transactions) => {
        setAll(transactions)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [userId])

  const monthly = useMemo(
    () => filterByMonth(all, year, month),
    [all, year, month],
  )

  const summary = useMemo(
    () => computeMonthlySummary(monthly),
    [monthly],
  )

  async function add(input: TransactionInput): Promise<void> {
    if (!userId) throw new Error('You must be signed in.')
    await createTransaction(userId, input)
  }

  async function update(id: string, input: TransactionInput): Promise<void> {
    await updateTransaction(id, input)
  }

  async function remove(id: string): Promise<void> {
    await deleteTransaction(id)
  }

  return {
    transactions: monthly,
    allTransactions: all,
    summary,
    loading,
    error,
    add,
    update,
    remove,
  }
}
