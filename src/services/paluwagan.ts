import { getFirestoreClient } from '../lib/firebase'
import type { Timestamp, Unsubscribe } from 'firebase/firestore'
import type {
  Paluwagan,
  PaluwaganFrequency,
  PaluwaganInput,
  PaluwaganMember,
  PaluwaganSummary,
} from '../types/paluwagan'

const COLLECTION = 'paluwagans'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toIso(value: unknown, timestampCtor: typeof Timestamp): string {
  if (value instanceof timestampCtor) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function newMemberId(): string {
  return `m_${Math.random().toString(36).slice(2, 10)}`
}

function parseMembers(raw: unknown): PaluwaganMember[] | null {
  if (!Array.isArray(raw)) return null
  const members: PaluwaganMember[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.order !== 'number'
    ) {
      return null
    }
    members.push({ id: row.id, name: row.name, order: row.order })
  }
  return members.sort((a, b) => a.order - b.order)
}

function parseContributions(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    out[key] = value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
  }
  return out
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
  timestampCtor: typeof Timestamp,
): Paluwagan | null {
  const userId = data.userId
  const name = data.name
  const contributionAmount = data.contributionAmount
  const frequency = data.frequency
  const startDate = data.startDate
  const notes = data.notes
  const active = data.active
  const members = parseMembers(data.members)

  if (
    typeof userId !== 'string' ||
    typeof name !== 'string' ||
    typeof contributionAmount !== 'number' ||
    (frequency !== 'weekly' && frequency !== 'biweekly' && frequency !== 'monthly') ||
    typeof startDate !== 'string' ||
    !DATE_PATTERN.test(startDate) ||
    typeof notes !== 'string' ||
    typeof active !== 'boolean' ||
    !members
  ) {
    return null
  }

  return {
    id,
    userId,
    name,
    contributionAmount,
    frequency,
    startDate,
    members,
    contributions: parseContributions(data.contributions),
    notes,
    active,
    createdAt: toIso(data.createdAt, timestampCtor),
  }
}

function validateInput(input: PaluwaganInput): void {
  if (!input.name.trim()) throw new Error('Name is required.')
  if (!Number.isFinite(input.contributionAmount) || input.contributionAmount <= 0) {
    throw new Error('Contribution amount must be greater than zero.')
  }
  if (!DATE_PATTERN.test(input.startDate)) {
    throw new Error('Start date must be YYYY-MM-DD.')
  }
  if (Number.isNaN(new Date(`${input.startDate}T00:00:00`).getTime())) {
    throw new Error('Invalid start date.')
  }
  if (input.members.length < 2) {
    throw new Error('Add at least two members.')
  }
  for (const member of input.members) {
    if (!member.name.trim()) throw new Error('Every member needs a name.')
  }
}

function daysForFrequency(frequency: PaluwaganFrequency): number {
  if (frequency === 'weekly') return 7
  if (frequency === 'biweekly') return 14
  return 0
}

