/** Format a number as PHP currency. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Format an ISO date for display (date only). */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

/** Value for `<input type="date" />` from Date. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Convert a YYYY-MM-DD date input to an ISO string at local noon
 * so the calendar day stays stable across time zones.
 */
export function dateInputToIso(dateInput: string): string {
  const [year, month, day] = dateInput.split('-').map(Number)
  if (!year || !month || !day) {
    throw new Error('Invalid date.')
  }
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString()
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1))
}

/** Format YYYY-MM as "Mar 2027". */
export function formatYearMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return yyyyMm
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1))
}

/** Value for `<input type="month" />` from Date. */
export function toMonthInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}
