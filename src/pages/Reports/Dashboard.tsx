import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts'
import dayjs from 'dayjs'
import { useToast } from '@/components/ui/toast'
import {
  PeriodPicker, defaultPeriodFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { MetricCard, SectionCard } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableTableHead,
} from '@/components/ui/table'
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
  Trophy, UserCircle, Wallet, Boxes, Clock, AlertTriangle, Hourglass, RefreshCw,
  Truck, Box, Eye,
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
interface InactiveRow {
  product_id: number; trade_name: string; unit_name: string
  qty_on_hand: number; cost_value: number; last_sold_at: string | null
  avg_monthly_6m: number
}
type SortDir = 'asc' | 'desc'
type InactiveSortField = 'trade_name' | 'qty_on_hand' | 'cost_value' | 'avg_monthly_6m' | 'last_sold_at'

// Generic value comparator for client-side table sort. Nulls sort last; strings
// use Thai-aware localeCompare, numbers compare numerically.
function sortCmp(a: string | number | null, b: string | number | null, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
  return String(a).localeCompare(String(b), 'th') * mul
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

// Trailing-window granularity for the trend chart's local override.
function trendGranularity(days: number): Granularity {
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setToolbar } = useOutletContext<ReportsOutletContext>()

  const initial = defaultPeriodFor(true)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

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
  const [inactive, setInactive] = useState<InactiveRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(false)

  // Dead-stock — its own trailing window (last N months → today), decoupled
  // from the page period; client-side sortable like the other in-page tables.
  const [inactiveMonths, setInactiveMonths] = useState(6)
  const [inactiveSort, setInactiveSort] = useState<{ by: InactiveSortField; dir: SortDir }>({ by: 'cost_value', dir: 'desc' })
  const toggleInactiveSort = (f: InactiveSortField) =>
    setInactiveSort(s => s.by === f ? { by: f, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by: f, dir: 'asc' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = window.api.reports as any
      const args = { date_from: dateFrom, date_to: dateTo }
      // Dead-stock uses its own trailing window (last N months → today), like
      // the canonical dashboard — it isn't bound to the page period. The same
      // rows feed both the dead-stock table and the alert count.
      const inactiveFrom = dayjs().subtract(inactiveMonths, 'month').format('YYYY-MM-DD')
      const inactiveTo = dayjs().format('YYYY-MM-DD')
      const [f, ss, tr, rev, pro, sup, csh, low, exp, inact, expList] = await Promise.all([
        r.financeSummary({ ...args, with_compare: true }),
        r.salesStats(args),
        r.salesPurchaseTrend({ date_from: trendWin.from, date_to: trendWin.to, granularity: trendWin.gran }),
        r.topProducts({ ...args, by: 'revenue', limit: 8 }),
        r.topProducts({ ...args, by: 'profit', limit: 8 }),
        r.topSuppliers({ ...args, limit: 8 }),
        r.cashierLeaderboard({ ...args, limit: 6 }),
        window.api.products.lowStock({}),
        r.expiringLots({ count_only: true }),
        r.inactiveProducts({ date_from: inactiveFrom, date_to: inactiveTo, limit: 500 }),
        window.api.expenses.list({ date_from: dateFrom, date_to: dateTo, pageSize: 0 }),
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
      setInactive(((inact as any[]) ?? []) as InactiveRow[])
      setExpenses(((expList as any)?.rows ?? []) as ExpenseRow[])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, trendWin, inactiveMonths, toast])

  const handlePeriodChange = useCallback((m: PeriodMode, f: string, t: string) => {
    setMode(m); setDateFrom(f); setDateTo(t)
  }, [])

  useEffect(() => {
    const tid = setTimeout(() => { load() }, 250)
    return () => clearTimeout(tid)
  }, [load])

  // Toolbar — period picker + manual refresh.
  useEffect(() => {
    setToolbar(
      <>
        <PeriodPicker mode={mode} from={dateFrom} to={dateTo} onChange={handlePeriodChange} align="end" />
        <Button variant="elevated" size="lg" className="h-10 px-3" onClick={() => load()} disabled={loading} title="โหลดข้อมูลใหม่">
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> รีเฟรช
        </Button>
      </>,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, handlePeriodChange, setToolbar, load, loading])

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

  const topItems: TopListCardItem[] = useMemo(() => topRev.map((p, i) => ({
    rank: i + 1,
    label: p.trade_name,
    sub: `${(p.qty ?? 0).toLocaleString()} ${p.unit_name ?? 'ชิ้น'}`,
    value: formatCurrency(p.revenue),
    onClick: () => navigate(`/products/${p.product_id}/edit`),
  })), [topRev, navigate])

  const profitItems: TopListCardItem[] = useMemo(() => topPro.map((p, i) => {
    const isNeg = p.profit < 0
    return {
      rank: i + 1,
      label: p.trade_name,
      sub: `${(p.qty ?? 0).toLocaleString()} ${p.unit_name ?? 'ชิ้น'} · ขาย ${formatCurrency(p.revenue)}`,
      value: formatCurrency(p.profit),
      valueClassName: isNeg ? 'text-destructive' : 'text-success',
      onClick: () => navigate(`/products/${p.product_id}/edit`),
    }
  }), [topPro, navigate])

  const supplierItems: TopListCardItem[] = useMemo(() => suppliers.map((s, i) => ({
    rank: i + 1,
    label: s.supplier_name,
    sub: `${s.receipt_count.toLocaleString()} ใบ`,
    value: formatCurrency(s.total_amount),
  })), [suppliers])

  const sortedInactive = useMemo(
    () => [...inactive].sort((a, b) => sortCmp(a[inactiveSort.by], b[inactiveSort.by], inactiveSort.dir)),
    [inactive, inactiveSort],
  )
  const inactiveCostTotal = useMemo(
    () => inactive.reduce((s, r) => s + (r.cost_value ?? 0), 0),
    [inactive],
  )

  const staffItems: TopListCardItem[] = useMemo(() => cashiers.map((c, i) => ({
    rank: i + 1,
    label: c.user_name,
    sub: `${c.bill_count.toLocaleString()} บิล · กำไร ${formatCurrency(c.profit)}`,
    value: formatCurrency(c.total_amount),
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
    const max = rows.reduce((m, r) => Math.max(m, r.amount), 0)
    return { rows, max, total: rows.reduce((s, r) => s + r.amount, 0) }
  }, [expenses])

  const lowItems: TopListCardItem[] = useMemo(() => lowStock.slice(0, 30).map(r => {
    const out = r.stock_qty <= 0
    return {
      label: r.trade_name,
      sub: out ? 'หมดสต็อก' : `เหลือ ${r.stock_qty.toLocaleString()} (จุดสั่ง ${r.reorder_point.toLocaleString()})`,
      value: `+${(r.buy_more ?? 0).toLocaleString()} ${r.unit_name ?? ''}`.trim(),
      valueClassName: out ? 'text-destructive' : 'text-warm-foreground',
      onClick: () => navigate(`/products/${r.product_id}/edit`),
    }
  }), [lowStock, navigate])

  // Alerts — a health summary: one row per category with its item COUNT, not a
  // per-item dump. `danger` = solid problem (out / expired), else caution.
  const alerts = useMemo(() => {
    const outCount = lowStock.filter(l => l.stock_qty <= 0).length
    const lowCount = lowStock.length - outCount               // low but still in stock
    const nearExpiry = Math.max(0, expiryCounts.d30 - expiryCounts.expired) // ≤30d, not yet expired
    return [
      { key: 'out',     icon: PackageX,      label: 'หมดสต็อก',            count: outCount,             danger: true,  onClick: () => navigate('/manage/low-stock') },
      { key: 'low',     icon: Boxes,         label: 'ใกล้หมดสต็อก',        count: lowCount,             danger: false, onClick: () => navigate('/manage/low-stock') },
      { key: 'expired', icon: AlertTriangle, label: 'หมดอายุแล้ว',         count: expiryCounts.expired, danger: true,  onClick: () => navigate('/manage/expiry') },
      { key: 'near',    icon: Clock,         label: 'ใกล้หมดอายุ (≤30 วัน)', count: nearExpiry,         danger: false, onClick: () => navigate('/manage/expiry') },
      { key: 'dead',    icon: Hourglass,     label: `คงค้างนาน (${inactiveMonths} เดือน)`, count: inactive.length, danger: false, onClick: () => navigate('/reports') },
    ]
  }, [lowStock, expiryCounts, inactive.length, inactiveMonths, navigate])
  const alertTotal = useMemo(() => alerts.reduce((s, a) => s + a.count, 0), [alerts])

  // ── Render ─────────────────────────────────────────────────────────────────
  const rangeLabel = `${dayjs(dateFrom).format('D MMM BB')} - ${dayjs(dateTo).format('D MMM BB')}`

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* 1 — KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 p-0.5">
        <MetricCard
          label="ยอดขายรวม" value={formatCurrency(fin.sales_net)}
          sub={dSales?.sub ?? `${fin.sale_count.toLocaleString()} บิล`}
          subIcon={dSales?.icon ?? undefined} subClassName={dSales?.cls}
          subTitle={dSales ? 'เทียบช่วงก่อนหน้า' : undefined}
          icon={ShoppingBag} tint="primary"
        />
        <MetricCard
          label="กำไรสุทธิ" value={formatCurrency(fin.sales_profit)}
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <SectionCard
          icon={LineChartIcon}
          title="แนวโน้มยอดขาย-กำไร"
          tint="primary"
          className="lg:col-span-2"
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
          right={<span className="text-xs text-muted-foreground">{rangeLabel}</span>}
        >
            {loading ? (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : donutTotal === 0 ? (
              <div className="h-[180px] flex flex-col items-center justify-center text-sm text-muted-foreground">
                <PieChartIcon className="size-10 mb-2 opacity-30" />
                ยังไม่มีบิลในช่วงนี้
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative size-[150px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={48} outerRadius={70} paddingAngle={2} strokeWidth={0}>
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
                    <span className="text-2xl font-bold text-foreground leading-none">{donutTotal.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">บิล</span>
                  </div>
                </div>
                <ul className="flex-1 min-w-0 space-y-2">
                  {donut.map(d => {
                    const pct = donutTotal > 0 ? ((d.value / donutTotal) * 100).toFixed(0) : '0'
                    return (
                      <li key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="size-3 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-foreground truncate">{d.name}</span>
                        <span className="ml-auto font-semibold text-foreground">{pct}%</span>
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
          tint="warm"
            right={
              <span className="text-xs text-muted-foreground">
                {loading ? '' : alertTotal > 0 ? `${alertTotal.toLocaleString()} รายการ` : 'ปกติ'}
              </span>
            }
          >
            {loading ? (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : (
              <ul className="divide-y divide-border">
                {alerts.map(a => {
                  const Icon = a.icon
                  const tone = a.count === 0 ? 'text-muted-foreground'
                    : a.danger ? 'text-destructive' : 'text-warm-foreground'
                  const badgeVariant = a.count === 0 ? 'secondary' : a.danger ? 'destructive' : 'warning'
                  return (
                    <li key={a.key}>
                      <button type="button" onClick={a.onClick}
                        className="w-full text-left flex items-center gap-3 py-2.5 px-1 hover:bg-primary-soft/60 transition-colors rounded-md">
                        <Icon className={`size-5 shrink-0 ${tone}`} />
                        <span className="flex-1 min-w-0 text-sm text-foreground truncate">{a.label}</span>
                        <Badge variant={badgeVariant} className="shrink-0">{a.count.toLocaleString()}</Badge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
        </SectionCard>
      </div>

      {/* 3 — Bottom 4-card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <SectionCard icon={Trophy} title="สินค้าขายดี" tint="primary">
          <TopListCard items={topItems} height={300} emptyText="ยังไม่มีการขายในช่วงนี้" />
        </SectionCard>

        <SectionCard icon={UserCircle} title="พนักงานขาย" tint="violet">
          <TopListCard items={staffItems} height={300} emptyText="ยังไม่มีบิลในช่วงนี้" />
        </SectionCard>

        <SectionCard
          icon={Wallet}
          title="ค่าใช้จ่าย"
          tint="warm"
          right={<span className="text-xs text-muted-foreground">{formatCurrency(expenseBreakdown.total)}</span>}
        >
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : expenseBreakdown.rows.length === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <Wallet className="size-10 mb-2 opacity-30" />
              ไม่มีค่าใช้จ่ายในช่วงนี้
            </div>
          ) : (
            <ul className="space-y-3 overflow-y-auto scrollbar-thin" style={{ maxHeight: 300 }}>
              {expenseBreakdown.rows.map(r => {
                const pct = expenseBreakdown.max > 0 ? (r.amount / expenseBreakdown.max) * 100 : 0
                return (
                  <li key={r.name} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-foreground truncate">{r.name}</span>
                      <span className="font-semibold text-foreground shrink-0">{formatCurrency(r.amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-warm-foreground" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={PackageX} title="สินค้าต้องสั่งซื้อ" tint="destructive">
          <TopListCard items={lowItems} height={300} emptyIcon={Boxes} emptyText="สต็อกอยู่ในเกณฑ์ปกติ" />
        </SectionCard>
      </div>

      {/* 4 — Profit / supplier / customer rollups */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SectionCard icon={TrendingUp} title="ทำกำไรสูงสุด" tint="success">
          <TopListCard items={profitItems} height={300} emptyText="ยังไม่มีรายการขายในช่วงนี้" />
        </SectionCard>

        <SectionCard icon={Truck} title="ผู้จัดจำหน่ายยอดซื้อสูงสุด" tint="info-soft">
          <TopListCard items={supplierItems} height={300} emptyText="ยังไม่มีการรับสินค้าในช่วงนี้" />
        </SectionCard>

        <SectionCard icon={Users} title="สรุปลูกค้า" tint="primary">
          {payRow('ลูกค้าทั้งหมด', `${stats.unique_customers.toLocaleString()} ราย`)}
          {payRow('ลูกค้าใหม่', `${stats.new_customers.toLocaleString()} ราย`)}
          {payRow('ลูกค้าเก่า', `${stats.returning_customers.toLocaleString()} ราย`)}
          {divider()}
          {payRow('ยอดเฉลี่ย/บิล', formatCurrency(stats.avg_basket))}
          {payRow('ชนิดสินค้า/บิล', `${stats.avg_item_kinds.toFixed(1)} รายการ`)}
          {payRow('จำนวน/บิล', `${stats.avg_units_per_bill.toFixed(1)} ชิ้น`)}
          {divider()}
          {payRow('อัตราคืนสินค้า', formatPercent(stats.return_rate))}
          {payRow('อัตรายกเลิก', formatPercent(stats.void_rate))}
          {payRow('ใช้ส่วนลด', formatPercent(stats.discount_rate))}
          {payRow('ส่วนแบ่งจากชุด (bundle)', formatPercent(stats.bundle_share))}
        </SectionCard>
      </div>

      {/* 5 — Dead-stock table (own trailing window) */}
      <div className="flex flex-col bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <TintIcon icon={Box} tint="neutral" size="sm" bordered />
          <h3 className="text-lg font-semibold text-foreground">สินค้าค้างสต็อก</h3>
          <span className="text-sm text-muted-foreground ml-auto">ไม่ขายเกิน</span>
          <Select value={String(inactiveMonths)} onValueChange={(v) => setInactiveMonths(Number(v))}>
            <SelectTrigger variant="elevated" className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-32">
              <SelectItem value="1" className="whitespace-nowrap">1 เดือน</SelectItem>
              <SelectItem value="3" className="whitespace-nowrap">3 เดือน</SelectItem>
              <SelectItem value="6" className="whitespace-nowrap">6 เดือน</SelectItem>
              <SelectItem value="12" className="whitespace-nowrap">12 เดือน</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="[&>[data-slot=table-container]]:h-[320px] [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="trade_name" sort={inactiveSort} onToggle={toggleInactiveSort} className="min-w-[260px]">สินค้า</SortableTableHead>
                <SortableTableHead field="qty_on_hand" align="right" sort={inactiveSort} onToggle={toggleInactiveSort} className="min-w-24">คงเหลือ</SortableTableHead>
                <SortableTableHead field="cost_value" align="right" sort={inactiveSort} onToggle={toggleInactiveSort} className="min-w-28">มูลค่าทุน</SortableTableHead>
                <SortableTableHead field="avg_monthly_6m" align="right" sort={inactiveSort} onToggle={toggleInactiveSort} className="min-w-28">เฉลี่ย 6 ด.</SortableTableHead>
                <SortableTableHead field="last_sold_at" align="right" sort={inactiveSort} onToggle={toggleInactiveSort} className="min-w-32">ขายล่าสุด</SortableTableHead>
                <TableHead className="min-w-20 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : sortedInactive.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                    <Box className="size-10 mx-auto mb-2 opacity-30" />
                    ทุกสินค้ามีการขายภายใน {inactiveMonths} เดือน
                  </TableCell>
                </TableRow>
              ) : sortedInactive.map((r) => (
                <TableRow key={r.product_id} className="[&_td]:py-1">
                  <TableCell className="text-sm font-medium">{r.trade_name}</TableCell>
                  <TableCell className="text-right">
                    {(r.qty_on_hand ?? 0).toLocaleString()} {r.unit_name ?? ''}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(r.cost_value ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    {r.avg_monthly_6m > 0 ? `${r.avg_monthly_6m.toFixed(1)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {r.last_sold_at ? dayjs(r.last_sold_at).format('D MMM BB') : 'ไม่เคยขาย'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button size="icon-lg" variant="elevated" title="ดูรายละเอียดสินค้า"
                        onClick={() => navigate(`/products/${r.product_id}/edit`)}>
                        <Eye />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground">{inactive.length.toLocaleString()}</span> รายการ</>}
          </span>
          <span className="text-muted-foreground">
            มูลค่าทุนรวม <span className="font-semibold text-foreground">{formatCurrency(inactiveCostTotal)}</span>
          </span>
        </div>
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
