import * as React from "react"
import { Input } from "./input"

function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayToIso(display: string): string {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo}-${d}`
}

function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

type InputProps = React.ComponentProps<typeof Input>
interface DateInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (iso: string) => void
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, placeholder = 'dd/mm/yyyy', ...props }, ref) => {
    const [text, setText] = React.useState(() => isoToDisplay(value))

    React.useEffect(() => {
      const expected = isoToDisplay(value)
      if (expected !== text && displayToIso(text) !== value) {
        setText(expected)
      }
    }, [value])

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        onChange={e => {
          const formatted = autoFormat(e.target.value)
          setText(formatted)
          const iso = displayToIso(formatted)
          if (iso) onChange(iso)
          else if (formatted === '') onChange('')
        }}
        {...props}
      />
    )
  }
)
DateInput.displayName = "DateInput"
