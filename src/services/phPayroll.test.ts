import { describe, expect, it } from 'vitest'
import { estimatePayslip, monthlyWithholdingTax } from './phPayroll'

describe('Philippine payslip estimate', () => {
  it('does not tax monthly taxable pay at or below 20833.33', () => {
    expect(monthlyWithholdingTax(20000)).toBe(0)
  })

  it('matches a semi-monthly cutoff that takes the full month of contributions', () => {
    const slip = estimatePayslip(20000, { deMinimisPerPayday: 1000 })
    expect(slip.sss).toBe(1000)
    expect(slip.philHealth).toBe(500)
    expect(slip.pagIbig).toBe(200)
    expect(slip.withholdingTax).toBe(0)
    expect(slip.paydayWithDeductions).toBe(9300)
    expect(slip.paydayWithoutDeductions).toBe(11000)
  })

  it('caps SSS, PhilHealth, and Pag-IBIG on a high salary', () => {
    const slip = estimatePayslip(120000)
    expect(slip.sss).toBe(1750)
    expect(slip.philHealth).toBe(2500)
    expect(slip.pagIbig).toBe(200)
    expect(slip.withholdingTax).toBeGreaterThan(0)
    expect(slip.monthlyNet).toBeCloseTo(slip.paydayWithDeductions + slip.paydayWithoutDeductions)
    expect(slip.paydayWithoutDeductions).toBeCloseTo(60000)
  })

  it('uses the 2% Pag-IBIG cap and the PhilHealth floor', () => {
    const slip = estimatePayslip(8000)
    expect(slip.pagIbig).toBe(160)
    expect(slip.philHealth).toBe(250)
  })
})
