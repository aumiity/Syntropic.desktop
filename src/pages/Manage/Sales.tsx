import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InitialAvatar } from '@/components/ui/avatar'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { MultiDatePicker, rangeForMultiMode, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { VoidBillDialog } from '@/components/dialogs/VoidBillDialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { SaleDetailDialog, type SaleDetail } from '@/components/dialogs/SaleDetailDialog'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { printSlip, resolveSlipMode } from '@/lib/receipt/print'
import { saleDetailToPrint } from '@/lib/receipt/normalizeSale'
import type { Sale } from '@/types'
import type { ManageOutletContext } from './index'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { usePermission } from '@/hooks/usePermission'
import { useShopVat } from '@/hooks/useShopVat'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { ReceiptText, Ban, ShoppingCart, ShoppingBag, RotateCcw, Settings2, Filter, Check, MoreHorizontal, Eye, Printer, Percent, LineChart, DollarSign, Coins, TrendingUp, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MetricStrip, SectionCard } from '@/components/ui/card'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { type Granularity } from '@/components/ui/charts/granularity-tabs'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { delta } from '@/lib/delta'
import dayjs from 'dayjs'

// Money lives in the table rows; the summary slot now carries only the count
// cards, which double as the status filter. rx (ใบสั่งยา) bills have no
// dedicated card — they're counted only in "จำนวนบิล" (all).
interface SaleSummary {
  count_all: number
  count_retail: number
  count_wholesale: number
  count_return: number
  count_voided: number
}

interface SaleRow extends Sale {
  customer_name?: string
  item_kinds?: number
  tax_locked?: number
}

const EMPTY_SUMMARY: SaleSummary = {
  count_all: 0, count_retail: 0, count_wholesale: 0, count_return: 0, count_voided: 0,
}

type StatusFilter = 'all' | 'retail' | 'wholesale' | 'return' | 'voided'
type VatFilter = 'all' | 'vat' | 'novat'

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}
// STATUS (soft + outline) family — matches success-outline / accent-outline /
// destructive-outline on the "สถานะ" column so all status pills share a tone.
const SALE_TYPE_VARIANTS: Record<string, any> = {
  retail: 'primary-outline', wholesale: 'accent-outline', rx: 'success-outline', return: 'violet-outline',
}

type SortField = 'invoice_no' | 'sold_at' | 'total_amount'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

// Finance panel — preload returns `any`, so cast the IPC payload through a local
// subset interface. Subset of reports:financeSummary's shape. The panel shows
// raw totals + averages (no period comparison), so `selling_days` (distinct days
// with a sale) and `sales_discount` are the fields beyond the basic four.
interface FinanceSummary {
  sales_net: number
  sales_cost: number
  sales_profit: number
  sales_discount: number
  sale_count: number
  selling_days: number
  // Previous equal-length window — drives the "vs ช่วงก่อน" trend line.
  previous: { sales_net: number; sales_cost: number; sales_profit: number } | null
}

// Turn delta()'s magnitude + direction into the MetricStrip trend fields: a
// signed string + color + the trailing up/down icon. null delta → no trend line.
function trendOf(d: ReturnType<typeof delta>): { delta?: string; deltaClassName?: string; deltaIcon?: React.ComponentType<{ className?: string }> } {
  if (!d) return {}
  const sign = d.icon === TrendingUp ? '+' : d.icon ? '-' : ''
  return { delta: `${sign}${d.sub}`, deltaClassName: d.cls, deltaIcon: d.icon ?? undefined }
}

// Comparison window + label adapt to the date-picker mode: day → yesterday,
// month → same dates last calendar month, year → last year, custom → the
// equal-length window before the range (backend default, no explicit prev).
function compareLabelForMode(mode: MultiDateMode): string {
  switch (mode) {
    case 'day': return 'vs เมื่อวาน'
    case 'month': return 'vs เดือนก่อน'
    case 'year': return 'vs ปีก่อน'
    default: return 'vs ช่วงก่อน'
  }
}
function prevWindowForMode(mode: MultiDateMode, from: string, to: string): { prev_from?: string; prev_to?: string } {
  const f = dayjs(from), t = dayjs(to)
  const fmt = (x: dayjs.Dayjs) => x.format('YYYY-MM-DD')
  switch (mode) {
    case 'day': return { prev_from: fmt(f.subtract(1, 'day')), prev_to: fmt(f.subtract(1, 'day')) }
    case 'month': return { prev_from: fmt(f.subtract(1, 'month')), prev_to: fmt(t.subtract(1, 'month')) }
    case 'year': return { prev_from: fmt(f.subtract(1, 'year')), prev_to: fmt(t.subtract(1, 'year')) }
    default: return {} // custom → backend equal-length window
  }
}

