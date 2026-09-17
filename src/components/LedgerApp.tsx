import { useCallback, useMemo, useRef, useState } from 'react'
import { BookMarked, LogOut } from 'lucide-react'
import type { User } from 'firebase/auth'
import { BillReminders } from './BillReminders'
import { CreditCards } from './CreditCards'
import { FinanceCalendar } from './FinanceCalendar'
import { LoadingState } from './LoadingState'
import { MonthSummary } from './MonthSummary'
import { SavingsGoals } from './SavingsGoals'
import { SavingsStats } from './SavingsStats'
import { SpendingStats } from './SpendingStats'
import { ThemeToggle } from './ThemeToggle'
import { TransactionForm } from './TransactionForm'
import { TransactionList } from './TransactionList'
import { UndoToast, type PendingUndo, type UndoResource } from './UndoToast'
import { useCreditCards } from '../hooks/useCreditCards'
import { useRecurringBills } from '../hooks/useRecurringBills'
import { useSavingsGoals } from '../hooks/useSavingsGoals'
import { useTransactions } from '../hooks/useTransactions'
import {
  buildBalanceOutlook,
  computeMonthNetThroughDay,
  computeRunningBalanceForDay,
  computeRunningBalanceForMonth,
} from '../services/balanceOutlook'
import {
  buildMonthlySavingsHistory,
  buildMonthlySpendingHistory,
  computeMonthlySavingsStats,
  computeMonthlySpendingStats,
} from '../services/transactions'
import type { BillReminder, RecurringBill, RecurringBillInput } from '../types/recurringBill'
import type { CreditCard, CreditCardInput } from '../types/creditCard'
import type { SavingsGoal, SavingsGoalInput } from '../types/savingsGoal'
import type { ThemeMode } from '../lib/theme'
import type { Transaction, TransactionInput } from '../types/transaction'
import type { PaymentAllocationPlan } from '../types/creditCard'

/** Heading id to refocus after an Undo restores a deleted item. */
const UNDO_FOCUS_TARGET: Record<UndoResource, string> = {
  transaction: 'list-heading',
  bill: 'reminders-heading',
  goal: 'savings-heading',
  card: 'cc-heading',
}

interface LedgerAppProps {
  user: User
  theme: ThemeMode
  onToggleTheme: () => void
  onLogOut: () => void
}

function billToInput(bill: RecurringBill): RecurringBillInput {
  return {
    name: bill.name,
    amount: bill.amount,
    category: bill.category,
    dueDay: bill.dueDay,
    startsOn: bill.startsOn,
    durationValue: bill.durationValue,
    durationUnit: bill.durationUnit,
    notes: bill.notes,
    active: bill.active,
  }
}

function goalToInput(goal: SavingsGoal): SavingsGoalInput {
  return {
    name: goal.name,
    targetAmount: goal.targetAmount,
    notes: goal.notes,
    imageDataUrl: goal.imageDataUrl,
  }
}

function txToInput(tx: Transaction): TransactionInput {
  return {
    type: tx.type,
    amount: tx.amount,
    category: tx.category,
    description: tx.description,
    occurredAt: tx.occurredAt,
    ...(tx.recurringBillId ? { recurringBillId: tx.recurringBillId } : {}),
    ...(tx.savingsDirection ? { savingsDirection: tx.savingsDirection } : {}),
  }
}

