import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { RotateCcw, X } from 'lucide-react'

export type UndoResource = 'transaction' | 'bill' | 'goal' | 'card'

export interface PendingUndo {
  /** Monotonic id so repeated actions restart the auto-dismiss window. */
  id: number
  message: string
  resource: UndoResource
  restore: () => Promise<void>
}

interface UndoToastProps {
  pending: PendingUndo
  onUndo: (pending: PendingUndo) => void
  onDismiss: () => void
}

/** Slightly above the 3–5s guideline so reading + deciding fits. */
const AUTO_DISMISS_MS = 6000

/**
 * Mobile-first toast with slide-up animation, proper touch targets,
 * safe-area awareness, and a progress indicator for auto-dismiss.
 */
export function UndoToast({ pending, onUndo, onDismiss }: UndoToastProps) {
  const [isExiting, setIsExiting] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const toastRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<{ pause: () => void; resume: () => void } | null>(null)

  // Animation callbacks
  const callbacksRef = useRef({ onUndo, onDismiss })
  useEffect(() => {
    callbacksRef.current = { onUndo, onDismiss }
  })

  // Trigger entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
  }, [pending.id])

  // Auto-dismiss timer with progress tracking
  useEffect(() => {
    let timer: number | null = null

    function stop() {
      if (timer != null) {
        window.clearTimeout(timer)
        timer = null
      }
      // Pause CSS animation
      if (toastRef.current) {
        toastRef.current.style.animationPlayState = 'paused'
      }
    }

    function start() {
      stop()
      timer = window.setTimeout(() => {
        timer = null
        setIsExiting(true)
        // Allow exit animation to complete before actually dismissing
        setTimeout(() => {
          callbacksRef.current.onDismiss()
        }, 200)
      }, AUTO_DISMISS_MS)

      // Resume CSS animation
      if (toastRef.current) {
        toastRef.current.style.animationPlayState = 'running'
      }
    }

    progressRef.current = { pause: stop, resume: start }
    start()
    return () => {
      stop()
      progressRef.current = null
    }
  }, [pending.id])

  // Set CSS custom property for animation duration on mount
  useEffect(() => {
    if (toastRef.current) {
      toastRef.current.style.setProperty('--toast-duration', `${AUTO_DISMISS_MS}ms`)
    }
  }, [])

  const handleUndoClick = () => {
    progressRef.current?.pause()
    setIsExiting(true)
    setTimeout(() => {
      onUndo(pending)
    }, 150)
  }

  const handleDismissClick = () => {
    progressRef.current?.pause()
    setIsExiting(true)
    setTimeout(() => {
      callbacksRef.current.onDismiss()
    }, 150)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      handleDismissClick()
    }
  }

  if (!isVisible && isExiting) return null

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    // eslint-disable-next-line jsx-a11y/tabindex-no-positive
    <div
      ref={toastRef}
      className={`undo-toast ${isExiting ? 'undo-toast--exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onPointerEnter={() => progressRef.current?.pause()}
      onPointerLeave={() => progressRef.current?.resume()}
      onFocus={() => progressRef.current?.pause()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          progressRef.current?.resume()
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Progress bar for auto-dismiss timer */}
      <div className="undo-toast-progress" aria-hidden="true" />

      <div className="undo-toast-content">
        <p className="undo-toast-message">{pending.message}</p>
        <div className="undo-toast-actions">
          <button
            type="button"
            className="undo-toast-undo"
            onClick={handleUndoClick}
            aria-label={`Undo: ${pending.message}`}
          >
            <RotateCcw aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            className="undo-toast-dismiss"
            onClick={handleDismissClick}
            aria-label="Dismiss notification"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
