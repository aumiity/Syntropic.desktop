import * as React from 'react'
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import dayjs from 'dayjs'
import type { DateRange } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from './button'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type PeriodMode = 'day' | 'month' | 'year' | 'custom'

const MODE_LABELS: Record<PeriodMode, string> = {
  day: 'วัน',
  month: 'เดือน',
  year: 'ปี',
  custom: 'กำหนดเอง',
}

const MONTH_SHORT_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

const MONTH_FULL_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

// Anchor a mode change on the current selection — switching from custom
// "1–15 ม.ค." to "month" lands on ม.ค. (not the current month). Matches
// Hygeia behaviour: the new granularity zooms out from where you were.
function rangeForMode(mode: PeriodMode, anchorIso?: string): { from: string; to: string } {
  const a = anchorIso ? dayjs(anchorIso) : dayjs()
  switch (mode) {
    case 'day':
      return { from: a.format('YYYY-MM-DD'), to: a.format('YYYY-MM-DD') }
    case 'month':
      return { from: a.startOf('month').format('YYYY-MM-DD'), to: a.endOf('month').format('YYYY-MM-DD') }
    case 'year':
      return { from: a.startOf('year').format('YYYY-MM-DD'), to: a.endOf('year').format('YYYY-MM-DD') }
    case 'custom':
      // Default custom = the anchor's month (gives a sensible starting range)
      return { from: a.startOf('month').format('YYYY-MM-DD'), to: a.endOf('month').format('YYYY-MM-DD') }
  }
}

function displayLabel(mode: PeriodMode, from: string, to: string): string {
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
    case 'custom':
      if (f.isSame(t, 'day')) return `${f.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')}`
      if (f.year() === t.year() && f.month() === t.month()) {
        return `${f.date()}–${t.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')}`
      }
      return `${f.date()} ${MONTH_SHORT_TH[f.month()]} ${f.format('BB')} – ${t.date()} ${MONTH_SHORT_TH[t.month()]} ${t.format('BB')}`
  }
}

// Prev/next arrow shifts the period by one unit. For custom mode, shifts by
// the range's own length so a 7-day window steps back 7 days.
function stepPeriod(mode: PeriodMode, from: string, to: string, dir: -1 | 1): { from: string; to: string } {
  const f = dayjs(from)
  switch (mode) {
    case 'day': {
      const d = f.add(dir, 'day')
      return { from: d.format('YYYY-MM-DD'), to: d.format('YYYY-MM-DD') }
    }
    case 'month': {
      const d = f.add(dir, 'month')
      return { from: d.startOf('month').format('YYYY-MM-DD'), to: d.endOf('month').format('YYYY-MM-DD') }
    }
    case 'year': {
      const d = f.add(dir, 'year')
      return { from: d.startOf('year').format('YYYY-MM-DD'), to: d.endOf('year').format('YYYY-MM-DD') }
    }
    case 'custom': {
      const t = dayjs(to)
      const days = t.diff(f, 'day') + 1
      return {
        from: f.add(dir * days, 'day').format('YYYY-MM-DD'),
        to: t.add(dir * days, 'day').format('YYYY-MM-DD'),
      }
    }
  }
}

interface PeriodPickerProps {
  mode: PeriodMode
  from: string
  to: string
  onChange: (mode: PeriodMode, from: string, to: string) => void
  /** Modes to expose in the segmented toggle. Defaults to all four. */
  allowedModes?: PeriodMode[]
  align?: 'start' | 'center' | 'end'
  className?: string
}

