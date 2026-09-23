import { describe, expect, it } from 'vitest'
import type { CreditCard } from '../types/creditCard'
import {
  computeAggregateCashback,
  computeCashbackForTransaction,
  computeStatement,
  getCurrentCashbackForTransaction,
  resolveCashbackRateForCategory,
} from './creditCards'

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

  it('infers the correct Amore grocery rate for legacy cards that only saved the wildcard fallback', () => {
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

    expect(resolveCashbackRateForCategory(legacyCard, 'Groceries')).toBe(4)
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

  it('awards cashback only on full Php 1,000 blocks for Amore transactions', () => {
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
    } as CreditCard

    expect(computeCashbackForTransaction(card, {
      id: 'tx-amore-1',
      userId: 'user-1',
      type: 'expense',
      amount: 2295.06,
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

  it('defaults legacy Amore cards to a 1000 minimum spend when the field is missing', () => {
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
    })).toBe(0)

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

    expect(computeCashbackForTransaction(card, {
      id: 'tx-start-1',
      userId: 'user-1',
      type: 'expense',
      amount: 1000,
      category: 'Groceries',
      description: 'Groceries',
      occurredAt: '2024-01-10T00:00:00Z',
      createdAt: '2024-01-10T00:00:00Z',
      creditCardId: 'card-starting-balance',
      creditCardPayment: false,
    })).toBe(10)
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
