import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "./button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// ชื่อเดือนไทย — caption แบบเต็ม (drill-down), grid แบบย่อ. ปี = ค.ศ. ให้ตรงกับช่องกรอก
// DD/MM/YYYY (formatDate ใช้ ค.ศ.) — เป็น label นำทางใน picker ตาม carve-out กฏ #11.
const MONTHS_FULL_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const MONTHS_SHORT_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const addYears = (d: Date, n: number) => new Date(d.getFullYear() + n, d.getMonth(), 1)

// classNames ของตารางวัน (ใช้ทั้งโหมด single ที่ปรับแต่ง และโหมด range/หลายเดือนแบบเดิม)
function dayGridClassNames(extra?: Record<string, string>) {
  return {
    months: "flex flex-col sm:flex-row gap-4",
    month: "flex flex-col gap-3",
    caption: "flex justify-center pt-1 pb-1 relative items-center w-full",
    caption_label: "text-sm font-semibold text-foreground tracking-tight",
    nav: "flex items-center gap-1",
    nav_button: cn(
      buttonVariants({ variant: "ghost", size: "icon" }),
      "absolute opacity-60 hover:opacity-100 hover:bg-primary-soft hover:text-primary"
    ),
    nav_button_previous: "absolute left-1",
    nav_button_next: "absolute right-1",
    table: "w-full border-collapse",
    head_row: "flex",
    head_cell:
      "text-foreground-subtle w-9 font-semibold text-[0.7rem] uppercase tracking-wider",
    row: "flex w-full mt-1.5",
    cell: cn(
      "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
      // Range bar — only when in range mode (.day-range-* classes exist)
      "[&:has(.day-range-middle)]:bg-primary-soft",
      "[&:has(.day-range-start)]:bg-primary-soft [&:has(.day-range-start)]:rounded-l-full",
      "[&:has(.day-range-end)]:bg-primary-soft [&:has(.day-range-end)]:rounded-r-full",
      // Wrap pill at week edges so the bar looks continuous-but-bounded
      "first:[&:has(.day-range-middle)]:rounded-l-full",
      "last:[&:has(.day-range-middle)]:rounded-r-full"
    ),
    day: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 p-0 font-normal aria-selected:opacity-100 rounded-full",
      "hover:bg-primary-soft hover:text-primary"
    ),
    day_range_start:
      "day-range-start !bg-primary !text-primary-foreground hover:!bg-primary-hover focus:!bg-primary",
    day_range_end:
      "day-range-end !bg-primary !text-primary-foreground hover:!bg-primary-hover focus:!bg-primary",
    day_selected:
      "!bg-primary !text-primary-foreground hover:!bg-primary-hover hover:!text-primary-foreground focus:!bg-primary focus:!text-primary-foreground",
    day_today:
      "font-bold ring-2 ring-primary/40 ring-inset text-primary",
    day_outside:
      "day-outside text-foreground-subtle aria-selected:text-foreground-subtle",
    day_disabled: "text-foreground-subtle opacity-40",
    day_range_middle:
      "day-range-middle !bg-transparent !text-foreground hover:!bg-primary-soft-hover",
    day_hidden: "invisible",
    ...extra,
  }
}

const CAL_ICONS = {
  IconLeft: () => <ChevronLeft className="size-4" />,
  IconRight: () => <ChevronRight className="size-4" />,
}

