export interface SavingsGoal {
  id: string
  userId: string
  name: string
  /** Price of this wish — position on the shared savings bar. */
  targetAmount: number
  notes: string
  /** Optional JPEG data URL stored in Firestore (compressed thumbnail). */
  imageDataUrl: string | null
  createdAt: string
}

export interface SavingsGoalInput {
  name: string
  targetAmount: number
  notes: string
  /** Pass null to clear; omit to leave unchanged on update is handled by always sending. */
  imageDataUrl: string | null
}

/** Shared pot of money saved toward the wishlist timeline. */
export interface SavingsPool {
  userId: string
  savedAmount: number
}

export type StopPlacement = 'above' | 'below'

export interface SavingsStop {
  goal: SavingsGoal
  /** 0–100 position along the bar (relative to the most expensive goal). */
  positionPercent: number
  reached: boolean
  placement: StopPlacement
}

export interface SavingsJourney {
  savedAmount: number
  /** Most expensive goal target — the bar’s end. */
  limit: number
  /** 0–100 fill of the shared bar. */
  percent: number
  remainingToLimit: number
  stops: SavingsStop[]
  nextStop: SavingsStop | null
}