function LedgerApp({ user, theme, onToggleTheme, onLogOut }: LedgerAppProps) {
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null)
  const undoIdRef = useRef(0)

  const userId = user.uid

  const {
    transactions,
    allTransactions,
    summary,
    loading: txLoading,
    error: txError,
    add,
    update,
    remove,
  } = useTransactions(userId, year, month)

  const {
    cards,
    activeCards,
    statements,
    interestProjections,
    totalOutstanding,
    totalAvailableCredit,
    nextDueStatement,
    utilizationHistories,
    aggregateUtilization,
    cardById,
    loading: ccLoading,
    error: ccError,
    add: addCard,
    update: updateCard,
    remove: removeCard,
  } = useCreditCards(userId, allTransactions, year, month)

  const {
    journey: savingsJourney,
    loading: goalsLoading,
    error: goalsError,
    add: addGoal,
    update: updateGoal,
    contribute: contributeGoal,
    remove: removeGoal,
  } = useSavingsGoals(userId, allTransactions)

  const {
    bills,
    reminders,
    ccPaymentBills,
    loading: billLoading,
    error: billError,
    add: addBill,
    update: updateBill,
    remove: removeBill,
  } = useRecurringBills(userId, year, month, transactions, cards, statements, allTransactions)

  const dataLoading = txLoading || billLoading || goalsLoading

  const monthBalance = useMemo(() => {
    const base = computeRunningBalanceForMonth(bills, allTransactions, year, month, ccPaymentBills)

    if (!isCurrentMonth) {
      return base
    }

    return {
      ...base,
      runningBalance: computeRunningBalanceForDay(
        bills,
        allTransactions,
        year,
        month,
        now.getDate(),
        ccPaymentBills,
      ),
      monthNet: computeMonthNetThroughDay(
        bills,
        allTransactions,
        year,
        month,
        now.getDate(),
        ccPaymentBills,
      ),
    }
  }, [bills, allTransactions, ccPaymentBills, year, month, isCurrentMonth, now])

  const outlookRows = useMemo(
    () => buildBalanceOutlook(bills, allTransactions, year, month, 11, ccPaymentBills),
    [bills, allTransactions, ccPaymentBills, year, month],
  )

  const spendingStats = useMemo(
    () => computeMonthlySpendingStats(transactions),
    [transactions],
  )

  const spendingHistory = useMemo(
    () => buildMonthlySpendingHistory(allTransactions, year, month, 5),
    [allTransactions, year, month],
  )

  const savingsStats = useMemo(
    () =>
      computeMonthlySavingsStats(transactions, allTransactions, year, month),
    [transactions, allTransactions, year, month],
  )

  const savingsHistory = useMemo(
    () => buildMonthlySavingsHistory(allTransactions, year, month, 5),
    [allTransactions, year, month],
  )

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  function selectMonth(nextYear: number, nextMonth: number) {
    setYear(nextYear)
    setMonth(nextMonth)
  }

  /** Stage an Undo offer for a just-applied destructive action. */
  function stageUndo(message: string, resource: UndoResource, restore: () => Promise<void>) {
    undoIdRef.current += 1
    setPendingUndo({ id: undoIdRef.current, message, resource, restore })
  }

  function dismissUndo() {
    setPendingUndo(null)
  }

  const handleUndo = useCallback(
    async (pending: PendingUndo) => {
      try {
        await pending.restore()
        setPendingUndo(null)
        // Announce context for screen readers by focusing the section heading.
        requestAnimationFrame(() => {
          document.getElementById(UNDO_FOCUS_TARGET[pending.resource])?.focus()
        })
      } catch (err) {
        console.error('Failed to undo deletion', err)
        setPendingUndo((prev) =>
          prev?.id === pending.id
            ? { ...prev, message: `${prev.message} — Undo failed. It may have been re-added already.`, restore: async () => {} }
            : prev,
        )
      }
    },
    [],
  )

  async function handleSubmit(input: TransactionInput) {
    setSaving(true)
    try {
      if (editing) {
        await update(editing.id, input)
        setEditing(null)
        // The form remounts back to "Add" mode; anchor keyboard/SR users there.
        requestAnimationFrame(() => {
          document.getElementById('form-heading')?.focus()
        })
      } else {
        await add(input)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const target = allTransactions.find((tx) => tx.id === id)
    if (editing?.id === id) setEditing(null)
    setSaving(true)
    try {
      await remove(id)
      if (target) {
        const label = target.description.trim() || target.category
        stageUndo(`Deleted “${label}”`, 'transaction', async () => {
          await add(txToInput(target))
        })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveBill(bill: RecurringBill) {
    setSaving(true)
    try {
      await removeBill(bill.id)
      stageUndo(`Removed “${bill.name}” reminder`, 'bill', async () => {
        await addBill(billToInput(bill))
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveGoal(goal: SavingsGoal) {
    setSaving(true)
    try {
      await removeGoal(goal.id)
      stageUndo(`Removed “${goal.name}” from the track`, 'goal', async () => {
        await addGoal(goalToInput(goal))
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkPaid(reminder: BillReminder, paymentCreditCardId?: string) {
    const day = isCurrentMonth ? now.getDate() : reminder.dueDate.getDate()
    const occurred = new Date(year, month, day, 12, 0, 0, 0)

    // Check if this is a credit card payment bill
    const isCreditCardPayment = (reminder as BillReminder & { isCreditCardPayment?: boolean }).isCreditCardPayment
    const creditCardId = (reminder as BillReminder & { creditCardId?: string }).creditCardId

    let transaction: TransactionInput

    if (isCreditCardPayment && creditCardId) {
      // Credit card payment: pay off the credit card balance
      transaction = {
        type: 'bill',
        amount: reminder.bill.amount,
        category: 'Credit card payment',
        description: `Payment to ${reminder.bill.notes || `•••• ${creditCardId.slice(-4)}`}`,
        occurredAt: occurred.toISOString(),
        creditCardId,
        creditCardPayment: true,
      }
    } else {
      // Regular recurring bill payment
      transaction = {
        type: 'bill',
        amount: reminder.bill.amount,
        category: reminder.bill.category,
        description: reminder.bill.name,
        occurredAt: occurred.toISOString(),
        recurringBillId: reminder.bill.id,
        ...(paymentCreditCardId ? { creditCardId: paymentCreditCardId } : {}),
      }
    }

    setSaving(true)
    try {
      await add(transaction)
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyAllocation(plan: PaymentAllocationPlan) {
    const occurred = new Date(year, month, isCurrentMonth ? now.getDate() : 1, 12, 0, 0, 0)
    for (const allocation of plan.allocations) {
      if (allocation.allocatedAmount <= 0) continue
      await add({
        type: 'bill',
        amount: allocation.allocatedAmount,
        category: 'Credit card payment',
        description: `Allocated payment to ${allocation.cardName}`,
        occurredAt: occurred.toISOString(),
        creditCardId: allocation.cardId,
        creditCardPayment: true,
      })
    }
  }

  async function handleRemoveCard(card: CreditCard) {
    setSaving(true)
    try {
      await removeCard(card.id)
      stageUndo(`Removed “${card.name}”`, 'card', async () => {
        await addCard(cardToInput(card))
      })
    } finally {
      setSaving(false)
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
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <h1 className="brand">
            <BookMarked className="brand-icon" aria-hidden="true" />
            Ledger
          </h1>
          <span className="topbar-email">{user.email ?? 'Signed in'}</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            className="btn-ghost btn-with-icon"
            aria-label="Log out"
            title="Log out"
            onClick={() => {
              setEditing(null)
              dismissUndo()
              onLogOut()
            }}
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </header>

      {saving && (
        <div className="save-progress" role="status" aria-live="polite">
          <span className="save-progress-bar" />
          <span className="visually-hidden">Saving changes…</span>
        </div>
      )}

      {pendingUndo && (
        <UndoToast pending={pendingUndo} onUndo={(p) => void handleUndo(p)} onDismiss={dismissUndo} />
      )}

      <main className="main" aria-busy={dataLoading || saving}>
        {dataLoading ? (
          <section className="month-summary">
            <LoadingState variant="page" label="Reloading your ledger…" />
          </section>
        ) : (
          <>
            <MonthSummary
              year={year}
              month={month}
              summary={summary}
              unpaidScheduledBills={monthBalance.unpaidScheduledBills}
              unpaidCount={monthBalance.unpaidCount}
              monthNet={monthBalance.monthNet}
              runningBalance={monthBalance.runningBalance}
              isCurrentMonth={isCurrentMonth}
              savingsPot={savingsJourney.savedAmount}
              outlookRows={outlookRows}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              onSelectMonth={selectMonth}
              hasActiveCards={activeCards.length > 0}
              totalOutstanding={totalOutstanding}
              totalAvailableCredit={totalAvailableCredit}
              nextDueStatement={nextDueStatement}
              aggregateUtilization={aggregateUtilization}
              onNavigateToCards={() => {
                const ccSection = document.getElementById('cc-heading')
                ccSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                ccSection?.focus()
              }}
            />

            {txError && (
              <p className="banner-error" role="alert">
                {txError}
              </p>
            )}

            <FinanceCalendar
              year={year}
              month={month}
              reminders={reminders}
              bills={bills}
              ccPaymentBills={ccPaymentBills}
              allTransactions={allTransactions}
              transactions={transactions}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              onUpdate={updateBill}
            />

            <div className="stats-row">
              <SpendingStats
                year={year}
                month={month}
                stats={spendingStats}
                history={spendingHistory}
                onSelectMonth={selectMonth}
              />

              <SavingsStats
                year={year}
                month={month}
                stats={savingsStats}
                history={savingsHistory}
                onSelectMonth={selectMonth}
              />
            </div>

            <BillReminders
              year={year}
              month={month}
              reminders={reminders}
              loading={billLoading}
              error={billError}
              onAdd={addBill}
              onUpdate={updateBill}
              onDelete={handleRemoveBill}
              creditCards={activeCards}
              statements={statements}
              onApplyAllocation={handleApplyAllocation}
              onMarkPaid={handleMarkPaid}
            />

            <SavingsGoals
              journey={savingsJourney}
              loading={goalsLoading}
              error={goalsError}
              onAdd={addGoal}
              onUpdate={updateGoal}
              onContribute={contributeGoal}
              onDelete={handleRemoveGoal}
            />

            <CreditCards
              cards={cards}
              statements={statements}
              interestProjections={interestProjections}
              utilizationHistories={utilizationHistories}
              loading={ccLoading}
              error={ccError}
              isCurrentMonth={isCurrentMonth}
              onAdd={addCard}
              onUpdate={updateCard}
              onDelete={handleRemoveCard}
            />

            <div className="workspace">
              <TransactionForm
                key={editing?.id ?? 'new'}
                editing={editing}
                creditCards={activeCards}
                onSubmit={handleSubmit}
                onCancelEdit={() => setEditing(null)}
              />
              <TransactionList
                transactions={transactions}
                loading={txLoading}
                onEdit={setEditing}
                onDelete={handleDelete}
                cardById={cardById}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default LedgerApp
