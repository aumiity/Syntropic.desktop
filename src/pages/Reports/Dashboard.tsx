import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import dayjs from 'dayjs'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'
import {
  PeriodPicker, defaultPeriodFor, allowedModesFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { SectionCard, MetricCard, type MetricTint } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { TopListCard, type TopListCardItem } from '@/components/ui/top-list-card'
import { GranularityTabs, type Granularity } from '@/components/ui/charts/granularity-tabs'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { formatCurrency, cn } from '@/lib/utils'
import {
  ShoppingBag, TrendingUp, Wallet, Receipt, CreditCard, RotateCcw,
  LineChart as LineChartIcon, Users, UserCircle, Activity, Trophy,
  Truck, AlertTriangle, PackageX, Clock, Package, Boxes,
  CalendarClock, Banknote, ExternalLink, ListChecks, BarChart3,
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
interface APResponse {
  rows: any[]
  total: number
  count: number
  buckets: { not_due: number; d1_30: number; d31_60: number; d60_plus: number }
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
interface VelocityRow {
  product_id: number; trade_name: string; unit_name: string
  current_stock: number; reorder_point: number | null; safety_stock: number | null
  avg_monthly_6m: number; avg_daily: number; days_cover: number | null
  months_with_data: number
  suggested_safety_stock: number; suggested_reorder_point: number
}

const EMPTY_FIN: FinanceSummary = {
  sales_subtotal: 0, sales_discount: 0, sales_net: 0, sales_cost: 0, sales_profit: 0,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, credit_count: 0, sale_count: 0,
  purchase_total: 0, purchase_cash: 0, purchase_credit: 0, purchase_count: 0,
  payable_total: 0, payable_count: 0, previous: null,
}
const EMPTY_STATS: SalesStats = {
  counts: { all: 0, retail: 0, wholesale: 0, rx: 0, return: 0, voided: 0 },
  return_amount: 0, avg_basket: 0, avg_item_kinds: 0, avg_units_per_bill: 0,
  unique_customers: 0, new_customers: 0, returning_customers: 0,
  return_rate: 0, void_rate: 0, discount_rate: 0,
  bundle_revenue: 0, bundle_share: 0,
}
const EMPTY_AP: APResponse = {
  rows: [], total: 0, count: 0,
  buckets: { not_due: 0, d1_30: 0, d31_60: 0, d60_plus: 0 },
}
const EMPTY_TRAFFIC: TrafficResponse = { mode: 'aggregated', points: [] }

const FREE_RANGE_DAYS = 7

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

// Period-over-Period delta line ("▲ 12.3%") — green up, red down. Identical
// to Finance.tsx's helper. Inlined for self-containment of the dashboard.
function delta(curr: number, prev: number | undefined | null) {
  if (prev == null) return null
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return { sub: 'ใหม่ในช่วงนี้', cls: 'text-success' }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  const up = pct >= 0
  return { sub: `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`, cls: up ? 'text-success' : 'text-destructive' }
}

function formatRangeShort(from: string, to: string): string {
  const f = dayjs(from); const t = dayjs(to)
  if (f.year() === t.year() && f.month() === t.month()) return `${f.date()}-${t.date()} ${f.format('MMM BB')}`
  if (f.year() === t.year()) return `${f.format('D MMM')} - ${t.format('D MMM BB')}`
  return `${f.format('D MMM BB')} - ${t.format('D MMM BB')}`
}

// Tooltip label for the PoP delta — short by design ("เดือนที่แล้ว", etc).
// The visible sub line shows only "▲ 12.3%"; this hover hint tells the user
// what window the % is compared against.
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
  const isOwner = useUserStore(s => s.current?.role === 'admin')

  const initial = defaultPeriodFor(isOwner)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)
  // Match the initial range — owner's "this month" auto-picks 'day';
  // non-owner's "today" auto-picks 'hour'. Avoids a flash of wrong granularity.
  const [granularity, setGranularity] = useState<Granularity>(
    autoGranularity(inclusiveDayCount(initial.from, initial.to)),
  )

  const [fin, setFin] = useState<FinanceSummary>(EMPTY_FIN)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [traffic, setTraffic] = useState<TrafficResponse>(EMPTY_TRAFFIC)
  const [topRev, setTopRev] = useState<TopProductRow[]>([])
  const [topPro, setTopPro] = useState<TopProductRow[]>([])
  const [topLow, setTopLow] = useState<TopProductRow[]>([])
  const [suppliers, setSuppliers] = useState<TopSupplierRow[]>([])
  const [cashiers, setCashiers] = useState<CashierRow[]>([])
  const [stats, setStats] = useState<SalesStats>(EMPTY_STATS)
  const [ap, setAp] = useState<APResponse>(EMPTY_AP)
  const [inactive, setInactive] = useState<InactiveRow[]>([])
  const [velocity, setVelocity] = useState<VelocityRow[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [expiringSoonCount, setExpiringSoonCount] = useState(0)
  const [expiredCount, setExpiredCount] = useState(0)
  const [negStockCount, setNegStockCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // Auto-pick granularity when date range changes. The user can still
  // override via the tabs; the next date change re-applies the auto pick.
  useEffect(() => {
    const days = inclusiveDayCount(dateFrom, dateTo)
    setGranularity(autoGranularity(days))
  }, [dateFrom, dateTo])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = window.api.reports as any
      const p = window.api.products as any
      const n = window.api.negativeStock as any
      const args = { date_from: dateFrom, date_to: dateTo }
      const [
        f, t, tr,
        rev, pro, low,
        sup, csh, ss, apr,
        inact, vel,
        lowSt, expCounts, negCnt,
      ] = await Promise.all([
        r.financeSummary({ ...args, with_compare: true }),
        r.salesPurchaseTrend({ ...args, granularity }),
        r.hourlyTraffic(args),
        r.topProducts({ ...args, by: 'revenue',   limit: 10 }),
        r.topProducts({ ...args, by: 'profit',    limit: 10 }),
        r.topProducts({ ...args, by: 'low_profit',limit: 10 }),
        r.topSuppliers({ ...args, limit: 10 }),
        r.cashierLeaderboard({ ...args, limit: 10 }),
        r.salesStats(args),
        r.accountsPayable(),
        r.inactiveProducts({ ...args, limit: 30 }),
        r.productVelocity({ limit: 30, sort_by: 'days_cover' }),
        p.lowStock({}),
        r.expiringLots({ count_only: true }),
        n.count(),
      ])
      setFin(f ?? EMPTY_FIN)
      setTrend(t ?? [])
      setTraffic(tr ?? EMPTY_TRAFFIC)
      setTopRev(rev ?? []); setTopPro(pro ?? []); setTopLow(low ?? [])
      setSuppliers(sup ?? []); setCashiers(csh ?? [])
      setStats(ss ?? EMPTY_STATS); setAp(apr ?? EMPTY_AP)
      setInactive(inact ?? []); setVelocity(vel ?? [])
      setLowStockCount(Array.isArray(lowSt) ? lowSt.length : 0)
      setExpiringSoonCount(expCounts?.counts?.d30 ?? 0)
      setExpiredCount(expCounts?.counts?.expired ?? 0)
      setNegStockCount(typeof negCnt === 'number' ? negCnt : 0)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, granularity, toast])

  const handlePeriodChange = useCallback((m: PeriodMode, f: string, t: string) => {
    if (m === 'custom' && !isOwner && f && t && inclusiveDayCount(f, t) > FREE_RANGE_DAYS) {
      const clampedFrom = new Date(t)
      clampedFrom.setDate(clampedFrom.getDate() - (FREE_RANGE_DAYS - 1))
      setMode('custom')
      setDateFrom(clampedFrom.toISOString().slice(0, 10))
      setDateTo(t)
      toast(`ดูข้อมูลย้อนหลังได้สูงสุด ${FREE_RANGE_DAYS} วัน — ช่วงที่กว้างกว่านี้ต้องใช้สิทธิ์เจ้าของร้าน`, 'warning')
      return
    }
    setMode(m); setDateFrom(f); setDateTo(t)
  }, [isOwner, toast])

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
    const dProfit = delta(fin.sales_profit, fin.previous?.sales_profit)
    const dPurchase = delta(fin.purchase_total, fin.previous?.purchase_total)
    setSummary([
      {
        label: 'ยอดขายสุทธิ',
        value: formatCurrency(fin.sales_net),
        sub: dSales?.sub ?? `${fin.sale_count.toLocaleString()} บิล`,
        subClassName: dSales?.cls,
        subTitle: dSales ? prevHint : undefined,
        icon: ShoppingBag,
        tint: 'primary',
      },
      {
        label: 'กำไรขั้นต้น',
        value: formatCurrency(fin.sales_profit),
        sub: dProfit?.sub ?? margin,
        subClassName: dProfit?.cls,
        subTitle: dProfit ? prevHint : undefined,
        icon: TrendingUp,
        tint: fin.sales_profit >= 0 ? 'success' : 'destructive',
      },
      {
        label: 'จำนวนบิล',
        value: fin.sale_count.toLocaleString(),
        sub: stats.avg_basket > 0 ? `เฉลี่ย ${formatCurrency(stats.avg_basket)}/บิล` : undefined,
        icon: Receipt,
        tint: 'info-soft',
      },
      {
        label: 'คืนสินค้า',
        value: stats.counts.return.toLocaleString(),
        sub: stats.return_amount !== 0 ? formatCurrency(stats.return_amount) : undefined,
        icon: RotateCcw,
        tint: stats.counts.return > 0 ? 'warm' : 'secondary',
      },
      {
        label: 'ยอดซื้อ',
        value: formatCurrency(fin.purchase_total),
        sub: dPurchase?.sub ?? `${fin.purchase_count.toLocaleString()} บิล`,
        subClassName: dPurchase?.cls,
        subTitle: dPurchase ? prevHint : undefined,
        icon: Wallet,
        tint: 'info-soft' as MetricTint,
      },
      {
        label: 'หนี้ค้างชำระ',
        value: formatCurrency(fin.payable_total),
        sub: `${fin.payable_count.toLocaleString()} บิล`,
        icon: CreditCard,
        tint: fin.payable_total > 0 ? 'warning' : 'success',
      },
    ])
  }, [fin, stats, trend, margin, mode, setSummary])

  useEffect(() => () => setSummary(null), [setSummary])

  // Toolbar — PeriodPicker only (per-chart granularity tabs live in their cards).
  useEffect(() => {
    setToolbar(
      <PeriodPicker
        mode={mode}
        from={dateFrom}
        to={dateTo}
        onChange={handlePeriodChange}
        allowedModes={allowedModesFor(isOwner)}
        align="end"
      />,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, handlePeriodChange, isOwner, setToolbar])

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

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* Section 1 — Trend + Hourly traffic */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard
          icon={LineChartIcon}
          title="แนวโน้มยอดขาย-กำไร"
          tint="primary"
          right={
            <GranularityTabs value={granularity} onChange={setGranularity} />
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
            <TrendChart data={trend} granularity={granularity} height={280} />
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

      {/* Section 2 — Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard icon={Trophy} title="ขายดีที่สุด" tint="primary">
          <TopListCard items={toTopList(topRev, 'revenue')} emptyText="ยังไม่มีรายการขายในช่วงนี้" />
        </SectionCard>
        <SectionCard icon={TrendingUp} title="ทำกำไรสูงสุด" tint="success">
          <TopListCard items={toTopList(topPro, 'profit')} emptyText="ยังไม่มีรายการขายในช่วงนี้" />
        </SectionCard>
        <SectionCard icon={AlertTriangle} title="กำไรต่ำ / ติดลบ" tint="destructive">
          <TopListCard items={toTopList(topLow, 'low_profit')} emptyText="ยังไม่มีสินค้าที่ขาดทุน" />
        </SectionCard>
      </div>

      {/* Section 3 — People & ops */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard icon={Truck} title="Supplier ยอดซื้อสูงสุด" tint="info-soft">
          <TopListCard items={supplierItems} emptyText="ยังไม่มีการรับสินค้าในช่วงนี้" />
        </SectionCard>
        <SectionCard icon={UserCircle} title="พนักงานขาย" tint="warm">
          <TopListCard items={cashierItems} emptyText="ยังไม่มีบิลในช่วงนี้" />
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

      {/* Section 4 — Stock risk (4 clickable mini cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          size="sm"
          label="สินค้าต่ำกว่าจุดสั่งซื้อ"
          value={lowStockCount.toLocaleString()}
          unit="รายการ"
          icon={Package}
          tint={lowStockCount > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/manage/low-stock')}
        />
        <MetricCard
          size="sm"
          label="Lot หมดอายุแล้ว"
          value={expiredCount.toLocaleString()}
          unit="lot"
          icon={CalendarClock}
          tint={expiredCount > 0 ? 'destructive' : 'success'}
          onClick={() => navigate('/manage/expiry')}
        />
        <MetricCard
          size="sm"
          label="Lot ใกล้หมดอายุ (30 วัน)"
          value={expiringSoonCount.toLocaleString()}
          unit="lot"
          icon={Clock}
          tint={expiringSoonCount > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/manage/expiry')}
        />
        <MetricCard
          size="sm"
          label="สต็อกติดลบ"
          value={negStockCount.toLocaleString()}
          unit="รายการ"
          icon={PackageX}
          tint={negStockCount > 0 ? 'destructive' : 'success'}
          onClick={() => navigate('/manage/negative-stock')}
        />
      </div>

      {/* Section 5 — Inactive products in window */}
      <SectionCard
        icon={Boxes}
        title="สินค้าค้างสต็อก (ไม่ขายในช่วงนี้)"
        tint="warm"
        right={
          <span className="text-xs text-muted-foreground">
            {inactive.length.toLocaleString()} รายการ
          </span>
        }
      >
        {inactive.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-12">
            <Boxes className="size-10 mb-2 opacity-30" />
            ทุกสินค้ามีการขายในช่วงนี้
          </div>
        ) : (
          <Table containerClassName="max-h-[320px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">สินค้า</TableHead>
                <TableHead className="min-w-24 text-right">คงเหลือ</TableHead>
                <TableHead className="min-w-28 text-right">มูลค่าทุน</TableHead>
                <TableHead className="min-w-28 text-right">เฉลี่ย 6 ด.</TableHead>
                <TableHead className="min-w-32 text-right">ขายล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inactive.map((r) => (
                <TableRow key={r.product_id} className="cursor-pointer" onClick={() => navigate(`/products/${r.product_id}/edit`)}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {/* Section 6 — Velocity & safety stock helper */}
      <SectionCard
        icon={ListChecks}
        title="ตัวช่วยตั้งค่า Safety Stock / Reorder Point"
        tint="info-soft"
        right={
          <span className="text-xs text-muted-foreground">
            แนะนำจากค่าเฉลี่ย 6 เดือน · ไม่บันทึกอัตโนมัติ
          </span>
        }
      >
        {velocity.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground py-12">
            <ListChecks className="size-10 mb-2 opacity-30" />
            ยังไม่มีข้อมูลความเคลื่อนไหว
          </div>
        ) : (
          <Table containerClassName="max-h-[400px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">สินค้า</TableHead>
                <TableHead className="min-w-24 text-right">คงเหลือ</TableHead>
                <TableHead className="min-w-24 text-right">เฉลี่ย/เดือน</TableHead>
                <TableHead className="min-w-20 text-right">เฉลี่ย/วัน</TableHead>
                <TableHead className="min-w-24 text-right">พอใช้ (วัน)</TableHead>
                <TableHead className="min-w-28 text-right">ROP ปัจจุบัน</TableHead>
                <TableHead className="min-w-28 text-right">SS ปัจจุบัน</TableHead>
                <TableHead className="min-w-28 text-right text-info-soft-foreground">แนะนำ ROP</TableHead>
                <TableHead className="min-w-28 text-right text-info-soft-foreground">แนะนำ SS</TableHead>
                <TableHead className="min-w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {velocity.map((r) => {
                const lowData = r.months_with_data < 3
                const cover = r.days_cover
                const coverCls = cover == null ? 'text-muted-foreground'
                  : cover < 7 ? 'text-destructive'
                  : cover < 30 ? 'text-warning-strong'
                  : 'text-foreground'
                return (
                  <TableRow key={r.product_id}>
                    <TableCell className="text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${r.product_id}/edit`)}
                        className="text-left hover:underline inline-flex items-center gap-1.5"
                      >
                        {r.trade_name}
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      </button>
                      {lowData && (
                        <Badge variant="warning" className="ml-2 text-xs">ข้อมูลยังน้อย</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(r.current_stock ?? 0).toLocaleString()} {r.unit_name ?? ''}
                    </TableCell>
                    <TableCell className="text-right">{r.avg_monthly_6m.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.avg_daily.toFixed(2)}</TableCell>
                    <TableCell className={cn('text-right font-semibold', coverCls)}>
                      {cover == null ? '—' : Math.round(cover).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.reorder_point != null ? r.reorder_point.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.safety_stock != null ? r.safety_stock.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-info-soft-foreground">
                      {r.suggested_reorder_point.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-info-soft-foreground">
                      {r.suggested_safety_stock.toLocaleString()}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {/* Section 7 — AP aging */}
      <SectionCard
        icon={Banknote}
        title="หนี้ค้างชำระ (Aging)"
        tint="warning"
        right={
          <Button size="sm" variant="outline" onClick={() => navigate('/reports/purchases')}>
            ดูทั้งหมด
            <ExternalLink className="size-3.5 ml-1" />
          </Button>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {agingTile('ยังไม่ครบกำหนด', ap.buckets.not_due, 'success')}
          {agingTile('ค้าง 1-30 วัน', ap.buckets.d1_30, 'info-soft')}
          {agingTile('ค้าง 31-60 วัน', ap.buckets.d31_60, 'warning')}
          {agingTile('ค้าง 60+ วัน', ap.buckets.d60_plus, 'destructive')}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm text-muted-foreground">รวมหนี้ค้างทั้งหมด</span>
          <span className="text-base font-bold text-foreground">{formatCurrency(ap.total)}</span>
        </div>
      </SectionCard>

      {/* Section 8 — Sale type breakdown */}
      <SectionCard icon={BarChart3} title="สรุปสถานะบิล" tint="secondary">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {saleTypeBox('หน้าร้าน', stats.counts.retail, 'primary')}
          {saleTypeBox('ขายส่ง', stats.counts.wholesale, 'info-soft')}
          {saleTypeBox('ใบสั่งแพทย์', stats.counts.rx, 'warm')}
          {saleTypeBox('คืนสินค้า', stats.counts.return, 'warning')}
          {saleTypeBox('ยกเลิก', stats.counts.voided, 'destructive')}
        </div>
      </SectionCard>

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

// Sub-tiles use `bg-muted` against the SectionCard's `bg-card` so they pop
// via bg contrast — not border (per user-memory feedback).
function agingTile(label: string, amount: number, tint: MetricTint) {
  const colorCls =
    tint === 'success'     ? 'text-success'
    : tint === 'warning'   ? 'text-warning-strong'
    : tint === 'destructive' ? 'text-destructive'
    : tint === 'info-soft' ? 'text-info-soft-foreground'
    : 'text-foreground'
  return (
    <div className="bg-muted rounded-lg px-3 py-2.5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-bold leading-tight mt-0.5', colorCls)}>
        {formatCurrency(amount)}
      </div>
    </div>
  )
}

function saleTypeBox(label: string, value: number, tint: MetricTint) {
  const colorCls =
    tint === 'primary'       ? 'text-primary'
    : tint === 'info-soft'   ? 'text-info-soft-foreground'
    : tint === 'warm'        ? 'text-warm-foreground'
    : tint === 'warning'     ? 'text-warning-strong'
    : tint === 'destructive' ? 'text-destructive'
    : 'text-foreground'
  return (
    <div className="bg-muted rounded-lg px-3 py-2.5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-bold leading-tight mt-0.5', colorCls)}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}
