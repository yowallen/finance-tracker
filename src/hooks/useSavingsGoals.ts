import { useEffect, useMemo, useState } from 'react'
import {
  buildSavingsJourney,
  createSavingsGoal,
  deleteSavingsGoal,
  recordSavingsTransfer,
  subscribeSavingsGoals,
  subscribeSavingsPool,
  updateSavingsGoal,
} from '../services/savingsGoals'
import type { SavingsGoal, SavingsGoalInput } from '../types/savingsGoal'
import type { SavingsPool } from '../types/savingsGoal'
import {
  computeSavingsPotTotal,
  type Transaction,
} from '../types/transaction'

export function useSavingsGoals(
  userId: string | undefined,
  transactions: Transaction[],
) {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [pool, setPool] = useState<SavingsPool | null>(null)
  const [goalsLoading, setGoalsLoading] = useState(Boolean(userId))
  const [poolLoading, setPoolLoading] = useState(Boolean(userId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      return undefined
    }

    const unsubscribe = subscribeSavingsGoals(
      userId,
      (items) => {
        setGoals(items)
        setGoalsLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setGoalsLoading(false)
      },
    )

    return unsubscribe
  }, [userId])

  useEffect(() => {
    if (!userId) {
      return undefined
    }

    const unsubscribe = subscribeSavingsPool(
      userId,
      (next) => {
        setPool(next)
        setPoolLoading(false)
      },
      (err) => {
        setError(err.message)
        setPoolLoading(false)
      },
    )

    return unsubscribe
  }, [userId])

  const hasSavingsTx = useMemo(
    () => transactions.some((tx) => tx.type === 'savings'),
    [transactions],
  )

  const savedFromTx = useMemo(
    () => computeSavingsPotTotal(transactions),
    [transactions],
  )

  const legacyPool = pool?.savedAmount ?? 0

  const savedAmount = hasSavingsTx
    ? savedFromTx
    : Math.max(savedFromTx, legacyPool)

  const journey = useMemo(() => {
    if (!userId) {
      return buildSavingsJourney([], 0)
    }
    return buildSavingsJourney(goals, savedAmount)
  }, [userId, goals, savedAmount])

  async function add(input: SavingsGoalInput): Promise<void> {
    if (!userId) throw new Error('You must be signed in.')
    await createSavingsGoal(userId, input)
  }

  async function update(id: string, input: SavingsGoalInput): Promise<void> {
    await updateSavingsGoal(id, input)
  }

  async function contribute(amount: number): Promise<void> {
    if (!userId) throw new Error('You must be signed in.')
    await recordSavingsTransfer(userId, amount, {
      currentSaved: savedAmount,
      seedLegacyPool: !hasSavingsTx && legacyPool > 0 ? legacyPool : 0,
    })
  }

  async function remove(id: string): Promise<void> {
    await deleteSavingsGoal(id)
  }

  return {
    goals: userId ? goals : [],
    journey,
    loading: Boolean(userId) && (goalsLoading || poolLoading),
    error: userId ? error : null,
    add,
    update,
    contribute,
    remove,
  }
}
