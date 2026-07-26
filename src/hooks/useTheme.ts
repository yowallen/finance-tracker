import { useEffect, useState } from 'react'
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type ThemeMode,
} from '../lib/theme'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const initial = readStoredTheme()
    applyTheme(initial)
    return initial
  })

  useEffect(() => {
    applyTheme(theme)
    persistTheme(theme)
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return { theme, setTheme, toggleTheme }
}
