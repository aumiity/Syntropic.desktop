import * as React from "react"
import { CalendarDays } from "lucide-react"
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
  ({ value, onChange, placeholder = 'dd/mm/yyyy', className, ...props }, ref) => {
    const [text, setText] = React.useState(() => isoToDisplay(value))
    const nativeRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
      const expected = isoToDisplay(value)
      if (expected !== text && displayToIso(text) !== value) {
        setText(expected)
      }
    }, [value])

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={text}
          className={`pr-7 ${className ?? ''}`}
          onChange={e => {
            const formatted = autoFormat(e.target.value)
            setText(formatted)
            const iso = displayToIso(formatted)
            if (iso) onChange(iso)
            else if (formatted === '') onChange('')
          }}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nativeRef.current?.showPicker?.() ?? nativeRef.current?.click()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <CalendarDays className="w-3.5 h-3.5" />
        </button>
        <input
          ref={nativeRef}
          type="date"
          value={value}
          onChange={e => {
            const iso = e.target.value
            setText(isoToDisplay(iso))
            onChange(iso)
          }}
          className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
          tabIndex={-1}
        />
      </div>
    )
  }
)
DateInput.displayName = "DateInput"
