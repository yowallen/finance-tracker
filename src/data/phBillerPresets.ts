export interface PhBillerPreset {
  id: string
  name: string
  category: string
  suggestedDueDay?: number
}

/** Common Philippine billers for one-tap fill on the recurring bill form. */
export const PH_BILLER_PRESETS: PhBillerPreset[] = [
  { id: 'meralco', name: 'Meralco', category: 'Utilities', suggestedDueDay: 15 },
  { id: 'maynilad', name: 'Maynilad', category: 'Utilities', suggestedDueDay: 10 },
  { id: 'manila-water', name: 'Manila Water', category: 'Utilities', suggestedDueDay: 10 },
  { id: 'globe', name: 'Globe', category: 'Phone', suggestedDueDay: 15 },
  { id: 'smart', name: 'Smart', category: 'Phone', suggestedDueDay: 15 },
  { id: 'pldt', name: 'PLDT', category: 'Phone', suggestedDueDay: 20 },
  { id: 'converge', name: 'Converge', category: 'Phone', suggestedDueDay: 20 },
  { id: 'sky', name: 'Sky Cable', category: 'Subscription', suggestedDueDay: 15 },
  { id: 'sss', name: 'SSS', category: 'Insurance', suggestedDueDay: 10 },
  { id: 'philhealth', name: 'PhilHealth', category: 'Insurance', suggestedDueDay: 10 },
  { id: 'pagibig', name: 'Pag-IBIG', category: 'Insurance', suggestedDueDay: 10 },
  { id: 'bir', name: 'BIR', category: 'Fee', suggestedDueDay: 15 },
  { id: 'home-credit', name: 'Home Credit', category: 'Loan', suggestedDueDay: 5 },
  { id: 'rent', name: 'Rent', category: 'Rent', suggestedDueDay: 1 },
  { id: 'condo-dues', name: 'Condo dues', category: 'Rent', suggestedDueDay: 5 },
]
