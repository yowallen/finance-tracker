import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  CalendarDays,
  CreditCard as CreditCardIcon,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  WalletCards,
  BarChart2,
  TrendingUp,
} from 'lucide-react'
import { CreditCardForm } from './CreditCardForm'
import { LoadingState } from './LoadingState'
import { InterestProjection as InterestProjectionComponent } from './InterestProjection'
import { formatDate, formatMoney } from '../lib/format'
import type {
  CreditCard,
  CreditCardInput,
  CreditCardStatement,
  InterestProjection,
} from '../types/creditCard'

interface CreditCardsProps {
  cards: CreditCard[]
  statements: CreditCardStatement[]
  interestProjections: InterestProjection[]
  loading: boolean
  error: string | null
  isCurrentMonth?: boolean
  onAdd: (input: CreditCardInput) => Promise<void>
  onUpdate: (id: string, input: CreditCardInput) => Promise<void>
  onDelete: (card: CreditCard) => Promise<void>
}

type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral'

function daysUntil(dueDate: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function utilizationPercent(statement: CreditCardStatement): number {
  if (statement.card.limit <= 0) return 0
  return Math.min(100, (statement.statementBalance / statement.card.limit) * 100)
}

function statementStatus(
  statement: CreditCardStatement,
  isCurrentMonth: boolean,
): { label: string; tone: StatusTone } {
  if (!statement.card.active) {
    return { label: 'Inactive', tone: 'neutral' }
  }
  if (statement.statementBalance <= 0) {
    return { label: 'No balance', tone: 'ok' }
  }
  if (!isCurrentMonth) {
    return { label: 'Statement closed', tone: 'neutral' }
  }

  const days = daysUntil(statement.dueDate)
  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, tone: 'danger' }
  }
  if (days <= 7) {
    return { label: days === 0 ? 'Due today' : `Due in ${days}d`, tone: 'warn' }
  }
  return { label: `Due in ${days}d`, tone: 'ok' }
}

