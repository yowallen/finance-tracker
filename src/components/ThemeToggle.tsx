import type { ThemeMode } from '../lib/theme'

interface ThemeToggleProps {
  theme: ThemeMode
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-toggle-icon">
          <path
            fill="currentColor"
            d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm9-9a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm12.95 6.36a1 1 0 0 1 0 1.41l-.7.7a1 1 0 1 1-1.42-1.41l.71-.7a1 1 0 0 1 1.41 0ZM7.76 6.34a1 1 0 0 1 0 1.41l-.7.71A1 1 0 0 1 5.64 7l.7-.7a1 1 0 0 1 1.42 0Zm10.6-1.41.71.7a1 1 0 1 1-1.41 1.42l-.71-.71a1 1 0 0 1 1.41-1.41ZM7.05 17.66l.7.71a1 1 0 1 1-1.4 1.41l-.71-.7a1 1 0 1 1 1.41-1.42Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-toggle-icon">
          <path
            fill="currentColor"
            d="M12.1 22a9.9 9.9 0 0 1-7-2.9A10 10 0 0 1 11.3 2a1 1 0 0 1 1.1 1.3A8 8 0 0 0 20.7 13a1 1 0 0 1 1.3 1.1A10 10 0 0 1 12.1 22Z"
          />
        </svg>
      )}
      <span className="theme-toggle-label">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
