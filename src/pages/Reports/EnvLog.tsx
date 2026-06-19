import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { CheckRow } from '@/components/ui/checkbox'
import { ChoiceCard } from '@/components/ui/choice-card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TintIcon } from '@/components/ui/tint-icon'
import { MultiDatePicker, type MultiDateMode, rangeForMultiMode } from '@/components/ui/multi-date-picker'
import { useToast } from '@/components/ui/toast'
import { cn, formatDate } from '@/lib/utils'
import { printDomSheets } from '@/lib/print/printDomSheets'
import type { Setting, EnvLogRow, EnvSettings } from '@/types'
import type { FdaOutletContext } from './FdaReports'
import { A4Sheet, A4_CONTENT_W, A4_CONTENT_H, FOOTER_H, PACK_SAFETY } from './a4'
import ReportPrintDialog from './ReportPrintDialog'
import { FileText, Printer, Thermometer, MapPin, Wand2 } from 'lucide-react'

// ─── Static config ──────────────────────────────────────────────────────────

const PERIODS = [
  { value: 1, label: 'เช้า' },
  { value: 2, label: 'กลางวัน' },
  { value: 3, label: 'เย็น' },
] as const

type EnvField = 'store_temp' | 'store_humidity' | 'reserve_temp' | 'reserve_humidity' | 'fridge_temp'
type ThreshKind = 'store_temp' | 'store_humidity' | 'reserve_temp' | 'reserve_humidity' | 'fridge'

// A measurement slot inside a zone — one editable column per period.
interface ZoneField { field: EnvField; short: '°C' | '%RH'; kind: ThreshKind }

// Measurement zone (top header band). store always on; reserve/fridge gated.
interface Zone { key: 'store' | 'reserve' | 'fridge'; label: string; fields: ZoneField[] }

