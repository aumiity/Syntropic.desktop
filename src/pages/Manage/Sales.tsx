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
import { ExportButton } from '@/components/ui/export-button'
import { useShopVat } from '@/hooks/useShopVat'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { ReceiptText, Ban, ShoppingCart, ShoppingBag, RotateCcw, Settings2, Filter, Check, MoreHorizontal, Eye, Printer, Percent, LineChart, Wallet, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MetricCard, SectionCard } from '@/components/ui/card'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { GranularityTabs, type Granularity } from '@/components/ui/charts/granularity-tabs'
import { delta } from '@/lib/delta'
import { AnimatePresence, motion } from 'framer-motion'

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
// subset interface. Mirrors reports:financeSummary's shape (sales_net/cost/
// profit/count + previous window for the delta).
interface FinanceWindow {
  sales_net: number
  sales_cost: number
  sales_profit: number
  sale_count: number
}
interface FinanceSummary extends FinanceWindow {
  previous: (FinanceWindow & { date_from: string; date_to: string }) | null
}

// Seed the trend granularity from the page's date mode. The user can override it
// via GranularityTabs (a deliberate manual choice — never clamped).
function granularityForMode(mode: MultiDateMode): Granularity {
  switch (mode) {
    case 'day': return 'hour'
    case 'month': return 'day'
    case 'year': return 'month'
    default: return 'day'
  }
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
  showFinancePanel: boolean
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
  showFinancePanel: false,
}