// Bucket granularity for the chart, derived from the page's date mode — always a
// unit SMALLER than the selected period so the period shows multiple bars (day →
// hours, month → days, year → months). The chart uses the page's own date range.
function granularityForMode(mode: MultiDateMode): Granularity {
  switch (mode) {
    case 'day': return 'hour'
    case 'month': return 'day'
    case 'year': return 'month'
    default: return 'day'
  }
}

// The chart has 3 modes — each plots one metric over the selected range. Color +
// value format per metric (counts are integers, money is currency).
type ChartMetric = 'sales' | 'profit' | 'bills'
const CHART_METRICS: Record<ChartMetric, {
  label: string
  bar: { key: string; name: string; color: string }
  valueFormat: 'currency' | 'int'
}> = {
  sales:  { label: 'ยอดขาย',   bar: { key: 'sales_net',    name: 'ยอดขาย',   color: 'hsl(var(--primary))' }, valueFormat: 'currency' },
  profit: { label: 'กำไร',     bar: { key: 'sales_profit', name: 'กำไร',     color: 'hsl(var(--success))' }, valueFormat: 'currency' },
  bills:  { label: 'จำนวนบิล', bar: { key: 'bill_count',   name: 'จำนวนบิล', color: 'hsl(var(--info))' },    valueFormat: 'int' },
}

interface SalesPrefs {
  pageSize: PageSize
  sort: SortState
  // Date is persisted as the picker mode (rolling for day/month/year — so
  // reopening tomorrow recomputes "today"/"this month"/...) plus absolute
  // from/to that are only consulted when mode === 'custom'.
  dateMode: MultiDateMode
  dateFrom: string
  dateTo: string
  showColDate: boolean
  showColCustomer: boolean
  showColItems: boolean
  showColTotal: boolean
  showColStatus: boolean
}

const SALES_DEFAULTS: SalesPrefs = {
  pageSize: 50,
  sort: { by: 'sold_at', dir: 'desc' },
  dateMode: 'day',
  dateFrom: new Date().toISOString().slice(0, 10),
  dateTo: new Date().toISOString().slice(0, 10),
  showColDate: true,
  showColCustomer: true,
  showColItems: true,
  showColTotal: true,
  showColStatus: true,
}

