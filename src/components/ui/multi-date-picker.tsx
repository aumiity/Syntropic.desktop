import * as React from 'react'
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import dayjs from 'dayjs'
import type { DateRange } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from './button'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MultiDateMode = 'day' | 'month' | 'year' | 'custom'

const MODE_LABELS: Record<MultiDateMode, string> = {
  day:    'วัน',
  month:  'เดือน',
  year:   'ปี',
  custom: 'กำหนดเอง',
}

// ─── Thai locale ──────────────────────────────────────────────────────────────

const MONTH_SHORT_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.',  'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
const MONTH_FULL_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function rangeForMultiMode(
  mode: MultiDateMode,
  anchorIso?: string,
): { from: string; to: string } {
  const a = anchorIso ? dayjs(anchorIso) : dayjs()
  switch (mode) {
    case 'day':
      return { from: a.format('YYYY-MM-DD'), to: a.format('YYYY-MM-DD') }
    case 'month':
      return {
        from: a.startOf('month').format('YYYY-MM-DD'),
        to:   a.endOf('month').format('YYYY-MM-DD'),
      }
    case 'year':
      return {
        from: a.startOf('year').format('YYYY-MM-DD'),
        to:   a.endOf('year').format('YYYY-MM-DD'),
      }
    case 'custom':
      return {
        from: a.startOf('month').format('YYYY-MM-DD'),
        to:   a.endOf('month').format('YYYY-MM-DD'),
      }
  }
}

