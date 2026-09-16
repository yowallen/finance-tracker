import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
import type {
  CreditCard,
  CreditCardInput,
  CreditCardStatement,
  StatementPeriod,
  InterestProjection,
  ProjectedBalance,
} from '../types/creditCard'
import { validateCreditCardInput } from '../types/creditCard'
import type { Transaction } from '../types/transaction'

const COLLECTION = 'creditCards'

function toIso(value: unknown, timestampCtor: typeof Timestamp): string {
  if (value instanceof timestampCtor) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
  timestampCtor: typeof Timestamp,
): CreditCard | null {
  const userId = data.userId
  const name = data.name
  const lastFour = data.lastFour
  const limit = data.limit
  const statementDay = data.statementDay
  const dueDayOffset = data.dueDayOffset
  const color = data.color
  const active = data.active
  const apr = data.apr
  const interestCalculationMethod = data.interestCalculationMethod
  const gracePeriodDays = data.gracePeriodDays

  if (
    typeof userId !== 'string' ||
    typeof name !== 'string' ||
    typeof lastFour !== 'string' ||
    typeof limit !== 'number' ||
    typeof statementDay !== 'number' ||
    typeof dueDayOffset !== 'number' ||
    (color !== undefined && typeof color !== 'string') ||
    (apr !== undefined && typeof apr !== 'number') ||
    (interestCalculationMethod !== undefined && typeof interestCalculationMethod !== 'string') ||
    (gracePeriodDays !== undefined && typeof gracePeriodDays !== 'number')
  ) {
    return null
  }

  return {
    id,
    userId,
    name,
    lastFour,
    limit,
    statementDay,
    dueDayOffset,
    ...(typeof color === 'string' ? { color } : {}),
    ...(typeof apr === 'number' ? { apr } : {}),
    ...(typeof interestCalculationMethod === 'string' && (interestCalculationMethod === 'daily' || interestCalculationMethod === 'monthly')
      ? { interestCalculationMethod }
      : {}),
    ...(typeof gracePeriodDays === 'number' ? { gracePeriodDays } : {}),
    active: typeof active === 'boolean' ? active : true,
    createdAt: toIso(data.createdAt, timestampCtor),
  }
}

function validateInput(input: CreditCardInput): void {
  validateCreditCardInput(input)
}

export function subscribeCreditCards(
  userId: string,
  onData: (cards: CreditCard[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let disposed = false
  let unsubscribe: Unsubscribe = () => {}

  void getFirestoreClient()
    .then(({ fs, db }) => {
      if (disposed) return

      const q = fs.query(
        fs.collection(db, COLLECTION),
        fs.where('userId', '==', userId),
      )

      unsubscribe = fs.onSnapshot(
        q,
        (snapshot) => {
          const items: CreditCard[] = []
          let invalidId: string | null = null
          for (const docSnap of snapshot.docs) {
            const mapped = mapDoc(docSnap.id, docSnap.data(), fs.Timestamp)
            if (mapped) {
              items.push(mapped)
            } else {
              invalidId = docSnap.id
            }
          }
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          onData(items)
          if (invalidId) {
            onError(
              new Error(
                `Credit card ${invalidId} has invalid or incomplete data.`,
              ),
            )
          }
        },
        (error) => onError(error),
      )
    })
    .catch((err: unknown) => {
      if (!disposed) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    })

  return () => {
    disposed = true
    unsubscribe()
  }
}

export async function createCreditCard(
  userId: string,
  input: CreditCardInput,
): Promise<string> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)

  const payload: Record<string, unknown> = {
    userId,
    name: input.name.trim(),
    lastFour: input.lastFour.trim(),
    limit: input.limit,
    statementDay: input.statementDay,
    dueDayOffset: input.dueDayOffset,
    active: input.active ?? true,
    createdAt: fs.serverTimestamp(),
  }
  if (input.color?.trim()) {
    payload.color = input.color.trim()
  }
  if (input.apr !== undefined) {
    payload.apr = input.apr
  }
  if (input.interestCalculationMethod) {
    payload.interestCalculationMethod = input.interestCalculationMethod
  }
  if (input.gracePeriodDays !== undefined) {
    payload.gracePeriodDays = input.gracePeriodDays
  }

  const ref = await fs.addDoc(fs.collection(db, COLLECTION), payload)

  return ref.id
}

