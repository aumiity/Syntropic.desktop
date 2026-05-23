import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import {
  Banknote, TrendingUp, ShoppingBag, Receipt, Percent, LineChart,
} from 'lucide-react'

interface SalesSummary {
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
}

interface TrendRow {
  date: string
  sales_net: number
  sales_cost: number
  sales_profit: number
}

const EMPTY: SalesSummary = {
  sales_subtotal: 0, sales_discount: 0, sales_net: 0, sales_cost: 0, sales_profit: 0,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, credit_count: 0, sale_count: 0,
}

const FREE_RANGE_DAYS = 7

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function inclusiveDayCount(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

function payRow(label: string, value: number, muted = false) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(value)}</span>
    </div>
  )
}

export default function ReportsSalesPage() {
  const { toast } = useToast()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()
  const isOwner = useUserStore(s => s.current?.role === 'admin')

  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(daysAgoIso(FREE_RANGE_DAYS - 1))
  const [dateTo, setDateTo] = useState(today)

  const [sum, setSum] = useState<SalesSummary>(EMPTY)
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

  const handleRangeChange = useCallback((f: string, t: string) => {
    if (!isOwner && f && t && inclusiveDayCount(f, t) > FREE_RANGE_DAYS) {
      const clampedFrom = new Date(t)
      clampedFrom.setDate(clampedFrom.getDate() - (FREE_RANGE_DAYS - 1))
      setDateFrom(clampedFrom.toISOString().slice(0, 10))
      setDateTo(t)
      toast(`ดูข้อมูลย้อนหลังได้สูงสุด ${FREE_RANGE_DAYS} วัน — ช่วงที่กว้างกว่านี้ต้องใช้สิทธิ์เจ้าของร้าน`, 'error')
      return
    }
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

  useEffect(() => {
    setSummary([
      { label: 'ยอดขายสุทธิ', value: formatCurrency(sum.sales_net), sub: `${sum.sale_count.toLocaleString()} บิล`, icon: ShoppingBag, tint: 'primary' },
      {
        label: 'กำไรขั้นต้น',
        value: formatCurrency(sum.sales_profit),
        sub: margin,
        icon: TrendingUp,
        tint: sum.sales_profit >= 0 ? 'success' : 'destructive',
      },
      { label: 'ยอดก่อนหักลด', value: formatCurrency(sum.sales_subtotal), icon: Receipt, tint: 'info-soft' },
      { label: 'ส่วนลดรวม', value: formatCurrency(sum.sales_discount), icon: Percent, tint: 'warm' },
    ])
  }, [sum, margin, setSummary])

  useEffect(() => {
    setToolbar(
      <DateRangePicker
        from={dateFrom}
        to={dateTo}
        onChange={handleRangeChange}
        align="end"
        className="h-10 w-72 bg-card shadow-card hover:bg-card"
      />,
    )
    return () => setToolbar(null)
  }, [dateFrom, dateTo, handleRangeChange, setToolbar])

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <SectionCard icon={Receipt} title="สรุปรายได้-กำไร" tint="primary">
          {payRow('ยอดก่อนหักลด', sum.sales_subtotal)}
          {payRow('ส่วนลดขาย', sum.sales_discount, true)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">ยอดขายสุทธิ</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(sum.sales_net)}</span>
          </div>
          {payRow('ต้นทุนขาย', sum.sales_cost, true)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">
              กำไรขั้นต้น{margin ? <span className="text-muted-foreground font-normal"> · {margin}</span> : ''}
            </span>
            <span className={`text-sm font-bold tabular-nums ${sum.sales_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(sum.sales_profit)}
            </span>
          </div>
        </SectionCard>

        <SectionCard icon={Banknote} title="ช่องทางรับเงิน" tint="success">
          {payRow('เงินสด', sum.cash_amount)}
          {payRow('บัตร', sum.card_amount)}
          {payRow('เงินโอน', sum.transfer_amount)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm text-muted-foreground">บิลเครดิต (ค้างชำระ)</span>
            <span className="text-sm font-semibold tabular-nums text-warning-strong">{sum.credit_count.toLocaleString()} บิล</span>
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center">
          <span>ยอดขายรายวัน</span>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">วันที่</TableHead>
                <TableHead className="text-right">ยอดขายสุทธิ</TableHead>
                <TableHead className="text-right">ต้นทุน</TableHead>
                <TableHead className="text-right">กำไร</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : trend.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-16">
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{trend.length.toLocaleString()}</span> วัน</>}
          </span>
        </div>
      </div>
    </>
  )
}
