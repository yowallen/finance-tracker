import { useMemo, useState } from 'react'
import { BookMarked, LogOut } from 'lucide-react'
import { AuthForm } from './components/AuthForm'
import { BillReminders } from './components/BillReminders'
import { FinanceCalendar } from './components/FinanceCalendar'
import { LoadingState } from './components/LoadingState'
import { MonthSummary } from './components/MonthSummary'
import { SavingsGoals } from './components/SavingsGoals'
import { SavingsStats } from './components/SavingsStats'
import { SpendingStats } from './components/SpendingStats'
import { ThemeToggle } from './components/ThemeToggle'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { useAuth } from './hooks/useAuth'
import { useRecurringBills } from './hooks/useRecurringBills'
import { useSavingsGoals } from './hooks/useSavingsGoals'
import { useTheme } from './hooks/useTheme'
import { useTransactions } from './hooks/useTransactions'
import {
  buildBalanceOutlook,
  computeMonthNetThroughDay,
  computeRunningBalanceForDay,
  computeRunningBalanceForMonth,
} from './services/balanceOutlook'
import {
  buildMonthlySavingsHistory,
  buildMonthlySpendingHistory,
  computeMonthlySavingsStats,
  computeMonthlySpendingStats,
} from './services/transactions'
import type { BillReminder } from './types/recurringBill'
import type { Transaction, TransactionInput } from './types/transaction'
import './App.css'

function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [saving, setSaving] = useState(false)

  const userId = user?.uid

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
    bills,
    reminders,
    loading: billLoading,
    error: billError,
    add: addBill,
    update: updateBill,
    remove: removeBill,
  } = useRecurringBills(userId, year, month, transactions)

  const {
    journey: savingsJourney,
    loading: goalsLoading,
    error: goalsError,
    add: addGoal,
    update: updateGoal,
    contribute: contributeGoal,
    remove: removeGoal,
  } = useSavingsGoals(userId, allTransactions)

  const dataLoading = txLoading || billLoading || goalsLoading

  const monthBalance = useMemo(() => {
    const base = computeRunningBalanceForMonth(bills, allTransactions, year, month)
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

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
      ),
      monthNet: computeMonthNetThroughDay(
        bills,
        allTransactions,
        year,
        month,
        now.getDate(),
      ),
    }
  }, [bills, allTransactions, year, month, now])

  const outlookRows = useMemo(
    () => buildBalanceOutlook(bills, allTransactions, year, month, 11),
    [bills, allTransactions, year, month],
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

  async function handleSubmit(input: TransactionInput) {
    setSaving(true)
    try {
      if (editing) {
        await update(editing.id, input)
        setEditing(null)
      } else {
        await add(input)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this transaction?')) return
    if (editing?.id === id) setEditing(null)
    setSaving(true)
    try {
      await remove(id)
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkPaid(reminder: BillReminder) {
    const isCurrentMonth =
      year === now.getFullYear() && month === now.getMonth()
    const day = isCurrentMonth ? now.getDate() : reminder.dueDate.getDate()
    const occurred = new Date(year, month, day, 12, 0, 0, 0)

    setSaving(true)
    try {
      await add({
        type: 'bill',
        amount: reminder.bill.amount,
        category: reminder.bill.category,
        description: reminder.bill.name,
        occurredAt: occurred.toISOString(),
        recurringBillId: reminder.bill.id,
      })
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="boot">
        <LoadingState variant="page" label="Signing you in…" />
      </div>
    )
  }

  if (!user) {
    return (
      <AuthForm
        onSignIn={signIn}
        error={authError}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand">
            <BookMarked className="brand-icon" aria-hidden="true" />
            Ledger
          </span>
          <span className="topbar-email">{user.email ?? 'Signed in'}</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            type="button"
            className="btn-ghost btn-with-icon"
            onClick={() => {
              setEditing(null)
              void logOut()
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

      <main className="main" aria-busy={dataLoading || saving}>
        {dataLoading ? (
          <section className="month-summary">
            <LoadingState variant="page" label="Loading your ledger…" />
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
              isCurrentMonth={year === now.getFullYear() && month === now.getMonth()}
              savingsPot={savingsJourney.savedAmount}
              outlookRows={outlookRows}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              onSelectMonth={selectMonth}
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
              allTransactions={allTransactions}
              transactions={transactions}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
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
              onDelete={removeBill}
              onMarkPaid={handleMarkPaid}
            />

            <SavingsGoals
              journey={savingsJourney}
              loading={goalsLoading}
              error={goalsError}
              onAdd={addGoal}
              onUpdate={updateGoal}
              onContribute={contributeGoal}
              onDelete={removeGoal}
            />

            <div className="workspace">
              <TransactionForm
                key={editing?.id ?? 'new'}
                editing={editing}
                onSubmit={handleSubmit}
                onCancelEdit={() => setEditing(null)}
              />
              <TransactionList
                transactions={transactions}
                loading={txLoading}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
