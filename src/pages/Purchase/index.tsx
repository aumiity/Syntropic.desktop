import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, StatCard } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateInput } from '@/components/ui/date-input'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import { cn, formatCurrency, formatDate, formatExpiry, getExpiryStatus } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Supplier, ProductLot } from '@/types'
import {
  Search, Plus, Trash2, Package, ChevronDown, X,
  Building2, Banknote, CreditCard, FileText, ClipboardPaste, AlertTriangle,
  PackagePlus, History,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProductUnitOption {
  id: number
  unit_name: string
  qty_per_base: number
  price_retail?: number
}

interface ReceiptRow {
  product_id: number
  trade_name: string
  product_code: string
  unit_name: string
  units: ProductUnitOption[]
  default_sell_price: number
  stored_cost_price?: number
  lot_number: string
  manufactured_date: string
  expiry_date: string
  qty: string
  cost_price: string
  discount: string
  total: string
  note: string
}

const emptyRow = (): ReceiptRow => ({
  product_id: 0, trade_name: '', product_code: '',
  unit_name: '', units: [], default_sell_price: 0,
  lot_number: '', manufactured_date: '', expiry_date: '',
  qty: '', cost_price: '', discount: '', total: '', note: '',
})

const stripTrailingZeros = (s: string) => s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s

// Format a raw numeric string with commas. `forceTwoDecimals` pads to "x.xx" — use for money fields.
// Returns '' for empty/non-numeric input so blank cells stay blank.
const formatNum = (raw: string, forceTwoDecimals = false): string => {
  if (raw === '' || raw == null) return ''
  const n = parseFloat(raw)
  if (!isFinite(n)) return raw
  return forceTwoDecimals
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

// Strip commas so parseFloat/state stays clean ("1,234.56" → "1234.56")
const stripCommas = (v: string) => v.replace(/,/g, '')

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

interface ProductSuggestion {
  id: number
  trade_name: string
  code?: string
  unit_name?: string
  price_retail?: number
  cost_price?: number
  units?: ProductUnitOption[]
}


// ── Import column options ──────────────────────────────────────────────────

const IMPORT_FIELD_OPTIONS = [
  { value: 'key',   label: 'Barcode / ชื่อ' },
  { value: 'qty',   label: 'จำนวน' },
  { value: 'lot',   label: 'Lot No.' },
  { value: 'mfg',   label: 'วันผลิต' },
  { value: 'exp',   label: 'วันหมดอายุ' },
  { value: 'total', label: 'ราคารวม' },
  { value: 'cost',  label: 'ราคาทุน/หน่วย' },
  { value: 'skip',  label: '— ข้าม —' },
] as const

// ── Main component ─────────────────────────────────────────────────────────

export default function PurchasePage() {
  const { toast } = useToast()
  const today = new Date().toISOString().slice(0, 10)

  // Form
  const [invoiceNo, setInvoiceNo] = useState('')
  const [supplierId, setSupplierId] = useState<number>(0)
  const [supplierName, setSupplierName] = useState('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [orderDate, setOrderDate] = useState(today)
  const [receiveDate, setReceiveDate] = useState(today)
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash')
  const [dueDate, setDueDate] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [paidDate, setPaidDate] = useState('')
  const [grNote, setGrNote] = useState('')
  const [rows, setRows] = useState<ReceiptRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [savedInvoice, setSavedInvoice] = useState('')

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  // 'receive' → sets supplierId/supplierName on the GR form; 'filter' → sets histSupplierId on the history filter
  const [supplierPickTarget, setSupplierPickTarget] = useState<'receive' | 'filter'>('receive')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [supplierHighlight, setSupplierHighlight] = useState(0)

  // Product search per row
  const [searchQueries, setSearchQueries] = useState<string[]>([''])
  const [suggestions, setSuggestions] = useState<ProductSuggestion[][]>([[]])
  const [activeSuggRow, setActiveSuggRow] = useState<number | null>(null)
  const [suggHighlight, setSuggHighlight] = useState(0)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const searchTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null])

  // History
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [histTotal, setHistTotal] = useState(0)
  const [histPage, setHistPage] = useState(1)
  const [histQ, setHistQ] = useState('')
  const [histSupplierId, setHistSupplierId] = useState<number>(0)
  const [histDateFrom, setHistDateFrom] = useState('')
  const [histDateTo, setHistDateTo] = useState('')
  const [histPaymentFilter, setHistPaymentFilter] = useState<'all' | 'cash' | 'credit' | 'cancelled'>('all')
  const [histSummary, setHistSummary] = useState({ count: 0, total_cost: 0, unpaid_cost: 0 })
  const [loadingHist, setLoadingHist] = useState(false)

  // Cancel-bill modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelBlockers, setCancelBlockers] = useState<Array<{ trade_name: string; product_code: string; lot_number: string; need: number; have: number }>>([])

  // Edit-bill (header-only) modal
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

  // Active tab
  const [activeTab, setActiveTab] = useState<'receive' | 'history'>('receive')

  // Optional column toggles (default off — keeps default row compact)
  const [showMfg, setShowMfg] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)

  // Tracks which numeric cell is focused — focused cell shows raw "1234.56", others show "1,234.56"
  const [focusedCell, setFocusedCell] = useState<string | null>(null)

  // Receipt detail panel (replaces modal)
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [receiptItems, setReceiptItems] = useState<ReceiptDetail[]>([])
  const [receiptInvoice, setReceiptInvoice] = useState('')

  // Unit swap modal (per row)
  const [unitModalIdx, setUnitModalIdx] = useState<number | null>(null)

  // Sell-price quick-edit modal (per row)
  const [priceModalIdx, setPriceModalIdx] = useState<number | null>(null)
  const [priceDraft, setPriceDraft] = useState('')
  const [priceNote, setPriceNote] = useState('')
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceHistory, setPriceHistory] = useState<Array<{ id: number; price_type: string; old_price: number; new_price: number; note?: string; created_at: string }>>([])
  const [prevCost, setPrevCost] = useState<number | null>(null)

  // Bulk import modal
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importColumns, setImportColumns] = useState<string[]>(['key', 'qty', 'lot', 'mfg', 'exp', 'total'])

  // Bill adjustment modal
  const [showBillAdjust, setShowBillAdjust] = useState(false)
  const [billAdjustTab, setBillAdjustTab] = useState<'discount' | 'surcharge'>('discount')
  // Draft inputs — separate baht + percent boxes per tab
  const [billDiscountBaht, setBillDiscountBaht] = useState('')
  const [billDiscountPct, setBillDiscountPct]   = useState('')
  const [billSurchargeBaht, setBillSurchargeBaht] = useState('')
  const [billSurchargePct, setBillSurchargePct]   = useState('')
  // Pre-adjustment sum shown in the modal preview
  const [adjustModalSum, setAdjustModalSum] = useState(0)
  // Controlled value for the editable ยอดสุทธิ input in the modal
  const [billNetInput, setBillNetInput] = useState('')
  // Which adjust-modal input is focused — shows raw value while editing, comma-formatted when blurred
  const [adjFocus, setAdjFocus] = useState<'baht' | 'pct' | 'net' | null>(null)
  // Last committed values — restored into drafts on next open
  const [appliedDiscount, setAppliedDiscount] = useState({ baht: '', pct: '' })
  const [appliedSurcharge, setAppliedSurcharge] = useState({ baht: '', pct: '' })
  const [adjustSubtotal, setAdjustSubtotal] = useState<number | null>(null)
  const [adjustDiscountAmt, setAdjustDiscountAmt] = useState(0)
  const [adjustSurchargeAmt, setAdjustSurchargeAmt] = useState(0)
  // Original per-row totals before any bill adjustment — re-applying always starts from here
  const [baseRowTotals, setBaseRowTotals] = useState<number[] | null>(null)

  useEffect(() => {
    loadNextGR()
    loadSuppliers()
    loadHistory()
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

  const loadNextGR = async () => {
    const no = await window.api.purchase.nextGRNumber()
    setInvoiceNo(no as string)
  }

  const loadSuppliers = async () => {
    const data = await window.api.people.allSuppliers()
    setSuppliers(data as Supplier[])
  }

  const loadHistory = useCallback(async (
    page = 1,
    filterOverride?: 'all' | 'cash' | 'credit' | 'cancelled',
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
        payment_type: (filter === 'cash' || filter === 'credit') ? filter : undefined,
        status: filter === 'cancelled' ? 'cancelled' : 'all',
        page,
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
  }, [histQ, histSupplierId, histDateFrom, histDateTo, histPaymentFilter, selectedInvoice])

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

  // ── Row management ────────────────────────────────────────────────────────

  const addRow = useCallback(() => {
    setBaseRowTotals(null)
    setRows(r => [...r, emptyRow()])
    setSearchQueries(q => [...q, ''])
    setSuggestions(s => [...s, []])
    searchTimers.current.push(null)
  }, [])

  const removeRow = (i: number) => {
    if (rows.length === 1) return
    setBaseRowTotals(null)
    setRows(r => r.filter((_, idx) => idx !== i))
    setSearchQueries(q => q.filter((_, idx) => idx !== i))
    setSuggestions(s => s.filter((_, idx) => idx !== i))
    searchTimers.current = searchTimers.current.filter((_, idx) => idx !== i)
  }

  const updateRow = (i: number, field: keyof ReceiptRow, value: string | number) => {
    if ((field === 'total' || field === 'cost_price' || field === 'qty') && baseRowTotals) setBaseRowTotals(null)
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  // total = qty * cost_price − discount. Editing any field auto-fills dependents.
  const updateLineMath = (i: number, field: 'qty' | 'cost_price' | 'discount' | 'total', value: string) => {
    if (baseRowTotals) setBaseRowTotals(null)
    setRows(rs => rs.map((row, idx) => {
      if (idx !== i) return row
      const next: ReceiptRow = { ...row, [field]: value }
      const qty  = parseFloat(next.qty)
      const cost = parseFloat(next.cost_price)
      const disc = parseFloat(next.discount) || 0
      const total = parseFloat(next.total)
      if ((field === 'cost_price' || field === 'discount') && qty > 0 && isFinite(cost)) {
        next.total = Math.max(qty * cost - disc, 0).toFixed(2)
      } else if (field === 'total' && qty > 0 && isFinite(total)) {
        next.cost_price = stripTrailingZeros(((total + disc) / qty).toFixed(4))
      } else if (field === 'qty' && qty > 0) {
        if (isFinite(cost)) next.total = Math.max(qty * cost - disc, 0).toFixed(2)
        else if (isFinite(total)) next.cost_price = stripTrailingZeros(((total + disc) / qty).toFixed(4))
      }
      return next
    }))
  }

  // ── Keyboard nav helpers ──────────────────────────────────────────────────

  const focusCell = (row: number, col: number) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`)
      if (el) { el.focus(); el.select?.() }
    }, 30)
  }

  // ── Product search ────────────────────────────────────────────────────────

  const handleProductSearch = (i: number, q: string) => {
    setSearchQueries(prev => prev.map((v, idx) => idx === i ? q : v))
    setActiveSuggRow(i)
    setSuggHighlight(0)
    if (searchTimers.current[i]) clearTimeout(searchTimers.current[i]!)
    if (!q.trim()) {
      setSuggestions(s => s.map((v, idx) => idx === i ? [] : v))
      return
    }
    searchTimers.current[i] = setTimeout(async () => {
      try {
        const data = await window.api.pos.searchProducts(q) as any[]
        setSuggestions(s => s.map((v, idx) => idx === i ? data.slice(0, 8) : v))
      } catch {}
    }, 180)
  }

  const selectProduct = (i: number, p: ProductSuggestion) => {
    const baseName = p.unit_name || 'ชิ้น'
    const incoming = p.units ?? []
    const baseUnit: ProductUnitOption = {
      id: -1,
      unit_name: baseName,
      qty_per_base: 1,
      price_retail: p.price_retail ?? 0,
    }
    const allUnits: ProductUnitOption[] = [
      baseUnit,
      ...incoming.filter(u => u.unit_name !== baseName),
    ]
    setRows(r => r.map((row, idx) => idx === i ? {
      ...row,
      product_id: p.id,
      trade_name: p.trade_name,
      product_code: p.code ?? '',
      unit_name: baseName,
      units: allUnits,
      default_sell_price: p.price_retail ?? 0,
      stored_cost_price: p.cost_price,
    } : row))
    setSearchQueries(q => q.map((v, idx) => idx === i ? p.trade_name : v))
    setSuggestions(s => s.map((v, idx) => idx === i ? [] : v))
    setActiveSuggRow(null)
    focusCell(i, 2) // → Lot column (next in row order)
  }

  const buildRowFromProduct = (p: ProductSuggestion, fields: Partial<ReceiptRow>): ReceiptRow => {
    const baseName = p.unit_name || 'ชิ้น'
    const incoming = p.units ?? []
    const baseUnit: ProductUnitOption = {
      id: -1, unit_name: baseName, qty_per_base: 1,
      price_retail: p.price_retail ?? 0,
    }
    const allUnits: ProductUnitOption[] = [
      baseUnit,
      ...incoming.filter(u => u.unit_name !== baseName),
    ]
    return {
      ...emptyRow(),
      product_id: p.id,
      trade_name: p.trade_name,
      product_code: p.code ?? '',
      unit_name: baseName,
      units: allUnits,
      default_sell_price: p.price_retail ?? 0,
      stored_cost_price: p.cost_price,
      ...fields,
    }
  }

  const parseDdMmYyyy = (s: string): string => {
    const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (!m) return ''
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const lines = importText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length === 0) { toast('กรุณาวางข้อมูล', 'error'); return }

      const colIdx: Record<string, number> = {}
      importColumns.forEach((f, idx) => { if (f !== 'skip') colIdx[f] = idx })

      if (colIdx.key === undefined) {
        toast('กรุณาระบุคอลัมน์ "Barcode / ชื่อ" ก่อนนำเข้า', 'error')
        return
      }

      const dataLines = /barcode|รหัส|ชื่อ/i.test(lines[0]) ? lines.slice(1) : lines

      const newRows: ReceiptRow[] = []
      const newQueries: string[] = []
      let unmatched = 0

      for (const line of dataLines) {
        const cells = line.split('\t').map(c => c.trim())
        const pick = (f: string) => colIdx[f] !== undefined ? (cells[colIdx[f]] ?? '') : ''
        const key = pick('key')
        if (!key) continue
        const qtyClean = pick('qty').replace(/,/g, '')
        const totalClean = pick('total').replace(/,/g, '')
        const costClean = pick('cost').replace(/,/g, '')
        const qtyN = parseFloat(qtyClean)
        const totalN = parseFloat(totalClean)
        const costN = parseFloat(costClean)
        let effectiveCost: string
        if (isFinite(costN) && costN > 0) {
          effectiveCost = stripTrailingZeros(costN.toFixed(4))
        } else if (qtyN > 0 && isFinite(totalN)) {
          effectiveCost = stripTrailingZeros((totalN / qtyN).toFixed(4))
        } else {
          effectiveCost = ''
        }
        const rowFields = {
          lot_number: pick('lot'),
          manufactured_date: parseDdMmYyyy(pick('mfg')),
          expiry_date: parseDdMmYyyy(pick('exp')),
          qty: qtyClean,
          cost_price: effectiveCost,
          total: totalClean,
        }
        const matches = await window.api.pos.searchProducts(key) as ProductSuggestion[]
        const p = matches?.[0]
        if (!p) {
          // Add as an empty row with the supplier key pre-filled so user can search manually
          newRows.push({ ...emptyRow(), ...rowFields })
          newQueries.push(key)
          unmatched++
          continue
        }
        newRows.push(buildRowFromProduct(p, rowFields))
        newQueries.push(p.trade_name)
      }

      if (newRows.length === 0) {
        toast('ไม่พบข้อมูลที่นำเข้าได้', 'error')
        return
      }

      const keepIdx = rows.map((r, i) => ({ r, i })).filter(({ r }) =>
        r.product_id || r.lot_number || r.qty || r.total || r.expiry_date
      ).map(x => x.i)
      const finalRows = [...keepIdx.map(i => rows[i]), ...newRows]
      const finalQueries = [...keepIdx.map(i => searchQueries[i] ?? ''), ...newQueries]
      const finalSuggs: ProductSuggestion[][] = [...keepIdx.map(i => suggestions[i] ?? []), ...newRows.map(() => [])]
      setRows(finalRows)
      setSearchQueries(finalQueries)
      setSuggestions(finalSuggs)
      searchTimers.current = finalRows.map(() => null)

      const matched = newRows.length - unmatched
      const msg = unmatched > 0
        ? `นำเข้า ${newRows.length} รายการ (พบ ${matched} · ไม่พบ ${unmatched} — กรุณาเลือกสินค้าด้วยตนเอง)`
        : `นำเข้า ${newRows.length} รายการ`
      toast(msg, unmatched > 0 ? 'error' : 'success')
      setShowImport(false)
      setImportText('')
    } finally {
      setImporting(false)
    }
  }

  const openPriceModal = async (i: number) => {
    const row = rows[i]
    if (!row?.product_id) return
    setPriceModalIdx(i)
    setPriceDraft(String(row.default_sell_price || ''))
    setPriceNote('')
    setPriceHistory([])
    setPrevCost(null)
    try {
      const [logs, product] = await Promise.all([
        window.api.products.priceHistory(row.product_id, 10) as Promise<any[]>,
        window.api.products.get(row.product_id) as Promise<any>,
      ])
      setPriceHistory(logs ?? [])
      // "ทุนเก่า" baseline = the last cost we actually paid (last-in), so it's
      // an apples-to-apples comparison with the new lot cost being keyed.
      // No fallback to the weighted-avg cost_price: a genuine 0 (free goods
      // last time) must stay 0 — overriding it would hide that it was free.
      if (product != null) setPrevCost(Number(product.last_cost_price ?? 0))
    } catch { /* swallow — history is best-effort */ }
  }

  const closePriceModal = () => {
    setPriceModalIdx(null)
    setPriceDraft('')
    setPriceNote('')
    setPriceHistory([])
    setPrevCost(null)
  }

  const savePriceModal = async () => {
    if (priceModalIdx === null) return
    const row = rows[priceModalIdx]
    if (!row?.product_id) return
    const newPrice = parseFloat(priceDraft)
    if (!isFinite(newPrice) || newPrice < 0) { toast('ราคาไม่ถูกต้อง', 'error'); return }
    setPriceSaving(true)
    try {
      await window.api.products.updatePrice(row.product_id, {
        price_type: 'retail', new_price: newPrice, note: priceNote || undefined,
      })
      const targetId = row.product_id
      setRows(rs => rs.map(r => r.product_id === targetId ? { ...r, default_sell_price: newPrice } : r))
      toast('อัปเดตราคาขายแล้ว', 'success')
      closePriceModal()
    } catch (e: any) {
      toast(e?.message ?? 'อัปเดตราคาไม่สำเร็จ', 'error')
    } finally {
      setPriceSaving(false)
    }
  }

  const changeRowUnit = (i: number, u: ProductUnitOption) => {
    setRows(r => r.map((row, idx) => idx === i ? {
      ...row,
      unit_name: u.unit_name,
      default_sell_price: u.price_retail ?? row.default_sell_price,
    } : row))
    setUnitModalIdx(null)
  }

  const handleProductKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggs = suggestions[i] ?? []
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setSuggHighlight(h => Math.min(h + 1, suggs.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setSuggHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggs[suggHighlight]) selectProduct(i, suggs[suggHighlight])
    } else if (e.key === 'Escape') {
      setSuggestions(s => s.map((v, idx) => idx === i ? [] : v))
      setActiveSuggRow(null)
    } else if (e.key === 'Tab') {
      setSuggestions(s => s.map((v, idx) => idx === i ? [] : v))
      setActiveSuggRow(null)
    }
  }

  const handleQtyKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      if (i === rows.length - 1) {
        e.preventDefault()
        addRow()
        focusCell(i + 1, 0)
      }
    }
  }

  // ── Supplier modal ────────────────────────────────────────────────────────

  const filteredSuppliers = supplierQuery.trim()
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(supplierQuery.toLowerCase()) ||
        s.code?.toLowerCase().includes(supplierQuery.toLowerCase()))
    : suppliers

  const closeSupplierModal = () => { setShowSupplierModal(false); setSupplierQuery('') }

  const selectSupplier = (s: Supplier) => {
    if (supplierPickTarget === 'filter') {
      setHistSupplierId(s.id)
    } else {
      setSupplierId(s.id)
      setSupplierName(s.name)
    }
    closeSupplierModal()
  }

  // Filter mode only: "ทุกผู้จัดจำหน่าย" clears the history filter
  const clearSupplierFilter = () => { setHistSupplierId(0); closeSupplierModal() }

  // Which id is shown as active in the modal depends on what opened it
  const activeSupplierId = supplierPickTarget === 'filter' ? histSupplierId : supplierId
  const histSupplierName = suppliers.find(s => s.id === histSupplierId)?.name ?? ''

  useEffect(() => { setSupplierHighlight(0) }, [supplierQuery])

  useEffect(() => {
    if (!showSupplierModal) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSupplierHighlight(h => Math.min(h + 1, filteredSuppliers.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSupplierHighlight(h => Math.max(h - 1, 0)) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showSupplierModal, filteredSuppliers.length])

  // ── Totals ────────────────────────────────────────────────────────────────

  const validRows = rows.filter(r => r.product_id && r.lot_number && r.expiry_date && parseFloat(r.qty) > 0)
  const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0)

  // Duplicate = same product_id + same lot_number (different lots for same product are OK)
  const duplicateNames = (() => {
    const seen = new Map<string, string>()
    const dups = new Set<string>()
    rows.forEach(r => {
      if (!r.product_id || !r.lot_number.trim()) return
      const key = `${r.product_id}::${r.lot_number.trim()}`
      if (seen.has(key)) dups.add(r.trade_name || `ID:${r.product_id}`)
      else seen.set(key, r.trade_name || `ID:${r.product_id}`)
    })
    return [...dups]
  })()

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!supplierId) { toast('กรุณาเลือกผู้จัดจำหน่าย', 'error'); return }
    if (!supplierInvoiceNo.trim()) { toast('กรุณาระบุเลขที่ใบกำกับสินค้า', 'error'); return }
    if (validRows.length === 0) { toast('กรุณาเพิ่มรายการสินค้าให้ครบถ้วน', 'error'); return }
    if (paymentType === 'credit' && !dueDate) { toast('กรุณาระบุวันครบกำหนดชำระ', 'error'); return }
    setSaving(true)
    try {
      await window.api.purchase.save({
        invoice_no: invoiceNo, supplier_id: supplierId, supplier_invoice_no: supplierInvoiceNo,
        receive_date: receiveDate, order_date: orderDate || undefined, payment_type: paymentType,
        due_date: dueDate || undefined, is_paid: isPaid, paid_date: paidDate || undefined,
        note: grNote || undefined,
        discount_amount: adjustDiscountAmt || undefined,
        surcharge_amount: adjustSurchargeAmt || undefined,
        userId: getCurrentUserId(),
        items: validRows.map(r => {
          const qtyNum = parseFloat(r.qty) || 0
          const totalNum = parseFloat(r.total) || 0
          // Use total/qty as effective cost so any per-line discount is baked in
          const costPerUnit = qtyNum > 0 ? totalNum / qtyNum : 0
          return {
            product_id: r.product_id, lot_number: r.lot_number,
            manufactured_date: r.manufactured_date || undefined, expiry_date: r.expiry_date,
            cost_price: costPerUnit, sell_price: r.default_sell_price || 0,
            qty: qtyNum, note: r.note || undefined,
          }
        }),
      })
      setSavedInvoice(invoiceNo)
      setShowSuccess(true)
      await loadNextGR()
      setSupplierId(0); setSupplierName(''); setSupplierInvoiceNo('')
      setOrderDate(today); setReceiveDate(today); setPaymentType('cash'); setDueDate('')
      setIsPaid(false); setPaidDate(''); setGrNote('')
      setRows([emptyRow()]); setSearchQueries(['']); setSuggestions([[]])
      loadHistory()
    } catch (e: any) {
      toast(e?.message ? `บันทึกไม่สำเร็จ: ${e.message}` : 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openBillAdjust = () => {
    const origTotals = baseRowTotals ?? rows.map(r => parseFloat(r.total) || 0)
    const sum = origTotals.reduce((a, b) => a + b, 0)
    setAdjustModalSum(sum)
    setBillNetInput(sum.toFixed(2))
    setBillDiscountBaht(appliedDiscount.baht)
    setBillDiscountPct(appliedDiscount.pct)
    setBillSurchargeBaht(appliedSurcharge.baht)
    setBillSurchargePct(appliedSurcharge.pct)
    setBillAdjustTab('discount')
    setShowBillAdjust(true)
  }

  const closeBillAdjust = () => { setShowBillAdjust(false) }

  const applyBillAdjust = () => {
    // Always adjust from the original totals captured before any bill adjustment.
    // Without this, re-opening and confirming stacks the adjustment on already-adjusted values.
    const origTotals = baseRowTotals ?? rows.map(r => parseFloat(r.total) || 0)
    const sumRaw = origTotals.reduce((a, b) => a + b, 0)
    if (sumRaw === 0) { toast('ยอดรวมเป็น 0 ไม่สามารถปรับยอดได้', 'error'); return }
    const discAmt = parseFloat(billDiscountBaht) || 0
    const surAmt  = parseFloat(billSurchargeBaht) || 0
    setRows(rs => rs.map((row, i) => {
      const base = origTotals[i] ?? 0
      const ratio = base / sumRaw
      const rowDisc = ratio * discAmt
      const rowSur  = ratio * surAmt
      const newTotal = Math.max(base - rowDisc + rowSur, 0)
      const qty = parseFloat(row.qty)
      // cost_price absorbs the surcharge; discount column shows the discount share
      // so that: qty * cost_price - discount = newTotal
      const newCost = qty > 0 ? stripTrailingZeros(((base + rowSur) / qty).toFixed(4)) : row.cost_price
      return { ...row, total: newTotal.toFixed(2), cost_price: newCost, discount: rowDisc > 0 ? rowDisc.toFixed(2) : '0' }
    }))
    if (!baseRowTotals) setBaseRowTotals(origTotals)
    setAdjustSubtotal(sumRaw)
    setAdjustDiscountAmt(discAmt)
    setAdjustSurchargeAmt(surAmt)
    setAppliedDiscount({ baht: billDiscountBaht, pct: billDiscountPct })
    setAppliedSurcharge({ baht: billSurchargeBaht, pct: billSurchargePct })
    setShowBillAdjust(false)
  }

  const resetForm = () => {
    setSupplierId(0); setSupplierName(''); setSupplierInvoiceNo('')
    setOrderDate(today); setReceiveDate(today); setPaymentType('cash'); setDueDate('')
    setIsPaid(false); setPaidDate(''); setGrNote('')
    setRows([emptyRow()]); setSearchQueries(['']); setSuggestions([[]])
    setAdjustSubtotal(null); setAdjustDiscountAmt(0); setAdjustSurchargeAmt(0)
    setAppliedDiscount({ baht: '', pct: '' }); setAppliedSurcharge({ baht: '', pct: '' })
    setBaseRowTotals(null)
    loadNextGR()
  }

  // ── Receipt detail panel ──────────────────────────────────────────────────

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

  const histTotalPages = Math.ceil(histTotal / 20)

  const rowIsValid = (r: ReceiptRow) =>
    r.product_id > 0 && r.lot_number.trim() !== '' && r.expiry_date !== '' && parseFloat(r.qty) > 0 && parseFloat(r.total) > 0

  const rowIsPartial = (r: ReceiptRow) =>
    (r.product_id > 0 || r.lot_number || r.expiry_date || r.qty || r.total) && !rowIsValid(r)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-2">

      {/* ── HEADER ── */}
      <PageHeader title="การซื้อสินค้า" />

      {/* ── Tabs ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'receive' | 'history')}
        className="flex-1 min-h-0"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="receive" className="px-8"><PackagePlus />รับสินค้า</TabsTrigger>
          <TabsTrigger value="history" className="px-8"><History />ประวัติการรับสินค้า</TabsTrigger>
        </TabsList>

        {/* ── Tab: รับสินค้า ── */}
        <TabsContent value="receive" className="min-h-0 flex flex-col data-[state=inactive]:hidden">

                {/* Form + sidebar row — fills height; only table body scrolls */}
                <div className="flex gap-4 items-stretch flex-1 min-h-0">

                  {/* Left: GR form */}
                  <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">

                    {/* Header fields */}
                    <div className="bg-card rounded-2xl shadow-card p-4 space-y-3 shrink-0">
                      <div className="grid grid-cols-[1fr_200px_200px] gap-3">

                        {/* Supplier selector */}
                        <div>
                          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
                            ผู้จำหน่าย <span className="text-destructive">*</span>
                          </label>
                          <Button
                            type="button"
                            variant={supplierId ? 'brand-soft' : 'outline'}
                            onClick={() => { setSupplierPickTarget('receive'); setShowSupplierModal(true) }}
                            className="w-full h-10 justify-between px-3 rounded-lg text-sm"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Building2 className="size-4 shrink-0 opacity-70" />
                              <span className={`truncate font-medium ${supplierId ? '' : 'text-foreground-subtle'}`}>
                                {supplierName || '— เลือกผู้จำหน่าย —'}
                              </span>
                            </span>
                            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                          </Button>
                        </div>

                        {/* Supplier invoice no */}
                        <div>
                          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">เลขที่ใบกำกับสินค้า <span className="text-destructive">*</span></label>
                          <div className="relative">
                            <FileText className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground-subtle pointer-events-none" />
                            <Input
                              value={supplierInvoiceNo}
                              onChange={e => setSupplierInvoiceNo(e.target.value)}
                              placeholder="PO-123456"
                              className="h-10 text-sm"
                            />
                          </div>
                        </div>

                        {/* Order date (bill date) */}
                        <div>
                          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันที่สั่งซื้อตามบิล</label>
                          <DateInput
                            value={orderDate}
                            onChange={setOrderDate}
                            className="h-10 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Line items */}
                    <div className="bg-card rounded-2xl shadow-card overflow-hidden flex-1 min-h-0 flex flex-col">
                      <div className="px-5 py-2.5 flex items-center justify-between bg-card gap-3 shrink-0">
                        <span className="text-sm font-semibold text-foreground-subtle">รายการสินค้า</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="brand-soft" onClick={() => { addRow(); focusCell(rows.length, 0) }} className="h-9 rounded-lg text-sm gap-1.5">
                            <Plus className="size-3.5" /> เพิ่มแถว
                          </Button>
                          <Button size="sm" variant="info-soft" onClick={() => setShowImport(true)} className="h-9 rounded-lg text-sm gap-1.5">
                            <ClipboardPaste className="size-3.5" /> นำเข้าข้อมูล
                          </Button>
                          <Button size="sm" variant="warm" onClick={openBillAdjust} className="h-9 rounded-lg text-sm gap-1.5">
                            ปรับยอดท้ายบิล
                          </Button>
                          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg cursor-pointer select-none text-sm font-medium transition-colors bg-muted text-muted-foreground hover:bg-muted-hover">
                            <Switch size="lg" checked={showMfg} onCheckedChange={setShowMfg} />
                            <span>วันผลิต</span>
                          </label>
                          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg cursor-pointer select-none text-sm font-medium transition-colors bg-muted text-muted-foreground hover:bg-muted-hover">
                            <Switch size="lg" checked={showDiscount} onCheckedChange={setShowDiscount} />
                            <span>ส่วนลด</span>
                          </label>
                        </div>
                      </div>

                      <Table
                        containerClassName="flex-1 min-h-0 overflow-auto scrollbar-thin"
                        className="table-fixed border-l-8 border-r-8 border-card"
                      >
                        <TableHeader>
                          <TableRow className="border-0 hover:bg-transparent">
                            <TableHead className="px-3 text-center w-8">#</TableHead>
                            <TableHead className="px-3">ชื่อสินค้า</TableHead>
                            <TableHead className="px-3 text-center w-[8%]">Lot</TableHead>
                            {showMfg && <TableHead className="px-3 text-center w-[13%]">วันผลิต</TableHead>}
                            <TableHead className="px-3 text-center w-[13%]">วันหมดอายุ</TableHead>
                            <TableHead className="px-3 text-center w-[6%]">หน่วย</TableHead>
                            <TableHead className="px-3 text-center w-[6%]">จำนวน</TableHead>
                            <TableHead className="px-3 text-center w-[10%]">ทุน</TableHead>
                            <TableHead className="px-3 text-center w-[10%]">ราคาขาย</TableHead>
                            {showDiscount && <TableHead className="px-3 text-center w-[8%]">ส่วนลด</TableHead>}
                            <TableHead className="px-3 text-center w-[11%]">รวม</TableHead>
                            <TableHead className="w-8" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, i) => {
                              const isPartial = rowIsPartial(row)
                              const isValid = rowIsValid(row)
                              const rowBg = isPartial ? 'bg-warning-soft/60' : isValid ? 'bg-success-soft/50' : 'bg-card'
                              return (
                                <TableRow key={i} className={`border-0 hover:bg-transparent ${rowBg}`}>

                                  {/* # */}
                                  <TableCell className="px-3 py-1.5 text-sm text-foreground-subtle tabular-nums text-center">{i + 1}</TableCell>

                                  {/* Product search */}
                                  <TableCell className="px-2 py-1.5 relative">
                                    <Input
                                      data-cell={`${i}-0`}
                                      value={searchQueries[i] ?? ''}
                                      onChange={e => handleProductSearch(i, e.target.value)}
                                      onFocus={() => { setActiveRow(i); setActiveSuggRow(i); setSuggHighlight(0) }}
                                      onBlur={() => setTimeout(() => setActiveSuggRow(v => v === i ? null : v), 200)}
                                      onKeyDown={e => handleProductKeyDown(i, e)}
                                      placeholder="ค้นหาสินค้า..."
                                      className="text-sm h-8"
                                      autoComplete="off"
                                    />
                                    {activeSuggRow === i && (suggestions[i]?.length ?? 0) > 0 && (
                                      <div className="absolute left-2 top-full mt-0.5 z-50 w-80 bg-card rounded-xl shadow-card overflow-hidden">
                                        {suggestions[i].map((p, si) => (
                                          <Button
                                            key={p.id}
                                            type="button"
                                            variant="ghost"
                                            onMouseDown={() => selectProduct(i, p)}
                                            className={`w-full h-auto justify-start gap-2 rounded-none px-3 py-2 text-sm ${
                                              si === suggHighlight ? 'bg-primary-soft text-primary' : 'hover:bg-primary-soft'
                                            }`}
                                          >
                                            <Package className="size-3.5 text-foreground-subtle shrink-0" />
                                            <span className="truncate flex-1 text-left">{p.trade_name}</span>
                                            {(() => {
                                              const unitText = p.units && p.units.length > 0 ? p.units.map(u => u.unit_name).join(', ') : p.unit_name
                                              return unitText ? <span className="text-sm text-destructive shrink-0">{unitText}</span> : null
                                            })()}
                                          </Button>
                                        ))}
                                      </div>
                                    )}
                                  </TableCell>

                                  {/* Lot */}
                                  <TableCell className="px-2 py-1.5">
                                    <Input data-cell={`${i}-2`} value={row.lot_number} onChange={e => updateRow(i, 'lot_number', e.target.value)} onFocus={() => setActiveRow(i)} className="h-8 text-sm" />
                                  </TableCell>

                                  {/* วันผลิต (optional) */}
                                  {showMfg && (
                                    <TableCell className="px-2 py-1.5">
                                      <DateInput data-cell={`${i}-3`} value={row.manufactured_date} onChange={v => updateRow(i, 'manufactured_date', v)} onFocus={() => setActiveRow(i)} className="h-8 text-sm" />
                                    </TableCell>
                                  )}

                                  {/* วันหมดอายุ */}
                                  <TableCell className="px-2 py-1.5">
                                    <DateInput data-cell={`${i}-4`} value={row.expiry_date} onChange={v => updateRow(i, 'expiry_date', v)} onFocus={() => setActiveRow(i)} className="h-8 text-sm" />
                                  </TableCell>

                                  {/* หน่วย — opens swap modal */}
                                  <TableCell className="px-2 py-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={!row.product_id}
                                      onClick={() => { setActiveRow(i); setUnitModalIdx(i) }}
                                      className="h-8 w-full justify-center px-2 rounded-lg bg-input text-sm font-normal hover:bg-muted-hover border-0 disabled:opacity-50"
                                    >
                                      <span className="truncate">{row.unit_name || ''}</span>
                                    </Button>
                                  </TableCell>

                                  {/* จำนวน */}
                                  <TableCell className="px-2 py-1.5">
                                    <Input
                                      data-cell={`${i}-1`}
                                      type="text"
                                      inputMode="decimal"
                                      value={focusedCell === `${i}-1` ? row.qty : formatNum(row.qty)}
                                      onChange={e => updateLineMath(i, 'qty', stripCommas(e.target.value))}
                                      onFocus={() => { setActiveRow(i); setFocusedCell(`${i}-1`) }}
                                      onBlur={() => setFocusedCell(null)}
                                      placeholder="0"
                                      className="h-8 text-sm text-center tabular-nums"
                                    />
                                  </TableCell>

                                  {/* ทุน */}
                                  <TableCell className="px-2 py-1.5">
                                    <Input
                                      data-cell={`${i}-5`}
                                      type="text"
                                      inputMode="decimal"
                                      value={focusedCell === `${i}-5` ? row.cost_price : formatNum(row.cost_price, true)}
                                      onChange={e => updateLineMath(i, 'cost_price', stripCommas(e.target.value))}
                                      onFocus={() => { setActiveRow(i); setFocusedCell(`${i}-5`) }}
                                      onBlur={() => {
                                        setFocusedCell(null)
                                        const n = parseFloat(row.cost_price)
                                        if (isFinite(n)) updateLineMath(i, 'cost_price', n.toFixed(2))
                                      }}
                                      placeholder="0.00"
                                      className="h-8 text-sm text-right tabular-nums"
                                    />
                                  </TableCell>

                                  {/* ราคาขาย — opens quick-edit modal */}
                                  <TableCell className="px-2 py-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={!row.product_id}
                                      onClick={() => { setActiveRow(i); openPriceModal(i) }}
                                      className="h-8 w-full justify-end px-2 rounded-lg bg-input text-sm font-normal tabular-nums hover:bg-muted-hover border-0 disabled:opacity-50"
                                    >
                                      <span>
                                        {row.product_id ? `${formatCurrency(row.default_sell_price || 0)}` : ''}
                                      </span>
                                    </Button>
                                  </TableCell>

                                  {/* ส่วนลด (optional) */}
                                  {showDiscount && (
                                    <TableCell className="px-2 py-1.5">
                                      <Input
                                        data-cell={`${i}-5b`}
                                        type="text"
                                        inputMode="decimal"
                                        value={focusedCell === `${i}-5b` ? row.discount : formatNum(row.discount, true)}
                                        onChange={e => updateLineMath(i, 'discount', stripCommas(e.target.value))}
                                        onFocus={() => { setActiveRow(i); setFocusedCell(`${i}-5b`) }}
                                        onBlur={() => {
                                          setFocusedCell(null)
                                          const n = parseFloat(row.discount)
                                          if (isFinite(n)) updateLineMath(i, 'discount', n.toFixed(2))
                                        }}
                                        placeholder="0.00"
                                        className="h-8 text-sm text-right tabular-nums"
                                      />
                                    </TableCell>
                                  )}

                                  {/* รวม */}
                                  <TableCell className="px-2 py-1.5">
                                    <Input
                                      data-cell={`${i}-6`}
                                      type="text"
                                      inputMode="decimal"
                                      value={focusedCell === `${i}-6` ? row.total : formatNum(row.total, true)}
                                      onChange={e => updateLineMath(i, 'total', stripCommas(e.target.value))}
                                      onFocus={() => { setActiveRow(i); setFocusedCell(`${i}-6`) }}
                                      onBlur={() => {
                                        setFocusedCell(null)
                                        const n = parseFloat(row.total)
                                        if (isFinite(n)) updateLineMath(i, 'total', n.toFixed(2))
                                      }}
                                      onKeyDown={e => handleQtyKeyDown(i, e)}
                                      placeholder="0.00"
                                      className="h-8 text-sm text-right tabular-nums"
                                    />
                                  </TableCell>

                                  {/* ลบ */}
                                  <TableCell className="px-1 py-1.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeRow(i)}
                                      disabled={rows.length === 1}
                                      className="size-7 rounded text-foreground-subtle hover:text-destructive hover:bg-destructive/10 disabled:opacity-0"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                        </TableBody>
                      </Table>

                      {/* ── Footer bar — always pinned at bottom of card ── */}
                      <div className="shrink-0">
                        {duplicateNames.length > 0 && (
                          <div className="bg-warning-soft px-5 py-2 flex items-center gap-2 text-sm text-warning-strong">
                            <AlertTriangle className="size-4 text-warning shrink-0" />
                            <span className="font-semibold shrink-0">พบรายการซ้ำ (สินค้า + Lot เดิม):</span>
                            <span className="truncate">{duplicateNames.join(', ')}</span>
                          </div>
                        )}
                        {adjustSubtotal !== null && (
                          <div className="bg-card px-5 py-1 space-y-0.5">
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>ราคารวม</span>
                              <span className="tabular-nums w-32 text-right">{formatCurrency(adjustSubtotal)}</span>
                            </div>
                            {adjustDiscountAmt > 0 && (
                              <div className="flex items-center justify-end gap-6 text-sm text-primary">
                                <span>ส่วนลด</span>
                                <span className="tabular-nums w-32 text-right">−{formatCurrency(adjustDiscountAmt)}</span>
                              </div>
                            )}
                            {adjustSurchargeAmt > 0 && (
                              <div className="flex items-center justify-end gap-6 text-sm text-warning-strong">
                                <span>ส่วนเพิ่ม</span>
                                <span className="tabular-nums w-32 text-right">+{formatCurrency(adjustSurchargeAmt)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="bg-card border-t border-border px-5 py-2 flex items-center justify-between gap-3">
                          <Badge variant="brand-soft" className="text-sm rounded-md tabular-nums">{validRows.length}/{rows.length} รายการ</Badge>
                          <div className="flex items-center gap-6">
                            <span className="text-sm font-semibold text-foreground-subtle">มูลค่ารวมทั้งหมด</span>
                            <span className="font-extrabold text-primary text-base tabular-nums w-32 text-right">{formatCurrency(totalCost)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>{/* end left */}

                  {/* ── Right sidebar ── */}
                  <div className="w-64 shrink-0 overflow-y-auto scrollbar-thin [scrollbar-gutter:stable] space-y-3 pr-1">

                    {/* GR summary */}
                    <div className="bg-card rounded-2xl shadow-card p-4 space-y-2.5">
                      <div className="text-sm font-bold text-foreground-subtle uppercase tracking-wide">สรุปใบรับสินค้า</div>
                      <div>
                        <div className="text-sm text-foreground-subtle mb-0.5">เลขที่ใบรับ</div>
                        <div className="text-sm font-bold text-primary tabular-nums">{invoiceNo || '—'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-foreground-subtle mb-0.5">ผู้จัดจำหน่าย</div>
                        <div className="text-sm font-semibold text-foreground truncate">
                          {supplierName || <span className="text-destructive font-normal">N/A</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-foreground-subtle mb-1 block">วันที่รับสินค้า</label>
                        <DateInput value={receiveDate} onChange={setReceiveDate} className="h-9 text-sm" />
                      </div>
                    </div>

                    {/* Payment type */}
                    <div className="bg-card rounded-2xl shadow-card p-4 space-y-3">
                      <div className="text-sm font-bold text-foreground-subtle uppercase tracking-wide">การชำระเงิน</div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={paymentType === 'cash' ? 'default' : 'outline'}
                          onClick={() => setPaymentType('cash')}
                          className="flex-1 h-9 rounded-lg text-sm font-semibold gap-1.5"
                        >
                          <Banknote className="size-3.5" /> เงินสด
                        </Button>
                        <Button
                          type="button"
                          variant={paymentType === 'credit' ? 'tertiary' : 'outline'}
                          onClick={() => setPaymentType('credit')}
                          className="flex-1 h-9 rounded-lg text-sm font-semibold gap-1.5"
                        >
                          <CreditCard className="size-3.5" /> เครดิต
                        </Button>
                      </div>
                      {paymentType === 'credit' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-sm font-semibold text-muted-foreground mb-1 block">วันครบกำหนด <span className="text-destructive">*</span></label>
                            <DateInput value={dueDate} onChange={setDueDate} className="h-9 text-sm" />
                            <div className="flex gap-1 mt-1.5">
                              {[15, 30, 60, 90].map(d => (
                                <Button
                                  key={d}
                                  type="button"
                                  variant="warm"
                                  onClick={() => {
                                    const dt = new Date()
                                    dt.setDate(dt.getDate() + d)
                                    setDueDate(dt.toISOString().slice(0, 10))
                                  }}
                                  className="flex-1 h-8 rounded-lg text-sm font-semibold px-0"
                                >
                                  {d} วัน
                                </Button>
                              ))}
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Checkbox checked={isPaid} onCheckedChange={v => setIsPaid(v === true)} />
                            <span className="text-sm text-muted-foreground">ชำระแล้ว</span>
                          </label>
                          {isPaid && (
                            <div className="space-y-1.5">
                              <DateInput value={paidDate} onChange={setPaidDate} className="h-9 text-sm" />
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="brand-soft"
                                  onClick={() => setPaidDate(today)}
                                  className="flex-1 h-8 rounded-lg text-sm font-semibold"
                                >
                                  วันนี้
                                </Button>
                                <Button
                                  type="button"
                                  variant="warm"
                                  onClick={() => dueDate && setPaidDate(dueDate)}
                                  disabled={!dueDate}
                                  className="flex-1 h-8 rounded-lg text-sm font-semibold"
                                >
                                  วันครบกำหนด
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Note */}
                    <div className="bg-card rounded-2xl shadow-card p-4 space-y-2">
                      <div className="text-sm font-bold text-foreground-subtle uppercase tracking-wide">หมายเหตุ</div>
                      <Textarea
                        value={grNote}
                        onChange={e => setGrNote(e.target.value)}
                        placeholder="บันทึกเพิ่มเติม..."
                        rows={3}
                        className="resize-none text-sm"
                      />
                    </div>

                    {/* Actions */}
                    <div className="space-y-2">
                      <Button
                        onClick={handleSave}
                        disabled={saving || !supplierId || validRows.length === 0 || duplicateNames.length > 0}
                        className="w-full h-12 rounded-xl text-base font-bold"
                      >
                        {saving ? 'กำลังบันทึก...' : 'บันทึกใบรับสินค้า'}
                      </Button>
                      <Button
                        variant="destructive2"
                        onClick={resetForm}
                        className="w-full h-12 rounded-xl text-sm font-medium"
                      >
                        ล้างฟอร์ม
                      </Button>
                    </div>

                  </div>{/* end sidebar */}
                </div>{/* end flex row */}
        </TabsContent>{/* end receive tab */}

        {/* ── Tab: ประวัติการรับสินค้า ── */}
        <TabsContent value="history" className="min-h-0 overflow-hidden data-[state=inactive]:hidden">
          {(() => {
            const today = new Date().toISOString().split('T')[0]
            return (
              <div className="h-full flex flex-col overflow-hidden gap-3">

                {/* ── Summary bar ── */}
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  <StatCard
                    label="รับสินค้าทั้งหมด"
                    value={histSummary.count.toLocaleString()}
                    icon={FileText}
                    tint="secondary"
                  />
                  <StatCard
                    label="มูลค่ารวม"
                    value={`${formatCurrency(histSummary.total_cost)}`}
                    icon={Banknote}
                    tint="primary"
                  />
                  <StatCard
                    label="ค้างชำระ"
                    value={`${formatCurrency(histSummary.unpaid_cost)}`}
                    icon={CreditCard}
                    tint={histSummary.unpaid_cost > 0 ? 'destructive' : 'warm'}
                  />
                </div>

                {/* ── Split pane ── */}
                <div className="flex-1 flex gap-3 min-h-0">

                  {/* Left 40% — filters + list */}
                  <div className="w-[40%] flex flex-col bg-card rounded-2xl shadow-card overflow-hidden">

                    {/* Filters */}
                    <div className="px-3 pt-3 pb-2 space-y-2 shrink-0 bg-muted/40">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground-subtle" />
                          <Input
                            value={histQ}
                            onChange={e => setHistQ(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && loadHistory(1, undefined, undefined, true)}
                            placeholder="ค้นหาเลขที่ใบรับ..."
                            className="pl-8 h-9 text-sm"
                          />
                        </div>
                        <Button size="sm" variant="outline" onClick={() => loadHistory(1, undefined, undefined, true)} className="h-9 px-3 text-sm shrink-0">
                          <Search className="size-3.5" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={histSupplierId ? 'brand-soft' : 'outline'}
                          onClick={() => { setSupplierPickTarget('filter'); setShowSupplierModal(true) }}
                          className="w-full h-9 justify-between px-3 rounded-lg text-sm"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Building2 className="size-4 shrink-0 opacity-70" />
                            <span className={`truncate font-medium ${histSupplierId ? '' : 'text-foreground-subtle'}`}>
                              {histSupplierName || 'ทุกผู้จัดจำหน่าย'}
                            </span>
                          </span>
                          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                        </Button>
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-sm text-foreground-subtle px-0.5">ช่วงวันที่</label>
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
                      {/* Filter chips */}
                      <div className="flex gap-1.5 flex-wrap">
                        {(['all', 'cash', 'credit', 'cancelled'] as const).map(v => {
                          const active = histPaymentFilter === v
                          const activeVariant: 'default' | 'brand-soft' | 'warm' | 'destructive' =
                            v === 'all' ? 'default'
                            : v === 'cash' ? 'brand-soft'
                            : v === 'credit' ? 'warm'
                            : 'destructive'
                          return (
                            <Button
                              key={v}
                              size="sm"
                              variant={active ? activeVariant : 'outline'}
                              onClick={() => { setHistPaymentFilter(v); loadHistory(1, v, undefined, true) }}
                              className="rounded-full px-3 h-7 text-sm font-medium"
                            >
                              {v === 'all' ? 'ทั้งหมด' : v === 'cash' ? 'เงินสด' : v === 'credit' ? 'เครดิต' : 'ยกเลิกแล้ว'}
                            </Button>
                          )
                        })}
                      </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                      {loadingHist ? (
                        <div className="text-center text-foreground-subtle py-12 text-sm">กำลังโหลด...</div>
                      ) : history.length === 0 ? (
                        <div className="text-center text-foreground-subtle py-12 text-sm">ไม่พบข้อมูล</div>
                      ) : history.map(h => {
                        const isCancelled = h.status === 'cancelled'
                        const isOverdue = !isCancelled && h.payment_type === 'credit' && !h.is_paid && !!h.due_date && h.due_date < today
                        const isSelected = selectedInvoice === h.invoice_no
                        return (
                          <Button
                            type="button"
                            variant="ghost"
                            key={h.invoice_no}
                            onClick={() => openReceipt(h.invoice_no)}
                            className={`w-full h-auto flex-col items-stretch text-left px-3 py-2.5 rounded-none ${
                              isSelected
                                ? 'bg-primary-soft hover:bg-primary-soft'
                                : 'hover:bg-muted'
                            } ${isCancelled
                                ? 'border-l-[3px] border-l-muted-foreground/40 opacity-70'
                                : isOverdue
                                  ? 'border-l-[3px] border-l-destructive/60'
                                  : 'border-l-[3px] border-l-transparent'}`}
                          >
                            <div className="flex items-start justify-between gap-2 w-full">
                              <div className="min-w-0 text-left">
                                <div className={`text-sm font-semibold ${isCancelled ? 'text-muted-foreground line-through' : isSelected ? 'text-primary' : 'text-foreground'}`}>
                                  {h.invoice_no}
                                </div>
                                <div className="text-sm text-foreground-subtle truncate mt-0.5">{h.supplier_name ?? '—'}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-sm font-bold tabular-nums ${isCancelled ? 'text-foreground-subtle line-through' : 'text-foreground'}`}>{formatCurrency(h.total_cost)}</div>
                                <div className="text-sm text-foreground-subtle mt-0.5">{formatDate(h.created_at)}</div>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 w-full">
                              <span className="text-sm text-foreground-subtle">{h.item_count} รายการ</span>
                              <span className="text-foreground-subtle">·</span>
                              {isCancelled
                                ? <Badge variant="destructive" className="text-sm px-1.5 py-0">ยกเลิก</Badge>
                                : h.payment_type === 'credit'
                                  ? h.is_paid
                                    ? <Badge variant="success" className="text-sm px-1.5 py-0">ชำระแล้ว</Badge>
                                    : isOverdue
                                      ? <Badge variant="destructive" className="text-sm px-1.5 py-0">เกินกำหนด{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                                      : <Badge variant="warm" className="text-sm px-1.5 py-0">เครดิต{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                                  : <Badge variant="brand-soft" className="text-sm px-1.5 py-0">เงินสด</Badge>
                              }
                            </div>
                          </Button>
                        )
                      })}
                    </div>

                    {/* Pagination */}
                    {histTotalPages > 1 && (
                      <div className="py-2.5 flex justify-center bg-card border-t border-border shrink-0">
                        <Pagination page={histPage} totalPages={histTotalPages} onPageChange={p => loadHistory(p)} />
                      </div>
                    )}
                  </div>

                  {/* Right 60% — detail panel */}
                  <div className="flex-1 flex flex-col bg-card rounded-2xl shadow-card overflow-hidden">
                    {selectedInvoice && receiptItems.length > 0 ? (() => {
                      const h = history.find(r => r.invoice_no === receiptInvoice)
                      const first = receiptItems[0]
                      const isCancelled = (first.status ?? h?.status) === 'cancelled'
                      const isOverdue = !isCancelled && h && h.payment_type === 'credit' && !h.is_paid && !!h.due_date && h.due_date < today
                      const rawTotal = receiptItems.reduce((s, i) => s + i.cost_price * i.qty_received, 0)
                      const discountAmt = first.discount_amount ?? 0
                      const surchargeAmt = first.surcharge_amount ?? 0
                      const hasAdjust = discountAmt > 0 || surchargeAmt > 0
                      return (
                        <>
                          {/* Cancelled banner */}
                          {isCancelled && (
                            <div className="px-5 py-2.5 bg-destructive-soft shrink-0">
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

                          {/* Header */}
                          <div className="px-5 py-4 shrink-0 bg-card">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="min-w-0">
                                  <div className="text-sm text-foreground-subtle uppercase tracking-wide">เลขที่ใบรับ</div>
                                  <div className={`font-bold text-base ${isCancelled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{receiptInvoice}</div>
                                </div>
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
                              </div>
                              {!isCancelled && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={openEditBill}
                                    className="h-8 px-3 rounded-lg text-sm font-semibold"
                                  >
                                    แก้ไขบิล
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive2"
                                    onClick={() => { setCancelReason(''); setCancelBlockers([]); setShowCancelModal(true) }}
                                    className="h-8 px-3 rounded-lg text-sm font-semibold gap-1"
                                  >
                                    <X className="size-3" />
                                    ยกเลิกบิล
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
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
                          </div>

                          {/* Items table */}
                          <div className="flex-1 min-h-0">
                            <Table containerClassName="h-full overflow-auto scrollbar-thin" className="border-l-8 border-r-8 border-card">
                              <TableHeader>
                                <TableRow className="bg-muted">
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

                          {/* Footer total */}
                          <div className="shrink-0 bg-card border-t border-border px-5 py-3 flex justify-between items-center">
                            <div className="text-sm text-muted-foreground">{receiptItems.length} รายการ</div>
                            <div className="font-extrabold text-primary tabular-nums text-lg">
                              {formatCurrency(rawTotal - discountAmt + surchargeAmt)}
                            </div>
                          </div>
                        </>
                      )
                    })() : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center text-foreground-subtle gap-3">
                        <FileText className="w-12 h-12 opacity-20" />
                        <div className="text-sm">เลือกใบรับสินค้าเพื่อดูรายละเอียด</div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )
          })()}
        </TabsContent>{/* end history tab */}
      </Tabs>{/* end tabs */}

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

      {/* ── Supplier modal ── */}
      <Dialog open={showSupplierModal} onOpenChange={(o) => { if (!o) closeSupplierModal() }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="text-xl">เลือกผู้จัดจำหน่าย</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
              <Input
                autoFocus
                value={supplierQuery}
                onChange={e => setSupplierQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filteredSuppliers[supplierHighlight]) {
                    e.preventDefault()
                    selectSupplier(filteredSuppliers[supplierHighlight])
                  }
                }}
                placeholder="ชื่อหรือรหัสผู้จัดจำหน่าย..."
                className="pl-9 h-10"
              />
            </div>
            <div className="h-72 overflow-y-auto space-y-1">
              {supplierPickTarget === 'filter' && !supplierQuery.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearSupplierFilter}
                  className={`w-full h-auto min-h-[3.75rem] justify-start gap-3 px-3 py-2.5 rounded-xl text-left ${
                    histSupplierId === 0 ? 'bg-primary-soft text-primary hover:bg-primary-soft' : ''
                  }`}
                >
                  <Building2 className={`size-4 shrink-0 ${histSupplierId === 0 ? 'text-primary' : 'text-foreground-subtle'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">ทุกผู้จัดจำหน่าย</div>
                  </div>
                </Button>
              )}
              {filteredSuppliers.length === 0 ? (
                <div className="text-sm text-center text-foreground-subtle py-6">ไม่พบผู้จัดจำหน่าย</div>
              ) : filteredSuppliers.map((s, si) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="ghost"
                  onClick={() => selectSupplier(s)}
                  className={`w-full h-auto justify-start gap-3 px-3 py-2.5 rounded-xl text-left ${
                    s.id === activeSupplierId
                      ? 'bg-primary-soft text-primary hover:bg-primary-soft'
                      : si === supplierHighlight
                      ? 'bg-card'
                      : ''
                  }`}
                >
                  <Building2 className={`size-4 shrink-0 ${s.id === activeSupplierId ? 'text-primary' : 'text-foreground-subtle'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{s.name}</div>
                    {s.code && <div className="text-sm text-foreground-subtle">{s.code}</div>}
                  </div>
                </Button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={closeSupplierModal}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unit swap modal — same as POS ── */}
      <Dialog open={unitModalIdx !== null} onOpenChange={(o) => { if (!o) setUnitModalIdx(null) }}>
        {unitModalIdx !== null && rows[unitModalIdx] && (() => {
          const row = rows[unitModalIdx]
          return (
            <DialogContent size="sm" onClose={() => setUnitModalIdx(null)}>
              <DialogHeader>
                <DialogTitle className="text-2xl">เลือกหน่วย</DialogTitle>
                <div className="text-base font-semibold text-foreground">{row.trade_name || '-'}</div>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
                  {row.units.length === 0 ? (
                    <div className="text-sm text-center text-foreground-subtle py-6">ไม่มีหน่วยให้เลือก</div>
                  ) : row.units.map(u => {
                    const active = row.unit_name === u.unit_name
                    return (
                      <Button
                        key={u.id}
                        variant="warm"
                        onClick={() => changeRowUnit(unitModalIdx, u)}
                        className={`w-full h-14 px-4 py-3 rounded-xl transition-colors ${active ? 'font-bold border-warm-foreground border-2' : ''}`}
                      >
                        <div className="relative flex items-center w-full">
                          <span className="w-full text-center text-xl">{u.unit_name}</span>
                          {u.id === -1 && <Badge variant="tertiary" className="absolute right-0 rounded-lg">หลัก</Badge>}
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary" size="xl" className="w-32" onClick={() => setUnitModalIdx(null)}>ปิด</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {/* ── Sell-price quick-edit modal — same as POS ── */}
      <Dialog open={priceModalIdx !== null} onOpenChange={(o) => { if (!o && !priceSaving) closePriceModal() }}>
        {priceModalIdx !== null && rows[priceModalIdx] && (() => {
          const row = rows[priceModalIdx]
          const qtyNum = parseFloat(row.qty) || 0
          const totalNum = parseFloat(row.total) || 0
          const typedCost = parseFloat(row.cost_price)
          const cost = isFinite(typedCost) && typedCost > 0
            ? typedCost
            : (qtyNum > 0 ? totalNum / qtyNum : 0)
          const customPrice = parseFloat(priceDraft) || 0
          const customProfit = customPrice - cost
          const customMarkupPct = cost > 0 ? (customProfit / cost) * 100 : 0
          const fmtDate = (s: string) => {
            const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/)
            return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : (s ?? '')
          }
          return (
            <DialogContent size="lg" onClose={closePriceModal}>
              <DialogHeader>
                <DialogTitle className="text-2xl">ราคาขาย</DialogTitle>
                <div className="text-base font-semibold text-foreground">{row.trade_name || '-'}</div>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin px-1">
                  {/* Custom price input — POS pattern */}
                  <div className="w-full px-4 py-3 rounded-xl bg-primary-soft">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-base font-bold text-primary">กำหนดราคา (ต่อ {row.unit_name || 'ชิ้น'})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        autoFocus
                        value={priceDraft}
                        min={0}
                        step="0.01"
                        style={{ MozAppearance: 'textfield' }}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setPriceDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && priceDraft && !priceSaving) { e.preventDefault(); savePriceModal() } }}
                        placeholder="0.00"
                        className="w-full flex-1 h-10 text-right text-3xl font-bold bg-card rounded-lg focus:ring-2 focus:ring-primary outline-none px-3 tabular-nums"
                      />
                      <Button variant="default" onClick={savePriceModal} disabled={priceSaving || !priceDraft} className="h-10 px-4 text-sm">
                        {priceSaving ? 'กำลังบันทึก…' : 'ตกลง'}
                      </Button>
                    </div>
                  </div>

                  {/* Comparison: old vs new (ราคา / ทุน / กำไร / กำไร %) — shown when price OR cost changed */}
                  {prevCost !== null && (() => {
                    const oldSellPrice = row.default_sell_price
                    const newSellPrice = customPrice
                    const priceDiff = newSellPrice - oldSellPrice
                    const costDiff = cost - prevCost
                    if (Math.abs(priceDiff) < 0.0001 && Math.abs(costDiff) < 0.0001) return null
                    const oldProfit = oldSellPrice - prevCost
                    const newProfit = newSellPrice - cost
                    const oldMargin = prevCost > 0 ? (oldProfit / prevCost) * 100 : 0
                    const newMargin = cost > 0 ? (newProfit / cost) * 100 : 0
                    const profitDiff = newProfit - oldProfit
                    const marginDiff = newMargin - oldMargin
                    // Price up = good (more revenue). Cost up = bad. Profit/margin up = good.
                    const priceDiffCls = priceDiff > 0 ? 'text-success' : priceDiff < 0 ? 'text-destructive' : 'text-muted-foreground'
                    const costDiffCls = costDiff > 0 ? 'text-destructive' : costDiff < 0 ? 'text-success' : 'text-muted-foreground'
                    const profitDiffCls = profitDiff > 0 ? 'text-success' : profitDiff < 0 ? 'text-destructive' : 'text-muted-foreground'
                    const marginDiffCls = marginDiff > 0 ? 'text-success' : marginDiff < 0 ? 'text-destructive' : 'text-muted-foreground'
                    const profitCls = (n: number) => n > 0 ? 'text-success' : n < 0 ? 'text-destructive' : 'text-muted-foreground'
                    const sign = (n: number) => n > 0 ? '+' : ''
                    return (
                      <div className="rounded-xl bg-muted px-4 py-3 space-y-2">
                        <div className="text-base font-semibold text-foreground-subtle">เปรียบเทียบ</div>
                        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-3 gap-y-1.5 text-sm items-center">
                          {/* Column headers */}
                          <div />
                          <div className="text-foreground-subtle text-sm text-right">ราคา</div>
                          <div className="text-foreground-subtle text-sm text-right">ทุน</div>
                          <div className="text-foreground-subtle text-sm text-right">กำไร</div>
                          <div className="text-foreground-subtle text-sm text-right">กำไร %</div>

                          {/* เก่า */}
                          <div className="text-foreground-subtle">เก่า</div>
                          <div className="tabular-nums text-right text-muted-foreground">{formatCurrency(oldSellPrice)}</div>
                          <div className="tabular-nums text-right text-muted-foreground">{formatCurrency(prevCost)}</div>
                          <div className={`tabular-nums text-right ${profitCls(oldProfit)}`}>{formatCurrency(oldProfit)}</div>
                          <div className={`tabular-nums text-right ${profitCls(oldMargin)}`}>{oldMargin.toFixed(1)}%</div>

                          {/* ใหม่ */}
                          <div className="font-semibold">ใหม่</div>
                          <div className="tabular-nums text-right font-semibold text-foreground">{formatCurrency(newSellPrice)}</div>
                          <div className="tabular-nums text-right font-semibold text-foreground">{formatCurrency(cost)}</div>
                          <div className={`tabular-nums text-right font-semibold ${profitCls(newProfit)}`}>{formatCurrency(newProfit)}</div>
                          <div className={`tabular-nums text-right font-semibold ${profitCls(newMargin)}`}>{newMargin.toFixed(1)}%</div>

                          {/* ส่วนต่าง */}
                          <div className="text-foreground-subtle">ส่วนต่าง</div>
                          <div className={`tabular-nums text-right ${priceDiffCls}`}>{sign(priceDiff)}{formatCurrency(priceDiff)}</div>
                          <div className={`tabular-nums text-right ${costDiffCls}`}>{sign(costDiff)}{formatCurrency(costDiff)}</div>
                          <div className={`tabular-nums text-right ${profitDiffCls}`}>{sign(profitDiff)}{formatCurrency(profitDiff)}</div>
                          <div className={`tabular-nums text-right ${marginDiffCls}`}>{sign(marginDiff)}{marginDiff.toFixed(1)}%</div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Note */}
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1">หมายเหตุ</label>
                    <Input
                      value={priceNote}
                      onChange={e => setPriceNote(e.target.value)}
                      placeholder="เหตุผลการแก้ไขราคา..."
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* History */}
                  <div>
                    <div className="text-sm font-semibold text-muted-foreground mb-1.5">ประวัติการแก้ไขล่าสุด</div>
                    <div className="rounded-lg bg-muted/40 max-h-40 overflow-y-auto">
                      {priceHistory.length === 0 ? (
                        <div className="text-sm text-foreground-subtle text-center py-3">ยังไม่มีประวัติ</div>
                      ) : (
                        <table className="w-full table-fixed text-sm">
                          <thead>
                            <tr className="text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted">
                              <th className="px-2 py-1 text-left font-medium w-32">วันที่</th>
                              <th className="px-2 py-1 text-right font-medium w-24">เดิม</th>
                              <th className="px-2 py-1 text-right font-medium w-24">ใหม่</th>
                              <th className="px-2 py-1 text-left font-medium">หมายเหตุ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {priceHistory.map(h => (
                              <tr key={h.id}>
                                {/* text-xs — intentional exception to min-text-sm rule for compact history rows (per user request) */}
                                <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums truncate">{fmtDate(h.created_at)}</td>
                                <td className="px-2 py-1 text-xs text-right text-muted-foreground tabular-nums">{formatCurrency(h.old_price)}</td>
                                <td className="px-2 py-1 text-xs text-right text-foreground font-semibold tabular-nums">{formatCurrency(h.new_price)}</td>
                                <td className="px-2 py-1 text-xs text-muted-foreground truncate">{h.note || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary" size="xl" className="w-32" onClick={closePriceModal}>ปิด</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {/* ── Bill adjustment modal ── */}
      <Dialog open={showBillAdjust} onOpenChange={(o) => { if (!o) closeBillAdjust() }}>
        <DialogContent size="sm">
          {showBillAdjust && (() => {
            const isDisc = billAdjustTab === 'discount'
            const calcNet = (dB: string, sB: string) =>
              Math.max(adjustModalSum - (parseFloat(dB) || 0) + (parseFloat(sB) || 0), 0).toFixed(2)
            const bahtToPct = (b: string) => {
              const v = adjustModalSum > 0 ? (parseFloat(b) || 0) / adjustModalSum * 100 : 0
              return v > 0 ? String(parseFloat(v.toFixed(4))) : ''
            }
            const pctToBaht = (p: string) => {
              const v = (parseFloat(p) || 0) / 100 * adjustModalSum
              return v > 0 ? v.toFixed(2) : ''
            }
            const previewDisc = parseFloat(billDiscountBaht) || 0
            const previewSur  = parseFloat(billSurchargeBaht) || 0
            const PCTS = ['3', '5', '10', '15', '20']
            const handleNetChange = (val: string) => {
              setBillNetInput(val)
              const netTyped = parseFloat(val) || 0
              if (isDisc) {
                const needed = Math.max(adjustModalSum + (parseFloat(billSurchargeBaht) || 0) - netTyped, 0)
                const newBaht = needed > 0 ? needed.toFixed(2) : ''
                setBillDiscountBaht(newBaht); setBillDiscountPct(bahtToPct(newBaht))
              } else {
                const needed = Math.max(netTyped - adjustModalSum + (parseFloat(billDiscountBaht) || 0), 0)
                const newBaht = needed > 0 ? needed.toFixed(2) : ''
                setBillSurchargeBaht(newBaht); setBillSurchargePct(bahtToPct(newBaht))
              }
            }
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl">ปรับยอดท้ายบิล</DialogTitle>
                </DialogHeader>
                <DialogBody className="p-0">
                  {/* Tabs */}
                  <Tabs value={billAdjustTab} onValueChange={(v) => setBillAdjustTab(v as 'discount' | 'surcharge')}>
                    <TabsList className="w-full bg-muted">
                      <TabsTrigger className="font-semibold" value="discount">ส่วนลด</TabsTrigger>
                      <TabsTrigger className="font-semibold" value="surcharge">ส่วนเพิ่ม</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="space-y-4 pt-3">
                    {/* Quick percent buttons */}
                    <div className="flex gap-1.5">
                      {PCTS.map(p => {
                        const active = isDisc ? billDiscountPct === p : billSurchargePct === p
                        return (
                          <Button
                            key={p}
                            type="button"
                            variant={active ? (isDisc ? 'default' : 'default') : 'outline'}
                            size="sm"
                            onClick={() => {
                              const newPct = active ? '' : p
                              const newBaht = pctToBaht(newPct)
                              if (isDisc) { setBillDiscountPct(newPct); setBillDiscountBaht(newBaht); setBillNetInput(calcNet(newBaht, billSurchargeBaht)) }
                              else { setBillSurchargePct(newPct); setBillSurchargeBaht(newBaht); setBillNetInput(calcNet(billDiscountBaht, newBaht)) }
                            }}
                            className="flex-1 h-8 rounded-lg text-sm font-semibold px-0"
                          >
                            {p}%
                          </Button>
                        )
                      })}
                    </div>

                    {/* Inputs: baht + percent side by side */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-muted-foreground">จำนวนเงิน (บาท)</label>
                        <div className="relative">
                          <Input
                            autoFocus
                            type="text"
                            inputMode="decimal"
                            value={adjFocus === 'baht'
                              ? (isDisc ? billDiscountBaht : billSurchargeBaht)
                              : formatNum(isDisc ? billDiscountBaht : billSurchargeBaht, true)}
                            onChange={e => {
                              const newBaht = stripCommas(e.target.value)
                              if (isDisc) { setBillDiscountBaht(newBaht); setBillDiscountPct(bahtToPct(newBaht)); setBillNetInput(calcNet(newBaht, billSurchargeBaht)) }
                              else { setBillSurchargeBaht(newBaht); setBillSurchargePct(bahtToPct(newBaht)); setBillNetInput(calcNet(billDiscountBaht, newBaht)) }
                            }}
                            onFocus={() => setAdjFocus('baht')}
                            onBlur={() => setAdjFocus(null)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyBillAdjust() } }}
                            placeholder="0.00"
                            className="h-10 text-sm text-right"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-muted-foreground">เปอร์เซ็นต์ (%)</label>
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={adjFocus === 'pct'
                              ? (isDisc ? billDiscountPct : billSurchargePct)
                              : formatNum(isDisc ? billDiscountPct : billSurchargePct)}
                            onChange={e => {
                              const newPct = stripCommas(e.target.value)
                              const newBaht = pctToBaht(newPct)
                              if (isDisc) { setBillDiscountPct(newPct); setBillDiscountBaht(newBaht); setBillNetInput(calcNet(newBaht, billSurchargeBaht)) }
                              else { setBillSurchargePct(newPct); setBillSurchargeBaht(newBaht); setBillNetInput(calcNet(billDiscountBaht, newBaht)) }
                            }}
                            onFocus={() => setAdjFocus('pct')}
                            onBlur={() => setAdjFocus(null)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyBillAdjust() } }}
                            placeholder="0.00"
                            className="h-10 text-sm text-right pr-7"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-foreground-subtle">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Total preview */}
                    <div className="rounded-lg bg-primary-soft/50 px-4 py-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>ยอดรวมเดิม</span>
                        <span className="pr-2.5 tabular-nums">{formatCurrency(adjustModalSum)}</span>
                      </div>
                      <div className="flex justify-between text-primary">
                        <span>ส่วนลด</span>
                        <span className="pr-2.5 tabular-nums">{previewDisc > 0 ? '−' : ''}{formatCurrency(previewDisc)}</span>
                      </div>
                      <div className="flex justify-between text-warning-strong">
                        <span>ส่วนเพิ่ม</span>
                        <span className="pr-2.5 tabular-nums">{previewSur > 0 ? '+' : ''}{formatCurrency(previewSur)}</span>
                      </div>
                      <div className="flex items-center justify-between font-semibold text-foreground pt-1.5 mt-1">
                        <span>ยอดสุทธิ</span>
                        <div className="relative w-36">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={adjFocus === 'net' ? billNetInput : formatNum(billNetInput, true)}
                            onChange={e => handleNetChange(stripCommas(e.target.value))}
                            onFocus={() => setAdjFocus('net')}
                            onBlur={() => { setAdjFocus(null); setBillNetInput(calcNet(billDiscountBaht, billSurchargeBaht)) }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyBillAdjust() } }}
                            className="h-9 text-sm font-semibold text-right bg-card"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogBody>
                <DialogFooter>
                  <Button variant="destructive2" size="xl" className="flex-1" onClick={closeBillAdjust}>ยกเลิก</Button>
                  <Button size="xl" className="flex-1" onClick={applyBillAdjust}>ตกลง</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Import paste modal ── */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o && !importing) { setShowImport(false); setImportText('') } }}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>นำเข้าข้อมูลจากตาราง (วาง / Paste)</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {/* Column mapper */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-sm font-semibold text-muted-foreground">จัดลำดับคอลัมน์ (ตรงกับตารางที่วาง)</div>
                {!importColumns.includes('key') && (
                  <div className="flex items-center gap-1 text-sm font-semibold text-destructive bg-destructive-soft rounded px-1.5 py-0.5">
                    <AlertTriangle className="size-3 shrink-0" /> ต้องมีคอลัมน์ Barcode / ชื่อ
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {importColumns.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-0.5">
                    <div className="text-sm text-foreground-subtle text-center">Col {ci + 1}</div>
                    <Select
                      value={col}
                      onValueChange={v => {
                        const next = [...importColumns]
                        next[ci] = v
                        setImportColumns(next)
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORT_FIELD_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  <div className="text-sm text-transparent select-none">.</div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setImportColumns(c => [...c, 'skip'])}
                      className="size-8 rounded-lg font-bold"
                    >+</Button>
                    {importColumns.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive2"
                        onClick={() => setImportColumns(c => c.slice(0, -1))}
                        className="size-8 rounded-lg font-bold"
                      >−</Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-sm text-foreground-subtle">
              คัดลอกตารางจาก Excel / Sheets แล้ววางที่นี่ · บรรทัดแรกถ้าเป็นหัวตารางจะถูกข้ามอัตโนมัติ · วันที่รูปแบบ dd/mm/yyyy
            </div>
            <Textarea
              autoFocus
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'CETRIZIN\t200\t41128\t04/11/2028\t04/11/2028\t1,020.00'}
              className="text-sm h-40"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" disabled={importing} onClick={() => { setShowImport(false); setImportText('') }}>ยกเลิก</Button>
            <Button size="xl" disabled={importing || !importText.trim() || !importColumns.includes('key')} onClick={handleImport}>
              {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ── Success dialog ── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent size="sm">
          <DialogHeader className="sr-only">
            <DialogTitle>บันทึกสำเร็จ</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-center py-8 space-y-4">
            <div className="text-6xl">✅</div>
            <div>
              <div className="text-lg font-semibold">บันทึกสำเร็จ</div>
              <div className="text-muted-foreground text-sm mt-1">{savedInvoice}</div>
            </div>
            <Button size="xl" onClick={() => setShowSuccess(false)} className="w-full">
              เสร็จสิ้น
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

    </div>
  )
}
