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
  ChevronDown,
} from 'lucide-react'
import { CreditCardForm } from './CreditCardForm'
import { CreditLimitBar } from './CreditLimitBar'
import { LoadingState } from './LoadingState'
import { InterestProjection as InterestProjectionComponent } from './InterestProjection'
import { UtilizationChart } from './UtilizationChart'
import { formatDate, formatMoney } from '../lib/format'
import { computePointsForTransaction, computeStatementPeriod, getCurrentCashbackForTransaction, getNextBillingCycleBalance, groupCreditCards, summarizeCardCashback, syncSharedLimitMembership } from '../services/creditCards'
import type { Transaction } from '../types/transaction'
import type {
  CreditCard,
  CreditCardInput,
  CreditCardStatement,
  InterestProjection,
  UtilizationHistory,
} from '../types/creditCard'

interface CreditCardsProps {
  cards: CreditCard[]
  statements: CreditCardStatement[]
  allTransactions?: Transaction[]
  interestProjections: InterestProjection[]
  utilizationHistories: UtilizationHistory[]
  loading: boolean
  error: string | null
  isCurrentMonth?: boolean
  year: number
  month: number
  onAdd: (input: CreditCardInput) => Promise<string | void>
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

function statementStatus(
  statement: CreditCardStatement,
  isCurrentMonth: boolean,
): { label: string; tone: StatusTone } {
  if (!statement.card.active) {
    return { label: 'Inactive', tone: 'neutral' }
  }
  if (statement.statementBalance <= 0 && statement.outstandingBalance <= 0) {
    return { label: 'No balance', tone: 'ok' }
  }
  if (statement.statementBalance <= 0) {
    return { label: 'New charges', tone: 'neutral' }
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
  allTransactions = [],
  interestProjections,
  utilizationHistories,
  loading,
  error,
  isCurrentMonth = true,
  year,
  month,
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
  const [redeemCardId, setRedeemCardId] = useState<string | null>(null)
  const [redeemAmount, setRedeemAmount] = useState('')
  const [historyExpandedByCardId, setHistoryExpandedByCardId] = useState<Record<string, boolean>>({})

  const projectionByCardId = useMemo(
    () => new Map(interestProjections.map((p) => [p.cardId, p])),
    [interestProjections],
  )
  const utilizationByCardId = useMemo(
    () => new Map(utilizationHistories.map((history) => [history.cardId, history])),
    [utilizationHistories],
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

  function toggleHistory(cardId: string) {
    setHistoryExpandedByCardId((current) => ({
      ...current,
      [cardId]: !(current[cardId] ?? true),
    }))
  }

  function isHistoryExpanded(cardId: string) {
    return historyExpandedByCardId[cardId] ?? false
  }

  const statementByCardId = useMemo(
    () => new Map(statements.map((statement) => [statement.card.id, statement])),
    [statements],
  )

  const redeemCard = useMemo(
    () => cards.find((card) => card.id === redeemCardId) ?? null,
    [cards, redeemCardId],
  )
  const redeemStatement = redeemCard ? statementByCardId.get(redeemCard.id) ?? null : null
  const redeemAvailable = redeemStatement ? Math.max(0, redeemStatement.availableCashback) : 0
  const isRedeemOpen = Boolean(redeemCard && redeemAvailable > 0)

  useEffect(() => {
  const updateRedeemAmount = () => {
    if (!redeemCard || redeemAvailable <= 0) {
      setRedeemAmount('');
      return;
    }

    setRedeemAmount(String(Math.round(redeemAvailable)));
  };
    updateRedeemAmount();
  }, [redeemCard, redeemAvailable])

  function closeRedeemDialog() {
    setRedeemCardId(null)
    setRedeemAmount('')
  }

  async function handleSubmit(input: CreditCardInput) {
    const wasEditing = Boolean(editing)
    const { sharedLimitWithId, ...cardInput } = input
    setSaving(true)
    try {
      let savedId = editing?.id
      if (wasEditing && editing) {
        await onUpdate(editing.id, cardInput)
      } else {
        const createdId = await onAdd(cardInput)
        savedId = typeof createdId === 'string' ? createdId : undefined
      }
      if (savedId) {
        const savedCard: CreditCard = {
          id: savedId,
          userId: editing?.userId ?? cards[0]?.userId ?? '',
          createdAt: editing?.createdAt ?? new Date().toISOString(),
          name: cardInput.name,
          lastFour: cardInput.lastFour,
          limit: cardInput.limit,
          statementDay: cardInput.statementDay,
          dueDay: cardInput.dueDay,
          dueDayOffset: cardInput.dueDayOffset,
          color: cardInput.color,
          active: cardInput.active ?? true,
          issuer: cardInput.issuer,
          sharedLimitGroupId: editing?.sharedLimitGroupId,
          sharedLimitPrimary: editing?.sharedLimitPrimary,
          apr: cardInput.apr,
        }
        await syncSharedLimitMembership(savedCard, sharedLimitWithId ?? null, [
          ...cards.filter((card) => card.id !== savedId),
          savedCard,
        ])
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
      if (card.sharedLimitGroupId) {
        await syncSharedLimitMembership(card, null, cards)
      }
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

  function cardToInput(card: CreditCard): CreditCardInput {
    return {
      name: card.name,
      lastFour: card.lastFour,
      limit: card.limit,
      statementDay: card.statementDay,
      dueDay: card.dueDay,
      dueDayOffset: card.dueDayOffset,
      color: card.color,
      active: card.active,
      apr: card.apr,
      interestCalculationMethod: card.interestCalculationMethod,
      gracePeriodDays: card.gracePeriodDays,
      minimumPaymentOverride: card.minimumPaymentOverride,
      cashbackCap: card.cashbackCap,
      cashbackYearlyCap: card.cashbackYearlyCap,
      cashbackStartingBalance: card.cashbackStartingBalance,
      cashbackRedeemed: card.cashbackRedeemed,
      cashbackMinSpend: card.cashbackMinSpend,
      cashbackUsesFullThousandBlocks: card.cashbackUsesFullThousandBlocks,
      cashbackRules: card.cashbackRules,
      rewardName: card.rewardName,
      rewardType: card.rewardType,
      pointsPerSpend: card.pointsPerSpend,
      pointsSpendIncrement: card.pointsSpendIncrement,
      pointsRules: card.pointsRules,
      rewardDescription: card.rewardDescription,
      issuer: card.issuer,
      sharedLimitGroupId: card.sharedLimitGroupId,
      sharedLimitPrimary: card.sharedLimitPrimary,
      madnessLimit: card.madnessLimit,
      madnessUsed: card.madnessUsed,
    }
  }

  async function handleRedeemCashback(card: CreditCard) {
    const statement = statementByCardId.get(card.id)
    if (!statement) {
      announce('This card is not available for redemption right now.')
      return
    }

    const available = Math.max(0, statement.availableCashback)
    if (available <= 0) {
      announce('No cashback is currently available to use on this card.')
      return
    }

    const amount = Number.parseFloat(redeemAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      announce('Enter a valid cashback amount greater than zero.')
      return
    }

    const cappedAmount = Math.min(amount, available)
    try {
      await onUpdate(card.id, {
        ...cardToInput(card),
        cashbackRedeemed: (card.cashbackRedeemed ?? 0) + cappedAmount,
      })
      closeRedeemDialog()
      announce(`Redeemed ${formatMoney(cappedAmount)} from ${card.name}.`)
    } catch (err) {
      announce(err instanceof Error ? err.message : 'Could not redeem cashback.')
    }
  }

  function openRedeemDialog(card: CreditCard) {
    const statement = statementByCardId.get(card.id)
    if (!statement || statement.availableCashback <= 0) {
      announce('No cashback is currently available to use on this card.')
      return
    }

    setRedeemCardId(card.id)
    setRedeemAmount(String(Math.round(statement.availableCashback)))
  }

  const activeCount = cards.filter((card) => card.active).length
  const attentionCount = statements.filter((statement) => {
    const status = statementStatus(statement, isCurrentMonth)
    return status.tone === 'warn' || status.tone === 'danger'
  }).length

  return (
    <section id="credit-cards" className="cc-section" aria-labelledby="cc-heading">
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
          otherCards={cards}
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
            <p>Add a card to track limits, outstanding balances, and upcoming due dates.</p>
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
              {groupCreditCards(cards).map((pool) => {
                const card = pool.primary
                const statement = statementByCardId.get(card.id)
                if (!statement) return null
                const status = statementStatus(statement, isCurrentMonth)
                const hasRewards = card.rewardType === 'points' || (card.cashbackRules?.length ?? 0) > 0
                const cardColor = card.color ?? '#3B82F6'
                const utilizationHistory = utilizationByCardId.get(card.id)
                const nextStatementProjection = getNextBillingCycleBalance(statement)

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
                          {pool.cards.map((member) => (
                            <div className="cc-card-title-row" key={member.id}>
                              <h4 className="cc-card-name">{member.name}</h4>
                              <p className="cc-card-number">•••• {member.lastFour}</p>
                            </div>
                          ))}
                          <span className={`cc-status ${status.tone}`}>{status.label}</span>
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
                          <span className="cc-card-label">Outstanding balance</span>
                          <strong className="cc-card-balance">
                            {formatMoney(statement.outstandingBalance)}
                          </strong>
                        </div>
                      </div>

                      <div className="cc-card-stats">
                        <div className="cc-card-stat">
                          <span className="cc-card-stat-label">
                            <Landmark aria-hidden="true" />
                            Current statement
                          </span>
                          <strong className="cc-card-stat-value">{formatMoney(statement.statementBalance)}</strong>
                        </div>
                        <div className="cc-card-stat">
                          <span className="cc-card-stat-label">
                            <WalletCards aria-hidden="true" />
                            Next billing cycle
                          </span>
                          <strong className="cc-card-stat-value">
                            {formatMoney(nextStatementProjection)}
                          </strong>
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
                        {pool.cards.map((member) => {
                          const memberTransactions = statement.transactions.filter((tx) => tx.creditCardId === member.id)
                          const memberPoints = memberTransactions.reduce(
                            (sum, tx) => sum + computePointsForTransaction(member, tx),
                            0,
                          )
                          const { startDate } = computeStatementPeriod(member, year, month)
                          const memberCashback = summarizeCardCashback(
                            member,
                            allTransactions,
                            startDate,
                            memberTransactions,
                          ).availableCashback
                          if (member.rewardType === 'points') {
                            return (
                              <div className="cc-card-stat" key={member.id}>
                                <span className="cc-card-stat-label">
                                  <WalletCards aria-hidden="true" />
                                  {member.rewardName ?? 'Rewards points'}
                                </span>
                                <strong className="cc-card-stat-value success">{memberPoints.toLocaleString()} pts</strong>
                              </div>
                            )
                          }
                          if ((member.cashbackRules?.length ?? 0) === 0 && !member.name.toLowerCase().includes('cashback')) return null
                          return (
                            <div className="cc-card-stat" key={member.id}>
                              <span className="cc-card-stat-label">
                                <WalletCards aria-hidden="true" />
                                {member.name}
                              </span>
                              <strong className="cc-card-stat-value success">{formatMoney(memberCashback)}</strong>
                            </div>
                          )
                        })}
                      </div>

                      <CreditLimitBar
                        cardName={card.name}
                        cardLimit={card.limit}
                        availableCredit={statement.availableCredit}
                        madnessLimit={card.madnessLimit ?? 0}
                        madnessUsed={card.madnessUsed ?? 0}
                      />

                      {utilizationHistory && <UtilizationChart history={utilizationHistory} />}

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
                        <div className="cc-date-row">
                          <span>
                            <CalendarDays aria-hidden="true" />
                            Cycle
                          </span>
                          <strong>
                            {formatDate(
                              new Date(
                                statement.statementDate.getFullYear(),
                                statement.statementDate.getMonth() - 1,
                                card.statementDay + 1,
                              ).toISOString(),
                            )}
                            {' – '}
                            {formatDate(statement.statementDate.toISOString())}
                          </strong>
                        </div>
                      </div>

                      <div className="cc-transaction-history" aria-labelledby={`cc-history-${card.id}`}>
                        <button
                          type="button"
                          className="cc-history-toggle"
                          aria-expanded={isHistoryExpanded(card.id)}
                          aria-controls={`cc-history-list-${card.id}`}
                          onClick={() => toggleHistory(card.id)}
                        >
                          <div className="cc-history-toggle-row">
                            <div className="cc-history-header">
                              <h5 id={`cc-history-${card.id}`}>
                                Statement transactions
                                <span className="cc-history-count">{statement.transactions.length}</span>
                              </h5>
                            </div>
                            <ChevronDown className="cc-history-chevron" aria-hidden="true" />
                          </div>
                        </button>
                        {isHistoryExpanded(card.id) && (
                          statement.transactions.length === 0 ? (
                            <p className="cc-history-empty">No transactions are in this statement period yet.</p>
                          ) : (
                            <div id={`cc-history-list-${card.id}`} className="cc-history-groups">
                              {pool.cards.map((member) => {
                                const memberTransactions = statement.transactions.filter(
                                  (transaction) => transaction.creditCardId === member.id,
                                )
                                if (pool.cards.length > 1 && memberTransactions.length === 0) return null
                                const rows = pool.cards.length > 1 ? memberTransactions : statement.transactions
                                return (
                                  <section key={member.id} className="cc-history-group" aria-label={member.name}>
                                    {pool.cards.length > 1 && (
                                      <h6 className="cc-history-group-title">
                                        {member.name}
                                        <span className="cc-history-group-number">•••• {member.lastFour}</span>
                                        <span className="cc-history-count">{rows.length}</span>
                                      </h6>
                                    )}
                                    <ul className="cc-history-list">
                                      {rows.map((transaction) => {
                                        const isPayment = transaction.creditCardPayment === true
                                        const chargedCard = pool.cards.find((item) => item.id === transaction.creditCardId) ?? member
                                        const pointsValue = !isPayment
                                          ? computePointsForTransaction(chargedCard, {
                                              type: transaction.type,
                                              amount: transaction.amount,
                                              category: transaction.category,
                                              description: transaction.description,
                                              creditCardId: transaction.creditCardId,
                                              creditCardPayment: false,
                                              isAnnualFee: transaction.isAnnualFee,
                                            })
                                          : 0
                                        const cashbackValue = !isPayment
                                          ? getCurrentCashbackForTransaction(chargedCard, {
                                              id: transaction.id,
                                              occurredAt: transaction.occurredAt,
                                              type: transaction.type,
                                              amount: transaction.amount,
                                              category: transaction.category,
                                              description: transaction.description,
                                              creditCardId: transaction.creditCardId,
                                              creditCardPayment: false,
                                              isAnnualFee: transaction.isAnnualFee,
                                            }, allTransactions)
                                          : 0
                                        return (
                                          <li key={transaction.id} className="cc-history-item">
                                            <div className="cc-history-main">
                                              <strong>{transaction.description.trim() || transaction.category}</strong>
                                              <div className="cc-history-meta">
                                                <time dateTime={transaction.occurredAt}>
                                                  {formatDate(transaction.occurredAt)}
                                                </time>
                                                {!isPayment && pointsValue > 0 && (
                                                  <span className="cc-history-cashback">Points +{pointsValue.toLocaleString()}</span>
                                                )}
                                                {!isPayment && cashbackValue > 0 && (
                                                  <span className="cc-history-cashback">Cashback +{formatMoney(cashbackValue)}</span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="cc-history-amount">
                                              <span className={isPayment ? 'payment' : 'charge'}>
                                                {isPayment ? 'Payment' : 'Charge'}
                                              </span>
                                              <strong className={isPayment ? 'payment' : 'charge'}>
                                                {isPayment ? '+' : '-'}{formatMoney(transaction.amount)}
                                              </strong>
                                            </div>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </section>
                                )
                              })}
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    <div className="cc-card-footer">
                      {hasRewards && statement.availableCashback > 0 && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm cc-projection-btn"
                          onClick={() => openRedeemDialog(card)}
                          aria-label={`Use cashback on ${card.name}`}
                        >
                          <WalletCards className="cc-projection-icon" aria-hidden="true" />
                          <span className="cc-projection-label">Use cashback</span>
                        </button>
                      )}
                      {card.apr && card.apr > 0 && projectionByCardId.has(card.id) && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm cc-projection-btn"
                          onClick={() => openProjection(card.id)}
                          aria-label={`View interest projection for ${card.name}`}
                        >
                          <BarChart2 className="cc-projection-icon" aria-hidden="true" />
                          <span className="cc-projection-label">View projection</span>
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

      {isRedeemOpen && redeemCard && redeemStatement && (
        <div className="transaction-sheet-backdrop" onClick={closeRedeemDialog}>
          <div
            className="transaction-sheet cashback-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cashback-modal-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="transaction-sheet__handle" aria-hidden="true" />
            <div className="transaction-sheet__header">
              <h2 id="cashback-modal-heading" className="transaction-sheet__title">
                Redeem cashback
              </h2>
              <button
                type="button"
                className="icon-btn"
                onClick={closeRedeemDialog}
                aria-label="Close cashback redemption"
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>

            <div className="payment-modal-content">
              <div className="payment-modal-header">
                <div className="payment-modal-bill">
                  <span className="payment-modal-bill-category">Cashback</span>
                  <h3 className="payment-modal-bill-name">{redeemCard.name}</h3>
                </div>
                <strong className="payment-modal-amount">
                  {formatMoney(redeemAvailable)} available
                </strong>
              </div>

              <div className="payment-card-select">
                <p className="payment-card-select-label">Redeem amount</p>
                <div className="cashback-redeem-box">
                  <label className="cashback-redeem-label" htmlFor="cashback-redeem-amount">
                    Amount (₱)
                  </label>
                  <div className="cashback-redeem-input-row">
                    <input
                      id="cashback-redeem-amount"
                      type="number"
                      min="1"
                      max={redeemAvailable}
                      step="1"
                      value={redeemAmount}
                      onChange={(event) => setRedeemAmount(event.target.value)}
                      className="cashback-redeem-input"
                    />
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setRedeemAmount(String(Math.round(redeemAvailable)))}
                    >
                      Use all
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={closeRedeemDialog}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleRedeemCashback(redeemCard)}
                  disabled={redeemAmount.trim() === '' || Number.parseFloat(redeemAmount) <= 0}
                >
                  Redeem cashback
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
