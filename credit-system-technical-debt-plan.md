# Credit Card System - Technical Debt Implementation Plan

## Overview

This plan addresses the three "Future Enhancements" identified in the original credit-system-plan.md:
1. **Interest calculation & projection**
2. **Credit utilization tracking over time**
3. **Payment allocation strategies (highest interest first)**

---

## 1. Interest Calculation & Projection

### 1.1 Data Model Changes

**File: `src/types/creditCard.ts`**

Add interest-related fields to `CreditCard` interface:

```typescript
export interface CreditCard {
  // ... existing fields
  apr?: number                    // Annual Percentage Rate (e.g., 3.5 for 3.5%)
  interestCalculationMethod?: 'daily' | 'monthly'  // How interest is computed
  gracePeriodDays?: number        // Days after due date before interest accrues
}
```

Add to `CreditCardInput`:
```typescript
export interface CreditCardInput {
  // ... existing fields
  apr?: number
  interestCalculationMethod?: 'daily' | 'monthly'
  gracePeriodDays?: number
}
```

Add new types for interest calculations:
```typescript
export interface InterestProjection {
  cardId: string
  currentBalance: number
  monthlyInterestRate: number
  dailyInterestRate: number
  projectedBalances: ProjectedBalance[]  // Month-by-month projection
  totalInterestIfMinPay: number
  monthsToPayoffMinPay: number
  totalInterestIfFixedPay: number
  monthsToPayoffFixedPay: number
  fixedPaymentAmount: number
}

export interface ProjectedBalance {
  month: number  // 0 = current, 1 = next, etc.
  year: number
  startingBalance: number
  interestCharged: number
  payment: number
  endingBalance: number
  isPaidOff: boolean
}
```

### 1.2 Service Layer: `src/services/creditCards.ts`

Add pure functions:

```typescript
// Calculate daily/monthly interest rate from APR
function getInterestRates(apr: number): { daily: number; monthly: number }

// Compute interest for a statement period
export function computeInterest(
  card: CreditCard,
  previousBalance: number,
  newCharges: number,
  paymentsCredits: number,
  statementDate: Date,
  dueDate: Date,
): number

// Build interest projection for a card
export function projectInterest(
  card: CreditCard,
  currentBalance: number,
  monthsToProject: number = 24,
  fixedPayment?: number,  // If not provided, uses minimum payment
): InterestProjection

// Minimum payment calculation with interest
export function computeMinimumPaymentWithInterest(
  statementBalance: number,
  apr: number,
  minimumPaymentPercent: number = 0.03,
  minimumFixedAmount: number = 100,
): number
```

### 1.3 Hook Updates: `src/hooks/useCreditCards.ts`

Add derived state:
```typescript
const interestProjections = useMemo(
  () => activeCards.map(card => 
    projectInterest(card, getCurrentStatementBalance(card), 24)
  ),
  [activeCards, statements]
)
```

### 1.4 UI Components

**New: `src/components/InterestProjection.tsx`**
- Card-level interest projection display
- Shows: APR, daily/monthly rate, projected payoff timeline
- Two scenarios: minimum payment vs. fixed payment
- Interactive: user can adjust fixed payment amount
- Visual chart (simple bar/line) showing balance decline over time

**Update: `CreditCards.tsx`**
- Add APR field to CreditCardForm
- Show interest info on each card (when APR is set)
- Add "View Projection" button/link per card

---

## 2. Credit Utilization Tracking Over Time

### 2.1 Data Model Changes

**File: `src/types/creditCard.ts`**

Add utilization history types:

```typescript
export interface UtilizationSnapshot {
  date: string  // ISO date string (first of month)
  year: number
  month: number
  statementBalance: number
  limit: number
  utilizationPercent: number
  cardId: string
}

export interface UtilizationHistory {
  cardId: string
  cardName: string
  limit: number
  snapshots: UtilizationSnapshot[]
  averageUtilization: number
  peakUtilization: { percent: number; date: string }
  currentUtilization: number
  trend: 'improving' | 'stable' | 'worsening'
}
```

### 2.2 Service Layer: `src/services/creditCards.ts`

Add functions:

```typescript
// Build utilization history from statement history
export function buildUtilizationHistory(
  card: CreditCard,
  allTransactions: Transaction[],
  endYear: number,
  endMonth: number,
  monthsBack: number = 12,
): UtilizationHistory

// Get utilization for a specific month
export function getUtilizationForMonth(
  card: CreditCard,
  allTransactions: Transaction[],
  year: number,
  month: number,
): UtilizationSnapshot

// Aggregate across all cards
export function computeAggregateUtilization(
  cards: CreditCard[],
  allTransactions: Transaction[],
  year: number,
  month: number,
): { totalBalance: number; totalLimit: number; utilizationPercent: number }
```

