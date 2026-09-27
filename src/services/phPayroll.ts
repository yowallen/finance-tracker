export interface PayslipEstimate {
  monthlyBasic: number
  deMinimisPerPayday: number
  sss: number
  philHealth: number
  pagIbig: number
  taxablePay: number
  withholdingTax: number
  /** Cutoff that includes the month's SSS, PhilHealth, and Pag-IBIG. */
  paydayWithDeductions: number
  /** The other cutoff, before those contributions. */
  paydayWithoutDeductions: number
  monthlyNet: number
}

/** Nearest ₱500 salary credit, from ₱5,000 to ₱35,000. */
export function sssMonthlySalaryCredit(basicPay: number): number {
  if (basicPay <= 0) return 0
  const nearest = Math.round(basicPay / 500) * 500
  return Math.min(35000, Math.max(5000, nearest))
}

export function estimatePayslip(
  monthlyBasic: number,
  options?: { deMinimisPerPayday?: number },
): PayslipEstimate {
  const basic = Math.max(0, monthlyBasic)
  const deMinimis = Math.max(0, options?.deMinimisPerPayday ?? 0)
  const halfBasic = basic / 2
  const sss = sssMonthlySalaryCredit(basic) * 0.05
  const philHealthBase = basic <= 0 ? 0 : Math.min(100000, Math.max(10000, basic))
  const philHealth = philHealthBase * 0.025
  const pagIbig = basic <= 0 ? 0 : basic <= 1500 ? basic * 0.01 : Math.min(basic, 10000) * 0.02
  const taxablePay = Math.max(0, basic - sss - philHealth - pagIbig)
  const withholdingTax = monthlyWithholdingTax(taxablePay)
  const deductions = sss + philHealth + pagIbig + withholdingTax
  const paydayWithDeductions = Math.max(0, halfBasic + deMinimis - deductions)
  const paydayWithoutDeductions = halfBasic + deMinimis
  return {
    monthlyBasic: basic,
    deMinimisPerPayday: deMinimis,
    sss,
    philHealth,
    pagIbig,
    taxablePay,
    withholdingTax,
    paydayWithDeductions,
    paydayWithoutDeductions,
    monthlyNet: paydayWithDeductions + paydayWithoutDeductions,
  }
}

/** TRAIN withholding, monthly equivalent of the annual brackets in force since 2023. */
export function monthlyWithholdingTax(taxablePay: number): number {
  if (taxablePay <= 20833.33) return 0
  if (taxablePay <= 33333.33) return (taxablePay - 20833.33) * 0.15
  if (taxablePay <= 66666.67) return 1875 + (taxablePay - 33333.33) * 0.2
  if (taxablePay <= 166666.67) return 8541.67 + (taxablePay - 66666.67) * 0.25
  if (taxablePay <= 666666.67) return 33541.67 + (taxablePay - 166666.67) * 0.3
  return 183541.67 + (taxablePay - 666666.67) * 0.35
}
