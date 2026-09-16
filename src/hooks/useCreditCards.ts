import { useEffect, useMemo, useState } from 'react'
import {
  computeStatement,
  computeTotalAvailableCredit,
  computeTotalOutstanding,
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
      setCards([])
      setLoading(false)
      return
    }

    setLoading(true)
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

  const activeCards = useMemo(
    () => cards.filter((card) => card.active),
    [cards],
  )

  const statements = useMemo(
    () => cards.map((card) => computeStatement(card, allTransactions, year, month)),
    [cards, allTransactions, year, month],
  )

  const totalOutstanding = useMemo(
    () => computeTotalOutstanding(cards, allTransactions, year, month),
    [cards, allTransactions, year, month],
  )

  const totalAvailableCredit = useMemo(
    () => computeTotalAvailableCredit(cards, allTransactions, year, month),
    [cards, allTransactions, year, month],
  )

  const nextDueStatement = useMemo(
    () => getNextDueStatement(cards, allTransactions, year, month),
    [cards, allTransactions, year, month],
  )

  const interestProjections = useMemo(
    () => cards
      .filter((card) => card.active && card.apr && card.apr > 0)
      .map((card) => {
        const statement = computeStatement(card, allTransactions, year, month)
        return projectInterest(card, statement.statementBalance, 24)
      }),
    [cards, allTransactions, year, month],
  )

  const cardById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
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
    cards,
    activeCards,
    statements,
    totalOutstanding,
    totalAvailableCredit,
    nextDueStatement,
    interestProjections,
    cardById,
    loading,
    error,
    add,
    update,
    remove,
  }
}

export type UseCreditCardsReturn = ReturnType<typeof useCreditCards>