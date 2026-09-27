import { useEffect, useMemo, useState } from 'react'
import {
  computeMonthlySummary,
  createTransaction,
  createTransactionsBatch,
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
      return
    }

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

  const visibleAll = useMemo(() => (userId ? all : []), [userId, all])

  const monthly = useMemo(
    () => filterByMonth(visibleAll, year, month),
    [visibleAll, year, month],
  )

  const summary = useMemo(
    () => computeMonthlySummary(monthly),
    [monthly],
  )

  const existingImportKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const tx of visibleAll) {
      if (tx.importKey) keys.add(tx.importKey)
    }
    return keys
  }, [visibleAll])

  async function add(input: TransactionInput): Promise<void> {
    if (!userId) throw new Error('You must be signed in.')
    await createTransaction(userId, input)
  }

  async function addBatch(
    inputs: TransactionInput[],
  ): Promise<{ created: number; skipped: number }> {
    if (!userId) throw new Error('You must be signed in.')
    return createTransactionsBatch(userId, inputs, existingImportKeys)
  }

  async function update(id: string, input: TransactionInput): Promise<void> {
    await updateTransaction(id, input)
  }

  async function remove(id: string): Promise<void> {
    await deleteTransaction(id)
  }

  return {
    transactions: monthly,
    allTransactions: visibleAll,
    summary,
    existingImportKeys,
    loading: userId ? loading : false,
    error,
    add,
    addBatch,
    update,
    remove,
  }
}