### 2.3 Hook Updates: `src/hooks/useCreditCards.ts`

Add derived state:
```typescript
const utilizationHistories = useMemo(
  () => activeCards.map(card => 
    buildUtilizationHistory(card, allTransactions, year, month, 12)
  ),
  [activeCards, allTransactions, year, month]
)

const aggregateUtilization = useMemo(
  () => computeAggregateUtilization(activeCards, allTransactions, year, month),
  [activeCards, allTransactions, year, month]
)
```

### 2.4 UI Components

**New: `src/components/UtilizationChart.tsx`**
- Line chart showing utilization % over time (12 months)
- Per-card and aggregate views
- Color-coded zones: <30% (green), 30-50% (yellow), >50% (red)
- Hover tooltips with exact values

**Update: `CreditCards.tsx`**
- Add utilization trend indicator on each card (↑ ↓ →)
- Show 12-month mini sparkline per card

**Update: `MonthSummary.tsx`**
- Add aggregate utilization stat in credit card snapshot section

---

## 3. Payment Allocation Strategies (Highest Interest First)

### 3.1 Data Model Changes

**File: `src/types/creditCard.ts`**

```typescript
export type PaymentAllocationStrategy = 
  | 'highest-interest-first'  // Avalanche method
  | 'lowest-balance-first'    // Snowball method
  | 'proportional'            // Proportional to balances
  | 'custom'                  // User-defined order

export interface PaymentAllocationPlan {
  strategy: PaymentAllocationStrategy
  totalPayment: number
  allocations: PaymentAllocation[]
  remainingUnallocated: number
}

export interface PaymentAllocation {
  cardId: string
  cardName: string
  cardApr: number
  currentBalance: number
  minimumPayment: number
  allocatedAmount: number
  isMinimumOnly: boolean
}
```

### 3.2 Service Layer: New file `src/services/paymentAllocation.ts`

```typescript
import type { CreditCard, CreditCardStatement } from '../types/creditCard'
import type { PaymentAllocationPlan, PaymentAllocationStrategy } from '../types/creditCard'

/**
 * Create a payment allocation plan across multiple cards.
 * By default uses "highest interest first" (avalanche) strategy.
 */
export function createPaymentAllocationPlan(
  cards: CreditCard[],
  statements: CreditCardStatement[],
  totalPayment: number,
  strategy: PaymentAllocationStrategy = 'highest-interest-first',
): PaymentAllocationPlan

// Strategy implementations
function allocateHighestInterestFirst(
  cards: CreditCard[],
  statements: CreditCardStatement[],
  totalPayment: number,
): PaymentAllocation[]

function allocateLowestBalanceFirst(
  cards: CreditCard[],
  statements: CreditCardStatement[],
  totalPayment: number,
): PaymentAllocation[]

function allocateProportional(
  cards: CreditCard[],
  statements: CreditCardStatement[],
  totalPayment: number,
): PaymentAllocation[]
```

### 3.3 Hook Updates: New hook `src/hooks/usePaymentAllocation.ts`

```typescript
export function usePaymentAllocation(
  cards: CreditCard[],
  statements: CreditCardStatement[],
) {
  // Returns function to create allocation plan
  // Allows strategy selection
  // Provides recommended allocation
}
```

### 3.4 UI Components

**New: `src/components/PaymentAllocation.tsx`**
- Payment amount input
- Strategy selector (dropdown: Avalanche / Snowball / Proportional)
- Visual breakdown showing:
  - Each card with its APR, balance, minimum payment
  - Allocated amount per card
  - Color-coded by priority
- "Apply" button that creates bill transactions for each allocation
- Shows interest saved vs. minimum payments

**Update: `BillReminders.tsx`**
- Add "Allocate Payment" button when multiple credit card payments are due
- Opens PaymentAllocation component
- Auto-fills total payment amount from available budget

---

## Implementation Sequence

### Phase 1: Interest Calculation & Projection (Week 1)
1. Update `src/types/creditCard.ts` - Add APR and interest fields
2. Update `src/components/CreditCardForm.tsx` - Add APR input field
3. Add interest computation functions to `src/services/creditCards.ts`
4. Create `src/components/InterestProjection.tsx`
5. Integrate into `CreditCards.tsx`
6. Add APR to Firestore rules (if needed)

