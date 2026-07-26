interface LoadingStateProps {
  label?: string
  /** compact = inline section; page = centered boot/main area */
  variant?: 'page' | 'section' | 'inline'
}

export function LoadingState({
  label = 'Loading…',
  variant = 'section',
}: LoadingStateProps) {
  return (
    <div
      className={`loading-state loading-state--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="loading-spinner" aria-hidden="true" />
      <p className="loading-label">{label}</p>
    </div>
  )
}
