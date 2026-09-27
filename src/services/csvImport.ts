import type { TransactionInput, TransactionType } from '../types/transaction'

export type CsvImportProfile = 'gcash' | 'maya' | 'generic'

export interface CsvColumnMap {
  date: number
  amount: number
  description: number
  /** Optional type/debit-credit column index. */
  type?: number
}

export interface ParsedCsvRow {
  input: TransactionInput
  rawLine: number
  profile: CsvImportProfile
}

export interface CsvParseResult {
  profile: CsvImportProfile
  rows: ParsedCsvRow[]
  rejected: number
  headers: string[]
  /** Suggested column map for generic profile (user can override). */
  suggestedMap: CsvColumnMap | null
}

const DATE_HEADERS = ['date', 'transaction date', 'trans date', 'posted', 'posting date', 'time']
const AMOUNT_HEADERS = ['amount', 'amt', 'debit', 'credit', 'transaction amount', 'php']
const DESC_HEADERS = [
  'description',
  'details',
  'particulars',
  'merchant',
  'narration',
  'remarks',
  'transaction',
  'ref',
]
const TYPE_HEADERS = ['type', 'dr/cr', 'debit/credit', 'transaction type', 'in/out']

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Split a CSV line respecting double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

export function parseCsvText(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines.map(splitCsvLine)
}

export function detectCsvProfile(headers: string[]): CsvImportProfile {
  const joined = headers.map(normalizeHeader).join(' | ')
  if (joined.includes('gcash') || joined.includes('g-cash')) return 'gcash'
  if (joined.includes('maya') || joined.includes('paymaya')) return 'maya'
  // GCash exports often include "Product" / "Trans Type" / "Debit" / "Credit"
  const set = new Set(headers.map(normalizeHeader))
  if (set.has('debit') && set.has('credit') && (set.has('product') || set.has('trans type'))) {
    return 'gcash'
  }
  if (set.has('channel') && (set.has('debit') || set.has('credit'))) {
    return 'maya'
  }
  return 'generic'
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate)
    if (idx >= 0) return idx
  }
  for (let i = 0; i < normalized.length; i += 1) {
    for (const candidate of candidates) {
      if (normalized[i].includes(candidate)) return i
    }
  }
  return -1
}

export function suggestColumnMap(headers: string[]): CsvColumnMap | null {
  const date = findColumn(headers, DATE_HEADERS)
  const amount = findColumn(headers, AMOUNT_HEADERS)
  const description = findColumn(headers, DESC_HEADERS)
  const type = findColumn(headers, TYPE_HEADERS)
  if (date < 0 || amount < 0 || description < 0) return null
  return {
    date,
    amount,
    description,
    ...(type >= 0 ? { type } : {}),
  }
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₱,\s]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''))
  if (!cleaned || cleaned === '-') return null
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value) || value === 0) return null
  return value
}

