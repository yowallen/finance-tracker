import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes, type Ref } from 'react'
import { formatMoneyInput, moneyCaretIndex, sanitizeMoneyInput } from '../lib/moneyInput'

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: string
  onChange: (value: string) => void
  ref?: Ref<HTMLInputElement>
}

export function MoneyInput({ value, onChange, ref, className, onBlur, ...rest }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const caretRef = useRef<number | null>(null)
  const display = formatMoneyInput(value)

  useLayoutEffect(() => {
    const caret = caretRef.current
    const input = inputRef.current
    if (caret === null || !input || document.activeElement !== input) return
    caretRef.current = null
    input.setSelectionRange(caret, caret)
  }, [display])

  function setInput(node: HTMLInputElement | null) {
    inputRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = sanitizeMoneyInput(event.target.value)
    const formatted = formatMoneyInput(next)
    const caret = moneyCaretIndex(
      event.target.value,
      event.target.selectionStart ?? event.target.value.length,
      formatted,
    )
    if (next === sanitizeMoneyInput(value)) {
      event.target.value = formatted
      event.target.setSelectionRange(caret, caret)
      return
    }
    caretRef.current = caret
    onChange(next)
  }

  return (
    <span className={className ? `money-field ${className}` : 'money-field'}>
      <span className="money-field-sign" aria-hidden="true">₱</span>
      <input
        {...rest}
        ref={setInput}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </span>
  )
}
