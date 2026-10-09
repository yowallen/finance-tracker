import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookMarked, Compass, LogOut } from 'lucide-react'
import type { User } from 'firebase/auth'
import { CsvImportSheet } from './CsvImportSheet'
import { PaluwaganSection } from './Paluwagan'
import { AnalyticsSection } from './AnalyticsSection'
import { BillReminders } from './BillReminders'
import { CreditCards } from './CreditCards'
import { FinanceCalendar } from './FinanceCalendar'
import { LoadingState } from './LoadingState'
import { MobileBottomNav } from './MobileBottomNav'
import { MonthSelector } from './MonthSelector'
import { PaydayBudget } from './PaydayBudget'
import { usePaydayBudget } from '../hooks/usePaydayBudget'
import { usePaluwagan } from '../hooks/usePaluwagan'
import { MonthSummary } from './MonthSummary'
import { QuickActions } from './QuickActions'
import { SavingsGoals } from './SavingsGoals'
import { SectionTutorial, hasSeenTutorial } from './SectionTutorial'
import { ThemeToggle } from './ThemeToggle'
import { TransactionForm } from './TransactionForm'
import { TransactionHistoryPanel } from './TransactionHistoryPanel'
import { TransactionList } from './TransactionList'
import { TransactionSheet } from './TransactionSheet'
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
  reconcileTransactionCashbackValues,
} from '../services/transactions'
import type { BillReminder, RecurringBill, RecurringBillInput } from '../types/recurringBill'
import type { CreditCard, CreditCardInput, PaymentAllocationPlan } from '../types/creditCard'
import type { SavingsGoal, SavingsGoalInput } from '../types/savingsGoal'
import type { ThemeMode } from '../lib/theme'
import type { Transaction, TransactionInput } from '../types/transaction'
import { formatMoney } from '../lib/format'
import { isFeatureEnabled } from '../lib/featureFlags'
import { scrollToSection } from '../lib/scrollToSection'

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
    ...(tx.creditCardId ? { creditCardId: tx.creditCardId } : {}),
    ...(typeof tx.cashbackEarned === 'number' ? { cashbackEarned: tx.cashbackEarned } : {}),
    ...(tx.creditCardPayment ? { creditCardPayment: true } : {}),
    ...(tx.cashbackCredit ? { cashbackCredit: true } : {}),
    ...(typeof tx.isAnnualFee === 'boolean' ? { isAnnualFee: tx.isAnnualFee } : {}),
    ...(tx.savingsDirection ? { savingsDirection: tx.savingsDirection } : {}),
  }
}

