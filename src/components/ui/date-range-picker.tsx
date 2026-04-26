import * as React from "react"
import { CalendarDays } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

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

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const d = isoToDate(iso)
  if (!d) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

interface Preset {
  label: string
  range: () => { from: Date; to: Date } | null
}

const PRESETS: Preset[] = [
  { label: 'วันนี้', range: () => { const t = startOfDay(new Date()); return { from: t, to: t } } },
  { label: 'เมื่อวาน', range: () => { const t = startOfDay(addDays(new Date(), -1)); return { from: t, to: t } } },
  { label: '7 วันล่าสุด', range: () => { const t = startOfDay(new Date()); return { from: addDays(t, -6), to: t } } },
  { label: '30 วันล่าสุด', range: () => { const t = startOfDay(new Date()); return { from: addDays(t, -29), to: t } } },
  { label: 'เดือนนี้', range: () => { const t = new Date(); return { from: startOfMonth(t), to: endOfMonth(t) } } },
  {
    label: 'เดือนที่แล้ว',
    range: () => {
      const t = new Date()
      const lm = new Date(t.getFullYear(), t.getMonth() - 1, 1)
      return { from: startOfMonth(lm), to: endOfMonth(lm) }
    },
  },
  { label: 'ปีนี้', range: () => { const y = new Date().getFullYear(); return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) } } },
  { label: 'ทั้งหมด', range: () => null },
]

interface DateRangePickerProps {
  from: string  // ISO yyyy-mm-dd
  to: string
  onChange: (from: string, to: string) => void
  className?: string
  placeholder?: string
  align?: 'start' | 'center' | 'end'
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  placeholder = 'เลือกช่วงวันที่',
  align = 'start',
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const fromDate = isoToDate(from)
  const toDate = isoToDate(to)
  const value: DateRange | undefined =
    fromDate || toDate ? { from: fromDate, to: toDate } : undefined

  const display = !from && !to
    ? placeholder
    : from && to && from !== to
      ? `${isoToDisplay(from)} – ${isoToDisplay(to)}`
      : from
        ? isoToDisplay(from)
        : isoToDisplay(to)

  const apply = (next?: { from: Date; to: Date } | null) => {
    if (!next) {
      onChange('', '')
    } else {
      onChange(dateToIso(next.from), dateToIso(next.to))
    }
    setOpen(false)
  }

  const onPickRange = (r: DateRange | undefined) => {
    if (!r) { onChange('', ''); return }
    if (r.from && r.to) {
      apply({ from: r.from, to: r.to })
    } else if (r.from && !r.to) {
      // First click — keep popover open, write just the start so user sees it
      onChange(dateToIso(r.from), '')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm text-left',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            !from && !to ? 'text-slate-400' : 'text-slate-700',
            className,
          )}
        >
          <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate flex-1">{display}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex">
          <div className="flex flex-col gap-0.5 p-2 border-r border-slate-100 min-w-[120px]">
            {PRESETS.map(p => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start h-7 px-2 text-xs font-normal"
                onClick={() => apply(p.range())}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={value}
            defaultMonth={fromDate ?? new Date()}
            numberOfMonths={2}
            onSelect={onPickRange}
            initialFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
