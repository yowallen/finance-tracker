# Credit Card System Plan

Context

The user wants to add a credit card system to the finance tracker with:

- Multiple credit cards per user (e.g., BPI, BDO, Metrobank)
- Credit limit, statement date (day of month), due date offset (days after statement)
- Expenses/bills can be tagged to a credit card instead of running balance
- Dedicated management UI + summary integration in Month Summary

This extends the existing transaction system by adding a creditCardId field to track which card a transaction was charged to, and computes statement balances, available credit, and payment due dates.

---

Recommended Approach

1.Data Model Changes

New file: src/types/creditCard.ts
export interface CreditCard {
  id: string
  userId: string
  name: string                    // e.g., "BPI Mastercard"
  lastFour: string                // Last 4 digits for display
  limit: number                   // Credit limit in PHP
  statementDay: number            // 1-28 (day of month statement cuts)
  dueDayOffset: number            // Days after statement date payment is due (e.g., 21)
  color?: string                  // Optional UI color
  active: boolean
  createdAt: string
}

export interface CreditCardInput {
  name: string
  lastFour: string
  limit: number
  statementDay: number
  dueDayOffset: number
  color?: string
  active?: boolean
}

export interface CreditCardStatement {
  card: CreditCard
  statementDate: Date             // When this statement period ended
  dueDate: Date                   // When payment is due
  previousBalance: number         // Balance carried from last statement
  newCharges: number              // Charges in this statement period
  paymentsCredits: number         // Payments/credits in this period
  statementBalance: number        // previousBalance + newCharges - paymentsCredits
  minimumPayment: number          // Calculated (e.g., 3% or fixed min)
  availableCredit: number         // limit - statementBalance
  isPaid: boolean                 // Whether statementBalance has been paid
  transactions: Transaction[]     // Transactions in this statement period
}

Update src/types/transaction.ts:

- Add creditCardId?: string to Transaction and TransactionInput interfaces
- No new transaction type needed — reuse expense and bill types

---

2.Service Layer (src/services/creditCards.ts)

Firestore collection: creditCards (per user, like bills/goals)

Exports:

- subscribeCreditCards(userId, onData, onError) — real-time subscription
- createCreditCard(userId, input) → Promise<string>
- updateCreditCard(id, input) → Promise<void>
- deleteCreditCard(id) → Promise<void>
- getCreditCardById(userId, cardId) → Promise<CreditCard | null>

Statement computation (pure functions):

- computeStatementPeriod(card, year, month) → { statementDate: Date, dueDate: Date, startDate: Date, endDate: Date }
- getStatementTransactions(card, allTransactions, year, month) → Transaction[]
- computeStatement(card, transactions, year, month) → CreditCardStatement
- buildStatementHistory(card, allTransactions, monthsBack = 12) → CreditCardStatement[]
- computeTotalOutstanding(allCards, allTransactions, year, month) → number (sum of unpaid statement balances)
- computeAvailableCredit(card, statement) → number

---

3.Hook (src/hooks/useCreditCards.ts)

export function useCreditCards(userId: string | undefined) {
  // Returns: cards, loading, error, add, update, remove
  // Derived: activeCards, statements (for current month), totalOutstanding, totalAvailableCredit
}

- Subscribes to user's credit cards
- Computes current month's statement for each active card
- Provides add, update, remove actions with undo support

---

4.UI Components

New: src/components/CreditCards.tsx — Main management section (like SavingsGoals.tsx)

- List cards with: name, last 4, limit, statement day, due offset, current balance, available credit
- Add/edit/delete cards (modal form)
- Show current statement: statement balance, minimum payment, due date, days until due
- Mark statement as paid (creates a type: 'bill' transaction linked to card)

New: src/components/CreditCardForm.tsx — Add/edit card form

- Fields: name, last 4 digits, limit, statement day (1-28), due day offset (1-31), color picker, active toggle

Update: src/components/TransactionForm.tsx

- Add credit card selector dropdown (when type is expense or bill)
- Show "No credit card (cash/debit)" as default option
- Only show active cards for current user

Update: src/components/MonthSummary.tsx