export async function updateCreditCard(
  id: string,
  input: CreditCardInput,
): Promise<void> {
  const { fs, db } = await getFirestoreClient()

  validateInput(input)

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    lastFour: input.lastFour.trim(),
    limit: input.limit,
    statementDay: input.statementDay,
    dueDayOffset: input.dueDayOffset,
    active: input.active ?? true,
  }
  if (input.color?.trim()) {
    payload.color = input.color.trim()
  } else {
    payload.color = null
  }
  if (input.apr !== undefined) {
    payload.apr = input.apr
  } else {
    payload.apr = null
  }
  if (input.interestCalculationMethod) {
    payload.interestCalculationMethod = input.interestCalculationMethod
  }
  if (input.gracePeriodDays !== undefined) {
    payload.gracePeriodDays = input.gracePeriodDays
  }

  await fs.updateDoc(fs.doc(db, COLLECTION, id), payload)
}

export async function deleteCreditCard(id: string): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.deleteDoc(fs.doc(db, COLLECTION, id))
}

export async function getCreditCardById(
  userId: string,
  cardId: string,
): Promise<CreditCard | null> {
  const { fs, db } = await getFirestoreClient()
  const snap = await fs.getDoc(fs.doc(db, COLLECTION, cardId))
  if (!snap.exists()) return null

  const mapped = mapDoc(snap.id, snap.data(), fs.Timestamp)
  if (!mapped || mapped.userId !== userId) return null
  return mapped
}

/**
 * Compute the statement period for a card in a given month.
 * The statement cuts on `statementDay` of the month, and the period
 * covers the month leading up to that date.
 */
export function computeStatementPeriod(
  card: CreditCard,
  year: number,
  month: number,
): StatementPeriod {
  const statementDate = new Date(year, month, card.statementDay)
  const startDate = new Date(year, month - 1, card.statementDay + 1)
  const dueDate = new Date(statementDate)
  dueDate.setDate(dueDate.getDate() + card.dueDayOffset)

  return {
    statementDate,
    dueDate,
    startDate,
    endDate: statementDate,
  }
}

/**
 * Return transactions charged to a card within a statement period.
 * The period starts the day after the previous statement date and ends
 * on (and includes) the current statement date.
 */
export function getStatementTransactions(
  card: CreditCard,
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  const { startDate, endDate } = computeStatementPeriod(card, year, month)
  const start = startDate.getTime()
  const end = endDate.getTime()

  return transactions
    .filter((tx) => {
      if (tx.creditCardId !== card.id) return false
      const t = new Date(tx.occurredAt).getTime()
      return Number.isFinite(t) && t >= start && t <= end
    })
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
}

/**
 * Compute a card's statement for a given month.
 */
export function computeStatement(
  card: CreditCard,
  allTransactions: Transaction[],
  year: number,
  month: number,
): CreditCardStatement {
  const { statementDate, dueDate } = computeStatementPeriod(card, year, month)
  const periodTransactions = getStatementTransactions(card, allTransactions, year, month)

  let newCharges = 0
  let paymentsCredits = 0

  for (const tx of periodTransactions) {
    if (tx.creditCardPayment === true) {
      paymentsCredits += tx.amount
    } else if (tx.type === 'income' || (tx.type === 'savings' && tx.savingsDirection === 'withdraw')) {
      paymentsCredits += tx.amount
    } else if (tx.type === 'expense' || tx.type === 'bill') {
      newCharges += tx.amount
    }
  }

  const previousBalance = computePreviousBalance(card, allTransactions, year, month)
  const interest = computeInterest(card, previousBalance, newCharges, paymentsCredits, statementDate, dueDate)
  const statementBalance = Math.max(0, previousBalance + newCharges - paymentsCredits + interest)
  const minimumPayment = card.apr && card.apr > 0
    ? computeMinimumPaymentWithInterest(statementBalance, card.apr)
    : Math.min(statementBalance, Math.max(statementBalance * 0.03, 100))
  const availableCredit = Math.max(0, card.limit - statementBalance)
  const isPaid = statementBalance <= 0

  return {
    card,
    statementDate,
    dueDate,
    previousBalance,
    newCharges,
    paymentsCredits,
    interestCharged: interest,
    statementBalance,
    minimumPayment,
    availableCredit,
    isPaid,
    transactions: periodTransactions,
  }
}

