import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MultiDatePicker, rangeForMultiMode, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TintIcon } from '@/components/ui/tint-icon'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { ReportsOutletContext } from './index'
import { ReceiptText, ShoppingCart, Landmark, Wallet, Info } from 'lucide-react'

// VAT report (ภาษีขาย / ภาษีซื้อ / ภ.พ.30) — VAT-registered shops only (the
// tab itself is hidden for NO-VAT shops in Reports/index.tsx). Window defaults
// to the current month — the natural ภ.พ.30 filing period.

interface VatSaleRow {
  invoice_no: string
  sold_at: string
  sale_type: string
  total_amount: number
  total_vat: number
}

interface VatPurchaseRow {
  invoice_no: string
  supplier_invoice_no?: string
  supplier_name?: string
  created_at: string
  vat_mode: 'inclusive' | 'exclusive'
  vat_rate: number
  vat_amount: number
  total_cost: number
}

interface VatExpenseRow {
  expense_no: string
  expense_date: string
  category_name?: string
  amount: number
  vat_amount: number
}

interface VatSummaryData {
  output: { vat_total: number; amount_total: number; bill_count: number }
  input: {
    purchase_vat: number; purchase_count: number
    expense_vat: number; expense_count: number
    vat_total: number
  }
  net_vat: number
  sales_rows: VatSaleRow[]
  purchase_rows: VatPurchaseRow[]
  expense_rows: VatExpenseRow[]
}

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}

