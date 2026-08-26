import { useEffect, useRef } from 'react'
import { RotateCcw, X } from 'lucide-react'

export type UndoResource = 'transaction' | 'bill' | 'goal'

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
 * Non-blocking replacement for confirm() dialogs: destructive actions apply
 * immediately and this toast offers a timed Undo instead. Pauses while the
 * pointer or keyboard focus is inside and never steals focus (aria-live
 * polite), per toast-accessibility guidance.
 */
export function UndoToast({ pending, onUndo, onDismiss }: UndoToastProps) {
  // Latest-callback ref keeps the timer effect free of handler identity churn.
  const callbacksRef = useRef({ onUndo, onDismiss })
  useEffect(() => {
    callbacksRef.current = { onUndo, onDismiss }
  })

  const controlsRef = useRef<{ pause: () => void; resume: () => void } | null>(
    null,
  )

  useEffect(() => {
    let timer: number | null = null

    function stop() {
      if (timer != null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    function start() {
      stop()
      timer = window.setTimeout(() => {
        timer = null
        callbacksRef.current.onDismiss()
      }, AUTO_DISMISS_MS)
    }

    controlsRef.current = { pause: stop, resume: start }
    start()
    return () => {
      stop()
      controlsRef.current = null
    }
  }, [pending.id])

  return (
    <div
      className="undo-toast"
      role="status"
      aria-live="polite"
      onPointerEnter={() => controlsRef.current?.pause()}
      onPointerLeave={() => controlsRef.current?.resume()}
      onFocus={() => controlsRef.current?.pause()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          controlsRef.current?.resume()
        }
      }}
    >
      <p className="undo-toast-message">{pending.message}</p>
      <div className="undo-toast-actions">
        <button
          type="button"
          className="undo-toast-undo"
          onClick={() => {
            controlsRef.current?.pause()
            onUndo(pending)
          }}
        >
          <RotateCcw aria-hidden="true" />
          Undo
        </button>
        <button
          type="button"
          className="undo-toast-dismiss"
          onClick={() => callbacksRef.current.onDismiss()}
          aria-label="Dismiss notification"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