const ALL_ZONES: Zone[] = [
  {
    key: 'store', label: 'ภายในร้าน (°C / %RH)', fields: [
      { field: 'store_temp', short: '°C', kind: 'store_temp' },
      { field: 'store_humidity', short: '%RH', kind: 'store_humidity' },
    ],
  },
  {
    key: 'reserve', label: 'พื้นที่เก็บสำรอง (°C / %RH)', fields: [
      { field: 'reserve_temp', short: '°C', kind: 'reserve_temp' },
      { field: 'reserve_humidity', short: '%RH', kind: 'reserve_humidity' },
    ],
  },
  {
    key: 'fridge', label: 'ตู้เย็น (°C)', fields: [
      { field: 'fridge_temp', short: '°C', kind: 'fridge' },
    ],
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatVal(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return ''
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString()
}

// True when a measured value sits outside its GPP band (→ red cell). null/blank
// is never out-of-range. Generated/real in-band values stay neutral.
function isOutOfRange(kind: ThreshKind, v: number | null, s: EnvSettings | null): boolean {
  if (v == null || s == null) return false
  switch (kind) {
    case 'store_temp':       return v > s.store_temp_max
    case 'store_humidity':   return v > s.store_humidity_max
    case 'reserve_temp':     return v > s.reserve_temp_max
    case 'reserve_humidity': return v > s.reserve_humidity_max
    case 'fridge':           return v < s.fridge_temp_min || v > s.fridge_temp_max
  }
}

function ymOf(iso: string): { year: number; month: number } {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

// One contiguous slice of days on a printed page + filler rows to the bottom.
interface PageSlice { start: number; end: number; filler: number }

export default function EnvLogPage() {
  const { toast } = useToast()
  const { setSummary, setActions } = useOutletContext<FdaOutletContext>()

  // เดือนเดียวเท่านั้น (ล็อกโหมด month เหมือน ข.ย.)
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(() => rangeForMultiMode('month').from)
  const [dateTo, setDateTo] = useState(() => rangeForMultiMode('month').to)

  const [settings, setSettings] = useState<EnvSettings | null>(null)
  // Grid rows keyed by `${log_date}|${period}` for O(1) cell lookup.
  const [rowMap, setRowMap] = useState<Map<string, EnvLogRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('')

  // Per-cell display strings for the CONTROLLED grid inputs, keyed by
  // `${log_date}|${period}|${field}` (field='note' for the daily note). Seeded
  // wholesale from server rows on month-load + generateMonth; thereafter only
  // the edited cell mutates on keystroke, and the same cell reconciles to the
  // normalized stored value after its own blur-save — a sibling cell's save
  // never touches it, so typing is never interrupted.
  const [cellText, setCellText] = useState<Map<string, string>>(new Map())

  const [pages, setPages] = useState<PageSlice[]>([])
  const [blankRender, setBlankRender] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // Generate dialog state.
  const [genOpen, setGenOpen] = useState(false)
  const [genMode, setGenMode] = useState<'fill-empty' | 'all'>('fill-empty')
  const [genBusy, setGenBusy] = useState(false)

  const { year, month } = useMemo(() => ymOf(dateFrom), [dateFrom])
  const numDays = useMemo(() => daysInMonth(year, month), [year, month])

  // Per-cell controlled-input identity. field='note' for the daily note column.
  const cellKey = (day: number, period: number, field: EnvField | 'note') =>
    `${dateKey(year, month, day)}|${period}|${field}`

  // Build the whole display-string map from a fresh set of server rows.
  // NULL → '' so a stored blank (incl. a typed 0 the handler nullified) shows
  // an empty cell. Notes live on period 1 only, keyed once per day.
  const buildCellText = (rows: EnvLogRow[]): Map<string, string> => {
    const next = new Map<string, string>()
    for (const r of rows) {
      for (const z of ALL_ZONES) {
        for (const zf of z.fields) {
          next.set(`${r.log_date}|${r.period}|${zf.field}`, formatVal(r[zf.field] as number | null))
        }
      }
      if (r.period === 1) next.set(`${r.log_date}|1|note`, r.note ?? '')
    }
    return next
  }

  const measureRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef({ headerH: 0, theadH: 0, fillerH: 33 })

  useEffect(() => { setSummary(null) }, [setSummary])

  // Mount this report's print actions on the FDA sub-tab line (h-10).
  useEffect(() => {
    setActions(
      <>
        <Button size="lg" variant="elevated" className="h-10" disabled={loading} onClick={() => setBlankRender(true)}>
          <FileText className="size-4" /> ฟอร์มเปล่า
        </Button>
        <Button size="lg" variant="default" className="h-10" disabled={loading} onClick={() => setPrintOpen(true)}>
          <Printer className="size-4" /> พิมพ์
        </Button>
      </>
    )
    return () => setActions(null)
  }, [loading, setActions])

  useEffect(() => {
    (window.api.settings as any).getShop().then((data: Setting | null) => {
      setShopName(data?.shop_name ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.api.env.getSettings().then((s: EnvSettings) => setSettings(s)).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.env.getMonth({ year, month })
      .then((data: EnvLogRow[]) => {
        if (cancelled) return
        const map = new Map<string, EnvLogRow>()
        for (const r of data) map.set(`${r.log_date}|${r.period}`, r)
        setRowMap(map)
        setCellText(buildCellText(data))
        setLoading(false)
      })
      .catch((err: any) => {
        if (cancelled) return
        toast({ title: 'โหลดข้อมูลไม่สำเร็จ', description: String(err?.message ?? err), variant: 'destructive' })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [year, month, toast])

  const reserveOn = settings?.zone_reserve_enabled === 1
  const fridgeOn = settings?.zone_fridge_enabled === 1

  // Enabled zones, recomputed when a zone toggles.
  const zones = useMemo<Zone[]>(
    () => ALL_ZONES.filter(z => z.key === 'store' || (z.key === 'reserve' && reserveOn) || (z.key === 'fridge' && fridgeOn)),
    [reserveOn, fridgeOn],
  )
  // Flat list of (zone, field) pairs in render order — drives day-row cells and
  // the measure/blank tables. Inner group = period (handled by the renderer).
  const zoneFields = useMemo(() => zones.flatMap(z => z.fields), [zones])
  // Cells per period = sum of enabled-zone fields.
  const fieldsPerPeriod = zoneFields.length
  const totalCells = PERIODS.length * fieldsPerPeriod

  // Count of out-of-range cells across the whole (enabled) month grid.
  const outOfRangeCount = useMemo(() => {
    let n = 0
    for (const row of rowMap.values()) {
      for (const zf of zoneFields) {
        if (isOutOfRange(zf.kind, row[zf.field] as number | null, settings)) n++
      }
    }
    return n
  }, [rowMap, zoneFields, settings])

  const getRow = (day: number, period: number): EnvLogRow | undefined =>
    rowMap.get(`${dateKey(year, month, day)}|${period}`)

  // Persist ONE cell on blur. We forward the raw string; the handler maps blank/0/
  // NaN → NULL (never coerced here). After resolve we update rowMap (drives the
  // print/A4 view + out-of-range count) and reconcile THIS cell's display string
  // to the normalized stored value (NULL → '' → a typed 0/blank now shows blank
  // immediately, no reload). GUARD: only overwrite if the live cell text still
  // equals what was submitted on blur — if the user has typed something new
  // since, leave their text untouched.
  const saveCell = (day: number, period: number, field: EnvField | 'note', raw: string) => {
    const log_date = dateKey(year, month, day)
    const key = `${log_date}|${period}|${field}`
    window.api.env.saveCell({ log_date, period, field, value: raw })
      .then((row: EnvLogRow) => {
        setRowMap(prev => {
          const next = new Map(prev)
          next.set(`${log_date}|${period}`, row)
          return next
        })
        const normalized = field === 'note'
          ? (row.note ?? '')
          : formatVal(row[field] as number | null)
        setCellText(prev => {
          if (prev.get(key) !== raw) return prev
          if (prev.get(key) === normalized) return prev
          const next = new Map(prev)
          next.set(key, normalized)
          return next
        })
      })
      .catch((err: any) => {
        toast({ title: 'บันทึกค่าไม่สำเร็จ', description: String(err?.message ?? err), variant: 'destructive' })
      })
  }

  const toggleZone = (zone: 'reserve' | 'fridge', on: boolean) => {
    if (!settings) return
    window.api.env.setZones({
      zone_reserve_enabled: zone === 'reserve' ? (on ? 1 : 0) : settings.zone_reserve_enabled,
      zone_fridge_enabled: zone === 'fridge' ? (on ? 1 : 0) : settings.zone_fridge_enabled,
    })
      .then((s: EnvSettings) => setSettings(s))
      .catch((err: any) => {
        toast({ title: 'บันทึกจุดวัดไม่สำเร็จ', description: String(err?.message ?? err), variant: 'destructive' })
      })
  }

  const runGenerate = () => {
    setGenBusy(true)
    window.api.env.generateMonth({ year, month, mode: genMode })
      .then((data: EnvLogRow[]) => {
        const map = new Map<string, EnvLogRow>()
        for (const r of data) map.set(`${r.log_date}|${r.period}`, r)
        setRowMap(map)
        setCellText(buildCellText(data))
        setGenOpen(false)
        toast({ title: 'เติมค่าเรียบร้อยแล้ว', variant: 'success' })
      })
      .catch((err: any) => {
        toast({ title: 'เติมค่าไม่สำเร็จ', description: String(err?.message ?? err), variant: 'destructive' })
      })
      .finally(() => setGenBusy(false))
  }

  // Empty ruled rows that fill one blank page to the bottom (from measured heights).
  const blankFillerCount = () => {
    const m = metricsRef.current
    const avail = A4_CONTENT_H - m.headerH - FOOTER_H - m.theadH - PACK_SAFETY
    return Math.max(1, Math.floor(avail / (m.fillerH || 33)))
  }

  useEffect(() => {
    if (!blankRender) return
    let cancelled = false
    ;(async () => {
      try {
        const ds = (await window.api.settings.getDocumentSettings()) as any
        const res = await printDomSheets({
          docSelector: '.a4-blank',
          pages: 'all',
          printerName: ds?.printer_name || '',
          copies: Math.max(1, Number(ds?.copies) || 1),
        })
        if (cancelled) return
        if (res.success) toast({ title: 'ส่งฟอร์มเปล่าไปยังเครื่องพิมพ์แล้ว', variant: 'success' })
        else if (res.error) toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'destructive' })
      } finally {
        if (!cancelled) setBlankRender(false)
      }
    })()
    return () => { cancelled = true }
  }, [blankRender, toast])

  // Measure real day-row/header heights from the hidden specimen, then greedily
  // pack the month's days into fixed-height A4 pages. Column count changes when a
  // zone toggles → row height changes → re-measure; hence the zone flags in deps.
  useLayoutEffect(() => {
    if (loading) return
    const root = measureRef.current
    if (!root) return
    const headerH = (root.querySelector('[data-m="header"]') as HTMLElement)?.offsetHeight ?? 0
    const theadH = (root.querySelector('[data-m="thead"]') as HTMLElement)?.offsetHeight ?? 0
    const fillerH = (root.querySelector('[data-m="filler"]') as HTMLElement)?.offsetHeight ?? 33
    metricsRef.current = { headerH, theadH, fillerH }
    const rowEls = Array.from(root.querySelectorAll('[data-m="row"]')) as HTMLElement[]
    const rowHs = rowEls.map(e => e.offsetHeight)

    const avail = A4_CONTENT_H - headerH - FOOTER_H - theadH - PACK_SAFETY
    const out: PageSlice[] = []
    let i = 0
    while (i < rowHs.length) {
      let used = 0
      const start = i
      while (i < rowHs.length && used + rowHs[i] <= avail) { used += rowHs[i]; i++ }
      if (i === start) { used += rowHs[i]; i++ }
      out.push({ start, end: i, filler: Math.max(0, Math.floor((avail - used) / fillerH)) })
    }
    if (out.length === 0) out.push({ start: 0, end: 0, filler: Math.max(0, Math.floor(avail / fillerH)) })
    setPages(out)
  }, [loading, numDays, shopName, reserveOn, fridgeOn])

  // ─── A4 atoms ─────────────────────────────────────────────────────────────

  const monthLabelTh = `${TH_MONTHS[month - 1]} ${year + 543}`

  const headerBlock = (
    <div data-m="header" className="relative pb-3">
      <h1 className="text-xl font-semibold text-center pt-1">บันทึกอุณหภูมิและความชื้น</h1>
      <div className="mt-2 text-center text-sm">
        <span className="inline-block min-w-[420px] border-b border-dotted border-foreground/60 pb-0.5">
          {shopName || ' '}
        </span>
        <div className="text-foreground-subtle mt-1">ประจำเดือน {monthLabelTh}</div>
      </div>
    </div>
  )

  // Column widths: date col + one slot per (period × enabled field) + note.
  const dateW = 8
  const noteW = 12
  const cellW = (100 - dateW - noteW) / Math.max(1, totalCells)

  const printColgroup = (
    <colgroup>
      <col style={{ width: `${dateW}%` }} />
      {PERIODS.map(p => zoneFields.map((zf, ci) => (
        <col key={`${p.value}-${zf.field}-${ci}`} style={{ width: `${cellW}%` }} />
      )))}
      <col style={{ width: `${noteW}%` }} />
    </colgroup>
  )

  // Print header band: row1 = วันที่/period(colSpan)/หมายเหตุ, row2 = zone labels,
  // row3 = unit symbols. Period is the outer group; zone repeats inside each.
  const printThead = (
    <thead data-m="thead">
      <tr>
        <th rowSpan={3} className="border border-foreground/80 px-1 py-1 text-sm font-semibold text-center align-middle bg-card">วันที่</th>
        {PERIODS.map(p => (
          <th key={p.value} colSpan={fieldsPerPeriod} className="border border-foreground/80 px-1 py-1 text-sm font-semibold text-center bg-card">{p.label}</th>
        ))}
        <th rowSpan={3} className="border border-foreground/80 px-1 py-1 text-sm font-semibold text-center align-middle bg-card">หมายเหตุ</th>
      </tr>
      <tr>
        {PERIODS.map(p => zones.map(z => (
          <th key={`${p.value}-${z.key}`} colSpan={z.fields.length} className="border border-foreground/80 px-1 py-0.5 text-xs font-semibold text-center bg-card whitespace-nowrap">
            {z.key === 'store' ? 'ร้าน' : z.key === 'reserve' ? 'สำรอง' : 'ตู้เย็น'}
          </th>
        )))}
      </tr>
      <tr>
        {PERIODS.map(p => zoneFields.map((zf, ci) => (
          <th key={`${p.value}-${zf.field}-${ci}`} className="border border-foreground/80 px-1 py-0.5 text-xs font-semibold text-center bg-card whitespace-nowrap">{zf.short}</th>
        )))}
      </tr>
    </thead>
  )

  const printDayRow = (day: number) => {
    // Notes are single-writer — only ever persisted to period 1.
    const note = getRow(day, 1)?.note ?? ''
    return (
      <tr key={day}>
        <td className="border border-foreground/80 px-1 py-1 text-center text-sm">{day}</td>
        {PERIODS.map(p => {
          const row = getRow(day, p.value)
          return zoneFields.map((zf, ci) => (
            <td key={`${p.value}-${zf.field}-${ci}`} className="border border-foreground/80 px-1 py-1 text-center text-sm">
              {formatVal((row?.[zf.field] as number | null) ?? null)}
            </td>
          ))
        })}
        <td className="border border-foreground/80 px-1 py-1 text-sm">{note}</td>
      </tr>
    )
  }

  const printFillerRow = (key: string | number) => (
    <tr key={key}>
      <td className="border border-foreground/80 px-1 py-1 h-7"></td>
      {Array.from({ length: totalCells }).map((_, j) => (
        <td key={j} className="border border-foreground/80 px-1 py-1"></td>
      ))}
      <td className="border border-foreground/80 px-1 py-1"></td>
    </tr>
  )

  const signatureBlock = (
    <div className="mt-4 flex items-end justify-around text-sm">
      <div className="text-center">
        <div className="border-b border-dotted border-foreground/60 min-w-[200px] pb-0.5">&nbsp;</div>
        <div className="mt-1 text-foreground-subtle">ผู้บันทึก</div>
      </div>
      <div className="text-center">
        <div className="border-b border-dotted border-foreground/60 min-w-[200px] pb-0.5">&nbsp;</div>
        <div className="mt-1 text-foreground-subtle">ผู้ตรวจสอบ</div>
      </div>
    </div>
  )

  // One A4 sheet: header + table (slice of days) + filler + signature (last page).
  const renderPage = (pg: PageSlice, pi: number) => (
    <A4Sheet key={pi} header={headerBlock} pageNo={pi + 1} pageCount={pages.length}>
      <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
        {printColgroup}
        {printThead}
        <tbody>
          {Array.from({ length: pg.end - pg.start }).map((_, idx) => printDayRow(pg.start + idx + 1))}
          {Array.from({ length: pg.filler }).map((_, i) => printFillerRow(`f-${i}`))}
        </tbody>
      </table>
      {pi === pages.length - 1 && signatureBlock}
    </A4Sheet>
  )

  // Blank ruled month (no data) — filled to the page bottom.
  const renderBlankSheet = (key?: number) => (
    <A4Sheet key={key} header={headerBlock} pageNo={1} pageCount={1}>
      <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
        {printColgroup}
        {printThead}
        <tbody>
          {Array.from({ length: blankFillerCount() }).map((_, i) => printFillerRow(`b-${i}`))}
        </tbody>
      </table>
      {signatureBlock}
    </A4Sheet>
  )

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        {/* Header bar (h-12); controls h-9. */}
        <div className="no-print px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Thermometer} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">บันทึกอุณหภูมิ–ความชื้น</h3>
            {outOfRangeCount > 0 && (
              <Badge variant="destructive-outline">ผิดเกณฑ์ {outOfRangeCount} ช่อง</Badge>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <MultiDatePicker
              mode={dateMode}
              from={dateFrom}
              to={dateTo}
              onChange={(m, f, t) => { setDateMode(m); setDateFrom(f); setDateTo(t) }}
              allowedModes={['month']}
              className="shrink-0"
            />

            <Button size="lg" variant="info-soft" className="h-9 shrink-0" disabled={loading} onClick={() => setGenOpen(true)}>
              <Wand2 className="size-4" /> เติมค่าที่ว่าง
            </Button>

            {/* จุดวัด popover — instant-effect zone toggles via setZones. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="lg" variant="elevated" className="h-9 shrink-0">
                  <MapPin className="size-4" /> จุดวัด
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <PopoverHeader className="mb-2">
                  <PopoverTitle>จุดวัดที่แสดง</PopoverTitle>
                </PopoverHeader>
                <div className="space-y-1">
                  <CheckRow
                    className="h-10 px-2 opacity-70"
                    label={<span>ภายในร้าน <span className="text-xs text-muted-foreground">(คงไว้เสมอ)</span></span>}
                    checked
                    disabled
                    onChange={() => {}}
                  />
                  <CheckRow
                    className="h-10 px-2"
                    label="พื้นที่เก็บสำรอง"
                    checked={reserveOn}
                    onChange={v => toggleZone('reserve', v)}
                  />
                  <CheckRow
                    className="h-10 px-2"
                    label="ตู้เย็น"
                    checked={fridgeOn}
                    onChange={v => toggleZone('fridge', v)}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Spreadsheet grid — table-fixed + w-[%] (data-entry EXCEPTION). */}
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด…</div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                {/* Row1: วันที่ / period (colSpan) / หมายเหตุ */}
                <TableRow>
                  <TableHead rowSpan={3} className="w-[7%] text-center align-middle">วันที่</TableHead>
                  {PERIODS.map(p => (
                    <TableHead key={p.value} colSpan={fieldsPerPeriod} className="text-center">{p.label}</TableHead>
                  ))}
                  <TableHead rowSpan={3} className="w-[14%] align-middle">หมายเหตุ</TableHead>
                </TableRow>
                {/* Row2: zone labels inside each period */}
                <TableRow>
                  {PERIODS.map(p => zones.map(z => (
                    <TableHead key={`${p.value}-${z.key}`} colSpan={z.fields.length} className="text-center text-xs">
                      {z.key === 'store' ? 'ร้าน' : z.key === 'reserve' ? 'สำรอง' : 'ตู้เย็น'}
                    </TableHead>
                  )))}
                </TableRow>
                {/* Row3: unit symbols */}
                <TableRow>
                  {PERIODS.map(p => zoneFields.map((zf, ci) => (
                    <TableHead key={`${p.value}-${zf.field}-${ci}`} style={{ width: `${cellW}%` }} className="text-center text-xs">
                      {zf.short}
                    </TableHead>
                  )))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: numDays }).map((_, di) => {
                  const day = di + 1
                  const noteKey = cellKey(day, 1, 'note')
                  return (
                    <TableRow key={day}>
                      <TableCell className="text-center text-foreground-subtle">{day}</TableCell>
                      {PERIODS.map(p => {
                        return zoneFields.map((zf, ci) => {
                          const key = cellKey(day, p.value, zf.field)
                          const text = cellText.get(key) ?? ''
                          // Out-of-range is recomputed from the live text — blank/0
                          // parses to null/0 → never flagged. Invalid = border only.
                          const parsed = text.trim() === '' ? null : parseFloat(text)
                          const bad = parsed != null && parsed !== 0 && !isNaN(parsed)
                            && isOutOfRange(zf.kind, parsed, settings)
                          return (
                            <TableCell key={`${p.value}-${zf.field}-${ci}`} className="p-0.5">
                              <Input
                                variant="filled"
                                value={text}
                                onChange={e => {
                                  const v = e.target.value
                                  setCellText(prev => {
                                    const next = new Map(prev)
                                    next.set(key, v)
                                    return next
                                  })
                                }}
                                onBlur={e => saveCell(day, p.value, zf.field, e.target.value)}
                                className={cn(
                                  'h-8 w-full min-w-12 mx-auto text-center px-1',
                                  bad && 'border border-destructive bg-destructive-soft',
                                )}
                              />
                            </TableCell>
                          )
                        })
                      })}
                      <TableCell className="p-0.5">
                        <Input
                          variant="filled"
                          value={cellText.get(noteKey) ?? ''}
                          onChange={e => {
                            const v = e.target.value
                            setCellText(prev => {
                              const next = new Map(prev)
                              next.set(noteKey, v)
                              return next
                            })
                          }}
                          onBlur={e => saveCell(day, 1, 'note', e.target.value)}
                          className="h-8 w-full text-sm px-1"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Status bar — month range + out-of-range summary. */}
        {!loading && (
          <div className="no-print px-4 h-12 shrink-0 flex items-center justify-between border-t border-border text-sm text-muted-foreground">
            <span>{formatDate(dateFrom)} – {formatDate(dateTo)}</span>
            <span>{outOfRangeCount > 0 ? `มีค่าผิดเกณฑ์ ${outOfRangeCount} ช่อง` : 'ค่าทั้งหมดอยู่ในเกณฑ์'}</span>
          </div>
        )}
      </div>

      {/* Generate confirm dialog — mode choice (fill-empty default / overwrite all). */}
      <Dialog open={genOpen} onOpenChange={(v) => { if (!genBusy) setGenOpen(v) }}>
        <DialogContent
          className="h-auto max-h-[80vh]"
          onKeyDown={(e) => {
            const t = e.target as HTMLElement
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && t.tagName !== 'BUTTON') {
              e.preventDefault(); runGenerate()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>เติมค่าอัตโนมัติ</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ระบบจะสร้างค่าอุณหภูมิ–ความชื้นที่สมจริงและอยู่ในเกณฑ์ GPP ให้ทั้งเดือน {monthLabelTh}
              {' '}(ไม่เกินวันปัจจุบัน) — ค่าที่เติมเป็นค่าประมาณ ไม่ใช่ค่าที่วัดจริง
            </p>
            <div className="grid grid-cols-2 gap-3">
              <ChoiceCard
                title="เฉพาะช่องที่ว่าง"
                desc="เติมเฉพาะช่องที่ยังไม่ได้บันทึก ค่าจริงที่กรอกไว้จะไม่ถูกแก้"
                selected={genMode === 'fill-empty'}
                onClick={() => setGenMode('fill-empty')}
              />
              <ChoiceCard
                title="ทั้งเดือน (ทับของเดิม)"
                desc="สร้างค่าใหม่ทุกช่อง รวมถึงค่าจริงที่บันทึกไว้แล้ว"
                selected={genMode === 'all'}
                onClick={() => setGenMode('all')}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" onClick={() => setGenOpen(false)} disabled={genBusy}>ยกเลิก</Button>
            <Button variant="default" onClick={runGenerate} disabled={genBusy}>
              <Wand2 className="size-4" /> {genBusy ? 'กำลังเติม...' : 'เติมค่า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print preview + settings modal (shared shell). */}
      <ReportPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title="พิมพ์บันทึกอุณหภูมิ–ความชื้น"
        pageCount={pages.length || 1}
        renderPreview={(i) => (pages[i] ? renderPage(pages[i], i) : renderBlankSheet())}
        renderFullDoc={() => (pages.length ? pages.map(renderPage) : renderBlankSheet())}
      />

      {/* Hidden BLANK form — one ruled page (no data) mounted only while printing it. */}
      {blankRender && (
        <div className="a4-blank" aria-hidden style={{ position: 'absolute', left: -100000, top: 0 }}>
          {renderBlankSheet()}
        </div>
      )}

      {/* Hidden specimen — measured for exact day-row/header heights (off-screen). */}
      <div
        ref={measureRef}
        aria-hidden
        className="a4-measure invisible pointer-events-none"
        style={{ position: 'absolute', left: -10000, top: 0, width: A4_CONTENT_W, fontFamily: "'Sarabun Print', sans-serif" }}
      >
        {headerBlock}
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          {printColgroup}
          {printThead}
          <tbody>
            {Array.from({ length: numDays }).map((_, di) => (
              <tr key={di} data-m="row">
                <td className="border border-foreground/80 px-1 py-1 text-center text-sm">{di + 1}</td>
                {Array.from({ length: totalCells }).map((_, j) => (
                  <td key={j} className="border border-foreground/80 px-1 py-1 text-center text-sm">28</td>
                ))}
                <td className="border border-foreground/80 px-1 py-1 text-sm"></td>
              </tr>
            ))}
            <tr data-m="filler">
              <td className="border border-foreground/80 px-1 py-1 h-7"></td>
              {Array.from({ length: totalCells }).map((_, j) => (
                <td key={j} className="border border-foreground/80 px-1 py-1"></td>
              ))}
              <td className="border border-foreground/80 px-1 py-1"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