export default function VatReportPage() {
  const { toast } = useToast()
  const { setSummary, setToolbar } = useOutletContext<ReportsOutletContext>()

  const initial = rangeForMultiMode('month')
  const [dateMode, setDateMode] = useState<MultiDateMode>('month')
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)
  const [data, setData] = useState<VatSummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    ;(window.api.reports as any).vatSummary({ date_from: dateFrom, date_to: dateTo })
      .then((d: VatSummaryData) => setData(d))
      .catch((e: any) => toast({ title: 'โหลดรายงานภาษีไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, toast])

  useEffect(() => { load() }, [load])

  // Toolbar — date window picker, right-aligned on the TabStrip
  useEffect(() => {
    setToolbar(
      <MultiDatePicker
        mode={dateMode}
        from={dateFrom}
        to={dateTo}
        onChange={(m, f, t) => { setDateMode(m); setDateFrom(f); setDateTo(t) }}
        className="shrink-0"
      />,
    )
    return () => setToolbar(null)
  }, [setToolbar, dateMode, dateFrom, dateTo])

  // Summary cards — output / input / ภ.พ.30 net
  useEffect(() => {
    if (!data) { setSummary(null); return }
    const net = data.net_vat
    setSummary([
      {
        label: 'ภาษีขาย (Output VAT)',
        value: formatCurrency(data.output.vat_total),
        sub: `${data.output.bill_count.toLocaleString()} บิล`,
        icon: ReceiptText,
        tint: 'primary',
      },
      {
        label: 'ภาษีซื้อ (Input VAT)',
        value: formatCurrency(data.input.vat_total),
        sub: `ซื้อ ${data.input.purchase_count.toLocaleString()} บิล · ค่าใช้จ่าย ${data.input.expense_count.toLocaleString()} รายการ`,
        icon: ShoppingCart,
        tint: 'info',
      },
      {
        label: net >= 0 ? 'ภ.พ.30 — ภาษีต้องนำส่ง' : 'ภ.พ.30 — ภาษีชำระเกิน (ขอคืน/ยกยอด)',
        value: formatCurrency(Math.abs(net)),
        sub: 'ภาษีขาย − ภาษีซื้อ',
        icon: Landmark,
        tint: net >= 0 ? 'warning' : 'success',
      },
    ])
    return () => setSummary(null)
  }, [data, setSummary])

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* ภาษีขาย */}
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 flex items-center gap-3">
          <TintIcon icon={ReceiptText} tint="primary" size="sm" />
          <h3 className="text-base font-semibold text-foreground">รายงานภาษีขาย</h3>
          <Badge variant="neutral-outline">{(data?.sales_rows.length ?? 0).toLocaleString()} บิล</Badge>
          <div className="ml-auto text-sm text-muted-foreground">
            รวมภาษีขาย <span className="font-bold text-foreground">{formatCurrency(data?.output.vat_total ?? 0)}</span>
          </div>
        </div>
        <Table containerClassName="max-h-[320px] scrollbar-thin">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">เลขที่บิล</TableHead>
              <TableHead>วันที่</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead className="text-right">มูลค่ารวม VAT</TableHead>
              <TableHead className="text-right">มูลค่าก่อนภาษี</TableHead>
              <TableHead className="text-right pr-4">ภาษีขาย</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.sales_rows ?? []).map(r => (
              <TableRow key={r.invoice_no}>
                <TableCell className="pl-4 font-medium">{r.invoice_no}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateTime(r.sold_at)}</TableCell>
                <TableCell className="text-sm">{SALE_TYPE_LABELS[r.sale_type] ?? r.sale_type}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.total_amount)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(r.total_amount - r.total_vat)}</TableCell>
                <TableCell className="text-right pr-4 font-semibold">{formatCurrency(r.total_vat)}</TableCell>
              </TableRow>
            ))}
            {!loading && (data?.sales_rows.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ไม่มีบิลขายที่มี VAT ในช่วงที่เลือก</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ภาษีซื้อ — จากการรับสินค้า */}
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 flex items-center gap-3">
          <TintIcon icon={ShoppingCart} tint="info" size="sm" />
          <h3 className="text-base font-semibold text-foreground">รายงานภาษีซื้อ — รับสินค้า</h3>
          <Badge variant="neutral-outline">{(data?.purchase_rows.length ?? 0).toLocaleString()} บิล</Badge>
          <div className="ml-auto text-sm text-muted-foreground">
            รวมภาษีซื้อ <span className="font-bold text-foreground">{formatCurrency(data?.input.purchase_vat ?? 0)}</span>
          </div>
        </div>
        <Table containerClassName="max-h-[320px] scrollbar-thin">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">เลขที่ใบรับ</TableHead>
              <TableHead>ผู้จัดจำหน่าย</TableHead>
              <TableHead>วันที่รับ</TableHead>
              <TableHead>รูปแบบ</TableHead>
              <TableHead className="text-right">มูลค่ารายการ</TableHead>
              <TableHead className="text-right pr-4">ภาษีซื้อ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.purchase_rows ?? []).map(r => (
              <TableRow key={r.invoice_no}>
                <TableCell className="pl-4 font-medium">{r.invoice_no}</TableCell>
                <TableCell className="text-sm">{r.supplier_name ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                <TableCell>
                  {r.vat_mode === 'inclusive'
                    ? <Badge variant="info-outline">รวมในราคา {r.vat_rate}%</Badge>
                    : <Badge variant="violet-outline">แยกนอกราคา {r.vat_rate}%</Badge>}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(r.total_cost)}</TableCell>
                <TableCell className="text-right pr-4 font-semibold">{formatCurrency(r.vat_amount)}</TableCell>
              </TableRow>
            ))}
            {!loading && (data?.purchase_rows.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ไม่มีบิลรับสินค้าที่มี VAT ในช่วงที่เลือก</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ภาษีซื้อ — จากค่าใช้จ่าย */}
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 flex items-center gap-3">
          <TintIcon icon={Wallet} tint="warm" size="sm" />
          <h3 className="text-base font-semibold text-foreground">รายงานภาษีซื้อ — ค่าใช้จ่าย</h3>
          <Badge variant="neutral-outline">{(data?.expense_rows.length ?? 0).toLocaleString()} รายการ</Badge>
          <div className="ml-auto text-sm text-muted-foreground">
            รวมภาษีซื้อ <span className="font-bold text-foreground">{formatCurrency(data?.input.expense_vat ?? 0)}</span>
          </div>
        </div>
        <Table containerClassName="max-h-[320px] scrollbar-thin">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">เลขที่</TableHead>
              <TableHead>วันที่</TableHead>
              <TableHead>หมวด</TableHead>
              <TableHead className="text-right">ยอดจ่าย</TableHead>
              <TableHead className="text-right pr-4">ภาษีซื้อ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.expense_rows ?? []).map(r => (
              <TableRow key={r.expense_no}>
                <TableCell className="pl-4 font-medium">{r.expense_no}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.expense_date)}</TableCell>
                <TableCell className="text-sm">{r.category_name ?? 'ไม่ระบุหมวด'}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(r.amount)}</TableCell>
                <TableCell className="text-right pr-4 font-semibold">{formatCurrency(r.vat_amount)}</TableCell>
              </TableRow>
            ))}
            {!loading && (data?.expense_rows.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">ไม่มีค่าใช้จ่ายที่มีใบกำกับภาษีในช่วงที่เลือก</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-muted/50 px-3 py-2 flex items-start gap-1.5 text-sm text-muted-foreground">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>
          ตัวเลขภาษีขายมาจากค่าที่บันทึกไว้ในแต่ละบิล ณ เวลาขาย (ไม่นับบิลที่ถูกยกเลิก).
          บิลคืนสินค้ายังไม่หักภาษีขาย — ระบบใบลดหนี้ยังไม่เปิดใช้งาน.
          ภาษีซื้อนับเฉพาะบิลรับสินค้าที่ระบุ VAT และค่าใช้จ่ายที่มีใบกำกับภาษีเต็มรูปเท่านั้น
        </span>
      </div>
    </div>
  )
}
