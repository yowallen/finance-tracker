import { useEffect, useMemo, useState } from 'react'
import {
  createCardInstallment,
  deleteCardInstallment,
  subscribeCardInstallments,
} from '../services/cardInstallments'
import type { CardInstallment, CardInstallmentInput } from '../types/cardInstallment'

export function useCardInstallments(userId: string | undefined) {
  const [plans, setPlans] = useState<CardInstallment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      return
    }

    const unsubscribe = subscribeCardInstallments(
      userId,
      (items) => {
        setPlans(items)
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

  const visiblePlans = useMemo(() => (userId ? plans : []), [userId, plans])

  async function add(input: CardInstallmentInput, id?: string): Promise<string> {
    if (!userId) throw new Error('Missing user id.')
    return createCardInstallment(userId, input, id)
  }

  async function remove(id: string): Promise<void> {
    await deleteCardInstallment(id)
  }

  return {
    plans: visiblePlans,
    loading: userId ? loading : false,
    error,
    add,
    remove,
  }
}
