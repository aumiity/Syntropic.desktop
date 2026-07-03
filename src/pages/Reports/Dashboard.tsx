import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import dayjs from 'dayjs'
import { useToast } from '@/components/ui/toast'
import {
  MultiDatePicker, defaultMultiDateFor, allowedModesFor, type MultiDateMode,
} from '@/components/ui/multi-date-picker'
import { useCan } from '@/hooks/useCan'
import { MetricStrip, SectionCard, type MetricStripItem } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { TintIcon } from '@/components/ui/tint-icon'
import { TopListCard, type TopListCardItem } from '@/components/ui/top-list-card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { DivergingTrendChart, type DivergingMode } from '@/components/ui/charts/diverging-trend-chart'
import { DonutChart } from '@/components/ui/charts/donut-chart'
import { type TrendDatum } from '@/components/ui/charts/trend-chart'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { delta } from '@/lib/delta'
import { trendOf, compareLabelForMode, prevWindowForMode, granularityForMode } from '@/lib/finance-panel'
import {
  Coins, TrendingUp, Truck, BellRing, Wallet, LineChart as LineChartIcon,
  ShoppingCart, Trophy, UserCircle, PackageMinus, PackageX, Clock, Hourglass,
  ChevronLeft, ChevronRight, ArrowLeftRight, Maximize2, RefreshCw,
} from 'lucide-react'
import type { ReportsOutletContext } from './index'

// Dashboard — the app's single command-center: 6 KPIs (MetricStrip) → diverging
// trend + sales-status → top lists + purchase-status → suppliers/staff/expenses
// → alert tiles that filter a standard detail table. One MultiDatePicker drives
// every metric (the expense-breakdown card keeps its own period). No new
// backend — every figure is read from the existing reports/products IPC.

// ── Types (subset of the shapes we consume) ────────────────────────────────
interface FinanceWindow {
  sales_net: number
  sales_cost: number
  sales_profit: number
  sales_discount: number
  sale_count: number
  selling_days: number
  purchase_total: number
  purchase_cash: number
  purchase_credit: number
  purchase_count: number
  expense_total: number
}
interface FinanceSummary extends FinanceWindow {
  payable_total: number
  payable_count: number
  previous: (FinanceWindow & { date_from: string; date_to: string }) | null
}
interface SalesStats {
  counts: { all: number; retail: number; wholesale: number; rx: number; return: number; voided: number }
}
interface PurchaseHistSummary {
  count: number
  cash_count: number
  credit_count: number
  paid_count: number
  unpaid_count: number
  overdue_count: number
  cancelled_count: number
}
interface TopProductRow {
  product_id: number; trade_name: string; unit_name: string
  qty: number; revenue: number; profit: number
}
interface TopSupplierRow {
  supplier_id: number; supplier_name: string; receipt_count: number; total_amount: number
}
interface CashierRow {
  user_id: number; user_name: string; bill_count: number; total_amount: number; profit: number
}
interface ExpenseRow { category_id: number | null; category_name: string | null; amount: number }

// Alert row shapes (per selectedAlert).
interface NegRow { product_code: string; trade_name: string; unit_name: string; available_stock: number }
interface LowRow { code: string; trade_name: string; unit_name: string; stock_qty: number; reorder_point: number }
interface ExpRow { lot_number: string; trade_name: string; unit_name: string; qty_on_hand: number; expiry_date: string; days_remaining: number }
interface DeadRow { trade_name: string; unit_name: string; qty_on_hand: number; cost_value: number | null; last_sold_at: string | null }

const EMPTY_FIN: FinanceSummary = {
  sales_net: 0, sales_cost: 0, sales_profit: 0, sales_discount: 0, sale_count: 0, selling_days: 0,
  purchase_total: 0, purchase_cash: 0, purchase_credit: 0, purchase_count: 0, expense_total: 0,
  payable_total: 0, payable_count: 0, previous: null,
}
const EMPTY_STATS: SalesStats = { counts: { all: 0, retail: 0, wholesale: 0, rx: 0, return: 0, voided: 0 } }
const EMPTY_PUR: PurchaseHistSummary = { count: 0, cash_count: 0, credit_count: 0, paid_count: 0, unpaid_count: 0, overdue_count: 0, cancelled_count: 0 }

// Dashboard shows money as a BARE number (no ฿ symbol — operator's choice).
// `baht()` = headline figures (KPI strip, top-lists, totals). `money()` appends
// the "บาท" unit for the detail key-value rows inside the sales/purchase cards.
const baht = (v: number) => formatCurrency(v)
const money = (v: number) => `${formatCurrency(v)} บาท`

// Alert tone — soft fill + matching foreground (icon/title/count/chevron inherit
// via currentColor). Tokens only.
const ALERT_TONE: Record<'destructive' | 'warning' | 'amber' | 'info', string> = {
  destructive: 'bg-destructive-soft text-destructive',
  warning:     'bg-warning-soft text-warning-soft-foreground',
  amber:       'bg-amber-soft text-amber-strong',
  info:        'bg-info-soft text-info-soft-foreground',
}

