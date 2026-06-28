import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useOutletContext } from 'react-router-dom'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { getCurrentUserId } from '@/stores/userStore'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { useShopVat } from '@/hooks/useShopVat'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { MultiDatePicker, rangeForMultiMode, type MultiDateMode } from '@/components/ui/multi-date-picker'
import { usePagePrefs } from '@/hooks/usePagePrefs'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { Pagination, type PageSize } from '@/components/ui/pagination'
import { PurchaseReceiptDialog } from '@/components/dialogs/PurchaseReceiptDialog'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import type { Supplier, ProductLot } from '@/types'
import type { ManageOutletContext } from './index'
import { useCan } from '@/hooks/useCan'
import { MetricStrip, SectionCard } from '@/components/ui/card'
import { TrendChart, type TrendDatum } from '@/components/ui/charts/trend-chart'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { delta } from '@/lib/delta'
import { trendOf, compareLabelForMode, prevWindowForMode, granularityForMode } from '@/lib/finance-panel'
import {
  X, Building2, Banknote, CreditCard, FileText, AlertTriangle, Ban, Check, Settings2, Eye, Filter, MoreHorizontal, Percent,
  Coins, LineChart, ListChecks,
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
  vat_mode?: string
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

interface PurchasesPrefs {
  histPageSize: PageSize
  histSort: SortState
  // mode persisted always (day/month/year roll on mount); from/to only used
  // when mode === 'custom'.
  dateMode: MultiDateMode
  dateFrom: string
  dateTo: string
  showColDate: boolean
  showColSupplier: boolean
  showColItems: boolean
  showColTotal: boolean
  showColStatus: boolean
}

const PURCHASES_DEFAULTS: PurchasesPrefs = {
  histPageSize: 50,
  histSort: { by: 'created_at', dir: 'desc' },
  dateMode: 'month',
  dateFrom: new Date().toISOString().slice(0, 8) + '01',
  dateTo: new Date().toISOString().slice(0, 10),
  showColDate: true,
  showColSupplier: true,
  showColItems: true,
  showColTotal: true,
  showColStatus: true,
}

// ── Finance overview (admin only) ────────────────────────────────────────────
// Subset of reports:financeSummary's payload (preload returns `any`, so cast).
// The panel shows date-window purchase totals + the CURRENT outstanding payable.
interface PurchaseFinanceSummary {
  purchase_total: number
  purchase_cash: number
  purchase_credit: number
  purchase_count: number
  // Accounts payable is CURRENT outstanding (not date-bound).
  payable_total: number
  payable_count: number
  // Previous equal-length window — drives the "vs ช่วงก่อน" trend line.
  previous: { purchase_total: number; purchase_cash: number; purchase_credit: number } | null
}

// The trend chart has 2 modes — purchase value or bill count over the range.
type PurchaseChartMetric = 'purchase' | 'bills'
const PURCHASE_CHART_METRICS: Record<PurchaseChartMetric, {
  label: string
  bar: { key: string; name: string; color: string }
  valueFormat: 'currency' | 'int'
}> = {
  purchase: { label: 'ยอดซื้อ',  bar: { key: 'purchase_total', name: 'ยอดซื้อ',  color: 'hsl(var(--primary))' }, valueFormat: 'currency' },
  bills:    { label: 'จำนวนบิล', bar: { key: 'purchase_count', name: 'จำนวนบิล', color: 'hsl(var(--info))' },    valueFormat: 'int' },
}

// Status-breakdown colors — one color language across MetricStrip/MetricCard/this
// card, all 4 distinct (no dup): เงินสด=info (info-outline badge), เครดิต(จ่ายแล้ว)=amber
// (เครดิต family), ค้างชำระ=violet (distinct at-risk), ยกเลิก=destructive. unpaid ⊂ credit,
// so the proportion uses เครดิต(จ่ายแล้ว)=credit−unpaid.
const PURCHASE_STATUS_COLOR: Record<string, string> = {
  cash:        'hsl(var(--info))',
  credit_paid: 'hsl(var(--amber))',
  unpaid:      'hsl(var(--violet))',
  cancelled:   'hsl(var(--destructive))',
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ManagePurchasesPage() {
  const { toast } = useToast()
  const { setSummary: setSlotSummary, setTabActions } = useOutletContext<ManageOutletContext>()
  // VAT column + filter only surface once the shop is VAT-registered (input VAT
  // exists). Matches the hide-when-NO-VAT rule used across the app.
  const { vatEnabled } = useShopVat()
  // The finance overview panel (and its page-level scroll) shows for any role
  // that can see finance reports — not just the owner. The staff MetricCard slot
  // stays for non-admins.
  const isAdmin = useCan('report.finance') !== 'off'

  const [prefs, setPrefs] = usePagePrefs<PurchasesPrefs>('purchases', PURCHASES_DEFAULTS)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // History list
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [histTotal, setHistTotal] = useState(0)
  const [histPage, setHistPage] = useState(1)
  // Recompute the date range fresh on mount: day/month/year roll from today
  // (so a "this month" view doesn't show last month after a rollover); custom
  // restores the persisted absolute from/to.
  const initialRange = prefs.dateMode === 'custom'
    ? { from: prefs.dateFrom, to: prefs.dateTo }
    : rangeForMultiMode(prefs.dateMode)
  const histPageSize = prefs.histPageSize
  const setHistPageSize = (v: PageSize) => setPrefs({ histPageSize: v })
  const [histQ, setHistQ] = useState('')
  const [histSupplierId, setHistSupplierId] = useState<number>(0)
  const [histDateMode, setHistDateMode] = useState<MultiDateMode>(prefs.dateMode)
  const [histDateFrom, setHistDateFrom] = useState(initialRange.from)
  const [histDateTo, setHistDateTo] = useState(initialRange.to)
  const [histPaymentFilter, setHistPaymentFilter] = useState<'all' | 'cash' | 'credit' | 'unpaid' | 'cancelled'>('all')
  const [histVatFilter, setHistVatFilter] = useState<'all' | 'vat' | 'novat'>('all')
  const [histSummary, setHistSummary] = useState({ count: 0, cash_count: 0, credit_count: 0, unpaid_count: 0, cancelled_count: 0 })
  const histSort = prefs.histSort
  const setHistSort = (next: SortState | ((prev: SortState) => SortState)) => {
    setPrefs({ histSort: typeof next === 'function' ? next(prefs.histSort) : next })
  }
  // Column visibility (เลขที่ใบรับ + จัดการ always shown)
  const showColDate = prefs.showColDate
  const showColSupplier = prefs.showColSupplier
  const showColItems = prefs.showColItems
  const showColTotal = prefs.showColTotal
  const showColStatus = prefs.showColStatus
  const [loadingHist, setLoadingHist] = useState(false)

  // Finance overview (admin-only) — always shown, no toggle. Chart bucket size is
  // derived from the date mode; chartMetric picks which series the bar chart shows.
  const gran = granularityForMode(histDateMode)
  const [chartMetric, setChartMetric] = useState<PurchaseChartMetric>('purchase')
  // Hovered status in the breakdown card — links the proportion bar to its legend.
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null)
  const [finance, setFinance] = useState<PurchaseFinanceSummary | null>(null)
  const [trend, setTrend] = useState<TrendDatum[]>([])
  const [finLoading, setFinLoading] = useState(false)

  // Receipt detail dialog — selectedInvoice drives PurchaseReceiptDialog
  // (loads items itself); receiptItems is hydrated via onLoad so openEditBill
  // can read header fields without a duplicate fetch. receiptRefresh forces
  // the dialog to re-fetch after edit/cancel.
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [receiptItems, setReceiptItems] = useState<ReceiptDetail[]>([])
  const [receiptRefresh, setReceiptRefresh] = useState(0)

  // Invoice targeted by the edit/cancel modals. Kept separate from
  // selectedInvoice (which drives the receipt dialog's open state) so those
  // modals can be triggered straight from a row's จัดการ menu without first
  // opening the receipt dialog.
  const [actionInvoice, setActionInvoice] = useState<string | null>(null)

  // Cancel-GR modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const overrideCancel = useManagerOverride()
  const [cancelBlockers, setCancelBlockers] = useState<Array<{ trade_name: string; product_code: string; lot_number: string; need: number; have: number }>>([])

  // Quick-paid (mark unpaid credit bill as paid today, one-click from the
  // GR detail dialog's footer-left)
  const [quickPaying, setQuickPaying] = useState(false)
  // Invoice awaiting "ชำระวันนี้" confirmation (null = dialog closed). Both the
  // row menu and the receipt-dialog footer route through this confirm.
  const [confirmPayInvoice, setConfirmPayInvoice] = useState<string | null>(null)

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
  // Per-field red-border flags for required date fields. Set on a failed save,
  // cleared as soon as that field changes — so a forgotten/blank date lights up
  // (DateInput's internal red border only fires for non-empty invalid text).
  const [dateErrors, setDateErrors] = useState({ order: false, receive: false, due: false, paid: false })

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
        vat_filter: histVatFilter,
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
  }, [histQ, histSupplierId, histDateFrom, histDateTo, histPaymentFilter, histVatFilter, histPageSize, histSort, selectedInvoice])

  // Admin-only fetch — the finance panel is always shown for admins. Gated on
  // isAdmin (the IPCs also requirePermission('report.finance')). Date-window only:
  // driven by the MultiDatePicker, NOT the table's q/supplier/status/VAT filters.
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    const r = window.api.reports as any
    setFinLoading(true)
    Promise.all([
      r.financeSummary({ date_from: histDateFrom, date_to: histDateTo, with_compare: true, ...prevWindowForMode(histDateMode, histDateFrom, histDateTo) }),
      r.salesPurchaseTrend({ date_from: histDateFrom, date_to: histDateTo, granularity: gran }),
    ])
      .then(([f, tr]) => {
        if (cancelled) return
        setFinance((f ?? null) as PurchaseFinanceSummary | null)
        setTrend((tr ?? []) as TrendDatum[])
      })
      .catch((e: any) => {
        if (cancelled) return
        toast(e?.message ? `โหลดภาพรวมการเงินไม่สำเร็จ: ${e.message}` : 'โหลดภาพรวมการเงินไม่สำเร็จ', 'error')
        setTrend([])
      })
      .finally(() => { if (!cancelled) setFinLoading(false) })
    return () => { cancelled = true }
  }, [isAdmin, histDateMode, histDateFrom, histDateTo, gran, toast])

  // Passive MetricCard snapshot of the q/date set (STAFF only — admins get the
  // in-page สถานะการซื้อ card instead, so the parent slot is cleared for them).
  // The status filter lives in the filter strip's Filter popover (no onClick →
  // ManageLayout renders MetricCard instead of the clickable StatCard).
  useEffect(() => {
    if (isAdmin) { setSlotSummary(null); return }
    setSlotSummary([
      { label: 'จำนวนบิล', value: histSummary.count.toLocaleString(),           icon: FileText,      tint: 'primary',      sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'เงินสด',    value: histSummary.cash_count.toLocaleString(),      icon: Banknote,      tint: 'info-soft',    sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'เครดิต',    value: histSummary.credit_count.toLocaleString(),    icon: CreditCard,    tint: 'amber',        sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ค้างชำระ',  value: histSummary.unpaid_count.toLocaleString(),    icon: AlertTriangle, tint: 'violet',        sub: 'รายการ', subClassName: 'text-base text-foreground' },
      { label: 'ยกเลิก',    value: histSummary.cancelled_count.toLocaleString(), icon: Ban,           tint: 'destructive', sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    ])
  }, [isAdmin, histSummary, setSlotSummary])

  // Clear slot summary on unmount — prevents stale cards leaking into the next
  // tab (esp. NegativeStock which has no summary of its own to overwrite).
  useEffect(() => {
    return () => setSlotSummary(null)
  }, [setSlotSummary])

  // The date range picker lives in the page's TabStrip row (aligned right beside
  // the main tabs), not the table top bar. Re-inject on every range change so the
  // injected node reflects the current mode/from/to; clear on unmount.
  useEffect(() => {
    setTabActions(
      <MultiDatePicker
        size="lg"
        mode={histDateMode}
        from={histDateFrom}
        to={histDateTo}
        onChange={(m, from, to) => {
          setHistDateMode(m)
          setHistDateFrom(from)
          setHistDateTo(to)
          setPrefs({ dateMode: m, dateFrom: from, dateTo: to })
          loadHistory(1, undefined, { from, to }, true)
        }}
        className="shrink-0"
      />,
    )
  }, [histDateMode, histDateFrom, histDateTo, setPrefs, loadHistory, setTabActions])

  useEffect(() => {
    return () => setTabActions(null)
  }, [setTabActions])

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

  // Refilter on VAT dropdown change (skip initial mount). Effect (not inline
  // onValueChange) so the closure sends the up-to-date histVatFilter.
  const vatEffectMounted = useRef(false)
  useEffect(() => {
    if (!vatEffectMounted.current) { vatEffectMounted.current = true; return }
    loadHistory(1, undefined, undefined, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histVatFilter])

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

  // Populate the edit-bill form from a receipt header row and open the modal.
  const populateEditFromHeader = (first: ReceiptDetail, invoice_no: string) => {
    setActionInvoice(invoice_no)
    setEditSupplierId((first as any).supplier_id ?? 0)
    setEditSupplierInvoiceNo(first.supplier_invoice_no ?? '')
    setEditOrderDate(first.order_date ?? '')
    setEditReceiveDate(first.created_at ?? '')
    const pt = (first.payment_type === 'credit' ? 'credit' : 'cash') as 'cash' | 'credit'
    setEditPaymentType(pt)
    setEditDueDate(first.due_date ?? '')
    setEditIsPaid(!!first.is_paid)
    setEditPaidDate(first.paid_date ?? '')
    setDateErrors({ order: false, receive: false, due: false, paid: false })
    setShowEditModal(true)
  }

  // From the receipt dialog — items are already loaded.
  const openEditBill = () => {
    if (!selectedInvoice || receiptItems.length === 0) return
    populateEditFromHeader(receiptItems[0], selectedInvoice)
  }

  // Open the cancel-bill confirm modal for a given invoice (row menu or dialog).
  const openCancelForInvoice = (invoice_no: string) => {
    setActionInvoice(invoice_no)
    setCancelBlockers([])
    setShowCancelModal(true)
  }

  const handleSaveEdit = async () => {
    if (!actionInvoice) return
    if (!editSupplierId) { toast('กรุณาเลือกผู้จัดจำหน่าย', 'error'); return }
    if (!editSupplierInvoiceNo.trim()) { toast('กรุณาระบุเลขที่ใบกำกับสินค้า', 'error'); return }
    // เก็บทุกช่องวันที่ที่ขาดพร้อมกัน → ติดกรอบแดงทุกช่อง (prop `error`) + toast ระบุชื่อ
    // ช่องชัด ๆ (กรณีลืมกรอก ช่องว่างไม่มีกรอบแดงในตัว จึงต้องสั่งจาก parent). วันที่ชำระ
    // required เฉพาะติ๊ก "ชำระแล้ว"; วันครบกำหนด required เฉพาะจ่ายเครดิต.
    const errs = {
      order: !editOrderDate,
      receive: !editReceiveDate,
      due: editPaymentType === 'credit' && !editDueDate,
      paid: editIsPaid && !editPaidDate,
    }
    setDateErrors(errs)
    const missing: string[] = []
    if (errs.order) missing.push('วันที่สั่งซื้อตามบิล')
    if (errs.receive) missing.push('วันที่รับสินค้า')
    if (errs.due) missing.push('วันครบกำหนด')
    if (errs.paid) missing.push('วันที่ชำระ')
    if (missing.length > 0) { toast(`กรุณาระบุ${missing.join(' · ')}ให้ถูกต้อง`, 'error'); return }
    setEditSaving(true)
    try {
      const res = await window.api.purchase.updateHeader({
        invoice_no: actionInvoice,
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

  // Mark a credit bill paid today. Core takes a loaded header; the two entry
  // points feed it from the dialog (items already loaded) or a row (fetch first).
  const quickPayFromHeader = async (first: ReceiptDetail, invoice_no: string) => {
    setQuickPaying(true)
    try {
      const res = await window.api.purchase.updateHeader({
        invoice_no,
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

  // From a row's จัดการ menu — fetch the header first.
  const quickPayForInvoice = async (invoice_no: string) => {
    try {
      const items = await window.api.purchase.getReceipt(invoice_no) as ReceiptDetail[]
      if (!items || items.length === 0) { toast('ไม่พบบิล', 'error'); return }
      await quickPayFromHeader(items[0], invoice_no)
    } catch (e: any) {
      toast(e?.message ? `เปิดบิลไม่สำเร็จ: ${e.message}` : 'เปิดบิลไม่สำเร็จ', 'error')
    }
  }

  const handleCancelBill = async (reasonArg?: string) => {
    if (!actionInvoice) return
    const invoiceNo = actionInvoice
    const reason = (reasonArg ?? '').trim()
    if (!reason) { toast('กรุณาระบุเหตุผล', 'error'); return }
    setCancelling(true)
    let res: any
    const mode = overrideCancel.run(
      async (ov) => {
        res = await window.api.purchase.cancel({ invoice_no: invoiceNo, reason, userId: getCurrentUserId() }, ov)
      },
      {
        permKey: 'purchase.cancel',
        title: 'ยกเลิกการรับสินค้า',
        onDone: async () => {
          setCancelling(false)
          if (res?.success) {
            toast('ยกเลิกบิลสำเร็จ', 'success')
            setShowCancelModal(false)
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
        },
        onError: (e: any) => {
          setCancelling(false)
          toast(e?.message ? `ยกเลิกไม่สำเร็จ: ${e.message}` : 'ยกเลิกไม่สำเร็จ', 'error')
        },
      },
    )
    if (mode !== 'inline') setCancelling(false)
  }

  const histSupplier = suppliers.find(s => s.id === histSupplierId) ?? null
  const editSupplier = suppliers.find(s => s.id === editSupplierId) ?? null
  const histTotalPages = histPageSize === 'all' ? 1 : Math.ceil(histTotal / histPageSize)
  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      {/* Admin: natural-height stack (finance card above history table) — the
          page scroll lives in the parent Manage layout so the summary cards scroll
          too. Staff keeps the original single full-height card. */}
      <div className={isAdmin ? 'flex flex-col gap-3' : 'flex flex-1 flex-col min-h-0'}>

        {/* ── Finance overview — admin only, always shown (no toggle) ── */}
        {isAdmin && (
          <div className="shrink-0 flex flex-col gap-3">
            {finLoading ? (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">กำลังโหลด...</div>
            ) : finance == null ? null : (() => {
              const total = finance.purchase_total
              const cash = finance.purchase_cash
              const credit = finance.purchase_credit
              const bills = finance.purchase_count
              const fmt = (v: number) => formatCurrency(v)
              // Guard divide-by-zero (no purchases → 0, not NaN).
              const perBill = (v: number) => (bills > 0 ? v / bills : 0)
              const prev = finance.previous
              // Purchase totals are money-OUT → cost-style: a rise reads red (invert).
              const dTotal  = delta(total,  prev?.purchase_total,  { invert: true })
              const dCash   = delta(cash,   prev?.purchase_cash,   { invert: true })
              const dCredit = delta(credit, prev?.purchase_credit, { invert: true })
              const cmp = compareLabelForMode(histDateMode)
              // unpaid ⊂ credit → split credit into จ่ายแล้ว (credit−unpaid) + ค้างชำระ
              // so the 4 segments are disjoint and sum to all bills (no double-count).
              const creditPaid = Math.max(0, histSummary.credit_count - histSummary.unpaid_count)
              const statusTiles = [
                { value: 'cash',        label: 'เงินสด',   count: histSummary.cash_count },
                { value: 'credit_paid', label: 'เครดิต',   count: creditPaid },
                { value: 'unpaid',      label: 'ค้างชำระ', count: histSummary.unpaid_count },
                { value: 'cancelled',   label: 'ยกเลิก',   count: histSummary.cancelled_count },
              ]
              return (
                <>
                  {/* 4 headline cards — value + a colored trend vs the previous window. */}
                  <MetricStrip
                    className="h-[9.1rem]"
                    items={[
                      { label: 'ยอดซื้อรวม', value: fmt(total),  icon: Coins,        tint: 'primary',   compare: cmp, ...trendOf(dTotal) },
                      { label: 'เงินสด',     value: fmt(cash),   icon: Banknote,     tint: 'info-soft', compare: cmp, ...trendOf(dCash) },
                      { label: 'เครดิต',     value: fmt(credit), icon: CreditCard,   tint: 'amber',     compare: cmp, ...trendOf(dCredit) },
                      { label: 'ค้างชำระ',   value: fmt(finance.payable_total), icon: AlertTriangle, tint: 'violet', note: `${finance.payable_count.toLocaleString()} บิล` },
                    ]}
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <SectionCard
                      icon={LineChart} title="แนวโน้มการซื้อ" tint="neutral"
                      className="lg:col-span-2"
                      fill
                      right={
                        <Tabs value={chartMetric} onValueChange={(v) => setChartMetric(v as PurchaseChartMetric)}>
                          <TabsList variant="segmented">
                            {(Object.keys(PURCHASE_CHART_METRICS) as PurchaseChartMetric[]).map(m => (
                              <TabsTrigger key={m} value={m} className="text-sm px-3">{PURCHASE_CHART_METRICS[m].label}</TabsTrigger>
                            ))}
                          </TabsList>
                        </Tabs>
                      }
                    >
                      <div className="h-full min-h-[180px]">
                        <TrendChart
                          data={trend} granularity={gran} height="100%" variant="bar"
                          bars={[PURCHASE_CHART_METRICS[chartMetric].bar]}
                          valueFormat={PURCHASE_CHART_METRICS[chartMetric].valueFormat}
                        />
                      </div>
                    </SectionCard>
                    {/* Right column — status breakdown above the purchase-summary card. */}
                    <div className="lg:col-span-1 flex flex-col gap-3">
                      {purchaseStatusCard({ tiles: statusTiles, total: histSummary.count, hovered: hoveredStatus, onHover: setHoveredStatus })}
                      {purchaseSummaryCard({
                        rows: [
                          { label: 'ยอดซื้อเฉลี่ย', value: `${fmt(perBill(total))}/บิล` },
                          { label: 'เงินสด',        value: fmt(cash) },
                          { label: 'เครดิต',        value: fmt(credit) },
                          { label: 'ค้างชำระ (ปัจจุบัน)', value: fmt(finance.payable_total) },
                        ],
                      })}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ── History table-card — admin: fixed height, scrolls internally;
            staff: fills the viewport (original behaviour). ── */}
        <div className={isAdmin
          ? 'shrink-0 bg-card rounded-card shadow-card border border-border overflow-hidden flex flex-col'
          : 'flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden'}>

        {/* Filter strip — title cluster left, search/filters right */}
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={FileText} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">ประวัติการซื้อ</h3>
            <Badge variant="neutral-outline">{histTotal.toLocaleString()}</Badge>
          </div>

          <SearchInput
            variant="elevated"
            wrapperClassName="w-60 shrink-0 ml-auto"
            className="h-9"
            value={histQ}
            onChange={e => setHistQ(e.target.value)}
            placeholder="ค้นหาเลขที่ใบรับ..."
          />
          <div className="w-60 shrink-0">
            <Combobox
              variant="elevated"
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
          {/* Status filter popover — was previously the clickable summary cards */}
          {(() => {
            const STATUS_OPTIONS: { value: typeof histPaymentFilter; label: string }[] = [
              { value: 'all',       label: 'ทั้งหมด' },
              { value: 'cash',      label: 'เงินสด' },
              { value: 'credit',    label: 'เครดิต' },
              { value: 'unpaid',    label: 'ค้างชำระ' },
              { value: 'cancelled', label: 'ยกเลิก' },
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
                      onClick={() => { setHistPaymentFilter(o.value); loadHistory(1, o.value, undefined, true) }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        histPaymentFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', histPaymentFilter === o.value ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 text-left">{o.label}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          })()}

          {/* VAT filter — its own icon button beside the status filter
              (approach A). Hidden until the shop is VAT-registered. Reload is
              driven by the histVatFilter effect, so onClick only sets state. */}
          {vatEnabled && (() => {
            const VAT_OPTIONS: { value: 'all' | 'vat' | 'novat'; label: string }[] = [
              { value: 'all',   label: 'ทั้งหมด' },
              { value: 'vat',   label: 'มี VAT' },
              { value: 'novat', label: 'ไม่มี VAT' },
            ]
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" variant="elevated" className="h-9 w-9 p-0 shrink-0" title="ตัวกรอง VAT">
                    <Percent className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1 gap-0">
                  <PopoverHeader className="px-2">
                    <PopoverTitle>VAT</PopoverTitle>
                  </PopoverHeader>
                  {VAT_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setHistVatFilter(o.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                        histVatFilter === o.value ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Check className={cn('size-4', histVatFilter === o.value ? 'opacity-100' : 'opacity-0')} />
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
                <span className="text-sm">วันที่</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColSupplier} onCheckedChange={v => setPrefs({ showColSupplier: v === true })} />
                <span className="text-sm">ผู้จัดจำหน่าย</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColItems} onCheckedChange={v => setPrefs({ showColItems: v === true })} />
                <span className="text-sm">รายการ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColTotal} onCheckedChange={v => setPrefs({ showColTotal: v === true })} />
                <span className="text-sm">ยอดรวม</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={showColStatus} onCheckedChange={v => setPrefs({ showColStatus: v === true })} />
                <span className="text-sm">สถานะ</span>
              </label>
            </PopoverContent>
          </Popover>
        </div>

        {/* Table */}
        <div className={isAdmin
          ? 'h-[34rem] [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card'
          : 'flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card'}>
          <Table>
            <TableHeader>
              <TableRow>
                {showColDate && <SortableTableHead field="created_at" sort={histSort} onToggle={toggleHistSort} className="min-w-24">วันที่</SortableTableHead>}
                <SortableTableHead field="invoice_no" sort={histSort} onToggle={toggleHistSort} className="min-w-32">เลขที่ใบรับ</SortableTableHead>
                {showColSupplier && <TableHead className="min-w-48">ผู้จัดจำหน่าย</TableHead>}
                {showColTotal && <SortableTableHead field="total_cost" align="right" sort={histSort} onToggle={toggleHistSort} className="min-w-20">ยอดรวม</SortableTableHead>}
                {showColStatus && <TableHead className="min-w-28 text-center">สถานะ</TableHead>}
                <TableHead className="min-w-16 text-center">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHist ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColDate ? 1 : 0) + (showColSupplier ? 1 : 0) + (showColTotal ? 1 : 0) + (showColStatus ? 1 : 0)} className="text-center text-foreground-subtle py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + (showColDate ? 1 : 0) + (showColSupplier ? 1 : 0) + (showColTotal ? 1 : 0) + (showColStatus ? 1 : 0)} className="text-center text-foreground-subtle py-16">
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
                    className={cn('[&_td]:py-2.5 [&_td]:font-medium', isSelected && 'bg-primary-soft', isCancelled && 'opacity-70')}
                  >
                    {showColDate && <TableCell className="whitespace-nowrap">{formatDate(h.created_at)}</TableCell>}
                    <TableCell className="text-sm">
                      <div className={cn(isCancelled ? 'text-muted-foreground line-through' : isSelected && 'text-primary')}>
                        {h.invoice_no}
                      </div>
                      {showColItems && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {(h.item_count ?? 0).toLocaleString()} รายการ
                        </div>
                      )}
                    </TableCell>
                    {showColSupplier && <TableCell className="truncate">{h.supplier_name ?? '—'}</TableCell>}
                    {showColTotal && (
                      <TableCell className={cn('text-right', isCancelled && 'text-foreground-subtle line-through')}>
                        {formatCurrency(h.total_cost)}
                      </TableCell>
                    )}
                    {showColStatus && (
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isCancelled
                            ? <Badge variant="destructive-outline">ยกเลิก</Badge>
                            : h.payment_type === 'credit'
                              ? h.is_paid
                                ? <Badge variant="success-outline">ชำระแล้ว</Badge>
                                : isOverdue
                                  ? <Badge variant="violet-outline">เกินกำหนด</Badge>
                                  : <Badge variant="amber-outline">เครดิต</Badge>
                              : <Badge variant="info-outline">เงินสด</Badge>
                          }
                          {vatEnabled && h.vat_mode === 'inclusive' && <Badge variant="info-outline">VAT</Badge>}
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex justify-center">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="icon-lg" variant="elevated" title="ตัวเลือก">
                              <MoreHorizontal />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" sideOffset={4} className="w-44 p-1 gap-0">
                            <button type="button" onClick={() => openReceipt(h.invoice_no)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                              <Eye className="size-4" /> ดูรายละเอียด
                            </button>
                            {!isCancelled && h.payment_type === 'credit' && !h.is_paid && (
                              <button type="button" onClick={() => setConfirmPayInvoice(h.invoice_no)} disabled={quickPaying}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-success hover:bg-success/10 transition-colors disabled:opacity-50">
                                <Check className="size-4" /> ชำระวันนี้
                              </button>
                            )}
                            {!isCancelled && (
                              <button type="button" onClick={() => openCancelForInvoice(h.invoice_no)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                <Ban className="size-4" /> ยกเลิกบิล
                              </button>
                            )}
                          </PopoverContent>
                        </Popover>
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
          {(() => {
            const size = histPageSize === 'all' ? histTotal : histPageSize
            const start = histTotal === 0 ? 0 : (histPage - 1) * size + 1
            const end = Math.min(histPage * size, histTotal)
            return (
              <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span>จำนวนแถว</span>
                <Select value={String(histPageSize)} onValueChange={v => setHistPageSize(Number(v))}>
                  <SelectTrigger variant="elevated" className="h-9 min-w-20">
                    <SelectValue>{String(histPageSize)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-28">
                    {[50, 100, 250, 500].map(opt => (
                      <SelectItem key={opt} value={String(opt)}>{String(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  {loadingHist
                    ? 'กำลังโหลด...'
                    : <>แสดง <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span></>}
                </span>
              </div>
            )
          })()}
          <Pagination page={histPage} totalPages={histTotalPages} onPageChange={p => loadHistory(p)} className="w-auto" />
        </div>
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
            footerLeft={!receiptCancelled && (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="xl"
                  onClick={() => selectedInvoice && openCancelForInvoice(selectedInvoice)}
                >
                  <X className="size-4" />
                  ยกเลิกบิล
                </Button>
                <Button variant="elevated" size="xl" onClick={openEditBill}>แก้ไขบิล</Button>
              </div>
            )}
            actions={
              canQuickPay && (
                <Button variant="success" size="xl" onClick={() => selectedInvoice && setConfirmPayInvoice(selectedInvoice)} disabled={quickPaying}>
                  <Check className="size-4" />
                  {quickPaying ? 'กำลังบันทึก...' : 'ชำระวันนี้'}
                </Button>
              )
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
        <DialogContent size="xl" divided>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <FileText className="size-5 text-muted-foreground" />
              <span>แก้ไขรายละเอียดบิล</span>
              <span className="text-sm text-muted-foreground font-normal">{actionInvoice}</span>
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
                  variant="elevated"
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
                  variant="elevated"
                  value={editSupplierInvoiceNo}
                  onChange={e => setEditSupplierInvoiceNo(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">วันที่สั่งซื้อตามบิล</label>
                <DateInput variant="elevated" value={editOrderDate} onChange={v => { setEditOrderDate(v); setDateErrors(e => ({ ...e, order: false })) }} error={dateErrors.order} className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  วันที่รับสินค้า <span className="text-destructive">*</span>
                </label>
                <DateInput variant="elevated" value={editReceiveDate} onChange={v => { setEditReceiveDate(v); setDateErrors(e => ({ ...e, receive: false })) }} error={dateErrors.receive} className="w-full" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">การชำระเงิน</label>
              {/* Sliding pill toggle — same `layoutId` on both motion.spans
                  makes framer-motion animate the active background between
                  them. Pattern ported from the Purchase (รับสินค้า) page. */}
              <div className="flex h-10 items-stretch gap-0.5 rounded-lg bg-muted/40">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditPaymentType('cash')}
                  className={cn(
                    'relative flex flex-1 h-full px-0 rounded-lg text-sm font-semibold justify-center gap-1.5 hover:bg-transparent',
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
                    'relative flex flex-1 h-full px-0 rounded-lg text-sm font-semibold justify-center gap-1.5 hover:bg-transparent',
                    editPaymentType === 'credit'
                      ? 'text-accent-foreground hover:text-accent-foreground'
                      : 'text-foreground-subtle hover:text-foreground',
                  )}
                >
                  {editPaymentType === 'credit' && (
                    <motion.span
                      layoutId="edit-payment-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-lg bg-accent"
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
              'rounded-card border border-border bg-muted/50 p-4 space-y-3 transition-opacity',
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
                  <DateInput variant="elevated" value={editDueDate} onChange={v => { setEditDueDate(v); setDateErrors(e => ({ ...e, due: false })) }} error={dateErrors.due} className="w-full" />
                  <div className="flex gap-1">
                    {[15, 30, 60, 90].map(d => (
                      <Button
                        key={d}
                        type="button"
                        variant="amber-soft"
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
                    <DateInput variant="elevated" value={editPaidDate} onChange={v => { setEditPaidDate(v); setDateErrors(e => ({ ...e, paid: false })) }} error={dateErrors.paid} className="w-full" />
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={editPaidDate === today ? 'default' : 'primary-soft'}
                        onClick={() => setEditPaidDate(today)}
                        className="flex-1 h-8 text-sm font-semibold"
                      >
                        วันนี้
                      </Button>
                      <Button
                        type="button"
                        variant={editDueDate && editPaidDate === editDueDate ? 'default' : 'primary-soft'}
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
            <Button variant="elevated" size="xl" onClick={() => setShowEditModal(false)} disabled={editSaving}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel-bill confirm dialog (shared centered ConfirmDialog) ── */}
      <ConfirmDialog
        open={showCancelModal}
        onOpenChange={(o) => { if (!cancelling) setShowCancelModal(o) }}
        variant="destructive"
        title="ยกเลิกบิลรับสินค้า"
        description={actionInvoice ?? undefined}
        confirmLabel={cancelling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
        cancelLabel="ยกเลิก"
        busy={cancelling}
        requireReason
        reasonLabel="เหตุผล"
        reasonPlaceholder="ระบุเหตุผลในการยกเลิก..."
        onConfirm={handleCancelBill}
        content={
          <div className="space-y-4">
            <div className="rounded-xl bg-destructive-soft/40 p-3 text-sm text-destructive leading-relaxed">
              การยกเลิกจะคืนสต็อกที่รับเข้ามาของบิลนี้ออกจากคลัง และไม่สามารถย้อนกลับได้ หากสินค้าบางส่วนถูกขายไปแล้ว ระบบจะไม่อนุญาตให้ยกเลิก
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
          </div>
        }
      />

      {/* ── ชำระวันนี้ confirm (success) — shared by row menu + receipt footer ── */}
      <ConfirmDialog
        open={!!confirmPayInvoice}
        onOpenChange={(o) => { if (!o && !quickPaying) setConfirmPayInvoice(null) }}
        variant="success"
        title="ชำระเงินวันนี้"
        description="ต้องการบันทึกการชำระเงินบิลนี้เป็นวันนี้ใช่หรือไม่?"
        confirmLabel={quickPaying ? 'กำลังบันทึก...' : 'ยืนยัน'}
        cancelLabel="ยกเลิก"
        busy={quickPaying}
        content={confirmPayInvoice && (
          <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground shrink-0">เลขที่บิล</span>
              <span className="font-semibold text-right">{confirmPayInvoice}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground shrink-0">วันที่ชำระ</span>
              <span className="font-semibold text-right">{formatDate(today)}</span>
            </div>
          </div>
        )}
        onConfirm={async () => {
          if (!confirmPayInvoice) return
          await quickPayForInvoice(confirmPayInvoice)
          setConfirmPayInvoice(null)
        }}
      />
      {overrideCancel.dialog}
    </>
  )
}

// "สรุปการซื้อ" card — a flat key–value list (description left, figure right). Fed
// pre-formatted rows so the helper stays presentational. Lowercase render helper
// called inline (not a component — same sanctioned pattern as Sales' summaryCard).
function purchaseSummaryCard(opts: {
  // A row is either a single value (spans the two value columns) or a pair of
  // cells split across the 2nd/3rd columns. Purchases only passes single-value
  // rows; the cells branch is kept for parity with Sales (dead here, harmless).
  rows: { label: string; value?: string; cells?: [string, string] }[]
  className?: string
}) {
  const { rows, className } = opts
  return (
    <SectionCard icon={ListChecks} title="สรุปการซื้อ" tint="neutral" className={cn('shrink-0', className)}>
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-2 text-sm">
        {rows.map((r, i) => (
          <React.Fragment key={i}>
            <span className="text-muted-foreground min-w-0 truncate">{r.label}</span>
            {r.cells ? (
              <>
                <span className="text-right font-semibold text-foreground">{r.cells[0]}</span>
                <span className="text-right font-semibold text-foreground">{r.cells[1]}</span>
              </>
            ) : (
              <span className="col-span-2 text-right font-semibold text-foreground">{r.value}</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </SectionCard>
  )
}

// "สถานะการซื้อ" card — a compact payment-status breakdown (read-only, no filtering):
// icon + title over the bill count, one proportion bar, then a color legend. Status
// FILTERING lives in the toolbar popover, so this card stays purely informational.
// Tile type is the REDUCED shape ({value,label,count}) — colors come from
// PURCHASE_STATUS_COLOR, not a per-tile field.
interface PurchaseStatusTile { value: string; label: string; count: number }
function purchaseStatusCard(opts: {
  tiles: readonly PurchaseStatusTile[]
  total: number
  hovered: string | null
  onHover: (v: string | null) => void
  className?: string
}) {
  const { tiles, total, hovered, onHover, className } = opts
  // Percentage base = sum of the (disjoint) segments, INDEPENDENT of the header
  // total (which counts all invoices). || 1 guards divide-by-zero.
  const sum = tiles.reduce((s, t) => s + t.count, 0) || 1
  // Bar segments = only non-zero statuses (so gaps don't double up on empties).
  const segs = tiles.filter(t => t.count > 0)
  // Shared highlight: hovering any status fades the rest in BOTH bar and legend.
  const dim = (v: string) => (hovered != null && hovered !== v ? 'opacity-40' : 'opacity-100')
  const tip = (t: PurchaseStatusTile) => (
    <>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: PURCHASE_STATUS_COLOR[t.value] }} />
        <span className="font-semibold text-popover-foreground">{t.label}</span>
        <span className="text-muted-foreground">{((t.count / sum) * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{t.count.toLocaleString()} บิล</div>
    </>
  )
  return (
    <SectionCard className={cn('shrink-0', className)}>
      {/* Header — plain (neutral) icon box + title over a muted bill-count line */}
      <div className="flex items-center gap-3">
        <TintIcon icon={FileText} tint="neutral" size="sm" />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground leading-snug">สถานะการซื้อ</h3>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} บิล</p>
        </div>
      </div>

      {/* Bar + legend share one TooltipProvider and one `hovered` state. */}
      <TooltipProvider>
        {/* Proportion bar — only the two outer ends are rounded; inner edges square. */}
        <div className="flex h-3 gap-1">
          {segs.map((t, i) => {
            const ends = i === 0 && i === segs.length - 1 ? 'rounded-full'
              : i === 0 ? 'rounded-l-full'
              : i === segs.length - 1 ? 'rounded-r-full'
              : ''
            return (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onMouseEnter={() => onHover(t.value)}
                  onMouseLeave={() => onHover(null)}
                  className={cn('h-full cursor-default border-0 p-0 transition-opacity', ends, dim(t.value))}
                  style={{ width: `${(t.count / sum) * 100}%`, minWidth: 6, backgroundColor: PURCHASE_STATUS_COLOR[t.value] }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {tip(t)}
              </TooltipContent>
            </Tooltip>
            )
          })}
        </div>

        {/* Legend — color dot + label; hover highlights this status in both. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {tiles.map(t => (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onMouseEnter={() => onHover(t.value)}
                  onMouseLeave={() => onHover(null)}
                  className={cn('flex cursor-default items-center gap-1.5 text-sm transition-opacity', dim(t.value))}
                >
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: PURCHASE_STATUS_COLOR[t.value] }} />
                  <span className="text-muted-foreground">{t.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {tip(t)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </SectionCard>
  )
}
