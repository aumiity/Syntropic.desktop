import { useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDate, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Supplier, ProductLot } from '@/types'
import type { ManageOutletContext } from './index'
import {
  Search, X, Building2, Banknote, CreditCard, FileText, AlertTriangle, Ban, Info,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface HistoryRow {
  invoice_no: string
  created_at: string
  payment_type: string
  is_paid: number
  due_date?: string
  supplier_name?: string
  item_count: number
  total_cost: number
  status: 'completed' | 'cancelled'
  cancelled_at?: string
  cancel_reason?: string
}

interface ReceiptDetail extends ProductLot {
  trade_name: string
  product_code: string
  supplier_name: string
  status?: 'completed' | 'cancelled'
  cancelled_at?: string
  cancel_reason?: string
}

type SortField = 'created_at' | 'invoice_no' | 'total_cost'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

// ── Page ───────────────────────────────────────────────────────────────────

export default function ManagePurchasesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary } = useOutletContext<ManageOutletContext>()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // History list
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [histTotal, setHistTotal] = useState(0)
  const [histPage, setHistPage] = useState(1)
  const [histPageSize, setHistPageSize] = useState<PageSize>(50)
  const [histQ, setHistQ] = useState('')
  const [histSupplierId, setHistSupplierId] = useState<number>(0)
  const [histDateFrom, setHistDateFrom] = useState('')
  const [histDateTo, setHistDateTo] = useState('')
  const [histPaymentFilter, setHistPaymentFilter] = useState<'all' | 'cash' | 'credit' | 'unpaid' | 'cancelled'>('all')
  const [histSummary, setHistSummary] = useState({ count: 0, cash_count: 0, credit_count: 0, unpaid_count: 0, cancelled_count: 0 })
  const [histSort, setHistSort] = useState<SortState>({ by: 'created_at', dir: 'desc' })
  const [loadingHist, setLoadingHist] = useState(false)

  // Receipt detail dialog
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [receiptItems, setReceiptItems] = useState<ReceiptDetail[]>([])
  const [receiptInvoice, setReceiptInvoice] = useState('')

  // Cancel-GR modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelBlockers, setCancelBlockers] = useState<Array<{ trade_name: string; product_code: string; lot_number: string; need: number; have: number }>>([])

  // Edit-bill (header) modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editSupplierId, setEditSupplierId] = useState<number>(0)
  const [editSupplierInvoiceNo, setEditSupplierInvoiceNo] = useState('')
  const [editOrderDate, setEditOrderDate] = useState('')
  const [editReceiveDate, setEditReceiveDate] = useState('')
  const [editPaymentType, setEditPaymentType] = useState<'cash' | 'credit'>('cash')
  const [editDueDate, setEditDueDate] = useState('')
  const [editIsPaid, setEditIsPaid] = useState(false)
  const [editPaidDate, setEditPaidDate] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const loadSuppliers = async () => {
    const data = await window.api.people.allSuppliers()
    setSuppliers(data as Supplier[])
  }

  const loadHistory = useCallback(async (
    page = 1,
    filterOverride?: 'all' | 'cash' | 'credit' | 'unpaid' | 'cancelled',
    dateOverride?: { from: string; to: string },
    clearIfMissing = false,
  ) => {
    const filter = filterOverride ?? histPaymentFilter
    const dFrom = dateOverride?.from ?? histDateFrom
    const dTo = dateOverride?.to ?? histDateTo
    setLoadingHist(true)
    try {
      const res = await window.api.purchase.history({
        q: histQ || undefined,
        supplier_id: histSupplierId || undefined,
        date_from: dFrom || undefined,
        date_to: dTo || undefined,
        payment_type: (filter === 'cash' || filter === 'credit' || filter === 'unpaid') ? filter : undefined,
        status: filter === 'cancelled' ? 'cancelled' : 'all',
        sort_by: histSort.by,
        sort_dir: histSort.dir.toUpperCase(),
        page,
        limit: histPageSize,
      }) as any
      setHistory(res.rows)
      setHistTotal(res.total)
      setHistPage(page)
      if (res.summary) setHistSummary(res.summary)
      // Drop the open detail when the user-applied filter excludes it,
      // so the right pane never shows an invoice that's not in the list.
      if (clearIfMissing && selectedInvoice && !res.rows.some((r: HistoryRow) => r.invoice_no === selectedInvoice)) {
        setSelectedInvoice(null)
        setReceiptItems([])
        setReceiptInvoice('')
      }
    } finally {
      setLoadingHist(false)
    }
  }, [histQ, histSupplierId, histDateFrom, histDateTo, histPaymentFilter, histPageSize, histSort, selectedInvoice])

  // Status-filter StatCards live in the shared summary slot (top, above the
  // Tabs) — same as the other tabs, so the table-card sits flush at the top.
  // Must sit after loadHistory: it's a const useCallback, not hoisted.
  useEffect(() => {
    setSlotSummary(([
      { v: 'all',       label: 'ทั้งหมด',     count: histSummary.count,           icon: FileText,      tint: 'secondary' },
      { v: 'cash',      label: 'เงินสด',       count: histSummary.cash_count,      icon: Banknote,      tint: 'primary' },
      { v: 'credit',    label: 'เครดิตทั้งหมด', count: histSummary.credit_count,    icon: CreditCard,    tint: 'warm' },
      { v: 'unpaid',    label: 'ค้างชำระ',     count: histSummary.unpaid_count,    icon: AlertTriangle, tint: 'warning' },
      { v: 'cancelled', label: 'ยกเลิก',       count: histSummary.cancelled_count, icon: Ban,           tint: 'destructive' },
    ] as const).map(c => ({
      label: c.label,
      value: c.count.toLocaleString(),
      icon: c.icon,
      tint: c.tint,
      onClick: () => { setHistPaymentFilter(c.v); loadHistory(1, c.v, undefined, true) },
      isActive: histPaymentFilter === c.v,
    })))
  }, [histSummary, histPaymentFilter, loadHistory, setSlotSummary])

  useEffect(() => {
    loadSuppliers()
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refilter when supplier dropdown changes.
  // Effect (not inline onValueChange) so the closure has the up-to-date
  // histSupplierId — otherwise we'd send the previous render's value to the API.
  // Skip the initial mount; loadHistory() above already populates the list.
  const supplierEffectMounted = useRef(false)
  useEffect(() => {
    if (!supplierEffectMounted.current) { supplierEffectMounted.current = true; return }
    loadHistory(1, undefined, undefined, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histSupplierId])

  // Debounced realtime search on histQ change (skip initial mount).
  const qEffectMounted = useRef(false)
  useEffect(() => {
    if (!qEffectMounted.current) { qEffectMounted.current = true; return }
    const t = setTimeout(() => loadHistory(1, undefined, undefined, true), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histQ])

  const pageSizeEffectMounted = useRef(false)
  useEffect(() => {
    if (!pageSizeEffectMounted.current) { pageSizeEffectMounted.current = true; return }
    loadHistory(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histPageSize])

  const sortEffectMounted = useRef(false)
  useEffect(() => {
    if (!sortEffectMounted.current) { sortEffectMounted.current = true; return }
    loadHistory(histPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histSort])

  const toggleHistSort = (field: SortField) => {
    setHistSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'desc' })
  }

  const openReceipt = async (invoice_no: string) => {
    try {
      const data = await window.api.purchase.getReceipt(invoice_no) as ReceiptDetail[]
      setReceiptItems(data)
      setReceiptInvoice(invoice_no)
      setSelectedInvoice(invoice_no)
    } catch (e: any) {
      toast(e?.message ? `โหลดใบรับไม่สำเร็จ: ${e.message}` : 'โหลดใบรับไม่สำเร็จ', 'error')
    }
  }

  const openEditBill = () => {
    if (!receiptInvoice || receiptItems.length === 0) return
    const first = receiptItems[0]
    setEditSupplierId((first as any).supplier_id ?? 0)
    setEditSupplierInvoiceNo(first.supplier_invoice_no ?? '')
    setEditOrderDate(first.order_date ?? '')
    setEditReceiveDate(first.created_at ?? '')
    const pt = (first.payment_type === 'credit' ? 'credit' : 'cash') as 'cash' | 'credit'
    setEditPaymentType(pt)
    setEditDueDate(first.due_date ?? '')
    setEditIsPaid(!!first.is_paid)
    setEditPaidDate(first.paid_date ?? '')
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!receiptInvoice) return
    if (!editSupplierId) { toast('กรุณาเลือกผู้จัดจำหน่าย', 'error'); return }
    if (!editSupplierInvoiceNo.trim()) { toast('กรุณาระบุเลขที่ใบกำกับสินค้า', 'error'); return }
    if (!editReceiveDate) { toast('กรุณาระบุวันที่รับสินค้า', 'error'); return }
    if (editPaymentType === 'credit' && !editDueDate) { toast('กรุณาระบุวันครบกำหนดชำระ', 'error'); return }
    setEditSaving(true)
    try {
      const res = await window.api.purchase.updateHeader({
        invoice_no: receiptInvoice,
        supplier_id: editSupplierId,
        supplier_invoice_no: editSupplierInvoiceNo.trim(),
        order_date: editOrderDate || undefined,
        receive_date: editReceiveDate,
        payment_type: editPaymentType,
        due_date: editPaymentType === 'credit' ? (editDueDate || undefined) : undefined,
        is_paid: editIsPaid,
        paid_date: editIsPaid ? (editPaidDate || undefined) : undefined,
        userId: getCurrentUserId(),
      }) as any
      if (res?.success) {
        toast('บันทึกการแก้ไขสำเร็จ', 'success')
        setShowEditModal(false)
        await loadHistory(histPage)
        const data = await window.api.purchase.getReceipt(receiptInvoice) as ReceiptDetail[]
        setReceiptItems(data)
      } else if (res?.error === 'cancelled') {
        toast('บิลถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้', 'error')
      } else if (res?.error === 'not_found') {
        toast('ไม่พบบิล', 'error')
      } else {
        toast('บันทึกไม่สำเร็จ', 'error')
      }
    } catch (e: any) {
      toast(e?.message ? `บันทึกไม่สำเร็จ: ${e.message}` : 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  const handleCancelBill = async () => {
    if (!receiptInvoice) return
    const reason = cancelReason.trim()
    if (!reason) { toast('กรุณาระบุเหตุผล', 'error'); return }
    setCancelling(true)
    try {
      const res = await window.api.purchase.cancel({
        invoice_no: receiptInvoice,
        reason,
        userId: getCurrentUserId(),
      }) as any
      if (res?.success) {
        toast('ยกเลิกบิลสำเร็จ', 'success')
        setShowCancelModal(false)
        setCancelReason('')
        setCancelBlockers([])
        await loadHistory(histPage)
        // Refresh detail panel
        const data = await window.api.purchase.getReceipt(receiptInvoice) as ReceiptDetail[]
        setReceiptItems(data)
      } else if (res?.error === 'stock_consumed') {
        setCancelBlockers(res.blockers ?? [])
        toast('ไม่สามารถยกเลิกได้ — สินค้าบางรายการถูกขายแล้ว', 'error')
      } else if (res?.error === 'already_cancelled') {
        toast('บิลนี้ถูกยกเลิกไปแล้ว', 'error')
      } else if (res?.error === 'not_found') {
        toast('ไม่พบบิล', 'error')
      } else {
        toast('ยกเลิกไม่สำเร็จ', 'error')
      }
    } catch (e: any) {
      toast(e?.message ? `ยกเลิกไม่สำเร็จ: ${e.message}` : 'ยกเลิกไม่สำเร็จ', 'error')
    } finally {
      setCancelling(false)
    }
  }

  const histSupplier = suppliers.find(s => s.id === histSupplierId) ?? null
  const histTotalPages = histPageSize === 'all' ? 1 : Math.ceil(histTotal / histPageSize)
  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      {/* ── Full-width history table-card ── */}
      <div className="flex flex-1 flex-col bg-card rounded-card shadow-card overflow-hidden min-h-0">

        {/* Filter strip — search left, filters right (showcase top bar) */}
        <div className="px-2 h-14 shrink-0 flex items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={histQ}
              onChange={e => setHistQ(e.target.value)}
              placeholder="ค้นหาเลขที่ใบรับ..."
              className="h-10 pl-9 rounded-lg text-sm bg-input"
            />
          </div>
          <div className="w-80 shrink-0">
            <Combobox
              items={suppliers}
              value={histSupplier}
              onChange={(s) => setHistSupplierId(s?.id ?? 0)}
              getKey={(s) => s.id}
              getLabel={(s) => s.name}
              getSublabel={(s) => s.code}
              icon={Building2}
              emptyLabel="ทุกผู้จัดจำหน่าย"
              searchPlaceholder="ชื่อหรือรหัสผู้จัดจำหน่าย..."
              emptyText="ไม่พบผู้จัดจำหน่าย"
            />
          </div>
          <div className="w-60 shrink-0">
            <DateRangePicker
              from={histDateFrom}
              to={histDateTo}
              onChange={(from, to) => {
                setHistDateFrom(from)
                setHistDateTo(to)
                loadHistory(1, undefined, { from, to }, true)
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="created_at" sort={histSort} onToggle={toggleHistSort} className="min-w-28">วันที่</SortableTableHead>
                <SortableTableHead field="invoice_no" sort={histSort} onToggle={toggleHistSort} className="min-w-[150px]">เลขที่ใบรับ</SortableTableHead>
                <TableHead className="min-w-[200px]">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="min-w-20 text-right">รายการ</TableHead>
                <SortableTableHead field="total_cost" align="right" sort={histSort} onToggle={toggleHistSort} className="min-w-28">ยอดรวม</SortableTableHead>
                <TableHead className="min-w-[130px] text-center">สถานะ</TableHead>
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHist ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-foreground-subtle py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-foreground-subtle py-16">
                    <FileText className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : history.map(h => {
                const isCancelled = h.status === 'cancelled'
                const isOverdue = !isCancelled && h.payment_type === 'credit' && !h.is_paid && !!h.due_date && h.due_date < today
                const isSelected = selectedInvoice === h.invoice_no
                return (
                  <TableRow
                    key={h.invoice_no}
                    className={`${isSelected ? 'bg-primary-soft' : ''} ${isCancelled ? 'opacity-70' : ''}`}
                  >
                    <TableCell className="whitespace-nowrap">{formatDate(h.created_at)}</TableCell>
                    <TableCell className={`font-mono ${isCancelled ? 'text-muted-foreground line-through' : isSelected ? 'text-primary' : ''}`}>
                      {h.invoice_no}
                    </TableCell>
                    <TableCell className="truncate">{h.supplier_name ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.item_count}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${isCancelled ? 'text-foreground-subtle line-through' : ''}`}>
                      {formatCurrency(h.total_cost)}
                    </TableCell>
                    <TableCell className="text-center">
                      {isCancelled
                        ? <Badge variant="destructive">ยกเลิก</Badge>
                        : h.payment_type === 'credit'
                          ? h.is_paid
                            ? <Badge variant="success">ชำระแล้ว</Badge>
                            : isOverdue
                              ? <Badge variant="destructive"><AlertTriangle className="size-3" />{h.due_date ? formatDate(h.due_date) : ''}</Badge>
                              : <Badge variant="warm"><CreditCard className="size-3" />{h.due_date ? formatDate(h.due_date) : ''}</Badge>
                          : <Badge variant="brand-soft">เงินสด</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Button
                          size="icon-lg"
                          variant="warm"
                          onClick={() => openReceipt(h.invoice_no)}
                          title="ดูรายการ"
                        >
                          <Info />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Status / pagination footer */}
        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span>แสดง</span>
            <Select value={String(histPageSize)} onValueChange={v => setHistPageSize(v === 'all' ? 'all' : Number(v))}>
              <SelectTrigger className="h-9 min-w-20">
                <SelectValue>{histPageSize === 'all' ? 'ทั้งหมด' : String(histPageSize)}</SelectValue>
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
            <Pagination page={histPage} totalPages={histTotalPages} onPageChange={p => loadHistory(p)} className="w-auto justify-center" />
          </div>
          <span className="text-muted-foreground shrink-0">
            {loadingHist ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{histTotal.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      {/* ── Receipt detail dialog ── */}
      <Dialog
        open={!!selectedInvoice && receiptItems.length > 0}
        onOpenChange={(o) => { if (!o) { setSelectedInvoice(null); setReceiptItems([]); setReceiptInvoice('') } }}
      >
        <DialogContent size="4xl" className="max-h-[88vh] flex flex-col">
          {(() => {
            const h = history.find(r => r.invoice_no === receiptInvoice)
            const first = receiptItems[0]
            if (!first) return null
            const isCancelled = (first.status ?? h?.status) === 'cancelled'
            const isOverdue = !isCancelled && h && h.payment_type === 'credit' && !h.is_paid && !!h.due_date && h.due_date < today
            const rawTotal = receiptItems.reduce((s, i) => s + i.cost_price * i.qty_received, 0)
            const discountAmt = first.discount_amount ?? 0
            const surchargeAmt = first.surcharge_amount ?? 0
            const hasAdjust = discountAmt > 0 || surchargeAmt > 0
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 pr-10">
                    <span className={isCancelled ? 'text-muted-foreground line-through' : ''}>{receiptInvoice}</span>
                    {isCancelled
                      ? <Badge variant="destructive" className="text-sm">ยกเลิกแล้ว</Badge>
                      : h && (
                        h.payment_type === 'credit'
                          ? h.is_paid
                            ? <Badge variant="success" className="text-sm">ชำระแล้ว</Badge>
                            : isOverdue
                              ? <Badge variant="destructive" className="text-sm">เกินกำหนด{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                              : <Badge variant="warm" className="text-sm">เครดิต{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                          : <Badge variant="brand-soft" className="text-sm">เงินสด</Badge>
                      )}
                  </DialogTitle>
                </DialogHeader>

                <DialogBody className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
                  {isCancelled && (
                    <div className="px-4 py-2.5 bg-destructive-soft rounded-lg shrink-0">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-destructive">
                            บิลถูกยกเลิก{first.cancelled_at ? ` · ${formatDate(first.cancelled_at)}` : ''}
                          </div>
                          {first.cancel_reason && (
                            <div className="text-sm text-destructive mt-0.5 break-words">เหตุผล: {first.cancel_reason}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 shrink-0">
                    <div>
                      <div className="text-sm text-foreground-subtle uppercase tracking-wide">ผู้จำหน่าย</div>
                      <div className="text-sm font-medium text-foreground truncate">{first.supplier_name ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-foreground-subtle uppercase tracking-wide">เลขที่ใบกำกับสินค้า</div>
                      <div className="text-sm font-medium text-foreground">{first.supplier_invoice_no || '—'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-foreground-subtle uppercase tracking-wide">วันที่สั่งซื้อตามบิล</div>
                      <div className="text-sm font-medium text-foreground">{first.order_date ? formatDate(first.order_date) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-foreground-subtle uppercase tracking-wide">วันที่รับสินค้า</div>
                      <div className="text-sm font-medium text-foreground">{first.created_at ? formatDate(first.created_at) : '—'}</div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden">
                    <Table containerClassName="h-full overflow-auto scrollbar-thin">
                      <TableHeader>
                        <TableRow>
                          <TableHead>สินค้า</TableHead>
                          <TableHead>หน่วย</TableHead>
                          <TableHead className="text-right">ราคาทุน</TableHead>
                          <TableHead className="text-right">จำนวน</TableHead>
                          <TableHead className="text-right">รวม</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receiptItems.map(item => {
                          const es = getExpiryStatus(item.expiry_date)
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="font-medium text-sm">{item.trade_name}</div>
                                <div className="flex flex-col items-start gap-0.5 mt-0.5">
                                  {item.lot_number && (
                                    <span className="text-sm text-foreground-subtle">Lot. {item.lot_number}</span>
                                  )}
                                  {item.expiry_date && (
                                    <span className={`text-sm ${
                                      es === 'expired' ? 'text-destructive font-semibold' :
                                      es === 'danger'  ? 'text-warning-strong font-semibold' :
                                      es === 'warning' ? 'text-warning' :
                                      'text-foreground-subtle'
                                    }`}>exp. {formatExpiry(item.expiry_date)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{item.unit_name || '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(item.cost_price)}</TableCell>
                              <TableCell className="text-right tabular-nums">{item.qty_received}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(item.cost_price * item.qty_received)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                      {hasAdjust && (
                        <tfoot>
                          <tr className="bg-muted/40">
                            <td colSpan={4} className="px-4 py-1.5 text-right text-sm text-muted-foreground">ราคารวมก่อนปรับ</td>
                            <td className="px-4 py-1.5 text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(rawTotal)}</td>
                          </tr>
                          {discountAmt > 0 && (
                            <tr className="bg-muted/40">
                              <td colSpan={4} className="px-4 py-1 text-right text-sm text-primary">ส่วนลดรวม</td>
                              <td className="px-4 py-1 text-right text-sm tabular-nums text-primary">−{formatCurrency(discountAmt)}</td>
                            </tr>
                          )}
                          {surchargeAmt > 0 && (
                            <tr className="bg-muted/40">
                              <td colSpan={4} className="px-4 py-1 text-right text-sm text-warning-strong">ส่วนเพิ่ม</td>
                              <td className="px-4 py-1 text-right text-sm tabular-nums text-warning-strong">+{formatCurrency(surchargeAmt)}</td>
                            </tr>
                          )}
                        </tfoot>
                      )}
                    </Table>
                  </div>

                  <div className="flex justify-between items-center shrink-0">
                    <div className="text-sm text-muted-foreground">{receiptItems.length} รายการ</div>
                    <div className="font-extrabold text-primary tabular-nums text-lg">
                      {formatCurrency(rawTotal - discountAmt + surchargeAmt)}
                    </div>
                  </div>
                </DialogBody>

                <DialogFooter>
                  {!isCancelled && (
                    <>
                      <Button variant="outline" size="lg" onClick={openEditBill}>แก้ไขบิล</Button>
                      <Button
                        variant="destructive"
                        size="lg"
                        onClick={() => { setCancelReason(''); setCancelBlockers([]); setShowCancelModal(true) }}
                      >
                        <X className="size-4" />
                        ยกเลิกบิล
                      </Button>
                    </>
                  )}
                  <Button
                    variant="destructive2"
                    size="lg"
                    onClick={() => { setSelectedInvoice(null); setReceiptItems([]); setReceiptInvoice('') }}
                  >
                    ปิด
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Edit-bill (header) modal ── */}
      <Dialog open={showEditModal} onOpenChange={(o) => { if (!editSaving) setShowEditModal(o) }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="text-xl">แก้ไขรายละเอียดบิล</DialogTitle>
            <div className="text-sm text-muted-foreground mt-0.5">{receiptInvoice}</div>
          </DialogHeader>
          <DialogBody className="space-y-4">
              <div>
                <label className="block text-base font-medium mb-1">ผู้จำหน่าย <span className="text-destructive">*</span></label>
                <Select value={String(editSupplierId)} onValueChange={v => setEditSupplierId(Number(v))}>
                  <SelectTrigger className="h-10 rounded-xl text-sm">
                    <SelectValue placeholder="— เลือกผู้จำหน่าย —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— เลือกผู้จำหน่าย —</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-base font-medium mb-1">เลขที่ใบกำกับสินค้า <span className="text-destructive">*</span></label>
                <Input
                  value={editSupplierInvoiceNo}
                  onChange={e => setEditSupplierInvoiceNo(e.target.value)}
                  className="h-10 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-medium mb-1">วันที่สั่งซื้อตามบิล</label>
                  <DateInput value={editOrderDate} onChange={setEditOrderDate} className="w-full h-10 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-base font-medium mb-1">วันที่รับสินค้า <span className="text-destructive">*</span></label>
                  <DateInput value={editReceiveDate} onChange={setEditReceiveDate} className="w-full h-10 rounded-xl text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium mb-2">ประเภทการชำระเงิน</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={editPaymentType === 'cash' ? 'default' : 'secondary'}
                    onClick={() => setEditPaymentType('cash')}
                    className="flex-1 h-10 rounded-xl text-sm font-semibold gap-1.5"
                  >
                    <Banknote className="size-4" /> เงินสด
                  </Button>
                  <Button
                    type="button"
                    variant={editPaymentType === 'credit' ? 'warm' : 'secondary'}
                    onClick={() => setEditPaymentType('credit')}
                    className="flex-1 h-10 rounded-xl text-sm font-semibold gap-1.5"
                  >
                    <CreditCard className="size-4" /> เครดิต
                  </Button>
                </div>
              </div>

              {editPaymentType === 'credit' && (
                <div className="rounded-xl bg-muted p-3 space-y-3">
                  <div>
                    <label className="block text-base font-medium mb-1">วันครบกำหนดชำระ <span className="text-destructive">*</span></label>
                    <DateInput value={editDueDate} onChange={setEditDueDate} className="w-full h-10 rounded-xl text-sm" />
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <Checkbox
                      id="edit-is-paid"
                      checked={editIsPaid}
                      onCheckedChange={(v) => setEditIsPaid(!!v)}
                    />
                    <label htmlFor="edit-is-paid" className="text-base font-medium cursor-pointer">ชำระแล้ว</label>
                  </div>
                  {editIsPaid && (
                    <div>
                      <label className="block text-base font-medium mb-1">วันที่ชำระ</label>
                      <DateInput value={editPaidDate} onChange={setEditPaidDate} className="w-full h-10 rounded-xl text-sm" />
                    </div>
                  )}
                </div>
              )}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setShowEditModal(false)} disabled={editSaving}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel-bill confirm dialog ── */}
      <Dialog open={showCancelModal} onOpenChange={(o) => { if (!cancelling) setShowCancelModal(o) }}>
        <DialogContent size="md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="grid place-items-center size-10 rounded-xl bg-destructive-soft text-destructive shrink-0">
                <AlertTriangle className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-xl">ยกเลิกบิลรับสินค้า</DialogTitle>
                <div className="text-sm text-muted-foreground mt-0.5">{receiptInvoice}</div>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
              <div className="rounded-xl bg-destructive-soft/40 border border-destructive-soft p-3 text-sm text-destructive leading-relaxed">
                การยกเลิกจะคืนสต็อกที่รับเข้ามาของบิลนี้ออกจากคลัง และไม่สามารถย้อนกลับได้ หากสินค้าบางส่วนถูกขายไปแล้ว ระบบจะไม่อนุญาตให้ยกเลิก
              </div>
              <div>
                <label className="block text-base font-medium mb-1">เหตุผล <span className="text-destructive">*</span></label>
                <Textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="ระบุเหตุผลในการยกเลิก..."
                  className="rounded-xl text-sm"
                  autoFocus
                />
              </div>
              {cancelBlockers.length > 0 && (
                <div className="rounded-xl bg-destructive-soft p-3">
                  <div className="text-sm font-semibold text-destructive mb-1.5">สินค้าต่อไปนี้ถูกขายไปแล้ว ไม่สามารถยกเลิกบิลได้:</div>
                  <ul className="text-sm text-destructive space-y-0.5 list-disc pl-4">
                    {cancelBlockers.map((b, i) => (
                      <li key={i}>
                        <span className="font-medium">{b.trade_name}</span>
                        <span className="text-destructive"> · Lot {b.lot_number}</span>
                        <span className="text-destructive"> · ต้องคืน {b.need} แต่เหลือเพียง {b.have}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setShowCancelModal(false)} disabled={cancelling}>ยกเลิก</Button>
            <Button
              variant="destructive"
              size="xl"
              onClick={handleCancelBill}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
