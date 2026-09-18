import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface TransactionSheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function TransactionSheet({ open, title, onClose, children }: TransactionSheetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.addEventListener('keydown', handleKeyDown)
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>('input[type="number"]')?.focus()
    })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="transaction-sheet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="transaction-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="transaction-sheet__handle" aria-hidden="true" />
        <div className="transaction-sheet__header">
          <h2 id="form-heading" className="transaction-sheet__title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close transaction form"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
