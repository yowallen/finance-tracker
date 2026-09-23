import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
import type {
  CashbackRule,
  CreditCard,
  CreditCardInput,
  CreditCardStatement,
  StatementPeriod,
  InterestProjection,
  ProjectedBalance,
  UtilizationHistory,
  UtilizationSnapshot,
} from '../types/creditCard'
import { validateCreditCardInput } from '../types/creditCard'
import type { Transaction } from '../types/transaction'
import { nextPhilippineBankingDay } from './recurringBills'

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

function coerceNumeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
      .filter(Boolean)
    return items.length > 0 ? items : undefined
  }

  if (typeof value === 'string') {
    const items = value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length > 0 ? items : undefined
  }

  return undefined
}

function normalizeLegacyCashbackRules(value: unknown): CreditCard['cashbackRules'] | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const bucket = Array.isArray(value) ? value : [value]
  const normalized: CashbackRule[] = []

  for (const rule of bucket) {
    if (!rule || typeof rule !== 'object') {
      continue
    }

    const rawRate = coerceNumeric((rule as Record<string, unknown>).rate) ?? coerceNumeric((rule as Record<string, unknown>).value)
    const rawCategories = coerceStringArray((rule as Record<string, unknown>).categories)
      ?? coerceStringArray((rule as Record<string, unknown>).category)
      ?? (() => {
        const label = (rule as Record<string, unknown>).label
        if (typeof label === 'string') {
          return [label]
        }
        return undefined
      })()

    if (rawRate === undefined || rawCategories === undefined || rawCategories.length === 0) {
      continue
    }

    normalized.push({
      id: typeof (rule as Record<string, unknown>).id === 'string' ? String((rule as Record<string, unknown>).id) : undefined,
      label: typeof (rule as Record<string, unknown>).label === 'string' ? String((rule as Record<string, unknown>).label) : undefined,
      rate: rawRate,
      categories: rawCategories,
    })
  }

  return normalized.length > 0 ? normalized : undefined
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
  timestampCtor: typeof Timestamp,
): CreditCard | null {
  const userId = typeof data.userId === 'string' ? data.userId : undefined
  const name = typeof data.name === 'string' ? data.name : undefined
  const lastFour = typeof data.lastFour === 'string' ? data.lastFour : undefined
  const limit = coerceNumeric(data.limit)
  const statementDay = coerceNumeric(data.statementDay)
  const dueDay = coerceNumeric(data.dueDay)
  const dueDayOffset = coerceNumeric(data.dueDayOffset)
  const color = typeof data.color === 'string' ? data.color : undefined
  const active = data.active
  const apr = coerceNumeric(data.apr)
  const interestCalculationMethod = typeof data.interestCalculationMethod === 'string' ? data.interestCalculationMethod : undefined
  const gracePeriodDays = coerceNumeric(data.gracePeriodDays)
  const minimumPaymentOverride = coerceNumeric(data.minimumPaymentOverride)
  const rewardName = typeof data.rewardName === 'string' ? data.rewardName : undefined
  const cashbackRate = coerceNumeric(data.cashbackRate)
  const cashbackCap = coerceNumeric(data.cashbackCap)
  const cashbackStartingBalance = coerceNumeric(data.cashbackStartingBalance)
  const cashbackRedeemed = coerceNumeric(data.cashbackRedeemed)
  const cashbackMinSpend = coerceNumeric(data.cashbackMinSpend)
  const cashbackCategories = coerceStringArray(data.cashbackCategories)
  const cashbackRules = normalizeLegacyCashbackRules(data.cashbackRules)

  if (
    !userId ||
    !name ||
    !lastFour ||
    limit === undefined ||
    statementDay === undefined ||
    (dueDay === undefined && dueDayOffset === undefined) ||
    (typeof color !== 'undefined' && !color)
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
    ...(dueDay !== undefined ? { dueDay } : {}),
    ...(dueDayOffset !== undefined ? { dueDayOffset } : {}),
    ...(color ? { color } : {}),
    ...(apr !== undefined ? { apr } : {}),
    ...(interestCalculationMethod && (interestCalculationMethod === 'daily' || interestCalculationMethod === 'monthly')
      ? { interestCalculationMethod }
      : {}),
    ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
    ...(minimumPaymentOverride !== undefined ? { minimumPaymentOverride } : {}),
    ...(rewardName ? { rewardName } : {}),
    ...(cashbackRate !== undefined ? { cashbackRate } : {}),
    ...(cashbackCap !== undefined ? { cashbackCap } : {}),
    ...(cashbackStartingBalance !== undefined ? { cashbackStartingBalance } : {}),
    ...(cashbackRedeemed !== undefined ? { cashbackRedeemed } : {}),
    ...(cashbackMinSpend !== undefined ? { cashbackMinSpend } : {}),
    ...(cashbackCategories ? { cashbackCategories } : {}),
    ...(cashbackRules ? { cashbackRules } : {}),
    active: typeof active === 'boolean' ? active : true,
    createdAt: toIso(data.createdAt, timestampCtor),
  }
}

