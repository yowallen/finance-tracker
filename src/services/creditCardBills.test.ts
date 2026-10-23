import { describe, expect, it } from 'vitest'
import { creditCardBillToReminder, creditCardCashStillDue, creditLimitsAsOfDay, expandInstallmentReminders, generateCreditCardPaymentBills, reminderBillsForMonth, upcomingInstallmentReminders, type CreditCardPaymentBill } from './creditCardBills'
import { computeMonthBalance } from './balanceOutlook'
import type { Transaction } from '../types/transaction'
import { buildInstallmentCharges } from './cardInstallments'
import { computeStatement, groupCreditCards } from './creditCards'
import type { BillReminder } from '../types/recurringBill'
import type { CardInstallment } from '../types/cardInstallment'
import type { CreditCard } from '../types/creditCard'

function bill(partial: Partial<CreditCardPaymentBill> & Pick<CreditCardPaymentBill, 'id' | 'cardId' | 'statementDate' | 'scheduledDueDate'>): CreditCardPaymentBill {
  return {
    cardName: 'BPI Amore',
    lastFour: '5877',
    amount: 10000,
    dueDate: partial.scheduledDueDate,
    dueDay: partial.scheduledDueDate.getDate(),
    category: 'Credit card payment',
    ...partial,
  }
}

describe('reminderBillsForMonth', () => {
  it('keeps the card payment that is due this month', () => {
    const due = bill({
      id: 'due',
      cardId: 'card',
      statementDate: new Date(2026, 8, 16),
      scheduledDueDate: new Date(2026, 9, 2),
    })

    expect(reminderBillsForMonth([due], 2026, 9).map((item) => item.id)).toEqual(['due'])
  })

  it('shows the next statement when its installment is not on this month’s payment', () => {
    const dueWithoutInstallment = bill({
      id: 'september',
      cardId: 'card',
      statementDate: new Date(2026, 8, 16),
      scheduledDueDate: new Date(2026, 9, 2),
    })
    const withInstallment = bill({
      id: 'october',
      cardId: 'card',
      statementDate: new Date(2026, 9, 16),
      scheduledDueDate: new Date(2026, 10, 2),
      installments: [{ label: 'Credit-to-Cash installment 1/12', amount: 5166.67 }],
    })
    const later = bill({
      id: 'november',
      cardId: 'card',
      statementDate: new Date(2026, 10, 16),
      scheduledDueDate: new Date(2026, 11, 2),
      installments: [{ label: 'Credit-to-Cash installment 2/12', amount: 4666.67 }],
    })

    expect(reminderBillsForMonth([dueWithoutInstallment, withInstallment, later], 2026, 9).map((item) => item.id))
      .toEqual(['september', 'october'])
  })

  it('does not add the following installment when this month’s payment already includes one', () => {
    const dueWithInstallment = bill({
      id: 'october',
      cardId: 'card',
      statementDate: new Date(2026, 9, 16),
      scheduledDueDate: new Date(2026, 10, 2),
      installments: [{ label: 'Credit-to-Cash installment 1/12', amount: 5166.67 }],
    })
    const next = bill({
      id: 'november',
      cardId: 'card',
      statementDate: new Date(2026, 10, 16),
      scheduledDueDate: new Date(2026, 11, 2),
      installments: [{ label: 'Credit-to-Cash installment 2/12', amount: 4666.67 }],
    })

    expect(reminderBillsForMonth([dueWithInstallment, next], 2026, 10).map((item) => item.id)).toEqual(['october'])
  })

  it('adds a separate reminder for a purchase installment on the next statement', () => {
    const dueWithCashInstallment = bill({
      id: 'december-payment',
      cardId: 'card',
      statementDate: new Date(2026, 10, 16),
      scheduledDueDate: new Date(2026, 11, 2),
      installments: [{ label: 'Credit-to-Cash installment 1/6', amount: 4033.33, number: 1, term: 6 }],
    })
    const nextStatement = bill({
      id: 'january-statement',
      cardId: 'card',
      statementDate: new Date(2026, 11, 16),
      scheduledDueDate: new Date(2027, 0, 2),
      installments: [
        { label: 'Credit-to-Cash installment 2/6', amount: 4033.33, number: 2, term: 6 },
        { label: 'iPhone 15 installment 1/24', amount: 1907.75, number: 1, term: 24 },
      ],
    })

    const selected = reminderBillsForMonth([dueWithCashInstallment, nextStatement], 2026, 11)

    expect(selected.map((item) => item.id)).toEqual(['december-payment', 'january-statement'])
    expect(selected[1].installmentsOnly).toBe(true)
    expect(selected[1].installments?.map((line) => line.label)).toEqual(['iPhone 15 installment 1/24'])
  })
})

