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
  /** Months (YYYY-MM) where this bill will be paid with a credit card.
   *  These months are excluded from daily balance/cash flow computations. */
  creditCardMonths?: string[]
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
  creditCardMonths?: string[]
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
  /** Suggested date to pay a credit-card bill before its due date. */
  recommendedPaymentDate?: Date
  /** Actual creditor due date when the reminder uses an earlier recommended date. */
  actualDueDate?: Date
  isCreditCardPayment?: boolean
  creditCardId?: string
  cardColor?: string
  /** True when this bill is flagged to be paid with a credit card for the viewed month.
   *  When true, the bill is excluded from daily balance/cash flow computations. */
  payWithCreditCard?: boolean
}
