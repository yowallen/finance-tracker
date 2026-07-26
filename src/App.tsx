import { useMemo, useState } from 'react'
// Auth temporarily disabled for personal use — re-enable when needed:
// import { AuthForm } from './components/AuthForm'
// import { useAuth } from './hooks/useAuth'
import { BillReminders } from './components/BillReminders'
import { FinanceCalendar } from './components/FinanceCalendar'
import { MonthSummary } from './components/MonthSummary'
import { ThemeToggle } from './components/ThemeToggle'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { useRecurringBills } from './hooks/useRecurringBills'
import { useTheme } from './hooks/useTheme'
import { useTransactions } from './hooks/useTransactions'
import { buildBalanceOutlook, computeRunningBalanceForMonth } from './services/balanceOutlook'
import type { BillReminder } from './types/recurringBill'
import type { Transaction, TransactionInput } from './types/transaction'
import './App.css'

/** Fixed owner id while auth is off. Swap back to `user.uid` when re-enabling login. */
const LOCAL_USER_ID = 'personal'

function App() {
  // const { user, loading: authLoading, error: authError, signIn, signUp, logOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [editing, setEditing] = useState<Transaction | null>(null)

  const {
    transactions,
    allTransactions,
    summary,
    loading: txLoading,
    error: txError,
    add,
    update,
    remove,
  } = useTransactions(LOCAL_USER_ID, year, month)

  const {
    bills,
    reminders,
    loading: billLoading,
    error: billError,
    add: addBill,
    update: updateBill,
    remove: removeBill,
  } = useRecurringBills(LOCAL_USER_ID, year, month, transactions)

  const monthBalance = useMemo(
    () => computeRunningBalanceForMonth(bills, allTransactions, year, month),
    [bills, allTransactions, year, month],
  )

  const outlookRows = useMemo(
    () => buildBalanceOutlook(bills, allTransactions, year, month, 11),
    [bills, allTransactions, year, month],
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
    if (editing) {
      await update(editing.id, input)
      setEditing(null)
    } else {
      await add(input)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this transaction?')) return
    if (editing?.id === id) setEditing(null)
    await remove(id)
  }

  async function handleMarkPaid(reminder: BillReminder) {
    const isCurrentMonth =
      year === now.getFullYear() && month === now.getMonth()
    const day = isCurrentMonth ? now.getDate() : reminder.dueDate.getDate()
    const occurred = new Date(year, month, day, 12, 0, 0, 0)

    await add({
      type: 'bill',
      amount: reminder.bill.amount,
      category: reminder.bill.category,
      description: reminder.bill.name,
      occurredAt: occurred.toISOString(),
      recurringBillId: reminder.bill.id,
    })
  }

  // if (authLoading) {
  //   return (
  //     <div className="boot">
  //       <p>Loading Ledger…</p>
  //     </div>
  //   )
  // }

  // if (!user) {
  //   return <AuthForm onSignIn={signIn} onSignUp={signUp} error={authError} />
  // }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand">Ledger</span>
          <span className="topbar-email">Personal</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {/* <button type="button" className="btn-ghost" onClick={() => void logOut()}>
            Sign out
          </button> */}
        </div>
      </header>

      <main className="main">
        <MonthSummary
          year={year}
          month={month}
          summary={summary}
          unpaidScheduledBills={monthBalance.unpaidScheduledBills}
          unpaidCount={monthBalance.unpaidCount}
          monthNet={monthBalance.monthNet}
          runningBalance={monthBalance.runningBalance}
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
      </main>
    </div>
  )
}

export default App