// The expense card carries its OWN period (decoupled from the page picker).
type ExpenseMode = 'this_month' | 'last_month' | 'this_year'
interface ExpenseWindow { from: string; to: string; prevFrom: string; prevTo: string; compareLabel: string }
function expenseWindow(mode: ExpenseMode): ExpenseWindow {
  const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')
  const now = dayjs()
  if (mode === 'last_month') {
    const m = now.subtract(1, 'month'); const p = now.subtract(2, 'month')
    return { from: fmt(m.startOf('month')), to: fmt(m.endOf('month')), prevFrom: fmt(p.startOf('month')), prevTo: fmt(p.endOf('month')), compareLabel: 'เทียบกับเดือนก่อนหน้า' }
  }
  if (mode === 'this_year') {
    return { from: fmt(now.startOf('year')), to: fmt(now), prevFrom: fmt(now.subtract(1, 'year').startOf('year')), prevTo: fmt(now.subtract(1, 'year')), compareLabel: 'เทียบกับปีที่แล้ว' }
  }
  return { from: fmt(now.startOf('month')), to: fmt(now), prevFrom: fmt(now.subtract(1, 'month').startOf('month')), prevTo: fmt(now.subtract(1, 'month')), compareLabel: 'เทียบกับเดือนที่แล้ว' }
}
const EXPENSE_MODE_LABEL: Record<ExpenseMode, string> = {
  this_month: 'เดือนนี้', last_month: 'เดือนที่แล้ว', this_year: 'ปีนี้',
}

// Best-seller card — sortable by sales value or unit count.
type TopSortBy = 'revenue' | 'qty'
const TOP_SORT_LABEL: Record<TopSortBy, string> = { revenue: 'ตามยอดขาย', qty: 'ตามจำนวนชิ้น' }

// Alert categories — tile + detail-table metadata.
type AlertKey = 'neg' | 'low' | 'exp' | 'dead'
const ALERT_META: Record<AlertKey, { title: string; icon: React.ComponentType<{ className?: string }>; route: string }> = {
  neg:  { title: 'สต็อกติดลบ',          icon: PackageMinus, route: '/manage/negative-stock' },
  low:  { title: 'ต่ำกว่าจุดสั่งซื้อ',    icon: PackageX,     route: '/manage/low-stock' },
  exp:  { title: 'ใกล้หมดอายุ 30 วัน',  icon: Clock,        route: '/manage/expiry' },
  dead: { title: 'ค้างเกิน 6 เดือน',     icon: Hourglass,    route: '/manage/dead-stock' },
}
const ALERT_PAGE_SIZE = 8

// ── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setToolbar } = useOutletContext<ReportsOutletContext>()

  const isAdmin = useCan('report.finance') !== 'off'
  const initial = defaultMultiDateFor(isAdmin)
  const [mode, setMode] = useState<MultiDateMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

  const [topSortBy, setTopSortBy] = useState<TopSortBy>('revenue')
  const [profitMode, setProfitMode] = useState<'baht' | 'pct'>('baht')
  const [chartMode, setChartMode] = useState<DivergingMode>('all')
  // Shared hover key for the status-breakdown bars/legends (sales + purchase use
  // disjoint segment keys, so one state can't cross-highlight the wrong card).
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null)

  const [fin, setFin] = useState<FinanceSummary>(EMPTY_FIN)
  const [stats, setStats] = useState<SalesStats>(EMPTY_STATS)
  const [purSummary, setPurSummary] = useState<PurchaseHistSummary>(EMPTY_PUR)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [topRev, setTopRev] = useState<TopProductRow[]>([])
  const [topPro, setTopPro] = useState<TopProductRow[]>([])
  const [suppliers, setSuppliers] = useState<TopSupplierRow[]>([])
  const [cashiers, setCashiers] = useState<CashierRow[]>([])
  const [loading, setLoading] = useState(false)

  // Alert tile counts (independent of the page picker).
  const [alertCounts, setAlertCounts] = useState<Record<AlertKey, number>>({ neg: 0, low: 0, exp: 0, dead: 0 })
  const [selectedAlert, setSelectedAlert] = useState<AlertKey>('neg')
  const [alertRows, setAlertRows] = useState<any[]>([])
  const [alertPage, setAlertPage] = useState(1)
  const [alertLoading, setAlertLoading] = useState(false)

  // Expense breakdown card — own period.
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [prevExpenseTotal, setPrevExpenseTotal] = useState(0)
  const [expenseMode, setExpenseMode] = useState<ExpenseMode>('this_month')
  const [expLoading, setExpLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = window.api.reports as any
      const args = { date_from: dateFrom, date_to: dateTo }
      const [f, ss, tr, hist, rev, pro, sup, csh, negC, lowR, expC, deadC] = await Promise.all([
        r.financeSummary({ ...args, with_compare: true, ...prevWindowForMode(mode, dateFrom, dateTo) }),
        r.salesStats(args),
        r.salesPurchaseTrend({ ...args, granularity: granularityForMode(mode) }),
        window.api.purchase.history({ ...args, limit: 1 }),
        r.topProducts({ ...args, by: topSortBy, limit: 5 }),
        r.topProducts({ ...args, by: profitMode === 'pct' ? 'margin' : 'profit', limit: 5 }),
        r.topSuppliers({ ...args, limit: 5 }),
        r.cashierLeaderboard({ ...args, limit: 5 }),
        window.api.negativeStock.count(),
        window.api.products.lowStock({}),
        r.expiringLots({ count_only: true }),
        r.inactiveCounts(),
      ])
      setFin(f ?? EMPTY_FIN)
      setStats(ss ?? EMPTY_STATS)
      setTrend(tr ?? [])
      setPurSummary(((hist as any)?.summary ?? EMPTY_PUR) as PurchaseHistSummary)
      setTopRev(rev ?? [])
      setTopPro(pro ?? [])
      setSuppliers(sup ?? [])
      setCashiers(csh ?? [])
      setAlertCounts({
        neg: (negC as number) ?? 0,
        low: ((lowR as any)?.count ?? 0) as number,
        exp: ((expC as any)?.counts?.d30 ?? 0) as number,
        dead: ((deadC as any)?.m6 ?? 0) as number,
      })
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, mode, topSortBy, profitMode, toast])

  const handlePeriodChange = useCallback((m: MultiDateMode, f: string, t: string) => {
    setMode(m); setDateFrom(f); setDateTo(t)
  }, [])

  useEffect(() => {
    const tid = setTimeout(() => { load() }, 250)
    return () => clearTimeout(tid)
  }, [load])

  // Alert detail rows — refetch when the selected tile changes (not tied to the
  // page picker). All categories return a full list → client-side pagination.
  const loadAlertRows = useCallback(async () => {
    setAlertLoading(true)
    try {
      const r = window.api.reports as any
      let rows: any[] = []
      if (selectedAlert === 'neg') rows = (await window.api.negativeStock.list()) as any[]
      else if (selectedAlert === 'low') rows = (((await window.api.products.lowStock({})) as any)?.rows ?? []) as any[]
      else if (selectedAlert === 'exp') rows = (((await r.expiringLots({ filter: 30, limit: 50, page: 1 })) as any)?.rows ?? []) as any[]
      else rows = (await r.inactiveProducts({
        date_from: dayjs().subtract(6, 'month').format('YYYY-MM-DD'),
        date_to: dayjs().format('YYYY-MM-DD'),
        limit: 50,
      })) as any[]
      setAlertRows(rows ?? [])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดรายการแจ้งเตือนไม่สำเร็จ', 'error')
      setAlertRows([])
    } finally {
      setAlertLoading(false)
    }
  }, [selectedAlert, toast])

  useEffect(() => { loadAlertRows() }, [loadAlertRows])

  // Expense breakdown — own period; current window + comparison window for delta.
  const expWin = useMemo(() => expenseWindow(expenseMode), [expenseMode])
  const loadExpenses = useCallback(async () => {
    setExpLoading(true)
    try {
      const [cur, prev] = await Promise.all([
        window.api.expenses.list({ date_from: expWin.from, date_to: expWin.to, pageSize: 0 }),
        window.api.expenses.list({ date_from: expWin.prevFrom, date_to: expWin.prevTo, pageSize: 0 }),
      ])
      setExpenses(((cur as any)?.rows ?? []) as ExpenseRow[])
      setPrevExpenseTotal(((((prev as any)?.rows ?? []) as ExpenseRow[]).reduce((s, e) => s + (e.amount ?? 0), 0)))
    } catch (e: any) {
      toast(e?.message ?? 'โหลดค่าใช้จ่ายไม่สำเร็จ', 'error')
    } finally {
      setExpLoading(false)
    }
  }, [expWin, toast])
  useEffect(() => { loadExpenses() }, [loadExpenses])

  // Toolbar — period picker + manual refresh.
  useEffect(() => {
    setToolbar(
      <>
        <MultiDatePicker mode={mode} from={dateFrom} to={dateTo} onChange={handlePeriodChange} align="end" allowedModes={allowedModesFor(isAdmin)} size="lg" />
        <Button variant="elevated" size="lg" className="h-10 px-3" onClick={() => load()} disabled={loading} title="โหลดข้อมูลใหม่">
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> รีเฟรช
        </Button>
      </>,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, handlePeriodChange, setToolbar, load, loading, isAdmin])

  // ── Derived view models ──────────────────────────────────────────────────
  const compareLabel = compareLabelForMode(mode)
  const margin = fin.sales_net > 0 ? (fin.sales_profit / fin.sales_net) * 100 : 0

  const kpiItems: MetricStripItem[] = useMemo(() => {
    const tSales = trendOf(delta(fin.sales_net, fin.previous?.sales_net))
    const tCost = trendOf(delta(fin.sales_cost, fin.previous?.sales_cost, { invert: true }))
    const tProfit = trendOf(delta(fin.sales_profit, fin.previous?.sales_profit))
    const tPur = trendOf(delta(fin.purchase_total, fin.previous?.purchase_total, { invert: true }))
    const tExp = trendOf(delta(fin.expense_total, fin.previous?.expense_total, { invert: true }))
    return [
      { label: 'ยอดขาย', value: baht(fin.sales_net), icon: Coins, tint: 'primary', ...tSales, compare: tSales.delta ? compareLabel : undefined },
      { label: 'ต้นทุน', value: baht(fin.sales_cost), icon: Coins, tint: 'amber', ...tCost, compare: tCost.delta ? compareLabel : undefined },
      { label: 'กำไร', value: baht(fin.sales_profit), icon: TrendingUp, tint: 'success', valueClassName: fin.sales_profit >= 0 ? undefined : 'text-destructive', valueSuffix: fin.sales_net > 0 ? `${margin.toFixed(1)}%` : undefined, valueSuffixClassName: fin.sales_profit >= 0 ? 'text-success' : 'text-destructive', ...tProfit, compare: tProfit.delta ? compareLabel : undefined },
      { label: 'ยอดซื้อ', value: baht(fin.purchase_total), icon: Truck, tint: 'info-soft', ...tPur, compare: tPur.delta ? compareLabel : undefined },
    ]
  }, [fin, margin, compareLabel])

  const topItems: TopListCardItem[] = useMemo(() => topRev.map((p, i) => {
    const qtyStr = `${(p.qty ?? 0).toLocaleString()} ${p.unit_name ?? 'ชิ้น'}`
    const revStr = baht(p.revenue)
    return {
      rank: i + 1, label: p.trade_name, labelClassName: 'font-semibold',
      sub: topSortBy === 'qty' ? revStr : qtyStr,
      value: topSortBy === 'qty' ? qtyStr : revStr,
    }
  }), [topRev, topSortBy])

  const profitItems: TopListCardItem[] = useMemo(() => topPro.map((p, i) => {
    const isNeg = p.profit < 0
    const m = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
    return {
      rank: i + 1, label: p.trade_name, labelClassName: 'font-semibold',
      sub: `ยอดขาย ${baht(p.revenue)}`,
      value: profitMode === 'pct' ? `${m.toFixed(1)}%` : baht(p.profit),
      valueClassName: isNeg ? 'text-destructive' : 'text-success',
    }
  }), [topPro, profitMode])

  const supplierItems: TopListCardItem[] = useMemo(() => suppliers.map((s, i) => ({
    rank: i + 1, label: s.supplier_name, sub: `${s.receipt_count.toLocaleString()} ใบ`, value: baht(s.total_amount),
  })), [suppliers])

  const staffItems: TopListCardItem[] = useMemo(() => cashiers.map((c, i) => ({
    rank: i + 1, label: c.user_name, sub: `${c.bill_count.toLocaleString()} บิล · กำไร ${baht(c.profit)}`, value: baht(c.total_amount),
  })), [cashiers])

  // Expense breakdown — group by category, sort desc, keep share for the gauge.
  const expenseBreakdown = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const e of expenses) {
      const key = e.category_name ?? 'ไม่ระบุหมวด'
      byCat.set(key, (byCat.get(key) ?? 0) + (e.amount ?? 0))
    }
    const rows = [...byCat.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) }
  }, [expenses])
  const dExpense = delta(expenseBreakdown.total, prevExpenseTotal, { invert: true })

  // Sales status segments (counts) + purchase status segments.
  const c = stats.counts
  const salesSegments = useMemo(() => [
    { key: 'retail',    label: 'ปลีก',   count: c.retail,    color: 'hsl(var(--primary))' },
    { key: 'wholesale', label: 'ส่ง',    count: c.wholesale, color: 'hsl(var(--amber))' },
    { key: 'return',    label: 'คืน',    count: c.return,    color: 'hsl(var(--violet))' },
    { key: 'voided',    label: 'ยกเลิก', count: c.voided,    color: 'hsl(var(--destructive))' },
  ], [c.retail, c.wholesale, c.return, c.voided])

  const duenow = Math.max(0, purSummary.unpaid_count - purSummary.overdue_count)
  const purchaseSegments = useMemo(() => [
    { key: 'cash',      label: 'เงินสด',   count: purSummary.cash_count,      color: 'hsl(var(--info))' },
    { key: 'paid',      label: 'ชำระแล้ว', count: purSummary.paid_count,      color: 'hsl(var(--success))' },
    { key: 'duenow',    label: 'ค้างชำระ', count: duenow,                     color: 'hsl(var(--amber))' },
    { key: 'overdue',   label: 'เกินกำหนด', count: purSummary.overdue_count,  color: 'hsl(var(--violet))' },
    { key: 'cancelled', label: 'ยกเลิก',   count: purSummary.cancelled_count, color: 'hsl(var(--destructive))' },
  ], [purSummary, duenow])

  // Averages for the sales/purchase key-value blocks.
  const sd = fin.selling_days || 0
  const salesRows = [
    // Headline totals — so the การขาย card reads on its own, independent of the
    // top KPI strip (which mixes sales + purchase). กำไร shows margin% in the
    // right-most unit column, mirroring the KPI card's valueSuffix.
    { label: 'ยอดขายทั้งหมด', value: money(fin.sales_net) },
    { label: 'ต้นทุน', value: money(fin.sales_cost) },
    { label: 'กำไร', value: money(fin.sales_profit), unit: fin.sales_net > 0 ? `${margin.toFixed(1)}%` : undefined },
    // Averages
    { label: 'จำนวนวันที่ขาย', value: `${sd.toLocaleString()} วัน` },
    { label: 'บิลเฉลี่ยต่อวัน', value: `${(sd ? fin.sale_count / sd : 0).toFixed(1)} บิล` },
    { label: 'ยอดขายเฉลี่ย', value: money(fin.sale_count ? fin.sales_net / fin.sale_count : 0), unit: 'ต่อบิล' },
    { label: '', value: money(sd ? fin.sales_net / sd : 0), unit: 'ต่อวัน' },
    { label: 'กำไรเฉลี่ย', value: money(fin.sale_count ? fin.sales_profit / fin.sale_count : 0), unit: 'ต่อบิล' },
    { label: '', value: money(sd ? fin.sales_profit / sd : 0), unit: 'ต่อวัน' },
    { label: 'ส่วนลดรวม', value: money(fin.sales_discount) },
  ]
  const purchaseRows = [
    { label: 'เงินสด', value: money(fin.purchase_cash) },
    { label: 'เครดิต', value: money(fin.purchase_credit) },
    { label: 'เฉลี่ยต่อบิล', value: money(fin.purchase_count ? fin.purchase_total / fin.purchase_count : 0) },
    { label: 'ค้างชำระ (รวมทุกช่วง)', value: money(fin.payable_total) },
  ]

  const alertTiles = useMemo(() => ([
    { key: 'neg'  as AlertKey, icon: PackageMinus, unit: 'รายการ', tone: 'destructive' as const },
    { key: 'low'  as AlertKey, icon: PackageX,     unit: 'รายการ', tone: 'warning' as const },
    { key: 'exp'  as AlertKey, icon: Clock,        unit: 'ล็อต',   tone: 'amber' as const },
    { key: 'dead' as AlertKey, icon: Hourglass,    unit: 'รายการ', tone: 'info' as const },
  ]), [])
  const alertTotal = useMemo(() => Object.values(alertCounts).reduce((s, n) => s + n, 0), [alertCounts])

  // Paginated alert detail rows (client slice).
  const alertTotalRows = alertRows.length
  const alertStart = (alertPage - 1) * ALERT_PAGE_SIZE
  const alertSlice = alertRows.slice(alertStart, alertStart + ALERT_PAGE_SIZE)
  const alertLastPage = Math.max(1, Math.ceil(alertTotalRows / ALERT_PAGE_SIZE))
  const meta = ALERT_META[selectedAlert]

  return (
    <div className="flex flex-col gap-4">
      {/* 1 — KPI strip */}
      {loading ? stripSkeleton() : <MetricStrip items={kpiItems} />}

      {/* 2 — Diverging trend + sales status */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
        <SectionCard
          icon={LineChartIcon}
          title="แนวโน้ม"
          tint="neutral"
          className="flex flex-col"
          right={
            <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as DivergingMode)}>
              <TabsList variant="segmented">
                <TabsTrigger value="all" className="text-sm px-3">รวม</TabsTrigger>
                <TabsTrigger value="sales" className="text-sm px-3">ขาย</TabsTrigger>
                <TabsTrigger value="purchase" className="text-sm px-3">ซื้อ</TabsTrigger>
                <TabsTrigger value="profit" className="text-sm px-3">กำไร</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          {chartLegend(chartMode)}
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : trend.length === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <LineChartIcon className="size-10 mb-2 opacity-30" />
              ไม่มีข้อมูลในช่วงเวลานี้
            </div>
          ) : (
            <DivergingTrendChart data={trend} granularity={granularityForMode(mode)} height={300} mode={chartMode} />
          )}
        </SectionCard>

        {loading
          ? <SectionCard icon={ShoppingCart} title="การขาย" tint="primary"><div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div></SectionCard>
          : statusBreakdownCard({
              icon: ShoppingCart, title: 'การขาย', subtitle: `${c.all.toLocaleString()} บิล`, tint: 'primary',
              segments: salesSegments, rows: salesRows, hovered: hoveredStatus, onHover: setHoveredStatus,
            })}
      </div>

      {/* 3 — Top products + purchase status */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <SectionCard
          icon={Trophy} title="สินค้าขายดี" tint="primary"
          right={
            <Button size="lg" variant="elevated" className="h-9 w-9 p-0" onClick={() => setTopSortBy(m => m === 'revenue' ? 'qty' : 'revenue')} title={`สลับเกณฑ์เรียง (${TOP_SORT_LABEL[topSortBy]})`}>
              <ArrowLeftRight />
            </Button>
          }
        >
          {loading
            ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            : <TopListCard items={topItems} maxHeight={0} emptyText="ยังไม่มีการขายในช่วงนี้" />}
        </SectionCard>

        <SectionCard
          icon={TrendingUp} title="กำไรสูงสุด" tint="success"
          right={
            <Button size="lg" variant="elevated" className="h-9 w-9 p-0" onClick={() => setProfitMode(m => m === 'baht' ? 'pct' : 'baht')} title={`สลับการแสดงกำไร (${profitMode === 'baht' ? 'บาท' : '%'})`}>
              <ArrowLeftRight />
            </Button>
          }
        >
          {loading
            ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            : <TopListCard items={profitItems} maxHeight={0} emptyText="ยังไม่มีรายการขายในช่วงนี้" />}
        </SectionCard>

        {loading
          ? <SectionCard icon={Truck} title="การซื้อ" tint="info-soft"><div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div></SectionCard>
          : statusBreakdownCard({
              icon: Truck, title: 'การซื้อ', subtitle: `${purSummary.count.toLocaleString()} บิล`, tint: 'info-soft',
              segments: purchaseSegments, rows: purchaseRows, hovered: hoveredStatus, onHover: setHoveredStatus,
              chart: 'donut',
            })}
      </div>

      {/* 4 — Suppliers + staff + expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <SectionCard icon={Truck} title="ผู้จัดจำหน่าย" tint="info-soft">
          {loading
            ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            : <TopListCard items={supplierItems} maxHeight={0} emptyText="ยังไม่มีการรับสินค้าในช่วงนี้" />}
        </SectionCard>

        <SectionCard icon={UserCircle} title="พนักงานขาย" tint="violet">
          {loading
            ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            : <TopListCard items={staffItems} maxHeight={0} emptyText="ยังไม่มีบิลในช่วงนี้" />}
        </SectionCard>

        <SectionCard
          icon={Wallet} title="ค่าใช้จ่ายอื่นๆ" tint="amber"
          right={
            <Select value={expenseMode} onValueChange={(v) => setExpenseMode(v as ExpenseMode)}>
              <SelectTrigger variant="elevated" className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent className="w-auto min-w-32">
                <SelectItem value="this_month" className="whitespace-nowrap">{EXPENSE_MODE_LABEL.this_month}</SelectItem>
                <SelectItem value="last_month" className="whitespace-nowrap">{EXPENSE_MODE_LABEL.last_month}</SelectItem>
                <SelectItem value="this_year" className="whitespace-nowrap">{EXPENSE_MODE_LABEL.this_year}</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <div>
            <div className="text-sm text-muted-foreground">รวมค่าใช้จ่าย</div>
            <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
              <span className="text-3xl font-bold text-foreground leading-none">{baht(expenseBreakdown.total)}</span>
              {dExpense && (
                <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${dExpense.cls}`}>
                  {dExpense.icon && <dExpense.icon className="size-4" />}{dExpense.sub}
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">{expWin.compareLabel}</span>
            </div>
          </div>
          {expLoading ? (
            <div className="h-[232px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : expenseBreakdown.rows.length === 0 ? (
            <div className="h-[232px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <Wallet className="size-10 mb-2 opacity-30" />
              ไม่มีค่าใช้จ่ายในช่วงนี้
            </div>
          ) : (
            <ul className="space-y-3 overflow-y-auto scrollbar-thin pr-1" style={{ maxHeight: 232 }}>
              {expenseBreakdown.rows.map(r => {
                const sharePct = expenseBreakdown.total > 0 ? (r.amount / expenseBreakdown.total) * 100 : 0
                return (
                  <li key={r.name} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-foreground truncate">{r.name}</span>
                      <div className="flex items-baseline gap-3 shrink-0">
                        <span className="font-semibold text-foreground">{baht(r.amount)}</span>
                        <span className="text-xs text-muted-foreground w-12 text-right">{sharePct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet to-info" style={{ width: `${sharePct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* 5 — Alert tiles + standard detail table */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.4fr] gap-4 items-stretch">
        <SectionCard
          icon={BellRing} title="แจ้งเตือน" tint="destructive"
          right={loading ? null : <Badge variant="neutral-outline">{alertTotal > 0 ? `${alertTotal.toLocaleString()} รายการ` : 'ปกติ'}</Badge>}
        >
          {loading ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : (
            <div className="flex flex-col gap-2">
              {alertTiles.map(t => {
                const Icon = t.icon
                const sel = selectedAlert === t.key
                return (
                  <button
                    key={t.key} type="button"
                    onClick={() => { setSelectedAlert(t.key); setAlertPage(1) }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer ring-inset transition-all',
                      ALERT_TONE[t.tone],
                      sel ? 'ring-2 ring-current' : 'ring-0 hover:ring-2 hover:ring-current',
                    )}
                  >
                    <Icon className="size-7 shrink-0" />
                    <div className="flex-1 min-w-0 overflow-x-clip overflow-y-visible">
                      <div className="text-sm font-semibold whitespace-nowrap">{ALERT_META[t.key].title}</div>
                      <div className="text-xs opacity-80 whitespace-nowrap">{alertCounts[t.key].toLocaleString()} {t.unit}</div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 opacity-60" />
                  </button>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Standard table-card — header + detail table + pagination footer */}
        <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex flex-col">
          <div className="h-12 px-4 flex items-center gap-3 shrink-0">
            <TintIcon icon={meta.icon} tint="neutral" size="sm" bordered />
            <h3 className="text-base font-semibold text-foreground">{meta.title}</h3>
            <Badge variant="neutral-outline">{alertTotalRows.toLocaleString()} รายการ</Badge>
            <div className="ml-auto">
              <Button variant="elevated" size="lg" className="px-2" onClick={() => navigate(meta.route)}>
                <Maximize2 /> เปิดตารางเต็ม
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
            {alertTable(selectedAlert, alertSlice, alertLoading)}
          </div>
          <div className="h-12 px-4 border-t border-border flex items-center justify-between shrink-0 text-sm text-muted-foreground">
            <span>
              {alertTotalRows === 0
                ? 'ไม่มีรายการ'
                : `แสดง ${alertStart + 1}-${Math.min(alertStart + ALERT_PAGE_SIZE, alertTotalRows)} จาก ${alertTotalRows.toLocaleString()} รายการ`}
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="elevated" size="lg" className="h-9 w-9 p-0" disabled={alertPage <= 1} onClick={() => setAlertPage(p => Math.max(1, p - 1))} title="ก่อนหน้า">
                <ChevronLeft />
              </Button>
              <Button variant="elevated" size="lg" className="h-9 w-9 p-0" disabled={alertPage >= alertLastPage} onClick={() => setAlertPage(p => Math.min(alertLastPage, p + 1))} title="ถัดไป">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Render-function helpers (lowercase, called inline — not components) ──────

// Loading placeholder for the KPI strip — mirrors MetricStrip's fixed height.
function stripSkeleton() {
  return (
    <div className="flex divide-x divide-border rounded-card border border-border bg-card shadow-card overflow-hidden h-[9.2rem]">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex-1 px-5 py-4 flex flex-col justify-between gap-3">
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          <div className="h-7 w-24 rounded bg-muted animate-pulse" />
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// Chart legend — swatches for whatever the current mode plots.
function chartLegend(mode: DivergingMode) {
  const items: { label: string; color: string }[] = []
  if (mode === 'all' || mode === 'sales') items.push({ label: 'ยอดขาย', color: 'hsl(var(--primary))' })
  if (mode === 'all' || mode === 'profit') items.push({ label: 'กำไร', color: 'hsl(var(--success))' })
  if (mode === 'all' || mode === 'purchase') items.push({ label: 'ยอดซื้อ', color: 'hsl(var(--info))' })
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(it => (
        <span key={it.label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

// Key-value grid — averages / supplementary figures, one per row (label left,
// figure right). A row is a single value (spans both right columns) or a pair
// of cells (per-bill / per-day) aligned vertically.
// A row is: a single value (spans both right columns), a pair of cells, or a
// value + a right-most `unit` word (e.g. figure … "ต่อบิล" pinned far right).
type KVRow = { label: string; value?: string; cells?: [string, string]; unit?: string }
function keyValueCard(rows: KVRow[]) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-2 text-sm">
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <span className="text-muted-foreground min-w-0 truncate">{r.label}</span>
          {r.cells ? (
            <>
              <span className="text-right font-semibold text-foreground">{r.cells[0]}</span>
              <span className="text-right font-semibold text-foreground">{r.cells[1]}</span>
            </>
          ) : r.unit ? (
            <>
              <span className="text-right font-semibold text-foreground">{r.value}</span>
              <span className="text-right text-muted-foreground whitespace-nowrap">{r.unit}</span>
            </>
          ) : (
            <span className="col-span-2 text-right font-semibold text-foreground">{r.value}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// Status breakdown card — header (tinted icon + title + count) over a proportion
// bar (touching segments, only non-zero) + a hover-linked legend, then an
// optional key-value block under a divider. Generic across sales + purchase.
interface StatusSeg { key: string; label: string; count: number; color: string }
function statusBreakdownCard(opts: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  tint: React.ComponentProps<typeof TintIcon>['tint']
  segments: StatusSeg[]
  rows?: KVRow[]
  hovered: string | null
  onHover: (v: string | null) => void
  /** 'bar' = horizontal proportion bar (default); 'donut' = SVG ring + vertical legend. */
  chart?: 'bar' | 'donut'
}) {
  const { icon: Icon, title, subtitle, tint, segments, rows, hovered, onHover, chart = 'bar' } = opts
  const total = segments.reduce((s, t) => s + t.count, 0)
  const sum = total || 1
  const segs = segments.filter(t => t.count > 0)
  const dim = (k: string) => (hovered != null && hovered !== k ? 'opacity-40' : 'opacity-100')
  const tip = (t: StatusSeg) => (
    <>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
        <span className="font-semibold text-popover-foreground">{t.label}</span>
        <span className="text-muted-foreground">{((t.count / sum) * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{t.count.toLocaleString()} บิล</div>
    </>
  )
  return (
    <SectionCard className="flex flex-col">
      <div className="flex items-center gap-3">
        <TintIcon icon={Icon} tint={tint} size="sm" bordered />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground leading-snug">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <TooltipProvider>
        {chart === 'donut' ? (
          <div className="flex items-center gap-4 py-1">
            <DonutChart
              segments={segments}
              hovered={hovered}
              onHover={onHover}
              centerLabel={total.toLocaleString()}
              centerSub="บิล"
              renderTip={t => tip(t)}
            />
            <div className="flex flex-1 flex-col gap-1.5 min-w-0">
              {segments.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onMouseEnter={() => onHover(t.key)}
                  onMouseLeave={() => onHover(null)}
                  className={cn('flex cursor-default items-center gap-2 text-sm transition-opacity', dim(t.key))}
                >
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="flex-1 text-left text-muted-foreground truncate">{t.label}</span>
                  <span className="font-semibold text-foreground">{t.count.toLocaleString()}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground">{((t.count / sum) * 100).toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
        <>
        <div className="flex h-3">
          {segs.map((t, i) => {
            const ends = i === 0 && i === segs.length - 1 ? 'rounded-full'
              : i === 0 ? 'rounded-l-full'
              : i === segs.length - 1 ? 'rounded-r-full'
              : ''
            return (
              <Tooltip key={t.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onMouseEnter={() => onHover(t.key)}
                    onMouseLeave={() => onHover(null)}
                    className={cn('h-full cursor-default border-0 p-0 transition-opacity', ends, dim(t.key))}
                    style={{ width: `${(t.count / sum) * 100}%`, minWidth: 6, backgroundColor: t.color }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{tip(t)}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map(t => (
            <Tooltip key={t.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onMouseEnter={() => onHover(t.key)}
                  onMouseLeave={() => onHover(null)}
                  className={cn('flex cursor-default items-center gap-1.5 text-sm transition-opacity', dim(t.key))}
                >
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-muted-foreground">{t.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{tip(t)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        </>
        )}
      </TooltipProvider>

      {rows && (
        <>
          <div className="border-t border-border" />
          {keyValueCard(rows)}
        </>
      )}
    </SectionCard>
  )
}

// Alert detail table — thead + tbody swap by the selected category. Each row's
// last cell is the right-aligned status figure. Empty/loading land in a spanning
// cell. Tokens only; dates via formatDate (DD/MM/YYYY).
function alertTable(key: AlertKey, rows: any[], loading: boolean) {
  const cfg: Record<AlertKey, { heads: string[]; render: (r: any) => React.ReactNode[] }> = {
    neg: {
      heads: ['รหัส', 'สินค้า', 'หน่วย', 'คงเหลือ'],
      render: (r: NegRow) => [
        <span className="text-xs text-muted-foreground whitespace-nowrap">{r.product_code}</span>,
        r.trade_name,
        r.unit_name,
        <span className={cn('font-semibold', r.available_stock < 0 && 'text-destructive')}>{(r.available_stock ?? 0).toLocaleString()}</span>,
      ],
    },
    low: {
      heads: ['รหัส', 'สินค้า', 'คงเหลือ', 'จุดสั่งซื้อ'],
      render: (r: LowRow) => [
        <span className="text-xs text-muted-foreground whitespace-nowrap">{r.code}</span>,
        r.trade_name,
        <span className="font-semibold text-warning-soft-foreground">{(r.stock_qty ?? 0).toLocaleString()}</span>,
        <span className="font-semibold">{(r.reorder_point ?? 0).toLocaleString()}</span>,
      ],
    },
    exp: {
      heads: ['ล็อต', 'สินค้า', 'จำนวน', 'วันหมดอายุ'],
      render: (r: ExpRow) => [
        <span className="text-xs text-muted-foreground whitespace-nowrap">{r.lot_number}</span>,
        r.trade_name,
        `${(r.qty_on_hand ?? 0).toLocaleString()} ${r.unit_name ?? ''}`.trim(),
        <span className="font-semibold text-warning-soft-foreground whitespace-nowrap">{formatDate(r.expiry_date)}</span>,
      ],
    },
    dead: {
      heads: ['สินค้า', 'หน่วย', 'มูลค่าคงค้าง', 'เคลื่อนไหวล่าสุด'],
      render: (r: DeadRow) => [
        r.trade_name,
        r.unit_name,
        <span className="font-semibold">{r.cost_value != null ? formatCurrency(r.cost_value) : '—'}</span>,
        <span className="font-semibold whitespace-nowrap">{r.last_sold_at ? formatDate(r.last_sold_at) : 'ไม่เคยขาย'}</span>,
      ],
    },
  }
  const { heads, render } = cfg[key]
  const lastIdx = heads.length - 1
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {heads.map((h, i) => (
            <TableHead key={h} className={cn('bg-muted', i === lastIdx && 'text-right')}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow><TableCell colSpan={heads.length} className="py-16 text-center text-sm text-muted-foreground">กำลังโหลด...</TableCell></TableRow>
        ) : rows.length === 0 ? (
          <TableRow><TableCell colSpan={heads.length} className="py-16 text-center text-sm text-muted-foreground">ไม่มีรายการในหมวดนี้</TableCell></TableRow>
        ) : (
          rows.map((r, ri) => {
            const cells = render(r)
            return (
              <TableRow key={ri} className="hover:bg-primary-soft/60 transition-colors">
                {cells.map((cell, ci) => (
                  <TableCell key={ci} className={cn(ci === lastIdx && 'text-right')}>{cell}</TableCell>
                ))}
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
