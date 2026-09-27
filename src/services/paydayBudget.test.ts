import { describe, expect, it } from 'vitest'
import { periodsOverlappingMonth, summarizePaydayPeriods } from './paydayBudget'
import type { BillReminder } from '../types/recurringBill'
import type { Transaction } from '../types/transaction'
import type { PaydaySettings } from '../types/paydayBudget'

function settings(partial: Partial<PaydaySettings>): PaydaySettings {
  return {
    schedule: 'custom',
    firstDay: 15,
    secondDay: 30,
    allowance: 10000,
    rollover: false,
    monthlyGross: 0,
    deMinimisPerPayday: 0,
    ...partial,
  }
}

function iso(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}T00:00:00`
}

function tx(
  type: Transaction['type'],
  year: number,
  month: number,
  day: number,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id: `${type}-${year}-${month}-${day}-${amount}`,
    userId: 'user',
    type,
    amount,
    category: 'Food',
    description: type,
    occurredAt: iso(year, month, day),
    createdAt: iso(year, month, day),
    ...extra,
  }
}

function ranges(year: number, month: number, first: number, second: number) {
  return periodsOverlappingMonth(year, month, { firstDay: first, secondDay: second }, new Date(2026, 8, 10))
    .map((period) => [period.start.getMonth(), period.start.getDate(), period.end.getMonth(), period.end.getDate()])
}

describe('payday periods', () => {
  it('splits a 15/30 September and moves a Sunday payday to Friday', () => {
    expect(ranges(2026, 8, 15, 30)).toEqual([
      [7, 29, 8, 15],
      [8, 16, 8, 30],
    ])
  })

  it('includes the tail of a 5/20 month and skips non-banking paydays', () => {
    expect(ranges(2026, 8, 5, 20)).toEqual([
      [7, 21, 8, 4],
      [8, 5, 8, 18],
      [8, 19, 9, 5],
    ])
  })

  it('uses 10/25 and a custom 5/26 pair', () => {
    expect(ranges(2026, 8, 10, 25).map((item) => [item[1], item[3]])).toEqual([
      [26, 10],
      [11, 25],
      [26, 9],
    ])
    expect(ranges(2026, 8, 5, 26).map((item) => [item[0], item[1], item[2], item[3]])).toEqual([
      [7, 27, 8, 4],
      [8, 5, 8, 25],
      [8, 26, 9, 5],
    ])
  })

  it('clamps a 30th payday in February and moves it off the weekend', () => {
    const periods = periodsOverlappingMonth(2026, 1, { firstDay: 15, secondDay: 30 }, new Date(2026, 1, 10))
    const ends = periods.map((period) => period.end.getDate())
    expect(ends).toContain(13)
    expect(ends).toContain(27)
  })

  it('rolls leftover and subtracts unpaid bills', () => {
    const schedule = settings({ firstDay: 15, secondDay: 30, allowance: 10000, rollover: true })
    const periods = periodsOverlappingMonth(2026, 8, schedule, new Date(2026, 8, 20))
    const reminders = [{
      status: 'unpaid',
      dueDate: new Date(2026, 8, 18),
      bill: { amount: 2000 },
      payWithCreditCard: false,
    }] as BillReminder[]
    const summaries = summarizePaydayPeriods(
      periods,
      schedule,
      [tx('expense', 2026, 8, 10, 4000), tx('income', 2026, 8, 16, 15000), tx('bill', 2026, 8, 20, 1000)],
      reminders,
      new Date(2026, 8, 20),
    )
    const active = summaries.find((period) => period.active)
    expect(active?.spent).toBe(1000)
    expect(active?.stillDue).toBe(2000)
    expect(active?.income).toBe(15000)
    // Prior visible period: allowance 10000 − expense 4000 = 6000 (no invented pre-history)
    expect(active?.rolloverIn).toBe(6000)
    expect(active?.left).toBe(13000)
    expect(active?.perDay).toBeCloseTo(13000 / active!.daysRemaining)
  })

  it('counts cash spend and card payments, but not card charges', () => {
    const schedule = settings({ firstDay: 15, secondDay: 30, allowance: 20000, rollover: false })
    const periods = periodsOverlappingMonth(2026, 8, schedule, new Date(2026, 8, 20))
    const summaries = summarizePaydayPeriods(
      periods,
      schedule,
      [
        tx('expense', 2026, 8, 18, 500),
        tx('expense', 2026, 8, 19, 3000, { creditCardId: 'card-1' }),
        tx('bill', 2026, 8, 20, 1500, { creditCardId: 'card-1', creditCardPayment: true }),
        tx('bill', 2026, 8, 21, 800, { creditCardId: 'card-1' }),
      ],
      [],
      new Date(2026, 8, 20),
    )
    const active = summaries.find((period) => period.active)
    expect(active?.spent).toBe(2000)
    expect(active?.left).toBe(18000)
  })

  it('funds from income when allowance is empty and rolls leftover', () => {
    const schedule = settings({ firstDay: 15, secondDay: 30, allowance: 0, rollover: true })
    const periods = periodsOverlappingMonth(2026, 8, schedule, new Date(2026, 8, 20))
    const summaries = summarizePaydayPeriods(
      periods,
      schedule,
      [
        tx('income', 2026, 8, 10, 20000),
        tx('expense', 2026, 8, 12, 5000),
        tx('income', 2026, 8, 16, 10000),
        tx('expense', 2026, 8, 18, 3000),
      ],
      [],
      new Date(2026, 8, 20),
    )
    // Prior period (through Sep 15): income 20000 − spent 5000 = 15000 leftover
    // Active (Sep 16–30): income 10000 + rollover 15000 − spent 3000 = 22000
    const active = summaries.find((period) => period.active)
    expect(active?.income).toBe(10000)
    expect(active?.spent).toBe(3000)
    expect(active?.rolloverIn).toBe(15000)
    expect(active?.left).toBe(22000)
  })

  it('shows the same bridging-period leftover in adjacent month views', () => {
    const schedule = settings({ firstDay: 15, secondDay: 30, allowance: 0, rollover: true })
    const transactions = [
      tx('income', 2026, 7, 10, 20000),
      tx('expense', 2026, 7, 12, 2000),
      tx('income', 2026, 7, 20, 10000),
      tx('expense', 2026, 7, 22, 1000),
      tx('income', 2026, 8, 5, 8000),
      tx('expense', 2026, 8, 8, 500),
    ]
    const august = summarizePaydayPeriods(
      periodsOverlappingMonth(2026, 7, schedule, new Date(2026, 7, 20)),
      schedule,
      transactions,
      [],
      new Date(2026, 7, 20),
    )
    const september = summarizePaydayPeriods(
      periodsOverlappingMonth(2026, 8, schedule, new Date(2026, 8, 20)),
      schedule,
      transactions,
      [],
      new Date(2026, 8, 20),
    )

    const key = (period: { start: Date; end: Date }) =>
      `${period.start.toISOString().slice(0, 10)}:${period.end.toISOString().slice(0, 10)}`

    const augustByKey = new Map(august.map((period) => [key(period), period]))
    for (const period of september) {
      const shared = augustByKey.get(key(period))
      if (!shared) continue
      expect(period.rolloverIn).toBeCloseTo(shared.rolloverIn)
      expect(period.left).toBeCloseTo(shared.left)
      expect(period.income).toBeCloseTo(shared.income)
      expect(period.spent).toBeCloseTo(shared.spent)
    }
  })
})
