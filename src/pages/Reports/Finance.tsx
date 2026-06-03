import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { SectionCard } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  PeriodPicker, defaultPeriodFor, allowedModesFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'
import { formatCurrency, cn } from '@/lib/utils'
import { delta } from '@/lib/delta'
import dayjs from 'dayjs'
import type { ReportsOutletContext } from './index'
import type { Granularity } from '@/components/ui/charts/granularity-tabs'
import { GranularitySelect } from '@/components/ui/charts/granularity-select'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { CompareBarChart, type CompareDatum } from '@/components/ui/charts/compare-bar-chart'
import {
  Banknote, CreditCard, ArrowLeftRight, TrendingUp,
  Wallet, ShoppingBag, LineChart, Receipt, BarChart3,
  ReceiptText, Scale,
} from 'lucide-react'

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

const EMPTY_WINDOW: FinanceWindow = {
  sales_subtotal: 0, sales_discount: 0, sales_net: 0, sales_cost: 0, sales_profit: 0,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, credit_count: 0, sale_count: 0,
  purchase_total: 0, purchase_cash: 0, purchase_credit: 0, purchase_count: 0,
  expense_total: 0,
}

const EMPTY: FinanceSummary = {
  ...EMPTY_WINDOW,
  payable_total: 0, payable_count: 0,
  previous: null,
}

const FREE_RANGE_DAYS = 7

