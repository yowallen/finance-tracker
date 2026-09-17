import { useMemo, useState } from 'react'
import { createPaymentAllocationPlan } from '../services/paymentAllocation'
import type {
  CreditCard,
  CreditCardStatement,
  PaymentAllocationPlan,
  PaymentAllocationStrategy,
} from '../types/creditCard'

export function usePaymentAllocation(cards: CreditCard[], statements: CreditCardStatement[]) {
  const [strategy, setStrategy] = useState<PaymentAllocationStrategy>('highest-interest-first')
  const [totalPayment, setTotalPayment] = useState(0)
  const plan: PaymentAllocationPlan = useMemo(
    () => createPaymentAllocationPlan(cards, statements, totalPayment, strategy),
    [cards, statements, totalPayment, strategy],
  )
  return { strategy, setStrategy, totalPayment, setTotalPayment, plan }
}