describe('expandInstallmentReminders', () => {
  it('turns each amortization into its own reminder without a second payment', () => {
    const parent = {
      bill: {
        id: 'cc-payment:card:2026-11-16',
        userId: '',
        name: 'Credit Card Payment - BPI Amore',
        amount: 23372.41,
        category: 'Credit card payment',
        dueDay: 2,
        startsOn: '2026-12',
        durationValue: 1,
        durationUnit: 'months' as const,
        notes: '•••• 5877',
        active: true,
        createdAt: '2026-10-12T00:00:00.000Z',
      },
      dueDate: new Date(2026, 11, 2),
      status: 'upcoming' as const,
      daysUntilDue: 50,
      paidTransactionId: null,
      paymentNumber: 1,
      totalPayments: 1,
      endsOn: '2026-12',
      isCreditCardPayment: true,
      creditCardId: 'card',
      installments: [{ label: 'Credit-to-Cash installment 1/6', amount: 4033.33, number: 1, term: 6 }],
    } satisfies BillReminder

    const [installment] = expandInstallmentReminders(parent)

    expect(installment.bill.name).toBe('Credit-to-Cash installment 1/6')
    expect(installment.bill.amount).toBe(4033.33)
    expect(installment.bill.notes).toBe('Included in the BPI Amore payment')
    expect(installment.paymentNumber).toBe(1)
    expect(installment.totalPayments).toBe(6)
    expect(installment.isInstallmentPart).toBe(true)
    expect(installment.isCreditCardPayment).toBe(false)
    expect(parent.bill.amount).toBe(23372.41)
  })
})

describe('iPhone installment purchase reminders', () => {
  const amore: CreditCard = {
    id: 'amore',
    userId: 'user-1',
    name: 'BPI Amore',
    lastFour: '5877',
    limit: 100000,
    statementDay: 16,
    dueDay: 7,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  }

  const iphone: CardInstallment = {
    id: 'iphone',
    userId: 'user-1',
    cardId: amore.id,
    kind: 'purchase',
    creditLine: 'madness',
    principal: 45786,
    monthlyAddOnRate: 0,
    termMonths: 24,
    bookedOn: '2026-12-17',
    notes: 'iPhone 15',
    createdAt: '2026-12-17T00:00:00.000Z',
  }

  it('shows installment 1 while viewing the purchase month', () => {
    const charges = buildInstallmentCharges([iphone], [amore])
    const december = computeStatement(amore, charges, 2026, 11)
    const january = computeStatement(amore, charges, 2027, 0)
    const november = computeStatement(amore, charges, 2026, 10)
    const bills = generateCreditCardPaymentBills(groupCreditCards([amore]).flatMap((pool) => pool.cards), [november, december, january])
    const selected = reminderBillsForMonth(bills, 2026, 11)
    const names = selected.flatMap((bill) => bill.installments?.map((line) => line.label) ?? [])

    expect(names).toContain('iPhone 15 installment 1/24')
  })

  it('adds the reminder from the plan even when the statement bill is missing', () => {
    const reminders = upcomingInstallmentReminders([iphone], [amore], 2026, 11, [], new Set())
    expect(reminders.map((reminder) => reminder.bill.name)).toEqual(['iPhone 15 installment 1/24'])
    expect(reminders[0].isInstallmentPart).toBe(true)
    expect(reminders[0].bill.notes).toBe('Included in the BPI Amore payment')
  })
})