function displayLabel(mode: MultiDateMode, from: string, to: string): string {
  if (!from || !to) return 'เลือกช่วง'
  const f = dayjs(from)
  const t = dayjs(to)
  switch (mode) {
    case 'day':
      return `${f.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')}`
    case 'month':
      return `${MONTH_FULL_TH[f.month()]} ${f.format('BBBB')}`
    case 'year':
      return `ปี ${f.format('BBBB')}`
    case 'custom': {
      if (f.isSame(t, 'day'))
        return `${f.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')}`
      if (f.year() === t.year() && f.month() === t.month())
        return `${f.date()}–${t.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')}`
      if (f.year() === t.year())
        return `${f.date()} ${MONTH_SHORT_TH[f.month()]} – ${t.date()} ${MONTH_SHORT_TH[t.month()]} ${f.format('BB')}`
      return `${f.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')} – ${t.date()} ${MONTH_SHORT_TH[t.month()]} ${t.format('BB')}`
    }
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MultiDatePickerProps {
  mode: MultiDateMode
  from: string   // ISO yyyy-mm-dd
  to: string     // ISO yyyy-mm-dd
  onChange: (mode: MultiDateMode, from: string, to: string) => void
  /** Modes shown in the in-picker tab strip. Default: all four. */
  allowedModes?: MultiDateMode[]
  align?: 'start' | 'center' | 'end'
  className?: string
  placeholder?: string
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MultiDatePicker({
  mode,
  from,
  to,
  onChange,
  allowedModes = ['day', 'month', 'year', 'custom'],
  align = 'start',
  className,
  placeholder,
}: MultiDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const pillId = React.useId()

  const switchMode = (next: MultiDateMode) => {
    if (next === mode) return
    const r = rangeForMultiMode(next, from)
    onChange(next, r.from, r.to)
    // keep popover open so user can immediately interact with the new panel
  }

  const commit = (f: string, t: string) => {
    onChange(mode, f, t)
    setOpen(false)
  }

  const label = from && to ? displayLabel(mode, from, to) : (placeholder ?? 'เลือกช่วง')
  const hasValue = Boolean(from && to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 px-3 justify-start gap-2 font-normal text-sm min-w-[200px]',
            'bg-card border border-border shadow-sm',
            'hover:bg-muted/60 hover:shadow-sm',
            hasValue ? 'text-foreground' : 'text-foreground-subtle',
            className,
          )}
        >
          <span className="flex-1 truncate text-left">{label}</span>
          <CalendarDays className="size-4 text-foreground-subtle shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 rounded-2xl shadow-xl overflow-hidden border border-border/60"
        align={align}
        sideOffset={6}
      >
        {/* ── Mode tab strip (hidden when only 1 mode is allowed) ── */}
        {allowedModes.length > 1 && (
          <div className="px-2.5 pt-2.5 pb-2 border-b border-border bg-muted/20">
            <div className="flex items-center bg-muted rounded-xl p-1 gap-0.5">
              {allowedModes.map(m => {
                const active = mode === m
                return (
                  <Button
                    key={m}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'relative flex-1 h-8 px-2 text-sm font-semibold rounded-lg',
                      'hover:bg-transparent',
                      active
                        ? 'text-primary-foreground hover:text-primary-foreground'
                        : 'text-foreground/50 hover:text-foreground',
                    )}
                    onClick={() => switchMode(m)}
                  >
                    {active && (
                      <motion.div
                        layoutId={pillId}
                        aria-hidden
                        className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                        transition={{ type: 'spring', bounce: 0.18, duration: 0.38 }}
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      {m === 'custom' && <CalendarRange className="size-3.5" />}
                      {MODE_LABELS[m]}
                    </span>
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Panels ──────────────────────────────────────────────── */}
        {mode === 'day'    && <DayPanel    from={from} onPick={commit} />}
        {mode === 'month'  && <MonthPanel  from={from} onPick={commit} />}
        {mode === 'year'   && <YearPanel   from={from} onPick={commit} />}
        {mode === 'custom' && <CustomPanel from={from} to={to} onPick={commit} />}
      </PopoverContent>
    </Popover>
  )
}

// ─── Day panel ────────────────────────────────────────────────────────────────

function DayPanel({
  from,
  onPick,
}: {
  from: string
  onPick: (f: string, t: string) => void
}) {
  const date = from ? dayjs(from).toDate() : new Date()
  return (
    <Calendar
      mode="single"
      selected={date}
      defaultMonth={date}
      onSelect={d => {
        if (!d) return
        const iso = dayjs(d).format('YYYY-MM-DD')
        onPick(iso, iso)
      }}
      initialFocus
    />
  )
}

// ─── Month panel ──────────────────────────────────────────────────────────────

function MonthPanel({
  from,
  onPick,
}: {
  from: string
  onPick: (f: string, t: string) => void
}) {
  const initial = from ? dayjs(from) : dayjs()
  const [year, setYear] = React.useState(initial.year())
  const now = dayjs()
  const selMonth = from && dayjs(from).year() === year ? dayjs(from).month() : -1

  return (
    <div className="p-4 w-[280px]">
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg hover:bg-primary-soft hover:text-primary"
          onClick={() => setYear(y => y - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold select-none">{year + 543}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg hover:bg-primary-soft hover:text-primary"
          onClick={() => setYear(y => y + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Month grid 4×3 */}
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_SHORT_TH.map((label, i) => {
          const isSelected = selMonth === i
          const isCurrent = now.year() === year && now.month() === i
          return (
            <Button
              key={i}
              type="button"
              variant={isSelected ? 'default' : 'ghost'}
              className={cn(
                'h-10 w-full rounded-xl text-sm font-medium transition-all',
                !isSelected && isCurrent && 'ring-2 ring-primary/40 text-primary',
                !isSelected && !isCurrent && 'hover:bg-primary-soft hover:text-primary',
              )}
              onClick={() => {
                const m = dayjs().year(year).month(i)
                onPick(
                  m.startOf('month').format('YYYY-MM-DD'),
                  m.endOf('month').format('YYYY-MM-DD'),
                )
              }}
            >
              {label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Year panel ───────────────────────────────────────────────────────────────

function YearPanel({
  from,
  onPick,
}: {
  from: string
  onPick: (f: string, t: string) => void
}) {
  const initial = from ? dayjs(from) : dayjs()
  const now = dayjs()
  const selYear = from ? initial.year() : -1
  const [pageStart, setPageStart] = React.useState(
    Math.floor(initial.year() / 12) * 12,
  )

  return (
    <div className="p-4 w-[280px]">
      {/* Decade navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg hover:bg-primary-soft hover:text-primary"
          onClick={() => setPageStart(p => p - 12)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold select-none">
          {pageStart + 543}–{pageStart + 11 + 543}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg hover:bg-primary-soft hover:text-primary"
          onClick={() => setPageStart(p => p + 12)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Year grid 4×3 */}
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => pageStart + i).map(y => {
          const isSelected = selYear === y
          const isCurrent = now.year() === y
          return (
            <Button
              key={y}
              type="button"
              variant={isSelected ? 'default' : 'ghost'}
              className={cn(
                'h-10 w-full rounded-xl text-sm font-medium transition-all',
                !isSelected && isCurrent && 'ring-2 ring-primary/40 text-primary',
                !isSelected && !isCurrent && 'hover:bg-primary-soft hover:text-primary',
              )}
              onClick={() => {
                const d = dayjs().year(y)
                onPick(
                  d.startOf('year').format('YYYY-MM-DD'),
                  d.endOf('year').format('YYYY-MM-DD'),
                )
              }}
            >
              {y + 543}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Custom panel ─────────────────────────────────────────────────────────────

const CUSTOM_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'วันนี้',         range: () => { const t = dayjs(); return { from: t.format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: 'เมื่อวาน',       range: () => { const t = dayjs().subtract(1, 'day'); return { from: t.format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: '7 วันล่าสุด',    range: () => { const t = dayjs(); return { from: t.subtract(6, 'day').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: '30 วันล่าสุด',   range: () => { const t = dayjs(); return { from: t.subtract(29, 'day').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: 'เดือนนี้',       range: () => { const t = dayjs(); return { from: t.startOf('month').format('YYYY-MM-DD'), to: t.endOf('month').format('YYYY-MM-DD') } } },
  { label: 'เดือนที่แล้ว',   range: () => { const t = dayjs().subtract(1, 'month'); return { from: t.startOf('month').format('YYYY-MM-DD'), to: t.endOf('month').format('YYYY-MM-DD') } } },
  { label: 'ปีนี้',           range: () => { const t = dayjs(); return { from: t.startOf('year').format('YYYY-MM-DD'), to: t.endOf('year').format('YYYY-MM-DD') } } },
  { label: 'ปีที่แล้ว',      range: () => { const t = dayjs().subtract(1, 'year'); return { from: t.startOf('year').format('YYYY-MM-DD'), to: t.endOf('year').format('YYYY-MM-DD') } } },
]

function CustomPanel({
  from,
  to,
  onPick,
}: {
  from: string
  to: string
  onPick: (f: string, t: string) => void
}) {
  const initFrom = from ? dayjs(from).toDate() : undefined
  const initTo   = to   ? dayjs(to).toDate()   : undefined

  // Local range state so first-click partial selection renders correctly
  const [range, setRange] = React.useState<DateRange | undefined>(
    initFrom ? { from: initFrom, to: initTo } : undefined,
  )

  return (
    <div className="flex">
      {/* Preset sidebar */}
      <div className="flex flex-col p-3 border-r border-border bg-muted/20 min-w-[140px]">
        <span className="px-2 pb-1.5 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide">
          ช่วงเวลา
        </span>
        <div className="flex flex-col gap-0.5">
          {CUSTOM_PRESETS.map(p => (
            <Button
              key={p.label}
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start h-8 px-3 text-sm font-normal hover:bg-primary-soft hover:text-primary"
              onClick={() => {
                const r = p.range()
                setRange({ from: dayjs(r.from).toDate(), to: dayjs(r.to).toDate() })
                onPick(r.from, r.to)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Range calendar */}
      <Calendar
        mode="range"
        selected={range}
        defaultMonth={initFrom ?? new Date()}
        numberOfMonths={2}
        onSelect={r => {
          setRange(r)
          if (r?.from && r?.to) {
            onPick(
              dayjs(r.from).format('YYYY-MM-DD'),
              dayjs(r.to).format('YYYY-MM-DD'),
            )
          }
        }}
        initialFocus
      />
    </div>
  )
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Initial {mode, from, to} based on the user's role. */
export function defaultMultiDateFor(
  isOwner: boolean,
): { mode: MultiDateMode; from: string; to: string } {
  const mode: MultiDateMode = isOwner ? 'month' : 'day'
  const r = rangeForMultiMode(mode)
  return { mode, from: r.from, to: r.to }
}

/** Modes appropriate for each role. */
export function allowedModesFor(isOwner: boolean): MultiDateMode[] {
  return isOwner ? ['day', 'month', 'year', 'custom'] : ['day', 'custom']
}
