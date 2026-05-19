import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import { Wallet, CalendarCheck, Clock, AlertTriangle, CircleAlert, FileText } from 'lucide-react'

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

const EMPTY: PayablesResult = {
  rows: [], total: 0, count: 0,
  buckets: { not_due: 0, d1_30: 0, d31_60: 0, d60_plus: 0 },
}

// Plain render helper (NOT a component — keeps page free of local JSX components)
function dueBadge(days: number | null) {
  if (days == null) return <Badge variant="secondary">ไม่ระบุกำหนด</Badge>
  if (days <= 0) return <Badge variant="brand-soft">ยังไม่ครบกำหนด</Badge>
  if (days <= 30) return <Badge variant="warning">เกิน {days} วัน</Badge>
  if (days <= 60) return <Badge variant="warm">เกิน {days} วัน</Badge>
  return <Badge variant="danger">เกิน {days} วัน</Badge>
}

export default function ReportsPayablesPage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  const [data, setData] = useState<PayablesResult>(EMPTY)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (window.api.reports as any).accountsPayable() as PayablesResult
      setData(res ?? EMPTY)
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const b = data.buckets
  useEffect(() => {
    setSummary([
      { label: 'รวมคงค้าง', value: formatCurrency(data.total), sub: `${data.count.toLocaleString()} บิล`, icon: Wallet, tint: data.total > 0 ? 'warning' : 'success' },
      { label: 'ยังไม่ครบกำหนด', value: formatCurrency(b.not_due), icon: CalendarCheck, tint: 'info-soft' },
      { label: 'เกิน 1–30 วัน', value: formatCurrency(b.d1_30), icon: Clock, tint: 'warning' },
      { label: 'เกิน 31–60 วัน', value: formatCurrency(b.d31_60), icon: AlertTriangle, tint: 'warm' },
      { label: 'เกิน 60 วัน', value: formatCurrency(b.d60_plus), icon: CircleAlert, tint: b.d60_plus > 0 ? 'destructive' : 'success' },
    ])
  }, [data, b, setSummary])

  return (
    <>
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center">
          <span>{loading ? 'กำลังโหลด...' : `เจ้าหนี้การค้าค้างชำระ ${data.count.toLocaleString()} บิล`}</span>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
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
              ) : data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <FileText className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีเจ้าหนี้การค้าค้างชำระ
                  </TableCell>
                </TableRow>
              ) : data.rows.map(r => {
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
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(r.received_at)}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.due_date ? formatDate(r.due_date) : <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                    <TableCell>{dueBadge(r.days_overdue)}</TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums text-foreground">
                      {formatCurrency(r.amount)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between shrink-0">
          <span className="text-sm text-muted-foreground">{data.count.toLocaleString()} บิล</span>
          <span className="text-base font-bold tabular-nums text-foreground">รวม {formatCurrency(data.total)}</span>
        </div>
      </div>
    </>
  )
}
