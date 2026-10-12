/** Digits and one decimal point, at most two decimal places. No commas. */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (!cleaned) return ''

  const dot = cleaned.indexOf('.')
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, '')
  if (dot === -1) return intDigits

  const decDigits = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  const head = intDigits || '0'
  if (cleaned.endsWith('.') && decDigits.length === 0) return `${head}.`
  return `${head}.${decDigits}`
}

/** Thousands separators for a sanitized money string, keeping a trailing decimal point. */
export function formatMoneyInput(raw: string): string {
  const value = sanitizeMoneyInput(raw)
  if (!value) return ''

  const [intPart, decPart] = value.split('.')
  const grouped = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart === undefined ? grouped : `${grouped}.${decPart}`
}

/** Caret index in the formatted text that matches the same digit the user just edited. */
export function moneyCaretIndex(typed: string, caret: number, formatted: string): number {
  const before = typed.slice(0, caret).replace(/[^\d.]/g, '').length
  if (before <= 0) return 0

  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    const char = formatted[index]
    if ((char >= '0' && char <= '9') || char === '.') {
      seen += 1
      if (seen === before) return index + 1
    }
  }
  return formatted.length
}
