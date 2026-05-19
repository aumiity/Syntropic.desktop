import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { SaleDetailDialog, type SaleDetail } from '@/components/dialogs/SaleDetailDialog'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Sale } from '@/types'
import type { ManageOutletContext } from './index'
import { Search, Receipt, Ban, ShoppingCart, Boxes, Undo2, Info } from 'lucide-react'

// Money lives in the table rows; the summary slot now carries only the count
// cards, which double as the status filter. rx (ใบสั่งยา) bills have no
// dedicated card — they're counted only in "จำนวนบิล" (all).
interface SaleSummary {
  count_all: number
  count_retail: number
  count_wholesale: number
  count_return: number
  count_voided: number
}

interface SaleRow extends Sale {
  customer_name?: string
}

const EMPTY_SUMMARY: SaleSummary = {
  count_all: 0, count_retail: 0, count_wholesale: 0, count_return: 0, count_voided: 0,
}

type StatusFilter = 'all' | 'retail' | 'wholesale' | 'return' | 'voided'

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}
const SALE_TYPE_VARIANTS: Record<string, any> = {
  retail: 'secondary', wholesale: 'default', rx: 'success', return: 'warning',
}

type SortField = 'invoice_no' | 'sold_at' | 'total_amount'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

export default function ManageSalesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary } = useOutletContext<ManageOutletContext>()
  const today = new Date().toISOString().slice(0, 10)

  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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
        status_filter: statusFilter,
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
  }, [q, dateFrom, dateTo, statusFilter, sort, pageSize])

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

  // The four count cards double as the status filter — clicking one narrows
  // the table; the numbers themselves stay fixed to the q/date set.
  useEffect(() => {
    setSlotSummary([
      { label: 'จำนวนบิล', value: summary.count_all.toLocaleString(), icon: Receipt, tint: 'primary',
        onClick: () => setStatusFilter('all'), isActive: statusFilter === 'all' },
      { label: 'ขายปลีก', value: summary.count_retail.toLocaleString(), icon: ShoppingCart, tint: 'success',
        onClick: () => setStatusFilter('retail'), isActive: statusFilter === 'retail' },
      { label: 'ขายส่ง', value: summary.count_wholesale.toLocaleString(), icon: Boxes, tint: 'info-soft',
        onClick: () => setStatusFilter('wholesale'), isActive: statusFilter === 'wholesale' },
      { label: 'รับคืนสินค้า', value: summary.count_return.toLocaleString(), icon: Undo2, tint: 'warm',
        onClick: () => setStatusFilter('return'), isActive: statusFilter === 'return' },
      { label: 'ยกเลิก', value: summary.count_voided.toLocaleString(), icon: Ban, tint: 'destructive',
        onClick: () => setStatusFilter('voided'), isActive: statusFilter === 'voided' },
    ])
  }, [summary, statusFilter, setSlotSummary])

  return (
    <>
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาเลขบิล, ชื่อลูกค้า..."
              className="h-9 pl-9 rounded-lg text-sm bg-input"
            />
          </div>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
            className="h-9 w-72 shrink-0 bg-input hover:bg-surface-hover"
          />
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortableTableHead field="sold_at" sort={sort} onToggle={toggleSort} className="w-36">วันที่/เวลา</SortableTableHead>
                <SortableTableHead field="invoice_no" sort={sort} onToggle={toggleSort} className="w-36">เลขบิล</SortableTableHead>
                <TableHead className="w-48">ลูกค้า</TableHead>
                <TableHead className="text-center w-24">ประเภท</TableHead>
                <SortableTableHead field="total_amount" align="right" sort={sort} onToggle={toggleSort} className="w-32">ยอดสุทธิ</SortableTableHead>
                <TableHead className="text-center w-24">สถานะ</TableHead>
                <TableHead className="text-center w-40">จัดการ</TableHead>
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
                    <Receipt className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : rows.map(s => (
                <TableRow key={s.id} className={s.status === 'voided' ? 'opacity-60' : ''}>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.sold_at)}</TableCell>
                  <TableCell className="font-mono text-sm">{s.invoice_no}</TableCell>
                  <TableCell className="text-sm truncate" title={s.customer_name ?? s.customer_name_free ?? ''}>
                    {s.customer_name ?? s.customer_name_free ?? <span className="text-foreground-subtle">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={SALE_TYPE_VARIANTS[s.sale_type] ?? 'secondary'}>
                      {SALE_TYPE_LABELS[s.sale_type] ?? s.sale_type}
                    </Badge>
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
                    <div className="flex justify-center">
                      <Button
                        size="icon-lg"
                        variant="warm"
                        onClick={() => openDetail(s)}
                        title="ดูรายการ"
                      >
                        <Info />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span>แสดง</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}>
              <SelectTrigger className="h-9 min-w-20">
                <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-28">
                {[50, 100, 250, 500, 'all'].map(opt => (
                  <SelectItem key={String(opt)} value={String(opt)}>{opt === 'all' ? 'ทั้งหมด' : String(opt)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>รายการ</span>
          </div>
          <div className="flex-1 flex justify-center">
            <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto justify-center" />
          </div>
          <span className="text-muted-foreground shrink-0">
            {loading ? 'กำลังโหลด...' : <>พบ <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span> รายการ</>}
          </span>
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
        reasonPresets={['คีย์รายการผิด', 'ราคาผิด', 'ลูกค้ายกเลิก', 'ลูกค้าคืนสินค้า', 'บิลซ้ำ']}
        onConfirm={reason => handleVoid(reason ?? '')}
      />
    </>
  )
}
