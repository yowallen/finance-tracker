import type {
  CreditCard,
  CreditCardStatement,
  PaymentAllocation,
  PaymentAllocationPlan,
  PaymentAllocationStrategy,
} from '../types/creditCard'

function orderCards(
  cards: CreditCard[],
  statements: CreditCardStatement[],
  strategy: PaymentAllocationStrategy,
): CreditCard[] {
  const statementById = new Map(statements.map((statement) => [statement.card.id, statement]))
  return [...cards]
    .filter((card) => (statementById.get(card.id)?.statementBalance ?? 0) > 0)
    .sort((a, b) => {
      const aStatement = statementById.get(a.id)
      const bStatement = statementById.get(b.id)
      if (strategy === 'highest-interest-first') return (b.apr ?? 0) - (a.apr ?? 0)
      if (strategy === 'lowest-balance-first') return (aStatement?.statementBalance ?? 0) - (bStatement?.statementBalance ?? 0)
      return a.id.localeCompare(b.id)
    })
}

export function createPaymentAllocationPlan(
  cards: CreditCard[],
  statements: CreditCardStatement[],
  totalPayment: number,
  strategy: PaymentAllocationStrategy = 'highest-interest-first',
): PaymentAllocationPlan {
  const payment = Math.max(0, Number.isFinite(totalPayment) ? totalPayment : 0)
  const statementById = new Map(statements.map((statement) => [statement.card.id, statement]))
  const orderedCards = orderCards(cards.filter((card) => card.active), statements, strategy)
  const minimumTotal = orderedCards.reduce(
    (sum, card) => sum + Math.min(statementById.get(card.id)?.minimumPayment ?? 0, statementById.get(card.id)?.statementBalance ?? 0),
    0,
  )
  const allocations: PaymentAllocation[] = orderedCards.map((card) => {
    const statement = statementById.get(card.id)
    const balance = statement?.statementBalance ?? 0
    const minimum = Math.min(statement?.minimumPayment ?? 0, balance)
    return {
      cardId: card.id,
      cardName: card.name,
      cardApr: card.apr ?? 0,
      currentBalance: balance,
      minimumPayment: minimum,
      allocatedAmount: 0,
      isMinimumOnly: true,
    }
  })

  if (payment < minimumTotal && minimumTotal > 0) {
    for (const allocation of allocations) {
      allocation.allocatedAmount = payment * (allocation.minimumPayment / minimumTotal)
    }
  } else {
    for (const allocation of allocations) allocation.allocatedAmount = allocation.minimumPayment
    let remaining = payment - minimumTotal
    if (strategy === 'proportional') {
      const remainingBalances = allocations.reduce((sum, allocation) => sum + allocation.currentBalance - allocation.allocatedAmount, 0)
      for (const allocation of allocations) {
        const share = remainingBalances > 0
          ? remaining * ((allocation.currentBalance - allocation.allocatedAmount) / remainingBalances)
          : 0
        allocation.allocatedAmount += Math.min(share, allocation.currentBalance - allocation.allocatedAmount)
        allocation.isMinimumOnly = allocation.allocatedAmount <= allocation.minimumPayment
      }
    } else {
      for (const allocation of allocations) {
        const extra = Math.min(remaining, allocation.currentBalance - allocation.allocatedAmount)
        allocation.allocatedAmount += extra
        allocation.isMinimumOnly = extra <= 0
        remaining -= extra
        if (remaining <= 0) break
      }
    }
  }

  const allocated = allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0)
  return {
    strategy,
    totalPayment: payment,
    allocations,
    remainingUnallocated: Math.max(0, payment - allocated),
  }
}