/**
 * Compute the balance carried into this statement period from prior periods.
 */
function computePreviousBalance(
  card: CreditCard,
  allTransactions: Transaction[],
  year: number,
  month: number,
): number {
  const { startDate } = computeStatementPeriod(card, year, month)
  const cutoff = startDate.getTime()

  let balance = 0
  for (const tx of allTransactions) {
    if (tx.creditCardId !== card.id) continue
    const t = new Date(tx.occurredAt).getTime()
    if (Number.isNaN(t) || t >= cutoff) continue
    if (tx.creditCardPayment === true) {
      balance -= tx.amount
    } else if (tx.type === 'income' || (tx.type === 'savings' && tx.savingsDirection === 'withdraw')) {
      balance -= tx.amount
    } else if (tx.type === 'expense' || tx.type === 'bill') {
      balance += tx.amount
    }
  }

  return Math.max(0, balance)
}

/**
 * Build statement history for a card.
 */
export function buildStatementHistory(
  card: CreditCard,
  allTransactions: Transaction[],
  endYear: number,
  endMonth: number,
  monthsBack = 11,
): CreditCardStatement[] {
  const rows: CreditCardStatement[] = []
  for (let i = monthsBack; i >= 0; i -= 1) {
    const d = new Date(endYear, endMonth - i, 1)
    rows.push(computeStatement(card, allTransactions, d.getFullYear(), d.getMonth()))
  }
  return rows
}

/**
 * Compute total outstanding balance across all cards.
 */
export function computeTotalOutstanding(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): number {
  return cards
    .filter((card) => card.active)
    .reduce(
      (total, card) =>
        total + computeStatement(card, allTransactions, year, month).statementBalance,
      0,
    )
}

/**
 * Compute total available credit across all cards.
 */
export function computeTotalAvailableCredit(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): number {
  return cards
    .filter((card) => card.active)
    .reduce(
      (total, card) =>
        total + computeStatement(card, allTransactions, year, month).availableCredit,
      0,
    )
}

/**
 * Find the earliest upcoming or overdue statement due date across all cards.
 */
export function getNextDueStatement(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): { card: CreditCard; statement: CreditCardStatement } | null {
  let next: { card: CreditCard; statement: CreditCardStatement } | null = null
  let earliestDue = Number.POSITIVE_INFINITY

  for (const card of cards) {
    if (!card.active) continue
    const statement = computeStatement(card, allTransactions, year, month)
    const due = statement.dueDate.getTime()
    if (due < earliestDue) {
      earliestDue = due
      next = { card, statement }
    }
  }

  return next
}

export function formatLastFour(lastFour: string): string {
  return `•••• ${lastFour}`
}

/**
 * Get daily and monthly interest rates from APR.
 * APR is a percentage (e.g., 3.5 for 3.5%)
 */
function getInterestRates(apr: number): { daily: number; monthly: number } {
  const decimal = apr / 100
  return {
    daily: decimal / 365,
    monthly: decimal / 12,
  }
}

/**
 * Compute interest for a statement period based on the card's APR and calculation method.
 * Returns the interest amount to be added to the balance.
 */
