import { describe, expect, it } from 'vitest'
import { formatMoneyInput, moneyCaretIndex, sanitizeMoneyInput } from './moneyInput'

describe('money input formatting', () => {
  it('keeps a plain number and drops extra decimals', () => {
    expect(sanitizeMoneyInput('₱1,250.259')).toBe('1250.25')
    expect(sanitizeMoneyInput('')).toBe('')
    expect(sanitizeMoneyInput('abc')).toBe('')
  })

  it('keeps a trailing decimal point and a leading zero before cents', () => {
    expect(sanitizeMoneyInput('1000.')).toBe('1000.')
    expect(sanitizeMoneyInput('.5')).toBe('0.5')
    expect(sanitizeMoneyInput('00050')).toBe('50')
  })

  it('groups thousands without dropping the decimal the user is typing', () => {
    expect(formatMoneyInput('1250')).toBe('1,250')
    expect(formatMoneyInput('1250.')).toBe('1,250.')
    expect(formatMoneyInput('1250.5')).toBe('1,250.5')
    expect(formatMoneyInput('')).toBe('')
  })

  it('puts the caret after the same digit once a comma is inserted', () => {
    expect(moneyCaretIndex('1250', 1, '1,250')).toBe(1)
    expect(moneyCaretIndex('1250', 2, '1,250')).toBe(3)
    expect(moneyCaretIndex('1,250.5', 6, '1,250.5')).toBe(6)
  })
})
