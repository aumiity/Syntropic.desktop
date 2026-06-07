import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts'
import dayjs from 'dayjs'
import { useToast } from '@/components/ui/toast'
import {
  PeriodPicker, defaultPeriodFor, allowedModesFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { usePermission } from '@/hooks/usePermission'
import { MetricCard, SectionCard } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { TintIcon } from '@/components/ui/tint-icon'
import { TopListCard, type TopListCardItem } from '@/components/ui/top-list-card'
import { Badge } from '@/components/ui/badge'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { type Granularity } from '@/components/ui/charts/granularity-tabs'
import { formatCurrency } from '@/lib/utils'
import { delta } from '@/lib/delta'
import {
  ShoppingBag, TrendingUp, ReceiptText, Users, PackageX,
  LineChart as LineChartIcon, PieChart as PieChartIcon, BellRing,
  Trophy, UserCircle, Wallet, PackageMinus, Clock, Hourglass, RefreshCw,
  Truck, ChevronRight, ArrowLeftRight,
} from 'lucide-react'
import type { ReportsOutletContext } from './index'

// Dashboard — the app's single analytics surface: a "modern SaaS analytics"
// layout (KPI row → trend + donut → alerts → bottom 4-card grid) wired to the
// reports IPC. No new backend: the "ยอดขายตามหมวด" donut is
// drawn from salesStats bill-type counts (retail/wholesale/rx), not a per-
// category revenue query. The global PeriodPicker drives every metric; the
// trend chart overrides locally with a trailing 7/30/90-day window.

// ── Types (subset of the Dashboard shapes we consume) ──────────────────────
interface FinanceWindow {
  sales_net: number
  sales_profit: number
  sale_count: number
}
interface FinanceSummary extends FinanceWindow {
  previous: (FinanceWindow & { date_from: string; date_to: string }) | null
}
interface SalesStats {
  counts: { all: number; retail: number; wholesale: number; rx: number; return: number; voided: number }
  new_customers: number
  unique_customers: number
  returning_customers: number
  avg_basket: number
  avg_item_kinds: number
  avg_units_per_bill: number
  return_rate: number
  void_rate: number
  discount_rate: number
  bundle_share: number
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
function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}
interface LowStockRow {
  product_id: number; trade_name: string; unit_name: string
  stock_qty: number; reorder_point: number; buy_more: number
}
interface ExpiryCounts { expired: number; d30: number; d90: number; d180: number }
interface ExpenseRow { category_id: number | null; category_name: string | null; amount: number }

const EMPTY_FIN: FinanceSummary = { sales_net: 0, sales_profit: 0, sale_count: 0, previous: null }
const EMPTY_STATS: SalesStats = {
  counts: { all: 0, retail: 0, wholesale: 0, rx: 0, return: 0, voided: 0 },
  new_customers: 0, unique_customers: 0, returning_customers: 0, avg_basket: 0,
  avg_item_kinds: 0, avg_units_per_bill: 0,
  return_rate: 0, void_rate: 0, discount_rate: 0, bundle_share: 0,
}

// Dashboard prefixes the ฿ symbol on money — this page only; the shared
// formatCurrency stays bare so other pages are unaffected.
const baht = (v: number) => `฿${formatCurrency(v)}`

// Alert-card soft tones — borderless soft fill + a matching foreground that the
// icon, heading, count, and chevron all inherit via currentColor. Tokens only.
const ALERT_TONE: Record<'destructive' | 'warning' | 'warm' | 'info', string> = {
  destructive: 'bg-destructive-soft text-destructive',
  warning:     'bg-warning-soft text-warning-soft-foreground',
  warm:        'bg-warm text-warm-foreground',
  info:        'bg-info-soft text-info-soft-foreground',
}

// Trailing-window granularity for the trend chart's local override.
function trendGranularity(days: number): Granularity {
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

// The expense card carries its OWN period (decoupled from the page picker). Each
// mode yields the current window + an equal-length comparison window for the
// delta, plus the Thai label that names what we're comparing against.
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
  // this_month — current month-to-date vs the same span of last month
  return { from: fmt(now.startOf('month')), to: fmt(now), prevFrom: fmt(now.subtract(1, 'month').startOf('month')), prevTo: fmt(now.subtract(1, 'month')), compareLabel: 'เทียบกับเดือนที่แล้ว' }
}

const EXPENSE_MODE_LABEL: Record<ExpenseMode, string> = {
  this_month: 'เดือนนี้',
  last_month: 'เดือนที่แล้ว',
  this_year: 'ปีนี้',
}

// Best-seller card — sortable by sales value or unit count via its own dropdown.
type TopSortBy = 'revenue' | 'qty'
const TOP_SORT_LABEL: Record<TopSortBy, string> = {
  revenue: 'ตามยอดขาย',
  qty: 'ตามจำนวนชิ้น',
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setToolbar } = useOutletContext<ReportsOutletContext>()

  const { isAdmin } = usePermission()
  const initial = defaultPeriodFor(isAdmin)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

  // Best-seller sort metric (the card's own dropdown).
  const [topSortBy, setTopSortBy] = useState<TopSortBy>('revenue')
  // Top-profit card — show the profit as baht or as margin % (display toggle).
  const [profitMode, setProfitMode] = useState<'baht' | 'pct'>('baht')

  // Trend chart overrides the page period with its own trailing window.
  const [trendDays, setTrendDays] = useState(30)
  const trendWin = useMemo(() => ({
    from: dayjs().subtract(trendDays - 1, 'day').format('YYYY-MM-DD'),
    to: dayjs().format('YYYY-MM-DD'),
    gran: trendGranularity(trendDays),
  }), [trendDays])

  const [fin, setFin] = useState<FinanceSummary>(EMPTY_FIN)
  const [stats, setStats] = useState<SalesStats>(EMPTY_STATS)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [topRev, setTopRev] = useState<TopProductRow[]>([])
  const [topPro, setTopPro] = useState<TopProductRow[]>([])
  const [suppliers, setSuppliers] = useState<TopSupplierRow[]>([])
  const [cashiers, setCashiers] = useState<CashierRow[]>([])
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [expiryCounts, setExpiryCounts] = useState<ExpiryCounts>({ expired: 0, d30: 0, d90: 0, d180: 0 })
  // Dead-stock now lives in /manage/dead-stock; the dashboard keeps only the
  // 6-month count for the alert tile.
  const [deadStockCount, setDeadStockCount] = useState(0)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [prevExpenseTotal, setPrevExpenseTotal] = useState(0)
  const [expenseMode, setExpenseMode] = useState<ExpenseMode>('this_month')
  const [expLoading, setExpLoading] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = window.api.reports as any
      const args = { date_from: dateFrom, date_to: dateTo }
      const [f, ss, tr, rev, pro, sup, csh, low, exp, deadCounts] = await Promise.all([
        r.financeSummary({ ...args, with_compare: true }),
        r.salesStats(args),
        r.salesPurchaseTrend({ date_from: trendWin.from, date_to: trendWin.to, granularity: trendWin.gran }),
        r.topProducts({ ...args, by: topSortBy, limit: 10 }),
        r.topProducts({ ...args, by: profitMode === 'pct' ? 'margin' : 'profit', limit: 10 }),
        r.topSuppliers({ ...args, limit: 8 }),
        r.cashierLeaderboard({ ...args, limit: 6 }),
        window.api.products.lowStock({}),
        r.expiringLots({ count_only: true }),
        r.inactiveCounts(),
      ])
      setFin(f ?? EMPTY_FIN)
      setStats(ss ?? EMPTY_STATS)
      setTrend(tr ?? [])
      setTopRev(rev ?? [])
      setTopPro(pro ?? [])
      setSuppliers(sup ?? [])
      setCashiers(csh ?? [])
      setLowStock(((low as any)?.rows ?? []) as LowStockRow[])
      setExpiryCounts(((exp as any)?.counts ?? { expired: 0, d30: 0, d90: 0, d180: 0 }) as ExpiryCounts)
      setDeadStockCount(((deadCounts as any)?.m6 ?? 0) as number)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, trendWin, topSortBy, profitMode, toast])

  const handlePeriodChange = useCallback((m: PeriodMode, f: string, t: string) => {
    setMode(m); setDateFrom(f); setDateTo(t)
  }, [])

  useEffect(() => {
    const tid = setTimeout(() => { load() }, 250)
    return () => clearTimeout(tid)
  }, [load])

  // Expenses load on their own period (the card's dropdown), independent of the
  // page picker — fetches the current window + its comparison window for the delta.
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
        <PeriodPicker mode={mode} from={dateFrom} to={dateTo} onChange={handlePeriodChange} align="end" allowedModes={allowedModesFor(isAdmin)} />
        <Button variant="elevated" size="lg" className="h-10 px-3" onClick={() => load()} disabled={loading} title="โหลดข้อมูลใหม่">
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> รีเฟรช
        </Button>
      </>,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, handlePeriodChange, setToolbar, load, loading, isAdmin])

  // ── Derived view models ──────────────────────────────────────────────────
  const dSales = delta(fin.sales_net, fin.previous?.sales_net)
  const dProfit = delta(fin.sales_profit, fin.previous?.sales_profit)
  const dOrders = delta(fin.sale_count, fin.previous?.sale_count)
  const lowStockCount = lowStock.length

  // Donut — sales mix by bill type (counts, not revenue). Tokens only.
  const donut = useMemo(() => {
    const c = stats.counts
    return [
      { name: 'ขายปลีก', value: c.retail, color: 'hsl(var(--primary))' },
      { name: 'ขายส่ง', value: c.wholesale, color: 'hsl(var(--info-soft-foreground))' },
      { name: 'ใบสั่งยา', value: c.rx, color: 'hsl(var(--warm-foreground))' },
    ].filter(d => d.value > 0)
  }, [stats])
  const donutTotal = useMemo(() => donut.reduce((s, d) => s + d.value, 0), [donut])

  const topItems: TopListCardItem[] = useMemo(() => topRev.map((p, i) => {
    const qtyStr = `${(p.qty ?? 0).toLocaleString()} ${p.unit_name ?? 'ชิ้น'}`
    const revStr = baht(p.revenue)
    return {
      rank: i + 1,
      label: p.trade_name,
      labelClassName: 'font-semibold',
      // Sort metric on the right; the other metric on the sub line under the name.
      sub: topSortBy === 'qty' ? revStr : qtyStr,
      value: topSortBy === 'qty' ? qtyStr : revStr,
    }
  }), [topRev, topSortBy])

  const profitItems: TopListCardItem[] = useMemo(() => topPro.map((p, i) => {
    const isNeg = p.profit < 0
    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
    return {
      rank: i + 1,
      label: p.trade_name,
      labelClassName: 'font-semibold',
      sub: `ยอดขาย ${baht(p.revenue)}`,
      // Single value = the ranked metric (฿ profit, or margin % when toggled).
      value: profitMode === 'pct' ? `${margin.toFixed(1)}%` : baht(p.profit),
      valueClassName: isNeg ? 'text-destructive' : 'text-success',
    }
  }), [topPro, profitMode])

  const supplierItems: TopListCardItem[] = useMemo(() => suppliers.map((s, i) => ({
    rank: i + 1,
    label: s.supplier_name,
    sub: `${s.receipt_count.toLocaleString()} ใบ`,
    value: baht(s.total_amount),
  })), [suppliers])

  const staffItems: TopListCardItem[] = useMemo(() => cashiers.map((c, i) => ({
    rank: i + 1,
    label: c.user_name,
    sub: `${c.bill_count.toLocaleString()} บิล · กำไร ${baht(c.profit)}`,
    value: baht(c.total_amount),
  })), [cashiers])

  // Expense breakdown — group by category, sort desc, keep a share for the bar.
  const expenseBreakdown = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const e of expenses) {
      const key = e.category_name ?? 'ไม่ระบุหมวด'
      byCat.set(key, (byCat.get(key) ?? 0) + (e.amount ?? 0))
    }
    const rows = [...byCat.entries()].map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) }
  }, [expenses])
  // Expense delta vs the comparison window — cost-style, so a rise reads red (invert).
  const dExpense = delta(expenseBreakdown.total, prevExpenseTotal, { invert: true })

  // Alerts — a health summary: one soft-color card per category with a heading
  // (line 1) + item COUNT (line 2), not a per-item dump. `tone` is a severity
  // gradient: destructive (red) = negative stock, warning (orange) = below
  // reorder, warm (yellow) = nearing expiry, info (blue) = long-idle stock.
  // Cards always render their tone, count 0 included.
  const alerts = useMemo(() => {
    const negCount = lowStock.filter(l => l.stock_qty < 0).length   // stock below zero
    const belowReorder = lowStock.length - negCount                 // ≥0 but under reorder point
    return [
      { key: 'neg',  icon: PackageMinus, title: 'สต็อกติดลบ',          unit: 'รายการ', count: negCount,         tone: 'destructive', onClick: () => navigate('/manage/negative-stock') },
      { key: 'low',  icon: PackageX,     title: 'ต่ำกว่าจุดสั่งซื้อ',    unit: 'รายการ', count: belowReorder,     tone: 'warning',     onClick: () => navigate('/manage/low-stock') },
      { key: 'near', icon: Clock,     title: 'ใกล้หมดอายุใน 30 วัน', unit: 'ล็อต',   count: expiryCounts.d30,  tone: 'warm',       onClick: () => navigate('/manage/expiry') },
      { key: 'dead', icon: Hourglass, title: 'คงค้างเกิน 6 เดือน', unit: 'รายการ', count: deadStockCount, tone: 'info', onClick: () => navigate('/manage/dead-stock') },
    ] as const
  }, [lowStock, expiryCounts.d30, deadStockCount, navigate])
  const alertTotal = useMemo(() => alerts.reduce((s, a) => s + a.count, 0), [alerts])

  // ── Render ─────────────────────────────────────────────────────────────────
  const rangeLabel = `${dayjs(dateFrom).format('D MMM BB')} - ${dayjs(dateTo).format('D MMM BB')}`

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* 1 — KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 p-0.5">
        <MetricCard
          label="ยอดขายรวม" value={baht(fin.sales_net)}
          sub={dSales?.sub ?? `${fin.sale_count.toLocaleString()} บิล`}
          subIcon={dSales?.icon ?? undefined} subClassName={dSales?.cls}
          subTitle={dSales ? 'เทียบช่วงก่อนหน้า' : undefined}
          icon={ShoppingBag} tint="primary"
        />
        <MetricCard
          label="กำไรสุทธิ" value={baht(fin.sales_profit)}
          sub={dProfit?.sub} subIcon={dProfit?.icon ?? undefined} subClassName={dProfit?.cls}
          subTitle={dProfit ? 'เทียบช่วงก่อนหน้า' : undefined}
          icon={TrendingUp} tint={fin.sales_profit >= 0 ? 'success' : 'destructive'}
        />
        <MetricCard
          label="จำนวนบิล" value={fin.sale_count.toLocaleString()}
          sub={dOrders?.sub} subIcon={dOrders?.icon ?? undefined} subClassName={dOrders?.cls}
          subTitle={dOrders ? 'เทียบช่วงก่อนหน้า' : undefined}
          icon={ReceiptText} tint="info-soft"
        />
        <MetricCard
          label="ลูกค้าใหม่" value={stats.new_customers.toLocaleString()}
          sub={`จาก ${stats.unique_customers.toLocaleString()} ราย`}
          icon={Users} tint="violet"
        />
        <MetricCard
          label="ต้องสั่งซื้อ" value={lowStockCount.toLocaleString()}
          sub={lowStockCount > 0 ? 'สินค้าต่ำกว่าจุดสั่งซื้อ' : 'สต็อกปกติ'}
          subClassName={lowStockCount > 0 ? 'text-warm-foreground' : undefined}
          icon={PackageX} tint={lowStockCount > 0 ? 'warm' : 'secondary'}
        />
      </div>

      {/* 2 — Trend (large) + Donut + Alerts, all on one row */}
      <div className="grid grid-cols-1 lg:grid-cols-9 gap-3">
        <SectionCard
          icon={LineChartIcon}
          title="แนวโน้มยอดขาย-กำไร"
          tint="primary"
          className="lg:col-span-4"
          right={
            <Tabs value={String(trendDays)} onValueChange={(v) => setTrendDays(Number(v))}>
              <TabsList variant="segmented" className="h-9">
                <TabsTrigger value="7" className="text-sm px-3">7 วัน</TabsTrigger>
                <TabsTrigger value="30" className="text-sm px-3">30 วัน</TabsTrigger>
                <TabsTrigger value="90" className="text-sm px-3">90 วัน</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : trend.length === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <LineChartIcon className="size-10 mb-2 opacity-30" />
              ไม่มีข้อมูลในช่วงเวลานี้
            </div>
          ) : (
            <TrendChart data={trend} granularity={trendWin.gran} height={300} />
          )}
        </SectionCard>

        <SectionCard
          icon={PieChartIcon}
          title="สัดส่วนการขาย"
          tint="info-soft"
          className="lg:col-span-3"
          right={<span className="text-xs text-muted-foreground">{rangeLabel}</span>}
        >
            {loading ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : donutTotal === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-sm text-muted-foreground">
                <PieChartIcon className="size-10 mb-2 opacity-30" />
                ยังไม่มีบิลในช่วงนี้
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <div className="relative aspect-square w-full max-w-[340px] mx-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius="64%" outerRadius="98%" paddingAngle={2} strokeWidth={0}>
                        {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null
                          const p = payload[0].payload as { name: string; value: number }
                          const pct = donutTotal > 0 ? ((p.value / donutTotal) * 100).toFixed(1) : '0'
                          return (
                            <div className="rounded-lg bg-foreground text-background shadow-xl text-sm px-3 py-1.5">
                              <span className="font-medium">{p.name}</span> · {p.value.toLocaleString()} บิล ({pct}%)
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold text-foreground leading-none">{donutTotal.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground mt-1">บิล</span>
                  </div>
                </div>
                <ul className="w-full flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                  {donut.map(d => {
                    const pct = donutTotal > 0 ? ((d.value / donutTotal) * 100).toFixed(0) : '0'
                    return (
                      <li key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="size-3.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-foreground">{d.name}</span>
                        <span className="font-semibold text-foreground">{pct}%</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
        </SectionCard>

        <SectionCard
          icon={BellRing}
          title="แจ้งเตือน"
          tint="destructive"
          fill
          className="lg:col-span-2"
            right={
              loading ? null : (
                <Badge variant="neutral-outline">
                  {alertTotal > 0 ? `${alertTotal.toLocaleString()} รายการ` : 'ปกติ'}
                </Badge>
              )
            }
          >
            {loading ? (
              <div className="h-full min-h-[180px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : (
              <div className="flex flex-col gap-2 h-full">
                {alerts.map(a => {
                  const Icon = a.icon
                  return (
                    <button key={a.key} type="button" onClick={a.onClick}
                      className={`w-full flex-1 flex items-center gap-4 rounded-xl px-3 py-2.5 text-left cursor-pointer ring-inset ring-0 hover:ring-2 hover:ring-current transition-all ${ALERT_TONE[a.tone]}`}>
                      <Icon className="size-8 shrink-0" />
                      <div className="flex-1 min-w-0 overflow-x-clip overflow-y-visible">
                        <div className="text-sm font-semibold whitespace-nowrap">{a.title}</div>
                        <div className="text-xs opacity-80 whitespace-nowrap">{a.count.toLocaleString()} {a.unit}</div>
                      </div>
                      <ChevronRight className="size-5 shrink-0 opacity-60" />
                    </button>
                  )
                })}
              </div>
            )}
        </SectionCard>
      </div>

      {/* 3 — Bottom 3-card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SectionCard
          icon={Trophy}
          title="สินค้าขายดี"
          tint="primary"
          right={
            <Button
              variant="elevated"
              className="h-9 w-9"
              onClick={() => setTopSortBy(m => m === 'revenue' ? 'qty' : 'revenue')}
              title={`สลับเกณฑ์เรียง (${TOP_SORT_LABEL[topSortBy]})`}
            >
              <ArrowLeftRight />
            </Button>
          }
        >
          <TopListCard items={topItems} height={300} emptyText="ยังไม่มีการขายในช่วงนี้" />
        </SectionCard>

        <SectionCard
          icon={TrendingUp}
          title="กำไรสูงสุด"
          tint="success"
          right={
            <Button
              variant="elevated"
              className="h-9 w-9"
              onClick={() => setProfitMode(m => m === 'baht' ? 'pct' : 'baht')}
              title={`สลับการแสดงกำไร (${profitMode === 'baht' ? 'บาท' : '%'})`}
            >
              <ArrowLeftRight />
            </Button>
          }
        >
          <TopListCard items={profitItems} height={300} emptyText="ยังไม่มีรายการขายในช่วงนี้" />
        </SectionCard>

        <SectionCard
          icon={Wallet}
          title="ค่าใช้จ่าย"
          tint="warm"
          right={
            <Select value={expenseMode} onValueChange={(v) => setExpenseMode(v as ExpenseMode)}>
              <SelectTrigger variant="elevated" className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-auto min-w-32">
                <SelectItem value="this_month" className="whitespace-nowrap">{EXPENSE_MODE_LABEL.this_month}</SelectItem>
                <SelectItem value="last_month" className="whitespace-nowrap">{EXPENSE_MODE_LABEL.last_month}</SelectItem>
                <SelectItem value="this_year" className="whitespace-nowrap">{EXPENSE_MODE_LABEL.this_year}</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          {/* Summary — big total + delta vs the comparison window */}
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
                // Gauge = share of the total (matches the % shown on the right).
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

      {/* 4 — Profit / supplier / customer rollups */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SectionCard icon={UserCircle} title="พนักงานขาย" tint="violet">
          <TopListCard items={staffItems} height={300} emptyText="ยังไม่มีบิลในช่วงนี้" />
        </SectionCard>

        <SectionCard icon={Truck} title="ผู้จัดจำหน่ายยอดซื้อสูงสุด" tint="info-soft">
          <TopListCard items={supplierItems} height={300} emptyText="ยังไม่มีการรับสินค้าในช่วงนี้" />
        </SectionCard>

        <SectionCard icon={Users} title="สรุปลูกค้า" tint="primary">
          {payRow('ลูกค้าทั้งหมด', `${stats.unique_customers.toLocaleString()} ราย`)}
          {payRow('ลูกค้าใหม่', `${stats.new_customers.toLocaleString()} ราย`)}
          {payRow('ลูกค้าเก่า', `${stats.returning_customers.toLocaleString()} ราย`)}
          {divider()}
          {payRow('ยอดเฉลี่ย/บิล', baht(stats.avg_basket))}
          {payRow('ชนิดสินค้า/บิล', `${stats.avg_item_kinds.toFixed(1)} รายการ`)}
          {payRow('จำนวน/บิล', `${stats.avg_units_per_bill.toFixed(1)} ชิ้น`)}
          {divider()}
          {payRow('อัตราคืนสินค้า', formatPercent(stats.return_rate))}
          {payRow('อัตรายกเลิก', formatPercent(stats.void_rate))}
          {payRow('ใช้ส่วนลด', formatPercent(stats.discount_rate))}
          {payRow('ส่วนแบ่งจากชุด (bundle)', formatPercent(stats.bundle_share))}
        </SectionCard>
      </div>
    </div>
  )
}

// ── Render-function helpers ───────────────────────────────────────────────
// Lowercase + called inline (NOT JSX), matching Dashboard.tsx's payRow pattern.
// Render helpers used like {payRow(...)} are not components in the React sense,
// so the "no local components in pages" rule doesn't apply.
function payRow(label: string, value: string) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

function divider() {
  return <div className="border-t border-border" />
}
