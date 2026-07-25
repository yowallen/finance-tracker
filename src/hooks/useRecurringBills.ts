import { useEffect, useMemo, useState } from 'react'
import {
  buildBillReminders,
  createRecurringBill,
  deleteRecurringBill,
  subscribeRecurringBills,
  updateRecurringBill,
} from '../services/recurringBills'
import type { RecurringBill, RecurringBillInput } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'

export function useRecurringBills(
  userId: string | undefined,
  year: number,
  month: number,
  monthTransactions: Transaction[],
) {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setBills([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeRecurringBills(
      userId,
      (items) => {
        setBills(items)
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

  const reminders = useMemo(
    () => buildBillReminders(bills, monthTransactions, year, month),
    [bills, monthTransactions, year, month],
  )

  async function add(input: RecurringBillInput): Promise<void> {
    if (!userId) throw new Error('Missing user id.')
    await createRecurringBill(userId, input)
  }

  async function update(id: string, input: RecurringBillInput): Promise<void> {
    await updateRecurringBill(id, input)
  }

  async function remove(id: string): Promise<void> {
    await deleteRecurringBill(id)
  }

  return {
    bills,
    reminders,
    loading,
    error,
    add,
    update,
    remove,
  }
}