function normalizeCashbackRules(rules: CreditCard['cashbackRules'] | undefined): Array<Record<string, unknown>> | undefined {
  if (!rules || rules.length === 0) {
    return undefined
  }

  const normalized = rules
    .map((rule) => {
      if (!rule || typeof rule !== 'object') {
        return null
      }

      const rate = Number(rule.rate)
      const categories = (rule.categories ?? [])
        .map((category) => typeof category === 'string' ? category.trim() : '')
        .filter(Boolean)

      if (!Number.isFinite(rate) || categories.length === 0) {
        return null
      }

      const cleaned: Record<string, unknown> = {
        rate,
        categories,
      }

      if (typeof rule.id === 'string' && rule.id.trim()) {
        cleaned.id = rule.id.trim()
      }
      if (typeof rule.label === 'string' && rule.label.trim()) {
        cleaned.label = rule.label.trim()
      }

      return cleaned
    })
    .filter((rule): rule is Record<string, unknown> => rule !== null)

  return normalized.length > 0 ? normalized : undefined
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
    active: input.active ?? true,
    createdAt: fs.serverTimestamp(),
  }
  if (input.dueDay !== undefined) {
    payload.dueDay = input.dueDay
  }
  if (input.dueDayOffset !== undefined) {
    payload.dueDayOffset = input.dueDayOffset
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
  if (input.minimumPaymentOverride !== undefined) {
    payload.minimumPaymentOverride = input.minimumPaymentOverride
  }
  if (input.rewardName !== undefined) {
    payload.rewardName = input.rewardName.trim() || 'Cashback'
  }
  if (input.cashbackRate !== undefined) {
    payload.cashbackRate = input.cashbackRate
  }
  if (input.cashbackCap !== undefined) {
    payload.cashbackCap = input.cashbackCap
  }
  if (input.cashbackStartingBalance !== undefined) {
    payload.cashbackStartingBalance = input.cashbackStartingBalance
  }
  if (input.cashbackRedeemed !== undefined) {
    payload.cashbackRedeemed = input.cashbackRedeemed
  }
  if (input.cashbackMinSpend !== undefined) {
    payload.cashbackMinSpend = input.cashbackMinSpend
  }
  if (input.cashbackCategories !== undefined) {
    payload.cashbackCategories = input.cashbackCategories
      .map((category) => category.trim())
      .filter(Boolean)
  }
  if (input.cashbackRules !== undefined) {
    const normalizedRules = normalizeCashbackRules(input.cashbackRules)
    if (normalizedRules) {
      payload.cashbackRules = normalizedRules
    }
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
    active: input.active ?? true,
  }
  if (input.dueDay !== undefined) {
    payload.dueDay = input.dueDay
  }
  if (input.dueDayOffset !== undefined) {
    payload.dueDayOffset = input.dueDayOffset
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
  if (input.minimumPaymentOverride !== undefined) {
    payload.minimumPaymentOverride = input.minimumPaymentOverride
  } else {
    payload.minimumPaymentOverride = null
  }
  if (input.rewardName !== undefined) {
    payload.rewardName = input.rewardName.trim() || 'Cashback'
  } else {
    payload.rewardName = null
  }
  if (input.cashbackRate !== undefined) {
    payload.cashbackRate = input.cashbackRate
  } else {
    payload.cashbackRate = null
  }
  if (input.cashbackCap !== undefined) {
    payload.cashbackCap = input.cashbackCap
  } else {
    payload.cashbackCap = null
  }
  if (input.cashbackStartingBalance !== undefined) {
    payload.cashbackStartingBalance = input.cashbackStartingBalance
  } else {
    payload.cashbackStartingBalance = null
  }
  if (input.cashbackRedeemed !== undefined) {
    payload.cashbackRedeemed = input.cashbackRedeemed
  } else {
    payload.cashbackRedeemed = null
  }
  if (input.cashbackMinSpend !== undefined) {
    payload.cashbackMinSpend = input.cashbackMinSpend
  } else {
    payload.cashbackMinSpend = null
  }
  if (input.cashbackCategories !== undefined) {
    payload.cashbackCategories = input.cashbackCategories
      .map((category) => category.trim())
      .filter(Boolean)
  } else {
    payload.cashbackCategories = null
  }
  if (input.cashbackRules !== undefined) {
    const normalizedRules = normalizeCashbackRules(input.cashbackRules)
    if (normalizedRules) {
      payload.cashbackRules = normalizedRules
    } else {
      payload.cashbackRules = []
    }
  } else {
    payload.cashbackRules = null
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
  let dueDate = new Date(statementDate)
  if (card.dueDay !== undefined) {
    const dueMonth = month + (card.dueDay <= card.statementDay ? 1 : 0)
    const lastDay = new Date(year, dueMonth + 1, 0).getDate()
    dueDate = new Date(year, dueMonth, Math.min(card.dueDay, lastDay))
  } else {
    dueDate.setDate(dueDate.getDate() + (card.dueDayOffset ?? 21))
  }
  const adjustedDueDate = nextPhilippineBankingDay(dueDate)

  return {
    statementDate,
    dueDate: adjustedDueDate,
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
  const endOfStatementDay = new Date(endDate)
  endOfStatementDay.setHours(23, 59, 59, 999)
  const end = endOfStatementDay.getTime()

  return transactions
    .filter((tx) => {
      if (tx.creditCardId !== card.id) return false
      const t = new Date(tx.occurredAt).getTime()
      return Number.isFinite(t) && t >= start && t <= end
    })
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
}

/**
 * Compute the live balance from every linked charge and payment through the
 * selected month, regardless of statement period.
 */
export function computeOutstandingBalance(
  card: CreditCard,
  allTransactions: Transaction[],
  year: number,
  month: number,
): number {
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
  let balance = 0

  for (const tx of allTransactions) {
    if (tx.creditCardId !== card.id) continue
    const occurredAt = new Date(tx.occurredAt).getTime()
    if (!Number.isFinite(occurredAt) || occurredAt > endOfMonth) continue

    if (
      tx.creditCardPayment === true ||
      tx.type === 'income' ||
      (tx.type === 'savings' && tx.savingsDirection === 'withdraw')
    ) {
      balance -= tx.amount
    } else if (tx.type === 'expense' || tx.type === 'bill') {
      balance += tx.amount
    }
  }

  return Math.max(0, balance)
}

/** Return every transaction linked to a card through the selected month. */
function getTransactionHistory(
  card: CreditCard,
  allTransactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()

  return allTransactions
    .filter((tx) => {
      if (tx.creditCardId !== card.id) return false
      const occurredAt = new Date(tx.occurredAt).getTime()
      return Number.isFinite(occurredAt) && occurredAt <= endOfMonth
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
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
  const transactionHistory = getTransactionHistory(card, allTransactions, year, month)

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
  const outstandingBalance = computeOutstandingBalance(card, allTransactions, year, month)
  const minimumPayment = card.minimumPaymentOverride !== undefined
    ? Math.min(statementBalance, card.minimumPaymentOverride)
    : card.apr && card.apr > 0
      ? computeMinimumPaymentWithInterest(statementBalance, card.apr)
      : Math.min(statementBalance, Math.max(statementBalance * 0.03, 100))
  const availableCredit = Math.max(0, card.limit - outstandingBalance)
  const isPaid = statementBalance <= 0
  const cashbackEligibleSpend = getCashbackEligibleSpend(card, periodTransactions)
  const cashbackPeriodEarned = computeCashbackEarned(card, periodTransactions)
  const cashbackStartingBalance = typeof card.cashbackStartingBalance === 'number' ? card.cashbackStartingBalance : 0
  const cashbackCap = typeof card.cashbackCap === 'number' ? card.cashbackCap : Number.POSITIVE_INFINITY
  const cashbackEarned = Math.min(cashbackStartingBalance + cashbackPeriodEarned, cashbackCap)
  const cashbackRedeemed = typeof card.cashbackRedeemed === 'number' ? Math.max(0, card.cashbackRedeemed) : 0
  const availableCashback = Math.max(0, cashbackEarned - cashbackRedeemed)

  return {
    card,
    statementDate,
    dueDate,
    previousBalance,
    newCharges,
    paymentsCredits,
    interestCharged: interest,
    statementBalance,
    outstandingBalance,
    minimumPayment,
    availableCredit,
    isPaid,
    cashbackEligibleSpend,
    cashbackEarned,
    cashbackRedeemed,
    availableCashback,
    transactions: periodTransactions,
    transactionHistory,
  }
}

export function resolveCashbackRateForCategory(card: Pick<CreditCard, 'cashbackRate' | 'cashbackCategories' | 'cashbackRules' | 'name' | 'rewardName'>, category: string): number {
  const normalizedCategory = category.trim().toLowerCase()
  const rules = Array.isArray(card.cashbackRules) ? card.cashbackRules : []

  const normalizeKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z]+/g, ' ').trim()
  const aliasMap: Record<string, string[]> = {
    groceries: ['groceries', 'grocery', 'supermarket', 'supermarkets'],
    utilities: ['utilities', 'utility', 'water', 'electricity', 'internet', 'phone', 'payment', 'bills'],
    drugstores: ['drug store', 'drug stores', 'pharmacy', 'pharmacies'],
  }
  const categoryKey = (value: string): string => {
    const normalized = value.trim().toLowerCase()
    if (!normalized || normalized === '*' || normalized === 'all' || normalized.includes('all other')) {
      return '*'
    }

    const compact = normalizeKey(value)
    if (!compact) return '*'

    for (const [canonical, aliases] of Object.entries(aliasMap)) {
      if (aliases.includes(compact)) {
        return canonical
      }
    }

    return compact
  }

  const inferLegacyAmoreRate = (value: string): number | undefined => {
    const identifiers = [card.name, card.rewardName]
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.toLowerCase())

    if (!identifiers.some((item) => item.includes('amore') && item.includes('cashback'))) {
      return undefined
    }

    const key = categoryKey(value)
    if (key === 'groceries') {
      const nameText = [card.name, card.rewardName].filter(Boolean).join(' ').toLowerCase()
      if (nameText.includes('classic')) return 4
      if (nameText.includes('plus')) return 1.5
      return 4
    }

    return undefined
  }

  if (rules.length > 0) {
    const targetKey = categoryKey(normalizedCategory)
    const exactMatch = rules
      .filter((rule) => Array.isArray(rule.categories) && rule.categories.length > 0)
      .find((rule) => rule.categories.some((item) => categoryKey(item) === targetKey))

    if (exactMatch) {
      return Number(exactMatch.rate) || 0
    }

    const premiumAmoreRate = inferLegacyAmoreRate(normalizedCategory)
    if (premiumAmoreRate !== undefined) {
      return premiumAmoreRate
    }

    const wildcardMatch = rules
      .filter((rule) => Array.isArray(rule.categories) && rule.categories.length > 0)
      .find((rule) => rule.categories.some((item) => categoryKey(item) === '*'))

    if (wildcardMatch) {
      return Number(wildcardMatch.rate) || 0
    }

    return 0
  }

  const inferred = inferLegacyAmoreRate(normalizedCategory)
  if (inferred !== undefined) {
    return inferred
  }

  const legacyCategories = (card.cashbackCategories ?? []).map((item) => item.trim().toLowerCase())
  if (legacyCategories.length > 0 && (legacyCategories.includes('*') || legacyCategories.some((value) => categoryKey(value) === categoryKey(normalizedCategory)))) {
    return Number(card.cashbackRate ?? 0)
  }

  return Number(card.cashbackRate ?? 0)
}

function getCashbackEligibleSpend(card: CreditCard, transactions: Transaction[]): number {
  return transactions
    .filter((tx) => {
      if (tx.creditCardId !== card.id) return false
      if (tx.creditCardPayment === true) return false
      if (tx.type !== 'expense' && tx.type !== 'bill') return false
      return resolveCashbackRateForCategory(card, tx.category) > 0
    })
    .reduce((sum, tx) => sum + tx.amount, 0)
}

function getCashbackMinimumSpend(card: Pick<CreditCard, 'name' | 'rewardName' | 'cashbackMinSpend'>): number {
  if (typeof card.cashbackMinSpend === 'number') {
    return card.cashbackMinSpend
  }

  const identifiers = [card.name, card.rewardName]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())

  if (identifiers.some((value) => value.includes('amore'))) {
    return 1000
  }

  return 0
}

function usesFullThousandBlockCashback(card: Pick<CreditCard, 'name' | 'rewardName'>): boolean {
  const identifiers = [card.name, card.rewardName]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())

  return identifiers.some((value) => value.includes('amore') && value.includes('cashback'))
}

