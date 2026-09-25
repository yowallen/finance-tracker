import { useEffect, useMemo, useState } from 'react'
import {
  computePoolStatement,
  computeTotalAvailableCredit,
  computeTotalOutstanding,
  computeAggregateCashback,
  computeAggregatePoints,
  computeAggregateUtilization,
  buildPoolUtilizationHistory,
  createCreditCard,
  deleteCreditCard,
  getNextDueStatement,
  groupCreditCards,
  projectInterest,
  subscribeCreditCards,
  updateCreditCard,
} from '../services/creditCards'
import type { CreditCard, CreditCardInput } from '../types/creditCard'
import type { Transaction } from '../types/transaction'

export function useCreditCards(
  userId: string | undefined,
  allTransactions: Transaction[],
  year: number,
  month: number,
) {
  const [cards, setCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      return
    }

    const unsubscribe = subscribeCreditCards(
      userId,
      (items) => {
        setCards(items)
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

  const visibleCards = useMemo(() => (userId ? cards : []), [userId, cards])

  const activeCards = useMemo(
    () => visibleCards.filter((card) => card.active),
    [visibleCards],
  )

  const pools = useMemo(() => groupCreditCards(visibleCards), [visibleCards])

  const statements = useMemo(
    () => pools.map((pool) => computePoolStatement(pool, allTransactions, year, month)),
    [pools, allTransactions, year, month],
  )

  const totalOutstanding = useMemo(
    () => computeTotalOutstanding(visibleCards, allTransactions, year, month),
    [visibleCards, allTransactions, year, month],
  )

  const totalAvailableCredit = useMemo(
    () => computeTotalAvailableCredit(visibleCards, allTransactions, year, month),
    [visibleCards, allTransactions, year, month],
  )

  const nextDueStatement = useMemo(
    () => getNextDueStatement(visibleCards, allTransactions, year, month),
    [visibleCards, allTransactions, year, month],
  )

  const interestProjections = useMemo(
    () => pools
      .filter((pool) => pool.primary.active && pool.primary.apr && pool.primary.apr > 0)
      .map((pool) => {
        const statement = computePoolStatement(pool, allTransactions, year, month)
        return projectInterest(pool.primary, statement.outstandingBalance, 24)
      }),
    [pools, allTransactions, year, month],
  )

  const utilizationHistories = useMemo(
    () => pools
      .filter((pool) => pool.cards.some((card) => card.active))
      .map((pool) => buildPoolUtilizationHistory(pool, allTransactions, year, month, 12)),
    [pools, allTransactions, year, month],
  )

  const aggregateCashback = useMemo(
    () => computeAggregateCashback(activeCards, allTransactions, year, month),
    [activeCards, allTransactions, year, month],
  )

  const aggregatePoints = useMemo(
    () => computeAggregatePoints(activeCards, allTransactions, year, month),
    [activeCards, allTransactions, year, month],
  )

  const aggregateUtilization = useMemo(
    () => computeAggregateUtilization(activeCards, allTransactions, year, month),
    [activeCards, allTransactions, year, month],
  )

  const cardById = useMemo(
    () => new Map(visibleCards.map((card) => [card.id, card])),
    [visibleCards],
  )

  async function add(input: CreditCardInput, id?: string): Promise<string> {
    if (!userId) throw new Error('Missing user id.')
    return createCreditCard(userId, input, id)
  }

  async function update(id: string, input: CreditCardInput): Promise<void> {
    await updateCreditCard(id, input)
  }

  async function remove(id: string): Promise<void> {
    await deleteCreditCard(id)
  }

  return {
    cards: visibleCards,
    pools,
    activeCards,
    statements,
    totalOutstanding,
    totalAvailableCredit,
    nextDueStatement,
    interestProjections,
    utilizationHistories,
    aggregateCashback,
    aggregatePoints,
    aggregateUtilization,
    cardById,
    loading: userId ? loading : false,
    error,
    add,
    update,
    remove,
  }
}

export type UseCreditCardsReturn = ReturnType<typeof useCreditCards>