import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
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
import { PurchaseReceiptDialog } from '@/components/dialogs/PurchaseReceiptDialog'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import type { Supplier, ProductLot } from '@/types'
import type { ManageOutletContext } from './index'
import {
  Search, X, Building2, Banknote, CreditCard, FileText, AlertTriangle, Ban, Info, Check,
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

  // Receipt detail dialog — selectedInvoice drives PurchaseReceiptDialog
  // (loads items itself); receiptItems is hydrated via onLoad so openEditBill
  // can read header fields without a duplicate fetch. receiptRefresh forces
  // the dialog to re-fetch after edit/cancel.
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [receiptItems, setReceiptItems] = useState<ReceiptDetail[]>([])
  const [receiptRefresh, setReceiptRefresh] = useState(0)

  // Cancel-GR modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelBlockers, setCancelBlockers] = useState<Array<{ trade_name: string; product_code: string; lot_number: string; need: number; have: number }>>([])

  // Quick-paid (mark unpaid credit bill as paid today, one-click from the
  // GR detail dialog's footer-left)
  const [quickPaying, setQuickPaying] = useState(false)

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
      { v: 'credit',    label: 'เครดิต', count: histSummary.credit_count,    icon: CreditCard,    tint: 'warm' },
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

  const openReceipt = (invoice_no: string) => {
    setSelectedInvoice(invoice_no)
  }

  const openEditBill = () => {
    if (!selectedInvoice || receiptItems.length === 0) return
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
    if (!selectedInvoice) return
    if (!editSupplierId) { toast('กรุณาเลือกผู้จัดจำหน่าย', 'error'); return }
    if (!editSupplierInvoiceNo.trim()) { toast('กรุณาระบุเลขที่ใบกำกับสินค้า', 'error'); return }
    if (!editReceiveDate) { toast('กรุณาระบุวันที่รับสินค้า', 'error'); return }
    if (editPaymentType === 'credit' && !editDueDate) { toast('กรุณาระบุวันครบกำหนดชำระ', 'error'); return }
    setEditSaving(true)
    try {
      const res = await window.api.purchase.updateHeader({
        invoice_no: selectedInvoice,
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
        setReceiptRefresh(n => n + 1)
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

  const handleQuickPay = async () => {
    if (!selectedInvoice || receiptItems.length === 0) return
    const first = receiptItems[0]
    setQuickPaying(true)
    try {
      const res = await window.api.purchase.updateHeader({
        invoice_no: selectedInvoice,
        supplier_id: (first as any).supplier_id ?? 0,
        supplier_invoice_no: first.supplier_invoice_no ?? '',
        order_date: first.order_date || undefined,
        receive_date: first.created_at,
        payment_type: 'credit',
        due_date: first.due_date || undefined,
        is_paid: true,
        paid_date: today,
        userId: getCurrentUserId(),
      }) as any
      if (res?.success) {
        toast('บันทึกการชำระเงินสำเร็จ', 'success')
        await loadHistory(histPage)
        setReceiptRefresh(n => n + 1)
      } else if (res?.error === 'cancelled') {
        toast('บิลถูกยกเลิกแล้ว ไม่สามารถชำระได้', 'error')
      } else if (res?.error === 'not_found') {
        toast('ไม่พบบิล', 'error')
      } else {
        toast('บันทึกไม่สำเร็จ', 'error')
      }
    } catch (e: any) {
      toast(e?.message ? `บันทึกไม่สำเร็จ: ${e.message}` : 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setQuickPaying(false)
    }
  }

  const handleCancelBill = async () => {
    if (!selectedInvoice) return
    const reason = cancelReason.trim()
    if (!reason) { toast('กรุณาระบุเหตุผล', 'error'); return }
    setCancelling(true)
    try {
      const res = await window.api.purchase.cancel({
        invoice_no: selectedInvoice,
        reason,
        userId: getCurrentUserId(),
      }) as any
      if (res?.success) {
        toast('ยกเลิกบิลสำเร็จ', 'success')
        setShowCancelModal(false)
        setCancelReason('')
        setCancelBlockers([])
        await loadHistory(histPage)
        setReceiptRefresh(n => n + 1)
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
  const editSupplier = suppliers.find(s => s.id === editSupplierId) ?? null
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
                <SortableTableHead field="created_at" sort={histSort} onToggle={toggleHistSort} className="min-w-24">วันที่</SortableTableHead>
                <SortableTableHead field="invoice_no" sort={histSort} onToggle={toggleHistSort} className="min-w-32">เลขที่ใบรับ</SortableTableHead>
                <TableHead className="min-w-48">ผู้จัดจำหน่าย</TableHead>
                <TableHead className="min-w-20 text-center">รายการ</TableHead>
                <SortableTableHead field="total_cost" align="right" sort={histSort} onToggle={toggleHistSort} className="min-w-20">ยอดรวม</SortableTableHead>
                <TableHead className="min-w-28 text-center">สถานะ</TableHead>
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
                    <TableCell className="text-center tabular-nums">{h.item_count}</TableCell>
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
                              ? <Badge variant="destructive">เครดิต</Badge>
                              : <Badge variant="tertiary">เครดิต</Badge>
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
            {loadingHist ? 'กำลังโหลด...' : <>จำนวนบิลในหน้านี้ <span className="font-semibold text-foreground tabular-nums">{history.length.toLocaleString()}</span> บิล</>}
          </span>
        </div>
      </div>

      {/* ── Receipt detail dialog (shared with HistoryTab) ── */}
      {(() => {
        const receiptHeader = receiptItems[0]
        const receiptCancelled = receiptHeader?.status === 'cancelled'
        const canQuickPay = !!receiptHeader && !receiptCancelled
          && receiptHeader.payment_type === 'credit' && !receiptHeader.is_paid
        return (
          <PurchaseReceiptDialog
            open={!!selectedInvoice}
            onOpenChange={(o) => { if (!o) { setSelectedInvoice(null); setReceiptItems([]) } }}
            invoiceNo={selectedInvoice}
            refreshKey={receiptRefresh}
            onLoad={(items) => setReceiptItems(items as ReceiptDetail[])}
            footerLeft={canQuickPay && (
              <Button variant="success" size="xl" onClick={handleQuickPay} disabled={quickPaying}>
                <Check className="size-4" />
                {quickPaying ? 'กำลังบันทึก...' : 'ชำระวันนี้'}
              </Button>
            )}
            actions={
              <>
                <Button variant="warm" size="xl" onClick={openEditBill}>แก้ไขบิล</Button>
                <Button
                  variant="destructive"
                  size="xl"
                  onClick={() => { setCancelReason(''); setCancelBlockers([]); setShowCancelModal(true) }}
                >
                  <X className="size-4" />
                  ยกเลิกบิล
                </Button>
              </>
            }
          />
        )
      })()}

      {/* ── Edit-bill (header) modal ──
          Fixed height (h-[640px]) so toggling cash/credit doesn't resize the
          dialog. The credit-details panel is always rendered and just dims
          when payment_type === 'cash' (the alternative — conditional render —
          made the modal jump and shift the footer buttons). */}
      <Dialog open={showEditModal} onOpenChange={(o) => { if (!editSaving) setShowEditModal(o) }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <FileText className="size-5 text-muted-foreground" />
              <span>แก้ไขรายละเอียดบิล</span>
              <span className="text-sm font-mono text-muted-foreground font-normal">{selectedInvoice}</span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {/* min-w-0 on each grid item lets columns shrink past their
                content size — without it a long supplier name would push the
                column wide and squash the invoice field. The Combobox trigger
                already truncates internally. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="block text-sm font-medium mb-1.5">
                  ผู้จัดจำหน่าย <span className="text-destructive">*</span>
                </label>
                <Combobox
                  items={suppliers}
                  value={editSupplier}
                  onChange={(s) => setEditSupplierId(s?.id ?? 0)}
                  getKey={(s) => s.id}
                  getLabel={(s) => s.name}
                  getSublabel={(s) => s.code}
                  icon={Building2}
                  emptyLabel="— เลือกผู้จัดจำหน่าย —"
                  searchPlaceholder="ชื่อหรือรหัสผู้จัดจำหน่าย..."
                  emptyText="ไม่พบผู้จัดจำหน่าย"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium mb-1.5">
                  เลขที่ใบกำกับสินค้า <span className="text-destructive">*</span>
                </label>
                <Input
                  value={editSupplierInvoiceNo}
                  onChange={e => setEditSupplierInvoiceNo(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">วันที่สั่งซื้อตามบิล</label>
                <DateInput value={editOrderDate} onChange={setEditOrderDate} className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  วันที่รับสินค้า <span className="text-destructive">*</span>
                </label>
                <DateInput value={editReceiveDate} onChange={setEditReceiveDate} className="w-full" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">การชำระเงิน</label>
              {/* Sliding pill toggle — same `layoutId` on both motion.spans
                  makes framer-motion animate the active background between
                  them. Pattern ported from the Purchase (รับสินค้า) page. */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditPaymentType('cash')}
                  className={cn(
                    'relative flex-1 h-10 rounded-lg text-sm font-semibold gap-1.5 hover:bg-transparent',
                    editPaymentType === 'cash'
                      ? 'text-primary-foreground hover:text-primary-foreground'
                      : 'text-foreground-subtle hover:text-foreground',
                  )}
                >
                  {editPaymentType === 'cash' && (
                    <motion.span
                      layoutId="edit-payment-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-lg bg-primary"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <Banknote className="size-4" /> เงินสด
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditPaymentType('credit')}
                  className={cn(
                    'relative flex-1 h-10 rounded-lg text-sm font-semibold gap-1.5 hover:bg-transparent',
                    editPaymentType === 'credit'
                      ? 'text-tertiary-foreground hover:text-tertiary-foreground'
                      : 'text-foreground-subtle hover:text-foreground',
                  )}
                >
                  {editPaymentType === 'credit' && (
                    <motion.span
                      layoutId="edit-payment-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-lg bg-tertiary"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <CreditCard className="size-4" /> เครดิต
                  </span>
                </Button>
              </div>
            </div>

            <div className={cn(
              'rounded-card bg-muted/50 p-4 space-y-3 transition-opacity',
              editPaymentType !== 'credit' && 'opacity-40 pointer-events-none',
            )}>
              {/* Two-column layout — left: due date + day-offset shortcuts,
                  right: paid date + วันนี้/วันครบกำหนด shortcuts. The "ชำระแล้ว"
                  checkbox lives in the right column's label slot so it sits
                  directly above the field it controls; whole right column
                  dims when unchecked. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="flex items-center h-6 text-sm font-medium">
                    วันครบกำหนดชำระ <span className="text-destructive ml-1">*</span>
                  </label>
                  <DateInput value={editDueDate} onChange={setEditDueDate} className="w-full" />
                  <div className="flex gap-1">
                    {[15, 30, 60, 90].map(d => (
                      <Button
                        key={d}
                        type="button"
                        variant="warm"
                        onClick={() => {
                          const dt = new Date()
                          dt.setDate(dt.getDate() + d)
                          setEditDueDate(dt.toISOString().slice(0, 10))
                        }}
                        className="flex-1 h-8 px-0 text-sm font-semibold"
                      >
                        {d} วัน
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none h-6">
                    <Checkbox
                      id="edit-is-paid"
                      checked={editIsPaid}
                      onCheckedChange={(v) => setEditIsPaid(v === true)}
                    />
                    <span className="text-sm font-medium">ชำระเงินแล้ว</span>
                  </label>
                  <div className={cn('space-y-1.5 transition-opacity', !editIsPaid && 'opacity-40 pointer-events-none')}>
                    <DateInput value={editPaidDate} onChange={setEditPaidDate} className="w-full" />
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="brand-soft"
                        onClick={() => setEditPaidDate(today)}
                        className="flex-1 h-8 text-sm font-semibold"
                      >
                        วันนี้
                      </Button>
                      <Button
                        type="button"
                        variant="warm"
                        onClick={() => editDueDate && setEditPaidDate(editDueDate)}
                        disabled={!editDueDate}
                        className="flex-1 h-8 text-sm font-semibold"
                      >
                        วันครบกำหนด
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                <div className="text-sm text-muted-foreground mt-0.5">{selectedInvoice}</div>
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
                    {Array.from(new Set(cancelBlockers.map(b => b.trade_name))).map((name, i) => (
                      <li key={i} className="font-medium">{name}</li>
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
