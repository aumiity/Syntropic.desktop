import * as React from "react"
import { CalendarDays } from "lucide-react"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Calendar } from "./calendar"

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

function isoToDate(iso: string): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateToIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type InputProps = React.ComponentProps<typeof Input>
interface DateInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (iso: string) => void
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, placeholder = 'dd/mm/yyyy', className, ...props }, ref) => {
    const [text, setText] = React.useState(() => isoToDisplay(value))
    const [open, setOpen] = React.useState(false)

    React.useEffect(() => {
      const expected = isoToDisplay(value)
      if (expected !== text && displayToIso(text) !== value) {
        setText(expected)
      }
    }, [value])

    const selectedDate = isoToDate(value)

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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-foreground-subtle hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={(d) => {
                if (!d) return
                const iso = dateToIso(d)
                setText(isoToDisplay(iso))
                onChange(iso)
                setOpen(false)
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    )
  }
)
DateInput.displayName = "DateInput"
