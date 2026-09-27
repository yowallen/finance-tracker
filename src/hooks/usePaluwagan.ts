import { useEffect, useMemo, useState } from 'react'
import {
  createPaluwagan,
  deletePaluwagan,
  savePaluwaganContributions,
  subscribePaluwagans,
  updatePaluwagan,
} from '../services/paluwagan'
import type { Paluwagan, PaluwaganInput } from '../types/paluwagan'

export function usePaluwagan(userId: string | undefined, enabled = true) {
  const [items, setItems] = useState<Paluwagan[]>([])
  const [loading, setLoading] = useState(Boolean(userId) && enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !userId) {
      setItems([])
      setLoading(false)
      return undefined
    }

    const unsubscribe = subscribePaluwagans(
      userId,
      (next) => {
        setItems(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [userId, enabled])

  const visible = useMemo(
    () => (enabled && userId ? items : []),
    [enabled, userId, items],
  )

  async function add(input: PaluwaganInput): Promise<void> {
    if (!enabled) throw new Error('Paluwagan is not available on this host.')
    if (!userId) throw new Error('You must be signed in.')
    await createPaluwagan(userId, input)
  }

  async function update(id: string, input: PaluwaganInput): Promise<void> {
    if (!enabled) throw new Error('Paluwagan is not available on this host.')
    const existing = visible.find((item) => item.id === id)
    await updatePaluwagan(id, input, existing?.members)
  }

  async function remove(id: string): Promise<void> {
    if (!enabled) throw new Error('Paluwagan is not available on this host.')
    await deletePaluwagan(id)
  }

  async function setContributions(
    id: string,
    contributions: Record<string, number[]>,
  ): Promise<void> {
    if (!enabled) throw new Error('Paluwagan is not available on this host.')
    await savePaluwaganContributions(id, contributions)
  }

  return {
    circles: visible,
    loading: enabled && userId ? loading : false,
    error: enabled ? error : null,
    add,
    update,
    remove,
    setContributions,
  }
}
