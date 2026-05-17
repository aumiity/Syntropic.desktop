import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { PurchaseReceiptDialog } from '@/components/dialogs/PurchaseReceiptDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Supplier } from '@/types'
import type { ReportsOutletContext } from './index'
import { Search, Truck, Wallet, Boxes, AlertTriangle, PackagePlus } from 'lucide-react'

interface PurchaseRow {
  invoice_no: string
  receive_date: string
  supplier_id: number
  supplier_name?: string
  payment_type: string
  is_paid: number
  due_date?: string
  item_count: number
  total_cost: number
}

export default function ReportsPurchasesPage() {
  const { setSummary } = useOutletContext<ReportsOutletContext>()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [q, setQ] = useState('')
  const [supplierId, setSupplierId] = useState<number>(0)
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)

  const [rows, setRows] = useState<PurchaseRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [receiptInvoice, setReceiptInvoice] = useState<string | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const limit = 30
  const totalPages = Math.ceil(total / limit)

  useEffect(() => {
    window.api.people.allSuppliers().then((s: any) => setSuppliers(s as Supplier[]))
  }, [])

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.reports.purchaseList({
        q: q.trim() || undefined,
        supplier_id: supplierId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page: p,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, supplierId, dateFrom, dateTo])

  // Debounced auto-load on filter change (matches Sales pattern)
  useEffect(() => {
    const t = setTimeout(() => { load(1) }, 300)
    return () => clearTimeout(t)
  }, [load])

  const openReceipt = (invoice_no: string) => {
    setReceiptInvoice(invoice_no)
    setReceiptOpen(true)
  }

  const pageTotalCost = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0)
  const pageItemCount = rows.reduce((s, r) => s + (r.item_count ?? 0), 0)
  const creditUnpaidCount = rows.filter(r => r.payment_type === 'credit' && !r.is_paid).length

  useEffect(() => {
    setSummary([
      { label: 'ใบรับในช่วงนี้', value: `${total.toLocaleString()} ใบ`, icon: Truck, tint: 'primary' },
      { label: 'มูลค่ารวม (หน้านี้)', value: formatCurrency(pageTotalCost), icon: Wallet, tint: 'info-soft' },
      { label: 'จำนวนรายการ', value: pageItemCount.toLocaleString(), icon: Boxes, tint: 'warm' },
      {
        label: 'เครดิตค้างชำระ',
        value: `${creditUnpaidCount} ใบ`,
        icon: AlertTriangle,
        tint: creditUnpaidCount > 0 ? 'warning' : 'success',
      },
    ])
  }, [total, pageTotalCost, pageItemCount, creditUnpaidCount, setSummary])

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาเลขใบรับ..."
            className="h-10 pl-9 rounded-lg text-sm bg-card"
          />
        </div>

        <Select value={String(supplierId)} onValueChange={v => setSupplierId(Number(v))}>
          <SelectTrigger className="h-10 w-56 rounded-lg bg-card text-sm border-0">
            <SelectValue placeholder="ผู้จัดจำหน่ายทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">ผู้จัดจำหน่ายทั้งหมด</SelectItem>
            {suppliers.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
          className="h-10 w-72"
        />
      </div>

      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center">
          <span>{loading ? 'กำลังโหลด...' : `พบ ${total.toLocaleString()} รายการ`}</span>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">เลขที่ใบรับ</TableHead>
                <TableHead className="w-32">วันที่รับ</TableHead>
                <TableHead>ผู้จัดจำหน่าย</TableHead>
                <TableHead className="text-center w-24">รายการ</TableHead>
                <TableHead className="text-right w-32">มูลค่า</TableHead>
                <TableHead className="text-center w-36">การชำระ</TableHead>
                <TableHead className="text-center w-32">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <PackagePlus className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : rows.map(r => (
                <TableRow key={r.invoice_no}>
                  <TableCell className="font-mono text-sm">{r.invoice_no}</TableCell>
                  <TableCell className="text-sm">{formatDate(r.receive_date)}</TableCell>
                  <TableCell className="text-sm truncate" title={r.supplier_name ?? ''}>
                    {r.supplier_name ?? <span className="text-foreground-subtle">—</span>}
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.item_count}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(r.total_cost)}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.payment_type === 'credit' ? (
                      r.is_paid
                        ? <Badge variant="success">ชำระแล้ว</Badge>
                        : <div className="flex flex-col items-center gap-0.5">
                            <Badge variant="warning">เครดิต</Badge>
                            {r.due_date && (
                              <span className="text-sm text-muted-foreground">ครบ {formatDate(r.due_date)}</span>
                            )}
                          </div>
                    ) : (
                      <Badge variant="secondary">เงินสด</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Button size="default" variant="info-soft" onClick={() => openReceipt(r.invoice_no)}>
                        ดูรายการ
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 h-12 border-t border-border flex items-center justify-center shrink-0">
            <Pagination page={page} totalPages={totalPages} onPageChange={load} />
          </div>
        )}
      </div>

      <PurchaseReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        invoiceNo={receiptInvoice}
      />
    </>
  )
}