function formatAttentionDue(date: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function reminderStatusLabel(reminder: BillReminder): string {
  const absDays = Math.abs(reminder.daysUntilDue)
  const dayWord = absDays === 1 ? 'day' : 'days'

  switch (reminder.status) {
    case 'paid':
      return 'Paid'
    case 'overdue':
      return `Overdue by ${absDays} ${dayWord}`
    case 'due-soon': {
      if (reminder.daysUntilDue === 0) return 'Due today'
      const dueWord = reminder.daysUntilDue === 1 ? 'day' : 'days'
      return `Due in ${reminder.daysUntilDue} ${dueWord}`
    }
    case 'unpaid':
      return 'Not paid'
    default:
      return `Due day ${reminder.bill.dueDay}`
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
    madnessLimit: card.madnessLimit,
    madnessUsed: card.madnessUsed,
    rewardName: card.rewardName,
    rewardType: card.rewardType,
    pointsPerSpend: card.pointsPerSpend,
    pointsSpendIncrement: card.pointsSpendIncrement,
    pointsRules: card.pointsRules,
    rewardDescription: card.rewardDescription,
    cashbackCap: card.cashbackCap,
    cashbackYearlyCap: card.cashbackYearlyCap,
    cashbackUsesFullThousandBlocks: card.cashbackUsesFullThousandBlocks,
    cashbackStartingBalance: card.cashbackStartingBalance,
    cashbackRedeemed: card.cashbackRedeemed,
    cashbackMinSpend: card.cashbackMinSpend,
    cashbackRules: card.cashbackRules,
  }
}

function LedgerApp({ user, theme, onToggleTheme, onLogOut }: Readonly<LedgerAppProps>) {
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourSession, setTourSession] = useState(0)
  const [saving, setSaving] = useState(false)
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null)
  const undoIdRef = useRef(0)

  const userId = user.uid

  const {
    transactions,
    allTransactions,
    summary,
    existingImportKeys,
    loading: txLoading,
    error: txError,
    add,
    addBatch,
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
    utilizationHistories,
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

  const paydayBudgetEnabled = isFeatureEnabled('paydayBudget')
  const { settings: paydaySettings, periods: paydayPeriods, save: savePayday } = usePaydayBudget(
    userId,
    year,
    month,
    allTransactions,
    reminders,
    paydayBudgetEnabled,
  )

  const {
    circles: paluwaganCircles,
    loading: paluwaganLoading,
    error: paluwaganError,
    add: addPaluwagan,
    update: updatePaluwagan,
    remove: removePaluwagan,
    setContributions: setPaluwaganContributions,
  } = usePaluwagan(userId)

  const dataLoading = txLoading || billLoading || goalsLoading
  const isFreshAccount = !dataLoading
    && allTransactions.length === 0
    && bills.length === 0
    && cards.length === 0
    && savingsJourney.stops.length === 0
    && savingsJourney.savedAmount === 0

  function openTour() {
    setTourSession((session) => session + 1)
    setTourOpen(true)
  }

  useEffect(() => {
    if (!isFreshAccount || hasSeenTutorial(userId)) return
    setTourOpen(true)
  }, [isFreshAccount, userId])

  useEffect(() => {
    if (!userId || dataLoading || cards.length === 0 || transactions.length === 0) {
      return
    }

    void reconcileTransactionCashbackValues(userId, cards, transactions)
      .catch(() => {
        // Ignore reconciliation failures; the UI still reflects the live card rules.
      })
  }, [userId, cards, transactions, dataLoading])

  const attentionReminders = useMemo(
    () =>
      reminders
        .filter((item) => item.status === 'overdue' || item.status === 'due-soon')
        .slice(0, 3),
    [reminders],
  )

  const activePayday = useMemo(
    () => paydayPeriods.find((period) => period.active) ?? null,
    [paydayPeriods],
  )

  const showSafeSpendChip =
    paydayBudgetEnabled &&
    activePayday !== null &&
    (paydaySettings.allowance > 0 || paydayPeriods.length > 0)

  const attentionTone = attentionReminders.some((item) => item.status === 'overdue')
    ? 'overdue'
    : 'due-soon'

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
          const historyHeading = document.getElementById('history-panel-heading')
          const targetId = pending.resource === 'transaction' && historyHeading
            ? 'history-panel-heading'
            : UNDO_FOCUS_TARGET[pending.resource]
          document.getElementById(targetId)?.focus()
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

  function openTransactionSheet(nextEditing: Transaction | null = null) {
    setEditing(nextEditing)
    setSheetOpen(true)
  }

  function closeTransactionSheet() {
    setSheetOpen(false)
    setEditing(null)
  }

  function openHistory() {
    setHistoryOpen(true)
  }

  function closeHistory() {
    setHistoryOpen(false)
  }

  async function handleSubmit(input: TransactionInput) {
    setSaving(true)
    try {
      if (editing) {
        await update(editing.id, input)
      } else {
        await add(input)
      }
      closeTransactionSheet()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const target = allTransactions.find((tx) => tx.id === id)
    if (editing?.id === id) closeTransactionSheet()
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

  async function handleMarkPaid(
    reminder: BillReminder,
    paymentCreditCardId?: string,
    amount?: number,
  ) {
    const day = isCurrentMonth ? now.getDate() : reminder.dueDate.getDate()
    const occurred = new Date(year, month, day, 12, 0, 0, 0)

    // Check if this is a credit card payment bill
    const isCreditCardPayment = (reminder as BillReminder & { isCreditCardPayment?: boolean }).isCreditCardPayment
    const creditCardId = (reminder as BillReminder & { creditCardId?: string }).creditCardId
    const paymentAmount = amount ?? reminder.bill.amount

    let transaction: TransactionInput

    if (isCreditCardPayment && creditCardId) {
      const payee = reminder.bill.notes || `•••• ${creditCardId.slice(-4)}`
      const isPartial = paymentAmount + 0.001 < reminder.bill.amount
      transaction = {
        type: 'bill',
        amount: paymentAmount,
        category: 'Credit card payment',
        description: isPartial
          ? `Payment to ${payee} (partial)`
          : `Payment to ${payee}`,
        occurredAt: occurred.toISOString(),
        creditCardId,
        creditCardPayment: true,
      }
    } else {
      // Regular recurring bill payment
      transaction = {
        type: 'bill',
        amount: paymentAmount,
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

  async function handleRedeemCashback(card: CreditCard, amount: number) {
    const today = new Date()
    const occurred = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0)
    await add({
      type: 'income',
      amount,
      category: 'Cashback',
      description: `Cashback credit to ${card.name} •••• ${card.lastFour}`,
      occurredAt: occurred.toISOString(),
      creditCardId: card.id,
      cashbackCredit: true,
    })
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
        await addCard(cardToInput(card), card.id)
      })
    } finally {
      setSaving(false)
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
            className="icon-btn"
            aria-label="Take a tour"
            title="Tour"
            onClick={openTour}
          >
            <Compass aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Log out"
            title="Log out"
            onClick={() => {
              closeTransactionSheet()
              closeHistory()
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
        <MonthSelector
          year={year}
          month={month}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />

        {isFreshAccount && (
          <section className="first-use-panel" aria-labelledby="first-use-heading">
            <div>
              <p className="eyebrow">Your private ledger is ready</p>
              <h2 id="first-use-heading">Start your financial track</h2>
              <p>
                Add your first transaction, recurring bill, credit card, or savings goal.
                Your records stay private to this account.
              </p>
            </div>
            <div className="first-use-actions">
              <button type="button" className="btn-primary" onClick={openTour}>
                Show me around
              </button>
              <button type="button" className="btn-ghost" onClick={() => openTransactionSheet()}>
                Add first transaction
              </button>
              <button type="button" className="btn-ghost" onClick={() => scrollToSection('reminders')}>
                Set up a bill
              </button>
            </div>
          </section>
        )}

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
              onSelectMonth={selectMonth}
              hasActiveCards={activeCards.length > 0}
              cardSnapshots={statements.filter((statement) => statement.card.active)}
              creditCards={cards}
              totalOutstanding={totalOutstanding}
              totalAvailableCredit={totalAvailableCredit}
              onNavigateToCards={() => scrollToSection('credit-cards')}
            />

            {paydayBudgetEnabled && (
              <PaydayBudget
                settings={paydaySettings}
                periods={paydayPeriods}
                onSave={savePayday}
              />
            )}

            {showSafeSpendChip && activePayday && (
              <button
                type="button"
                className={`safe-spend-chip ${activePayday.left < 0 ? 'negative' : ''}`}
                onClick={() => scrollToSection('payday')}
              >
                <span className="safe-spend-chip__label">Safe to spend</span>
                <strong>{formatMoney(activePayday.left)}</strong>
                {activePayday.perDay !== null && (
                  <small>
                    {formatMoney(activePayday.perDay)}/day · {activePayday.daysRemaining}{' '}
                    {activePayday.daysRemaining === 1 ? 'day' : 'days'} left
                  </small>
                )}
              </button>
            )}

            {txError && (
              <p className="banner-error" role="alert">
                {txError}
              </p>
            )}

            {attentionReminders.length > 0 && (
              <section
                className={`overview-attention tone-${attentionTone}`}
                aria-live="polite"
              >
                <div className="overview-attention-header">
                  <h3>Needs attention</h3>
                  <button type="button" className="text-btn" onClick={() => scrollToSection('reminders')}>
                    Review bills
                  </button>
                </div>
                <ul>
                  {attentionReminders.map((item) => (
                    <li key={item.bill.id} className={`attention-item status-${item.status}`}>
                      <div className="attention-item-copy">
                        <span>{item.bill.name}</span>
                        <small>
                          {reminderStatusLabel(item)} · {formatAttentionDue(item.actualDueDate ?? item.dueDate)}
                        </small>
                      </div>
                      <strong>{formatMoney(item.bill.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <QuickActions
              onAddTransaction={() => openTransactionSheet()}
              onReviewBills={() => scrollToSection('reminders')}
              onOpenHistory={openHistory}
              onOpenCreditCards={() => scrollToSection('credit-cards')}
            />

            <FinanceCalendar 
              year={year}
              month={month}
              reminders={reminders}
              bills={bills}
              ccPaymentBills={ccPaymentBills}
              allTransactions={allTransactions}
              transactions={transactions}
              onUpdate={updateBill}
            />

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

            <TransactionList
              transactions={transactions}
              allTransactions={allTransactions}
              loading={txLoading}
              onEdit={(tx) => openTransactionSheet(tx)}
              onDelete={handleDelete}
              onViewAll={openHistory}
              onImportCsv={() => setCsvImportOpen(true)}
              cardById={cardById}
            />

            <TransactionHistoryPanel
              open={historyOpen}
              suspended={sheetOpen}
              transactions={transactions}
              allTransactions={allTransactions}
              loading={txLoading}
              onClose={closeHistory}
              onAdd={() => openTransactionSheet()}
              onEdit={(tx) => openTransactionSheet(tx)}
              onDelete={handleDelete}
              cardById={cardById}
            />

            <CreditCards
              cards={cards}
              statements={statements}
              allTransactions={allTransactions}
              interestProjections={interestProjections}
              utilizationHistories={utilizationHistories}
              loading={ccLoading}
              error={ccError}
              isCurrentMonth={isCurrentMonth}
              year={year}
              month={month}
              onAdd={addCard}
              onUpdate={updateCard}
              onDelete={handleRemoveCard}
              onRedeemCashback={handleRedeemCashback}
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

            <PaluwaganSection
              circles={paluwaganCircles}
              loading={paluwaganLoading}
              error={paluwaganError}
              onAdd={addPaluwagan}
              onUpdate={updatePaluwagan}
              onDelete={removePaluwagan}
              onSetContributions={setPaluwaganContributions}
            />

            <AnalyticsSection
              year={year}
              month={month}
              spendingStats={spendingStats}
              spendingHistory={spendingHistory}
              savingsStats={savingsStats}
              savingsHistory={savingsHistory}
              onSelectMonth={selectMonth}
            />

            <TransactionSheet
              open={sheetOpen}
              title={editing ? 'Edit transaction' : 'Add transaction'}
              onClose={closeTransactionSheet}
            >
              <TransactionForm
                key={editing?.id ?? 'new'}
                editing={editing}
                hideHeading
                creditCards={activeCards}
                onSubmit={handleSubmit}
                onCancelEdit={closeTransactionSheet}
              />
            </TransactionSheet>

            <CsvImportSheet
              open={csvImportOpen}
              existingImportKeys={existingImportKeys}
              onClose={() => setCsvImportOpen(false)}
              onImport={addBatch}
            />

            <MobileBottomNav
              onGoOverview={() => scrollToSection('overview')}
              onGoCalendar={() => scrollToSection('calendar')}
              onOpenAdd={() => openTransactionSheet()}
              onGoHistory={openHistory}
              historyOpen={historyOpen}
            />
            <SectionTutorial
              key={tourSession}
              userId={userId}
              open={tourOpen && !dataLoading}
              onClose={() => setTourOpen(false)}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default LedgerApp