/** Accept common PH export dates: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD-MMM-YYYY. */
export function parseImportDate(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  const slash = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (slash) {
    let a = Number(slash[1])
    let b = Number(slash[2])
    let year = Number(slash[3])
    if (year < 100) year += 2000
    // Prefer DD/MM when day > 12; otherwise assume MM/DD (bank exports vary).
    let month: number
    let day: number
    if (a > 12) {
      day = a
      month = b
    } else if (b > 12) {
      month = a
      day = b
    } else {
      // Ambiguous: treat as MM/DD (common in GCash exports).
      month = a
      day = b
    }
    const d = new Date(year, month - 1, day)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  const named = Date.parse(text)
  if (!Number.isNaN(named)) return new Date(named).toISOString()
  return null
}

function inferType(
  amount: number,
  typeCell: string | undefined,
  profile: CsvImportProfile,
): { type: TransactionType; amount: number } {
  const abs = Math.abs(amount)
  const label = (typeCell ?? '').trim().toLowerCase()

  if (label) {
    if (
      label.includes('in') ||
      label.includes('credit') ||
      label.includes('receive') ||
      label.includes('cash in') ||
      label === 'cr'
    ) {
      return { type: 'income', amount: abs }
    }
    if (
      label.includes('out') ||
      label.includes('debit') ||
      label.includes('send') ||
      label.includes('cash out') ||
      label.includes('payment') ||
      label === 'dr'
    ) {
      return { type: 'expense', amount: abs }
    }
  }

  if (amount < 0) return { type: 'expense', amount: abs }
  if (profile === 'gcash' || profile === 'maya') {
    // Positive alone is ambiguous; treat as expense (most wallet rows are spend).
    return { type: 'expense', amount: abs }
  }
  return { type: amount < 0 ? 'expense' : 'income', amount: abs }
}

export function buildImportKey(
  profile: CsvImportProfile,
  occurredAt: string,
  amount: number,
  description: string,
): string {
  const day = occurredAt.slice(0, 10)
  const desc = description.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${profile}|${day}|${amount.toFixed(2)}|${desc}`
}

function rowFromCells(
  cells: string[],
  map: CsvColumnMap,
  profile: CsvImportProfile,
  lineNumber: number,
  debitIdx?: number,
  creditIdx?: number,
): ParsedCsvRow | null {
  const dateRaw = cells[map.date] ?? ''
  const descRaw = cells[map.description] ?? ''
  const typeRaw = map.type !== undefined ? cells[map.type] : undefined

  let amount: number | null = null
  if (debitIdx !== undefined && creditIdx !== undefined) {
    const debit = parseAmount(cells[debitIdx] ?? '')
    const credit = parseAmount(cells[creditIdx] ?? '')
    if (credit !== null && credit !== 0) {
      amount = Math.abs(credit)
      const occurredAt = parseImportDate(dateRaw)
      if (!occurredAt || !descRaw.trim()) return null
      const input: TransactionInput = {
        type: 'income',
        amount,
        category: 'Other',
        description: descRaw.trim(),
        occurredAt,
        importKey: buildImportKey(profile, occurredAt, amount, descRaw),
      }
      return { input, rawLine: lineNumber, profile }
    }
    if (debit !== null && debit !== 0) {
      amount = Math.abs(debit)
      const occurredAt = parseImportDate(dateRaw)
      if (!occurredAt || !descRaw.trim()) return null
      const input: TransactionInput = {
        type: 'expense',
        amount,
        category: 'Other',
        description: descRaw.trim(),
        occurredAt,
        importKey: buildImportKey(profile, occurredAt, amount, descRaw),
      }
      return { input, rawLine: lineNumber, profile }
    }
    return null
  }

  amount = parseAmount(cells[map.amount] ?? '')
  if (amount === null) return null
  const occurredAt = parseImportDate(dateRaw)
  if (!occurredAt || !descRaw.trim()) return null

  const inferred = inferType(amount, typeRaw, profile)
  const input: TransactionInput = {
    type: inferred.type,
    amount: inferred.amount,
    category: 'Other',
    description: descRaw.trim(),
    occurredAt,
    importKey: buildImportKey(profile, occurredAt, inferred.amount, descRaw),
  }
  return { input, rawLine: lineNumber, profile }
}

export function parseImportCsv(
  text: string,
  options: {
    profile?: CsvImportProfile
    columnMap?: CsvColumnMap
  } = {},
): CsvParseResult {
  const table = parseCsvText(text)
  if (table.length === 0) {
    return { profile: 'generic', rows: [], rejected: 0, headers: [], suggestedMap: null }
  }

  const headers = table[0]
  const profile = options.profile ?? detectCsvProfile(headers)
  const suggestedMap = suggestColumnMap(headers)
  const map = options.columnMap ?? suggestedMap

  const normalized = headers.map(normalizeHeader)
  const debitIdx = normalized.indexOf('debit')
  const creditIdx = normalized.indexOf('credit')
  const useDebitCredit =
    (profile === 'gcash' || profile === 'maya') && debitIdx >= 0 && creditIdx >= 0

  if (!map && !useDebitCredit) {
    return {
      profile,
      rows: [],
      rejected: Math.max(0, table.length - 1),
      headers,
      suggestedMap,
    }
  }

  const effectiveMap: CsvColumnMap =
    map ??
    ({
      date: findColumn(headers, DATE_HEADERS),
      amount: debitIdx >= 0 ? debitIdx : findColumn(headers, AMOUNT_HEADERS),
      description: findColumn(headers, DESC_HEADERS),
    } satisfies CsvColumnMap)

  const rows: ParsedCsvRow[] = []
  let rejected = 0
  for (let i = 1; i < table.length; i += 1) {
    const parsed = rowFromCells(
      table[i],
      effectiveMap,
      profile,
      i + 1,
      useDebitCredit ? debitIdx : undefined,
      useDebitCredit ? creditIdx : undefined,
    )
    if (parsed) rows.push(parsed)
    else rejected += 1
  }

  return { profile, rows, rejected, headers, suggestedMap: suggestedMap ?? effectiveMap }
}
