import { useEffect, useMemo, useState } from 'react'
import {
  buildBillReminders,
  createRecurringBill,
  deleteRecurringBill,
  subscribeRecurringBills,
  updateRecurringBill,
} from '../services/recurringBills'
import {
  generateCreditCardPaymentBills,
  creditCardBillToReminder,
} from '../services/creditCardBills'
import type { RecurringBill, RecurringBillInput } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'
import type { CreditCard, CreditCardStatement } from '../types/creditCard'

export function useRecurringBills(
  userId: string | undefined,
  year: number,
  month: number,
  monthTransactions: Transaction[],
  cards: CreditCard[],
  statements: CreditCardStatement[],
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

  // Generate credit card payment bills from cards and statements
  const ccPaymentBills = useMemo(
    () => generateCreditCardPaymentBills(cards, statements),
    [cards, statements],
  )

  // Combine regular reminders with credit card payment reminders
  const reminders = useMemo(() => {
    const regularReminders = buildBillReminders(bills, monthTransactions, year, month)
    const ccReminders = ccPaymentBills.map((ccBill) =>
      creditCardBillToReminder(ccBill, year, month, monthTransactions),
    )
    // Sort: overdue/due-soon first, then by due day
    const all = [...regularReminders, ...ccReminders]
    return all.sort((a, b) => {
      const rank: Record<string, number> = {
        overdue: 0,
        'due-soon': 1,
        upcoming: 2,
        unpaid: 3,
        paid: 4,
      }
      const aRank = rank[a.status] ?? 99
      const bRank = rank[b.status] ?? 99
      return aRank - bRank || a.dueDate.getTime() - b.dueDate.getTime()
    })
  }, [bills, monthTransactions, year, month, ccPaymentBills])

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
