import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import {
  PeriodPicker, defaultPeriodFor, allowedModesFor, type PeriodMode,
} from '@/components/ui/period-picker'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import {
  Wallet, CreditCard, ArrowLeftRight, Banknote, CalendarCheck, Clock,
  AlertTriangle, CircleAlert, FileText, LineChart,
} from 'lucide-react'

interface PurchaseSummary {
  purchase_total: number
  purchase_cash: number
  purchase_credit: number
  purchase_count: number
  payable_total: number
  payable_count: number
}

interface TrendRow {
  date: string
  purchase_total: number
}

interface PayableRow {
  invoice_no: string
  supplier_invoice_no: string | null
  received_at: string
  due_date: string | null
  supplier_name: string | null
  amount: number
  days_overdue: number | null
}

interface PayablesResult {
  rows: PayableRow[]
  total: number
  count: number
  buckets: { not_due: number; d1_30: number; d31_60: number; d60_plus: number }
}

const EMPTY_SUM: PurchaseSummary = {
  purchase_total: 0, purchase_cash: 0, purchase_credit: 0, purchase_count: 0,
  payable_total: 0, payable_count: 0,
}

const EMPTY_PAY: PayablesResult = {
  rows: [], total: 0, count: 0,
  buckets: { not_due: 0, d1_30: 0, d31_60: 0, d60_plus: 0 },
}

const FREE_RANGE_DAYS = 7

function inclusiveDayCount(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

function payRow(label: string, value: number, muted = false) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>{label}</span>
      <span className="text-sm font-semibold text-foreground">{formatCurrency(value)}</span>
    </div>
  )
}

function dueBadge(days: number | null) {
  if (days == null) return <Badge variant="secondary">ไม่ระบุกำหนด</Badge>
  if (days <= 0) return <Badge variant="brand-soft">ยังไม่ครบกำหนด</Badge>
  if (days <= 30) return <Badge variant="warning">เกิน {days} วัน</Badge>
  if (days <= 60) return <Badge variant="warm">เกิน {days} วัน</Badge>
  return <Badge variant="danger">เกิน {days} วัน</Badge>
}

