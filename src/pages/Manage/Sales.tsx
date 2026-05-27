import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InitialAvatar } from '@/components/ui/avatar'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateRangePicker, resolveDateRangePreset, type DateRangePresetKey } from '@/components/ui/date-range-picker'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { SaleDetailDialog, type SaleDetail } from '@/components/dialogs/SaleDetailDialog'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Sale } from '@/types'
import type { ManageOutletContext } from './index'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { ReceiptText, Ban, ShoppingCart, ShoppingBag, Undo2, Settings2, Filter, Check, MoreHorizontal, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  item_kinds?: number
}

const EMPTY_SUMMARY: SaleSummary = {
  count_all: 0, count_retail: 0, count_wholesale: 0, count_return: 0, count_voided: 0,
}

type StatusFilter = 'all' | 'retail' | 'wholesale' | 'return' | 'voided'

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}
// STATUS (soft + outline) family — matches success-outline / warning-outline /
// destructive-outline on the "สถานะ" column so all status pills share a tone.
const SALE_TYPE_VARIANTS: Record<string, any> = {
  retail: 'neutral-outline', wholesale: 'brand-outline', rx: 'success-outline', return: 'warning-outline',
}

type SortField = 'invoice_no' | 'sold_at' | 'total_amount'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

interface SalesPrefs {
  pageSize: PageSize
  sort: SortState
  // Date is persisted as a preset key (rolling), not absolute dates — so
  // reopening tomorrow doesn't show yesterday's "today". null = custom dates.
  datePreset: DateRangePresetKey | null
  showColDate: boolean
  showColCustomer: boolean
  showColItems: boolean
  showColTotal: boolean
  showColStatus: boolean
}

const SALES_DEFAULTS: SalesPrefs = {
  pageSize: 50,
  sort: { by: 'sold_at', dir: 'desc' },
  datePreset: 'today',
  showColDate: true,
  showColCustomer: true,
  showColItems: true,
  showColTotal: true,
  showColStatus: true,
}