export function CreditCards({
  cards,
  statements,
  interestProjections,
  loading,
  error,
  isCurrentMonth = true,
  onAdd,
  onUpdate,
  onDelete,
}: CreditCardsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const noticeTimeoutRef = useRef<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CreditCard | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [projectionCardId, setProjectionCardId] = useState<string | null>(null)

  const projectionByCardId = useMemo(
    () => new Map(interestProjections.map((p) => [p.cardId, p])),
    [interestProjections],
  )

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current !== null) {
        window.clearTimeout(noticeTimeoutRef.current)
      }
    },
    [],
  )

  function announce(message: string) {
    setNotice(message)
    if (noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current)
    }
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 5000)
  }

  function openCreate() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditing(null)
    setShowForm(true)
    setNotice(null)
  }

  function openEdit(card: CreditCard) {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditing(card)
    setShowForm(true)
    setNotice(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setNotice(null)
    requestAnimationFrame(() => {
      const target = returnFocusRef.current?.isConnected
        ? returnFocusRef.current
        : addTriggerRef.current
      target?.focus()
      returnFocusRef.current = null
    })
  }

  function openProjection(cardId: string) {
    setProjectionCardId(cardId)
  }

  function closeProjection() {
    setProjectionCardId(null)
  }

  async function handleSubmit(input: CreditCardInput) {
    const wasEditing = Boolean(editing)
    setSaving(true)
    try {
      if (wasEditing && editing) {
        await onUpdate(editing.id, input)
      } else {
        await onAdd(input)
      }
      closeForm()
      announce(wasEditing ? 'Credit card updated.' : 'Credit card added.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save credit card.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(card: CreditCard) {
    const container = document.querySelector<HTMLElement>('.cc-grid')
    const rows = container?.querySelectorAll<HTMLElement>('.cc-card')
    const deletedIndex = rows
      ? Array.from(rows).findIndex((row) => row.dataset.cardId === card.id)
      : -1

    if (editing?.id === card.id) {
      setEditing(null)
      setShowForm(false)
    }
    setSaving(true)
    try {
      await onDelete(card)
    } finally {
      setSaving(false)
      requestAnimationFrame(() => {
        const remaining = container?.querySelectorAll<HTMLElement>('.cc-card')
        if (remaining && deletedIndex >= 0 && remaining.length > 0) {
          remaining[Math.min(deletedIndex, remaining.length - 1)]
            .querySelector<HTMLElement>('button')
            ?.focus()
        } else {
          headingRef.current?.focus()
        }
      })
    }
  }

  const statementByCardId = useMemo(
    () => new Map(statements.map((statement) => [statement.card.id, statement])),
    [statements],
  )
  const activeCount = cards.filter((card) => card.active).length
  const attentionCount = statements.filter((statement) => {
    const status = statementStatus(statement, isCurrentMonth)
    return status.tone === 'warn' || status.tone === 'danger'
  }).length

  return (
    <section className="cc-section" aria-labelledby="cc-heading">
      <div className="cc-header">
        <div>
          <h2 ref={headingRef} id="cc-heading" tabIndex={-1} className="section-title">
            <WalletCards className="section-icon" aria-hidden="true" />
            Credit Cards
          </h2>
          <p className="cc-subtitle-text">
            {activeCount} active{cards.length !== activeCount ? `, ${cards.length - activeCount} inactive` : ''}
            {attentionCount > 0
              ? ` · ${attentionCount} need${attentionCount === 1 ? 's' : ''} attention`
              : ''}
          </p>
        </div>
        {!showForm && (
          <button
            ref={addTriggerRef}
            type="button"
            className="btn-primary btn-with-icon"
            onClick={openCreate}
          >
            <Plus aria-hidden="true" />
            Add card
          </button>
        )}
      </div>

      {error && (
        <p className="banner-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="cc-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      {showForm && (
        <CreditCardForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onSubmit={handleSubmit}
          onCancelEdit={closeForm}
        />
      )}

      <div className="cc-list-section">
        {loading ? (
          <LoadingState variant="section" label="Loading credit cards…" />
        ) : cards.length === 0 ? (
          <div className="cc-empty-state">
            <CreditCardIcon className="cc-empty-icon" aria-hidden="true" />
            <h3>No credit cards yet</h3>
            <p>Add a card to track limits, statement balances, and upcoming due dates.</p>
            {!showForm && (
              <button
                ref={addTriggerRef}
                type="button"
                className="btn-ghost btn-with-icon"
                onClick={openCreate}
              >
                <Plus className="section-icon" aria-hidden="true" />
                Add your first card
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="cc-grid">
              {cards.map((card) => {
                const statement = statementByCardId.get(card.id)
                if (!statement) return null
                const status = statementStatus(statement, isCurrentMonth)
                const utilization = utilizationPercent(statement)
                const cardColor = card.color ?? '#3B82F6'

                return (
                  <article
                    key={card.id}
                    data-card-id={card.id}
                    tabIndex={-1}
                    className={`cc-card ${status.tone} ${card.active ? '' : 'inactive'}`}
                    style={{ '--card-color': cardColor } as CSSProperties}
                  >
                    <div className="cc-card-top">
                      <div className="cc-card-identity">
                        <div className="cc-card-chip" aria-hidden="true">
                          <CreditCardIcon className="cc-card-icon" aria-hidden="true" />
                        </div>
                        <div className="cc-card-heading">
                          <h4 className="cc-card-name">{card.name}</h4>
                          <p className="cc-card-number">**** **** **** {card.lastFour}</p>
                        </div>
                      </div>
                      <div className="cc-card-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => openEdit(card)}
                          aria-label={`Edit ${card.name}`}
                          title="Edit card"
                          disabled={saving}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => void handleDelete(card)}
                          aria-label={`Delete ${card.name}`}
                          title="Delete card"
                          disabled={saving}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="cc-card-body">
                      <div className="cc-card-primary">
                        <div>
                          <span className="cc-card-label">Statement balance</span>
                          <strong className="cc-card-balance">
                            {formatMoney(statement.statementBalance)}
                          </strong>
                        </div>
                        <span className={`cc-status ${status.tone}`}>{status.label}</span>
                      </div>

                      <div className="cc-card-stats">
                        <div className="cc-card-stat">
                          <span className="cc-card-stat-label">
                            <Landmark aria-hidden="true" />
                            Limit
                          </span>
                          <strong className="cc-card-stat-value">{formatMoney(card.limit)}</strong>
                        </div>
                        <div className="cc-card-stat">
                          <span className="cc-card-stat-label">
                            <WalletCards aria-hidden="true" />
                            Balance
                          </span>
                          <strong className="cc-card-stat-value">{formatMoney(statement.statementBalance)}</strong>
                        </div>
                        <div className="cc-card-stat">
                          <span className="cc-card-stat-label">
                            <CreditCardIcon aria-hidden="true" />
                            Available
                          </span>
                          <strong className="cc-card-stat-value">{formatMoney(statement.availableCredit)}</strong>
                        </div>
                        {card.apr && card.apr > 0 && (
                          <>
                            <div className="cc-card-stat">
                              <span className="cc-card-stat-label">
                                <BarChart2 aria-hidden="true" />
                                APR
                              </span>
                              <strong className="cc-card-stat-value">{card.apr.toFixed(2)}%</strong>
                            </div>
                            {statement.interestCharged > 0 && (
                              <div className="cc-card-stat">
                                <span className="cc-card-stat-label">
                                  <TrendingUp aria-hidden="true" />
                                  Interest
                                </span>
                                <strong className="cc-card-stat-value danger">{formatMoney(statement.interestCharged)}</strong>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="cc-utilization">
                        <div className="cc-utilization-top">
                          <span>Credit used</span>
                          <strong>{utilization.toFixed(1)}%</strong>
                        </div>
                        <div
                          className="cc-utilization-bar"
                          role="progressbar"
                          aria-label={`Credit utilization for ${card.name}`}
                          aria-valuenow={utilization}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuetext={`${utilization.toFixed(1)}% used, ${formatMoney(statement.statementBalance)} of ${formatMoney(card.limit)} limit`}
                        >
                          <div
                            className={`cc-utilization-fill ${status.tone}`}
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                        <p className="cc-utilization-meta">
                          {formatMoney(statement.statementBalance)} of {formatMoney(card.limit)} limit
                        </p>
                      </div>

                      <div className="cc-card-dates">
                        <div className="cc-date-row">
                          <span>
                            <CalendarDays aria-hidden="true" />
                            Statement
                          </span>
                          <strong>{formatDate(statement.statementDate.toISOString())}</strong>
                        </div>
                        <div className="cc-date-row">
                          <span>
                            <CalendarDays aria-hidden="true" />
                            Due
                          </span>
                          <strong>{formatDate(statement.dueDate.toISOString())}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="cc-card-footer">
                      {statement.statementBalance > 0 && card.active && isCurrentMonth && (
                        <span className="cc-payment-hint">
                          Pay via <strong>Bill Reminders</strong> →
                        </span>
                      )}
                      {card.apr && card.apr > 0 && projectionByCardId.has(card.id) && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm cc-projection-btn"
                          onClick={() => openProjection(card.id)}
                          aria-label={`View interest projection for ${card.name}`}
                        >
                          <BarChart2 className="cc-projection-icon" aria-hidden="true" />
                          View projection
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>

      {projectionCardId && projectionByCardId.has(projectionCardId) && (
        <InterestProjectionComponent
          projection={projectionByCardId.get(projectionCardId)!}
          onClose={closeProjection}
        />
      )}
    </section>
  )
}
