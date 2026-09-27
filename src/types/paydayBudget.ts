export type PaydayScheduleId = '15-30' | '5-20' | '10-25' | '5-26' | 'custom'

export interface PaydaySettings {
  schedule: PaydayScheduleId
  firstDay: number
  secondDay: number
  allowance: number
  rollover: boolean
  /** Monthly basic pay used to estimate SSS, PhilHealth, Pag-IBIG, and withholding tax. */
  monthlyGross: number
  /** Non-taxable de minimis added on each payday. Contributions use basic pay only. */
  deMinimisPerPayday: number
}

export interface PaydayPeriod {
  start: Date
  end: Date
  /** True when today falls inside this period. */
  active: boolean
}

export interface PaydayPeriodSummary extends PaydayPeriod {
  income: number
  spent: number
  stillDue: number
  rolloverIn: number
  allowance: number
  left: number
  perDay: number | null
  daysRemaining: number
}

export const PAYDAY_PRESETS: Array<{ id: Exclude<PaydayScheduleId, 'custom'>; firstDay: number; secondDay: number; label: string }> = [
  { id: '15-30', firstDay: 15, secondDay: 30, label: '15th and 30th' },
  { id: '5-20', firstDay: 5, secondDay: 20, label: '5th and 20th' },
  { id: '10-25', firstDay: 10, secondDay: 25, label: '10th and 25th' },
  { id: '5-26', firstDay: 5, secondDay: 26, label: '5th and 26th' },
]

export const DEFAULT_PAYDAY_SETTINGS: PaydaySettings = {
  schedule: '15-30',
  firstDay: 15,
  secondDay: 30,
  allowance: 0,
  rollover: false,
  monthlyGross: 0,
  deMinimisPerPayday: 0,
}