export default function ReportsPurchasesPage() {
  const { toast } = useToast()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()
  const isOwner = useUserStore(s => s.current?.role === 'admin')

  const initial = defaultPeriodFor(isOwner)
  const [mode, setMode] = useState<PeriodMode>(initial.mode)
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)

  const [sum, setSum] = useState<PurchaseSummary>(EMPTY_SUM)
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [payables, setPayables] = useState<PayablesResult>(EMPTY_PAY)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // financeSummary returns sales+purchases; we only consume the purchase
      // fields here. Payables is CURRENT outstanding (not date-bound) — see
      // reports:accountsPayable comment.
      const [s, t, p] = await Promise.all([
        (window.api.reports as any).financeSummary({ date_from: dateFrom, date_to: dateTo }),
        (window.api.reports as any).salesPurchaseTrend({ date_from: dateFrom, date_to: dateTo }),
        (window.api.reports as any).accountsPayable(),
      ])
      setSum({
        purchase_total: s?.purchase_total ?? 0,
        purchase_cash: s?.purchase_cash ?? 0,
        purchase_credit: s?.purchase_credit ?? 0,
        purchase_count: s?.purchase_count ?? 0,
        payable_total: s?.payable_total ?? 0,
        payable_count: s?.payable_count ?? 0,
      })
      setTrend((t ?? []).map((r: any) => ({ date: r.date, purchase_total: r.purchase_total })))
      setPayables(p ?? EMPTY_PAY)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

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

  useEffect(() => {
    setSummary([
      { label: 'ยอดซื้อ', value: formatCurrency(sum.purchase_total), sub: `${sum.purchase_count.toLocaleString()} บิล`, icon: Wallet, tint: 'primary' },
      { label: 'เงินสด', value: formatCurrency(sum.purchase_cash), icon: Banknote, tint: 'success' },
      { label: 'เครดิต', value: formatCurrency(sum.purchase_credit), icon: ArrowLeftRight, tint: 'info-soft' },
      {
        label: 'หนี้ค้างชำระ',
        value: formatCurrency(sum.payable_total),
        sub: `${sum.payable_count.toLocaleString()} บิล`,
        icon: CreditCard,
        tint: sum.payable_total > 0 ? 'warning' : 'success',
      },
    ])
  }, [sum, setSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. FdaReports/KhorYor9 which have no summary of their own).
  useEffect(() => {
    return () => setSummary(null)
  }, [setSummary])

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

  const b = payables.buckets

  return (
    /* Page scroll lives on ReportsLayout. Inner tables keep their own
       max-h caps so a long payables list doesn't dominate the page flow. */
    <div className="flex flex-col gap-2">
      {/* Breakdown: payment mix + daily trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <SectionCard icon={ArrowLeftRight} title="ช่องทางชำระ" tint="primary">
          {payRow('เงินสด', sum.purchase_cash)}
          {payRow('เครดิต', sum.purchase_credit)}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">รวมยอดซื้อ</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(sum.purchase_total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">จำนวนบิล</span>
            <span className="text-sm font-semibold">{sum.purchase_count.toLocaleString()} บิล</span>
          </div>
        </SectionCard>

        <SectionCard icon={CreditCard} title="หนี้ค้างชำระปัจจุบัน (ไม่อิงช่วงวันที่)" tint="warning">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <CalendarCheck className="size-3.5" /> ยังไม่ครบกำหนด
            </span>
            <span className="text-sm font-semibold text-foreground">{formatCurrency(b.not_due)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-warning-strong" /> เกิน 1–30 วัน
            </span>
            <span className="text-sm font-semibold text-warning-strong">{formatCurrency(b.d1_30)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-warning-strong" /> เกิน 31–60 วัน
            </span>
            <span className="text-sm font-semibold text-warning-strong">{formatCurrency(b.d31_60)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <CircleAlert className="size-3.5 text-destructive" /> เกิน 60 วัน
            </span>
            <span className="text-sm font-semibold text-destructive">{formatCurrency(b.d60_plus)}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">รวม</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(payables.total)}</span>
          </div>
        </SectionCard>
      </div>

      {/* Daily purchase trend — caps at 280px so it doesn't dominate the
          page-level scroll on long ranges; rows above that scroll inside. */}
      <div className="flex flex-col bg-card rounded-card shadow-card overflow-hidden shrink-0">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center">
          <span>ยอดซื้อรายวัน</span>
        </div>

        <div className="[&>[data-slot=table-container]]:max-h-[280px] [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">วันที่</TableHead>
                <TableHead className="text-right">ยอดซื้อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-12">กำลังโหลด...</TableCell>
                </TableRow>
              ) : trend.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-12">
                    <LineChart className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีข้อมูลในช่วงเวลานี้
                  </TableCell>
                </TableRow>
              ) : trend.map(r => (
                <TableRow key={r.date}>
                  <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-foreground">{formatCurrency(r.purchase_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Outstanding payables list — current (not date-bound). Caps at 480px
          inside the page-level scroll so a long list doesn't bury the rest. */}
      <div className="flex flex-col bg-card rounded-card shadow-card overflow-hidden shrink-0">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center">
          <span>{loading ? 'กำลังโหลด...' : `หนี้ค้างชำระ ${payables.count.toLocaleString()} บิล (ปัจจุบัน — ไม่อิงช่วงวันที่)`}</span>
        </div>

        <div className="[&>[data-slot=table-container]]:max-h-[480px] [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">เลขที่ใบรับ</TableHead>
                <TableHead className="min-w-[200px]">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="w-36">เลขใบกำกับ</TableHead>
                <TableHead className="w-28">วันที่รับ</TableHead>
                <TableHead className="w-28">ครบกำหนด</TableHead>
                <TableHead className="w-40">สถานะ</TableHead>
                <TableHead className="text-right w-32">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : payables.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <FileText className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีหนี้ค้างชำระ
                  </TableCell>
                </TableRow>
              ) : payables.rows.map(r => {
                const overdue = (r.days_overdue ?? 0) > 0
                return (
                  <TableRow key={r.invoice_no} className={overdue ? 'bg-destructive-soft/30' : ''}>
                    <TableCell className="font-semibold text-sm">{r.invoice_no}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={r.supplier_name ?? ''}>
                      {r.supplier_name || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate" title={r.supplier_invoice_no ?? ''}>
                      {r.supplier_invoice_no || <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(r.received_at)}</TableCell>
                    <TableCell className="text-sm">
                      {r.due_date ? formatDate(r.due_date) : <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell>{dueBadge(r.days_overdue)}</TableCell>
                    <TableCell className="text-right text-sm font-bold text-foreground">
                      {formatCurrency(r.amount)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between shrink-0">
          <span className="text-sm text-muted-foreground">{payables.count.toLocaleString()} บิล</span>
          <span className="text-base font-bold text-foreground">รวม {formatCurrency(payables.total)}</span>
        </div>
      </div>
    </div>
  )
}
