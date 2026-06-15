import * as React from "react"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "./input"
import { Button } from "./button"
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
  const dd = Number(d), mm = Number(mo), yy = Number(y)
  // ตรวจว่าวันที่ "มีจริง" ไม่ใช่แค่ตรง pattern: เดือน 1-12, ปีสมเหตุผล,
  // วันไม่เกินจำนวนวันของเดือนนั้น (new Date(yy, mm, 0) = วันสุดท้ายของเดือน mm, รองรับ leap year)
  if (mm < 1 || mm > 12) return ''
  // ปี 1900-9999 — เผื่อสินค้าที่ไม่มีวันหมดอายุใส่ปี 9999 ได้
  if (yy < 1900 || yy > 9999) return ''
  const lastDay = new Date(yy, mm, 0).getDate()
  if (dd < 1 || dd > lastDay) return ''
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
  // Forwarded to the inner <Input>. "elevated" → bg-card + border + shadow,
  // matches DateRangePicker/SelectTrigger elevated for filter-strip use.
  variant?: 'default' | 'elevated'
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, onBlur, onFocus, placeholder = '', className, variant = 'default', ...props }, ref) => {
    const [text, setText] = React.useState(() => isoToDisplay(value))
    const [open, setOpen] = React.useState(false)
    // กำลัง focus ช่องนี้อยู่ไหม — ใช้คุมจังหวะโชว์ขอบแดง (ดู `invalid` ด้านล่าง)
    const [focused, setFocused] = React.useState(false)

    React.useEffect(() => {
      const expected = isoToDisplay(value)
      if (expected !== text && displayToIso(text) !== value) {
        setText(expected)
      }
    }, [value])

    const selectedDate = isoToDate(value)
    // "มีข้อความค้างอยู่ แต่ไม่ใช่วันที่สมบูรณ์" — ใช้ทั้งโชว์ขอบแดงและรายงานให้ parent
    const rawInvalid = text.length > 0 && !displayToIso(text)
    // โชว์ขอบแดงเมื่อ: ไม่ valid && (ไม่ได้ focus อยู่ ‖ พิมพ์ครบ 10 ตัว).
    //  - ออกจากช่องแล้วยังพิมพ์ไม่ครบ/ผิด → แดง (กันเคสพิมพ์ตกไป 1 ตัวแล้ว exp หายเงียบ)
    //  - พิมพ์ครบ 10 ตัวแต่ไม่ใช่วันจริง (99/99/9999) → แดงทันทีแม้ยัง focus
    // ระหว่างพิมพ์ที่ยัง focus + ยังไม่ครบ 10 → ไม่แดง เพื่อไม่ให้กระพริบรบกวน
    const invalid = rawInvalid && (!focused || text.length === 10)

    return (
      <div className={cn("relative h-9", className)}>
        <Input
          ref={ref}
          type="text"
          variant={variant}
          inputMode="numeric"
          placeholder={placeholder}
          value={text}
          aria-invalid={invalid || undefined}
          className="h-full w-full pr-9"
          onFocus={e => { setFocused(true); onFocus?.(e) }}
          onBlur={e => { setFocused(false); onBlur?.(e) }}
          onChange={e => {
            const formatted = autoFormat(e.target.value)
            setText(formatted)
            const iso = displayToIso(formatted)
            // วันที่ valid → commit ISO. อย่างอื่นทั้งหมด (พิมพ์ค้าง, หรือครบ 10 ตัว
            // แต่ไม่ใช่วันจริงเช่น 99/99/9999, หรือว่าง) → commit '' เสมอ เพื่อให้
            // parent ที่เช็ค required (`!value`) ดักได้ทันที. เดิม commit '' เฉพาะตอน
            // ว่าง ทำให้เลขมั่วทิ้ง parent ไว้ที่ค่าเดิม (default/ค่าเก่าที่ valid) แล้ว
            // "ผ่าน" submit แบบเงียบ ๆ. ตัวอักษรที่พิมพ์ + ขอบแดงยังคงโชว์ตามเดิม.
            onChange(iso || '')
          }}
          {...props}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              tabIndex={-1}
              variant="ghost"
              size="icon-sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-primary hover:bg-primary-soft"
            >
              <CalendarDays className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-2xl shadow-lg" align="end">
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
