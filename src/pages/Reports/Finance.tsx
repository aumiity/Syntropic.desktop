import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import {
  Banknote, CreditCard, ArrowLeftRight, TrendingUp, TrendingDown,
  Wallet, ShoppingBag, Percent, LineChart,
} from 'lucide-react'

interface FinanceSummary {
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
  payable_total: number
  payable_count: number
}

interface TrendRow {
  date: string
  sales_net: number
  sales_cost: number
  sales_profit: number
  purchase_total: number
}

const EMPTY: FinanceSummary = {
  sales_subtotal: 0, sales_discount: 0, sales_net: 0, sales_cost: 0, sales_profit: 0,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, credit_count: 0, sale_count: 0,
  purchase_total: 0, purchase_cash: 0, purchase_credit: 0, purchase_count: 0,
  payable_total: 0, payable_count: 0,
}

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Plain render helper (NOT a component — keeps page free of local JSX components)
function payRow(label: string, value: number, muted = false) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(value)}</span>
    </div>
  )
}

export default function ReportsFinancePage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(monthStart())
  const [dateTo, setDateTo] = useState(today)

  const [sum, setSum] = useState<FinanceSummary>(EMPTY)
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([
        (window.api.reports as any).financeSummary({ date_from: dateFrom, date_to: dateTo }),
        (window.api.reports as any).salesPurchaseTrend({ date_from: dateFrom, date_to: dateTo }),
      ])
      setSum(s ?? EMPTY)
      setTrend(t ?? [])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 250)
    return () => clearTimeout(t)
  }, [load])

  const margin = sum.sales_net > 0
    ? `${((sum.sales_profit / sum.sales_net) * 100).toFixed(1)}%`
    : undefined

  useEffect(() => {
    setSummary([
      { label: 'ยอดขายสุทธิ', value: formatCurrency(sum.sales_net), sub: `${sum.sale_count.toLocaleString()} บิล`, icon: ShoppingBag, tint: 'primary' },
      { label: 'ต้นทุนขาย', value: formatCurrency(sum.sales_cost), icon: TrendingDown, tint: 'warm' },
      {
        label: 'กำไรขั้นต้น',
        value: formatCurrency(sum.sales_profit),
        sub: margin,
        icon: TrendingUp,
        tint: sum.sales_profit >= 0 ? 'success' : 'destructive',
      },
      { label: 'ยอดซื้อ', value: formatCurrency(sum.purchase_total), sub: `${sum.purchase_count.toLocaleString()} บิล`, icon: Wallet, tint: 'info-soft' },
      {
        label: 'เจ้าหนี้คงค้าง',
        value: formatCurrency(sum.payable_total),
        sub: `${sum.payable_count.toLocaleString()} บิล`,
        icon: CreditCard,
        tint: sum.payable_total > 0 ? 'warning' : 'success',
      },
      { label: 'ส่วนลดขายรวม', value: formatCurrency(sum.sales_discount), icon: Percent, tint: 'secondary' },
    ])
  }, [sum, margin, setSummary])

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
          className="h-10 w-72"
        />
        <span className="text-sm text-muted-foreground">
          {loading ? 'กำลังโหลด...' : `${formatDate(dateFrom)} – ${formatDate(dateTo)}`}
        </span>
      </div>

      {/* Payment mix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <SectionCard icon={Banknote} title="ช่องทางรับเงิน (ขาย)" tint="primary">
          {payRow('เงินสด', sum.cash_amount)}
          {payRow('บัตร', sum.card_amount)}
          {payRow('เงินโอน', sum.transfer_amount)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm text-muted-foreground">บิลเครดิต (ค้างชำระ)</span>
            <span className="text-sm font-semibold tabular-nums text-warning-strong">{sum.credit_count.toLocaleString()} บิล</span>
          </div>
        </SectionCard>

        <SectionCard icon={ArrowLeftRight} title="การชำระเงินซื้อ" tint="info-soft">
          {payRow('เงินสด', sum.purchase_cash)}
          {payRow('เครดิต', sum.purchase_credit)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm text-muted-foreground">เจ้าหนี้คงค้างปัจจุบัน</span>
            <span className="text-sm font-semibold tabular-nums text-warning-strong">{formatCurrency(sum.payable_total)}</span>
          </div>
        </SectionCard>
      </div>

      {/* Daily trend */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center">
          <span>แนวโน้มรายวัน — {trend.length.toLocaleString()} วัน</span>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">วันที่</TableHead>
                <TableHead className="text-right">ขายสุทธิ</TableHead>
                <TableHead className="text-right">ต้นทุน</TableHead>
                <TableHead className="text-right">กำไร</TableHead>
                <TableHead className="text-right">ยอดซื้อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : trend.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <LineChart className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีข้อมูลในช่วงเวลานี้
                  </TableCell>
                </TableRow>
              ) : trend.map(r => (
                <TableRow key={r.date}>
                  <TableCell className="text-sm tabular-nums">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-foreground">{formatCurrency(r.sales_net)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(r.sales_cost)}</TableCell>
                  <TableCell className={`text-right text-sm font-semibold tabular-nums ${r.sales_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(r.sales_profit)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(r.purchase_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
