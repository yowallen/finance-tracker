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
import { buildInstallmentCharges, summarizeCardInstallments } from '../services/cardInstallments'
import type { CardInstallment } from '../types/cardInstallment'
import type { CreditCard, CreditCardInput } from '../types/creditCard'
import type { Transaction } from '../types/transaction'

const NO_PLANS: CardInstallment[] = []

export function useCreditCards(
  userId: string | undefined,
  allTransactions: Transaction[],
  year: number,
  month: number,
  installmentPlans: CardInstallment[] = NO_PLANS,
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

  /**
   * Ledger transactions plus computed installment amortizations; use for card math only.
   * Full-price installment purchases are dropped because their amortizations bill the card.
   */
  const cardTransactions = useMemo(() => {
    const ledger = allTransactions.some((tx) => tx.installmentPurchase === true)
      ? allTransactions.filter((tx) => tx.installmentPurchase !== true)
      : allTransactions
    return installmentPlans.length > 0
      ? [...ledger, ...buildInstallmentCharges(installmentPlans, visibleCards)]
      : ledger
  }, [allTransactions, installmentPlans, visibleCards])

  const installmentSummaries = useMemo(
    () => summarizeCardInstallments(
      visibleCards.map((card) => card.id),
      installmentPlans,
      visibleCards,
      new Date(year, month + 1, 0, 23, 59, 59, 999),
    ),
    [visibleCards, installmentPlans, year, month],
  )

  const statements = useMemo(
    () => pools.map((pool) => computePoolStatement(pool, cardTransactions, year, month, installmentSummaries)),
    [pools, cardTransactions, year, month, installmentSummaries],
  )

  const totalOutstanding = useMemo(
    () => computeTotalOutstanding(visibleCards, cardTransactions, year, month),
    [visibleCards, cardTransactions, year, month],
  )

  const totalAvailableCredit = useMemo(
    () => computeTotalAvailableCredit(visibleCards, cardTransactions, year, month, installmentSummaries),
    [visibleCards, cardTransactions, year, month, installmentSummaries],
  )

  const nextDueStatement = useMemo(
    () => getNextDueStatement(visibleCards, cardTransactions, year, month),
    [visibleCards, cardTransactions, year, month],
  )

  const interestProjections = useMemo(
    () => pools
      .filter((pool) => pool.primary.active && pool.primary.apr && pool.primary.apr > 0)
      .map((pool) => {
        const statement = computePoolStatement(pool, cardTransactions, year, month)
        return projectInterest(pool.primary, statement.outstandingBalance, 24)
      }),
    [pools, cardTransactions, year, month],
  )

  const utilizationHistories = useMemo(
    () => pools
      .filter((pool) => pool.cards.some((card) => card.active))
      .map((pool) => buildPoolUtilizationHistory(pool, cardTransactions, year, month, 12)),
    [pools, cardTransactions, year, month],
  )

  const aggregateCashback = useMemo(
    () => computeAggregateCashback(activeCards, cardTransactions, year, month),
    [activeCards, cardTransactions, year, month],
  )

  const aggregatePoints = useMemo(
    () => computeAggregatePoints(activeCards, cardTransactions, year, month),
    [activeCards, cardTransactions, year, month],
  )

  const aggregateUtilization = useMemo(
    () => computeAggregateUtilization(activeCards, cardTransactions, year, month),
    [activeCards, cardTransactions, year, month],
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
    cardTransactions,
    installmentSummaries,
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