export function computeInterest(
  card: CreditCard,
  previousBalance: number,
  newCharges: number,
  paymentsCredits: number,
  statementDate: Date,
  dueDate: Date,
): number {
  const apr = card.apr
  if (!apr || apr <= 0) return 0

  // If there's a grace period and the previous balance was paid in full, no interest
  const gracePeriodDays = card.gracePeriodDays ?? 21
  const daysSinceDue = Math.floor((statementDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
  if (previousBalance <= 0 && daysSinceDue <= gracePeriodDays) {
    return 0
  }

  const { daily, monthly } = getInterestRates(apr)
  const calculationMethod = card.interestCalculationMethod ?? 'daily'

  if (calculationMethod === 'daily') {
    // Daily balance method: interest = daily_rate * average_daily_balance * days_in_period
    // Simplified: use statement balance as average daily balance
    const daysInPeriod = Math.floor((statementDate.getTime() - new Date(statementDate.getFullYear(), statementDate.getMonth() - 1, card.statementDay + 1).getTime()) / (1000 * 60 * 60 * 24))
    const averageDailyBalance = previousBalance + newCharges - paymentsCredits
    return Math.max(0, averageDailyBalance * daily * Math.max(1, daysInPeriod))
  } else {
    // Monthly balance method: interest = monthly_rate * statement_balance
    const statementBalance = Math.max(0, previousBalance + newCharges - paymentsCredits)
    return statementBalance * monthly
  }
}

/**
 * Compute minimum payment including interest.
 */
export function computeMinimumPaymentWithInterest(
  statementBalance: number,
  apr: number,
  minimumPaymentPercent: number = 0.03,
  minimumFixedAmount: number = 100,
): number {
  const interest = statementBalance * (apr / 100) / 12
  const principalPayment = Math.max(statementBalance * minimumPaymentPercent, minimumFixedAmount)
  return Math.min(statementBalance, principalPayment + interest)
}

/**
 * Build interest projection for a card.
 * Projects balance month by month until paid off or max months reached.
 */
export function projectInterest(
  card: CreditCard,
  currentBalance: number,
  monthsToProject: number = 24,
  fixedPayment?: number,
): InterestProjection {
  const apr = card.apr ?? 0
  if (apr <= 0 || currentBalance <= 0) {
    return {
      cardId: card.id,
      cardName: card.name,
      apr: 0,
      currentBalance: 0,
      monthlyInterestRate: 0,
      dailyInterestRate: 0,
      projectedBalances: [],
      totalInterestIfMinPay: 0,
      monthsToPayoffMinPay: 0,
      totalInterestIfFixedPay: 0,
      monthsToPayoffFixedPay: 0,
      fixedPaymentAmount: 0,
    }
  }

  const { daily, monthly } = getInterestRates(apr)
  const monthlyRate = monthly

  // Scenario 1: Minimum payment only
  let balanceMinPay = currentBalance
  let totalInterestMinPay = 0
  let monthsMinPay = 0
  const projectedMinPay: ProjectedBalance[] = []

  for (let month = 0; month < monthsToProject && balanceMinPay > 0; month++) {
    const interest = balanceMinPay * monthlyRate
    const minimumPayment = Math.min(balanceMinPay, Math.max(balanceMinPay * 0.03, 100))
    const payment = minimumPayment
    const principal = payment - interest
    const newBalance = Math.max(0, balanceMinPay - principal)

    projectedMinPay.push({
      month,
      year: new Date().getFullYear() + Math.floor((new Date().getMonth() + month) / 12),
      startingBalance: balanceMinPay,
      interestCharged: interest,
      payment,
      endingBalance: newBalance,
      isPaidOff: newBalance <= 0,
    })

    totalInterestMinPay += interest
    balanceMinPay = newBalance
    monthsMinPay = month + 1
    if (newBalance <= 0) break
  }

  // Scenario 2: Fixed payment
  const fixedPayAmount = fixedPayment ?? Math.max(currentBalance * 0.05, 500)
  let balanceFixedPay = currentBalance
  let totalInterestFixedPay = 0
  let monthsFixedPay = 0
  const projectedFixedPay: ProjectedBalance[] = []

  for (let month = 0; month < monthsToProject && balanceFixedPay > 0; month++) {
    const interest = balanceFixedPay * monthlyRate
    const payment = Math.min(fixedPayAmount, balanceFixedPay + interest)
    const principal = payment - interest
    const newBalance = Math.max(0, balanceFixedPay - principal)

    projectedFixedPay.push({
      month,
      year: new Date().getFullYear() + Math.floor((new Date().getMonth() + month) / 12),
      startingBalance: balanceFixedPay,
      interestCharged: interest,
      payment,
      endingBalance: newBalance,
      isPaidOff: newBalance <= 0,
    })

    totalInterestFixedPay += interest
    balanceFixedPay = newBalance
    monthsFixedPay = month + 1
    if (newBalance <= 0) break
  }

  // Combine projections (use fixed payment projection for display)
  const projectedBalances = projectedFixedPay.length > 0 ? projectedFixedPay : projectedMinPay

  return {
    cardId: card.id,
    cardName: card.name,
    apr,
    currentBalance,
    monthlyInterestRate: monthlyRate,
    dailyInterestRate: daily,
    projectedBalances,
    totalInterestIfMinPay: totalInterestMinPay,
    monthsToPayoffMinPay: monthsMinPay,
    totalInterestIfFixedPay: totalInterestFixedPay,
    monthsToPayoffFixedPay: monthsFixedPay,
    fixedPaymentAmount: fixedPayAmount,
  }
}