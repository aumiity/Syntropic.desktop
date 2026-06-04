import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import dayjs from 'dayjs'
import { useToast } from '@/components/ui/toast'
import {
  PeriodPicker, defaultPeriodFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { SectionCard } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableTableHead,
} from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TopListCard, type TopListCardItem } from '@/components/ui/top-list-card'
import { type Granularity } from '@/components/ui/charts/granularity-tabs'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { Button } from '@/components/ui/button'
import { TintIcon } from '@/components/ui/tint-icon'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ExpenseFormDialog } from '@/components/dialogs/ExpenseFormDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { delta } from '@/lib/delta'
import type { Expense, ExpenseCategory } from '@/types'
import {
  ShoppingBag, TrendingUp, Wallet,
  LineChart as LineChartIcon, Users, UserCircle, Activity, Trophy,
  Truck, AlertTriangle, Box,
  ReceiptText, Plus, Edit, Trash2, MoreHorizontal, Eye,
} from 'lucide-react'
import type { ReportsOutletContext } from './index'

// ── Types ────────────────────────────────────────────────────────────────
interface FinanceWindow {
  sales_subtotal: number
  sales_discount: number
  sales_net: number
  sales_cost: number
  sales_profit: number
  cash_amount: number
  card_amount: number
  transfer_amount: number
  credit_count: number
  sale_count: number
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
  return_amount: number
  avg_basket: number
  avg_item_kinds: number
  avg_units_per_bill: number
  unique_customers: number
  new_customers: number
  returning_customers: number
  return_rate: number
  void_rate: number
  discount_rate: number
  bundle_revenue: number
  bundle_share: number
}
interface TrafficResponse {
  mode: 'single_day' | 'aggregated'
  points: Array<{ hour: number; bills: number; sales: number }>
}
interface TopProductRow {
  product_id: number; trade_name: string; unit_name: string
  qty: number; revenue: number; cost: number; profit: number
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
type ExpenseSortField = 'expense_date' | 'expense_no' | 'category_name' | 'amount'

const EMPTY_FIN: FinanceSummary = {
  sales_subtotal: 0, sales_discount: 0, sales_net: 0, sales_cost: 0, sales_profit: 0,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, credit_count: 0, sale_count: 0,
  purchase_total: 0, purchase_cash: 0, purchase_credit: 0, purchase_count: 0,
  expense_total: 0,
  payable_total: 0, payable_count: 0, previous: null,
}
const EMPTY_STATS: SalesStats = {
  counts: { all: 0, retail: 0, wholesale: 0, rx: 0, return: 0, voided: 0 },
  return_amount: 0, avg_basket: 0, avg_item_kinds: 0, avg_units_per_bill: 0,
  unique_customers: 0, new_customers: 0, returning_customers: 0,
  return_rate: 0, void_rate: 0, discount_rate: 0,
  bundle_revenue: 0, bundle_share: 0,
}
const EMPTY_TRAFFIC: TrafficResponse = { mode: 'aggregated', points: [] }

// ── Helpers ───────────────────────────────────────────────────────────────
function inclusiveDayCount(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

function autoGranularity(days: number): Granularity {
  if (days <= 1) return 'hour'
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

// The trend chart compares *across* periods (not within one): the page's period
// MODE sets the bucket granularity, and the window spans several of them so the
// line has multiple points. It is intentionally decoupled from the single-period
// range the metric cards / tables use.
//   year  → bucket by year,  window = 5 years ending at the selected year
//   month → bucket by month, window = all 12 months of the selected year
//   day   → bucket by day,   window = all days of the selected month
//   custom→ fall back to the selected range + auto granularity
function trendWindow(mode: PeriodMode, dateFrom: string, dateTo: string): { from: string; to: string; gran: Granularity } {
  const d = dayjs(dateFrom)
  const ISO = 'YYYY-MM-DD'
  if (mode === 'year')  return { from: d.startOf('year').subtract(4, 'year').format(ISO), to: d.endOf('year').format(ISO),  gran: 'year' }
  if (mode === 'month') return { from: d.startOf('year').format(ISO),                      to: d.endOf('year').format(ISO),  gran: 'month' }
  if (mode === 'day')   return { from: d.startOf('month').format(ISO),                     to: d.endOf('month').format(ISO), gran: 'day' }
  return { from: dateFrom, to: dateTo, gran: autoGranularity(inclusiveDayCount(dateFrom, dateTo)) }
}

function formatRangeShort(from: string, to: string): string {
  const f = dayjs(from); const t = dayjs(to)
  if (f.year() === t.year() && f.month() === t.month()) return `${f.date()}-${t.date()} ${f.format('MMM BB')}`
  if (f.year() === t.year()) return `${f.format('D MMM')} - ${t.format('D MMM BB')}`
  return `${f.format('D MMM BB')} - ${t.format('D MMM BB')}`
}

// Tooltip label for the PoP delta — short by design ("เดือนที่แล้ว", etc).
// The visible sub line shows only the % (TrendingUp/Down icon + value); this
// hover hint tells the user what window the % is compared against.
function shortPrevLabel(mode: PeriodMode): string {
  switch (mode) {
    case 'day': return 'เมื่อวาน'
    case 'month': return 'เดือนที่แล้ว'
    case 'year': return 'ปีที่แล้ว'
    default: return 'ช่วงก่อนหน้า'
  }
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ReportsDashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()

  // Access lock (owner/staff role gating) removed for now — full access for
  // everyone: all period modes, unlimited range.
  const initial = defaultPeriodFor(true)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)
  // Trend chart range + granularity — derived from the period MODE, spanning
  // several periods for cross-period comparison (see trendWindow()).
  const trendWin = useMemo(() => trendWindow(mode, dateFrom, dateTo), [mode, dateFrom, dateTo])
  const trendCaption = useMemo(() => {
    const d = dayjs(dateFrom)
    if (mode === 'year')  return 'เทียบรายปี · 5 ปีล่าสุด'
    if (mode === 'month') return `เทียบรายเดือน · ปี ${d.format('BBBB')}`
    if (mode === 'day')   return `เทียบรายวัน · ${d.format('MMMM BB')}`
    return 'ตามช่วงที่เลือก'
  }, [mode, dateFrom])

  const [fin, setFin] = useState<FinanceSummary>(EMPTY_FIN)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [traffic, setTraffic] = useState<TrafficResponse>(EMPTY_TRAFFIC)
  const [topRev, setTopRev] = useState<TopProductRow[]>([])
  const [topPro, setTopPro] = useState<TopProductRow[]>([])
  const [topLow, setTopLow] = useState<TopProductRow[]>([])
  const [suppliers, setSuppliers] = useState<TopSupplierRow[]>([])
  const [cashiers, setCashiers] = useState<CashierRow[]>([])
  const [stats, setStats] = useState<SalesStats>(EMPTY_STATS)
  const [inactive, setInactive] = useState<InactiveRow[]>([])
  const [loading, setLoading] = useState(false)

  // Expenses (folded in from the old ค่าใช้จ่าย tab — shares this page's date range)
  const [expenseRows, setExpenseRows] = useState<Expense[]>([])
  const [expenseFormOpen, setExpenseFormOpen] = useState(false)
  const [expenseEditTarget, setExpenseEditTarget] = useState<Expense | null>(null)
  const [expenseDeleteTarget, setExpenseDeleteTarget] = useState<Expense | null>(null)
  const [expenseDeleting, setExpenseDeleting] = useState(false)
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [expenseCatFilter, setExpenseCatFilter] = useState<string>('all')
  // Dead-stock window — own period, decoupled from the page (last N months up to today).
  const [inactiveMonths, setInactiveMonths] = useState<number>(6)

  // Client-side sort for the two in-page tables (data already in memory).
  const [inactiveSort, setInactiveSort] = useState<{ by: InactiveSortField; dir: SortDir }>({ by: 'cost_value', dir: 'desc' })
  const [expenseSort, setExpenseSort] = useState<{ by: ExpenseSortField; dir: SortDir }>({ by: 'expense_date', dir: 'desc' })
  const toggleInactiveSort = (f: InactiveSortField) =>
    setInactiveSort(s => s.by === f ? { by: f, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by: f, dir: 'asc' })
  const toggleExpenseSort = (f: ExpenseSortField) =>
    setExpenseSort(s => s.by === f ? { by: f, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by: f, dir: 'asc' })

  // Expense categories for the filter dropdown — static, load once.
  useEffect(() => {
    window.api.expenses.activeCategories()
      .then((data: any) => setExpenseCategories((data ?? []) as ExpenseCategory[]))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = window.api.reports as any
      const args = { date_from: dateFrom, date_to: dateTo }
      // Dead-stock uses its own trailing window (last N months → today), NOT the page period.
      const inactiveFrom = dayjs().subtract(inactiveMonths, 'month').format('YYYY-MM-DD')
      const inactiveTo = dayjs().format('YYYY-MM-DD')
      const [
        f, t, tr,
        rev, pro, low,
        sup, csh, ss,
        inact,
        expList,
      ] = await Promise.all([
        r.financeSummary({ ...args, with_compare: true }),
        r.salesPurchaseTrend({ date_from: trendWin.from, date_to: trendWin.to, granularity: trendWin.gran }),
        r.hourlyTraffic(args),
        r.topProducts({ ...args, by: 'revenue',   limit: 10 }),
        r.topProducts({ ...args, by: 'profit',    limit: 10 }),
        r.topProducts({ ...args, by: 'low_profit',limit: 10 }),
        r.topSuppliers({ ...args, limit: 10 }),
        r.cashierLeaderboard({ ...args, limit: 10 }),
        r.salesStats(args),
        r.inactiveProducts({ date_from: inactiveFrom, date_to: inactiveTo, limit: 30 }),
        window.api.expenses.list({ date_from: dateFrom, date_to: dateTo, pageSize: 0 }),
      ])
      setFin(f ?? EMPTY_FIN)
      setTrend(t ?? [])
      setTraffic(tr ?? EMPTY_TRAFFIC)
      setTopRev(rev ?? []); setTopPro(pro ?? []); setTopLow(low ?? [])
      setSuppliers(sup ?? []); setCashiers(csh ?? [])
      setStats(ss ?? EMPTY_STATS)
      setInactive(inact ?? [])
      setExpenseRows(((expList as any)?.rows ?? []) as Expense[])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, trendWin, inactiveMonths, toast])

  const handlePeriodChange = useCallback((m: PeriodMode, f: string, t: string) => {
    setMode(m); setDateFrom(f); setDateTo(t)
  }, [])

  // Debounce reload so dragging the date range doesn't fire IPC per keystroke.
  useEffect(() => {
    const tid = setTimeout(() => { load() }, 250)
    return () => clearTimeout(tid)
  }, [load])

  // Summary slot — 6 cards in the layout's shared band.
  const margin = fin.sales_net > 0
    ? `${((fin.sales_profit / fin.sales_net) * 100).toFixed(1)}%`
    : undefined
  useEffect(() => {
    const prevHint = shortPrevLabel(mode)
    const dSales = delta(fin.sales_net, fin.previous?.sales_net)
    const dCost = delta(fin.sales_cost, fin.previous?.sales_cost)
    const dProfit = delta(fin.sales_profit, fin.previous?.sales_profit)
    const dExpense = delta(fin.expense_total, fin.previous?.expense_total)
    setSummary([
      {
        label: 'ยอดขาย',
        value: formatCurrency(fin.sales_net),
        sub: dSales?.sub ?? `${fin.sale_count.toLocaleString()} บิล`,
        subClassName: dSales?.cls,
        subIcon: dSales?.icon ?? undefined,
        subTitle: dSales ? prevHint : undefined,
        icon: ShoppingBag,
        tint: 'primary',
      },
      {
        label: 'ต้นทุน',
        value: formatCurrency(fin.sales_cost),
        sub: dCost?.sub,
        subClassName: dCost?.cls,
        subIcon: dCost?.icon ?? undefined,
        subTitle: dCost ? prevHint : undefined,
        icon: Wallet,
        tint: 'info-soft',
      },
      {
        label: 'กำไร',
        value: formatCurrency(fin.sales_profit),
        sub: dProfit?.sub ?? margin,
        subClassName: dProfit?.cls,
        subIcon: dProfit?.icon ?? undefined,
        subTitle: dProfit ? prevHint : undefined,
        icon: TrendingUp,
        tint: fin.sales_profit >= 0 ? 'success' : 'destructive',
      },
      {
        label: 'ค่าใช้จ่ายอื่นๆ',
        value: formatCurrency(fin.expense_total),
        sub: dExpense?.sub,
        subClassName: dExpense?.cls,
        subIcon: dExpense?.icon ?? undefined,
        subTitle: dExpense ? prevHint : undefined,
        icon: ReceiptText,
        tint: 'warm',
      },
    ])
  }, [fin, margin, mode, setSummary])

  useEffect(() => () => setSummary(null), [setSummary])

  // Toolbar — PeriodPicker only (per-chart granularity tabs live in their cards).
  useEffect(() => {
    setToolbar(
      <PeriodPicker
        mode={mode}
        from={dateFrom}
        to={dateTo}
        onChange={handlePeriodChange}
        align="end"
      />,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, handlePeriodChange, setToolbar])

  // ── Render helpers ─────────────────────────────────────────────────────
  const hasTrend = trend.length > 0
  const hasTraffic = traffic.points.some(p => p.bills > 0 || p.sales > 0)

  const toTopList = useCallback((rows: TopProductRow[], kind: 'revenue' | 'profit' | 'low_profit'): TopListCardItem[] => {
    return rows.map((r, i) => {
      const v = kind === 'revenue' ? r.revenue : r.profit
      const isNeg = v < 0
      return {
        rank: i + 1,
        label: r.trade_name,
        sub: `${(r.qty ?? 0).toLocaleString()} ${r.unit_name ?? 'ชิ้น'}${
          kind === 'low_profit' || kind === 'profit'
            ? ` · ขาย ${formatCurrency(r.revenue)}`
            : ''
        }`,
        value: formatCurrency(v),
        valueClassName: isNeg ? 'text-destructive' : (kind === 'profit' ? 'text-success' : undefined),
        onClick: () => navigate(`/products/${r.product_id}/edit`),
      }
    })
  }, [navigate])

  const supplierItems: TopListCardItem[] = useMemo(() => suppliers.map((s, i) => ({
    rank: i + 1,
    label: s.supplier_name,
    sub: `${s.receipt_count.toLocaleString()} ใบ`,
    value: formatCurrency(s.total_amount),
  })), [suppliers])

  const cashierItems: TopListCardItem[] = useMemo(() => cashiers.map((c, i) => ({
    rank: i + 1,
    label: c.user_name,
    sub: `${c.bill_count.toLocaleString()} บิล · กำไร ${formatCurrency(c.profit)}`,
    value: formatCurrency(c.total_amount),
  })), [cashiers])

  const sortedInactive = useMemo(
    () => [...inactive].sort((a, b) => sortCmp(a[inactiveSort.by], b[inactiveSort.by], inactiveSort.dir)),
    [inactive, inactiveSort],
  )
  const inactiveCostTotal = useMemo(
    () => inactive.reduce((s, r) => s + (r.cost_value ?? 0), 0),
    [inactive],
  )
  const filteredExpenses = useMemo(
    () => expenseCatFilter === 'all' ? expenseRows : expenseRows.filter(r => String(r.category_id) === expenseCatFilter),
    [expenseRows, expenseCatFilter],
  )
  const sortedExpenses = useMemo(
    () => [...filteredExpenses].sort((a, b) => sortCmp(a[expenseSort.by] as any, b[expenseSort.by] as any, expenseSort.dir)),
    [filteredExpenses, expenseSort],
  )
  const filteredExpenseTotal = useMemo(
    () => filteredExpenses.reduce((s, r) => s + (r.amount ?? 0), 0),
    [filteredExpenses],
  )

  // ── Expense CRUD ───────────────────────────────────────────────────────
  const openExpenseAdd = () => { setExpenseEditTarget(null); setExpenseFormOpen(true) }
  const openExpenseEdit = (e: Expense) => { setExpenseEditTarget(e); setExpenseFormOpen(true) }

  const handleExpenseDelete = async () => {
    if (!expenseDeleteTarget) return
    setExpenseDeleting(true)
    try {
      await window.api.expenses.delete(expenseDeleteTarget.id)
      toast('ลบรายการสำเร็จ', 'success')
      setExpenseDeleteTarget(null)
      await load()
    } catch (e: any) {
      toast(e?.message ?? 'ลบไม่สำเร็จ', 'error')
    } finally {
      setExpenseDeleting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <Tabs defaultValue="overview" className="flex flex-col gap-3">
        <TabsList variant="line">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="sales">การขาย</TabsTrigger>
          <TabsTrigger value="stock">สินค้าคงคลัง</TabsTrigger>
          <TabsTrigger value="expense">ค่าใช้จ่าย</TabsTrigger>
        </TabsList>

        {/* ── Tab: ภาพรวม — Trend + Hourly traffic ── */}
        <TabsContent value="overview" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          icon={LineChartIcon}
          title="แนวโน้มยอดขาย-กำไร"
          tint="primary"
          right={
            <span className="text-xs text-muted-foreground">{trendCaption}</span>
          }
        >
          {loading ? (
            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !hasTrend ? (
            <div className="h-[280px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <LineChartIcon className="size-10 mb-2 opacity-30" />
              ไม่มีข้อมูลในช่วงเวลานี้
            </div>
          ) : (
            <TrendChart data={trend} granularity={trendWin.gran} height={280} />
          )}
        </SectionCard>

        <SectionCard
          icon={Activity}
          title="Traffic ลูกค้าที่เข้าร้าน"
          tint="info-soft"
          right={
            <span className="text-xs text-muted-foreground">
              {traffic.mode === 'single_day' ? 'รายชั่วโมง (วันเดียว)' : 'เฉลี่ยตามช่วงเวลา'}
            </span>
          }
        >
          {loading ? (
            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !hasTraffic ? (
            <div className="h-[280px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <Activity className="size-10 mb-2 opacity-30" />
              ยังไม่มีบิลในช่วงนี้
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={traffic.points} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h: number) => `${String(h).padStart(2, '0')}`}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false} axisLine={false} tickMargin={6}
                    interval={1}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload as { hour: number; bills: number; sales: number }
                      return (
                        <div className="rounded-lg bg-foreground text-background shadow-xl text-sm overflow-hidden min-w-[150px]">
                          <div className="px-3 py-1.5 text-center font-medium border-b border-background/15">
                            {String(label).padStart(2, '0')}:00 น.
                          </div>
                          <div className="px-3 py-2 space-y-1">
                            <div className="flex justify-between gap-3">
                              <span className="text-background/70">บิล</span>
                              <span className="font-semibold">{p.bills.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-background/70">ยอดขาย</span>
                              <span className="font-semibold">{formatCurrency(p.sales)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="bills" radius={[6, 6, 0, 0]}>
                    {traffic.points.map((_, i) => (
                      <Cell key={i} fill="hsl(var(--info-soft-foreground))" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

        </TabsContent>

        {/* ── Tab: การขาย — Top products + people ── */}
        <TabsContent value="sales" className="flex flex-col gap-3">
      {/* Section 2 — Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard icon={Trophy} title="ขายดีที่สุด" tint="primary">
          <TopListCard items={toTopList(topRev, 'revenue')} height={320} emptyText="ยังไม่มีรายการขายในช่วงนี้" />
        </SectionCard>
        <SectionCard icon={TrendingUp} title="ทำกำไรสูงสุด" tint="success">
          <TopListCard items={toTopList(topPro, 'profit')} height={320} emptyText="ยังไม่มีรายการขายในช่วงนี้" />
        </SectionCard>
        <SectionCard icon={AlertTriangle} title="กำไรต่ำ / ติดลบ" tint="destructive">
          <TopListCard items={toTopList(topLow, 'low_profit')} height={320} emptyText="ยังไม่มีสินค้าที่ขาดทุน" />
        </SectionCard>
      </div>

      {/* Section 3 — People & ops */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard icon={Truck} title="Supplier ยอดซื้อสูงสุด" tint="info-soft">
          <TopListCard items={supplierItems} height={320} emptyText="ยังไม่มีการรับสินค้าในช่วงนี้" />
        </SectionCard>
        <SectionCard icon={UserCircle} title="พนักงานขาย" tint="warm">
          <TopListCard items={cashierItems} height={320} emptyText="ยังไม่มีบิลในช่วงนี้" />
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

        </TabsContent>

        {/* ── Tab: สินค้าคงคลัง — dead stock ── */}
        <TabsContent value="stock" className="flex flex-col gap-3">
      {/* Section 4 — Inactive products (own trailing window) */}
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

        </TabsContent>

        {/* ── Tab: ค่าใช้จ่าย — expense register ── */}
        <TabsContent value="expense" className="flex flex-col gap-3">
      {/* Section 5 — Expenses */}
      <div className="flex flex-col bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <TintIcon icon={ReceiptText} tint="neutral" size="sm" bordered />
          <h3 className="text-lg font-semibold text-foreground">รายการค่าใช้จ่าย</h3>
          <Select value={expenseCatFilter} onValueChange={setExpenseCatFilter}>
            <SelectTrigger variant="elevated" className="h-9 w-48 ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-56">
              <SelectItem value="all" className="whitespace-nowrap">ทุกหมวด</SelectItem>
              {expenseCategories.map(c => (
                <SelectItem key={c.id} value={String(c.id)} className="whitespace-nowrap">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="lg" variant="elevated" className="h-9 px-2 shrink-0" onClick={openExpenseAdd}>
            <Plus className="size-4" /> เพิ่มค่าใช้จ่าย
          </Button>
        </div>

        <div className="[&>[data-slot=table-container]]:h-[320px] [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortableTableHead field="expense_date" sort={expenseSort} onToggle={toggleExpenseSort} className="w-[16%]">วันที่</SortableTableHead>
                <SortableTableHead field="expense_no" sort={expenseSort} onToggle={toggleExpenseSort} className="w-[22%]">เลขที่</SortableTableHead>
                <SortableTableHead field="category_name" sort={expenseSort} onToggle={toggleExpenseSort} className="w-[32%]">หมวด</SortableTableHead>
                <SortableTableHead field="amount" align="right" sort={expenseSort} onToggle={toggleExpenseSort} className="w-[18%]">จำนวนเงิน</SortableTableHead>
                <TableHead className="w-[12%] text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : sortedExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <ReceiptText className="size-10 mx-auto mb-2 opacity-30" />
                    {expenseCatFilter === 'all' ? 'ไม่มีรายการค่าใช้จ่ายในช่วงเวลานี้' : 'ไม่มีรายการในหมวดที่เลือก'}
                  </TableCell>
                </TableRow>
              ) : sortedExpenses.map(r => (
                <TableRow key={r.id} className="[&_td]:py-1 [&_td]:font-medium">
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(r.expense_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground overflow-x-clip overflow-y-visible">{r.expense_no}</TableCell>
                  <TableCell className="text-sm text-foreground overflow-x-clip overflow-y-visible">{r.category_name ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm text-foreground">{formatCurrency(r.amount)}</TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                            <MoreHorizontal />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-40 p-1 gap-0">
                          <button type="button" onClick={() => openExpenseEdit(r)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                            <Edit className="size-4" /> แก้ไข
                          </button>
                          <button type="button" onClick={() => setExpenseDeleteTarget(r)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="size-4" /> ลบ
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground">{filteredExpenses.length.toLocaleString()}</span> รายการ</>}
          </span>
          <span className="text-muted-foreground">
            รวม <span className="font-semibold text-foreground">{formatCurrency(filteredExpenseTotal)}</span>
          </span>
        </div>
      </div>
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={expenseFormOpen}
        onOpenChange={setExpenseFormOpen}
        expense={expenseEditTarget}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!expenseDeleteTarget}
        onOpenChange={(o) => { if (!expenseDeleting && !o) setExpenseDeleteTarget(null) }}
        variant="destructive"
        title="ลบรายการค่าใช้จ่าย"
        content={expenseDeleteTarget && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">เลขที่</span>
                <span className="font-semibold">{expenseDeleteTarget.expense_no}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">จำนวนเงิน</span>
                <span className="font-semibold">{formatCurrency(expenseDeleteTarget.amount)}</span>
              </div>
            </div>
            <div className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive-strong leading-relaxed">
              การลบไม่สามารถย้อนกลับได้
            </div>
          </div>
        )}
        confirmLabel={expenseDeleting ? 'กำลังลบ...' : 'ลบรายการ'}
        onConfirm={handleExpenseDelete}
        busy={expenseDeleting}
      />

    </div>
  )
}

// ── Render-function helpers ───────────────────────────────────────────────
// Lowercase + called inline (NOT JSX), matching Finance.tsx's payRow pattern.
// Local UI _components_ in page files are forbidden by CLAUDE.md, but render
// helpers used like {payRow(...)} are not components in the React sense.
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

// Generic value comparator for client-side table sort. Nulls sort last;
// strings use Thai-aware localeCompare, numbers compare numerically.
function sortCmp(a: string | number | null, b: string | number | null, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
  return String(a).localeCompare(String(b), 'th') * mul
}