export function PeriodPicker({
  mode,
  from,
  to,
  onChange,
  allowedModes = ['day', 'month', 'year', 'custom'],
  align = 'end',
  className,
}: PeriodPickerProps) {
  const [open, setOpen] = React.useState(false)
  // Shared layoutId so the active pill slides between modes (iOS segmented feel).
  const pillId = React.useId()

  const handleModeChange = (newMode: PeriodMode) => {
    if (newMode === mode) return
    const next = rangeForMode(newMode, from)
    onChange(newMode, next.from, next.to)
  }

  const handleStep = (dir: -1 | 1) => {
    const next = stepPeriod(mode, from, to, dir)
    onChange(mode, next.from, next.to)
  }

  const handlePick = (newFrom: string, newTo: string) => {
    onChange(mode, newFrom, newTo)
    setOpen(false)
  }

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      {/* Granularity segmented — iOS-style like the Tabs SEGMENTED variant:
          muted track + card pill on active, foreground text (not teal fill). */}
      <div className="inline-grid grid-flow-col auto-cols-fr items-center bg-muted rounded-lg p-1 h-10 gap-1">
        {allowedModes.map(m => {
          const active = mode === m
          return (
            <Button
              key={m}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'relative w-full h-8 px-3 text-sm font-medium rounded-md hover:bg-transparent',
                active
                  ? 'text-primary-foreground hover:text-primary-foreground'
                  : 'text-foreground/60 dark:text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleModeChange(m)}
              title={MODE_LABELS[m]}
            >
              {active && (
                <motion.div
                  layoutId={pillId}
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-primary shadow-md"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center justify-center">
                {m === 'custom' ? <CalendarRange className="size-4" /> : MODE_LABELS[m]}
              </span>
            </Button>
          )
        })}
      </div>

      {/* Stepper + popover trigger — matches the segmented muted track */}
      <div className="inline-flex items-center bg-muted rounded-lg h-10 overflow-hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-none text-muted-foreground hover:bg-primary-soft hover:text-primary"
          onClick={() => handleStep(-1)}
          title="ก่อนหน้า"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-3 rounded-none min-w-[180px] justify-center font-medium hover:bg-primary-soft hover:text-primary"
            >
              <CalendarDays className="size-4 mr-2 text-foreground-subtle" />
              {displayLabel(mode, from, to)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-2xl shadow-lg overflow-hidden" align={align}>
            {mode === 'day' && <DayPanel from={from} onPick={handlePick} />}
            {mode === 'month' && <MonthPanel from={from} onPick={handlePick} />}
            {mode === 'year' && <YearPanel from={from} onPick={handlePick} />}
            {mode === 'custom' && <CustomPanel from={from} to={to} onPick={handlePick} />}
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-none text-muted-foreground hover:bg-primary-soft hover:text-primary"
          onClick={() => handleStep(1)}
          title="ถัดไป"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ── Day panel — single-day Calendar ─────────────────────────────────────────
function DayPanel({ from, onPick }: { from: string; onPick: (f: string, t: string) => void }) {
  const date = from ? dayjs(from).toDate() : new Date()
  return (
    <Calendar
      mode="single"
      selected={date}
      defaultMonth={date}
      onSelect={(d) => {
        if (!d) return
        const iso = dayjs(d).format('YYYY-MM-DD')
        onPick(iso, iso)
      }}
      initialFocus
    />
  )
}

// ── Month panel — 12-month grid with year stepper ───────────────────────────
function MonthPanel({ from, onPick }: { from: string; onPick: (f: string, t: string) => void }) {
  const initial = from ? dayjs(from) : dayjs()
  const [year, setYear] = React.useState(initial.year())
  const selectedMonth = from && dayjs(from).year() === year ? dayjs(from).month() : -1
  const currentMonth = dayjs()

  return (
    <div className="p-3 min-w-[280px]">
      <div className="flex items-center justify-between pb-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setYear(y => y - 1)} tooltip="ปีก่อนหน้า">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">{(year + 543).toString()}</span>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setYear(y => y + 1)} tooltip="ปีถัดไป">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_SHORT_TH.map((label, i) => {
          const isSelected = selectedMonth === i
          const isCurrent = currentMonth.year() === year && currentMonth.month() === i
          return (
            <Button
              key={i}
              type="button"
              variant={isSelected ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-9 text-sm',
                !isSelected && isCurrent && 'ring-2 ring-primary/40 text-primary',
              )}
              onClick={() => {
                const m = dayjs().year(year).month(i)
                onPick(m.startOf('month').format('YYYY-MM-DD'), m.endOf('month').format('YYYY-MM-DD'))
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

// ── Year panel — 12-year grid ───────────────────────────────────────────────
function YearPanel({ from, onPick }: { from: string; onPick: (f: string, t: string) => void }) {
  const initial = from ? dayjs(from) : dayjs()
  const selectedYear = from ? initial.year() : -1
  const currentYear = dayjs().year()
  const [pageStart, setPageStart] = React.useState(Math.floor(initial.year() / 12) * 12)

  return (
    <div className="p-3 min-w-[280px]">
      <div className="flex items-center justify-between pb-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setPageStart(p => p - 12)} tooltip="ก่อนหน้า">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          {pageStart + 543} – {pageStart + 11 + 543}
        </span>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setPageStart(p => p + 12)} tooltip="ถัดไป">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => pageStart + i).map(y => {
          const isSelected = selectedYear === y
          const isCurrent = currentYear === y
          return (
            <Button
              key={y}
              type="button"
              variant={isSelected ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-9 text-sm',
                !isSelected && isCurrent && 'ring-2 ring-primary/40 text-primary',
              )}
              onClick={() => {
                const d = dayjs().year(y)
                onPick(d.startOf('year').format('YYYY-MM-DD'), d.endOf('year').format('YYYY-MM-DD'))
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

// ── Custom panel — preset sidebar + dual-month range calendar ──────────────
// Presets mirror the original DateRangePicker. Some overlap with day/month/
// year modes intentionally — keeps muscle memory for users coming from the
// old picker.
const CUSTOM_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'วันนี้',         range: () => { const t = dayjs(); return { from: t.format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: 'เมื่อวาน',       range: () => { const t = dayjs().subtract(1, 'day'); return { from: t.format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: '7 วันล่าสุด',     range: () => { const t = dayjs(); return { from: t.subtract(6, 'day').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: '30 วันล่าสุด',    range: () => { const t = dayjs(); return { from: t.subtract(29, 'day').format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') } } },
  { label: 'เดือนนี้',       range: () => { const t = dayjs(); return { from: t.startOf('month').format('YYYY-MM-DD'), to: t.endOf('month').format('YYYY-MM-DD') } } },
  { label: 'เดือนที่แล้ว',    range: () => { const t = dayjs().subtract(1, 'month'); return { from: t.startOf('month').format('YYYY-MM-DD'), to: t.endOf('month').format('YYYY-MM-DD') } } },
  { label: 'ปีนี้',           range: () => { const t = dayjs(); return { from: t.startOf('year').format('YYYY-MM-DD'), to: t.endOf('year').format('YYYY-MM-DD') } } },
]

function CustomPanel({ from, to, onPick }: { from: string; to: string; onPick: (f: string, t: string) => void }) {
  const fromDate = from ? dayjs(from).toDate() : undefined
  const toDate = to ? dayjs(to).toDate() : undefined
  const value: DateRange | undefined = fromDate || toDate ? { from: fromDate, to: toDate } : undefined

  const onSelect = (r: DateRange | undefined) => {
    if (!r?.from || !r?.to) return
    onPick(dayjs(r.from).format('YYYY-MM-DD'), dayjs(r.to).format('YYYY-MM-DD'))
  }

  return (
    <div className="flex">
      <div className="flex flex-col p-3 border-r border-border bg-muted/30 min-w-[140px]">
        <span className="px-2 pb-1.5 text-[0.7rem] font-semibold text-muted-foreground uppercase">
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
                onPick(r.from, r.to)
              }}
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
        onSelect={onSelect}
        initialFocus
      />
    </div>
  )
}

// Helper for parents — initial mode/range given the user's role. Owner opens
// on "month" (most common), non-owner on "day" (only allowed wide modes are
// day/custom anyway).
export function defaultPeriodFor(isOwner: boolean): { mode: PeriodMode; from: string; to: string } {
  const mode: PeriodMode = isOwner ? 'month' : 'day'
  const r = rangeForMode(mode)
  return { mode, from: r.from, to: r.to }
}

export function allowedModesFor(isOwner: boolean): PeriodMode[] {
  return isOwner ? ['day', 'month', 'year', 'custom'] : ['day', 'custom']
}
