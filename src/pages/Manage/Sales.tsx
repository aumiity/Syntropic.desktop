import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { SaleDetailDialog, type SaleDetail } from '@/components/dialogs/SaleDetailDialog'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Sale } from '@/types'
import type { ManageOutletContext } from './index'
import { Search, TrendingUp, TrendingDown, Receipt, ShoppingBag, Ban, Wallet, Percent } from 'lucide-react'

interface SaleSummary {
  total_subtotal: number
  total_discount: number
  total_amount: number
  total_cost: number
  total_profit: number
  sale_count: number
}

interface SaleRow extends Sale {
  customer_name?: string
}

const EMPTY_SUMMARY: SaleSummary = {
  total_subtotal: 0, total_discount: 0, total_amount: 0,
  total_cost: 0, total_profit: 0, sale_count: 0,
}

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}
const SALE_TYPE_VARIANTS: Record<string, any> = {
  retail: 'secondary', wholesale: 'default', rx: 'success', return: 'warning',
}

type SortField = 'invoice_no' | 'sold_at' | 'subtotal' | 'total_amount'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

export default function ManageSalesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary } = useOutletContext<ManageOutletContext>()
  const today = new Date().toISOString().slice(0, 10)

  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [sort, setSort] = useState<SortState>({ by: 'sold_at', dir: 'desc' })

  const [rows, setRows] = useState<SaleRow[]>([])
  const [summary, setSummary] = useState<SaleSummary>(EMPTY_SUMMARY)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Detail modal — SaleDetailDialog owns the fetch lifecycle; we just pass invoice_no
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const [voidTarget, setVoidTarget] = useState<{ id: number; invoice_no: string } | null>(null)

  const [pageSize, setPageSize] = useState<PageSize>(50)
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.reports.salesList({
        q: q.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sort.by,
        sort_dir: sort.dir.toUpperCase(),
        page: p,
        limit: pageSize,
      }) as any
      setRows(res.rows)
      setSummary(res.summary ?? EMPTY_SUMMARY)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, dateFrom, dateTo, sort, pageSize])

  useEffect(() => {
    const t = setTimeout(() => { load(1) }, 300)
    return () => clearTimeout(t)
  }, [load])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'desc' })
  }

  const openDetail = (sale: SaleRow) => {
    setDetailInvoice(sale.invoice_no)
    setDetailOpen(true)
  }

  const handleVoid = async (reason: string) => {
    if (!voidTarget) return
    try {
      await window.api.reports.voidSale(voidTarget.id, reason)
      toast({ title: 'ยกเลิกบิลสำเร็จ', variant: 'success' })
      const wasOpenInDialog = detailInvoice === voidTarget.invoice_no
      setVoidTarget(null)
      if (wasOpenInDialog) setDetailOpen(false)
      load(page)
    } catch (e: any) {
      toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      setVoidTarget(null)
    }
  }

  const profitPct = summary.total_amount > 0
    ? `${((summary.total_profit / summary.total_amount) * 100).toFixed(1)}%`
    : undefined

  // Push summary cards to the Reports layout slot
  useEffect(() => {
    setSlotSummary([
      { label: 'จำนวนบิล', value: summary.sale_count.toLocaleString(), icon: Receipt, tint: 'primary' },
      { label: 'ยอดก่อนลด', value: formatCurrency(summary.total_subtotal), icon: ShoppingBag, tint: 'info-soft' },
      { label: 'ส่วนลดรวม', value: formatCurrency(summary.total_discount), icon: Percent, tint: 'warning' },
      { label: 'ยอดสุทธิ', value: formatCurrency(summary.total_amount), icon: Wallet, tint: 'primary' },
      { label: 'ต้นทุนรวม', value: formatCurrency(summary.total_cost), icon: TrendingDown, tint: 'warm' },
      {
        label: 'กำไรสุทธิ',
        value: formatCurrency(summary.total_profit),
        sub: profitPct,
        icon: TrendingUp,
        tint: summary.total_profit >= 0 ? 'success' : 'destructive',
      },
    ])
  }, [summary, profitPct, setSlotSummary])

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาเลขบิล, ชื่อลูกค้า..."
            className="h-10 pl-9 rounded-lg text-sm bg-card"
          />
        </div>
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
                <SortableTableHead field="invoice_no" sort={sort} onToggle={toggleSort} className="w-36">เลขบิล</SortableTableHead>
                <SortableTableHead field="sold_at" sort={sort} onToggle={toggleSort} className="w-44">วันที่/เวลา</SortableTableHead>
                <TableHead className="w-48">ลูกค้า</TableHead>
                <TableHead className="text-center w-24">ประเภท</TableHead>
                <SortableTableHead field="subtotal" align="right" sort={sort} onToggle={toggleSort} className="w-32">ยอดก่อนลด</SortableTableHead>
                <TableHead className="text-right w-28">ส่วนลด</TableHead>
                <SortableTableHead field="total_amount" align="right" sort={sort} onToggle={toggleSort} className="w-32">ยอดสุทธิ</SortableTableHead>
                <TableHead className="text-center w-24">สถานะ</TableHead>
                <TableHead className="text-center w-40">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
                    <Receipt className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : rows.map(s => (
                <TableRow key={s.id} className={s.status === 'voided' ? 'opacity-60' : ''}>
                  <TableCell className="font-mono text-sm">{s.invoice_no}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.sold_at)}</TableCell>
                  <TableCell className="text-sm truncate" title={s.customer_name ?? s.customer_name_free ?? ''}>
                    {s.customer_name ?? s.customer_name_free ?? <span className="text-foreground-subtle">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={SALE_TYPE_VARIANTS[s.sale_type] ?? 'secondary'}>
                      {SALE_TYPE_LABELS[s.sale_type] ?? s.sale_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {formatCurrency(s.subtotal)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-warning-strong">
                    {s.total_discount > 0 ? `-${formatCurrency(s.total_discount)}` : <span className="text-foreground-subtle">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(s.total_amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {s.status === 'voided'
                      ? <Badge variant="destructive">ยกเลิก</Badge>
                      : <Badge variant="success">สำเร็จ</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <Button size="default" variant="info-soft" onClick={() => openDetail(s)}>
                        ดูรายการ
                      </Button>
                      {s.status !== 'voided' && (
                        <Button
                          size="icon-lg"
                          variant="destructive2"
                          onClick={() => setVoidTarget(s)}
                          title="ยกเลิกบิล"
                        >
                          <Ban />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-4 h-12 border-t border-border flex items-center shrink-0">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={load}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      <SaleDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        invoiceNo={detailInvoice}
        onVoidRequest={(sale: SaleDetail) => {
          setVoidTarget({ id: sale.id, invoice_no: sale.invoice_no })
          setDetailOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={open => { if (!open) setVoidTarget(null) }}
        title="ยกเลิกบิล"
        description={`ต้องการยกเลิกบิล ${voidTarget?.invoice_no}? สต็อกจะถูกคืนกลับอัตโนมัติ`}
        confirmLabel="ยกเลิกบิล"
        variant="destructive"
        requireReason
        reasonLabel="เหตุผลการยกเลิก"
        onConfirm={reason => handleVoid(reason ?? '')}
      />
    </>
  )
}