/** Round index for `asOf` based on start date and frequency (0-based). */
export function getCurrentRound(circle: Pick<Paluwagan, 'startDate' | 'frequency' | 'members'>, asOf = new Date()): number {
  const start = new Date(`${circle.startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 0
  const total = Math.max(1, circle.members.length)
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
  if (asOfDay < startDay) return 0

  if (circle.frequency === 'monthly') {
    const months =
      (asOfDay.getFullYear() - startDay.getFullYear()) * 12 +
      (asOfDay.getMonth() - startDay.getMonth())
    return Math.min(months, total - 1)
  }

  const diffMs = asOfDay.getTime() - startDay.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const step = daysForFrequency(circle.frequency)
  return Math.min(Math.floor(diffDays / step), total - 1)
}

export function nextDueDate(
  circle: Pick<Paluwagan, 'startDate' | 'frequency' | 'members'>,
  round = getCurrentRound(circle),
): Date | null {
  const start = new Date(`${circle.startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  if (circle.frequency === 'monthly') {
    return new Date(start.getFullYear(), start.getMonth() + round, start.getDate())
  }
  const step = daysForFrequency(circle.frequency)
  const due = new Date(start)
  due.setDate(due.getDate() + round * step)
  return due
}

export function nextRecipient(
  circle: Pick<Paluwagan, 'members'>,
  round = 0,
): PaluwaganMember | null {
  const ordered = [...circle.members].sort((a, b) => a.order - b.order)
  return ordered[round] ?? null
}

export function summarizePaluwagan(circle: Paluwagan, asOf = new Date()): PaluwaganSummary {
  const totalRounds = Math.max(1, circle.members.length)
  const currentRound = getCurrentRound(circle, asOf)
  const paidThisRound = circle.members.filter((member) =>
    (circle.contributions[member.id] ?? []).includes(currentRound),
  ).length
  const complete = currentRound >= totalRounds - 1 && paidThisRound >= circle.members.length

  return {
    currentRound,
    totalRounds,
    nextRecipient: nextRecipient(circle, currentRound),
    nextDueDate: nextDueDate(circle, currentRound),
    potSize: circle.contributionAmount * circle.members.length,
    paidThisRound,
    complete,
  }
}

export function markContribution(
  circle: Paluwagan,
  memberId: string,
  round: number,
  paid = true,
): Paluwagan {
  const prev = circle.contributions[memberId] ?? []
  const nextSet = new Set(prev)
  if (paid) nextSet.add(round)
  else nextSet.delete(round)
  return {
    ...circle,
    contributions: {
      ...circle.contributions,
      [memberId]: [...nextSet].sort((a, b) => a - b),
    },
  }
}

function toStoredMembers(
  inputMembers: PaluwaganInput['members'],
  existing?: PaluwaganMember[],
): PaluwaganMember[] {
  return inputMembers.map((member, index) => {
    const prior = existing?.find((m) => m.order === member.order || m.name === member.name)
    return {
      id: prior?.id ?? newMemberId(),
      name: member.name.trim(),
      order: Number.isFinite(member.order) ? member.order : index,
    }
  })
}

export function subscribePaluwagans(
  userId: string,
  onData: (items: Paluwagan[]) => void,
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
          const items: Paluwagan[] = []
          for (const docSnap of snapshot.docs) {
            const mapped = mapDoc(docSnap.id, docSnap.data(), fs.Timestamp)
            if (mapped) items.push(mapped)
          }
          items.sort((a, b) => a.name.localeCompare(b.name))
          onData(items)
        },
        (error) => onError(error),
      )
    })
    .catch((err: unknown) => {
      if (!disposed) onError(err instanceof Error ? err : new Error(String(err)))
    })

  return () => {
    disposed = true
    unsubscribe()
  }
}

export async function createPaluwagan(userId: string, input: PaluwaganInput): Promise<string> {
  const { fs, db } = await getFirestoreClient()
  validateInput(input)
  const members = toStoredMembers(input.members)
  const ref = await fs.addDoc(fs.collection(db, COLLECTION), {
    userId,
    name: input.name.trim(),
    contributionAmount: input.contributionAmount,
    frequency: input.frequency,
    startDate: input.startDate,
    members,
    contributions: input.contributions ?? {},
    notes: input.notes.trim(),
    active: input.active ?? true,
    createdAt: fs.serverTimestamp(),
  })
  return ref.id
}

export async function updatePaluwagan(
  id: string,
  input: PaluwaganInput,
  existingMembers?: PaluwaganMember[],
): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  validateInput(input)
  await fs.updateDoc(fs.doc(db, COLLECTION, id), {
    name: input.name.trim(),
    contributionAmount: input.contributionAmount,
    frequency: input.frequency,
    startDate: input.startDate,
    members: toStoredMembers(input.members, existingMembers),
    contributions: input.contributions ?? {},
    notes: input.notes.trim(),
    active: input.active ?? true,
  })
}

export async function deletePaluwagan(id: string): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.deleteDoc(fs.doc(db, COLLECTION, id))
}

export async function savePaluwaganContributions(
  id: string,
  contributions: Record<string, number[]>,
): Promise<void> {
  const { fs, db } = await getFirestoreClient()
  await fs.updateDoc(fs.doc(db, COLLECTION, id), { contributions })
}