export default function ManageSalesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary } = useOutletContext<ManageOutletContext>()

  const [prefs, setPrefs] = usePagePrefs<SalesPrefs>('sales', SALES_DEFAULTS)

  // Date range: resolved fresh on every mount from the persisted preset.
  // statusFilter is NOT persisted — filters reset per session.
  const initialRange = prefs.datePreset
    ? resolveDateRangePreset(prefs.datePreset)
    : { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }

  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const sort = prefs.sort
  const setSort = (next: SortState | ((prev: SortState) => SortState)) => {
    setPrefs({ sort: typeof next === 'function' ? next(prefs.sort) : next })
  }
  const pageSize = prefs.pageSize
  const setPageSize = (next: PageSize) => setPrefs({ pageSize: next })

  const [rows, setRows] = useState<SaleRow[]>([])
  const [summary, setSummary] = useState<SaleSummary>(EMPTY_SUMMARY)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Detail modal — SaleDetailDialog owns the fetch lifecycle; we just pass invoice_no
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const [voidTarget, setVoidTarget] = useState<{ id: number; invoice_no: string } | null>(null)

  // Column visibility (เลขบิล + จัดการ always shown)
  const showColDate = prefs.showColDate
  const showColCustomer = prefs.showColCustomer
  const showColItems = prefs.showColItems
  const showColTotal = prefs.showColTotal
  const showColStatus = prefs.showColStatus
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
      // Void also cancels any negative-stock markers on this sale (see
      // electron/ipc/reports.ts voidSale), so refresh the sidebar badge.
      useNegativeStockBadge.getState().refresh()
      load(page)
    } catch (e: any) {
      toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      setVoidTarget(null)
    }
  }

  // Passive MetricCard snapshot of the q/date set. The status filter lives in
  // the filter strip's Filter popover (no onClick → ManageLayout renders
  // MetricCard instead of the clickable StatCard).
  useEffect(() => {
    setSlotSummary([
      { label: 'จำนวนบิล', value: summary.count_all.toLocaleString(),       icon: ReceiptText,  tint: 'primary',   sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ขายปลีก',   value: summary.count_retail.toLocaleString(),    icon: ShoppingCart, tint: 'success',   sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
      { label: 'ขายส่ง',    value: summary.count_wholesale.toLocaleString(), icon: ShoppingBag,  tint: 'info-soft', sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'รับคืน',    value: summary.count_return.toLocaleString(),    icon: Undo2,        tint: 'warm',      sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ยกเลิก',    value: summary.count_voided.toLocaleString(),    icon: Ban,          tint: 'destructive2', sub: 'รายการ', subClassName: 'text-base text-foreground' },
    ])
  }, [summary, setSlotSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSlotSummary(null)
  }, [setSlotSummary])

  return (
    <>
      {/* List card */}
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <span className="grid place-items-center size-8 rounded-lg border border-border bg-card shadow-sm">
              <ReceiptText className="size-4 text-foreground" />
            </span>
            <h3 className="text-lg font-semibold text-foreground">ประวัติการขาย</h3>
            <Badge variant="neutral-outline">{total.toLocaleString()}</Badge>
          </div>

          <SearchInput
            variant="elevated"
            wrapperClassName="w-72 shrink-0 ml-auto"
            className="h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาเลขบิล, ชื่อลูกค้า..."
          />
          <DateRangePicker
            variant="elevated"
            from={dateFrom}
            to={dateTo}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
            onPresetChange={key => setPrefs({ datePreset: key })}
            className="h-9 w-60 shrink-0"
          />

          {/* Status filter popover — was previously the clickable summary cards */}
          {(() => {
            const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
              { value: 'all',       label: 'ทั้งหมด' },
              { value: 'retail',    label: 'ขายปลีก' },
              { value: 'wholesale', label: 'ขายส่ง' },
              { value: 'return',    label: 'รับคืน' },
              { value: 'voided',    label: 'ยกเลิก' },
            ]
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรองสถานะ">
                    <Filter className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1 gap-0">
                  <PopoverHeader className="px-2">
                    <PopoverTitle>สถานะ</PopoverTitle>
                  </PopoverHeader>
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setStatusFilter(o.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        statusFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', statusFilter === o.value ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 text-left">{o.label}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          })()}

          <Popover>
            <PopoverTrigger asChild>
              <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="จัดการตาราง">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <PopoverHeader>
                <PopoverTitle>จัดการตาราง</PopoverTitle>
              </PopoverHeader>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColDate} onCheckedChange={v => setPrefs({ showColDate: v === true })} />
                <span className="text-sm">วันที่/เวลา</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColCustomer} onCheckedChange={v => setPrefs({ showColCustomer: v === true })} />
                <span className="text-sm">ลูกค้า</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColItems} onCheckedChange={v => setPrefs({ showColItems: v === true })} />
                <span className="text-sm">รายการ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColTotal} onCheckedChange={v => setPrefs({ showColTotal: v === true })} />
                <span className="text-sm">ยอดสุทธิ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColStatus} onCheckedChange={v => setPrefs({ showColStatus: v === true })} />
                <span className="text-sm">สถานะ</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="invoice_no" sort={sort} onToggle={toggleSort} className="min-w-24">เลขบิล</SortableTableHead>
                {showColCustomer && <TableHead className="min-w-[180px]">ลูกค้า</TableHead>}
                {showColTotal && <SortableTableHead field="total_amount" sort={sort} onToggle={toggleSort} className="min-w-24">ยอดสุทธิ</SortableTableHead>}
                {showColStatus && <TableHead className="min-w-[140px]">สถานะ</TableHead>}
                {showColDate && <SortableTableHead field="sold_at" sort={sort} onToggle={toggleSort} className="min-w-24">เวลา</SortableTableHead>}
                <TableHead className="text-center min-w-14">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColDate ? 1 : 0) + (showColCustomer ? 1 : 0) + (showColTotal ? 1 : 0) + (showColStatus ? 1 : 0)} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColDate ? 1 : 0) + (showColCustomer ? 1 : 0) + (showColTotal ? 1 : 0) + (showColStatus ? 1 : 0)} className="text-center text-muted-foreground py-16">
                    <ReceiptText className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : rows.map(s => {
                const isVoided = s.status === 'voided'
                return (
                <TableRow key={s.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="text-sm">
                    <div className="text-foreground">{s.invoice_no}</div>
                    {showColItems && (
                      <div className="text-xs font-normal text-muted-foreground">
                        {(s.item_kinds ?? 0).toLocaleString()} รายการ
                      </div>
                    )}
                  </TableCell>
                  {showColCustomer && (
                    <TableCell className="text-sm max-w-[220px]">
                      {(() => {
                        const name = s.customer_name ?? s.customer_name_free ?? null
                        if (!name) return <span className="text-foreground-subtle">—</span>
                        return (
                          <div className="flex items-center gap-2 min-w-0">
                            <InitialAvatar name={name} size="sm" />
                            <span className="truncate" title={name}>{name}</span>
                          </div>
                        )
                      })()}
                    </TableCell>
                  )}
                  {showColTotal && (
                    <TableCell className="text-sm text-foreground">
                      {formatCurrency(s.total_amount)}
                    </TableCell>
                  )}
                  {showColStatus && (
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={SALE_TYPE_VARIANTS[s.sale_type] ?? 'secondary'}>
                          {SALE_TYPE_LABELS[s.sale_type] ?? s.sale_type}
                        </Badge>
                        {isVoided
                          ? <Badge variant="destructive-outline">ยกเลิก</Badge>
                          : <Badge variant="success-outline">สำเร็จ</Badge>}
                      </div>
                    </TableCell>
                  )}
                  {showColDate && <TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.sold_at)}</TableCell>}
                  <TableCell>
                    <div className="flex justify-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                            <MoreHorizontal />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                          <button type="button" onClick={() => openDetail(s)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                            <Eye className="size-4" /> ดูรายละเอียด
                          </button>
                          {!isVoided && (
                            <button type="button" onClick={() => setVoidTarget({ id: s.id, invoice_no: s.invoice_no })}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                              <Ban className="size-4" /> ยกเลิกบิล
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>

        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          {(() => {
            const size = pageSize === 'all' ? total : pageSize
            const start = total === 0 ? 0 : (page - 1) * size + 1
            const end = Math.min(page * size, total)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                  <SelectTrigger variant="elevated" className="h-9 min-w-20">
                    <SelectValue>{String(pageSize)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-28">
                    {[50, 100, 250, 500].map(opt => (
                      <SelectItem key={opt} value={String(opt)}>{String(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {loading
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
              </div>
            )
          })()}
          <Pagination page={page} totalPages={totalPages} onPageChange={load} className="w-auto" />
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