// ── ปุ่มหัวเลือกเดือน/ปีในมุมมอง grid (◄ label ►) ─────────────────────────────
function GridHeader({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between pb-3">
      <Button type="button" variant="ghost" size="icon" className="size-8 opacity-70 hover:opacity-100 hover:bg-primary-soft hover:text-primary" onClick={onPrev} aria-label="ก่อนหน้า">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-sm font-semibold tracking-tight">{label}</span>
      <Button type="button" variant="ghost" size="icon" className="size-8 opacity-70 hover:opacity-100 hover:bg-primary-soft hover:text-primary" onClick={onNext} aria-label="ถัดไป">
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

// ── โหมด single: กดเดือน→เลือกเดือน, กดปี→เลือกปี (drill-down) ─────────────────
function SingleCalendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const { month: monthProp, defaultMonth, onMonthChange, mode: _mode, numberOfMonths: _n, ...rest } = props as any
  const selectedDate: Date | undefined = props.selected instanceof Date ? props.selected : undefined
  const seed: Date = monthProp ?? defaultMonth ?? selectedDate ?? new Date()

  const [month, setMonth] = React.useState<Date>(() => startOfMonth(seed))
  const [view, setView] = React.useState<'day' | 'month' | 'year'>('day')
  const [yearPage, setYearPage] = React.useState<number>(() => Math.floor(seed.getFullYear() / 12) * 12)

  const today = new Date()

  // ── เลือกเดือน (3×4) ──
  if (view === 'month') {
    return (
      <div className={cn("w-[17.25rem] p-3", className)}>
        <GridHeader
          label={String(month.getFullYear())}
          onPrev={() => setMonth(m => addYears(m, -1))}
          onNext={() => setMonth(m => addYears(m, 1))}
        />
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS_SHORT_TH.map((label, i) => {
            const isSelected = !!selectedDate && selectedDate.getFullYear() === month.getFullYear() && selectedDate.getMonth() === i
            const isCurrent = today.getFullYear() === month.getFullYear() && today.getMonth() === i
            return (
              <Button
                key={i}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-10 text-sm', !isSelected && isCurrent && 'ring-2 ring-primary/40 text-primary', !isSelected && 'hover:bg-primary-soft hover:text-primary')}
                onClick={() => { setMonth(new Date(month.getFullYear(), i, 1)); setView('day') }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── เลือกปี (3×4, ทีละ 12 ปี) ──
  if (view === 'year') {
    return (
      <div className={cn("w-[17.25rem] p-3", className)}>
        <GridHeader
          label={`${yearPage} – ${yearPage + 11}`}
          onPrev={() => setYearPage(p => p - 12)}
          onNext={() => setYearPage(p => p + 12)}
        />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => yearPage + i).map(y => {
            const isSelected = !!selectedDate && selectedDate.getFullYear() === y
            const isCurrent = today.getFullYear() === y
            return (
              <Button
                key={y}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-10 text-sm', !isSelected && isCurrent && 'ring-2 ring-primary/40 text-primary', !isSelected && 'hover:bg-primary-soft hover:text-primary')}
                onClick={() => { setMonth(new Date(y, month.getMonth(), 1)); setView('day') }}
              >
                {y}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── มุมมองวัน — caption เป็นปุ่มเดือน/ปีกดเข้า drill-down ได้ ──
  return (
    <div className={cn("w-[17.25rem] p-3", className)}>
      <div className="flex items-center justify-between pb-2 px-0.5">
        <Button type="button" variant="ghost" size="icon" className="size-8 opacity-70 hover:opacity-100 hover:bg-primary-soft hover:text-primary" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="เดือนก่อนหน้า">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-semibold hover:bg-primary-soft hover:text-primary" onClick={() => setView('month')}>
            {MONTHS_FULL_TH[month.getMonth()]}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-sm font-semibold hover:bg-primary-soft hover:text-primary" onClick={() => { setYearPage(Math.floor(month.getFullYear() / 12) * 12); setView('year') }}>
            {month.getFullYear()}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8 opacity-70 hover:opacity-100 hover:bg-primary-soft hover:text-primary" onClick={() => setMonth(m => addMonths(m, 1))} aria-label="เดือนถัดไป">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <DayPicker
        mode="single"
        showOutsideDays={showOutsideDays}
        month={month}
        onMonthChange={setMonth}
        // caption ถูกแทนด้วยแถบด้านบนแล้ว → ซ่อน caption เดิมของ rdp
        classNames={{ ...dayGridClassNames({ caption: "hidden" }), ...classNames }}
        {...rest}
      />
    </div>
  )
}

// ── โหมด range / หลายเดือน — ปฏิทินเดิม (ลูกศรเลื่อนเดือน) ────────────────────
function PlainCalendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{ ...dayGridClassNames(), ...classNames }}
      components={CAL_ICONS}
      {...props}
    />
  )
}

function Calendar(props: CalendarProps) {
  // drill-down เฉพาะเลือกวันเดี่ยว (single, เดือนเดียว). range/หลายเดือน = ปฏิทินเดิม.
  const enhanced = props.mode === "single" && (props.numberOfMonths ?? 1) === 1
  return enhanced ? <SingleCalendar {...props} /> : <PlainCalendar {...props} />
}
Calendar.displayName = "Calendar"

export { Calendar }
