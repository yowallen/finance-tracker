export type DurationUnit = 'months' | 'years'

export interface RecurringBill {
  id: string
  userId: string
  name: string
  amount: number
  category: string
  /** Day of month the bill is due (1–31). Clamped to month length. */
  dueDay: number
  /** First payment month as YYYY-MM. */
  startsOn: string
  /** How long the bill must be paid. */
  durationValue: number
  durationUnit: DurationUnit
  notes: string
  active: boolean
  createdAt: string
}

export interface RecurringBillInput {
  name: string
  amount: number
  category: string
  dueDay: number
  startsOn: string
  durationValue: number
  durationUnit: DurationUnit
  notes: string
  active?: boolean
}

export type BillReminderStatus = 'paid' | 'overdue' | 'due-soon' | 'upcoming' | 'unpaid'

export interface BillReminder {
  bill: RecurringBill
  dueDate: Date
  status: BillReminderStatus
  daysUntilDue: number
  paidTransactionId: string | null
  /** 1-based payment index within the schedule for the viewed month. */
  paymentNumber: number
  totalPayments: number
  endsOn: string
}
