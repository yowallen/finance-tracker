import { useEffect, useMemo, useState } from 'react'
import {
  computeStatement,
  computeTotalAvailableCredit,
  computeTotalOutstanding,
  computeAggregateUtilization,
  buildUtilizationHistory,
  createCreditCard,
  deleteCreditCard,
  getNextDueStatement,
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

  const statements = useMemo(
    () => visibleCards.map((card) => computeStatement(card, allTransactions, year, month)),
    [visibleCards, allTransactions, year, month],
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
    () => visibleCards
      .filter((card) => card.active && card.apr && card.apr > 0)
      .map((card) => {
        const statement = computeStatement(card, allTransactions, year, month)
        return projectInterest(card, statement.statementBalance, 24)
      }),
    [visibleCards, allTransactions, year, month],
  )

  const utilizationHistories = useMemo(
    () => activeCards.map((card) => buildUtilizationHistory(card, allTransactions, year, month, 12)),
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

  async function add(input: CreditCardInput): Promise<void> {
    if (!userId) throw new Error('Missing user id.')
    await createCreditCard(userId, input)
  }

  async function update(id: string, input: CreditCardInput): Promise<void> {
    await updateCreditCard(id, input)
  }

  async function remove(id: string): Promise<void> {
    await deleteCreditCard(id)
  }

  return {
    cards: visibleCards,
    activeCards,
    statements,
    totalOutstanding,
    totalAvailableCredit,
    nextDueStatement,
    interestProjections,
    utilizationHistories,
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