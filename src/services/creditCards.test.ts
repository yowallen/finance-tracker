import { describe, expect, it } from 'vitest'
import type { CreditCard } from '../types/creditCard'
import type { Transaction } from '../types/transaction'
import {
  awardedCashbackForTransaction,
  cardsCanShareLimit,
  computeAggregateCashback,
  computeCashbackForTransaction,
  computePointsForTransaction,
  computePoolStatement,
  computeStatement,
  computeTotalAvailableCredit,
  computeTotalOutstanding,
  getCurrentCashbackForTransaction,
  groupCreditCards,
  resolveCashbackRateForCategory,
} from './creditCards'
import { computeMonthlySummary } from './transactions'
import { buildInstallmentCharges, summarizeCardInstallments } from './cardInstallments'
import type { CardInstallment } from '../types/cardInstallment'

function mapLegacyCreditCardDocForTest(data: Record<string, unknown>) {
  const normalizeLegacyCashbackRules = (value: unknown) => {
    if (value === undefined || value === null) return undefined
    const bucket = Array.isArray(value) ? value : [value]
    const normalized = bucket
      .map((rule) => {
        if (!rule || typeof rule !== 'object') return null
        const rawRate = typeof (rule as Record<string, unknown>).rate === 'string'
          ? Number((rule as Record<string, unknown>).rate)
          : typeof (rule as Record<string, unknown>).rate === 'number'
            ? (rule as Record<string, unknown>).rate as number
            : undefined
        const rawCategories = Array.isArray((rule as Record<string, unknown>).categories)
          ? (rule as Record<string, unknown>).categories as unknown[]
          : typeof (rule as Record<string, unknown>).category === 'string'
            ? [(rule as Record<string, unknown>).category as string]
            : undefined

        if (rawRate === undefined || !rawCategories || rawCategories.length === 0) return null
        return {
          rate: rawRate,
          categories: rawCategories.map((item) => String(item).trim()).filter(Boolean),
        }
      })
      .filter((rule): rule is { rate: number; categories: string[] } => !!rule)

    return normalized.length > 0 ? normalized : undefined
  }

  const coerceNumeric = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return undefined
  }

  const coerceStringArray = (value: unknown) => {
    if (Array.isArray(value)) {
      const cleaned = value.map((item) => String(item).trim()).filter(Boolean)
      return cleaned.length > 0 ? cleaned : undefined
    }
    if (typeof value === 'string') {
      const cleaned = value.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
      return cleaned.length > 0 ? cleaned : undefined
    }
    return undefined
  }

  const limit = coerceNumeric(data.limit)
  const statementDay = coerceNumeric(data.statementDay)
  const dueDay = coerceNumeric(data.dueDay)
  const dueDayOffset = coerceNumeric(data.dueDayOffset)
  const cashbackCategories = coerceStringArray(data.cashbackCategories)
  const cashbackRules = normalizeLegacyCashbackRules(data.cashbackRules)

  if (
    typeof data.userId !== 'string' ||
    typeof data.name !== 'string' ||
    typeof data.lastFour !== 'string' ||
    limit === undefined ||
    statementDay === undefined ||
    (dueDay === undefined && dueDayOffset === undefined)
  ) {
    return null
  }

  return {
    id: 'legacy-card',
    userId: data.userId,
    name: data.name,
    lastFour: data.lastFour,
    limit,
    statementDay,
    ...(dueDay !== undefined ? { dueDay } : {}),
    ...(dueDayOffset !== undefined ? { dueDayOffset } : {}),
    ...(cashbackCategories ? { cashbackCategories } : {}),
    ...(cashbackRules ? { cashbackRules } : {}),
    active: typeof data.active === 'boolean' ? data.active : true,
    createdAt: '2024-01-01T00:00:00Z',
  } as CreditCard
}

