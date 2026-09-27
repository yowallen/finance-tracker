export type PaluwaganFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface PaluwaganMember {
  id: string
  name: string
  /** 0-based payout order (slot 0 receives round 0). */
  order: number
}

export interface Paluwagan {
  id: string
  userId: string
  name: string
  contributionAmount: number
  frequency: PaluwaganFrequency
  /** YYYY-MM-DD */
  startDate: string
  members: PaluwaganMember[]
  /** memberId → round indexes (0-based) that member has paid. */
  contributions: Record<string, number[]>
  notes: string
  active: boolean
  createdAt: string
}

export interface PaluwaganInput {
  name: string
  contributionAmount: number
  frequency: PaluwaganFrequency
  startDate: string
  members: Array<{ name: string; order: number }>
  contributions?: Record<string, number[]>
  notes: string
  active?: boolean
}

export interface PaluwaganSummary {
  currentRound: number
  totalRounds: number
  nextRecipient: PaluwaganMember | null
  nextDueDate: Date | null
  potSize: number
  /** How many members have paid the current round. */
  paidThisRound: number
  complete: boolean
}

export const FREQUENCY_LABELS: Record<PaluwaganFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}
