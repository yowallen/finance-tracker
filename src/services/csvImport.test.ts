import { describe, expect, it } from 'vitest'
import {
  buildImportKey,
  detectCsvProfile,
  parseImportCsv,
  parseImportDate,
  splitCsvLine,
} from './csvImport'

describe('csvImport', () => {
  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
  })

  it('parses ISO and slash dates', () => {
    const iso = parseImportDate('2026-03-15')
    expect(iso).toBeTruthy()
    expect(new Date(iso!).getFullYear()).toBe(2026)
    expect(new Date(iso!).getMonth()).toBe(2)
    expect(new Date(iso!).getDate()).toBe(15)

    const us = parseImportDate('03/15/2026')
    expect(us).toBeTruthy()
    expect(new Date(us!).getMonth()).toBe(2)
    expect(new Date(us!).getDate()).toBe(15)

    const eu = parseImportDate('15/03/2026')
    expect(eu).toBeTruthy()
    expect(new Date(eu!).getMonth()).toBe(2)
    expect(new Date(eu!).getDate()).toBe(15)
  })

  it('detects GCash profile from headers', () => {
    expect(
      detectCsvProfile(['Date', 'Description', 'Debit', 'Credit', 'Product']),
    ).toBe('gcash')
  })

  it('parses GCash-style debit/credit rows', () => {
    const csv = [
      'Date,Description,Debit,Credit,Product',
      '03/10/2026,Send Money to Ana,150.00,,GCash',
      '03/11/2026,Receive Money from Ben,,500.00,GCash',
      'bad,row,,,',
    ].join('\n')

    const result = parseImportCsv(csv)
    expect(result.profile).toBe('gcash')
    expect(result.rows).toHaveLength(2)
    expect(result.rejected).toBe(1)
    expect(result.rows[0].input).toMatchObject({
      type: 'expense',
      amount: 150,
      description: 'Send Money to Ana',
    })
    expect(result.rows[1].input).toMatchObject({
      type: 'income',
      amount: 500,
      description: 'Receive Money from Ben',
    })
    expect(result.rows[0].input.importKey).toBe(
      buildImportKey('gcash', result.rows[0].input.occurredAt, 150, 'Send Money to Ana'),
    )
  })

  it('parses Maya-style rows', () => {
    const csv = [
      'Date,Details,Debit,Credit,Channel',
      '2026-04-01,QR Pay SM Mall,320.50,,Maya',
      '2026-04-02,Cash In BPI,,1000,Maya',
    ].join('\n')

    const result = parseImportCsv(csv)
    expect(result.profile).toBe('maya')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].input.type).toBe('expense')
    expect(result.rows[1].input.type).toBe('income')
  })

  it('parses generic bank CSV with suggested columns', () => {
    const csv = [
      'Transaction Date,Particulars,Amount,Type',
      '2026-05-01,Grocery store,-450.00,Debit',
      '2026-05-02,Salary credit,25000,Credit',
    ].join('\n')

    const result = parseImportCsv(csv)
    expect(result.profile).toBe('generic')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].input.type).toBe('expense')
    expect(result.rows[0].input.amount).toBe(450)
    expect(result.rows[1].input.type).toBe('income')
    expect(result.rows[1].input.amount).toBe(25000)
  })
})
