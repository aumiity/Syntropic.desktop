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

export type DateRangePresetKey = 'today' | 'yesterday' | 'last7d' | 'last30d' | 'thisMonth' | 'lastMonth' | 'thisYear'

interface Preset {
  key: DateRangePresetKey
  label: string
  range: () => { from: Date; to: Date }
}

const PRESETS: Preset[] = [
  { key: 'today', label: 'วันนี้', range: () => { const t = startOfDay(new Date()); return { from: t, to: t } } },
  { key: 'yesterday', label: 'เมื่อวาน', range: () => { const t = startOfDay(addDays(new Date(), -1)); return { from: t, to: t } } },
  { key: 'last7d', label: '7 วันล่าสุด', range: () => { const t = startOfDay(new Date()); return { from: addDays(t, -6), to: t } } },
  { key: 'last30d', label: '30 วันล่าสุด', range: () => { const t = startOfDay(new Date()); return { from: addDays(t, -29), to: t } } },
  { key: 'thisMonth', label: 'เดือนนี้', range: () => { const t = new Date(); return { from: startOfMonth(t), to: endOfMonth(t) } } },
  {
    key: 'lastMonth',
    label: 'เดือนที่แล้ว',
    range: () => {
      const t = new Date()
      const lm = new Date(t.getFullYear(), t.getMonth() - 1, 1)
      return { from: startOfMonth(lm), to: endOfMonth(lm) }
    },
  },
  { key: 'thisYear', label: 'ปีนี้', range: () => { const y = new Date().getFullYear(); return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) } } },
]

// Compute {from, to} ISO strings from a preset key — used by pages that persist
// a preset and want to recompute current dates on mount.
export function resolveDateRangePreset(key: DateRangePresetKey): { from: string; to: string } {
  const p = PRESETS.find(x => x.key === key)
  if (!p) {
    const t = startOfDay(new Date())
    return { from: dateToIso(t), to: dateToIso(t) }
  }
  const r = p.range()
  return { from: dateToIso(r.from), to: dateToIso(r.to) }
}

interface DateRangePickerProps {
  from: string  // ISO yyyy-mm-dd
  to: string
  onChange: (from: string, to: string) => void
  // Emits which preset the user picked (or null when they pick custom dates from
  // the calendar). Pages that want to persist a "rolling" range save this key
  // and recompute the actual dates via resolveDateRangePreset() on mount.
  onPresetChange?: (key: DateRangePresetKey | null) => void
  className?: string
  placeholder?: string
  align?: 'start' | 'center' | 'end'
}

export function DateRangePicker({
  from,
  to,
  onChange,
  onPresetChange,
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

  const apply = (next: { from: Date; to: Date } | null, presetKey: DateRangePresetKey | null) => {
    if (!next) {
      onChange('', '')
    } else {
      onChange(dateToIso(next.from), dateToIso(next.to))
    }
    onPresetChange?.(presetKey)
    setOpen(false)
  }

  const onPickRange = (r: DateRange | undefined) => {
    if (!r) { onChange('', ''); onPresetChange?.(null); return }
    if (r.from && r.to) {
      apply({ from: r.from, to: r.to }, null)
    } else if (r.from && !r.to) {
      // First click — keep popover open, write just the start so user sees it
      onChange(dateToIso(r.from), '')
      onPresetChange?.(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'relative h-10 w-full justify-start font-normal',
            'rounded-lg bg-input px-2.5 pr-9 text-sm',
            'hover:bg-muted-hover',
            !from && !to ? 'text-foreground-subtle' : 'text-foreground',
            className,
          )}
        >
          <span className="truncate flex-1 text-left">{display}</span>
          <CalendarDays className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle pointer-events-none" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-2xl shadow-lg overflow-hidden" align={align}>
        <div className="flex">
          <div className="flex flex-col p-3 border-r border-border bg-muted/30 min-w-[140px]">
            <span className="px-2 pb-1.5 text-[0.7rem] font-semibold text-muted-foreground uppercase">
              ช่วงเวลา
            </span>
            <div className="flex flex-col gap-0.5">
              {PRESETS.map(p => (
                <Button
                  key={p.key}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-8 px-3 text-sm font-normal hover:bg-primary-soft hover:text-primary"
                  onClick={() => apply(p.range(), p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
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