function inclusiveDayCount(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

// Compact currency for headline labels — "฿37.5K" / "฿1.2M". Keeps the
// side panel readable without an axis ruler.
function compactCurrency(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `฿${(v / 1_000).toFixed(1)}K`
  return `฿${v.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
}

// Short human label for an ISO date range. Same-month → "1-23 พ.ค. 69"; same-year
// diff-month → "30 เม.ย. - 23 พ.ค. 69"; otherwise full BE years on both ends.
function formatRangeShort(from: string, to: string): string {
  const f = dayjs(from)
  const t = dayjs(to)
  if (f.year() === t.year() && f.month() === t.month()) {
    return `${f.date()}-${t.date()} ${f.format('MMM BB')}`
  }
  if (f.year() === t.year()) {
    return `${f.format('D MMM')} - ${t.format('D MMM BB')}`
  }
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

function payRow(label: string, value: number, muted = false) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>{label}</span>
      <span className="text-sm font-semibold text-foreground">{formatCurrency(value)}</span>
    </div>
  )
}

export default function ReportsFinancePage() {
  const { toast } = useToast()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()
  const isOwner = useUserStore(s => s.current?.role === 'admin')

  // DEV ONLY — สลับ role ไว้ทดสอบสิทธิ์ ก่อนระบบ login จริงจะมา.
  const devUser = useUserStore(s => s.current)
  const devSetCurrent = useUserStore(s => s.setCurrent)
  const devToggleRole = () => {
    const base = devUser ?? { id: 0, name: 'Dev', email: 'dev@local', role: 'staff' }
    devSetCurrent({ ...base, role: base.role === 'admin' ? 'staff' : 'admin' })
  }

  const initial = defaultPeriodFor(isOwner)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)
  const [granularity, setGranularity] = useState<Granularity>('day')

  const [sum, setSum] = useState<FinanceSummary>(EMPTY)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([
        (window.api.reports as any).financeSummary({ date_from: dateFrom, date_to: dateTo, with_compare: true }),
        (window.api.reports as any).salesPurchaseTrend({ date_from: dateFrom, date_to: dateTo, granularity }),
      ])
      setSum(s ?? EMPTY)
      setTrend(t ?? [])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, granularity])

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
    setMode(m)
    setDateFrom(f)
    setDateTo(t)
  }, [isOwner, toast])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
  }, [load])

  const margin = sum.sales_net > 0
    ? `${((sum.sales_profit / sum.sales_net) * 100).toFixed(1)}%`
    : undefined

  // KPI cards with PoP delta. Payable has no delta (snapshot, not date-bound).
  // Show the actual previous date range in the delta sub so "vs X" is concrete
  // (previous label was "ช่วงก่อน" which left users guessing what window that was).
  useEffect(() => {
    const prevHint = shortPrevLabel(mode)
    const dSales = delta(sum.sales_net, sum.previous?.sales_net)
    const dProfit = delta(sum.sales_profit, sum.previous?.sales_profit)
    const dPurchase = delta(sum.purchase_total, sum.previous?.purchase_total)
    const dExpense = delta(sum.expense_total, sum.previous?.expense_total)
    const net = sum.sales_profit - sum.expense_total
    const prevNet = sum.previous ? sum.previous.sales_profit - sum.previous.expense_total : undefined
    const dNet = delta(net, prevNet)
    setSummary([
      {
        label: 'ยอดขายสุทธิ',
        value: formatCurrency(sum.sales_net),
        sub: dSales?.sub ?? `${sum.sale_count.toLocaleString()} บิล`,
        subClassName: dSales?.cls,
        subIcon: dSales?.icon ?? undefined,
        subTitle: dSales ? prevHint : undefined,
        icon: ShoppingBag,
        tint: 'primary',
      },
      {
        label: 'กำไรขั้นต้น',
        value: formatCurrency(sum.sales_profit),
        sub: dProfit?.sub ?? margin,
        subClassName: dProfit?.cls,
        subIcon: dProfit?.icon ?? undefined,
        subTitle: dProfit ? prevHint : undefined,
        icon: TrendingUp,
        tint: sum.sales_profit >= 0 ? 'success' : 'destructive',
      },
      {
        label: 'ยอดซื้อ',
        value: formatCurrency(sum.purchase_total),
        sub: dPurchase?.sub ?? `${sum.purchase_count.toLocaleString()} บิล`,
        subClassName: dPurchase?.cls,
        subIcon: dPurchase?.icon ?? undefined,
        subTitle: dPurchase ? prevHint : undefined,
        icon: Wallet,
        tint: 'info-soft',
      },
      {
        label: 'หนี้ค้างชำระ',
        value: formatCurrency(sum.payable_total),
        sub: `${sum.payable_count.toLocaleString()} บิล`,
        icon: CreditCard,
        tint: sum.payable_total > 0 ? 'warning' : 'success',
      },
      {
        label: 'ค่าใช้จ่าย',
        value: formatCurrency(sum.expense_total),
        sub: dExpense?.sub,
        subClassName: dExpense?.cls,
        subIcon: dExpense?.icon ?? undefined,
        subTitle: dExpense ? prevHint : undefined,
        icon: ReceiptText,
        tint: 'warm',
      },
      {
        label: 'กำไรสุทธิ',
        value: formatCurrency(net),
        sub: dNet?.sub,
        subClassName: dNet?.cls,
        subIcon: dNet?.icon ?? undefined,
        subTitle: dNet ? prevHint : undefined,
        icon: Scale,
        tint: net >= 0 ? 'success' : 'destructive',
      },
    ])
  }, [sum, margin, mode, setSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. FdaReports/KhorYor9 which have no summary of their own).
  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

  useEffect(() => {
    setToolbar(
      <>
        {/* DEV ONLY — ปุ่มทดสอบสลับสิทธิ์ ลบทิ้งเมื่อมีระบบ login จริง */}
        <Button
          variant={isOwner ? 'success' : 'warm'}
          size="lg"
          onClick={devToggleRole}
          title="ปุ่มทดสอบ — ลบเมื่อทำ login เสร็จ"
        >
          DEV: สลับเป็น {isOwner ? 'staff (พนักงาน)' : 'admin (เจ้าของร้าน)'}
        </Button>
        <PeriodPicker
          mode={mode}
          from={dateFrom}
          to={dateTo}
          onChange={handlePeriodChange}
          allowedModes={allowedModesFor(isOwner)}
          align="end"
        />
      </>,
    )
    return () => setToolbar(null)
  }, [mode, dateFrom, dateTo, isOwner, handlePeriodChange, devToggleRole, setToolbar])

  // PoP bars: 4 categories side-by-side current vs previous.
  const compareData: CompareDatum[] = [
    { name: 'ยอดขายสุทธิ', current: sum.sales_net,      previous: sum.previous?.sales_net      ?? 0 },
    { name: 'ต้นทุน',       current: sum.sales_cost,     previous: sum.previous?.sales_cost     ?? 0 },
    { name: 'กำไร',         current: sum.sales_profit,   previous: sum.previous?.sales_profit   ?? 0 },
    { name: 'ยอดซื้อ',       current: sum.purchase_total, previous: sum.previous?.purchase_total ?? 0 },
  ]

  const hasTrend = trend.length > 0
  const hasCompare = sum.previous != null
  const currentRangeLabel = formatRangeShort(dateFrom, dateTo)
  const prevRangeLabel = sum.previous
    ? formatRangeShort(sum.previous.date_from, sum.previous.date_to)
    : null
  // Short delta (no "vs ..." suffix) — the side panel mirrors the reference
  // and only has room for the icon + %. KPI cards above still carry the full
  // version that names the previous window.
  const salesDeltaShort = delta(sum.sales_net, sum.previous?.sales_net)

  return (
    /* Page scroll lives on ReportsLayout. Each section flows naturally and
       the dashboard scrolls as one document — no inner scrollbar. */
    <div className="flex flex-col gap-2">
      {/* Charts row — trend + PoP compare side by side. Stacks to 1-col below
          `lg` so narrow windows don't squish the trend's many time-buckets. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 shrink-0">
        <SectionCard
          icon={LineChart}
          title="แนวโน้มรายได้-กำไร"
          tint="primary"
          right={<GranularitySelect value={granularity} onChange={setGranularity} />}
        >
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !hasTrend ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-sm text-muted-foreground">
              <LineChart className="size-10 mb-2 opacity-30" />
              ไม่มีข้อมูลในช่วงเวลานี้
            </div>
          ) : (
            /* Compact headline like the reference: one big compact number,
               label, delta. Centered vertically against the chart. */
            <div className="flex gap-4 items-center">
              <div className="shrink-0 w-28">
                <div className="text-3xl font-bold text-foreground leading-none">
                  {compactCurrency(sum.sales_net)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">ยอดขาย</div>
                {salesDeltaShort && (
                  <div className={cn('text-sm font-semibold mt-1 inline-flex items-center gap-1', salesDeltaShort.cls)}>
                    {salesDeltaShort.icon && <salesDeltaShort.icon className="size-3.5" />}
                    {salesDeltaShort.sub}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <TrendChart data={trend} granularity={granularity} height={300} />
              </div>
            </div>
          )}
        </SectionCard>

        {/* PoP compare bar — title bar shows the two windows being compared so
            "ช่วงนี้/ช่วงก่อน" is never abstract. Legend labels echo the dates
            too in case the user scrolls past the title. */}
        <SectionCard
          icon={BarChart3}
          title="เปรียบเทียบช่วงเวลา"
          tint="warm"
          right={
            prevRangeLabel ? (
              <span className="text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{currentRangeLabel}</span>
                <span className="mx-1.5 opacity-50">vs</span>
                <span className="font-medium">{prevRangeLabel}</span>
              </span>
            ) : undefined
          }
        >
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !hasCompare || !prevRangeLabel ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">ไม่มีข้อมูลช่วงก่อนสำหรับเปรียบเทียบ</div>
          ) : (
            <CompareBarChart
              data={compareData}
              height={300}
              currentLabel={`ช่วงนี้ · ${currentRangeLabel}`}
              previousLabel={`ช่วงก่อน · ${prevRangeLabel}`}
            />
          )}
        </SectionCard>
      </div>

      {/* 3-col breakdown — same as before */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <SectionCard icon={Receipt} title="สรุปรายได้" tint="primary">
          {payRow('ยอดก่อนหักลด', sum.sales_subtotal)}
          {payRow('ส่วนลดขาย', sum.sales_discount, true)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">ยอดขายสุทธิ</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(sum.sales_net)}</span>
          </div>
          {payRow('ต้นทุนขาย', sum.sales_cost, true)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">
              กำไรขั้นต้น{margin ? <span className="text-muted-foreground font-normal"> · {margin}</span> : ''}
            </span>
            <span className={`text-sm font-bold ${sum.sales_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(sum.sales_profit)}
            </span>
          </div>
        </SectionCard>

        <SectionCard icon={Banknote} title="ช่องทางรับเงิน (ขาย)" tint="success">
          {payRow('เงินสด', sum.cash_amount)}
          {payRow('บัตร', sum.card_amount)}
          {payRow('เงินโอน', sum.transfer_amount)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm text-muted-foreground">บิลเครดิต (ค้างชำระ)</span>
            <span className="text-sm font-semibold text-warm-foreground">{sum.credit_count.toLocaleString()} บิล</span>
          </div>
        </SectionCard>

        <SectionCard icon={ArrowLeftRight} title="การชำระเงินซื้อ" tint="info-soft">
          {payRow('เงินสด', sum.purchase_cash)}
          {payRow('เครดิต', sum.purchase_credit)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm text-muted-foreground">หนี้ค้างชำระปัจจุบัน</span>
            <span className="text-sm font-semibold text-warm-foreground">{formatCurrency(sum.payable_total)}</span>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
