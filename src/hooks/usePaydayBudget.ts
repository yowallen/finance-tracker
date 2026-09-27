import { useEffect, useMemo, useState } from 'react'
import {
  periodsOverlappingMonth,
  savePaydaySettings,
  subscribePaydaySettings,
  summarizePaydayPeriods,
} from '../services/paydayBudget'
import type { BillReminder } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'
import { DEFAULT_PAYDAY_SETTINGS, type PaydayPeriodSummary, type PaydaySettings } from '../types/paydayBudget'

export function usePaydayBudget(
  userId: string | undefined,
  year: number,
  month: number,
  transactions: Transaction[],
  reminders: BillReminder[],
  enabled = true,
) {
  const [settings, setSettings] = useState<PaydaySettings>(DEFAULT_PAYDAY_SETTINGS)
  const [loading, setLoading] = useState(Boolean(userId) && enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false)
      return undefined
    }
    const unsubscribe = subscribePaydaySettings(
      userId,
      (next) => {
        setSettings(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [userId, enabled])

  const periods = useMemo(
    () => {
      if (!enabled) return []
      return summarizePaydayPeriods(
        periodsOverlappingMonth(year, month, settings),
        settings,
        transactions,
        reminders,
      )
    },
    [enabled, year, month, settings, transactions, reminders],
  )

  async function save(next: PaydaySettings): Promise<void> {
    if (!enabled) throw new Error('Payday budget is not available on this host.')
    if (!userId) throw new Error('Missing user id.')
    setSettings(next)
    await savePaydaySettings(userId, next)
  }

  return {
    settings,
    periods,
    loading: enabled && userId ? loading : false,
    error: enabled ? error : null,
    save,
  }
}

export type { PaydayPeriodSummary }