function isAnnualFeeTransaction(tx: Pick<Transaction, 'category' | 'description' | 'isAnnualFee'>): boolean {
  if (tx.isAnnualFee === true) return true
  const normalizedCategory = `${tx.category ?? ''}`.trim().toLowerCase()
  const feeCategoryNames = new Set(['fee', 'fees'])
  if (feeCategoryNames.has(normalizedCategory)) return true
  const haystack = `${tx.category ?? ''} ${tx.description ?? ''}`.toLowerCase()
  return haystack.includes('annual fee') || haystack.includes('annual-fee') || haystack.includes('annual fees') || haystack.includes('cc annual fee')
}

export function computeCashbackForTransaction(
  card: Pick<CreditCard, 'id' | 'name' | 'rewardName' | 'cashbackRate' | 'cashbackCategories' | 'cashbackRules' | 'cashbackCap' | 'cashbackMinSpend'>,
  tx: Partial<Transaction> & {
    type: Transaction['type']
    amount: number
    category: string
    description?: string
    creditCardId?: string
    creditCardPayment?: boolean
    isAnnualFee?: boolean
  },
): number {
  if (tx.creditCardId !== card.id) return 0
  if (tx.creditCardPayment === true) return 0
  if (tx.type !== 'expense' && tx.type !== 'bill') return 0
  if (isAnnualFeeTransaction({ category: tx.category, description: tx.description ?? '', isAnnualFee: tx.isAnnualFee })) return 0

  const minimumSpend = getCashbackMinimumSpend(card)
  if (tx.amount < minimumSpend) return 0

  const rate = resolveCashbackRateForCategory(card, tx.category)
  if (rate <= 0) return 0

  if (usesFullThousandBlockCashback(card)) {
    const eligibleBlocks = Math.floor(tx.amount / 1000)
    if (eligibleBlocks <= 0) return 0
    return eligibleBlocks * 1000 * (rate / 100)
  }

  return tx.amount * (rate / 100)
}