describe('cashback perk rules', () => {
  it('awards one BPI Rewards point per complete Php 35 spend', () => {
    const card = {
      id: 'card-bpi-rewards',
      rewardType: 'points' as const,
      pointsPerSpend: 1,
      pointsSpendIncrement: 35,
    }

    const transaction = (amount: number) => ({
      type: 'expense' as const,
      amount,
      category: 'Shopping',
      description: 'Purchase',
      creditCardId: card.id,
    })

    expect(computePointsForTransaction(card, transaction(34))).toBe(0)
    expect(computePointsForTransaction(card, transaction(35))).toBe(1)
    expect(computePointsForTransaction(card, transaction(70))).toBe(2)
  })

  it('awards a 3% Petron rebate on fuel only', () => {
    const card = {
      id: 'card-petron',
      rewardType: 'cashback' as const,
      cashbackRules: [{ rate: 3, categories: ['Fuel'] }],
      cashbackMinSpend: 0,
      cashbackUsesFullThousandBlocks: false,
    }

    expect(computeCashbackForTransaction(card, {
      type: 'expense',
      amount: 1000,
      category: 'Fuel',
      description: 'Petron',
      creditCardId: card.id,
    })).toBe(30)
    expect(computeCashbackForTransaction(card, {
      type: 'expense',
      amount: 1000,
      category: 'Groceries',
      description: 'Supermarket',
      creditCardId: card.id,
    })).toBe(0)
    expect(resolveCashbackRateForCategory(card, 'Gasoline')).toBe(3)
  })

  it('stops Petron fuel rebates at 15000 for the calendar year', () => {
    const card = {
      id: 'card-petron-cap',
      rewardType: 'cashback' as const,
      cashbackRules: [{ rate: 3, categories: ['Fuel'] }],
      cashbackMinSpend: 0,
      cashbackYearlyCap: 15000,
    }
    const fuel = (id: string, amount: number, occurredAt: string) => ({
      id,
      type: 'expense' as const,
      amount,
      category: 'Fuel',
      description: 'Petron',
      creditCardId: card.id,
      occurredAt,
      creditCardPayment: false as const,
    })
    const january = fuel('jan', 400000, '2026-01-10T00:00:00Z')
    const june = fuel('jun', 120000, '2026-06-10T00:00:00Z')
    const july = fuel('jul', 1000, '2026-07-01T00:00:00Z')
    const nextYear = fuel('next', 1000, '2027-01-02T00:00:00Z')
    const history = [january, june, july, nextYear]

    expect(awardedCashbackForTransaction(card, january, history)).toBe(12000)
    expect(awardedCashbackForTransaction(card, june, history)).toBe(3000)
    expect(awardedCashbackForTransaction(card, july, history)).toBe(0)
    expect(awardedCashbackForTransaction(card, nextYear, history)).toBe(30)
  })

  it('awards one EastWest point per complete Php 100 spend', () => {
    const card = {
      id: 'card-eastwest',
      rewardType: 'points' as const,
      pointsPerSpend: 1,
      pointsSpendIncrement: 100,
    }

    expect(computePointsForTransaction(card, {
      type: 'expense',
      amount: 5831,
      category: 'Shopping',
      description: 'Purchase',
      creditCardId: card.id,
    })).toBe(58)
  })

  it('awards one Metrobank Platinum point per complete Php 20 spend', () => {
    const card = {
      id: 'card-metrobank',
      rewardType: 'points' as const,
      pointsPerSpend: 1,
      pointsSpendIncrement: 20,
    }

    expect(computePointsForTransaction(card, {
      type: 'expense',
      amount: 5000,
      category: 'Shopping',
      description: 'Purchase',
      creditCardId: card.id,
    })).toBe(250)
  })

  it('awards one UnionBank Rewards Platinum point per complete Php 30 spend', () => {
    const card = {
      id: 'card-unionbank',
      rewardType: 'points' as const,
      pointsPerSpend: 1,
      pointsSpendIncrement: 30,
    }

    const transaction = (amount: number) => ({
      type: 'expense' as const,
      amount,
      category: 'Shopping',
      description: 'Purchase',
      creditCardId: card.id,
    })

    expect(computePointsForTransaction(card, transaction(30))).toBe(1)
    expect(computePointsForTransaction(card, transaction(29))).toBe(0)
  })

  it('awards UnionBank triple points on food and shopping', () => {
    const card = {
      id: 'card-unionbank-bonus',
      rewardType: 'points' as const,
      pointsPerSpend: 1,
      pointsSpendIncrement: 30,
      pointsRules: [
        { pointsPerSpend: 3, pointsSpendIncrement: 30, categories: ['Food', 'Shopping'] },
        { pointsPerSpend: 1, pointsSpendIncrement: 30, categories: ['*'] },
      ],
    }
    const purchase = (amount: number, category: string) => ({
      type: 'expense' as const,
      amount,
      category,
      description: 'Purchase',
      creditCardId: card.id,
    })

    expect(computePointsForTransaction(card, purchase(3000, 'Food'))).toBe(300)
    expect(computePointsForTransaction(card, purchase(3000, 'Dining'))).toBe(300)
    expect(computePointsForTransaction(card, purchase(3000, 'Shopping'))).toBe(300)
    expect(computePointsForTransaction(card, purchase(3000, 'Groceries'))).toBe(100)
  })

  it('does not calculate cashback from stale rules on a points card', () => {
    const card = {
      id: 'card-bpi-rewards',
      rewardType: 'points' as const,
      cashbackRules: [{ rate: 5, categories: ['Shopping'] }],
      cashbackMinSpend: 0,
    }

    expect(computeCashbackForTransaction(card, {
      type: 'expense',
      amount: 1000,
      category: 'Shopping',
      description: 'Purchase',
      creditCardId: card.id,
    })).toBe(0)
  })

  it('prefers category-specific rates before a fallback all-else rate', () => {
    const card = {
      id: 'card-1',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '1234',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 0.3,
      cashbackCategories: ['*'],
      cashbackRules: [
        { id: 'grocery', rate: 1, categories: ['groceries', 'food'] },
        { id: 'default', rate: 0.3, categories: ['*'] },
      ],
    } satisfies Partial<CreditCard> as CreditCard

    expect(resolveCashbackRateForCategory(card, 'Groceries')).toBe(1)
    expect(resolveCashbackRateForCategory(card, 'Transport')).toBe(0.3)
  })

  it('uses the BPI Amore Cashback Classic rates with wildcard fallback and exact category priority', () => {
    const card = {
      id: 'card-1',
      userId: 'user-1',
      name: 'BPI Amore Cashback Classic',
      lastFour: '1234',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 0.3,
      cashbackRules: [
        { id: 'all-other', rate: 0.3, categories: ['*'] },
        { id: 'groceries', rate: 4, categories: ['Groceries', 'Supermarket'] },
        { id: 'utilities', rate: 1, categories: ['Utilities', 'Drug Store', 'Drug Stores'] },
      ],
      cashbackMinSpend: 1000,
    } as CreditCard

    expect(resolveCashbackRateForCategory(card, 'Groceries')).toBe(4)
    expect(resolveCashbackRateForCategory(card, 'Utilities')).toBe(1)
    expect(resolveCashbackRateForCategory(card, 'Shopping')).toBe(0.3)
  })

  it('accepts legacy card docs with stringified dates and cashback rule payloads', () => {
    const legacyCard = mapLegacyCreditCardDocForTest({
      userId: 'user-1',
      name: 'Legacy Amore',
      lastFour: '1234',
      limit: '200000',
      statementDay: '15',
      dueDayOffset: '21',
      active: true,
      cashbackRules: [
        { rate: '1', categories: ['Groceries'] },
        { rate: '0.3', categories: ['*'] },
      ],
    })

    expect(legacyCard).not.toBeNull()
    expect(legacyCard?.dueDayOffset).toBe(21)
    expect(legacyCard?.cashbackRules?.[0]?.rate).toBe(1)
    expect(resolveCashbackRateForCategory(legacyCard as CreditCard, 'Groceries')).toBe(1)
    expect(resolveCashbackRateForCategory(legacyCard as CreditCard, 'Transport')).toBe(0.3)
  })

  it('uses the explicit wildcard rule when no category-specific rule exists', () => {
    const legacyCard = {
      id: 'card-legacy-amore',
      userId: 'user-1',
      name: 'BPI Amore Cashback Card',
      lastFour: '4444',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 0.3,
      rewardName: 'BPI Amore Cashback',
      cashbackRules: [{ id: 'default', rate: 0.3, categories: ['*'] }],
      cashbackMinSpend: 1000,
    } as CreditCard

    expect(resolveCashbackRateForCategory(legacyCard, 'Groceries')).toBe(0.3)
    expect(resolveCashbackRateForCategory(legacyCard, 'Shopping')).toBe(0.3)
  })

  it('computes cashback for each individual credit-card transaction', () => {
    const card = {
      id: 'card-1',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '1234',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 0.3,
      cashbackRules: [
        { id: 'grocery', rate: 1, categories: ['Groceries'] },
        { id: 'default', rate: 0.3, categories: ['*'] },
      ],
      cashbackMinSpend: 1000,
    } as CreditCard

    expect(computeCashbackForTransaction(card, {
      id: 'tx-1',
      userId: 'user-1',
      type: 'expense',
      amount: 7500,
      category: 'Groceries',
      description: 'Market run',
      occurredAt: '2024-01-10T00:00:00Z',
      createdAt: '2024-01-10T00:00:00Z',
      creditCardId: 'card-1',
      creditCardPayment: false,
    })).toBe(75)

    expect(computeCashbackForTransaction(card, {
      id: 'tx-2',
      userId: 'user-1',
      type: 'bill',
      amount: 1800,
      category: 'Utilities',
      description: 'Meralco',
      occurredAt: '2024-01-12T00:00:00Z',
      createdAt: '2024-01-12T00:00:00Z',
      creditCardId: 'card-1',
      creditCardPayment: false,
    })).toBe(5.4)

    expect(computeCashbackForTransaction(card, {
      id: 'tx-3',
      userId: 'user-1',
      type: 'expense',
      amount: 999,
      category: 'Shopping',
      description: 'Small purchase',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-1',
      creditCardPayment: false,
    })).toBe(0)
  })

  it('awards cashback from complete 1,000-peso blocks for the Classic preset', () => {
    const card = {
      id: 'card-amore-1000',
      userId: 'user-1',
      name: 'BPI Amore Cashback Card',
      lastFour: '1234',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 0.3,
      cashbackRules: [
        { id: 'grocery', rate: 4, categories: ['Groceries', 'Supermarket', 'Supermarkets'] },
        { id: 'default', rate: 0.3, categories: ['*'] },
      ],
      cashbackMinSpend: 1000,
      cashbackUsesFullThousandBlocks: true,
    } as CreditCard

    expect(computeCashbackForTransaction(card, {
      id: 'tx-amore-1',
      userId: 'user-1',
      type: 'expense',
      amount: 2225,
      category: 'Groceries',
      description: 'Supermarket purchase',
      occurredAt: '2024-01-10T00:00:00Z',
      createdAt: '2024-01-10T00:00:00Z',
      creditCardId: 'card-amore-1000',
      creditCardPayment: false,
    })).toBe(80)

    expect(computeCashbackForTransaction(card, {
      id: 'tx-amore-2',
      userId: 'user-1',
      type: 'expense',
      amount: 1500,
      category: 'Groceries',
      description: 'One receipt',
      occurredAt: '2024-01-11T00:00:00Z',
      createdAt: '2024-01-11T00:00:00Z',
      creditCardId: 'card-amore-1000',
      creditCardPayment: false,
    })).toBe(40)
  })

  it('ignores stale saved cashback values when a transaction is below the minimum spend', () => {
    const card = {
      id: 'card-1',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '1234',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 0.3,
      cashbackRules: [
        { id: 'default', rate: 0.3, categories: ['*'] },
      ],
      cashbackMinSpend: 1000,
    } as CreditCard

    const tx = {
      id: 'tx-4',
      userId: 'user-1',
      type: 'expense' as const,
      amount: 999,
      category: 'Shopping',
      description: 'Small purchase',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-1',
      creditCardPayment: false,
      cashbackEarned: 12.3,
    }

    expect(computeCashbackForTransaction(card, tx)).toBe(0)
    expect(getCurrentCashbackForTransaction(card, tx)).toBe(0)
  })

  it('aggregates cashback for reward cards in the overview summary', () => {
    const cards: CreditCard[] = [
      {
        id: 'card-1',
        userId: 'user-1',
        name: 'BPI Amore',
        lastFour: '1234',
        limit: 200000,
        statementDay: 15,
        active: true,
        createdAt: '2024-01-01T00:00:00Z',
        cashbackRate: 1,
        cashbackRules: [{ id: 'default', rate: 1, categories: ['*'] }],
      },
      {
        id: 'card-2',
        userId: 'user-1',
        name: 'Standard Visa',
        lastFour: '5678',
        limit: 150000,
        statementDay: 15,
        active: true,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]

    const transactions = [
      {
        id: 'tx-1',
        userId: 'user-1',
        type: 'expense' as const,
        amount: 4500,
        category: 'Groceries',
        description: 'Groceries',
        occurredAt: '2024-01-10T00:00:00Z',
        createdAt: '2024-01-10T00:00:00Z',
        creditCardId: 'card-1',
        creditCardPayment: false,
      },
      {
        id: 'tx-2',
        userId: 'user-1',
        type: 'expense' as const,
        amount: 5000,
        category: 'Shopping',
        description: 'Shopping',
        occurredAt: '2024-01-12T00:00:00Z',
        createdAt: '2024-01-12T00:00:00Z',
        creditCardId: 'card-1',
        creditCardPayment: false,
      },
      {
        id: 'tx-3',
        userId: 'user-1',
        type: 'expense' as const,
        amount: 2000,
        category: 'Dining',
        description: 'Dinner',
        occurredAt: '2024-01-14T00:00:00Z',
        createdAt: '2024-01-14T00:00:00Z',
        creditCardId: 'card-2',
        creditCardPayment: false,
      },
    ]

    expect(computeAggregateCashback(cards, transactions, 2024, 0)).toBe(95)
  })

  it('does not infer a minimum spend when the field is missing', () => {
    const legacyCard = {
      id: 'card-legacy',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '4321',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 1,
      cashbackRules: [{ id: 'default', rate: 1, categories: ['*'] }],
    } as CreditCard

    expect(computeCashbackForTransaction(legacyCard, {
      id: 'tx-legacy',
      userId: 'user-1',
      type: 'expense',
      amount: 999,
      category: 'Groceries',
      description: 'Legacy grocery',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-legacy',
      creditCardPayment: false,
    })).toBe(9.99)

    expect(computeCashbackForTransaction(legacyCard, {
      id: 'tx-legacy-2',
      userId: 'user-1',
      type: 'expense',
      amount: 1000,
      category: 'Groceries',
      description: 'Legacy grocery minimum',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-legacy',
      creditCardPayment: false,
    })).toBe(10)
  })

  it('does not pay cashback on annual-fee entries', () => {
    const card = {
      id: 'card-annual-fee',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '7777',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 1,
      cashbackRules: [{ id: 'default', rate: 1, categories: ['*'] }],
      cashbackMinSpend: 1000,
    } as CreditCard

    expect(computeCashbackForTransaction(card, {
      id: 'tx-annual-fee',
      userId: 'user-1',
      type: 'bill',
      amount: 2050,
      category: 'Fees',
      description: 'BPI Amore CC Annual Fee',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-annual-fee',
      creditCardPayment: false,
    })).toBe(0)

    expect(computeCashbackForTransaction(card, {
      id: 'tx-annual-fee-category',
      userId: 'user-1',
      type: 'bill',
      amount: 2050,
      category: 'Fee',
      description: 'Card fee',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-annual-fee',
      creditCardPayment: false,
    })).toBe(0)

    expect(computeCashbackForTransaction(card, {
      id: 'tx-annual-fee-flag',
      userId: 'user-1',
      type: 'expense',
      amount: 2500,
      category: 'Shopping',
      description: 'Card fee',
      occurredAt: '2024-01-13T00:00:00Z',
      createdAt: '2024-01-13T00:00:00Z',
      creditCardId: 'card-annual-fee',
      creditCardPayment: false,
      isAnnualFee: true,
    })).toBe(0)
  })

  it('adds a starting cashback balance to the current statement total', () => {
    const card = {
      id: 'card-starting-balance',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '9999',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 1,
      cashbackRules: [{ id: 'default', rate: 1, categories: ['*'] }],
      cashbackMinSpend: 1000,
      cashbackStartingBalance: 1255,
      cashbackCap: 10000,
    } as CreditCard

    const transactions = [{
      id: 'tx-start-1',
      userId: 'user-1',
      type: 'expense' as const,
      amount: 1000,
      category: 'Groceries',
      description: 'Groceries',
      occurredAt: '2024-01-10T00:00:00Z',
      createdAt: '2024-01-10T00:00:00Z',
      creditCardId: 'card-starting-balance',
      creditCardPayment: false,
    }]

    const statement = computeStatement(card, transactions, 2024, 0)
    expect(statement.cashbackEarned).toBe(1265)
    expect(statement.availableCashback).toBe(1265)
  })

  it('stacks cashback from earlier statement periods', () => {
    const card = {
      id: 'card-stack',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '2222',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 1,
      cashbackRules: [{ id: 'default', rate: 1, categories: ['*'] }],
      cashbackMinSpend: 0,
    } as CreditCard

    const transactions = [
      {
        id: 'tx-jan',
        userId: 'user-1',
        type: 'expense' as const,
        amount: 5000,
        category: 'Groceries',
        description: 'January spend',
        occurredAt: '2024-01-10T00:00:00Z',
        createdAt: '2024-01-10T00:00:00Z',
        creditCardId: 'card-stack',
        creditCardPayment: false,
      },
      {
        id: 'tx-feb',
        userId: 'user-1',
        type: 'expense' as const,
        amount: 3000,
        category: 'Groceries',
        description: 'February spend',
        occurredAt: '2024-02-10T00:00:00Z',
        createdAt: '2024-02-10T00:00:00Z',
        creditCardId: 'card-stack',
        creditCardPayment: false,
      },
    ]

    const january = computeStatement(card, transactions, 2024, 0)
    const february = computeStatement(card, transactions, 2024, 1)
    expect(january.availableCashback).toBe(50)
    expect(february.availableCashback).toBe(80)
  })

  it('reduces available cashback by redeemed amount', () => {
    const card = {
      id: 'card-redeem',
      userId: 'user-1',
      name: 'BPI Amore',
      lastFour: '1111',
      limit: 200000,
      statementDay: 15,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      cashbackRate: 1,
      cashbackRules: [{ id: 'default', rate: 1, categories: ['*'] }],
      cashbackMinSpend: 1000,
      cashbackStartingBalance: 100,
      cashbackRedeemed: 25,
    } as CreditCard

    const transactions = [{
      id: 'tx-redeem-1',
      userId: 'user-1',
      type: 'expense' as const,
      amount: 2000,
      category: 'Groceries',
      description: 'Groceries',
      occurredAt: '2024-01-10T00:00:00Z',
      createdAt: '2024-01-10T00:00:00Z',
      creditCardId: 'card-redeem',
      creditCardPayment: false,
    }]

    const statement = computeStatement(card, transactions, 2024, 0)
    expect(statement.cashbackEarned).toBe(120)
    expect(statement.cashbackRedeemed).toBe(25)
    expect(statement.availableCashback).toBe(95)
  })
})

describe('interest grace period', () => {
  const card: CreditCard = {
    id: 'amore',
    userId: 'user-1',
    name: 'BPI Amore',
    lastFour: '5877',
    limit: 50000,
    statementDay: 16,
    dueDay: 5,
    apr: 36,
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
  }

  function tx(id: string, amount: number, occurredAt: string, payment = false): Transaction {
    return {
      id,
      userId: 'user-1',
      type: payment ? 'bill' : 'expense',
      amount,
      category: payment ? 'Credit Card' : 'Food',
      description: id,
      occurredAt,
      createdAt: occurredAt,
      creditCardId: card.id,
      ...(payment ? { creditCardPayment: true } : {}),
    }
  }

  const septemberCharge = tx('sep-charge', 3904.5, '2026-09-10T12:00:00')
  const octoberCharge = tx('oct-charge', 1000, '2026-10-01T12:00:00')

  it('charges no interest when the previous statement is paid in full before its due date', () => {
    const payment = tx('payment', 3904.5, '2026-09-30T12:00:00', true)
    const statement = computeStatement(card, [septemberCharge, octoberCharge, payment], 2026, 9)

    expect(statement.previousBalance).toBe(3904.5)
    expect(statement.interestCharged).toBe(0)
    expect(statement.statementBalance).toBe(1000)
  })

  it('charges interest when only part of the previous statement is paid', () => {
    const payment = tx('payment', 1000, '2026-09-30T12:00:00', true)
    const statement = computeStatement(card, [septemberCharge, octoberCharge, payment], 2026, 9)

    expect(statement.interestCharged).toBeGreaterThan(0)
  })

  it('charges interest when the full payment arrives after the due date', () => {
    const payment = tx('payment', 3904.5, '2026-10-08T12:00:00', true)
    const statement = computeStatement(card, [septemberCharge, octoberCharge, payment], 2026, 9)

    expect(statement.interestCharged).toBeGreaterThan(0)
  })
})

describe('cashback statement credit', () => {
  const card: CreditCard = {
    id: 'cashback-card',
    userId: 'user-1',
    name: 'BPI Amore',
    lastFour: '5877',
    limit: 50000,
    statementDay: 16,
    dueDay: 5,
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    rewardType: 'cashback',
    cashbackMinSpend: 0,
    cashbackStartingBalance: 200,
  }

  const purchase: Transaction = {
    id: 'purchase',
    userId: 'user-1',
    type: 'expense',
    amount: 5000,
    category: 'Food',
    description: 'Dinner',
    occurredAt: '2026-09-25T12:00:00',
    createdAt: '2026-09-25T12:00:00',
    creditCardId: card.id,
  }

  const credit: Transaction = {
    id: 'credit',
    userId: 'user-1',
    type: 'income',
    amount: 150,
    category: 'Cashback',
    description: 'Cashback credit',
    occurredAt: '2026-10-05T12:00:00',
    createdAt: '2026-10-05T12:00:00',
    creditCardId: card.id,
    cashbackCredit: true,
  }

  it('lowers the statement balance and available cashback', () => {
    const before = computeStatement(card, [purchase], 2026, 9)
    const after = computeStatement(card, [purchase, credit], 2026, 9)

    expect(after.statementBalance).toBeCloseTo(before.statementBalance - 150, 2)
    expect(after.outstandingBalance).toBeCloseTo(before.outstandingBalance - 150, 2)
    expect(after.cashbackRedeemed).toBeCloseTo(before.cashbackRedeemed + 150, 2)
    expect(after.availableCashback).toBeCloseTo(before.availableCashback - 150, 2)
  })

  it('still counts as redeemed when viewing an earlier statement', () => {
    const september = computeStatement(card, [purchase, credit], 2026, 8)
    expect(september.cashbackRedeemed).toBe(150)
  })

  it('is not counted as cash income', () => {
    const salary: Transaction = { ...credit, id: 'salary', amount: 20000, category: 'Salary', creditCardId: undefined, cashbackCredit: undefined }
    expect(computeMonthlySummary([credit, salary]).income).toBe(20000)
  })
})

describe('shared credit limit', () => {
  function card(partial: Partial<CreditCard> & Pick<CreditCard, 'id' | 'name'>): CreditCard {
    return {
      userId: 'user-1',
      lastFour: '1111',
      limit: 50000,
      statementDay: 15,
      dueDayOffset: 20,
      active: true,
      createdAt: '2024-01-01T00:00:00Z',
      ...partial,
    }
  }

  function charge(id: string, creditCardId: string, amount: number): Transaction {
    return {
      id,
      userId: 'user-1',
      type: 'expense',
      amount,
      category: 'Food',
      description: id,
      occurredAt: '2026-09-10T00:00:00Z',
      createdAt: '2026-09-10T00:00:00Z',
      creditCardId,
    }
  }

  const rewards = card({ id: 'rewards', name: 'BPI Rewards', lastFour: '1234', sharedLimitGroupId: 'bpi-line', sharedLimitPrimary: true, issuer: 'bpi' })
  const amore = card({ id: 'amore', name: 'BPI Amore', lastFour: '5877', sharedLimitGroupId: 'bpi-line', issuer: 'bpi', createdAt: '2024-02-01T00:00:00Z' })

  it('keeps one 50000 limit when either card is charged', () => {
    const transactions = [charge('a', 'rewards', 20000), charge('b', 'amore', 10000)]
    const [pool] = groupCreditCards([rewards, amore])
    const statement = computePoolStatement(pool, transactions, 2026, 8)

    expect(pool.primary.id).toBe('rewards')
    expect(statement.outstandingBalance).toBe(30000)
    expect(statement.availableCredit).toBe(20000)
    expect(statement.transactions).toHaveLength(2)
  })

  it('does not double-count the shared limit in totals', () => {
    const transactions = [charge('a', 'rewards', 20000)]
    expect(computeTotalOutstanding([rewards, amore], transactions, 2026, 8)).toBe(20000)
    expect(computeTotalAvailableCredit([rewards, amore], transactions, 2026, 8)).toBe(30000)
  })

  it('shows BPI Cashback grocery cashback when the card has no stored rules', () => {
    const cashback = card({
      id: 'cashback',
      name: 'BPI Cashback',
      rewardType: 'cashback',
      sharedLimitGroupId: 'bpi-line',
      issuer: 'bpi',
    })
    const grocery = { ...charge('sm', 'cashback', 8000), category: 'Groceries' }
    const [pool] = groupCreditCards([rewards, cashback])
    const statement = computePoolStatement(pool, [grocery], 2026, 8)
    expect(statement.cashbackEarned).toBe(320)
  })

  it('awards the cashback card perk on a shared line', () => {
    const cashback = card({
      id: 'amore',
      name: 'BPI Amore',
      lastFour: '5877',
      sharedLimitGroupId: 'bpi-line',
      issuer: 'bpi',
      createdAt: '2024-02-01T00:00:00Z',
      rewardType: 'cashback',
      cashbackMinSpend: 0,
      cashbackRules: [
        { rate: 4, categories: ['Groceries'] },
        { rate: 0.3, categories: ['*'] },
      ],
    })
    const grocery = {
      ...charge('grocery', 'amore', 8000),
      category: 'Groceries',
    }
    const [pool] = groupCreditCards([rewards, cashback])
    const statement = computePoolStatement(pool, [grocery], 2026, 8)
    expect(statement.cashbackEarned).toBe(320)
    expect(statement.transactions.find((tx) => tx.id === 'grocery')?.creditCardId).toBe('amore')
  })

  it('waives interest on a shared line when the previous statement was paid by its due date', () => {
    const rewardsWithApr = { ...rewards, apr: 36, statementDay: 16, dueDay: 5, dueDayOffset: undefined }
    const amoreWithApr = { ...amore, apr: 36, statementDay: 16, dueDay: 5, dueDayOffset: undefined }
    const [pool] = groupCreditCards([rewardsWithApr, amoreWithApr])
    const transactions: Transaction[] = [
      { ...charge('sep-charge', 'amore', 3904.5), occurredAt: '2026-09-10T12:00:00' },
      { ...charge('oct-charge', 'rewards', 1000), occurredAt: '2026-10-01T12:00:00' },
      { ...charge('payment', 'amore', 3904.5), type: 'bill', creditCardPayment: true, occurredAt: '2026-09-30T12:00:00' },
    ]

    expect(computePoolStatement(pool, transactions, 2026, 9).interestCharged).toBe(0)
  })

  it('refuses a shared limit between different banks', () => {
    const metrobank = card({ id: 'metro', name: 'Metrobank Platinum', issuer: 'metrobank' })
    expect(cardsCanShareLimit(rewards, amore)).toBe(true)
    expect(cardsCanShareLimit(rewards, metrobank)).toBe(false)
  })
})

describe('Credit-to-Cash on the card', () => {
  const card: CreditCard = {
    id: 'amore',
    userId: 'user-1',
    name: 'BPI Amore Cashback',
    lastFour: '5877',
    limit: 100000,
    madnessLimit: 60000,
    madnessUsed: 1000,
    statementDay: 16,
    dueDay: 5,
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
  }

  function plan(creditLine: CardInstallment['creditLine']): CardInstallment {
    return {
      id: `plan-${creditLine}`,
      userId: 'user-1',
      cardId: card.id,
      creditLine,
      principal: 50000,
      monthlyAddOnRate: 1,
      termMonths: 12,
      bookedOn: '2026-10-10',
      createdAt: '2026-10-10T00:00:00Z',
    }
  }

  function statementFor(creditLine: CardInstallment['creditLine'], extra: Transaction[] = []) {
    const plans = [plan(creditLine)]
    const transactions = [...extra, ...buildInstallmentCharges(plans, [card])]
    const summaries = summarizeCardInstallments([card.id], plans, [card], new Date(2026, 9, 31, 23, 59, 59, 999))
    return computeStatement(card, transactions, 2026, 9, summaries)
  }

  it('puts the first installment on the statement', () => {
    const statement = statementFor('regular')

    expect(statement.newCharges).toBeCloseTo(4666.67, 2)
    expect(statement.statementBalance).toBeCloseTo(4666.67, 2)
    expect(statement.transactions[0].installmentNumber).toBe(1)
  })

  it('holds unbilled principal against the regular limit', () => {
    const statement = statementFor('regular')

    expect(statement.availableCredit).toBeCloseTo(100000 - 4666.67 - 45833.33, 2)
    expect(statement.madnessUsedEffective).toBe(1000)
  })

  it('uses the Madness Limit instead of regular credit for a Madness plan', () => {
    const statement = statementFor('madness')

    expect(statement.statementBalance).toBeCloseTo(4666.67, 2)
    expect(statement.availableCredit).toBe(100000)
    expect(statement.madnessUsedEffective).toBeCloseTo(1000 + 45833.33, 2)
  })

  it('splits an installment purchase across the Madness and regular limits by share', () => {
    const split: CardInstallment = {
      ...plan('madness'),
      id: 'plan-split',
      kind: 'purchase',
      madnessPrincipal: 30000,
      monthlyAddOnRate: 0,
    }
    const transactions = buildInstallmentCharges([split], [card])
    const summaries = summarizeCardInstallments([card.id], [split], [card], new Date(2026, 9, 31, 23, 59, 59, 999))
    const statement = computeStatement(card, transactions, 2026, 9, summaries)
    const billed = 50000 / 12
    const unbilled = 50000 - billed

    expect(statement.statementBalance).toBeCloseTo(billed, 2)
    expect(statement.madnessUsedEffective).toBeCloseTo(1000 + unbilled * 0.6, 2)
    expect(statement.availableCredit).toBeCloseTo(100000 - billed * 0.4 - unbilled * 0.4, 2)
  })

  it('does not lower the card balance when the cash is recorded as income', () => {
    const proceeds: Transaction = {
      id: 'proceeds',
      userId: 'user-1',
      type: 'income',
      amount: 50000,
      category: 'Credit-to-Cash',
      description: 'Credit-to-Cash',
      occurredAt: '2026-10-10T12:00:00',
      createdAt: '2026-10-10T12:00:00',
      installmentPlanId: 'plan-regular',
    }
    const statement = statementFor('regular', [proceeds])

    expect(statement.paymentsCredits).toBe(0)
    expect(statement.outstandingBalance).toBeCloseTo(4666.67, 2)
  })
})

describe('cash advance', () => {
  const card: CreditCard = {
    id: 'free',
    userId: 'user-1',
    name: 'BPI Amore Cashback',
    lastFour: '1111',
    limit: 100000,
    statementDay: 1,
    dueDay: 21,
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    cashbackRules: [{ rate: 1, categories: ['*'] }],
  }

  function advance(id: string, amount: number, category: string): Transaction {
    return {
      id,
      userId: 'user-1',
      type: category === 'Fee' ? 'bill' : 'expense',
      amount,
      category,
      description: id,
      occurredAt: '2026-01-02T12:00:00',
      createdAt: '2026-01-02T12:00:00',
      creditCardId: card.id,
      cashAdvance: true,
      cashAdvanceMonthlyRate: 2.5,
    }
  }

  const cash = advance('cash', 20000, 'Cash advance')
  const fee = advance('fee', 200, 'Fee')

  it("matches BPI's sample: 20,000 + 200 fee at 2.5% over 31 days", () => {
    const statement = computeStatement(card, [cash, fee], 2026, 1)

    expect(Math.abs(statement.interestCharged - 521.62)).toBeLessThan(0.5)
  })

  it('charges interest from day one even though the card has no balance carried', () => {
    expect(computeStatement(card, [cash, fee], 2026, 1).previousBalance).toBe(0)
    expect(computeStatement(card, [cash, fee], 2026, 1).interestCharged).toBeGreaterThan(0)
  })

  it('keeps charging interest the next cycle while unpaid', () => {
    const statement = computeStatement(card, [cash, fee], 2026, 2)

    expect(statement.interestCharged).toBeCloseTo(20200 * 0.025 * (12 / 360) * 28, 2)
  })

  it('stops interest on the day the advance is paid', () => {
    const payment: Transaction = {
      id: 'payment',
      userId: 'user-1',
      type: 'bill',
      amount: 20200,
      category: 'Credit card payment',
      description: 'payment',
      occurredAt: '2026-02-10T12:00:00',
      createdAt: '2026-02-10T12:00:00',
      creditCardId: card.id,
      creditCardPayment: true,
    }
    const statement = computeStatement(card, [cash, fee, payment], 2026, 2)

    expect(statement.interestCharged).toBeCloseTo(20200 * 0.025 * (12 / 360) * 8, 2)
  })

  it('earns no cashback', () => {
    expect(computeCashbackForTransaction(card, cash)).toBe(0)
    expect(computeStatement(card, [cash, fee], 2026, 1).cashbackEligibleSpend).toBe(0)
  })
})