describe('minimum payment cash obligation', () => {
  const statement = bill({
    id: 'october',
    cardId: 'card',
    amount: 10000,
    minimumPayment: 500,
    statementDate: new Date(2026, 8, 16),
    scheduledDueDate: new Date(2026, 9, 2),
    dueDate: new Date(2026, 9, 5),
  })

  function payment(amount: number, when: Date): Transaction {
    const occurredAt = when.toISOString()
    return {
      id: `pay-${amount}`,
      userId: 'user-1',
      type: 'bill',
      amount,
      category: 'Credit card payment',
      description: 'Payment',
      occurredAt,
      createdAt: occurredAt,
      creditCardId: 'card',
      creditCardPayment: true,
    }
  }

  function income(amount: number): Transaction {
    const occurredAt = new Date(2026, 9, 16, 12).toISOString()
    return {
      id: 'salary',
      userId: 'user-1',
      type: 'income',
      amount,
      category: 'Salary',
      description: 'Salary',
      occurredAt,
      createdAt: occurredAt,
    }
  }

  it('does not take an unpaid statement out of cash', () => {
    expect(creditCardCashStillDue(statement, [])).toBe(10000)

    const outlook = computeMonthBalance([], [income(20000)], 2026, 9, 0, [statement])
    expect(outlook.unpaidScheduledBills).toBe(0)
    expect(outlook.monthNet).toBe(20000)
  })

  it('drops the cash hold once the minimum is paid and leaves the rest on the card', () => {
    const minimum = payment(500, new Date(2026, 9, 2, 12))
    expect(creditCardCashStillDue(statement, [minimum])).toBe(0)

    const outlook = computeMonthBalance([], [income(20000), minimum], 2026, 9, 0, [statement])
    expect(outlook.unpaidScheduledBills).toBe(0)
    expect(outlook.monthNet).toBe(19500)

    const reminder = creditCardBillToReminder(statement, 2026, 9, [minimum], new Date(2026, 9, 16))
    expect(reminder.status).toBe('paid')
    expect(reminder.minimumSettled).toBe(true)
    expect(reminder.cashStillDue).toBe(0)
  })

  it('does not hold the unpaid remainder when the payment is short of the statement', () => {
    const short = payment(200, new Date(2026, 9, 2, 12))
    const outlook = computeMonthBalance([], [income(20000), short], 2026, 9, 0, [statement])
    expect(outlook.unpaidScheduledBills).toBe(0)
    expect(outlook.monthNet).toBe(19800)
  })
})

describe('calendar credit limit', () => {
  const card: CreditCard = {
    id: 'card',
    userId: 'user-1',
    name: 'BPI Amore',
    lastFour: '5877',
    limit: 10000,
    statementDay: 16,
    dueDay: 5,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  function charge(amount: number, day: number): Transaction {
    const occurredAt = new Date(2026, 9, day, 12).toISOString()
    return {
      id: `charge-${day}`,
      userId: 'user-1',
      type: 'expense',
      amount,
      category: 'Food',
      description: 'Lunch',
      occurredAt,
      createdAt: occurredAt,
      creditCardId: card.id,
    }
  }

  function cardBill(amount: number, day: number): BillReminder {
    return {
      bill: {
        id: 'rent',
        userId: 'user-1',
        name: 'Internet',
        amount,
        category: 'Utilities',
        dueDay: day,
        startsOn: '2026-10',
        durationValue: 12,
        durationUnit: 'months',
        notes: '',
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      dueDate: new Date(2026, 9, day),
      status: 'upcoming',
      daysUntilDue: 1,
      paidTransactionId: null,
      paymentNumber: 1,
      totalPayments: 12,
      endsOn: '2027-09',
      payWithCreditCard: true,
    }
  }

  it('reduces available credit on the day a card charge posts', () => {
    const before = creditLimitsAsOfDay([card], [charge(1500, 10)], [], 2026, 9, 9)
    const after = creditLimitsAsOfDay([card], [charge(1500, 10)], [], 2026, 9, 10)
    expect(before.limits[0].available).toBe(10000)
    expect(after.limits[0].available).toBe(8500)
  })

  it('reduces available credit when a bill is paid with the card', () => {
    const before = creditLimitsAsOfDay([card], [], [], 2026, 9, 11, [cardBill(500, 12)])
    const onDue = creditLimitsAsOfDay([card], [], [], 2026, 9, 12, [cardBill(500, 12)])
    expect(before.limits[0].available).toBe(10000)
    expect(onDue.limits[0].available).toBe(9500)
  })

  it('still deducts this month when an earlier payment was already on the card', () => {
    const earlier = new Date(2026, 8, 12, 12).toISOString()
    const priorPayment: Transaction = {
      id: 'prior',
      userId: 'user-1',
      type: 'bill',
      amount: 500,
      category: 'Utilities',
      description: 'Internet',
      occurredAt: earlier,
      createdAt: earlier,
      creditCardId: card.id,
      recurringBillId: 'rent',
    }
    const onDue = creditLimitsAsOfDay([card], [priorPayment], [], 2026, 9, 12, [cardBill(500, 12)])
    expect(onDue.limits[0].available).toBe(9000)
  })
})
