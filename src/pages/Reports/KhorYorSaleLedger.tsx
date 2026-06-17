import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MultiDatePicker, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { useToast } from '@/components/ui/toast'
import { formatThaiShortBE } from '@/lib/thaiDate'
import type { Setting } from '@/types'
import type { ReportsOutletContext } from './index'
import { ArrowLeft, Printer } from 'lucide-react'

interface SaleLedgerRow {
  lot_id: number | null
  product_id: number
  drug_name: string
  supplier_name: string
  lot_number: string
  qty_received: number
  lot_received_date: string | null
  sold_at: string
  qty: number
  unit_name: string
  customer_code: string | null
  customer_full_name: string
  customer_name_free: string
}

interface KhorYorSaleLedgerProps {
  formCode: string
  title: string
  flag: 10 | 11
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

// Min sale rows rendered per lot section, padded with empty rows so the
// official form keeps a uniform body even with one or two real sales.
const SECTION_MIN_ROWS = 6

export default function KhorYorSaleLedger({ formCode, title, flag }: KhorYorSaleLedgerProps) {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ReportsOutletContext>()

  const [dateMode, setDateMode] = useState<MultiDateMode>('custom')
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [rows, setRows] = useState<SaleLedgerRow[] | null>(null)
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
      .khorYorSale({ form: flag, date_from: dateFrom, date_to: dateTo })
      .then((data: SaleLedgerRow[]) => {
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
  }, [dateFrom, dateTo, flag, toast])

  const isEmpty = !loading && rows && rows.length === 0
  const displayRows = rows ?? []

  // Group lot-cut rows into per-lot sections — one header block + its sale rows.
  const sections = useMemo(() => {
    const map = new Map<string, { head: SaleLedgerRow; rows: SaleLedgerRow[] }>()
    for (const r of displayRows) {
      const key = r.lot_id != null ? `L${r.lot_id}` : `P${r.product_id}:${r.lot_number}`
      if (!map.has(key)) map.set(key, { head: r, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.values())
  }, [displayRows])

  const HEADERS = [
    'ลำดับที่',
    'วัน เดือน ปี ที่ขาย',
    'จำนวน / ปริมาณที่ขาย',
    'ชื่อ - สกุล ผู้ซื้อ',
    'ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ',
    'หมายเหตุ',
  ]

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      {/* Filter strip — hidden when printing */}
      <div className="no-print h-12 px-2 bg-card rounded-card border border-border shadow-card flex items-center gap-2 shrink-0">
        <Button asChild variant="outline" size="icon-lg" tooltip="ย้อนกลับ">
          <Link to="/reports/fda"><ArrowLeft /></Link>
        </Button>
        <MultiDatePicker
          mode={dateMode}
          from={dateFrom}
          to={dateTo}
          onChange={(m, f, t) => { setDateMode(m); setDateFrom(f); setDateTo(t) }}
          className="shrink-0"
        />
        <div className="flex-1" />
        <Button size="lg" className="h-9 px-4" onClick={() => window.print()}>
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
              <span className="absolute right-0 top-0 text-sm">แบบ {formCode}</span>
              <h1 className="text-xl font-semibold text-center pt-1">{title}</h1>
              <div className="mt-3 text-center text-sm">
                <span className="inline-block min-w-[480px] border-b border-dotted border-foreground/60 pb-0.5">
                  {shopName || ' '}
                </span>
                <div className="text-foreground-subtle mt-1">(ชื่อสถานที่ขายยา)</div>
              </div>
            </div>

            {loading && (
              <div className="mt-6 space-y-6">
                {Array.from({ length: 2 }).map((_, s) => (
                  <div key={`sk-${s}`}>
                    <div className="space-y-2 pb-3 border-b border-dotted border-foreground/60">
                      {Array.from({ length: 3 }).map((__, li) => (
                        <div key={li} className="h-3 rounded bg-muted/60 animate-pulse" style={{ width: `${60 + li * 10}%` }} />
                      ))}
                    </div>
                    <table className="mt-3 w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                      <tbody>
                        {Array.from({ length: SECTION_MIN_ROWS }).map((__, i) => (
                          <tr key={i}>
                            {Array.from({ length: 6 }).map((___, j) => (
                              <td key={j} className="border border-foreground/80 px-2 py-1 h-8">
                                <div className="h-3 rounded bg-muted/60 animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {!loading && sections.map(({ head, rows: saleRows }, si) => {
              const fillerCount = Math.max(0, SECTION_MIN_ROWS - saleRows.length)
              return (
                <div key={head.lot_id != null ? `L${head.lot_id}` : `P${head.product_id}-${si}`} className="mt-6 break-inside-avoid">
                  {/* Lot header block */}
                  <div className="text-sm space-y-1 pb-2 border-b border-dotted border-foreground/60">
                    <div>
                      <span className="text-foreground-subtle">ชื่อยา</span>{' '}
                      <span className="font-medium">{head.drug_name}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>
                        <span className="text-foreground-subtle">ชื่อผู้ผลิต / ผู้นำเข้า</span>{' '}
                        <span className="inline-block min-w-[140px] border-b border-dotted border-foreground/60">&nbsp;</span>
                      </span>
                      <span>
                        <span className="text-foreground-subtle">เลขที่หรืออักษรของครั้งที่ผลิต</span>{' '}
                        <span className="font-medium">{head.lot_number || ' '}</span>
                      </span>
                      <span>
                        <span className="text-foreground-subtle">ขนาดบรรจุ</span>{' '}
                        <span className="inline-block min-w-[100px] border-b border-dotted border-foreground/60">&nbsp;</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>
                        <span className="text-foreground-subtle">ได้มาจาก</span>{' '}
                        <span className="font-medium">{head.supplier_name || ' '}</span>
                      </span>
                      <span>
                        <span className="text-foreground-subtle">จำนวนรับ</span>{' '}
                        <span className="font-medium">{formatQty(head.qty_received)}{head.unit_name ? ` ${head.unit_name}` : ''}</span>
                      </span>
                      <span>
                        <span className="text-foreground-subtle">วันที่รับ</span>{' '}
                        <span className="font-medium">{formatThaiShortBE(head.lot_received_date)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Sale rows table */}
                  <table className="mt-3 w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        {HEADERS.map((h) => (
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
                      {saleRows.map((r, i) => {
                        const buyer = r.customer_code === 'C0000' ? (r.customer_name_free || '') : r.customer_full_name
                        return (
                          <tr key={i}>
                            <td className="border border-foreground/80 px-2 py-1 text-center">{i + 1}</td>
                            <td className="border border-foreground/80 px-2 py-1 text-center">{formatThaiShortBE(r.sold_at)}</td>
                            <td className="border border-foreground/80 px-2 py-1 text-center">
                              {formatQty(r.qty)}{r.unit_name ? ` ${r.unit_name}` : ''}
                            </td>
                            <td className="border border-foreground/80 px-2 py-1">{buyer}</td>
                            <td className="border border-foreground/80 px-2 py-1"></td>
                            <td className="border border-foreground/80 px-2 py-1"></td>
                          </tr>
                        )
                      })}
                      {Array.from({ length: fillerCount }).map((_, i) => (
                        <tr key={`f-${i}`}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="border border-foreground/80 px-2 py-1 h-8"></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}

            {isEmpty && (
              <div className="no-print mt-6 text-center text-sm italic text-muted-foreground">
                ไม่มีรายการขายยาในช่วงวันที่ที่เลือก
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
