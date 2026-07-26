export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'ledger.theme'

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
  return systemPrefersDark() ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.style.colorScheme = mode
}

export function persistTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
}
