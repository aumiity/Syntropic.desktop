import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useToast } from '@/components/ui/toast'
import { formatThaiShortBE } from '@/lib/thaiDate'
import type { Setting } from '@/types'
import type { ReportsOutletContext } from './index'
import { ArrowLeft, Printer } from 'lucide-react'

interface KhorYor9Row {
  invoice_no: string
  purchase_date: string
  supplier_name: string
  drug_name: string
  lot_number: string
  qty: number
  unit_name: string
}

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatQty(n: number): string {
  if (n == null || isNaN(n)) return ''
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString()
}

const FILLER_MIN_ROWS = 16

export default function KhorYor9Page() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [rows, setRows] = useState<KhorYor9Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('')

  useEffect(() => { setSummary(null) }, [setSummary])

  useEffect(() => {
    (window.api.settings as any).getShop().then((data: Setting | null) => {
      setShopName(data?.shop_name ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window.api.reports as any)
      .khorYor9({ date_from: dateFrom, date_to: dateTo })
      .then((data: KhorYor9Row[]) => {
        if (cancelled) return
        setRows(data)
        setLoading(false)
      })
      .catch((err: any) => {
        if (cancelled) return
        toast({ title: 'โหลดรายงานไม่สำเร็จ', description: String(err?.message ?? err), variant: 'destructive' })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, toast])

  const isEmpty = !loading && rows && rows.length === 0
  const displayRows = rows ?? []
  const fillerCount = Math.max(0, FILLER_MIN_ROWS - displayRows.length)

  // Skeleton rows during initial load — share the same border grid so the
  // table dimensions don't jump when real data arrives.
  const skeletonRows = useMemo(
    () => loading ? Array.from({ length: FILLER_MIN_ROWS }) : [],
    [loading],
  )

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      {/* Filter strip — hidden when printing */}
      <div className="no-print h-14 px-2 bg-card rounded-card shadow-card flex items-center gap-2 shrink-0">
        <Button asChild variant="outline" size="icon-lg" title="ย้อนกลับ">
          <Link to="/reports/fda"><ArrowLeft /></Link>
        </Button>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
          className="w-60 shrink-0 bg-input hover:bg-surface-hover"
        />
        <div className="flex-1" />
        <Button size="lg" className="h-10 px-4" onClick={() => window.print()}>
          <Printer className="size-4" /> พิมพ์
        </Button>
      </div>

      {/* A4 landscape preview — also the print surface */}
      <div className="flex-1 min-h-0 overflow-auto bg-muted/40 [scrollbar-gutter:stable]">
        <div className="mx-auto my-6 print:m-0">
          <div
            className="print-area bg-card text-foreground shadow-card mx-auto"
            style={{ width: '1123px', minHeight: '794px', padding: '32px 40px' }}
          >
            <div className="relative">
              <span className="absolute right-0 top-0 text-sm">แบบ ข.ย. ๙</span>
              <h1 className="text-xl font-semibold text-center pt-1">บัญชีการซื้อยา</h1>
              <div className="mt-3 text-center text-sm">
                <span className="inline-block min-w-[480px] border-b border-dotted border-foreground/60 pb-0.5">
                  {shopName || ' '}
                </span>
                <div className="text-foreground-subtle mt-1">(ชื่อสถานที่ขายยา)</div>
              </div>
            </div>

            <table className="mt-6 w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  {[
                    'ลำดับที่',
                    'วัน เดือน ปี ที่ซื้อ',
                    'ชื่อผู้ขาย',
                    'ชื่อยา',
                    'เลขที่หรืออักษรของครั้งที่ผลิต',
                    'จำนวน / ปริมาณ',
                    'ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ',
                    'หมายเหตุ',
                  ].map((h) => (
                    <th
                      key={h}
                      className="border border-foreground/80 px-2 py-2 text-sm font-semibold text-center align-middle bg-card"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && skeletonRows.map((_, i) => (
                  <tr key={`s-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="border border-foreground/80 px-2 py-1 h-8">
                        <div className="h-3 rounded bg-muted/60 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && displayRows.map((r, i) => (
                  <tr key={`${r.invoice_no}-${i}`}>
                    <td className="border border-foreground/80 px-2 py-1 text-center">{i + 1}</td>
                    <td className="border border-foreground/80 px-2 py-1 text-center">{formatThaiShortBE(r.purchase_date)}</td>
                    <td className="border border-foreground/80 px-2 py-1">{r.supplier_name}</td>
                    <td className="border border-foreground/80 px-2 py-1">{r.drug_name}</td>
                    <td className="border border-foreground/80 px-2 py-1">{r.lot_number}</td>
                    <td className="border border-foreground/80 px-2 py-1 text-center">
                      {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
                    </td>
                    <td className="border border-foreground/80 px-2 py-1"></td>
                    <td className="border border-foreground/80 px-2 py-1"></td>
                  </tr>
                ))}
                {!loading && Array.from({ length: fillerCount }).map((_, i) => (
                  <tr key={`f-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="border border-foreground/80 px-2 py-1 h-8"></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {isEmpty && (
              <div className="no-print mt-4 text-center text-sm italic text-muted-foreground">
                ไม่มีรายการซื้อยาในช่วงวันที่ที่เลือก
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