- Add credit card summary cards showing:
  - Total outstanding across all cards
  - Total available credit
  - Next due date + amount
  - Quick link to CreditCards section

Update: src/components/LedgerApp.tsx

- Add useCreditCards hook
- Pass cards to TransactionForm and MonthSummary
- Add CreditCards section to render (after SavingsGoals)

---

5.Integration Points

┌───────────────────┬──────────────────────────────────────┐
│     Component     │               Changes                │
├───────────────────┼──────────────────────────────────────┤
│ Transaction type  │ Add creditCardId?: string            │
├───────────────────┼──────────────────────────────────────┤
│ TransactionForm   │ Credit card selector for             │
│                   │ expense/bill types                   │
├───────────────────┼──────────────────────────────────────┤
│ TransactionList   │ Show credit card badge on            │
│                   │ transactions                         │
├───────────────────┼──────────────────────────────────────┤
│ MonthSummary      │ Credit card overview cards           │
├───────────────────┼──────────────────────────────────────┤
│ LedgerApp         │ Compose useCreditCards, render       │
│                   │ CreditCards section                  │
├───────────────────┼──────────────────────────────────────┤
│ balanceOutlook.ts │ Optionally include credit card       │
│                   │ payments in outlook                  │
└───────────────────┴──────────────────────────────────────┘

---

6.Statement Cycle Logic

For a card with statementDay = 15 and dueDayOffset = 21:

- Statement period: 16th previous month → 15th current month
- Statement date: 15th of current month
- Due date: 15th + 21 days = 5th/6th next month (handles month boundaries)

function computeStatementPeriod(card: CreditCard, year: number, month: number) {
  // Statement cuts on statementDay of THIS month
  const statementDate = new Date(year, month, card.statementDay)
  // Period starts day AFTER previous statement date
  const startDate = new Date(year, month - 1, card.statementDay + 1)
  // Due date = statementDate + dueDayOffset
  const dueDate = new Date(statementDate)
  dueDate.setDate(dueDate.getDate() + card.dueDayOffset)
  return { statementDate, dueDate, startDate, endDate: statementDate }
}

---

7.File Structure Summary

New files:

- src/types/creditCard.ts
- src/services/creditCards.ts
- src/hooks/useCreditCards.ts
- src/components/CreditCards.tsx
- src/components/CreditCardForm.tsx

Modified files:

- src/types/transaction.ts — add creditCardId
- src/components/TransactionForm.tsx — credit card selector
- src/components/TransactionList.tsx — show credit card badge
- src/components/MonthSummary.tsx — credit card summary cards
- src/components/LedgerApp.tsx — integrate hook and CreditCards section
- src/services/transactions.ts — handle creditCardId in create/update (validation only)

---

8.Verification Plan

1. TypeScript compiles — npm run build or tsc --noEmit
2. Add credit card — Form validates: limit > 0, statementDay 1-28, dueDayOffset 1-31
3. Tag transaction — Create expense/bill with credit card selected; appears in card's statement
4. Statement computation — Verify statement balance = charges - payments for correct period
5. Due date calculation — Check statement date + offset handles month/year boundaries
6. Month summary — Shows total outstanding, available credit, next due
7. Mark paid — Creates bill transaction; reduces outstanding; updates statement
8. Undo — Delete card/transaction offers undo toast
9. Multiple cards — Can add 2+ cards, switch between them in transaction form
10. Edge cases — Inactive cards hidden from selector; deleted card transactions retain cardId (display "Deleted Card")

---

9.Implementation Sequence

1. Types — creditCard.ts, update transaction.ts
2. Services — creditCards.ts with CRUD + statement computation
3. Hook — useCreditCards.ts
4. Forms — CreditCardForm.tsx
5. Management UI — CreditCards.tsx
6. Integration — Update TransactionForm, TransactionList, MonthSummary, LedgerApp
7. Testing — Manual verification of all flows

---

10.Future Enhancements (Out of Scope)

- Interest calculation & projection
- Payment allocation strategies (highest interest first)
- Credit utilization tracking over time
- Rewards/cashback tracking
