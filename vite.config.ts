import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

const base = process.env.NODE_ENV === 'production' ? '/finance-tracker/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    // Firestore SDK is ~595 kB minified but only ~175 kB gzipped; suppress raw-size warning.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core frameworks + Firebase auth + icons - loaded on initial page
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/firebase/app') ||
              id.includes('node_modules/firebase/auth') ||
              id.includes('node_modules/lucide-react')) {
            return 'vendor'
          }
          // Firestore SDK - loaded lazily after sign-in via getFirestoreClient()
          if (id.includes('node_modules/firebase/firestore')) {
            return 'firestore'
          }
          // Signed-in ledger tree - loaded via React.lazy in App.tsx
          if (id.includes('src/components/LedgerApp') ||
              id.includes('src/hooks/useCreditCards') ||
              id.includes('src/hooks/useRecurringBills') ||
              id.includes('src/hooks/useSavingsGoals') ||
              id.includes('src/hooks/useTransactions') ||
              id.includes('src/hooks/usePaymentAllocation') ||
              id.includes('src/services/balanceOutlook') ||
              id.includes('src/services/creditCards') ||
              id.includes('src/services/recurringBills') ||
              id.includes('src/services/savingsGoals') ||
              id.includes('src/services/transactions') ||
              id.includes('src/services/paymentAllocation') ||
              id.includes('src/components/BillReminders') ||
              id.includes('src/components/CreditCards') ||
              id.includes('src/components/FinanceCalendar') ||
              id.includes('src/components/MonthSummary') ||
              id.includes('src/components/SavingsGoals') ||
              id.includes('src/components/SavingsStats') ||
              id.includes('src/components/SpendingStats') ||
              id.includes('src/components/ThemeToggle') ||
              id.includes('src/components/TransactionForm') ||
              id.includes('src/components/TransactionList') ||
              id.includes('src/components/UndoToast') ||
              id.includes('src/components/InterestProjection') ||
              id.includes('src/components/PaymentAllocation') ||
              id.includes('src/components/UtilizationChart')) {
            return 'ledger'
          }
        },
      },
    },
  },
})