### Phase 2: Credit Utilization Tracking (Week 2)
1. Add utilization types to `src/types/creditCard.ts`
2. Add utilization history functions to `src/services/creditCards.ts`
3. Update `src/hooks/useCreditCards.ts` with derived state
4. Create `src/components/UtilizationChart.tsx`
5. Add utilization indicators to `CreditCards.tsx` and `MonthSummary.tsx`

### Phase 3: Payment Allocation Strategies (Week 3)
1. Add allocation types to `src/types/creditCard.ts`
2. Create `src/services/paymentAllocation.ts`
3. Create `src/hooks/usePaymentAllocation.ts`
4. Create `src/components/PaymentAllocation.tsx`
6. Integrate into `BillReminders.tsx` and/or `CreditCards.tsx`

---

## Verification Plan

### Interest Calculation
- [ ] APR field saves/loads correctly
- [ ] Daily interest rate = APR / 365 / 100
- [ ] Monthly interest rate = APR / 12 / 100
- [ ] Interest accrues correctly on unpaid balance
- [ ] Projection shows correct payoff timeline for minimum payment
- [ ] Projection shows correct payoff for fixed payment
- [ ] Grace period respected (no interest if paid in full by due date)

### Utilization Tracking
- [ ] 12-month history builds correctly from transactions
- [ ] Utilization % = balance / limit * 100
- [ ] Trend detection works (improving/stable/worsening)
- [ ] Aggregate utilization across cards computes correctly
- [ ] Chart renders with correct data points

### Payment Allocation
- [ ] Avalanche strategy: pays minimums on all, extra to highest APR
- [ ] Snowball strategy: pays minimums on all, extra to lowest balance
- [ ] Proportional: distributes by balance ratio
- [ ] Total allocated equals total payment amount
- [ ] Creates correct transactions when "Apply" clicked

---

## Firestore Rules Updates

```javascript
// In firestore.rules, update creditCards validation
match /creditCards/{cardId} {
  allow read, write: if request.auth != null 
    && request.auth.uid == resource.data.userId
    && validateCreditCardData(request.resource.data);
}

function validateCreditCardData(data) {
  return data.name is string && data.name.size() > 0
    && data.lastFour is string && data.lastFour.matches('^\\d{4}$')
    && data.limit is number && data.limit > 0
    && data.statementDay is int && data.statementDay >= 1 && data.statementDay <= 28
    && data.dueDayOffset is int && data.dueDayOffset >= 1 && data.dueDayOffset <= 31
    && (data.apr == null || (data.apr is number && data.apr >= 0 && data.apr <= 100))
    && (data.interestCalculationMethod == null || data.interestCalculationMethod in ['daily', 'monthly'])
    && (data.gracePeriodDays == null || (data.gracePeriodDays is int && data.gracePeriodDays >= 0 && data.gracePeriodDays <= 60))
}
```

---

## Notes & Considerations

1. **APR Input**: Use percentage format (e.g., 3.5 for 3.5%), convert to decimal (0.035) for calculations
2. **Interest Calculation**: 
   - Most PH banks use daily balance method with monthly compounding
   - Interest = daily_rate * average_daily_balance * days_in_period
   - Or simplified: monthly_rate * statement_balance
3. **Grace Period**: Typically 20-25 days after statement date. If balance paid in full by due date, no interest.
4. **Utilization**: Reported to credit bureaus monthly. Keep under 30% for good score.
4. **Payment Allocation**: 
   - Avalanche (highest interest first) saves most money
   - Snowball (lowest balance first) provides psychological wins
   - Allow user to choose and explain the difference

---

## File Structure Summary

**New files:**
- `src/components/InterestProjection.tsx`
- `src/components/UtilizationChart.tsx`
- `src/components/PaymentAllocation.tsx`
- `src/services/paymentAllocation.ts`
- `src/hooks/usePaymentAllocation.ts`

**Modified files:**
- `src/types/creditCard.ts` - Add APR, utilization, allocation types
- `src/services/creditCards.ts` - Add interest & utilization functions
- `src/hooks/useCreditCards.ts` - Add derived state for interest & utilization
- `src/components/CreditCardForm.tsx` - Add APR field
- `src/components/CreditCards.tsx` - Show interest/utilization, link to projections
- `src/components/MonthSummary.tsx` - Add aggregate utilization
- `src/components/BillReminders.tsx` - Add allocation button
- `firestore.rules` - Update validation