export function getCurrentCashbackForTransaction(
  card: CreditCard | undefined,
  tx: Partial<Transaction> & {
    type: Transaction['type']
    amount: number
    category: string
    creditCardId?: string
    creditCardPayment?: boolean
  },
): number {
  if (!card) return 0
  return computeCashbackForTransaction(card, tx)
}

function computeCashbackEarned(card: CreditCard, transactions: Transaction[]): number {
  const cap = typeof card.cashbackCap === 'number' ? card.cashbackCap : Number.POSITIVE_INFINITY

  let total = 0
  for (const tx of transactions) {
    total += computeCashbackForTransaction(card, tx)
  }

  return Math.min(total, cap)
}

/**
 * For the next billing cycle, a fully paid statement resets to the fresh
 * outstanding balance. If the current cycle still has a statement balance,
 * the next cycle is only the portion that was added after the statement closed.
 */
export function getNextBillingCycleBalance(statement: CreditCardStatement): number {
  if (statement.statementBalance <= 0) {
    return Math.max(0, statement.outstandingBalance)
  }

  return Math.max(0, statement.outstandingBalance - statement.statementBalance)
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
        total + computeStatement(card, allTransactions, year, month).outstandingBalance,
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

export function getUtilizationForMonth(
  card: CreditCard,
  allTransactions: Transaction[],
  year: number,
  month: number,
): UtilizationSnapshot {
  const statement = computeStatement(card, allTransactions, year, month)
  const utilizationPercent = card.limit > 0
    ? Math.min(100, (statement.outstandingBalance / card.limit) * 100)
    : 0
  return {
    date: new Date(year, month, 1).toISOString(),
    year,
    month,
    outstandingBalance: statement.outstandingBalance,
    limit: card.limit,
    utilizationPercent,
    cardId: card.id,
  }
}

export function buildUtilizationHistory(
  card: CreditCard,
  allTransactions: Transaction[],
  endYear: number,
  endMonth: number,
  monthsBack = 12,
): UtilizationHistory {
  const snapshots: UtilizationSnapshot[] = []
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const date = new Date(endYear, endMonth - offset, 1)
    snapshots.push(getUtilizationForMonth(card, allTransactions, date.getFullYear(), date.getMonth()))
  }
  const total = snapshots.reduce((sum, snapshot) => sum + snapshot.utilizationPercent, 0)
  const peak = snapshots.reduce(
    (highest, snapshot) => snapshot.utilizationPercent > highest.utilizationPercent ? snapshot : highest,
    snapshots[0],
  )
  const first = snapshots[0]?.utilizationPercent ?? 0
  const current = snapshots.at(-1)?.utilizationPercent ?? 0
  const change = current - first
  return {
    cardId: card.id,
    cardName: card.name,
    limit: card.limit,
    snapshots,
    averageUtilization: snapshots.length > 0 ? total / snapshots.length : 0,
    peakUtilization: {
      percent: peak?.utilizationPercent ?? 0,
      date: peak?.date ?? new Date(endYear, endMonth, 1).toISOString(),
    },
    currentUtilization: current,
    trend: change < -1 ? 'improving' : change > 1 ? 'worsening' : 'stable',
  }
}

