import { useMemo, useState, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { formatMoney } from '../lib/format'
import {
  detectCsvProfile,
  parseImportCsv,
  type CsvColumnMap,
  type CsvImportProfile,
  type ParsedCsvRow,
} from '../services/csvImport'
import { CATEGORIES, type TransactionInput, type TransactionType } from '../types/transaction'

interface CsvImportSheetProps {
  open: boolean
  existingImportKeys: Set<string>
  onClose: () => void
  onImport: (inputs: TransactionInput[]) => Promise<{ created: number; skipped: number }>
}

type DraftRow = ParsedCsvRow & { selected: boolean }

export function CsvImportSheet({
  open,
  existingImportKeys,
  onClose,
  onImport,
}: Readonly<CsvImportSheetProps>) {
  const [rawText, setRawText] = useState('')
  const [profile, setProfile] = useState<CsvImportProfile>('generic')
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<CsvColumnMap | null>(null)
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [rejected, setRejected] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  const selectedCount = useMemo(
    () => drafts.filter((row) => row.selected).length,
    [drafts],
  )

  function reset() {
    setRawText('')
    setProfile('generic')
    setHeaders([])
    setColumnMap(null)
    setDrafts([])
    setRejected(0)
    setError(null)
    setResultMsg(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function applyParse(text: string, nextProfile?: CsvImportProfile, nextMap?: CsvColumnMap | null) {
    setError(null)
    setResultMsg(null)
    if (!text.trim()) {
      setDrafts([])
      setRejected(0)
      setHeaders([])
      return
    }
    const parsed = parseImportCsv(text, {
      profile: nextProfile,
      columnMap: nextMap ?? undefined,
    })
    setProfile(parsed.profile)
    setHeaders(parsed.headers)
    setColumnMap(parsed.suggestedMap)
    setRejected(parsed.rejected)
    setDrafts(
      parsed.rows.map((row) => ({
        ...row,
        selected: !(row.input.importKey && existingImportKeys.has(row.input.importKey)),
      })),
    )
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setRawText(text)
      applyParse(text)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
    event.target.value = ''
  }

  function handlePasteParse() {
    applyParse(rawText, profile, columnMap)
  }

  function updateDraft(index: number, patch: Partial<TransactionInput> & { selected?: boolean }) {
    setDrafts((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row
        const { selected, ...inputPatch } = patch
        return {
          ...row,
          selected: selected ?? row.selected,
          input: { ...row.input, ...inputPatch },
        }
      }),
    )
  }

  async function handleConfirm() {
    const inputs = drafts.filter((row) => row.selected).map((row) => row.input)
    if (inputs.length === 0) {
      setError('Select at least one row to import.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { created, skipped } = await onImport(inputs)
      setResultMsg(
        `Imported ${created} transaction${created === 1 ? '' : 's'}` +
          (skipped > 0 ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''),
      )
      if (created > 0) {
        setTimeout(() => handleClose(), 900)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="transaction-sheet-backdrop" onClick={handleClose}>
      <div
        className="transaction-sheet csv-import-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="transaction-sheet__handle" aria-hidden="true" />
        <div className="transaction-sheet__header">
          <h2 id="csv-import-heading" className="transaction-sheet__title">
            Import CSV
          </h2>
          <button type="button" className="icon-btn" onClick={handleClose} aria-label="Close import">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="csv-import-body">
          <p className="csv-import-note">
            Upload a GCash, Maya, or bank CSV export. Duplicates are skipped using date, amount, and
            description.
          </p>

          <label className="csv-import-file btn-ghost">
            <Upload aria-hidden="true" size={16} />
            Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} hidden />
          </label>

          <label className="csv-import-paste">
            Or paste CSV text
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={5}
              placeholder="Date,Description,Amount..."
            />
          </label>

          <div className="csv-import-toolbar">
            <label>
              Profile
              <select
                value={profile}
                onChange={(e) => {
                  const next = e.target.value as CsvImportProfile
                  setProfile(next)
                  applyParse(rawText, next, columnMap)
                }}
              >
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
                <option value="generic">Generic / bank</option>
              </select>
            </label>
            <button type="button" className="btn-ghost" onClick={handlePasteParse} disabled={!rawText.trim()}>
              Parse
            </button>
          </div>

          {profile === 'generic' && headers.length > 0 && columnMap && (
            <div className="csv-column-map">
              <p className="biller-presets__label">Column mapping</p>
              {(['date', 'amount', 'description'] as const).map((field) => (
                <label key={field}>
                  {field}
                  <select
                    value={columnMap[field]}
                    onChange={(e) => {
                      const next = { ...columnMap, [field]: Number(e.target.value) }
                      setColumnMap(next)
                      applyParse(rawText, profile, next)
                    }}
                  >
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <div className="csv-import-preview">
              <p className="csv-import-preview__meta">
                {selectedCount} selected · {rejected} rejected
                {detectCsvProfile(headers) !== profile ? ` · forced ${profile}` : ''}
              </p>
              <ul className="csv-import-rows">
                {drafts.map((row, index) => (
                  <li key={`${row.rawLine}-${row.input.importKey}`}>
                    <label className="csv-import-row">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => updateDraft(index, { selected: e.target.checked })}
                      />
                      <div className="csv-import-row__main">
                        <span>{row.input.description}</span>
                        <small>
                          {row.input.occurredAt.slice(0, 10)} · {formatMoney(row.input.amount)}
                          {row.input.importKey && existingImportKeys.has(row.input.importKey)
                            ? ' · already imported'
                            : ''}
                        </small>
                      </div>
                      <select
                        value={row.input.type}
                        onChange={(e) =>
                          updateDraft(index, {
                            type: e.target.value as TransactionType,
                            category:
                              e.target.value === 'income'
                                ? CATEGORIES.income[0]
                                : CATEGORIES.expense[CATEGORIES.expense.length - 1],
                          })
                        }
                        aria-label="Transaction type"
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                        <option value="bill">Bill</option>
                      </select>
                      <select
                        value={row.input.category}
                        onChange={(e) => updateDraft(index, { category: e.target.value })}
                        aria-label="Category"
                      >
                        {CATEGORIES[row.input.type === 'bill' ? 'bill' : row.input.type === 'income' ? 'income' : 'expense'].map(
                          (category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {resultMsg && (
            <p className="csv-import-success" role="status">
              {resultMsg}
            </p>
          )}

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={handleClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleConfirm()}
              disabled={busy || selectedCount === 0}
            >
              {busy ? 'Importing…' : `Import ${selectedCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