export default function ManageSalesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary } = useOutletContext<ManageOutletContext>()
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

  // Finance overview panel (admin-only). Open state persists; the trend's
  // granularity re-seeds from the date mode but stays a manual override.
  const showFinancePanel = prefs.showFinancePanel
  const [gran, setGran] = useState<Granularity>(() => granularityForMode(prefs.dateMode))
  const [finance, setFinance] = useState<FinanceSummary | null>(null)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [finLoading, setFinLoading] = useState(false)

  // Re-seed granularity when the date MODE changes (day↔month↔year↔custom) —
  // keyed on dateMode ONLY so editing a custom from/to doesn't wipe a manual
  // GranularityTabs choice.
  useEffect(() => {
    setGran(granularityForMode(dateMode))
  }, [dateMode])

  // Lazy admin fetch — only runs when an admin has the panel open. Both the
  // button and this fetch gate on isAdmin (the IPCs also requireAdmin).
  useEffect(() => {
    if (!isAdmin || !showFinancePanel) return
    let cancelled = false
    const r = window.api.reports as any
    setFinLoading(true)
    Promise.all([
      r.financeSummary({ date_from: dateFrom, date_to: dateTo, with_compare: true }),
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
  }, [isAdmin, showFinancePanel, dateFrom, dateTo, gran, toast])

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

  // Passive MetricCard snapshot of the q/date set. The status filter lives in
  // the filter strip's Filter popover (no onClick → ManageLayout renders
  // MetricCard instead of the clickable StatCard).
  useEffect(() => {
    setSlotSummary([
      { label: 'จำนวนบิล', value: summary.count_all.toLocaleString(),       icon: ReceiptText,  tint: 'primary',   sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ขายปลีก',   value: summary.count_retail.toLocaleString(),    icon: ShoppingCart, tint: 'success',   sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
      { label: 'ขายส่ง',    value: summary.count_wholesale.toLocaleString(), icon: ShoppingBag,  tint: 'info-soft', sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'รับคืน',    value: summary.count_return.toLocaleString(),    icon: RotateCcw,    tint: 'violet',    sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ยกเลิก',    value: summary.count_voided.toLocaleString(),    icon: Ban,          tint: 'destructive', sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    ])
  }, [summary, setSlotSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSlotSummary(null)
  }, [setSlotSummary])

  return (
    <>
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
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
          <MultiDatePicker
            mode={dateMode}
            from={dateFrom}
            to={dateTo}
            onChange={(m, f, t) => {
              setDateMode(m); setDateFrom(f); setDateTo(t)
              setPrefs({ dateMode: m, dateFrom: f, dateTo: t })
            }}
            className="shrink-0"
          />

          {/* Status filter popover — was previously the clickable summary cards */}
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

          {/* VAT filter — its own icon button beside the status filter
              (approach A). Hidden until the shop is VAT-registered. */}
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

          {isAdmin && (
            <ExportButton
              iconOnly
              tooltip="ส่งออก Excel"
              onExport={() => (window.api as any).exports.sales({
                q: q.trim() || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                status_filter: statusFilter,
                vat_filter: vatFilter,
              })}
            />
          )}

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

          {/* Finance overview toggle — admin only, icon-only to fit the h-12
              strip (a labelled button overflows at 1440px). */}
          {isAdmin && (
            <Button
              size="lg"
              variant={showFinancePanel ? 'default' : 'elevated'}
              className="h-9 w-9 p-0 shrink-0"
              tooltip="ภาพรวมการเงิน"
              onClick={() => setPrefs({ showFinancePanel: !showFinancePanel })}
            >
              <LineChart className="size-4" />
            </Button>
          )}
        </div>

        {/* Finance overview panel — between the filter strip and the table.
            Animated height (mirrors Manage/index.tsx). Admin only. */}
        {isAdmin && (
          <AnimatePresence initial={false}>
            {showFinancePanel && (
              <motion.div
                key="sales-finance"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="shrink-0 overflow-hidden"
              >
                <div className="p-4 border-b border-border flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TintIcon icon={LineChart} tint="primary" size="sm" />
                      <h4 className="text-base font-semibold text-foreground">ภาพรวมการเงิน</h4>
                    </div>
                    <GranularityTabs value={gran} onChange={setGran} />
                  </div>

                  {finLoading ? (
                    <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
                  ) : finance == null ? null : (() => {
                    const net = finance.sales_net
                    const profit = finance.sales_profit
                    const prev = finance.previous
                    const dNet = delta(net, prev?.sales_net)
                    const dProfit = delta(profit, prev?.sales_profit)
                    const margin = net > 0 ? `${((profit / net) * 100).toFixed(1)}%` : '—'
                    const empty = net === 0 && trend.length === 0
                    if (empty) {
                      return (
                        <div className="h-[180px] flex flex-col items-center justify-center text-sm text-muted-foreground">
                          <LineChart className="size-10 mb-2 opacity-30" />
                          ไม่มีข้อมูลการขายในช่วงนี้
                        </div>
                      )
                    }
                    return (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <MetricCard
                            label="ยอดขายสุทธิ" value={formatCurrency(net)}
                            sub={dNet?.sub} subIcon={dNet?.icon ?? undefined} subClassName={dNet?.cls}
                            subTitle={dNet ? 'เทียบช่วงก่อนหน้า' : undefined}
                            icon={Wallet} tint="primary"
                          />
                          <MetricCard
                            label="ต้นทุนขาย" value={formatCurrency(finance.sales_cost)}
                            icon={ShoppingCart} tint="amber"
                          />
                          <MetricCard
                            label="กำไรขั้นต้น" value={formatCurrency(profit)}
                            sub={dProfit?.sub} subIcon={dProfit?.icon ?? undefined} subClassName={dProfit?.cls}
                            subTitle={dProfit ? 'เทียบช่วงก่อนหน้า' : undefined}
                            icon={TrendingUp} tint="success"
                          />
                          <MetricCard
                            label="อัตรากำไร" value={margin}
                            icon={Percent} tint="info-soft"
                          />
                        </div>

                        <SectionCard icon={LineChart} title="แนวโน้มยอดขาย-กำไร" tint="primary">
                          <TrendChart data={trend} granularity={gran} height={180} />
                        </SectionCard>

                        <div className="rounded-lg border border-info-soft bg-info-soft/40 px-3 py-2 text-sm text-info-soft-foreground">
                          ภาพรวมการเงินของทั้งช่วงวันที่ที่เลือก — รวมทุกบิลในช่วง ไม่ขึ้นกับช่องค้นหา / ตัวกรองสถานะ / VAT ด้านล่าง (บิลที่ยกเลิกไม่ถูกนับเป็นยอดขาย)
                        </div>
                      </>
                    )
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
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