export function computeAggregateCashback(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): number {
  return cards
    .filter((card) => card.active && ((card.cashbackRules?.length ?? 0) > 0 || (card.cashbackRate ?? 0) > 0 || (card.rewardName ?? '').trim().length > 0))
    .reduce(
      (sum, card) => sum + Math.max(0, computeStatement(card, allTransactions, year, month).availableCashback),
      0,
    )
}

export function computeAggregateUtilization(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): { totalBalance: number; totalLimit: number; utilizationPercent: number } {
  const activeCards = cards.filter((card) => card.active)
  const totalBalance = activeCards.reduce(
    (sum, card) => sum + computeStatement(card, allTransactions, year, month).outstandingBalance,
    0,
  )
  const totalLimit = activeCards.reduce((sum, card) => sum + card.limit, 0)
  return {
    totalBalance,
    totalLimit,
    utilizationPercent: totalLimit > 0 ? Math.min(100, (totalBalance / totalLimit) * 100) : 0,
  }
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
      ...(card.minimumPaymentOverride !== undefined
        ? { minimumPaymentOverride: card.minimumPaymentOverride }
        : {}),
      projectedBalances: [],
      projectedBalancesMinPay: [],
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
    const minimumPayment = card.minimumPaymentOverride !== undefined
      ? Math.min(balanceMinPay, card.minimumPaymentOverride)
      : computeMinimumPaymentWithInterest(balanceMinPay, apr)
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
  const firstMinimumPayment = card.minimumPaymentOverride !== undefined
    ? Math.min(currentBalance, card.minimumPaymentOverride)
    : computeMinimumPaymentWithInterest(currentBalance, apr)
  const defaultFixedPayment = Math.max(currentBalance * 0.05, 500)
  const fixedPayAmount = Math.max(fixedPayment ?? defaultFixedPayment, firstMinimumPayment)
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
    ...(card.minimumPaymentOverride !== undefined
      ? { minimumPaymentOverride: card.minimumPaymentOverride }
      : {}),
    projectedBalances,
    projectedBalancesMinPay: projectedMinPay,
    totalInterestIfMinPay: totalInterestMinPay,
    monthsToPayoffMinPay: monthsMinPay,
    totalInterestIfFixedPay: totalInterestFixedPay,
    monthsToPayoffFixedPay: monthsFixedPay,
    fixedPaymentAmount: fixedPayAmount,
  }
}