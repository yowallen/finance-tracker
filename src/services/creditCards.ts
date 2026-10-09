import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
import type {
  CardIssuer,
  CashbackRule,
  CreditCard,
  CreditCardInput,
  CreditCardStatement,
  PointsRule,
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
const BPI_MINIMUM_PAYMENT = 850

export function getMinimumPaymentOverride(card: Pick<CreditCard, 'name' | 'minimumPaymentOverride'>): number | undefined {
  if (card.minimumPaymentOverride !== undefined) {
    return card.minimumPaymentOverride
  }

  return card.name.trim().toLowerCase().includes('bpi') ? BPI_MINIMUM_PAYMENT : undefined
}

const CARD_ISSUERS: CardIssuer[] = ['bpi', 'eastwest', 'metrobank', 'unionbank']

const ISSUER_NAME_MARKERS: Array<{ issuer: CardIssuer; markers: string[] }> = [
  { issuer: 'bpi', markers: ['bpi'] },
  { issuer: 'eastwest', markers: ['eastwest', 'east west'] },
  { issuer: 'metrobank', markers: ['metrobank', 'metro bank'] },
  { issuer: 'unionbank', markers: ['unionbank', 'union bank'] },
]

export function resolveCardIssuer(card: Pick<CreditCard, 'issuer' | 'name'>): CardIssuer | undefined {
  if (card.issuer && CARD_ISSUERS.includes(card.issuer)) return card.issuer
  const name = card.name.trim().toLowerCase()
  return ISSUER_NAME_MARKERS.find((entry) => entry.markers.some((marker) => name.includes(marker)))?.issuer
}

export function cardsCanShareLimit(
  left: Pick<CreditCard, 'issuer' | 'name'>,
  right: Pick<CreditCard, 'issuer' | 'name'>,
): boolean {
  const leftIssuer = resolveCardIssuer(left)
  const rightIssuer = resolveCardIssuer(right)
  return leftIssuer !== undefined && leftIssuer === rightIssuer
}

export interface CreditLimitPool {
  id: string
  cards: CreditCard[]
  primary: CreditCard
}

export function groupCreditCards(cards: CreditCard[]): CreditLimitPool[] {
  const groups = new Map<string, CreditCard[]>()
  const solos: CreditCard[] = []

  for (const card of cards) {
    if (!card.sharedLimitGroupId) {
      solos.push(card)
      continue
    }
    const members = groups.get(card.sharedLimitGroupId) ?? []
    members.push(card)
    groups.set(card.sharedLimitGroupId, members)
  }

  const pools: CreditLimitPool[] = solos.map((card) => ({
    id: card.id,
    cards: [card],
    primary: card,
  }))

  for (const [id, members] of groups) {
    if (members.length < 2) {
      const [only] = members
      pools.push({ id: only.id, cards: [only], primary: only })
      continue
    }
    const primary = members.find((card) => card.sharedLimitPrimary)
      ?? [...members].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    pools.push({ id, cards: members, primary })
  }

  return pools
}

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

function normalizePointsRules(value: unknown): PointsRule[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rules: PointsRule[] = []
  for (const rule of value) {
    if (!rule || typeof rule !== 'object') continue
    const pointsPerSpend = coerceNumeric((rule as Record<string, unknown>).pointsPerSpend)
    const pointsSpendIncrement = coerceNumeric((rule as Record<string, unknown>).pointsSpendIncrement)
    const categories = coerceStringArray((rule as Record<string, unknown>).categories)
    if (
      pointsPerSpend === undefined ||
      pointsSpendIncrement === undefined ||
      pointsSpendIncrement <= 0 ||
      !categories ||
      categories.length === 0
    ) {
      continue
    }
    rules.push({ pointsPerSpend, pointsSpendIncrement, categories })
  }
  return rules.length > 0 ? rules : undefined
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
  const madnessLimit = coerceNumeric(data.madnessLimit)
  const madnessUsed = coerceNumeric(data.madnessUsed)
  const rewardName = typeof data.rewardName === 'string' ? data.rewardName : undefined
  const rewardType = data.rewardType === 'points' || data.rewardType === 'cashback' ? data.rewardType : undefined
  const pointsPerSpend = coerceNumeric(data.pointsPerSpend)
  const pointsSpendIncrement = coerceNumeric(data.pointsSpendIncrement)
  const pointsRules = normalizePointsRules(data.pointsRules)
  const rewardDescription = typeof data.rewardDescription === 'string' ? data.rewardDescription : undefined
  const cashbackRate = coerceNumeric(data.cashbackRate)
  const cashbackCap = coerceNumeric(data.cashbackCap)
  const cashbackYearlyCap = coerceNumeric(data.cashbackYearlyCap)
  const cashbackUsesFullThousandBlocks = data.cashbackUsesFullThousandBlocks === true
  const cashbackStartingBalance = coerceNumeric(data.cashbackStartingBalance)
  const cashbackRedeemed = coerceNumeric(data.cashbackRedeemed)
  const cashbackMinSpend = coerceNumeric(data.cashbackMinSpend)
  const cashbackCategories = coerceStringArray(data.cashbackCategories)
  const cashbackRules = normalizeLegacyCashbackRules(data.cashbackRules)
  const issuer = typeof data.issuer === 'string' && CARD_ISSUERS.includes(data.issuer as CardIssuer)
    ? data.issuer as CardIssuer
    : undefined
  const sharedLimitGroupId = typeof data.sharedLimitGroupId === 'string' ? data.sharedLimitGroupId : undefined
  const sharedLimitPrimary = data.sharedLimitPrimary === true

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
    ...(madnessLimit !== undefined ? { madnessLimit } : {}),
    ...(madnessUsed !== undefined ? { madnessUsed } : {}),
    ...(rewardName ? { rewardName } : {}),
    ...(rewardType ? { rewardType } : {}),
    ...(pointsPerSpend !== undefined ? { pointsPerSpend } : {}),
    ...(pointsSpendIncrement !== undefined ? { pointsSpendIncrement } : {}),
    ...(pointsRules ? { pointsRules } : {}),
    ...(rewardDescription ? { rewardDescription } : {}),
    ...(cashbackRate !== undefined ? { cashbackRate } : {}),
    ...(cashbackCap !== undefined ? { cashbackCap } : {}),
    ...(cashbackYearlyCap !== undefined ? { cashbackYearlyCap } : {}),
    ...(cashbackUsesFullThousandBlocks ? { cashbackUsesFullThousandBlocks: true } : {}),
    ...(cashbackStartingBalance !== undefined ? { cashbackStartingBalance } : {}),
    ...(cashbackRedeemed !== undefined ? { cashbackRedeemed } : {}),
    ...(cashbackMinSpend !== undefined ? { cashbackMinSpend } : {}),
    ...(cashbackCategories ? { cashbackCategories } : {}),
    ...(cashbackRules ? { cashbackRules } : {}),
    ...(issuer ? { issuer } : {}),
    ...(sharedLimitGroupId ? { sharedLimitGroupId } : {}),
    ...(sharedLimitPrimary ? { sharedLimitPrimary: true } : {}),
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
  id?: string,
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
    ...(input.issuer ? { issuer: input.issuer } : {}),
    ...(input.sharedLimitGroupId ? { sharedLimitGroupId: input.sharedLimitGroupId } : {}),
    ...(input.sharedLimitPrimary ? { sharedLimitPrimary: true } : {}),
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
  if (input.madnessLimit !== undefined) payload.madnessLimit = input.madnessLimit
  if (input.madnessUsed !== undefined) payload.madnessUsed = input.madnessUsed
  if (input.rewardName !== undefined) {
    payload.rewardName = input.rewardName.trim() || 'Cashback'
  }
  if (input.rewardType !== undefined) payload.rewardType = input.rewardType
  if (input.pointsPerSpend !== undefined) payload.pointsPerSpend = input.pointsPerSpend
  if (input.pointsSpendIncrement !== undefined) payload.pointsSpendIncrement = input.pointsSpendIncrement
  if (input.pointsRules !== undefined) {
    const normalizedRules = normalizePointsRules(input.pointsRules)
    payload.pointsRules = normalizedRules ?? []
  }
  if (input.rewardDescription !== undefined) payload.rewardDescription = input.rewardDescription.trim()
  if (input.cashbackRate !== undefined) {
    payload.cashbackRate = input.cashbackRate
  }
  if (input.cashbackCap !== undefined) {
    payload.cashbackCap = input.cashbackCap
  }
  if (input.cashbackYearlyCap !== undefined) {
    payload.cashbackYearlyCap = input.cashbackYearlyCap
  }
  if (input.cashbackUsesFullThousandBlocks !== undefined) {
    payload.cashbackUsesFullThousandBlocks = input.cashbackUsesFullThousandBlocks
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

  const ref = id
    ? fs.doc(db, COLLECTION, id)
    : await fs.addDoc(fs.collection(db, COLLECTION), payload)

  if (id) {
    await fs.setDoc(ref, payload)
  }

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
    issuer: input.issuer ?? null,
    sharedLimitGroupId: input.sharedLimitGroupId ?? null,
    sharedLimitPrimary: input.sharedLimitPrimary === true ? true : null,
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
  if (input.madnessLimit !== undefined) {
    payload.madnessLimit = input.madnessLimit
  } else {
    payload.madnessLimit = null
  }
  if (input.madnessUsed !== undefined) {
    payload.madnessUsed = input.madnessUsed
  } else {
    payload.madnessUsed = null
  }
  if (input.rewardName !== undefined) {
    payload.rewardName = input.rewardName.trim() || 'Cashback'
  } else {
    payload.rewardName = null
  }
  if (input.rewardType !== undefined) {
    payload.rewardType = input.rewardType
  } else {
    payload.rewardType = null
  }
  if (input.pointsPerSpend !== undefined) {
    payload.pointsPerSpend = input.pointsPerSpend
  } else {
    payload.pointsPerSpend = null
  }
  if (input.pointsSpendIncrement !== undefined) {
    payload.pointsSpendIncrement = input.pointsSpendIncrement
  } else {
    payload.pointsSpendIncrement = null
  }
  if (input.pointsRules !== undefined) {
    payload.pointsRules = normalizePointsRules(input.pointsRules) ?? []
  } else {
    payload.pointsRules = null
  }
  if (input.rewardDescription !== undefined) {
    payload.rewardDescription = input.rewardDescription.trim()
  } else {
    payload.rewardDescription = null
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
  if (input.cashbackYearlyCap !== undefined) {
    payload.cashbackYearlyCap = input.cashbackYearlyCap
  } else {
    payload.cashbackYearlyCap = null
  }
  if (input.cashbackUsesFullThousandBlocks !== undefined) {
    payload.cashbackUsesFullThousandBlocks = input.cashbackUsesFullThousandBlocks
  } else {
    payload.cashbackUsesFullThousandBlocks = false
  }
  if (input.cashbackStartingBalance !== undefined) {
    payload.cashbackStartingBalance = input.cashbackStartingBalance
  } else {
    payload.cashbackStartingBalance = null
  }
  if (input.cashbackRedeemed !== undefined) {
    payload.cashbackRedeemed = input.cashbackRedeemed
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

async function writeSharedLimitFields(
  cardId: string,
  patch: { sharedLimitGroupId?: string; sharedLimitPrimary?: boolean; issuer?: CardIssuer },
): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.updateDoc(fs.doc(db, COLLECTION, cardId), {
    sharedLimitGroupId: patch.sharedLimitGroupId ?? null,
    sharedLimitPrimary: patch.sharedLimitPrimary === true ? true : null,
    ...(patch.issuer ? { issuer: patch.issuer } : {}),
  })
}

/** Join cardId to targetId's limit, or pass null to leave the pool. */
export async function syncSharedLimitMembership(
  card: CreditCard,
  targetId: string | null,
  cards: CreditCard[],
): Promise<void> {
  const previousGroupId = card.sharedLimitGroupId

  if (!targetId) {
    if (previousGroupId) {
      await writeSharedLimitFields(card.id, { sharedLimitGroupId: undefined, sharedLimitPrimary: undefined })
      const leftovers = cards.filter((item) => item.id !== card.id && item.sharedLimitGroupId === previousGroupId)
      if (leftovers.length === 1) {
        await writeSharedLimitFields(leftovers[0].id, { sharedLimitGroupId: undefined, sharedLimitPrimary: undefined })
      }
    }
    return
  }

  const target = cards.find((item) => item.id === targetId)
  if (!target) throw new Error('Choose a card from the same bank.')
  if (!cardsCanShareLimit(card, target)) {
    throw new Error('A shared limit only works between cards from the same bank.')
  }

  const groupId = target.sharedLimitGroupId ?? crypto.randomUUID()
  const primary = cards.find((item) => item.sharedLimitGroupId === target.sharedLimitGroupId && item.sharedLimitPrimary) ?? target

  if (previousGroupId && previousGroupId !== groupId) {
    const leftovers = cards.filter((item) => item.id !== card.id && item.sharedLimitGroupId === previousGroupId)
    if (leftovers.length === 1) {
      await writeSharedLimitFields(leftovers[0].id, { sharedLimitGroupId: undefined, sharedLimitPrimary: undefined })
    }
  }

  await writeSharedLimitFields(primary.id, { sharedLimitGroupId: groupId, sharedLimitPrimary: true, issuer: resolveCardIssuer(primary) })
  if (card.id !== primary.id) {
    await writeSharedLimitFields(card.id, { sharedLimitGroupId: groupId, sharedLimitPrimary: false, issuer: resolveCardIssuer(card) })
  }
  if (target.id !== primary.id && target.id !== card.id) {
    await writeSharedLimitFields(target.id, { sharedLimitGroupId: groupId, sharedLimitPrimary: false, issuer: resolveCardIssuer(target) })
  }
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
 * Cumulative cashback for a card through a statement window.
 * - seed: optional pre-tracking balance on the card
 * - prior: awarded cashback on charges before this period
 * - period: awarded this statement (capped by cashbackCap only for the period)
 * Available = seed + prior + period − redeemed (period cap is not reapplied to the wallet total).
 */
export function summarizeCardCashback(
  card: CreditCard,
  allTransactions: Transaction[],
  periodStart: Date,
  periodTransactions: Transaction[],
): {
  cashbackEligibleSpend: number
  cashbackPeriodEarned: number
  cashbackStartingBalance: number
  cashbackEarned: number
  cashbackRedeemed: number
  availableCashback: number
} {
  const seed = typeof card.cashbackStartingBalance === 'number' ? card.cashbackStartingBalance : 0
  const statementCap = typeof card.cashbackCap === 'number' ? card.cashbackCap : Number.POSITIVE_INFINITY
  const periodStartMs = periodStart.getTime()

  const memberPeriodTransactions = periodTransactions.filter(
    (tx) => !tx.creditCardId || tx.creditCardId === card.id,
  )

  const priorEarned = allTransactions.reduce((sum, tx) => {
    if (tx.creditCardId !== card.id) return sum
    const occurred = new Date(tx.occurredAt).getTime()
    if (!Number.isFinite(occurred) || occurred >= periodStartMs) return sum
    return sum + awardedCashbackForTransaction(card, tx, allTransactions)
  }, 0)

  const uncappedPeriodEarned = memberPeriodTransactions.reduce(
    (sum, tx) => sum + awardedCashbackForTransaction(card, tx, allTransactions),
    0,
  )
  const cashbackPeriodEarned = Math.min(uncappedPeriodEarned, statementCap)
  const cashbackEarned = seed + priorEarned + cashbackPeriodEarned
  const legacyRedeemed = typeof card.cashbackRedeemed === 'number' ? Math.max(0, card.cashbackRedeemed) : 0
  // Counted regardless of date, so a credit posted after this statement still blocks redeeming it twice.
  const creditedRedeemed = allTransactions.reduce(
    (sum, tx) => (tx.creditCardId === card.id && tx.cashbackCredit === true ? sum + tx.amount : sum),
    0,
  )
  const cashbackRedeemed = legacyRedeemed + creditedRedeemed

  return {
    cashbackEligibleSpend: getCashbackEligibleSpend(card, memberPeriodTransactions),
    cashbackPeriodEarned,
    cashbackStartingBalance: seed,
    cashbackEarned,
    cashbackRedeemed,
    availableCashback: Math.max(0, cashbackEarned - cashbackRedeemed),
  }
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
  const { statementDate, dueDate, startDate } = computeStatementPeriod(card, year, month)
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
  const previousDueDate = computeStatementPeriod(card, year, month - 1).dueDate
  const interest = computeInterest(
    card,
    previousBalance,
    newCharges,
    paymentsCredits,
    statementDate,
    startDate,
    sumPaymentsThrough(periodTransactions, previousDueDate),
  )
  const statementBalance = Math.max(0, previousBalance + newCharges - paymentsCredits + interest)
  const outstandingBalance = computeOutstandingBalance(card, allTransactions, year, month)
  const minimumPaymentOverride = getMinimumPaymentOverride(card)
  const minimumPayment = minimumPaymentOverride !== undefined
    ? Math.min(statementBalance, minimumPaymentOverride)
    : card.apr && card.apr > 0
      ? computeMinimumPaymentWithInterest(statementBalance, card.apr)
      : Math.min(statementBalance, Math.max(statementBalance * 0.03, 100))
  const availableCredit = Math.max(0, card.limit - outstandingBalance)
  const isPaid = statementBalance <= 0
  const cashback = summarizeCardCashback(card, allTransactions, startDate, periodTransactions)
  const pointsEarned = computePointsEarned(card, periodTransactions)

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
    cashbackEligibleSpend: cashback.cashbackEligibleSpend,
    cashbackEarned: cashback.cashbackEarned,
    cashbackRedeemed: cashback.cashbackRedeemed,
    availableCashback: cashback.availableCashback,
    pointsEarned,
    transactions: periodTransactions,
    transactionHistory,
  }
}

function poolCardIds(pool: CreditLimitPool): Set<string> {
  return new Set(pool.cards.map((card) => card.id))
}

function transactionsForPool(
  pool: CreditLimitPool,
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  const ids = poolCardIds(pool)
  const { startDate, endDate } = computeStatementPeriod(pool.primary, year, month)
  const start = startDate.getTime()
  const endOfStatementDay = new Date(endDate)
  endOfStatementDay.setHours(23, 59, 59, 999)
  const end = endOfStatementDay.getTime()

  return transactions
    .filter((tx) => {
      if (!tx.creditCardId || !ids.has(tx.creditCardId)) return false
      const t = new Date(tx.occurredAt).getTime()
      return Number.isFinite(t) && t >= start && t <= end
    })
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
}

/**
 * One statement for a shared limit. Solo cards use the same path as computeStatement.
 */
export function computePoolStatement(
  pool: CreditLimitPool,
  allTransactions: Transaction[],
  year: number,
  month: number,
): CreditCardStatement {
  if (pool.cards.length < 2) {
    return computeStatement(pool.primary, allTransactions, year, month)
  }

  const primary = pool.primary
  const { statementDate, dueDate, startDate } = computeStatementPeriod(primary, year, month)
  const periodTransactions = transactionsForPool(pool, allTransactions, year, month)
  const ids = poolCardIds(pool)
  const transactionHistory = allTransactions
    .filter((tx) => {
      if (!tx.creditCardId || !ids.has(tx.creditCardId)) return false
      const occurredAt = new Date(tx.occurredAt).getTime()
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
      return Number.isFinite(occurredAt) && occurredAt <= endOfMonth
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

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

  const cutoff = startDate.getTime()
  let previousBalance = 0
  for (const tx of allTransactions) {
    if (!tx.creditCardId || !ids.has(tx.creditCardId)) continue
    const t = new Date(tx.occurredAt).getTime()
    if (Number.isNaN(t) || t >= cutoff) continue
    if (tx.creditCardPayment === true || tx.type === 'income' || (tx.type === 'savings' && tx.savingsDirection === 'withdraw')) {
      previousBalance -= tx.amount
    } else if (tx.type === 'expense' || tx.type === 'bill') {
      previousBalance += tx.amount
    }
  }
  previousBalance = Math.max(0, previousBalance)

  const previousDueDate = computeStatementPeriod(primary, year, month - 1).dueDate
  const interest = computeInterest(
    primary,
    previousBalance,
    newCharges,
    paymentsCredits,
    statementDate,
    startDate,
    sumPaymentsThrough(periodTransactions, previousDueDate),
  )
  const statementBalance = Math.max(0, previousBalance + newCharges - paymentsCredits + interest)
  const outstandingBalance = pool.cards.reduce(
    (sum, card) => sum + computeOutstandingBalance(card, allTransactions, year, month),
    0,
  )
  const minimumPaymentOverride = getMinimumPaymentOverride(primary)
  const minimumPayment = minimumPaymentOverride !== undefined
    ? Math.min(statementBalance, minimumPaymentOverride)
    : primary.apr && primary.apr > 0
      ? computeMinimumPaymentWithInterest(statementBalance, primary.apr)
      : Math.min(statementBalance, Math.max(statementBalance * 0.03, 100))
  const availableCredit = Math.max(0, primary.limit - outstandingBalance)
  const memberCashback = pool.cards.map((member) => {
    const memberTransactions = periodTransactions.filter((tx) => tx.creditCardId === member.id)
    const totals = summarizeCardCashback(member, allTransactions, startDate, memberTransactions)
    return {
      ...totals,
      points: computePointsEarned(member, memberTransactions),
    }
  })

  return {
    card: primary,
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
    isPaid: statementBalance <= 0,
    cashbackEligibleSpend: memberCashback.reduce((sum, item) => sum + item.cashbackEligibleSpend, 0),
    cashbackEarned: memberCashback.reduce((sum, item) => sum + item.cashbackEarned, 0),
    cashbackRedeemed: memberCashback.reduce((sum, item) => sum + item.cashbackRedeemed, 0),
    availableCashback: memberCashback.reduce((sum, item) => sum + item.availableCashback, 0),
    pointsEarned: memberCashback.reduce((sum, item) => sum + item.points, 0),
    transactions: periodTransactions,
    transactionHistory,
  }
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  groceries: ['groceries', 'grocery', 'supermarket', 'supermarkets'],
  utilities: ['utilities', 'utility', 'water', 'electricity', 'internet', 'phone', 'payment', 'bills'],
  drugstores: ['drug store', 'drug stores', 'pharmacy', 'pharmacies'],
  fuel: ['fuel', 'gas', 'petrol', 'gasoline', 'petron'],
  food: ['food', 'dining', 'restaurant', 'restaurants'],
}

function categoryKey(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === '*' || normalized === 'all' || normalized.includes('all other')) {
    return '*'
  }

  const compact = normalized.replace(/[^a-z]+/g, ' ').trim()
  if (!compact) return '*'

  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.includes(compact)) return canonical
  }

  return compact
}

export function computePointsForTransaction(
  card: Pick<CreditCard, 'id' | 'rewardType' | 'pointsPerSpend' | 'pointsSpendIncrement' | 'pointsRules'>,
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
  if (card.rewardType !== 'points' || tx.creditCardId !== card.id) return 0
  if (tx.creditCardPayment === true || (tx.type !== 'expense' && tx.type !== 'bill')) return 0
  if (isAnnualFeeTransaction({ category: tx.category, description: tx.description ?? '', isAnnualFee: tx.isAnnualFee })) return 0

  const target = categoryKey(tx.category)
  const rules = card.pointsRules ?? []
  const matched = rules.find((rule) => rule.categories.some((item) => categoryKey(item) === target))
    ?? rules.find((rule) => rule.categories.some((item) => categoryKey(item) === '*'))
  const pointsPerSpend = matched?.pointsPerSpend ?? card.pointsPerSpend ?? 0
  const spendIncrement = matched?.pointsSpendIncrement ?? card.pointsSpendIncrement ?? 0
  if (pointsPerSpend <= 0 || spendIncrement <= 0 || tx.amount < spendIncrement) return 0

  return Math.floor(tx.amount / spendIncrement) * pointsPerSpend
}

function computePointsEarned(card: CreditCard, transactions: Transaction[]): number {
  return transactions.reduce((total, tx) => total + computePointsForTransaction(card, tx), 0)
}

export function resolveCashbackRateForCategory(card: { name?: string; rewardType?: CreditCard['rewardType']; cashbackRules?: CreditCard['cashbackRules'] }, category: string): number {
  const rules = cashbackRulesFor(card)
  const targetKey = categoryKey(category)
  const exactMatch = rules
    .filter((rule) => Array.isArray(rule.categories) && rule.categories.length > 0)
    .find((rule) => rule.categories.some((item) => categoryKey(item) === targetKey))

  if (exactMatch) {
    return Number(exactMatch.rate) || 0
  }

  const wildcardMatch = rules
    .filter((rule) => Array.isArray(rule.categories) && rule.categories.length > 0)
    .find((rule) => rule.categories.some((item) => categoryKey(item) === '*'))

  if (wildcardMatch) {
    return Number(wildcardMatch.rate) || 0
  }

  return 0
}

function getCashbackEligibleSpend(card: CreditCard, transactions: Transaction[]): number {
  if (card.rewardType === 'points') return 0

  return transactions
    .filter((tx) => {
      if (tx.creditCardId !== card.id) return false
      if (tx.creditCardPayment === true) return false
      if (tx.type !== 'expense' && tx.type !== 'bill') return false
      return resolveCashbackRateForCategory(card, tx.category) > 0
    })
    .reduce((sum, tx) => sum + tx.amount, 0)
}

const BPI_CASHBACK_RULES: CashbackRule[] = [
  { rate: 4, categories: ['Groceries'] },
  { rate: 4, categories: ['Shopping'] },
  { rate: 1, categories: ['Utilities'] },
  { rate: 1, categories: ['Health'] },
  { rate: 0.3, categories: ['*'] },
]

function cashbackRulesFor(card: { name?: string; rewardType?: CreditCard['rewardType']; cashbackRules?: CreditCard['cashbackRules'] }): CashbackRule[] {
  if (card.rewardType === 'points') return []
  if (card.cashbackRules && card.cashbackRules.length > 0) return card.cashbackRules
  const name = card.name?.trim().toLowerCase() ?? ''
  if (name.includes('bpi') && name.includes('cashback')) return BPI_CASHBACK_RULES
  return []
}

function getCashbackMinimumSpend(card: Pick<CreditCard, 'cashbackMinSpend'>): number {
  if (typeof card.cashbackMinSpend === 'number') {
    return card.cashbackMinSpend
  }
  return 0
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
  card: Pick<CreditCard, 'id' | 'rewardType' | 'cashbackRules' | 'cashbackCap' | 'cashbackMinSpend' | 'cashbackUsesFullThousandBlocks'> & { name?: string },
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
  if (card.rewardType === 'points') return 0
  if (tx.creditCardId !== card.id) return 0
  if (tx.creditCardPayment === true) return 0
  if (tx.type !== 'expense' && tx.type !== 'bill') return 0
  if (isAnnualFeeTransaction({ category: tx.category, description: tx.description ?? '', isAnnualFee: tx.isAnnualFee })) return 0

  const minimumSpend = getCashbackMinimumSpend(card)
  if (tx.amount < minimumSpend) return 0

  const rate = resolveCashbackRateForCategory(card, tx.category)
  if (rate <= 0) return 0

  const usesThousandBlocks = card.cashbackUsesFullThousandBlocks
    ?? ((card.name ?? '').trim().toLowerCase().includes('bpi') && (card.name ?? '').trim().toLowerCase().includes('cashback') && !(card.cashbackRules && card.cashbackRules.length > 0))
  const eligibleAmount = usesThousandBlocks
    ? Math.floor(tx.amount / 1000) * 1000
    : tx.amount
  return eligibleAmount * (rate / 100)
}

function transactionSortKey(tx: { id?: string; occurredAt?: string }): string {
  const time = tx.occurredAt ? new Date(tx.occurredAt).getTime() : 0
  return `${Number.isFinite(time) ? time : 0}:${tx.id ?? ''}`
}

export function awardedCashbackForTransaction(
  card: Pick<CreditCard, 'id' | 'rewardType' | 'cashbackRules' | 'cashbackCap' | 'cashbackMinSpend' | 'cashbackUsesFullThousandBlocks' | 'cashbackYearlyCap'> & { name?: string },
  tx: Partial<Transaction> & {
    id?: string
    occurredAt?: string
    type: Transaction['type']
    amount: number
    category: string
    description?: string
    creditCardId?: string
    creditCardPayment?: boolean
    isAnnualFee?: boolean
  },
  allTransactions: Array<Partial<Transaction> & {
    id?: string
    occurredAt?: string
    type: Transaction['type']
    amount: number
    category: string
    description?: string
    creditCardId?: string
    creditCardPayment?: boolean
    isAnnualFee?: boolean
  }>,
): number {
  const raw = computeCashbackForTransaction(card, tx)
  const cap = card.cashbackYearlyCap
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return raw

  const occurredAt = tx.occurredAt ? new Date(tx.occurredAt) : new Date(NaN)
  const year = Number.isFinite(occurredAt.getTime()) ? occurredAt.getFullYear() : new Date().getFullYear()
  const ordered = allTransactions
    .filter((item) => {
      if (item.creditCardId !== card.id) return false
      const itemDate = item.occurredAt ? new Date(item.occurredAt) : new Date(NaN)
      return Number.isFinite(itemDate.getTime()) && itemDate.getFullYear() === year
    })
    .sort((a, b) => transactionSortKey(a).localeCompare(transactionSortKey(b)))

  let used = 0
  for (const item of ordered) {
    const itemRaw = computeCashbackForTransaction(card, item)
    const awarded = Math.max(0, Math.min(itemRaw, cap - used))
    const sameTransaction = (tx.id && item.id && tx.id === item.id) || item === tx
    if (sameTransaction) return awarded
    used += awarded
  }

  return Math.max(0, Math.min(raw, cap - used))
}

export function getCurrentCashbackForTransaction(
  card: CreditCard | undefined,
  tx: Partial<Transaction> & {
    id?: string
    occurredAt?: string
    type: Transaction['type']
    amount: number
    category: string
    description?: string
    creditCardId?: string
    creditCardPayment?: boolean
    isAnnualFee?: boolean
  },
  allTransactions?: Array<Partial<Transaction> & {
    id?: string
    occurredAt?: string
    type: Transaction['type']
    amount: number
    category: string
    description?: string
    creditCardId?: string
    creditCardPayment?: boolean
    isAnnualFee?: boolean
  }>,
): number {
  if (!card) return 0
  if (allTransactions && typeof card.cashbackYearlyCap === 'number') {
    return awardedCashbackForTransaction(card, tx, allTransactions)
  }
  return computeCashbackForTransaction(card, tx)
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
  return groupCreditCards(cards.filter((card) => card.active)).reduce(
    (total, pool) => total + computePoolStatement(pool, allTransactions, year, month).outstandingBalance,
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
  return groupCreditCards(cards.filter((card) => card.active)).reduce(
    (total, pool) => total + computePoolStatement(pool, allTransactions, year, month).availableCredit,
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

export function buildPoolUtilizationHistory(
  pool: CreditLimitPool,
  allTransactions: Transaction[],
  endYear: number,
  endMonth: number,
  monthsBack = 12,
): UtilizationHistory {
  if (pool.cards.length < 2) {
    return buildUtilizationHistory(pool.primary, allTransactions, endYear, endMonth, monthsBack)
  }

  const snapshots: UtilizationSnapshot[] = []
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const date = new Date(endYear, endMonth - offset, 1)
    const year = date.getFullYear()
    const month = date.getMonth()
    const statement = computePoolStatement(pool, allTransactions, year, month)
    const limit = pool.primary.limit
    snapshots.push({
      date: date.toISOString(),
      year,
      month,
      outstandingBalance: statement.outstandingBalance,
      limit,
      utilizationPercent: limit > 0 ? Math.min(100, (statement.outstandingBalance / limit) * 100) : 0,
      cardId: pool.primary.id,
    })
  }
  const total = snapshots.reduce((sum, snapshot) => sum + snapshot.utilizationPercent, 0)
  const peak = snapshots.reduce(
    (highest, snapshot) => snapshot.utilizationPercent > highest.utilizationPercent ? snapshot : highest,
    snapshots[0],
  )
  const first = snapshots[0]?.utilizationPercent ?? 0
  const current = snapshots.at(-1)?.utilizationPercent ?? 0
  const change = current - first
  const cardName = pool.cards.map((card) => card.name).join(' · ')
  return {
    cardId: pool.primary.id,
    cardName,
    limit: pool.primary.limit,
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
    .filter((card) => card.active && card.rewardType !== 'points' && (card.cashbackRules?.length ?? 0) > 0)
    .reduce(
      (sum, card) => sum + Math.max(0, computeStatement(card, allTransactions, year, month).availableCashback),
      0,
    )
}

export function computeAggregatePoints(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): number {
  return cards
    .filter((card) => card.active && card.rewardType === 'points')
    .reduce(
      (sum, card) => sum + Math.max(0, computeStatement(card, allTransactions, year, month).pointsEarned),
      0,
    )
}

export function computeAggregateUtilization(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): { totalBalance: number; totalLimit: number; utilizationPercent: number } {
  const pools = groupCreditCards(cards.filter((card) => card.active))
  const totalBalance = pools.reduce(
    (sum, pool) => sum + computePoolStatement(pool, allTransactions, year, month).outstandingBalance,
    0,
  )
  const totalLimit = pools.reduce((sum, pool) => sum + pool.primary.limit, 0)
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

  for (const pool of groupCreditCards(cards.filter((card) => card.active))) {
    const statement = computePoolStatement(pool, allTransactions, year, month)
    const due = statement.dueDate.getTime()
    if (due < earliestDue) {
      earliestDue = due
      next = { card: pool.primary, statement }
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
 * Sum payments and credits in `transactions` that occurred on or before the end of `cutoff`'s day.
 */
export function sumPaymentsThrough(transactions: Transaction[], cutoff: Date): number {
  const endOfCutoffDay = new Date(cutoff)
  endOfCutoffDay.setHours(23, 59, 59, 999)
  const end = endOfCutoffDay.getTime()

  return transactions.reduce((sum, tx) => {
    const t = new Date(tx.occurredAt).getTime()
    if (!Number.isFinite(t) || t > end) return sum
    const isCredit = tx.creditCardPayment === true ||
      tx.type === 'income' ||
      (tx.type === 'savings' && tx.savingsDirection === 'withdraw')
    return isCredit ? sum + tx.amount : sum
  }, 0)
}

/**
 * Compute interest for a statement period based on the card's APR and calculation method.
 * Returns the interest amount to be added to the balance.
 *
 * No interest is charged when the previous statement balance was paid in full
 * by the previous due date (`paymentsByPreviousDue` covers `previousBalance`).
 */
export function computeInterest(
  card: CreditCard,
  previousBalance: number,
  newCharges: number,
  paymentsCredits: number,
  statementDate: Date,
  startDate: Date,
  paymentsByPreviousDue: number,
): number {
  const apr = card.apr
  if (!apr || apr <= 0) return 0

  if (paymentsByPreviousDue >= previousBalance - 0.005) {
    return 0
  }

  const { daily, monthly } = getInterestRates(apr)
  const calculationMethod = card.interestCalculationMethod ?? 'daily'

  if (calculationMethod === 'daily') {
    // Daily balance method: interest = daily_rate * average_daily_balance * days_in_period
    // Simplified: use statement balance as average daily balance
    const daysInPeriod = Math.floor((statementDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
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
      ...(getMinimumPaymentOverride(card) !== undefined
        ? { minimumPaymentOverride: getMinimumPaymentOverride(card) }
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
    const minimumPaymentOverride = getMinimumPaymentOverride(card)
    const minimumPayment = minimumPaymentOverride !== undefined
      ? Math.min(balanceMinPay, minimumPaymentOverride)
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
  const minimumPaymentOverride = getMinimumPaymentOverride(card)
  const firstMinimumPayment = minimumPaymentOverride !== undefined
    ? Math.min(currentBalance, minimumPaymentOverride)
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