export default function ManageSalesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary, setTabActions } = useOutletContext<ManageOutletContext>()
  // VAT status column + filter only appear once the shop is VAT-registered —
  // matches the hide-when-NO-VAT rule used across the app.
  const { vatEnabled } = useShopVat()
  const { isAdmin } = usePermission()

  const [prefs, setPrefs] = usePagePrefs<SalesPrefs>('sales', SALES_DEFAULTS)

  // Date range: resolved fresh on every mount. day/month/year recompute from
  // today (rolling); custom uses the persisted absolute from/to.
  // statusFilter is NOT persisted — filters reset per session.
  const initialRange = prefs.dateMode === 'custom'
    ? { from: prefs.dateFrom, to: prefs.dateTo }
    : rangeForMultiMode(prefs.dateMode)

  const [q, setQ] = useState('')
  const [dateMode, setDateMode] = useState<MultiDateMode>(prefs.dateMode)
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [vatFilter, setVatFilter] = useState<VatFilter>('all')

  const sort = prefs.sort
  const setSort = (next: SortState | ((prev: SortState) => SortState)) => {
    setPrefs({ sort: typeof next === 'function' ? next(prefs.sort) : next })
  }
  const pageSize = prefs.pageSize
  const setPageSize = (next: PageSize) => setPrefs({ pageSize: next })

  const [rows, setRows] = useState<SaleRow[]>([])
  const [summary, setSummary] = useState<SaleSummary>(EMPTY_SUMMARY)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Finance overview (admin-only) — always shown, no toggle. Chart bucket size is
  // derived from the date mode (not user-selectable); chartMetric picks which of
  // the 3 series the bar chart shows.
  const gran = granularityForMode(dateMode)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('sales')
  // Hovered status in the breakdown card — links the proportion bar to its legend
  // so hovering either highlights that status in BOTH and fades the rest.
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null)
  const [finance, setFinance] = useState<FinanceSummary | null>(null)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [finLoading, setFinLoading] = useState(false)

  // Admin-only fetch — the panel is always shown for admins. Gated on isAdmin
  // (the IPCs also requireAdmin).
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    const r = window.api.reports as any
    setFinLoading(true)
    Promise.all([
      r.financeSummary({ date_from: dateFrom, date_to: dateTo, with_compare: true, ...prevWindowForMode(dateMode, dateFrom, dateTo) }),
      r.salesPurchaseTrend({ date_from: dateFrom, date_to: dateTo, granularity: gran }),
    ])
      .then(([f, tr]) => {
        if (cancelled) return
        setFinance((f ?? null) as FinanceSummary | null)
        setTrend((tr ?? []) as TrendDatum[])
      })
      .catch((e: any) => {
        if (cancelled) return
        toast({ title: 'โหลดภาพรวมการเงินไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
        setTrend([])
      })
      .finally(() => { if (!cancelled) setFinLoading(false) })
    return () => { cancelled = true }
  }, [isAdmin, dateMode, dateFrom, dateTo, gran, toast])

  // Detail modal — SaleDetailDialog owns the fetch lifecycle; we just pass invoice_no
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const [voidTarget, setVoidTarget] = useState<{ id: number; invoice_no: string } | null>(null)
  const overrideVoid = useManagerOverride()

  // Reprint a slip from history. Voided bills print stamped VOID; returns print
  // as a refund document; VAT bills (total_vat > 0) reprint as an abbreviated
  // tax invoice. Cancelled line items are filtered out by the normalizer.
  const reprintReceipt = async (s: SaleRow) => {
    try {
      const detail = await window.api.reports.getSaleByInvoice(s.invoice_no)
      if (!detail) { toast({ title: 'ไม่พบข้อมูลบิล', variant: 'error' }); return }
      const sale = saleDetailToPrint(detail)
      const mode = resolveSlipMode(sale)
      const res = await printSlip(sale, mode)
      if (!res.success) toast({ title: 'พิมพ์ใบเสร็จไม่สำเร็จ', description: res.error, variant: 'error' })
    } catch (e: any) {
      toast({ title: 'พิมพ์ใบเสร็จไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  // Column visibility (เลขบิล + จัดการ always shown)
  const showColDate = prefs.showColDate
  const showColCustomer = prefs.showColCustomer
  const showColItems = prefs.showColItems
  const showColTotal = prefs.showColTotal
  const showColStatus = prefs.showColStatus
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.reports.salesList({
        q: q.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sort.by,
        sort_dir: sort.dir.toUpperCase(),
        status_filter: statusFilter,
        vat_filter: vatFilter,
        page: p,
        limit: pageSize,
      }) as any
      setRows(res.rows)
      setSummary(res.summary ?? EMPTY_SUMMARY)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, dateFrom, dateTo, statusFilter, vatFilter, sort, pageSize])

  useEffect(() => {
    const t = setTimeout(() => { load(1) }, 300)
    return () => clearTimeout(t)
  }, [load])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'desc' })
  }

  const openDetail = (sale: SaleRow) => {
    setDetailInvoice(sale.invoice_no)
    setDetailOpen(true)
  }

  const handleVoid = async (reason: string) => {
    if (!voidTarget) return
    const target = voidTarget
    const wasOpenInDialog = detailInvoice === target.invoice_no
    // Admin-only action: admins run directly, staff get a manager-override prompt
    // (the credential is verified server-side in reports:voidSale).
    overrideVoid.run(
      async (ov) => { await window.api.reports.voidSale(target.id, reason, ov) },
      {
        title: 'ยกเลิกบิล',
        onDone: () => {
          toast({ title: 'ยกเลิกบิลสำเร็จ', variant: 'success' })
          setVoidTarget(null)
          if (wasOpenInDialog) setDetailOpen(false)
          // Void also cancels any negative-stock markers on this sale (see
          // electron/ipc/reports.ts voidSale), so refresh the sidebar badge.
          useNegativeStockBadge.getState().refresh()
          load(page)
        },
        onError: (e: any) => {
          toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
          setVoidTarget(null)
        },
      },
    )
  }

  // Staff keeps the ORIGINAL layout: the five count MetricCards in the parent
  // summary slot. Admin instead renders the in-page "การ์ดสถานะ" (soft-tone
  // tiles, beside the trend chart), so the parent slot is cleared for admins.
  useEffect(() => {
    if (isAdmin) { setSlotSummary(null); return }
    setSlotSummary([
      { label: 'จำนวนบิล', value: summary.count_all.toLocaleString(),       icon: ReceiptText,  tint: 'primary',   sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ขายปลีก',   value: summary.count_retail.toLocaleString(),    icon: ShoppingCart, tint: 'success',   sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
      { label: 'ขายส่ง',    value: summary.count_wholesale.toLocaleString(), icon: ShoppingBag,  tint: 'info-soft', sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'รับคืน',    value: summary.count_return.toLocaleString(),    icon: RotateCcw,    tint: 'violet',    sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ยกเลิก',    value: summary.count_voided.toLocaleString(),    icon: Ban,          tint: 'destructive', sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    ])
  }, [isAdmin, summary, setSlotSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSlotSummary(null)
  }, [setSlotSummary])

  // Status tiles — one per filter value (counts come from `summary`). Clicking a
  // tile sets the status filter (active = ring), mirroring the clickable alert
  // tiles on the Dashboard. Tone = soft fill + matching foreground via tokens.
  const statusTiles = [
    { value: 'all',       label: 'จำนวนบิล', icon: ReceiptText,  count: summary.count_all,       tone: 'bg-info-soft text-info-soft-foreground' },
    { value: 'retail',    label: 'ขายปลีก',   icon: ShoppingCart, count: summary.count_retail,    tone: 'bg-primary-soft text-primary' },
    { value: 'wholesale', label: 'ขายส่ง',    icon: ShoppingBag,  count: summary.count_wholesale, tone: 'bg-amber-soft text-amber-strong' },
    { value: 'return',    label: 'รับคืน',    icon: RotateCcw,    count: summary.count_return,    tone: 'bg-violet-soft text-violet-strong' },
    { value: 'voided',    label: 'ยกเลิก',    icon: Ban,          count: summary.count_voided,    tone: 'bg-destructive-soft text-destructive' },
  ] as const

  // The date range picker lives in the page's TabStrip row (aligned right beside
  // the main tabs), not the table top bar. Re-inject on every range change so the
  // injected node reflects the current mode/from/to; clear on unmount.
  useEffect(() => {
    setTabActions(
      <MultiDatePicker
        size="lg"
        mode={dateMode}
        from={dateFrom}
        to={dateTo}
        onChange={(m, f, t) => {
          setDateMode(m); setDateFrom(f); setDateTo(t)
          setPrefs({ dateMode: m, dateFrom: f, dateTo: t })
        }}
        className="shrink-0"
      />,
    )
  }, [dateMode, dateFrom, dateTo, setPrefs, setTabActions])

  useEffect(() => {
    return () => setTabActions(null)
  }, [setTabActions])

  // Admin: a natural-height stack (finance card above the history table). The
  // scroll lives in the parent Manage layout so the summary cards scroll too.
  // Staff keeps the original single full-height card.
  return (
    <>
      <div className={isAdmin
        ? 'flex flex-col gap-3'
        : 'flex flex-1 flex-col min-h-0'}>

        {/* Finance overview — admin only, always shown (no toggle). No wrapping
            card frame: the title row, metric cards, trend, and note stand on
            their own. The whole page scrolls; the history table below keeps its
            own fixed height (~10 rows) and scrolls internally. */}
        {isAdmin && (
          <div className="shrink-0 flex flex-col gap-3">
            {finLoading ? (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : finance == null ? null : (() => {
              const net = finance.sales_net
              const cost = finance.sales_cost
              const profit = finance.sales_profit
              const discount = finance.sales_discount
              const bills = finance.sale_count
              const days = finance.selling_days
              const marginPct = net > 0 ? (profit / net) * 100 : 0
              // Averages guard against divide-by-zero (no sales → 0, not NaN/∞).
              const perDay = (v: number) => (days > 0 ? v / days : 0)
              const perBill = (v: number) => (bills > 0 ? v / bills : 0)
              // No ฿ symbol — bare numbers read cleaner in the dense strip.
              const fmt = (v: number) => formatCurrency(v)
              // Trend vs the previous equal-length window (sub line 2). Cost is
              // cost-style (a rise reads red) → invert. Margin compares ratios.
              const prev = finance.previous
              const dNet = delta(net, prev?.sales_net)
              const dCost = delta(cost, prev?.sales_cost, { invert: true })
              const dProfit = delta(profit, prev?.sales_profit)
              const prevMarginPct = prev ? (prev.sales_net > 0 ? (prev.sales_profit / prev.sales_net) * 100 : 0) : null
              const dMargin = delta(marginPct, prevMarginPct)
              const cmp = compareLabelForMode(dateMode)
              return (
                <>
                  {/* 4 headline cards — label + value + a colored trend line vs the
                      previous window. The per-bill/per-day breakdown that used to sit
                      on a 3rd note line now lives in the "สรุปการขาย" card below. */}
                  <MetricStrip
                    className="h-[9.1rem]"
                    items={[
                      { label: 'ยอดขายรวม', value: fmt(net),    icon: DollarSign,   tint: 'primary', compare: cmp, ...trendOf(dNet) },
                      { label: 'ต้นทุนรวม', value: fmt(cost),   icon: Coins,        tint: 'amber',   compare: cmp, ...trendOf(dCost) },
                      { label: 'กำไรรวม',   value: fmt(profit), icon: TrendingUp,   tint: 'success', valueClassName: profit < 0 ? 'text-destructive' : undefined, compare: cmp, ...trendOf(dProfit) },
                      { label: 'กำไร %',    value: net > 0 ? `${marginPct.toFixed(1)}%` : '—', icon: Percent, tint: 'violet', valueClassName: profit < 0 ? 'text-destructive' : undefined, compare: cmp, ...trendOf(dMargin) },
                    ]}
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <SectionCard
                      icon={LineChart} title="แนวโน้ม" tint="neutral"
                      className="lg:col-span-2"
                      fill
                      right={
                        <Tabs value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
                          <TabsList variant="segmented">
                            {(Object.keys(CHART_METRICS) as ChartMetric[]).map(m => (
                              <TabsTrigger key={m} value={m} className="text-sm px-3">{CHART_METRICS[m].label}</TabsTrigger>
                            ))}
                          </TabsList>
                        </Tabs>
                      }
                    >
                      <div className="h-full min-h-[180px]">
                        <TrendChart
                          data={trend} granularity={gran} height="100%" variant="bar"
                          bars={[CHART_METRICS[chartMetric].bar]}
                          valueFormat={CHART_METRICS[chartMetric].valueFormat}
                        />
                      </div>
                    </SectionCard>
                    {/* Right column — status breakdown card stacked above the
                        sales-summary card (per-bill/per-day collapsed to one line each). */}
                    <div className="lg:col-span-1 flex flex-col gap-3">
                      {statusCard({ tiles: statusTiles, total: summary.count_all, hovered: hoveredStatus, onHover: setHoveredStatus })}
                      {summaryCard({
                        rows: [
                          { label: 'จำนวนวันที่ขาย', value: `${days.toLocaleString()} วัน` },
                          { label: 'ยอดขายเฉลี่ย',   value: `${fmt(perBill(net))}/บิล · ${fmt(perDay(net))}/วัน` },
                          { label: 'กำไรเฉลี่ย',     value: `${fmt(perBill(profit))}/บิล · ${fmt(perDay(profit))}/วัน` },
                          { label: 'ส่วนลดรวม',      value: fmt(discount) },
                        ],
                      })}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* History table card — admin: fixed height, scrolls internally; staff:
            fills the viewport (original behaviour). */}
        <div className={isAdmin
          ? 'shrink-0 bg-card rounded-card shadow-card border border-border overflow-hidden flex flex-col'
          : 'flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden'}>
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={ReceiptText} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ประวัติการขาย</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาเลขบิล, ชื่อลูกค้า..."
          />
          {/* Status filter popover — kept alongside the status-card tiles; both
              drive the same `statusFilter` state, so they stay in sync. */}
          {(() => {
            const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
              { value: 'all',       label: 'ทั้งหมด' },
              { value: 'retail',    label: 'ขายปลีก' },
              { value: 'wholesale', label: 'ขายส่ง' },
              { value: 'return',    label: 'รับคืน' },
              { value: 'voided',    label: 'ยกเลิก' },
            ]
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรองสถานะ">
                    <Filter className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1 gap-0">
                  <PopoverHeader className="px-2">
                    <PopoverTitle>สถานะ</PopoverTitle>
                  </PopoverHeader>
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setStatusFilter(o.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        statusFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', statusFilter === o.value ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 text-left">{o.label}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          })()}

          {/* VAT filter — its own icon button beside the status filter.
              Hidden until the shop is VAT-registered. */}
          {vatEnabled && (() => {
            const VAT_OPTIONS: { value: VatFilter; label: string }[] = [
              { value: 'all',   label: 'ทั้งหมด' },
              { value: 'vat',   label: 'มี VAT' },
              { value: 'novat', label: 'ไม่มี VAT' },
            ]
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรอง VAT">
                    <Percent className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1 gap-0">
                  <PopoverHeader className="px-2">
                    <PopoverTitle>VAT</PopoverTitle>
                  </PopoverHeader>
                  {VAT_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setVatFilter(o.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        vatFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', vatFilter === o.value ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 text-left">{o.label}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          })()}

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="จัดการตาราง">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>จัดการตาราง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColDate} onCheckedChange={v => setPrefs({ showColDate: v === true })} />
                <span className="text-sm">วันที่/เวลา</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColCustomer} onCheckedChange={v => setPrefs({ showColCustomer: v === true })} />
                <span className="text-sm">ลูกค้า</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColItems} onCheckedChange={v => setPrefs({ showColItems: v === true })} />
                <span className="text-sm">รายการ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColTotal} onCheckedChange={v => setPrefs({ showColTotal: v === true })} />
                <span className="text-sm">ยอดสุทธิ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColStatus} onCheckedChange={v => setPrefs({ showColStatus: v === true })} />
                <span className="text-sm">สถานะ</span>
              </label>
            </PopoverContent>
          </Popover>

        </div>

        <div className={isAdmin
          ? 'h-[34rem] [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card'
          : 'flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card'}>
          <Table>
            <TableHeader>
              <TableRow>
                {showColDate && <SortableTableHead field="sold_at" sort={sort} onToggle={toggleSort} className="min-w-24">เวลา</SortableTableHead>}
                <SortableTableHead field="invoice_no" sort={sort} onToggle={toggleSort} className="min-w-24">เลขบิล</SortableTableHead>
                {showColCustomer && <TableHead className="min-w-[180px]">ลูกค้า</TableHead>}
                {showColTotal && <SortableTableHead field="total_amount" sort={sort} onToggle={toggleSort} className="min-w-24">ยอดสุทธิ</SortableTableHead>}
                {showColStatus && <TableHead className="min-w-[140px]">สถานะ</TableHead>}
                <TableHead className="text-center min-w-14">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColDate ? 1 : 0) + (showColCustomer ? 1 : 0) + (showColTotal ? 1 : 0) + (showColStatus ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColDate ? 1 : 0) + (showColCustomer ? 1 : 0) + (showColTotal ? 1 : 0) + (showColStatus ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <ReceiptText className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : rows.map(s => {
                const isVoided = s.status === 'voided'
                return (
                <TableRow key={s.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  {showColDate && <TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.sold_at)}</TableCell>}
                  <TableCell className="text-sm">
                    <div className="text-foreground">{s.invoice_no}</div>
                    {showColItems && (
                      <div className="text-xs font-normal text-muted-foreground">
                        {(s.item_kinds ?? 0).toLocaleString()} รายการ
                      </div>
                    )}
                  </TableCell>
                  {showColCustomer && (
                    <TableCell className="text-sm max-w-[220px]">
                      {(() => {
                        const name = s.customer_name ?? s.customer_name_free ?? null
                        if (!name) return <span className="text-foreground-subtle">—</span>
                        return (
                          <div className="flex items-center gap-2 min-w-0">
                            <InitialAvatar name={name} size="sm" />
                            <span className="truncate" title={name}>{name}</span>
                          </div>
                        )
                      })()}
                    </TableCell>
                  )}
                  {showColTotal && (
                    <TableCell className="text-sm text-foreground">
                      {formatCurrency(s.total_amount)}
                    </TableCell>
                  )}
                  {showColStatus && (
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={SALE_TYPE_VARIANTS[s.sale_type] ?? 'secondary'}>
                          {SALE_TYPE_LABELS[s.sale_type] ?? s.sale_type}
                        </Badge>
                        {isVoided
                          ? <Badge variant="destructive-outline">ยกเลิก</Badge>
                          : <Badge variant="success-outline">สำเร็จ</Badge>}
                        {vatEnabled && (s.total_vat ?? 0) > 0 && <Badge variant="info-outline">VAT</Badge>}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex justify-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                            <MoreHorizontal />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                          <button type="button" onClick={() => openDetail(s)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                            <Eye className="size-4" /> ดูรายละเอียด
                          </button>
                          <button type="button" onClick={() => reprintReceipt(s)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                            <Printer className="size-4" /> พิมพ์ใบเสร็จ
                          </button>
                          {!isVoided && s.sale_type !== 'return' && (
                            s.tax_locked
                              // Locked → keep the item visible but muted; clicking
                              // explains why (no disabled+title — pointer-events-none
                              // kills hover, so the reason would never show).
                              ? <button type="button"
                                  onClick={() => toast({ title: 'ยกเลิกไม่ได้', description: 'บิลนี้ออกใบกำกับภาษีตัวจริงแล้ว', variant: 'error' })}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors">
                                  <Ban className="size-4" /> ยกเลิกบิล
                                </button>
                              : <button type="button" onClick={() => setVoidTarget({ id: s.id, invoice_no: s.invoice_no })}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                  <Ban className="size-4" /> ยกเลิกบิล
                                </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          {(() => {
            const size = pageSize === 'all' ? total : pageSize
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                  <SelectTrigger variant="elevated" className="h-9 min-w-20">
                    <SelectValue>{String(pageSize)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-28">
                    {[50, 100, 250, 500].map(opt => (
                      <SelectItem key={opt} value={String(opt)}>{String(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {loading
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
              </div>
            )
          })()}
          <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto" />
        </div>
        </div>
      </div>

      <SaleDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        invoiceNo={detailInvoice}
        onVoidRequest={(sale: SaleDetail) => {
          setVoidTarget({ id: sale.id, invoice_no: sale.invoice_no })
          setDetailOpen(false)
        }}
        onChanged={() => load(page)}
      />

      <VoidBillDialog
        target={voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoid}
      />
      {overrideVoid.dialog}
    </>
  )
}

// "สถานะการขาย" card — soft-tone tiles (Dashboard alert-card style) that double
// as the status filter (active = ring). `vertical` stacks the tiles and fills
// the card height (sits to the right of the trend chart); the default grid lays
// them out horizontally (staff top-of-page, no chart). Lowercase render helper
// called inline — not a component, so the "no local components" rule is moot.
interface StatusTile {
  value: StatusFilter
  label: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  tone: string
}

// "สรุปการขาย" card — a flat key–value list: each averaged/supplementary figure on
// its own row (description left, figure right). Fed pre-formatted rows so the helper
// stays presentational; these per-bill/per-day breakdowns used to ride a 3rd note
// line on the MetricStrip cells and were lifted out to declutter the strip.
function summaryCard(opts: {
  rows: { label: string; value: string }[]
  className?: string
}) {
  const { rows, className } = opts
  return (
    <SectionCard icon={ListChecks} title="สรุปการขาย" tint="neutral" className={cn('shrink-0', className)}>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-semibold text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// Status colors — match the table's status Badge hues (SALE_TYPE_VARIANTS):
// retail=primary, wholesale=accent, return=violet, voided=destructive.
const STATUS_COLOR: Record<string, string> = {
  retail: 'hsl(var(--primary))',
  wholesale: 'hsl(var(--accent))',
  return: 'hsl(var(--violet))',
  voided: 'hsl(var(--destructive))',
}

// "สถานะการขาย" card — a compact status breakdown (read-only, no filtering): a
// plain icon + title over the bill count, one proportion bar, the per-segment
// percentages spread beneath it, then a color legend. Status FILTERING lives in
// the history table's toolbar popover, so this card stays purely informational.
function statusCard(opts: {
  tiles: readonly StatusTile[]
  total: number
  hovered: string | null
  onHover: (v: string | null) => void
  className?: string
}) {
  const { tiles, total, hovered, onHover, className } = opts
  const parts = tiles.filter(t => t.value !== 'all')
  const sum = parts.reduce((s, t) => s + t.count, 0) || 1
  // Bar segments = only non-zero statuses (so gaps don't double up on empties).
  // Kept as its own list so the map knows first/last for end-only rounding.
  const segs = parts.filter(t => t.count > 0)
  // Shared highlight: when any status is hovered, the non-hovered ones fade — in
  // BOTH the bar and the legend, keyed off the same `hovered` value.
  const dim = (v: string) => (hovered != null && hovered !== v ? 'opacity-40' : 'opacity-100')
  // Two-line tooltip body (shared by bar + legend): color dot + label + share on
  // the first line, bill count on the second.
  const tip = (t: StatusTile) => (
    <>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[t.value] }} />
        <span className="font-semibold text-popover-foreground">{t.label}</span>
        <span className="text-muted-foreground">{((t.count / sum) * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{t.count.toLocaleString()} บิล</div>
    </>
  )
  return (
    <SectionCard className={cn('shrink-0', className)}>
      {/* Header — plain (neutral) icon box + title over a muted bill-count line */}
      <div className="flex items-center gap-3">
        <TintIcon icon={ShoppingCart} tint="neutral" size="sm" />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground leading-snug">สถานะการขาย</h3>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} บิลในช่วงนี้</p>
        </div>
      </div>

      {/* Bar + legend share one TooltipProvider and one `hovered` state: pointing
          at EITHER a bar segment or a legend label highlights that status in BOTH
          and fades the rest. Each item is a button (tooltip trigger) that sets the
          shared hover on enter/leave. Provider renders no DOM node, so SectionCard's
          space-y-3 spacing between the bar and legend is unaffected. */}
      <TooltipProvider>
        {/* Proportion bar — segments split by a gap; only the bar's two outer ends
            are rounded (first segment's left, last segment's right), inner edges
            square. Only non-zero statuses render. */}
        <div className="flex h-3 gap-1">
          {segs.map((t, i) => {
            const ends = i === 0 && i === segs.length - 1 ? 'rounded-full'
              : i === 0 ? 'rounded-l-full'
              : i === segs.length - 1 ? 'rounded-r-full'
              : ''
            return (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onMouseEnter={() => onHover(t.value)}
                  onMouseLeave={() => onHover(null)}
                  className={cn('h-full cursor-default border-0 p-0 transition-opacity', ends, dim(t.value))}
                  style={{ width: `${(t.count / sum) * 100}%`, minWidth: 6, backgroundColor: STATUS_COLOR[t.value] }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {tip(t)}
              </TooltipContent>
            </Tooltip>
            )
          })}
        </div>

        {/* Legend — color dot + label; hover highlights this status (and its bar
            segment) while fading the rest, and reveals the bill count + share. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {parts.map(t => (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onMouseEnter={() => onHover(t.value)}
                  onMouseLeave={() => onHover(null)}
                  className={cn('flex cursor-default items-center gap-1.5 text-sm transition-opacity', dim(t.value))}
                >
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[t.value] }} />
                  <span className="text-muted-foreground">{t.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {tip(t)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </SectionCard>
  )
}
