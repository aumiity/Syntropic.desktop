import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateInput } from '@/components/ui/date-input'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogBody } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { cn, formatCurrency, formatDate, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Supplier, ProductLot } from '@/types'
import {
  Search, Plus, Trash2, Package, ChevronDown, X,
  Building2, Banknote, CreditCard, FileText, CalendarDays, ClipboardPaste, AlertTriangle,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProductUnitOption {
  id: number
  unit_name: string
  qty_per_base: number
  is_base_unit: number | boolean
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

// ── Inline modal (same pattern as POS) ─────────────────────────────────────

function InlineModal({ title, onClose, onConfirm, children, footer, maxWidth = 'max-w-sm' }: {
  title: string
  onClose: () => void
  onConfirm?: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'Enter' && onConfirm) {
        if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
        e.preventDefault()
        onConfirm()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 ${maxWidth} w-full mx-4`}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-bold text-slate-700 text-base truncate pr-2">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PurchasePage() {
  const { toast } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

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
    } finally {
      setLoadingHist(false)
    }
  }, [histQ, histSupplierId, histDateFrom, histDateTo, histPaymentFilter])

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
        userId: 1,
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
        userId: 1,
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
      is_base_unit: true,
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
    focusCell(i, 1)
  }

  const buildRowFromProduct = (p: ProductSuggestion, fields: Partial<ReceiptRow>): ReceiptRow => {
    const baseName = p.unit_name || 'ชิ้น'
    const incoming = p.units ?? []
    const baseUnit: ProductUnitOption = {
      id: -1, unit_name: baseName, qty_per_base: 1, is_base_unit: true,
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
      if (product?.cost_price != null) setPrevCost(Number(product.cost_price))
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
    setSupplierId(s.id)
    setSupplierName(s.name)
    closeSupplierModal()
  }

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
        userId: 1,
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
    <div className="flex flex-col h-full p-3 gap-3">

      {/* ── Banner — rounded card, identical style to POS ── */}
      <div className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-md flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold leading-tight">การซื้อ</h1>
          <p className="text-xs opacity-80">จัดการการรับสินค้าและประวัติการสั่งซื้อ</p>
        </div>
        <div className="text-right text-xs opacity-90 leading-relaxed">
          <div>วันที่: <span className="font-semibold">{now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></div>
          <div>เวลา: <span className="font-semibold tabular-nums">{now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span></div>
        </div>
      </div>

      {/* ── Tab area ── */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Chrome-style tab strip — identical to POS */}
        <div className="flex items-end border-b border-slate-200 shrink-0">
          {(['receive', 'history'] as const).map((tab, i) => {
            const label = tab === 'receive' ? 'รับสินค้า' : 'ประวัติการรับสินค้า'
            const isActive = activeTab === tab
            const showSep = i > 0 && !isActive && activeTab !== 'receive'
            return (
              <React.Fragment key={tab}>
                {i > 0 && (
                  <span className={`self-center h-3.5 w-px mx-0.5 shrink-0 transition-colors ${showSep ? 'bg-slate-300' : 'bg-transparent'}`} />
                )}
                <button
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-10 py-1.5 text-sm font-semibold rounded-t-lg -mb-px border border-b-0 transition-colors ${
                    isActive
                      ? 'bg-white border-slate-200 text-slate-700 z-10'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {label}
                </button>
              </React.Fragment>
            )
          })}
        </div>

        {/* White content panel — same as POS cart panel */}
        <div className="flex-1 bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden min-h-0">

          {/* ── Tab: รับสินค้า ── */}
          {activeTab === 'receive' && (
            <div className="h-full overflow-y-auto">
              <div className="p-4 space-y-3 max-w-screen mx-auto">

                {/* Form + sidebar row */}
                <div className="flex gap-4 items-start">

                  {/* Left: GR form */}
                  <div className="flex-1 min-w-0 space-y-3">

                    {/* Header fields */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                      <div className="grid grid-cols-[1fr_200px_200px] gap-3">

                        {/* Supplier selector */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            ผู้จำหน่าย <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowSupplierModal(true)}
                            className={`w-full h-10 flex items-center justify-between px-3 rounded-lg border text-sm transition-colors ${
                              supplierId
                                ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                                : 'border-slate-300 bg-white text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Building2 className="h-4 w-4 shrink-0 opacity-60" />
                              <span className={`truncate font-medium ${supplierId ? 'text-blue-800' : 'text-slate-400'}`}>
                                {supplierName || '— เลือกผู้จำหน่าย —'}
                              </span>
                            </div>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          </button>
                        </div>

                        {/* Supplier invoice no */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5">เลขที่ใบกำกับสินค้า <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                            <Input
                              value={supplierInvoiceNo}
                              onChange={e => setSupplierInvoiceNo(e.target.value)}
                              placeholder="PO-123456"
                              className="pl-8 h-10 text-sm"
                            />
                          </div>
                        </div>

                        {/* Order date (bill date) */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1.5">วันที่สั่งซื้อตามบิล</label>
                          <div className="relative">
                            <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                            <DateInput
                              value={orderDate}
                              onChange={setOrderDate}
                              className="pl-8 h-10 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Line items */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 gap-2">
                        <span className="text-sm font-semibold text-slate-700">รายการสินค้า</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="h-7 text-xs gap-1">
                            <ClipboardPaste className="h-3 w-3" /> นำเข้าข้อมูล
                          </Button>                          
                          <Button size="sm" variant="outline" onClick={openBillAdjust} className="h-7 text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50">
                            ปรับยอดท้ายบิล
                          </Button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">
                              <th className="px-3 py-2 text-left w-8">#</th>
                              <th className="px-3 py-2 text-left" style={{ minWidth: 220 }}>ชื่อสินค้า</th>
                              <th className="px-3 py-2 text-center w-20">หน่วย</th>
                              <th className="px-3 py-2 text-center w-20">จำนวน</th>
                              <th className="px-3 py-2 text-center w-24">ราคาทุน</th>
                              <th className="px-3 py-2 text-center w-24">ราคาขาย</th>
                              <th className="px-3 py-2 text-center w-24">ส่วนลด</th>
                              <th className="px-3 py-2 text-center w-28">รวม</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, i) => {
                              const expStatus = row.expiry_date ? getExpiryStatus(row.expiry_date) : null
                              const isPartial = rowIsPartial(row)
                              return (
                                <React.Fragment key={i}>
                                  <tr className={`border-t border-slate-100 transition-colors border-l-2 ${activeRow === i ? 'border-l-blue-400 bg-blue-100' : isPartial ? 'border-l-transparent bg-amber-50/60' : 'border-l-transparent hover:bg-blue-50/40'}`}>

                                    {/* Row # + status dot */}
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-slate-400 tabular-nums w-4 text-center">{i + 1}</span>
                                        {isPartial && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                                        {rowIsValid(row) && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                                      </div>
                                    </td>

                                    {/* Product search */}
                                    <td className="px-2 py-1.5 relative">
                                      <Input
                                        data-cell={`${i}-0`}
                                        value={searchQueries[i] ?? ''}
                                        onChange={e => handleProductSearch(i, e.target.value)}
                                        onFocus={() => { setActiveRow(i); setActiveSuggRow(i); setSuggHighlight(0) }}
                                        onBlur={() => setTimeout(() => setActiveSuggRow(v => v === i ? null : v), 200)}
                                        onKeyDown={e => handleProductKeyDown(i, e)}
                                        placeholder="ค้นหาสินค้า..."
                                        className="text-xs h-7"
                                        autoComplete="off"
                                      />
                                      {activeSuggRow === i && (suggestions[i]?.length ?? 0) > 0 && (
                                        <div className="absolute left-2 top-full mt-0.5 z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                                          {suggestions[i].map((p, si) => (
                                            <button
                                              key={p.id}
                                              type="button"
                                              onMouseDown={() => selectProduct(i, p)}
                                              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                                                si === suggHighlight ? 'bg-blue-100 text-blue-700' : 'hover:bg-blue-50'
                                              }`}
                                            >
                                              <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                              <span className="truncate flex-1">{p.trade_name}</span>
                                              {(() => {
                                                const unitText = p.units && p.units.length > 0 ? p.units.map(u => u.unit_name).join(', ') : p.unit_name
                                                return unitText ? <span className="text-xs text-red-400  shrink-0">{unitText}</span> : null
                                              })()}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </td>

                                    {/* Unit selector — opens swap modal like POS */}
                                    <td className="px-3 py-1.5">
                                      <button
                                        type="button"
                                        disabled={!row.product_id}
                                        onClick={() => { setActiveRow(i); setUnitModalIdx(i) }}
                                        className="h-7 w-full inline-flex items-center justify-center gap-1 px-2 rounded-lg border border-slate-300 bg-white text-xs hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        <span className={`truncate ${row.unit_name ? 'text-slate-700' : 'text-slate-500'}`}>{row.unit_name || 'หน่วย'}</span>
                                      </button>
                                    </td>

                                    <td className="px-3 py-1.5">
                                      <Input data-cell={`${i}-1`} type="number" value={row.qty} onChange={e => updateLineMath(i, 'qty', e.target.value)} onFocus={() => setActiveRow(i)} placeholder="จำนวน" className="h-7 text-xs text-right" min={1} />
                                    </td>

                                    {/* ราคาทุน — input; auto-syncs with รวม via qty */}
                                    <td className="px-3 py-1.5">
                                      {(() => {
                                        const enteredCost = parseFloat(row.cost_price)
                                        const sc = row.stored_cost_price
                                        const costChanged = sc != null && isFinite(enteredCost) && Math.abs(enteredCost - sc) > 0.001
                                        const costCls = costChanged
                                          ? (enteredCost > sc! ? 'border-red-400 bg-red-50' : 'border-blue-400 bg-blue-50')
                                          : ''
                                        return <Input data-cell={`${i}-5`} type="number" value={row.cost_price} onChange={e => updateLineMath(i, 'cost_price', e.target.value)} onFocus={() => setActiveRow(i)} placeholder="ราคาทุน" className={`h-7 text-xs text-right ${costCls}`} min={0} step="0.01" />
                                      })()}
                                    </td>

                                    {/* ราคาขาย — button opens quick-edit modal */}
                                    <td className="px-2 py-1.5">
                                      {(() => {
                                        const enteredCost = parseFloat(row.cost_price)
                                        const belowCost = row.product_id && isFinite(enteredCost) && enteredCost > 0 && row.default_sell_price < enteredCost
                                        return (
                                          <button
                                            type="button"
                                            disabled={!row.product_id}
                                            onClick={() => { setActiveRow(i); openPriceModal(i) }}
                                            className={`h-7 w-full inline-flex items-center justify-end gap-1 px-2 rounded-lg border text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors tabular-nums ${belowCost ? 'border-red-400 bg-red-50 hover:bg-red-100' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'}`}
                                          >
                                            <span className={belowCost ? 'text-red-600 font-semibold' : row.product_id ? 'text-slate-700' : 'text-slate-500'}>
                                              {row.product_id ? `${formatCurrency(row.default_sell_price || 0)}` : 'ราคาขาย'}
                                            </span>
                                          </button>
                                        )
                                      })()}
                                    </td>

                                    {/* ส่วนลด */}
                                    <td className="px-3 py-1.5">
                                      <Input data-cell={`${i}-5b`} type="number" value={row.discount} onChange={e => updateLineMath(i, 'discount', e.target.value)} onFocus={() => setActiveRow(i)} placeholder="ส่วนลด" className="h-7 text-xs text-right" min={0} step="0.01" />
                                    </td>

                                    <td className="px-3 py-1.5">
                                      <Input data-cell={`${i}-6`} type="number" value={row.total} onChange={e => updateLineMath(i, 'total', e.target.value)} onFocus={() => setActiveRow(i)} onKeyDown={e => handleQtyKeyDown(i, e)} placeholder="ราคารวม" className="h-7 text-xs text-right" min={0} step="0.01" />
                                    </td>

                                    <td className="px-2 py-1.5">
                                      <button
                                        type="button"
                                        onClick={() => removeRow(i)}
                                        disabled={rows.length === 1}
                                        className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-0 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>

                                  {/* Sub-row: Lot No., วันผลิต, วันหมดอายุ */}
                                  <tr className={`border-l-2 border-l-transparent transition-colors ${activeRow === i ? 'bg-blue-100' : isPartial ? 'bg-amber-50/60' : 'bg-slate-50/50'}`}>
                                    <td colSpan={9} className="px-2 pb-2 pt-0">
                                      <div className="flex items-end gap-3 pl-10">
                                        <div>
                                          <div className="text-xs font-medium text-slate-400 mb-0.5">Lot No.</div>
                                          <Input data-cell={`${i}-2`} value={row.lot_number} onChange={e => updateRow(i, 'lot_number', e.target.value)} onFocus={() => setActiveRow(i)} className="h-7 text-xs w-28" />
                                        </div>
                                        <div>
                                          <div className="text-xs font-medium text-slate-400 mb-0.5">วันผลิต</div>
                                          <DateInput data-cell={`${i}-3`} value={row.manufactured_date} onChange={v => updateRow(i, 'manufactured_date', v)} onFocus={() => setActiveRow(i)} className="h-7 text-xs w-32" />
                                        </div>
                                        <div>
                                          <div className="text-xs font-medium text-slate-400 mb-0.5">วันหมดอายุ</div>
                                          <DateInput
                                            data-cell={`${i}-4`}
                                            value={row.expiry_date}
                                            onChange={v => updateRow(i, 'expiry_date', v)}
                                            onFocus={() => setActiveRow(i)}
                                            className={`h-7 text-xs w-32 ${
                                              expStatus === 'expired' ? 'border-red-400 bg-red-50 text-red-700' :
                                              expStatus === 'danger'  ? 'border-orange-400 bg-orange-50' :
                                              expStatus === 'warning' ? 'border-yellow-400 bg-yellow-50' : ''
                                            }`}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            {duplicateNames.length > 0 && (
                              <tr className="border-t border-amber-200 bg-amber-50">
                                <td colSpan={9} className="px-3 py-2">
                                  <div className="flex items-center gap-2 text-sm text-amber-700">
                                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                    <span className="font-semibold shrink-0">พบรายการซ้ำ (สินค้า + Lot เดิม):</span>
                                    <span className="truncate">{duplicateNames.join(', ')}</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {adjustSubtotal !== null && (
                              <>
                                <tr className="bg-slate-50 border-t border-slate-100">
                                  <td colSpan={7} className="px-3 py-1 text-right text-xs text-slate-500">ราคารวม</td>
                                  <td className="px-3 py-1 text-right text-xs text-slate-500 tabular-nums">฿{formatCurrency(adjustSubtotal)}</td>
                                  <td />
                                </tr>
                                {adjustDiscountAmt > 0 && (
                                  <tr className="bg-slate-50">
                                    <td colSpan={7} className="px-3 py-1 text-right text-xs text-blue-600">ส่วนลด</td>
                                    <td className="px-3 py-1 text-right text-xs text-blue-600 tabular-nums">−฿{formatCurrency(adjustDiscountAmt)}</td>
                                    <td />
                                  </tr>
                                )}
                                {adjustSurchargeAmt > 0 && (
                                  <tr className="bg-slate-50">
                                    <td colSpan={7} className="px-3 py-1 text-right text-xs text-amber-600">ส่วนเพิ่ม</td>
                                    <td className="px-3 py-1 text-right text-xs text-amber-600 tabular-nums">+฿{formatCurrency(adjustSurchargeAmt)}</td>
                                    <td />
                                  </tr>
                                )}
                              </>
                            )}
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                              <td colSpan={7} className="px-3 py-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => { addRow(); focusCell(rows.length, 0) }} className="h-7 text-xs gap-1">
                                      <Plus className="h-3 w-3" /> เพิ่มแถว
                                    </Button>
                                    <span className="text-xs text-slate-400 tabular-nums">{validRows.length}/{rows.length} รายการ</span>
                                  </div>
                                  <span className="text-sm font-semibold text-slate-600">มูลค่ารวมทั้งหมด</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-extrabold text-blue-700 text-base tabular-nums">฿{formatCurrency(totalCost)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                  </div>{/* end left */}

                  {/* ── Right sidebar ── */}
                  <div className="w-64 shrink-0 sticky top-0 space-y-3">

                    {/* GR summary */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                      <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">สรุปใบรับสินค้า</div>
                      <div>
                        <div className="text-xs text-slate-400 mb-0.5">เลขที่ใบรับ</div>
                        <div className=" font-bold text-sm text-blue-700">{invoiceNo || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-0.5">ผู้จัดจำหน่าย</div>
                        <div className="text-sm font-semibold text-slate-700 truncate">
                          {supplierName || <span className="text-red-400 font-normal">N/A</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-0.5 block">วันที่รับสินค้า</label>
                        <div className="relative">
                          <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                          <DateInput
                            value={receiveDate}
                            onChange={setReceiveDate}
                            className="pl-6 h-9 text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <div className="text-xs text-slate-400">รายการ</div>
                          <div className="text-lg font-extrabold text-slate-700 tabular-nums">{validRows.length}</div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <div className="text-xs text-blue-600">มูลค่า</div>
                          <div className="text-base font-extrabold text-blue-700 tabular-nums leading-tight">฿{formatCurrency(totalCost)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Payment type */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                      <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">การชำระเงิน</div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentType('cash')}
                          className={`flex-1 h-9 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            paymentType === 'cash'
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <Banknote className="h-3.5 w-3.5" /> เงินสด
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentType('credit')}
                          className={`flex-1 h-9 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            paymentType === 'credit'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <CreditCard className="h-3.5 w-3.5" /> เครดิต
                        </button>
                      </div>
                      {paymentType === 'credit' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 mb-1 block">วันครบกำหนด <span className="text-red-500">*</span></label>
                            <div className="relative">
                            <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                            <DateInput value={dueDate} onChange={setDueDate} className="pl-6 text-sm h-9" />
                            </div>
                            <div className="flex gap-1 mt-1.5">
                              {[15, 30, 60, 90].map(d => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => {
                                    const dt = new Date()
                                    dt.setDate(dt.getDate() + d)
                                    setDueDate(dt.toISOString().slice(0, 10))
                                  }}
                                  className="flex-1 h-7 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 hover:border-amber-300 transition-colors"
                                >
                                  {d} วัน
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Checkbox checked={isPaid} onCheckedChange={v => setIsPaid(v === true)} />
                            <span className="text-xs text-slate-600">ชำระแล้ว</span>
                          </label>
                          {isPaid && (
                            <div className="space-y-1.5">
                              <div className="relative">
                              <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                              <DateInput value={paidDate} onChange={setPaidDate} className="pl-6 h-9 text-sm" />
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPaidDate(today)}
                                  className="flex-1 h-7 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 hover:border-blue-300 transition-colors"
                                >
                                  วันนี้
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dueDate && setPaidDate(dueDate)}
                                  disabled={!dueDate}
                                  className="flex-1 h-7 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  วันครบกำหนด
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Note */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2">
                      <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">หมายเหตุ</div>
                      <textarea
                        value={grNote}
                        onChange={e => setGrNote(e.target.value)}
                        placeholder="บันทึกเพิ่มเติม..."
                        rows={3}
                        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                      />
                    </div>

                    {/* Actions */}
                    <div className="space-y-2">
                      <Button
                        onClick={handleSave}
                        disabled={saving || !supplierId || validRows.length === 0 || duplicateNames.length > 0}
                        className="w-full h-12 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100 text-white font-bold text-base shadow-md"
                      >
                        {saving ? 'กำลังบันทึก...' : 'บันทึกใบรับสินค้า'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={resetForm}
                        className="w-full h-9 rounded-xl text-sm text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                      >
                        ล้างฟอร์ม
                      </Button>
                    </div>

                  </div>{/* end sidebar */}
                </div>{/* end flex row */}
              </div>{/* end p-4 */}
            </div>
          )}{/* end receive tab */}

          {/* ── Tab: ประวัติการรับสินค้า ── */}
          {activeTab === 'history' && (() => {
            const today = new Date().toISOString().split('T')[0]
            return (
              <div className="h-full flex flex-col overflow-hidden p-4 gap-3">

                {/* ── Summary bar ── */}
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  <Card size="sm" className="bg-white">
                    <CardContent className="px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">รับสินค้าทั้งหมด</div>
                        <div className="text-lg font-bold text-slate-800 leading-tight">
                          {histSummary.count} <span className="text-sm font-normal text-slate-400">ใบ</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card size="sm" className="bg-white">
                    <CardContent className="px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Banknote className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">มูลค่ารวม</div>
                        <div className="text-lg font-bold text-blue-700 leading-tight tabular-nums">
                          ฿{formatCurrency(histSummary.total_cost)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card size="sm" className="bg-white">
                    <CardContent className="px-4 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${histSummary.unpaid_cost > 0 ? 'bg-red-50' : 'bg-slate-100'}`}>
                        <CreditCard className={`w-4 h-4 ${histSummary.unpaid_cost > 0 ? 'text-red-400' : 'text-slate-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">ค้างชำระ</div>
                        <div className={`text-lg font-bold leading-tight tabular-nums ${histSummary.unpaid_cost > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          ฿{formatCurrency(histSummary.unpaid_cost)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Split pane ── */}
                <div className="flex-1 flex gap-3 min-h-0">

                  {/* Left 40% — filters + list */}
                  <div className="w-[40%] flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                    {/* Filters */}
                    <div className="px-3 pt-3 pb-2 border-b border-slate-100 space-y-2 shrink-0">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <Input
                            value={histQ}
                            onChange={e => setHistQ(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && loadHistory(1)}
                            placeholder="ค้นหาเลขที่ใบรับ..."
                            className="pl-8 h-8 text-sm"
                          />
                        </div>
                        <Button size="sm" variant="outline" onClick={() => loadHistory(1)} className="h-8 px-3 text-xs shrink-0">
                          <Search className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={String(histSupplierId)}
                          onValueChange={v => setHistSupplierId(Number(v))}
                        >
                          <SelectTrigger size="sm" className="w-full h-8 text-sm">
                            <SelectValue placeholder="ทุกผู้จัดจำหน่าย" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">ทุกผู้จัดจำหน่าย</SelectItem>
                            {suppliers.map(s => (
                              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-xs text-slate-400 px-0.5">ช่วงวันที่</label>
                        <DateRangePicker
                          from={histDateFrom}
                          to={histDateTo}
                          onChange={(from, to) => {
                            setHistDateFrom(from)
                            setHistDateTo(to)
                            loadHistory(1, undefined, { from, to })
                          }}
                        />
                      </div>
                      {/* Filter chips */}
                      <div className="flex gap-1.5 flex-wrap">
                        {(['all', 'cash', 'credit', 'cancelled'] as const).map(v => {
                          const active = histPaymentFilter === v
                          const cancelChip = v === 'cancelled'
                          return (
                            <Button
                              key={v}
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              onClick={() => { setHistPaymentFilter(v); loadHistory(1, v) }}
                              className={cn(
                                'rounded-full px-3 h-7 text-xs font-medium',
                                active && cancelChip && 'bg-red-500 hover:bg-red-600 border-red-500 text-white',
                                active && !cancelChip && 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white',
                                !active && 'bg-white text-slate-500 border-slate-200 hover:border-slate-300',
                              )}
                            >
                              {v === 'all' ? 'ทั้งหมด' : v === 'cash' ? 'เงินสด' : v === 'credit' ? 'เครดิต' : 'ยกเลิกแล้ว'}
                            </Button>
                          )
                        })}
                      </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                      {loadingHist ? (
                        <div className="text-center text-slate-400 py-12 text-sm">กำลังโหลด...</div>
                      ) : history.length === 0 ? (
                        <div className="text-center text-slate-400 py-12 text-sm">ไม่พบข้อมูล</div>
                      ) : history.map(h => {
                        const isCancelled = h.status === 'cancelled'
                        const isOverdue = !isCancelled && h.payment_type === 'credit' && !h.is_paid && !!h.due_date && h.due_date < today
                        const isSelected = selectedInvoice === h.invoice_no
                        return (
                          <button
                            key={h.invoice_no}
                            onClick={() => openReceipt(h.invoice_no)}
                            className={`w-full text-left px-3 py-2.5 transition-colors ${
                              isSelected
                                ? 'bg-blue-50'
                                : 'hover:bg-slate-50'
                            } ${isCancelled
                                ? 'border-l-[3px] border-l-slate-300 opacity-70'
                                : isOverdue
                                  ? 'border-l-[3px] border-l-red-400'
                                  : 'border-l-[3px] border-l-transparent'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`text-xs font-semibold ${isCancelled ? 'text-slate-500 line-through' : isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                  {h.invoice_no}
                                </div>
                                <div className="text-xs text-slate-400 truncate mt-0.5">{h.supplier_name ?? '—'}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-sm font-bold tabular-nums ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>฿{formatCurrency(h.total_cost)}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(h.created_at)}</div>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-xs text-slate-400">{h.item_count} รายการ</span>
                              <span className="text-slate-200">·</span>
                              {isCancelled
                                ? <Badge variant="destructive" className="text-[11px] px-1.5 py-0">ยกเลิก</Badge>
                                : h.payment_type === 'credit'
                                  ? h.is_paid
                                    ? <Badge variant="success" className="text-[11px] px-1.5 py-0">ชำระแล้ว</Badge>
                                    : isOverdue
                                      ? <Badge variant="destructive" className="text-[11px] px-1.5 py-0">เกินกำหนด{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                                      : <Badge variant="warning" className="text-[11px] px-1.5 py-0">เครดิต{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                                  : <Badge variant="secondary" className="text-[11px] px-1.5 py-0">เงินสด</Badge>
                              }
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Pagination */}
                    {histTotalPages > 1 && (
                      <div className="py-2.5 flex justify-center border-t border-slate-100 shrink-0">
                        <Pagination page={histPage} totalPages={histTotalPages} onPageChange={p => loadHistory(p)} />
                      </div>
                    )}
                  </div>

                  {/* Right 60% — detail panel */}
                  <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                            <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 shrink-0">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-red-700">
                                    บิลถูกยกเลิก{first.cancelled_at ? ` · ${formatDate(first.cancelled_at)}` : ''}
                                  </div>
                                  {first.cancel_reason && (
                                    <div className="text-xs text-red-600 mt-0.5 break-words">เหตุผล: {first.cancel_reason}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Header */}
                          <div className="px-5 py-4 border-b border-slate-200 shrink-0">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">เลขที่ใบรับ</div>
                                <div className={`font-bold text-base ${isCancelled ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{receiptInvoice}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isCancelled
                                  ? <Badge variant="destructive" className="text-xs">ยกเลิกแล้ว</Badge>
                                  : h && (
                                    h.payment_type === 'credit'
                                      ? h.is_paid
                                        ? <Badge variant="success" className="text-xs">ชำระแล้ว</Badge>
                                        : isOverdue
                                          ? <Badge variant="destructive" className="text-xs">เกินกำหนด{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                                          : <Badge variant="warning" className="text-xs">เครดิต{h.due_date ? ` · ${formatDate(h.due_date)}` : ''}</Badge>
                                      : <Badge variant="secondary" className="text-xs">เงินสด</Badge>
                                  )}
                                {!isCancelled && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={openEditBill}
                                      className="h-7 px-2.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                                    >
                                      แก้ไขบิล
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setCancelReason(''); setCancelBlockers([]); setShowCancelModal(true) }}
                                      className="h-7 px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                                    >
                                      <X className="w-3 h-3 mr-1" />
                                      ยกเลิกบิล
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">ผู้จำหน่าย</div>
                                <div className="text-sm font-medium text-slate-700 truncate">{first.supplier_name ?? '—'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">เลขที่ใบกำกับสินค้า</div>
                                <div className="text-sm font-medium text-slate-700">{first.supplier_invoice_no || '—'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">วันที่สั่งซื้อตามบิล</div>
                                <div className="text-sm font-medium text-slate-700">{first.order_date ? formatDate(first.order_date) : '—'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">วันที่รับสินค้า</div>
                                <div className="text-sm font-medium text-slate-700">{first.created_at ? formatDate(first.created_at) : '—'}</div>
                              </div>
                            </div>
                          </div>

                          {/* Items table */}
                          <div className="flex-1 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-100">
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
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {item.lot_number && (
                                            <span className="text-xs text-slate-400">Lot. {item.lot_number}</span>
                                          )}
                                          {item.lot_number && item.expiry_date && (
                                            <span className="text-slate-300 text-xs"></span>
                                          )}
                                          {item.expiry_date && (
                                            <span className={`text-xs ${
                                              es === 'expired' ? 'text-red-600 font-semibold' :
                                              es === 'danger'  ? 'text-orange-500 font-semibold' :
                                              es === 'warning' ? 'text-yellow-600' :
                                              'text-slate-400'
                                            }`}>exp. {formatExpiry(item.expiry_date)}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-500">{item.unit_name || '—'}</TableCell>
                                      <TableCell className="text-right tabular-nums">฿{formatCurrency(item.cost_price)}</TableCell>
                                      <TableCell className="text-right tabular-nums">{item.qty_received}</TableCell>
                                      <TableCell className="text-right font-semibold tabular-nums">฿{formatCurrency(item.cost_price * item.qty_received)}</TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                              {hasAdjust && (
                                <tfoot>
                                  <tr className="border-t border-slate-100">
                                    <td colSpan={4} className="px-4 py-1.5 text-right text-xs text-slate-500">ราคารวมก่อนปรับ</td>
                                    <td className="px-4 py-1.5 text-right text-xs tabular-nums text-slate-600">฿{formatCurrency(rawTotal)}</td>
                                  </tr>
                                  {discountAmt > 0 && (
                                    <tr>
                                      <td colSpan={4} className="px-4 py-1 text-right text-xs text-blue-600">ส่วนลดรวม</td>
                                      <td className="px-4 py-1 text-right text-xs tabular-nums text-blue-600">−฿{formatCurrency(discountAmt)}</td>
                                    </tr>
                                  )}
                                  {surchargeAmt > 0 && (
                                    <tr>
                                      <td colSpan={4} className="px-4 py-1 text-right text-xs text-amber-600">ส่วนเพิ่ม</td>
                                      <td className="px-4 py-1 text-right text-xs tabular-nums text-amber-600">+฿{formatCurrency(surchargeAmt)}</td>
                                    </tr>
                                  )}
                                </tfoot>
                              )}
                            </Table>
                          </div>

                          {/* Footer total */}
                          <div className="shrink-0 border-t-2 border-slate-200 bg-slate-50 px-5 py-3 flex justify-between items-center">
                            <div className="text-sm text-slate-500">{receiptItems.length} รายการ</div>
                            <div className="font-extrabold text-blue-700 tabular-nums text-lg">
                              ฿{formatCurrency(rawTotal - discountAmt + surchargeAmt)}
                            </div>
                          </div>
                        </>
                      )
                    })() : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 gap-3">
                        <FileText className="w-12 h-12 opacity-20" />
                        <div className="text-sm">เลือกใบรับสินค้าเพื่อดูรายละเอียด</div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )
          })()}{/* end history tab */}

        </div>{/* end white content panel */}
      </div>{/* end tab area */}

      {/* ── Edit-bill (header) modal ── */}
      <Dialog open={showEditModal} onOpenChange={(o) => { if (!editSaving) setShowEditModal(o) }}>
        <DialogContent className="max-w-lg">
          <DialogBody>
            <div className="space-y-3">
              <div>
                <div className="font-bold text-slate-800">แก้ไขรายละเอียดบิล</div>
                <div className="text-xs text-slate-500 mt-0.5">{receiptInvoice}</div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">ผู้จำหน่าย <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 pr-7 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editSupplierId}
                    onChange={e => setEditSupplierId(Number(e.target.value))}
                  >
                    <option value={0}>— เลือกผู้จำหน่าย —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">เลขที่ใบกำกับสินค้า <span className="text-red-500">*</span></label>
                <Input
                  value={editSupplierInvoiceNo}
                  onChange={e => setEditSupplierInvoiceNo(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">วันที่สั่งซื้อตามบิล</label>
                  <DateInput value={editOrderDate} onChange={setEditOrderDate} className="w-full h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">วันที่รับสินค้า <span className="text-red-500">*</span></label>
                  <DateInput value={editReceiveDate} onChange={setEditReceiveDate} className="w-full h-9 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">ประเภทการชำระเงิน</label>
                <div className="flex gap-2">
                  {(['cash', 'credit'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditPaymentType(v)}
                      className={`flex-1 h-9 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                        editPaymentType === v
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {v === 'cash' ? <><Banknote className="w-3.5 h-3.5" /> เงินสด</> : <><CreditCard className="w-3.5 h-3.5" /> เครดิต</>}
                    </button>
                  ))}
                </div>
              </div>

              {editPaymentType === 'credit' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">วันครบกำหนดชำระ <span className="text-red-500">*</span></label>
                    <DateInput value={editDueDate} onChange={setEditDueDate} className="w-full h-9 text-sm" />
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <Checkbox
                      id="edit-is-paid"
                      checked={editIsPaid}
                      onCheckedChange={(v) => setEditIsPaid(!!v)}
                    />
                    <label htmlFor="edit-is-paid" className="text-xs font-semibold text-slate-600 cursor-pointer">ชำระแล้ว</label>
                  </div>
                  {editIsPaid && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">วันที่ชำระ</label>
                      <DateInput value={editPaidDate} onChange={setEditPaidDate} className="w-full h-9 text-sm" />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowEditModal(false)} disabled={editSaving}>ปิด</Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </Button>
              </div>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ── Cancel-bill confirm dialog ── */}
      <Dialog open={showCancelModal} onOpenChange={(o) => { if (!cancelling) setShowCancelModal(o) }}>
        <DialogContent className="max-w-md">
          <DialogBody>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800">ยกเลิกบิลรับสินค้า</div>
                  <div className="text-xs text-slate-500 mt-0.5">{receiptInvoice}</div>
                </div>
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">
                การยกเลิกจะคืนสต็อกที่รับเข้ามาของบิลนี้ออกจากคลัง และไม่สามารถย้อนกลับได้ หากสินค้าบางส่วนถูกขายไปแล้ว ระบบจะไม่อนุญาตให้ยกเลิก
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">เหตุผล <span className="text-red-500">*</span></label>
                <Textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="ระบุเหตุผลในการยกเลิก..."
                  className="text-sm"
                  autoFocus
                />
              </div>
              {cancelBlockers.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                  <div className="text-xs font-semibold text-red-700 mb-1.5">สินค้าต่อไปนี้ถูกขายไปแล้ว ไม่สามารถยกเลิกบิลได้:</div>
                  <ul className="text-xs text-red-700 space-y-0.5 list-disc pl-4">
                    {cancelBlockers.map((b, i) => (
                      <li key={i}>
                        <span className="font-medium">{b.trade_name}</span>
                        <span className="text-red-500"> · Lot {b.lot_number}</span>
                        <span className="text-red-500"> · ต้องคืน {b.need} แต่เหลือเพียง {b.have}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowCancelModal(false)} disabled={cancelling}>ปิด</Button>
                <Button
                  size="sm"
                  onClick={handleCancelBill}
                  disabled={cancelling || !cancelReason.trim()}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  {cancelling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
                </Button>
              </div>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ── Supplier modal ── */}
      {showSupplierModal && (
        <InlineModal
          title="เลือกผู้จัดจำหน่าย"
          onClose={closeSupplierModal}
          onConfirm={() => { if (filteredSuppliers[supplierHighlight]) selectSupplier(filteredSuppliers[supplierHighlight]) }}
          maxWidth="max-w-md"
          footer={
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <Button variant="outline" onClick={closeSupplierModal}>ปิด</Button>
            </div>
          }
        >
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input autoFocus value={supplierQuery} onChange={e => setSupplierQuery(e.target.value)} placeholder="ชื่อหรือรหัสผู้จัดจำหน่าย..." className="pl-9 h-10" />
            </div>
            <div className="h-72 overflow-y-auto space-y-1">
              {filteredSuppliers.length === 0 ? (
                <div className="text-sm text-center text-slate-400 py-6">ไม่พบผู้จัดจำหน่าย</div>
              ) : filteredSuppliers.map((s, si) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectSupplier(s)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors border ${
                    s.id === supplierId
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : si === supplierHighlight
                      ? 'bg-slate-50 border-slate-200'
                      : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <Building2 className={`h-4 w-4 shrink-0 ${s.id === supplierId ? 'text-blue-500' : 'text-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{s.name}</div>
                    {s.code && <div className="text-xs text-slate-400 ">{s.code}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </InlineModal>
      )}

      {/* ── Unit swap modal ── */}
      {unitModalIdx !== null && (() => {
        const row = rows[unitModalIdx]
        if (!row) return null
        return (
          <InlineModal
            title={`เลือกหน่วย — ${row.trade_name || '-'}`}
            onClose={() => setUnitModalIdx(null)}
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
                <Button variant="outline" onClick={() => setUnitModalIdx(null)}>ปิด</Button>
              </div>
            }
          >
            <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
              {row.units.length === 0 ? (
                <div className="text-sm text-center text-slate-400 py-6">ไม่มีหน่วยให้เลือก</div>
              ) : row.units.map(u => {
                const active = row.unit_name === u.unit_name
                return (
                  <button
                    key={u.id}
                    onClick={() => changeRowUnit(unitModalIdx, u)}
                    className={`w-full px-4 py-3 rounded-xl text-left transition-colors border ${active ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold' : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-blue-300'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{u.unit_name}</span>
                      {u.is_base_unit && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">หลัก</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </InlineModal>
        )
      })()}

      {/* ── Sell-price quick-edit modal ── */}
      {priceModalIdx !== null && (() => {
        const row = rows[priceModalIdx]
        if (!row) return null
        const qtyNum = parseFloat(row.qty) || 0
        const totalNum = parseFloat(row.total) || 0
        const typedCost = parseFloat(row.cost_price)
        const cost = isFinite(typedCost) && typedCost > 0
          ? typedCost
          : (qtyNum > 0 ? totalNum / qtyNum : 0)
        const newPrice = parseFloat(priceDraft) || 0
        const profit = newPrice - cost
        const margin = cost > 0 ? (profit / cost) * 100 : 0
        const fmtDate = (s: string) => {
          const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/)
          return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : (s ?? '')
        }
        return (
          <InlineModal
            title={`แก้ไขราคาขาย — ${row.trade_name || '-'}`}
            onClose={closePriceModal}
            onConfirm={savePriceModal}
            maxWidth="max-w-md"
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
                <Button variant="outline" disabled={priceSaving} onClick={closePriceModal}>ยกเลิก</Button>
                <Button disabled={priceSaving || !priceDraft} onClick={savePriceModal}>
                  {priceSaving ? 'กำลังบันทึก…' : 'บันทึกราคา'}
                </Button>
              </div>
            }
          >
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">ราคาขายใหม่ (ต่อ {row.unit_name || 'ชิ้น'})</label>
                <Input
                  autoFocus
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceDraft}
                  onChange={e => setPriceDraft(e.target.value)}
                  className="h-10 text-right tabular-nums text-base"
                />
              </div>

              {prevCost !== null && Math.abs(prevCost - cost) > 0.0001 ? (() => {
                const prevProfit = newPrice - prevCost
                const prevMargin = prevCost > 0 ? (prevProfit / prevCost) * 100 : 0
                return (
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">ทุนเดิม</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-2">
                          <div className="text-xs text-slate-400">ทุน/หน่วย</div>
                          <div className="text-sm font-semibold text-slate-500 tabular-nums">฿{formatCurrency(prevCost)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-2">
                          <div className="text-xs text-slate-400">กำไร/หน่วย</div>
                          <div className={`text-sm font-semibold tabular-nums ${prevProfit >= 0 ? 'text-slate-500' : 'text-red-400'}`}>฿{formatCurrency(prevProfit)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-2">
                          <div className="text-xs text-slate-400">มาร์จิ้น</div>
                          <div className={`text-sm font-semibold tabular-nums ${prevMargin >= 0 ? 'text-slate-500' : 'text-red-400'}`}>{prevMargin.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">ทุนใหม่</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-2">
                          <div className="text-xs text-slate-400">ทุน/หน่วย</div>
                          <div className="text-sm font-semibold text-slate-700 tabular-nums">฿{formatCurrency(cost)}</div>
                        </div>
                        <div className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-2">
                          <div className="text-xs text-blue-600">กำไร/หน่วย</div>
                          <div className={`text-sm font-semibold tabular-nums ${profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>฿{formatCurrency(profit)}</div>
                        </div>
                        <div className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-2">
                          <div className="text-xs text-blue-600">มาร์จิ้น</div>
                          <div className={`text-sm font-semibold tabular-nums ${margin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{margin.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })() : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-2">
                    <div className="text-xs text-slate-400">ทุน/หน่วย</div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums">฿{formatCurrency(cost)}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-2">
                    <div className="text-xs text-blue-600">กำไร/หน่วย</div>
                    <div className={`text-sm font-semibold tabular-nums ${profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>฿{formatCurrency(profit)}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-2">
                    <div className="text-xs text-blue-600">มาร์จิ้น</div>
                    <div className={`text-sm font-semibold tabular-nums ${margin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{margin.toFixed(1)}%</div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">หมายเหตุ</label>
                <Input
                  value={priceNote}
                  onChange={e => setPriceNote(e.target.value)}
                  placeholder="เหตุผลการแก้ไขราคา..."
                  className="h-9 text-sm"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1.5">ประวัติการแก้ไขล่าสุด</div>
                <div className="rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                  {priceHistory.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-3">ยังไม่มีประวัติ</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500">
                          <th className="px-2 py-1 text-left font-medium">วันที่</th>
                          <th className="px-2 py-1 text-right font-medium">เดิม</th>
                          <th className="px-2 py-1 text-right font-medium">ใหม่</th>
                          <th className="px-2 py-1 text-left font-medium">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceHistory.map(h => (
                          <tr key={h.id} className="border-t border-slate-100">
                            <td className="px-2 py-1 text-slate-600 tabular-nums">{fmtDate(h.created_at)}</td>
                            <td className="px-2 py-1 text-right text-slate-500 tabular-nums">฿{formatCurrency(h.old_price)}</td>
                            <td className="px-2 py-1 text-right text-slate-700 font-semibold tabular-nums">฿{formatCurrency(h.new_price)}</td>
                            <td className="px-2 py-1 text-slate-500 truncate max-w-[120px]">{h.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </InlineModal>
        )
      })()}

      {/* ── Bill adjustment modal ── */}
      {showBillAdjust && (() => {
        const isDisc = billAdjustTab === 'discount'
        // baht ↔ pct are two views of the same value; calcNet uses baht only
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
          <InlineModal
            title="ปรับยอดท้ายบิล"
            onClose={closeBillAdjust}
            onConfirm={applyBillAdjust}
            maxWidth="max-w-sm"
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeBillAdjust}>ยกเลิก</Button>
                <Button className="flex-1 bg-blue-500 hover:bg-blue-600" onClick={applyBillAdjust}>ตกลง</Button>
              </div>
            }
          >
            <div className="flex flex-col">
              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setBillAdjustTab('discount')}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${isDisc ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  ส่วนลด
                </button>
                <button
                  type="button"
                  onClick={() => setBillAdjustTab('surcharge')}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${!isDisc ? 'border-b-2 border-amber-500 text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  ส่วนเพิ่ม
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Quick percent buttons */}
                <div className="flex gap-1.5">
                  {PCTS.map(p => {
                    const active = isDisc ? billDiscountPct === p : billSurchargePct === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          const newPct = active ? '' : p
                          const newBaht = pctToBaht(newPct)
                          if (isDisc) { setBillDiscountPct(newPct); setBillDiscountBaht(newBaht); setBillNetInput(calcNet(newBaht, billSurchargeBaht)) }
                          else { setBillSurchargePct(newPct); setBillSurchargeBaht(newBaht); setBillNetInput(calcNet(billDiscountBaht, newBaht)) }
                        }}
                        className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors ${active
                          ? isDisc ? 'bg-blue-500 border-blue-500 text-white' : 'bg-amber-500 border-amber-500 text-white'
                          : 'border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50'}`}
                      >
                        {p}%
                      </button>
                    )
                  })}
                </div>

                {/* Inputs: baht + percent side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">จำนวนเงิน (บาท)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">฿</span>
                      <Input
                        autoFocus
                        type="number"
                        min={0}
                        step="0.01"
                        value={isDisc ? billDiscountBaht : billSurchargeBaht}
                        onChange={e => {
                          const newBaht = e.target.value
                          if (isDisc) { setBillDiscountBaht(newBaht); setBillDiscountPct(bahtToPct(newBaht)); setBillNetInput(calcNet(newBaht, billSurchargeBaht)) }
                          else { setBillSurchargeBaht(newBaht); setBillSurchargePct(bahtToPct(newBaht)); setBillNetInput(calcNet(billDiscountBaht, newBaht)) }
                        }}
                        placeholder="0.00"
                        className="h-10 text-sm text-right pl-6"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">เปอร์เซ็นต์ (%)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={isDisc ? billDiscountPct : billSurchargePct}
                        onChange={e => {
                          const newPct = e.target.value
                          const newBaht = pctToBaht(newPct)
                          if (isDisc) { setBillDiscountPct(newPct); setBillDiscountBaht(newBaht); setBillNetInput(calcNet(newBaht, billSurchargeBaht)) }
                          else { setBillSurchargePct(newPct); setBillSurchargeBaht(newBaht); setBillNetInput(calcNet(billDiscountBaht, newBaht)) }
                        }}
                        placeholder="0.00"
                        className="h-10 text-sm text-right pr-7"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                  </div>
                </div>

                {/* Total preview */}
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>ยอดรวมเดิม</span>
                    <span className="tabular-nums">฿{formatCurrency(adjustModalSum)}</span>
                  </div>
                  {previewDisc > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>ส่วนลด</span>
                      <span className="tabular-nums">−฿{formatCurrency(previewDisc)}</span>
                    </div>
                  )}
                  {previewSur > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>ส่วนเพิ่ม</span>
                      <span className="tabular-nums">+฿{formatCurrency(previewSur)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1.5 mt-1">
                    <span>ยอดสุทธิ</span>
                    <div className="relative w-36">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">฿</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={billNetInput}
                        onChange={e => handleNetChange(e.target.value)}
                        onBlur={() => setBillNetInput(calcNet(billDiscountBaht, billSurchargeBaht))}
                        className="h-9 text-sm font-semibold text-right pl-6 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </InlineModal>
        )
      })()}

      {/* ── Import paste modal ── */}
      {showImport && (
        <InlineModal
          title="นำเข้าข้อมูลจากตาราง (วาง / Paste)"
          onClose={() => { if (!importing) { setShowImport(false); setImportText('') } }}
          onConfirm={() => { if (!importing && importText.trim()) handleImport() }}
          maxWidth="max-w-2xl"
          footer={
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="outline" disabled={importing} onClick={() => { setShowImport(false); setImportText('') }}>ยกเลิก</Button>
              <Button disabled={importing || !importText.trim() || !importColumns.includes('key')} onClick={handleImport}>
                {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
              </Button>
            </div>
          }
        >
          <div className="p-4 space-y-3">
            {/* Column mapper */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-slate-500">จัดลำดับคอลัมน์ (ตรงกับตารางที่วาง)</div>
                {!importColumns.includes('key') && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> ต้องมีคอลัมน์ Barcode / ชื่อ
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {importColumns.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-0.5">
                    <div className="text-xs text-slate-400 text-center">Col {ci + 1}</div>
                    <select
                      value={col}
                      onChange={e => {
                        const next = [...importColumns]
                        next[ci] = e.target.value
                        setImportColumns(next)
                      }}
                      className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {IMPORT_FIELD_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  <div className="text-xs text-transparent select-none">.</div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setImportColumns(c => [...c, 'skip'])}
                      className="h-7 w-7 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center font-bold"
                    >+</button>
                    {importColumns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setImportColumns(c => c.slice(0, -1))}
                        className="h-7 w-7 rounded border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-500 flex items-center justify-center font-bold"
                      >−</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              คัดลอกตารางจาก Excel / Sheets แล้ววางที่นี่ · บรรทัดแรกถ้าเป็นหัวตารางจะถูกข้ามอัตโนมัติ · วันที่รูปแบบ dd/mm/yyyy
            </div>
            <Textarea
              autoFocus
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'CETRIZIN\t200\t41128\t04/11/2028\t04/11/2028\t1,020.00'}
              className=" text-xs h-40"
            />
          </div>
        </InlineModal>
      )}


      {/* ── Success dialog ── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent size="sm">
          <DialogBody className="text-center py-8 space-y-4">
            <div className="text-6xl">✅</div>
            <div>
              <div className="text-lg font-semibold">บันทึกสำเร็จ</div>
              <div className="text-muted-foreground text-sm mt-1 ">{savedInvoice}</div>
            </div>
            <Button onClick={() => setShowSuccess(false)} className="w-full bg-blue-500 hover:bg-blue-600">
              เสร็จสิ้น
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

    </div>
  )
}
