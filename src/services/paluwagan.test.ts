import { describe, expect, it } from 'vitest'
import {
  getCurrentRound,
  markContribution,
  nextDueDate,
  nextRecipient,
  summarizePaluwagan,
} from './paluwagan'
import type { Paluwagan } from '../types/paluwagan'

function circle(overrides: Partial<Paluwagan> = {}): Paluwagan {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Office pot',
    contributionAmount: 1000,
    frequency: 'monthly',
    startDate: '2026-01-05',
    members: [
      { id: 'a', name: 'Ana', order: 0 },
      { id: 'b', name: 'Ben', order: 1 },
      { id: 'c', name: 'Cara', order: 2 },
    ],
    contributions: {},
    notes: '',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('paluwagan math', () => {
  it('computes monthly current round from start date', () => {
    const c = circle()
    expect(getCurrentRound(c, new Date(2026, 0, 5))).toBe(0)
    expect(getCurrentRound(c, new Date(2026, 1, 5))).toBe(1)
    expect(getCurrentRound(c, new Date(2026, 2, 20))).toBe(2)
    expect(getCurrentRound(c, new Date(2026, 5, 1))).toBe(2)
  })

  it('computes weekly rounds', () => {
    const c = circle({ frequency: 'weekly', startDate: '2026-03-01' })
    expect(getCurrentRound(c, new Date(2026, 2, 1))).toBe(0)
    expect(getCurrentRound(c, new Date(2026, 2, 8))).toBe(1)
    expect(getCurrentRound(c, new Date(2026, 2, 15))).toBe(2)
  })

  it('returns next recipient by order', () => {
    const c = circle()
    expect(nextRecipient(c, 0)?.name).toBe('Ana')
    expect(nextRecipient(c, 1)?.name).toBe('Ben')
    expect(nextRecipient(c, 2)?.name).toBe('Cara')
  })

  it('computes next due date for monthly and weekly', () => {
    const monthly = circle()
    const dueMonthly = nextDueDate(monthly, 1)
    expect(dueMonthly?.getFullYear()).toBe(2026)
    expect(dueMonthly?.getMonth()).toBe(1)
    expect(dueMonthly?.getDate()).toBe(5)

    const weekly = circle({ frequency: 'weekly', startDate: '2026-03-01' })
    const dueWeekly = nextDueDate(weekly, 2)
    expect(dueWeekly?.getFullYear()).toBe(2026)
    expect(dueWeekly?.getMonth()).toBe(2)
    expect(dueWeekly?.getDate()).toBe(15)
  })

  it('summarizes pot and paid counts', () => {
    const c = markContribution(
      markContribution(circle(), 'a', 0),
      'b',
      0,
    )
    const summary = summarizePaluwagan(c, new Date(2026, 0, 10))
    expect(summary.currentRound).toBe(0)
    expect(summary.potSize).toBe(3000)
    expect(summary.paidThisRound).toBe(2)
    expect(summary.nextRecipient?.name).toBe('Ana')
  })
})
