import { describe, expect, it } from 'vitest'
import type { CardInstallment } from '../types/cardInstallment'
import type { CreditCard } from '../types/creditCard'
import {
  bpiCashAdvanceLimitPercent,
  bpiCreditToCashRate,
  bpiCreditToCashServiceFee,
  buildInstallmentCharges,
  computeInstallmentSchedule,
  computeMonthlyInstallment,
  splitInstallmentPurchase,
  summarizeCardInstallments,
  supportsBpiCashFeatures,
} from './cardInstallments'

const card: CreditCard = {
  id: 'amore',
  userId: 'user-1',
  name: 'BPI Amore Cashback',
  lastFour: '5877',
  limit: 100000,
  statementDay: 16,
  dueDay: 5,
  active: true,
  createdAt: '2024-01-01T00:00:00Z',
}

function plan(partial: Partial<CardInstallment> = {}): CardInstallment {
  return {
    id: 'plan-1',
    userId: 'user-1',
    cardId: card.id,
    creditLine: 'regular',
    principal: 50000,
    monthlyAddOnRate: 1,
    termMonths: 12,
    bookedOn: '2026-10-10',
    createdAt: '2026-10-10T00:00:00Z',
    ...partial,
  }
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

describe('Credit-to-Cash schedule', () => {
  it('matches the BPI factor rate for a 6-month term', () => {
    expect(computeMonthlyInstallment(10000, 6, 1)).toBeCloseTo(1766.67, 2)
  })

  it('bills principal plus add-on interest monthly and absorbs rounding in the last month', () => {
    const rows = computeInstallmentSchedule(plan(), card)

    expect(rows).toHaveLength(12)
    expect(rows[0].amount).toBeCloseTo(4666.67, 2)
    expect(rows[11].principalPortion).toBeCloseTo(4166.63, 2)
    expect(rows.reduce((sum, row) => sum + row.principalPortion, 0)).toBeCloseTo(50000, 2)
    expect(rows.reduce((sum, row) => sum + row.interestPortion, 0)).toBeCloseTo(6000, 2)
  })

  it('bills on the next statement date when booked before the statement day', () => {
    const rows = computeInstallmentSchedule(plan({ bookedOn: '2026-10-10' }), card)
    expect(ymd(rows[0].billingDate)).toBe('2026-10-16')
  })

  it('waits for the following statement when booked on or after the statement day', () => {
    expect(ymd(computeInstallmentSchedule(plan({ bookedOn: '2026-10-16' }), card)[0].billingDate)).toBe('2026-11-16')
    expect(ymd(computeInstallmentSchedule(plan({ bookedOn: '2026-10-20' }), card)[0].billingDate)).toBe('2026-11-16')
  })

  it('rolls over into the next year', () => {
    const rows = computeInstallmentSchedule(plan({ bookedOn: '2026-12-20', termMonths: 6 }), card)
    expect(ymd(rows[0].billingDate)).toBe('2027-1-16')
    expect(ymd(rows[5].billingDate)).toBe('2027-6-16')
  })

  it('builds one card charge per amortization that never earns rewards', () => {
    const charges = buildInstallmentCharges([plan()], [card])

    expect(charges).toHaveLength(12)
    expect(charges[0]).toMatchObject({
      creditCardId: card.id,
      installmentPlanId: 'plan-1',
      installmentNumber: 1,
      installmentTerm: 12,
      type: 'bill',
    })
  })

  it('summarizes billed and unbilled principal as of a date', () => {
    const [summary] = summarizeCardInstallments([card.id], [plan()], [card], new Date(2026, 10, 30, 23, 59, 59))

    expect(summary.billedCount).toBe(2)
    expect(summary.remainingCount).toBe(10)
    expect(summary.unbilledPrincipal).toBeCloseTo(41666.66, 2)
    expect(ymd(summary.nextBillingDate!)).toBe('2026-12-16')
  })
})

describe('installment purchases', () => {
  it('uses the Madness Limit when it covers the price', () => {
    expect(splitInstallmentPurchase(30000, 50000, 80000)).toEqual({
      creditLine: 'madness',
      madnessPortion: 30000,
      regularPortion: 0,
    })
  })

  it('puts what the Madness Limit cannot cover on the regular limit', () => {
    expect(splitInstallmentPurchase(70000, 50000, 80000)).toEqual({
      creditLine: 'madness',
      madnessPrincipal: 50000,
      madnessPortion: 50000,
      regularPortion: 20000,
    })
  })

  it('falls back to the regular limit when the Madness Limit is used up', () => {
    expect(splitInstallmentPurchase(20000, 0, 80000)).toEqual({
      creditLine: 'regular',
      madnessPortion: 0,
      regularPortion: 20000,
    })
  })

  it('refuses a price above both lines combined', () => {
    expect(splitInstallmentPurchase(150000, 50000, 80000)).toBeNull()
  })

  it('labels amortizations with the item name', () => {
    const [first] = buildInstallmentCharges(
      [plan({ kind: 'purchase', notes: 'iPhone 17', monthlyAddOnRate: 0, principal: 60000 })],
      [card],
    )
    expect(first.description).toBe('iPhone 17 installment 1/12')
    expect(first.amount).toBe(5000)
  })
})

describe('BPI presets', () => {
  it('charges a 500 service fee up to 50,000 and 700 above', () => {
    expect(bpiCreditToCashServiceFee(50000)).toBe(500)
    expect(bpiCreditToCashServiceFee(50001)).toBe(700)
  })

  it('uses 0.99% for 36 months and 1% otherwise', () => {
    expect(bpiCreditToCashRate(36)).toBe(0.99)
    expect(bpiCreditToCashRate(12)).toBe(1)
  })

  it('picks the cash advance limit share from the card name', () => {
    expect(bpiCashAdvanceLimitPercent({ name: 'BPI Amore Platinum Cashback' })).toBe(100)
    expect(bpiCashAdvanceLimitPercent({ name: 'BPI Signature' })).toBe(100)
    expect(bpiCashAdvanceLimitPercent({ name: 'BPI Gold Rewards' })).toBe(70)
    expect(bpiCashAdvanceLimitPercent({ name: 'BPI Amore Cashback' })).toBe(30)
  })

  it('offers cash features on BPI cards except Omni, Free+ and eCredit', () => {
    expect(supportsBpiCashFeatures({ name: 'BPI Amore Cashback' })).toBe(true)
    expect(supportsBpiCashFeatures({ name: 'BPI Omni' })).toBe(false)
    expect(supportsBpiCashFeatures({ name: 'BPI Free+' })).toBe(false)
    expect(supportsBpiCashFeatures({ name: 'Metrobank Platinum' })).toBe(false)
  })
})
