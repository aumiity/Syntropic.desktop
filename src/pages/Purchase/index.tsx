import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { UnitPickerDialog } from '@/components/ui/unit-picker-dialog'
import { DiscountDialog } from '@/components/ui/discount-dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TintIcon } from '@/components/ui/tint-icon'
import { formatCurrency, formatDate, toIntegerInput } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Supplier, NegativeStockAlert } from '@/types'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useGRDraftStore } from '@/stores/grDraftStore'
import { useShopVat } from '@/hooks/useShopVat'
import { extractVat } from '@/lib/vat'
import {
  Plus, Trash2, Package, Pencil,
  Building2, Banknote, CreditCard, FileText, ClipboardPaste, AlertTriangle,
  Check, Minus, Info, Receipt,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { motion } from 'framer-motion'
import { AddProductWizard, buildSellUnits, type ReceiptRow, type ProductUnitOption, emptyRow } from './AddProductWizard'

// ── Types (ReceiptRow / ProductUnitOption / emptyRow are imported from ./AddProductWizard) ──

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

interface ProductSuggestion {
  id: number
  trade_name: string
  code?: string
  unit_name?: string
  price_retail?: number
  price_wholesale1?: number
  price_wholesale2?: number
  cost_price?: number
  // last paid cost (pricing ref) — pos:searchProducts returns it via SELECT p.*
  last_cost_price?: number
  units?: ProductUnitOption[]
  // Receivable variants = every enabled unit — see enrichProduct.
  purchase_units?: ProductUnitOption[]
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
  const { vatEnabled: shopVatEnabled, vatRate: shopVatRate } = useShopVat()
  const today = new Date().toISOString().slice(0, 10)

  // GR draft persisted across navigation (see grDraftStore). Captured ONCE so
  // every useState below can lazy-init from it; restoring an in-progress receive
  // when the operator returns from the sales screen. `setDraft` is stable.
  const initialDraft = useRef(useGRDraftStore.getState().draft).current
  const setDraft = useGRDraftStore((s) => s.setDraft)
  const clearDraft = useGRDraftStore((s) => s.clearDraft)

  // Form
  const [invoiceNo, setInvoiceNo] = useState(() => initialDraft?.invoiceNo ?? '')
  const [supplierId, setSupplierId] = useState<number>(() => initialDraft?.supplierId ?? 0)
  const [supplierName, setSupplierName] = useState(() => initialDraft?.supplierName ?? '')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(() => initialDraft?.supplierInvoiceNo ?? '')
  const [orderDate, setOrderDate] = useState(() => initialDraft?.orderDate ?? today)
  const [receiveDate, setReceiveDate] = useState(() => initialDraft?.receiveDate ?? today)
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>(() => initialDraft?.paymentType ?? 'cash')
  const [dueDate, setDueDate] = useState(() => initialDraft?.dueDate ?? '')
  // Input VAT (ภาษีซื้อ) — per bill: some suppliers aren't VAT-registered.
  // Only offered when the shop itself is VAT-registered (useShopVat below);
  // the backend re-guards and forces 'none' for NO-VAT shops.
  const [vatMode, setVatMode] = useState<'none' | 'inclusive'>(() => initialDraft?.vatMode ?? 'none')
  const [isPaid, setIsPaid] = useState(() => initialDraft?.isPaid ?? false)
  const [paidDate, setPaidDate] = useState(() => initialDraft?.paidDate ?? '')
  const [grNote, setGrNote] = useState(() => initialDraft?.grNote ?? '')
  // Legacy drafts carried a separate bill_discount field. Fold it into the single
  // row.discount on hydrate (total already net → no double-subtract). MUST be here
  // in the lazy initializer, never a post-mount effect — else the persist effect
  // would overwrite before the fold and the old bill_discount would be lost.
  const [rows, setRows] = useState<ReceiptRow[]>(() =>
    (initialDraft?.rows ?? []).map(r => {
      const merged = (parseFloat(r.discount) || 0) + (parseFloat((r as any).bill_discount ?? '0') || 0)
      return { ...r, discount: merged > 0 ? merged.toFixed(2) : '' }
    }),
  )
  const [saving, setSaving] = useState(false)
  // Per-field red-border flags for required date fields. Set on a failed save,
  // cleared as soon as that field changes — so a forgotten/blank date lights up
  // (DateInput's internal red border only fires for non-empty invalid text).
  const [dateErrors, setDateErrors] = useState({ order: false, receive: false, due: false, paid: false })

  // Add/Edit product wizard (replaces the old per-row inline table editing)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  // ส่วนลดรายตัว แก้ในตาราง: index แถวที่เปิด DiscountDialog อยู่ (null = ปิด)
  const [discountIdx, setDiscountIdx] = useState<number | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [savedInvoice, setSavedInvoice] = useState('')

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Product search per row. searchQueries persists with the draft; suggestions
  // and timers are ephemeral — re-seeded empty to match the hydrated row count.
  const [searchQueries, setSearchQueries] = useState<string[]>(() => initialDraft?.searchQueries ?? [])
  const [suggestions, setSuggestions] = useState<ProductSuggestion[][]>(() => (initialDraft?.rows ?? []).map(() => []))
  const [activeSuggRow, setActiveSuggRow] = useState<number | null>(null)
  const [suggHighlight, setSuggHighlight] = useState(0)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const searchTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>((initialDraft?.rows ?? []).map(() => null))

  // Tracks which numeric cell is focused — focused cell shows raw "1234.56", others show "1,234.56"
  const [focusedCell, setFocusedCell] = useState<string | null>(null)

  // Unit swap modal (per row)
  const [unitModalIdx, setUnitModalIdx] = useState<number | null>(null)

  // "รวมส่วนลดในต้นทุน" = ยุบส่วนลดรายตัวเข้าไปใน cost_price จริง (ทุน/หน่วย = ทุนสุทธิ),
  // แล้วล้างช่องส่วนลด — ทางเดียว ย้อนกลับไม่ได้ (mirror "เพิ่มต้นทุน"). มี confirm ก่อนทำ
  const [showMergeConfirm, setShowMergeConfirm] = useState(false)

  // Bulk import modal
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importColumns, setImportColumns] = useState<string[]>(['key', 'qty', 'lot', 'mfg', 'exp', 'total'])

  // ส่วนลดท้ายบิล modal (ลดอย่างเดียว — reversible) — ใช้ DiscountDialog ร่วม
  const [showBillAdjust, setShowBillAdjust] = useState(false)
  // เพิ่มต้นทุน (ส่วนเพิ่มท้ายบิล) modal — รวมเข้าต้นทุนทันที ทางเดียว ย้อนกลับไม่ได้
  const [showSurcharge, setShowSurcharge] = useState(false)
  const [surchargeBaht, setSurchargeBaht] = useState('')
  const [surchargePct, setSurchargePct]   = useState('')
  // ต้นทุนรวมใหม่ (แก้ได้ → คำนวณส่วนเพิ่มย้อนกลับ) — mirror ช่องยอดสุทธิใน DiscountDialog
  const [surTotalInput, setSurTotalInput] = useState('')
  // ช่องที่กำลังโฟกัสใน modal เพิ่มต้นทุน — โชว์ค่าดิบตอนพิมพ์ คั่นจุลภาคตอน blur (mirror DiscountDialog)
  const [surFocus, setSurFocus] = useState<'baht' | 'pct' | 'total' | null>(null)

  useEffect(() => {
    // Keep the draft's GR number when restoring a receive with line items;
    // otherwise (fresh form / empty draft) fetch the latest next number.
    if (!initialDraft || initialDraft.rows.length === 0) loadNextGR()
    loadSuppliers()
  }, [])

  // VAT-registered shops default a fresh bill to "มีภาษีมูลค่าเพิ่ม" (inclusive).
  // shopVatEnabled loads async, so apply once it resolves — but only on a fresh
  // form (no restored draft) and only while still untouched ('none'), so the
  // operator's explicit uncheck or a restored draft is never overwritten.
  const vatDefaultApplied = useRef(false)
  useEffect(() => {
    if (vatDefaultApplied.current || !shopVatEnabled) return
    vatDefaultApplied.current = true
    if (!initialDraft || initialDraft.rows.length === 0) {
      setVatMode(m => m === 'none' ? 'inclusive' : m)
    }
  }, [shopVatEnabled])

  // Persist the draft on every change so it survives navigation and the Sidebar
  // badge stays live. Ephemeral UI state is intentionally excluded.
  useEffect(() => {
    setDraft({
      invoiceNo, supplierId, supplierName, supplierInvoiceNo,
      orderDate, receiveDate, paymentType, dueDate, vatMode,
      isPaid, paidDate, grNote, rows, searchQueries,
    })
  }, [
    invoiceNo, supplierId, supplierName, supplierInvoiceNo,
    orderDate, receiveDate, paymentType, dueDate, vatMode,
    isPaid, paidDate, grNote, rows, searchQueries,
    setDraft,
  ])

  const loadNextGR = async () => {
    const no = await window.api.purchase.nextGRNumber()
    setInvoiceNo(no as string)
  }

  const loadSuppliers = async () => {
    const data = await window.api.people.allSuppliers()
    setSuppliers(data as Supplier[])
  }

  // ── Row management ────────────────────────────────────────────────────────

  const addRow = useCallback(() => {
    setRows(r => [...r, emptyRow()])
    setSearchQueries(q => [...q, ''])
    setSuggestions(s => [...s, []])
    searchTimers.current.push(null)
  }, [])

  const removeRow = (i: number) => {
    if (rows.length === 1) return
    setRows(r => r.filter((_, idx) => idx !== i))
    setSearchQueries(q => q.filter((_, idx) => idx !== i))
    setSuggestions(s => s.filter((_, idx) => idx !== i))
    searchTimers.current = searchTimers.current.filter((_, idx) => idx !== i)
  }

  // ── Add/Edit product wizard ────────────────────────────────────────────────

  const openAddWizard = () => { setEditIdx(null); setWizardOpen(true) }
  const openEditWizard = (i: number) => { setEditIdx(i); setWizardOpen(true) }

  // Wizard returns a fully-built ReceiptRow. Keep the parallel search/suggestion
  // arrays length-aligned with `rows` so the paste-import bookkeeping stays valid.
  const handleWizardConfirm = (row: ReceiptRow, opts?: { addNext?: boolean }) => {
    if (editIdx === null) {
      setRows(r => [...r, row])
      setSearchQueries(q => [...q, row.trade_name])
      setSuggestions(s => [...s, []])
      searchTimers.current.push(null)
    } else {
      const at = editIdx
      setRows(r => r.map((x, idx) => idx === at ? row : x))
      setSearchQueries(q => q.map((x, idx) => idx === at ? row.trade_name : x))
    }
    // addNext = บันทึก & เพิ่มถัดไป → คง wizard เปิดไว้ (wizard รีเซ็ตเองรับสินค้าตัวต่อไป)
    if (!opts?.addNext) setWizardOpen(false)
    setEditIdx(null)
  }

  // Delete a committed row (no minimum-row guard — the list can be empty).
  const deleteRow = (i: number) => {
    setRows(r => r.filter((_, idx) => idx !== i))
    setSearchQueries(q => q.filter((_, idx) => idx !== i))
    setSuggestions(s => s.filter((_, idx) => idx !== i))
    searchTimers.current = searchTimers.current.filter((_, idx) => idx !== i)
  }

  const updateRow = (i: number, field: keyof ReceiptRow, value: string | number) => {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  // total = qty * cost_price − discount. Editing any field auto-fills dependents.
  const updateLineMath = (i: number, field: 'qty' | 'cost_price' | 'discount' | 'total', value: string) => {
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

  // ช่อง "ส่วนลด" ในตาราง = row.discount ก้อนเดียวต่อแถว. modal seed/apply จาก row.discount
  // ตรง ๆ และกระทบเฉพาะแถวนั้น — กดล้าง = 0 จริง. total = qty*cost − discount.
  const applyLineDiscount = (i: number, discount: number) => {
    setRows(rs => rs.map((row, idx) => {
      if (idx !== i) return row
      const qty = parseFloat(row.qty)
      const cost = parseFloat(row.cost_price)
      const gross = qty > 0 && isFinite(cost) ? qty * cost : 0
      const cappedDiscount = Math.min(Math.max(discount || 0, 0), gross)
      const next: ReceiptRow = {
        ...row,
        discount: cappedDiscount > 0 ? cappedDiscount.toFixed(2) : '',
      }
      if (gross > 0) next.total = Math.max(gross - cappedDiscount, 0).toFixed(2)
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
    const incoming = p.purchase_units ?? p.units ?? []
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
    const incoming = p.purchase_units ?? p.units ?? []
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
      stored_last_cost: p.last_cost_price,
      sell_units: buildSellUnits(p),
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
        const qtyClean = toIntegerInput(pick('qty'))   // จำนวนรับเข้าเป็นจำนวนเต็มเท่านั้น
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

  // ── Supplier selection (Combobox) ─────────────────────────────────────────

  // Currently-selected supplier objects, derived from the id state the rest of
  // the page reads. The Combobox itself owns search/highlight/keyboard.
  const receiveSupplier = suppliers.find(s => s.id === supplierId) ?? null

  // ── Totals ────────────────────────────────────────────────────────────────

  // expiry_optional = ล็อตเดิมที่ตั้งใจไม่มีวันหมดอายุ (merge) → ถือว่าครบ ส่งเข้า backend ได้
  const validRows = rows.filter(r => r.product_id && r.lot_number && (r.expiry_date || r.expiry_optional) && parseFloat(r.qty) > 0)
  const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0)
  // ส่วนลดรวมทุกบรรทัด = ส่วนลดรายตัว (discount) ก้อนเดียว — ส่วนลดท้ายบิลกระจายลง discount แล้ว
  // → โชว์ในคอลัมน์ส่วนลด + footer; ใช้เป็น discount_amount ตอนบันทึก
  const lineDiscountTotal = rows.reduce((sum, r) => sum + (parseFloat(r.discount) || 0), 0)
  // ฐานกระจายส่วนเพิ่ม = มูลค่าต้นทุนรวม (qty × cost_price ปัจจุบัน)
  const surchargeBase = rows.reduce((sum, r) => sum + (parseFloat(r.qty) || 0) * (parseFloat(r.cost_price) || 0), 0)
  // ราคารวมก่อนหักส่วนลด (ทุนเต็ม รวมส่วนเพิ่มที่ฝังในทุนแล้ว): total = qty*cost − ส่วนลด → gross = net + ส่วนลด
  const grossSubtotal = totalCost + lineDiscountTotal
  // มีบรรทัดสรุปส่วนลดไหม — ใช้คุมทั้งเส้นแบ่งและบล็อกสรุป
  const hasSummaryBreakdown = lineDiscountTotal > 0

  // VAT preview — inclusive: backed out of the line sum (grand total unchanged).
  // Mirrors purchase:save. (โหมด exclusive/ไม่รวมในบิล เลิกใช้แล้ว → บิลที่มี VAT = inclusive เสมอ)
  const billVat = vatMode === 'inclusive' ? extractVat(totalCost, shopVatRate) : 0
  const grandTotal = totalCost

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
    // ด่านกั้น: ห้ามบันทึกถ้ายังมีรายการกรอกไม่ครบ (partial) — ไม่งั้น validRows.map จะตัดทิ้งเงียบ ๆ
    // ทำให้บิลบันทึกผ่านโดยรายการค้างหายไป. ระบุชัดว่าแถวไหนขาดช่องอะไร (partial มาจากทาง paste/import)
    const partials = rows.map((r, i) => ({ r, i })).filter(({ r }) => rowIsPartial(r))
    if (partials.length > 0) {
      const missingFields = (r: ReceiptRow): string[] => {
        const m: string[] = []
        if (!r.product_id) m.push('สินค้า')
        if (!r.lot_number.trim()) m.push('เลขล็อต')
        if (!(r.expiry_date || r.expiry_optional)) m.push('วันหมดอายุ')
        if (!(parseFloat(r.qty) > 0)) m.push('จำนวน')
        if (!(parseFloat(r.total) > 0)) m.push('ยอดรวม')
        return m
      }
      const detail = partials.slice(0, 3).map(({ r, i }) =>
        `แถวที่ ${i + 1}${r.trade_name ? ` (${r.trade_name})` : ''}: ขาด ${missingFields(r).join(', ')}`,
      ).join(' · ')
      const extra = partials.length > 3 ? ` และอีก ${partials.length - 3} รายการ` : ''
      toast(`มีรายการกรอกไม่ครบ — ${detail}${extra}`, 'error')
      return
    }
    // วันที่ของบิลเป็น required. ถ้าเลขมั่ว/พิมพ์ตกตัว/ลืมกรอก DateInput จะคืน '' (ดู
    // date-input.tsx) → ดักที่นี่ ไม่งั้นส่งวันที่ว่างไป backend แบบเงียบ ๆ. เก็บทุกช่องที่
    // ขาดพร้อมกัน → ติดกรอบแดงทุกช่อง (prop `error`) + toast ระบุชื่อช่องชัด ๆ (กรณีลืม
    // กรอก ช่องว่างไม่มีกรอบแดงในตัวเอง จึงต้องสั่งจาก parent). วันที่ชำระ required เฉพาะ
    // เมื่อติ๊ก "ชำระแล้ว"; วันครบกำหนด required เฉพาะจ่ายเครดิต.
    const errs = {
      order: !orderDate,
      receive: !receiveDate,
      due: paymentType === 'credit' && !dueDate,
      paid: isPaid && !paidDate,
    }
    setDateErrors(errs)
    const missing: string[] = []
    if (errs.order) missing.push('วันที่สั่งซื้อตามบิล')
    if (errs.receive) missing.push('วันที่รับสินค้า')
    if (errs.due) missing.push('วันครบกำหนด')
    if (errs.paid) missing.push('วันที่ชำระ')
    if (missing.length > 0) { toast(`กรุณาระบุ${missing.join(' · ')}ให้ถูกต้อง`, 'error'); return }
    setSaving(true)
    try {
      const saveResult = await window.api.purchase.save({
        invoice_no: invoiceNo, supplier_id: supplierId, supplier_invoice_no: supplierInvoiceNo,
        receive_date: receiveDate, order_date: orderDate || undefined, payment_type: paymentType,
        due_date: dueDate || undefined, is_paid: isPaid, paid_date: paidDate || undefined,
        note: grNote || undefined,
        discount_amount: lineDiscountTotal || undefined,
        vat_mode: vatMode,
        vat_rate: shopVatRate,
        userId: getCurrentUserId(),
        items: validRows.map(r => {
          const qtyNum = parseFloat(r.qty) || 0
          const totalNum = parseFloat(r.total) || 0
          // Use total/qty as effective cost so any per-line discount is baked in
          const costPerUnit = qtyNum > 0 ? totalNum / qtyNum : 0
          // Pass the entered receiving unit + its base factor; backend converts
          // to base for stock/cost. Fallback 1 (base), never 0 (blank→0 ban).
          const su = r.units?.find(u => u.unit_name === r.unit_name)
          const qpb = su?.qty_per_base ?? 1
          return {
            product_id: r.product_id, lot_number: r.lot_number,
            manufactured_date: r.manufactured_date || undefined, expiry_date: r.expiry_date,
            cost_price: costPerUnit, sell_price: r.default_sell_price || 0,
            qty: qtyNum, note: r.note || undefined,
            unit_name: r.unit_name, qty_per_base: qpb,
          }
        }),
      }) as { success: boolean; invoice_no: string; negative_stock_alerts?: NegativeStockAlert[] }

      // Flag any products that now have outstanding negative-stock markers
      // waiting to be reconciled. Badge refresh fires unconditionally so the
      // sidebar stays accurate even when the alert array is empty.
      const alerts = saveResult?.negative_stock_alerts ?? []
      if (alerts.length > 0) {
        const head = alerts[0].trade_name
        const more = alerts.length > 1 ? ` (+${alerts.length - 1})` : ''
        toast(
          `สินค้า ${head}${more} มีสต็อคติดลบกรุณาตัดจ่ายย้อนหลัง — กดเมนู "การจัดการ" เพื่อตรวจสอบ`,
          'info',
          10000,
        )
      }
      useNegativeStockBadge.getState().refresh()

      setSavedInvoice(invoiceNo)
      setShowSuccess(true)
      await loadNextGR()
      setSupplierId(0); setSupplierName(''); setSupplierInvoiceNo('')
      setOrderDate(today); setReceiveDate(today); setPaymentType('cash'); setDueDate('')
      setIsPaid(false); setPaidDate(''); setGrNote(''); setVatMode(shopVatEnabled ? 'inclusive' : 'none')
      setRows([]); setSearchQueries([]); setSuggestions([])
      clearDraft()
    } catch (e: any) {
      toast(e?.message ? `บันทึกไม่สำเร็จ: ${e.message}` : 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ปุ่มส่วนลดท้ายบิล = เครื่องมือกระจายส่วนลดรวมทั้งบิลลงทุกแถวตามสัดส่วน qty×cost
  // เขียนผลลง row.discount ทันที (กระจายใหม่ทับของเดิมทั้งหมด). ใช้ DiscountDialog ร่วม:
  // totalPrice = grossSubtotal (ราคารวมก่อนลด), initialDiscount = lineDiscountTotal,
  // onApply(disc) → กระจาย disc ลงทุกแถว. base เดียวทั้ง open/apply = grossSubtotal.
  const openBillAdjust = () => { setShowBillAdjust(true) }

  const closeBillAdjust = () => { setShowBillAdjust(false) }

  const applyBillAdjust = (discAmtRaw: number) => {
    // ฐานกระจาย = ราคารวมก่อนลด (qty×cost รวมทุกแถว) ตัวเดียวกับที่ส่งเป็น totalPrice
    const sumW = grossSubtotal
    if (sumW === 0) { toast('ยอดรวมเป็น 0 ไม่สามารถปรับยอดได้', 'error'); return }
    const discAmt = Math.min(Math.max(discAmtRaw || 0, 0), sumW)
    setRows(rs => rs.map(row => {
      const qty = parseFloat(row.qty) || 0
      const cost = parseFloat(row.cost_price) || 0
      const w = qty * cost
      // แถวไม่มีต้นทุน (w<=0) → ปล่อยไว้เดิม (กฏ blank→0: ห้ามเขียน '0' ทับช่องว่าง)
      if (w <= 0) return row
      const rowDisc = (w / sumW) * discAmt
      return {
        ...row,
        discount: rowDisc > 0 ? rowDisc.toFixed(2) : '',
        total: Math.max(w - rowDisc, 0).toFixed(2),
      }
    }))
    setShowBillAdjust(false)
  }

  // ── เพิ่มต้นทุน (ส่วนเพิ่มท้ายบิล) — ทางเดียว รวมเข้า cost_price ถาวร ──
  const openSurcharge = () => { setSurchargeBaht(''); setSurchargePct(''); setSurTotalInput(''); setSurFocus(null); setShowSurcharge(true) }
  const closeSurcharge = () => setShowSurcharge(false)
  const applySurcharge = () => {
    const amt = parseFloat(surchargeBaht) || 0
    if (!(amt > 0)) { toast('กรุณาระบุจำนวนส่วนเพิ่ม', 'error'); return }
    const weights = rows.map(r => (parseFloat(r.qty) || 0) * (parseFloat(r.cost_price) || 0))
    const sumW = weights.reduce((a, b) => a + b, 0)
    if (sumW <= 0) { toast('ยังไม่มีต้นทุนให้กระจายส่วนเพิ่ม', 'error'); return }
    // กระจายตามมูลค่าต้นทุน บวกเข้า cost_price (ทุน/หน่วยสูงขึ้นถาวร) แล้วคิด total ใหม่ (คงส่วนลดเดิม)
    setRows(rs => rs.map((row, i) => {
      const qty = parseFloat(row.qty) || 0
      // ข้ามแถวที่ไม่มีต้นทุน (weight 0) — กันเขียน '0' ทับช่องทุนที่เว้นว่าง (กฎ blank→0)
      if (qty <= 0 || weights[i] <= 0) return row
      const rowSur = (weights[i] / sumW) * amt
      const newCost = stripTrailingZeros(((parseFloat(row.cost_price) || 0) + rowSur / qty).toFixed(4))
      const disc = parseFloat(row.discount) || 0
      const newTotal = Math.max(qty * parseFloat(newCost) - disc, 0)
      return { ...row, cost_price: newCost, total: newTotal.toFixed(2) }
    }))
    setShowSurcharge(false)
  }

  // ── รวมส่วนลดในต้นทุน — ยุบ row.discount เข้า cost_price จริง (ทางเดียว) ──
  // cost_price ใหม่ = ทุนสุทธิต่อหน่วย (total/qty) แล้วล้าง discount; total คงเดิม.
  // ผลบันทึกเท่าเดิม (save ใช้ total/qty อยู่แล้ว) แต่ฟอร์ม/เอกสารจะไม่มีบรรทัดส่วนลดแยก.
  const applyMergeDiscount = () => {
    setRows(rs => rs.map(row => {
      const qty = parseFloat(row.qty) || 0
      const disc = parseFloat(row.discount) || 0
      // ยุบเฉพาะแถวที่มีส่วนลดจริง — กันเขียนทับ cost_price แถวที่ไม่เกี่ยว (กฎ blank→0)
      if (qty <= 0 || disc <= 0) return row
      const totalN = parseFloat(row.total)
      const netCost = isFinite(totalN) ? totalN / qty : (parseFloat(row.cost_price) || 0)
      return { ...row, cost_price: stripTrailingZeros(netCost.toFixed(4)), discount: '' }
    }))
    setShowMergeConfirm(false)
  }

  const resetForm = () => {
    setSupplierId(0); setSupplierName(''); setSupplierInvoiceNo('')
    setOrderDate(today); setReceiveDate(today); setPaymentType('cash'); setDueDate('')
    setIsPaid(false); setPaidDate(''); setGrNote(''); setVatMode(shopVatEnabled ? 'inclusive' : 'none')
    setRows([]); setSearchQueries([]); setSuggestions([])
    clearDraft()
    loadNextGR()
  }

  const rowIsValid = (r: ReceiptRow) =>
    r.product_id > 0 && r.lot_number.trim() !== '' && (r.expiry_date !== '' || r.expiry_optional === true) && parseFloat(r.qty) > 0 && parseFloat(r.total) > 0

  const rowIsPartial = (r: ReceiptRow) =>
    (r.product_id > 0 || r.lot_number || r.expiry_date || r.qty || r.total) && !rowIsValid(r)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">

      {/* ── HEADER ── */}
      <PageHeader title="การรับสินค้า" />

      {/* ── Receive form ── */}
      <div className="flex-1 min-h-0 flex flex-col">

                {/* Form + sidebar row — fills height; only table body scrolls */}
                <div className="flex gap-4 items-stretch flex-1 min-h-0">

                  {/* Left: GR form */}
                  <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">

                    {/* Header fields */}
                    <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-3 shrink-0">
                      <div className="grid grid-cols-[170px_1fr_200px_200px] gap-3">

                        {/* GR receipt no — auto-generated, read-only (โชว์เฉย ๆ) */}
                        <div>
                          <label className="block text-base font-semibold text-muted-foreground mb-1.5">เลขที่ใบรับ</label>
                          <div className="relative">
                            <Input
                              variant="filled"
                              value={invoiceNo}
                              readOnly
                              tabIndex={-1}
                              className="h-9 text-sm font-semibold cursor-default"
                            />
                          </div>
                        </div>

                        {/* Supplier selector */}
                        <div>
                          <label className="block text-base font-semibold text-muted-foreground mb-1.5">
                            ผู้จำหน่าย <span className="text-destructive">*</span>
                          </label>
                          <Combobox
                            variant="elevated"
                            items={suppliers}
                            value={receiveSupplier}
                            onChange={(s) => { setSupplierId(s?.id ?? 0); setSupplierName(s?.name ?? '') }}
                            getKey={(s) => s.id}
                            getLabel={(s) => s.name}
                            getSublabel={(s) => s.code}
                            icon={Building2}
                            placeholder="— เลือกผู้จำหน่าย —"
                            searchPlaceholder="ชื่อหรือรหัสผู้จัดจำหน่าย..."
                            emptyText="ไม่พบผู้จัดจำหน่าย"
                          />
                        </div>

                        {/* Supplier invoice no */}
                        <div>
                          <label className="block text-base font-semibold text-muted-foreground mb-1.5">เลขที่ใบกำกับสินค้า <span className="text-destructive">*</span></label>
                          <div className="relative">
                            <FileText className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground-subtle pointer-events-none" />
                            <Input
                              variant="elevated"
                              value={supplierInvoiceNo}
                              onChange={e => setSupplierInvoiceNo(e.target.value)}
                              placeholder="PO-123456"
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>

                        {/* Order date (bill date) */}
                        <div>
                          <label className="block text-base font-semibold text-muted-foreground mb-1.5">วันที่สั่งซื้อตามบิล<span className="text-destructive">*</span></label>
                          <DateInput
                            variant="elevated"
                            value={orderDate}
                            onChange={v => { setOrderDate(v); setDateErrors(e => ({ ...e, order: false })) }}
                            error={dateErrors.order}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Line items */}
                    <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
                      {/* px-4 = 16px, matches the table's border-l-[16px]/r-[16px] inset
                          so strip controls align with column edges. */}
                      <div className="px-4 h-12 shrink-0 flex items-center gap-3">
                        <div className="flex items-center gap-3 shrink-0">
                          <TintIcon icon={Package} tint="neutral" size="sm" />
                          <h3 className="text-lg font-semibold text-foreground">รายการสินค้า</h3>
                          <Badge variant="neutral-outline">{rows.length.toLocaleString()}</Badge>
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                          <Button size="lg" variant="elevated" onClick={() => setShowImport(true)} className="h-9 rounded-lg text-sm gap-1.5">
                            <ClipboardPaste className="size-3.5" /> นำเข้าข้อมูล
                          </Button>
                          <Button size="lg" variant="elevated" onClick={openBillAdjust} disabled={rows.length === 0} className="h-9 rounded-lg text-sm gap-1.5">
                            ส่วนลดท้ายบิล
                          </Button>
                          <Button size="lg" variant="elevated" onClick={openSurcharge} disabled={rows.length === 0} className="h-9 rounded-lg text-sm gap-1.5">
                            เพิ่มต้นทุน
                          </Button>
                          <Button
                            size="lg"
                            variant="elevated"
                            onClick={() => setShowMergeConfirm(true)}
                            disabled={lineDiscountTotal <= 0}
                            className="h-9 rounded-lg text-sm gap-1.5"
                            tooltip="ยุบส่วนลดรายตัวเข้าไปในทุน/หน่วย แล้วล้างช่องส่วนลด (ย้อนกลับไม่ได้)"
                          >
                            รวมส่วนลดในต้นทุน
                          </Button>
                          <Button size="lg" onClick={openAddWizard} className="h-9 rounded-lg text-sm gap-1.5">
                            <Plus className="size-3.5" /> เพิ่มสินค้า
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="border-0 hover:bg-transparent">
                            <TableHead className="px-3 text-center w-10">#</TableHead>
                            <TableHead className="px-3 w-[36%]">ชื่อสินค้า</TableHead>
                            <TableHead className="px-3 text-center w-[10%]">หน่วย</TableHead>
                            <TableHead className="px-3 text-right w-[10%]">จำนวน</TableHead>
                            <TableHead className="px-3 text-right w-[13%]">ทุน/หน่วย</TableHead>
                            <TableHead className="px-3 text-right w-[13%]">ราคาขาย</TableHead>
                            <TableHead className="px-3 text-right w-[10%]">ส่วนลด</TableHead>
                            <TableHead className="px-3 text-right w-[12%]">รวม</TableHead>
                            <TableHead className="px-3 text-center w-20">จัดการ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                              <TableRow className="border-0 hover:bg-transparent">
                                <TableCell colSpan={9} className="py-16 text-center">
                                  <div className="flex flex-col items-center gap-3 text-foreground-subtle">
                                    <TintIcon icon={Package} tint="neutral" size="lg" />
                                    <p className="text-sm leading-relaxed">
                                      ยังไม่มีรายการ<br /> เพิ่มสินค้าทีละรายการผ่านขั้นตอนนำทาง<br />
                                      หรือวางทั้งบิลด้วยปุ่ม “นำเข้าข้อมูล”
                                    </p>
                                    <Button onClick={openAddWizard} className="h-9 gap-1.5 mt-1">
                                      <Plus className="size-4" /> เพิ่มสินค้า
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : rows.map((row, i) => {
                              const isValid = rowIsValid(row)
                              const isPartial = rowIsPartial(row)
                              const perLineDisc = parseFloat(row.discount) || 0
                              // ทุน/หน่วยปัจจุบัน (รวมส่วนเพิ่มที่ commit แล้ว, ก่อนหักส่วนลด)
                              // หลัง "รวมส่วนลดในต้นทุน" cost_price จะกลายเป็นทุนสุทธิจริงอยู่แล้ว
                              const displayCost = parseFloat(row.cost_price) || 0
                              return (
                                <TableRow
                                  key={i}
                                  className={`border-0 ${isPartial ? 'bg-amber-soft/50 hover:bg-amber-soft/70' : 'hover:bg-primary-soft/40'}`}
                                >
                                  <TableCell className="px-3 py-2 text-sm text-foreground-subtle text-center">{i + 1}</TableCell>

                                  <TableCell className="px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="truncate text-sm font-medium">
                                        {row.trade_name || <span className="text-foreground-subtle font-normal">{searchQueries[i] || '—'}</span>}
                                      </span>
                                      {isValid ? (
                                        <span className="grid place-items-center size-4 rounded-full bg-success text-success-foreground shrink-0">
                                          <Check className="size-2.5" strokeWidth={3} />
                                        </span>
                                      ) : (
                                        <span className="grid place-items-center size-4 rounded-full bg-accent text-accent-foreground shrink-0">
                                          <Minus className="size-2.5" strokeWidth={3} />
                                        </span>
                                      )}
                                    </div>
                                    {/* Lot · ผลิต · หมดอายุ — moved under the name (inline edit retired) */}
                                    <div className="mt-0.5 text-sm text-foreground-subtle overflow-x-clip overflow-y-visible whitespace-nowrap">
                                      <span>LOT. {row.lot_number || '—'}</span>
                                      <span> · EXP: {row.expiry_date ? formatDate(row.expiry_date) : '—'}</span>
                                      <span> · MFG: {row.manufactured_date ? formatDate(row.manufactured_date) : '—'}</span>
                                    </div>
                                  </TableCell>

                                  <TableCell className="px-3 py-2 text-center text-sm">{row.unit_name || '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm">{formatNum(row.qty) || '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm">{row.total ? formatCurrency(displayCost) : '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm">{row.product_id ? formatCurrency(row.default_sell_price || 0) : '—'}</TableCell>
                                  <TableCell className="px-2 py-2 text-right">
                                    {!row.product_id ? (
                                      <span className="text-sm text-foreground-subtle pr-1">—</span>
                                    ) : (
                                      <Button
                                        variant="destructive-soft"
                                        size="sm"
                                        onClick={() => setDiscountIdx(i)}
                                        className="flex items-center justify-end w-full h-9 pl-2.5 pr-2 rounded-md text-sm font-semibold"
                                      >
                                        <span className="leading-none">
                                          {perLineDisc > 0 ? formatCurrency(perLineDisc) : '0'}
                                        </span>
                                      </Button>
                                    )}
                                  </TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm font-semibold">{row.total ? formatCurrency(parseFloat(row.total) || 0) : '—'}</TableCell>

                                  <TableCell className="px-2 py-2">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button variant="elevated" size="icon-lg" onClick={() => openEditWizard(i)} tooltip="แก้ไข">
                                        <Pencil className="size-3.5" />
                                      </Button>
                                      <Button variant="elevated-destructive-soft" size="icon-lg" onClick={() => deleteRow(i)} tooltip="ลบ">
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                        </TableBody>
                      </Table>
                      </div>

                      {/* ── Footer bar — always pinned at bottom of card ── */}
                      <div className="shrink-0">
                        {duplicateNames.length > 0 && (
                          <div className="bg-amber-soft px-5 py-2 flex items-center gap-2 text-sm text-amber-strong">
                            <AlertTriangle className="size-4 text-warning shrink-0" />
                            <span className="font-semibold shrink-0">พบรายการซ้ำ (สินค้า + Lot เดิม):</span>
                            <span className="truncate">{duplicateNames.join(', ')}</span>
                          </div>
                        )}
                        {hasSummaryBreakdown && (
                          <div className="bg-card px-5 py-1 space-y-0.5">
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>ราคารวมก่อนลด</span>
                              <span className="w-32 text-right">{formatCurrency(grossSubtotal)}</span>
                            </div>
                            {lineDiscountTotal > 0 && (
                              <div className="flex items-center justify-end gap-6 text-sm text-primary">
                                <span>ส่วนลด</span>
                                <span className="w-32 text-right">−{formatCurrency(lineDiscountTotal)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {vatMode === 'inclusive' && billVat > 0 && (
                          <div className="bg-card px-5 py-1 space-y-0.5">
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>มูลค่าก่อนภาษี</span>
                              <span className="w-32 text-right">{formatCurrency(totalCost - billVat)}</span>
                            </div>
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>ภาษีมูลค่าเพิ่ม {shopVatRate}%</span>
                              <span className="w-32 text-right">{formatCurrency(billVat)}</span>
                            </div>
                          </div>
                        )}
                        <div className="h-12 px-5 bg-card border-t border-border flex items-center justify-between gap-3">
                          <Badge variant="primary-soft" className="text-sm rounded-md">{validRows.length}/{rows.length} รายการ</Badge>
                          <div className="flex items-center gap-6">
                            <span className="text-sm font-semibold text-foreground">มูลค่ารวมทั้งหมด</span>
                            <span className="font-extrabold text-primary text-base w-32 text-right">{formatCurrency(grandTotal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>{/* end left */}

                  {/* ── Right sidebar ── */}
                  <div className="w-64 shrink-0 overflow-y-auto scrollbar-thin [scrollbar-gutter:stable] space-y-3 pr-1">

                    {/* GR summary */}
                    <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-2.5">
                      <div className="text-sm font-bold text-foreground uppercase tracking-wide">สรุปใบรับสินค้า</div>
                      <div>
                        <div className="text-sm text-foreground-subtle mb-0.5">เลขที่ใบรับ</div>
                        <div className="text-sm font-bold text-primary">{invoiceNo || '—'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-foreground-subtle mb-0.5">ผู้จัดจำหน่าย</div>
                        <div className="text-sm font-semibold text-foreground truncate">
                          {supplierName || <span className="text-destructive font-normal">N/A</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-foreground-subtle mb-1 block">วันที่รับสินค้า<span className="text-destructive">*</span></label>
                        <DateInput variant="elevated" value={receiveDate} onChange={v => { setReceiveDate(v); setDateErrors(e => ({ ...e, receive: false })) }} error={dateErrors.receive} className="h-9 text-sm" />
                      </div>
                    </div>

                    {/* Payment type */}
                    <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-3">
                      <div className="text-sm font-bold text-foreground uppercase tracking-wide">การชำระเงิน</div>
                      <div className="flex h-9 items-stretch gap-0.5 rounded-lg bg-muted/40">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setPaymentType('cash')}
                          className={`relative flex flex-1 h-full px-0 rounded-lg text-sm font-semibold justify-center gap-1.5 hover:bg-transparent ${
                            paymentType === 'cash'
                              ? 'text-primary-foreground hover:text-primary-foreground'
                              : 'text-foreground-subtle hover:text-foreground'
                          }`}
                        >
                          {paymentType === 'cash' && (
                            <motion.span
                              layoutId="payment-pill"
                              aria-hidden
                              className="absolute inset-0 rounded-lg bg-primary"
                              transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                            />
                          )}
                          <span className="relative z-10 inline-flex items-center gap-1.5">
                            <Banknote className="size-3.5" /> เงินสด
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setPaymentType('credit')}
                          className={`relative flex flex-1 h-full px-0 rounded-lg text-sm font-semibold justify-center gap-1.5 hover:bg-transparent ${
                            paymentType === 'credit'
                              ? 'text-accent-foreground hover:text-accent-foreground'
                              : 'text-foreground-subtle hover:text-foreground'
                          }`}
                        >
                          {paymentType === 'credit' && (
                            <motion.span
                              layoutId="payment-pill"
                              aria-hidden
                              className="absolute inset-0 rounded-lg bg-accent"
                              transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                            />
                          )}
                          <span className="relative z-10 inline-flex items-center gap-1.5">
                            <CreditCard className="size-3.5" /> เครดิต
                          </span>
                        </Button>
                      </div>
                      {paymentType === 'credit' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-sm font-semibold text-muted-foreground mb-1 block">วันครบกำหนด <span className="text-destructive">*</span></label>
                            <DateInput variant="elevated" value={dueDate} onChange={v => { setDueDate(v); setDateErrors(e => ({ ...e, due: false })) }} error={dateErrors.due} className="h-9 text-sm" />
                            <div className="flex gap-1 mt-1.5">
                              {[15, 30, 60, 90].map(d => (
                                <Button
                                  key={d}
                                  type="button"
                                  variant="amber-soft"
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
                              <DateInput variant="elevated" value={paidDate} onChange={v => { setPaidDate(v); setDateErrors(e => ({ ...e, paid: false })) }} error={dateErrors.paid} className="h-9 text-sm" />
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant={paidDate === today ? 'default' : 'primary-soft'}
                                  onClick={() => setPaidDate(today)}
                                  className="flex-1 h-8 rounded-lg text-sm font-semibold"
                                >
                                  วันนี้
                                </Button>
                                <Button
                                  type="button"
                                  variant={dueDate && paidDate === dueDate ? 'default' : 'primary-soft'}
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

                    {/* ภาษีมูลค่าเพิ่ม — per bill; only for VAT-registered shops.
                        Checkbox: ติ๊ก = บิลมี VAT (ราคารวม VAT แล้วเสมอ → 'inclusive');
                        ไม่ติ๊ก = บิลไม่มี VAT ('none'). ร้านที่เปิด VAT default = ติ๊ก. */}
                    {shopVatEnabled && (
                      <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-2">
                        <div className="text-sm font-bold text-foreground uppercase tracking-wide">ภาษีมูลค่าเพิ่ม</div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <Checkbox
                            checked={vatMode === 'inclusive'}
                            onCheckedChange={v => setVatMode(v === true ? 'inclusive' : 'none')}
                          />
                          <span className="text-sm text-muted-foreground">บิลมีภาษีมูลค่าเพิ่ม</span>
                        </label>
                        {vatMode === 'inclusive' && (
                          <div className="flex items-start gap-1.5 rounded-lg border border-info/30 bg-info-soft p-2.5 text-xs text-info-soft-foreground">
                            <Info className="size-4 shrink-0 mt-0.5" />
                            <span>ระบบจะแสดงราคาสินค้าที่รวมภาษีมูลค่าเพิ่มแล้วเท่านั้น</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Note */}
                    <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-2">
                      <div className="text-sm font-bold text-foreground uppercase tracking-wide">หมายเหตุ</div>
                      <Textarea
                        variant="elevated"
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
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                      </Button>
                      <Button
                        variant="destructive-soft"
                        onClick={resetForm}
                        className="w-full h-12 rounded-xl text-sm font-medium"
                      >
                        ล้างฟอร์ม
                      </Button>
                    </div>

                  </div>{/* end sidebar */}
                </div>{/* end flex row */}
      </div>{/* end receive form */}

      {/* ── Unit swap modal — shared with POS (UnitPickerDialog) ── */}
      {unitModalIdx !== null && rows[unitModalIdx] && (
        <UnitPickerDialog
          open
          onClose={() => setUnitModalIdx(null)}
          productName={rows[unitModalIdx].trade_name || '-'}
          units={rows[unitModalIdx].units}
          activeUnitName={rows[unitModalIdx].unit_name}
          onSelect={(u) => changeRowUnit(unitModalIdx, u)}
        />
      )}

      {/* ── ส่วนลดท้ายบิล — ใช้ DiscountDialog ร่วมกับ POS/GR (กระจายลงทุกแถวตามสัดส่วน) ── */}
      {showBillAdjust && (
        <DiscountDialog
          open
          onClose={closeBillAdjust}
          note={<>ส่วนลดสินค้าเดิมจะถูก<b>รวมและกระจายลงสินค้าตามสัดส่วนใหม่ทั้งหมด</b> กดตกลงเพื่อดำเนินการ</>}
          totalPrice={grossSubtotal}
          initialDiscount={lineDiscountTotal}
          onApply={applyBillAdjust}
        />
      )}

      {/* ── เพิ่มต้นทุน (ส่วนเพิ่มท้ายบิล) — ทางเดียว รวมเข้าต้นทุน ── */}
      <Dialog open={showSurcharge} onOpenChange={(o) => { if (!o) closeSurcharge() }}>
        <DialogContent size="sm" divided>
          <DialogHeader>
            <DialogTitle className="text-xl">เพิ่มต้นทุน (ส่วนเพิ่มท้ายบิล)</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm text-primary">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>ส่วนนี้จะทำให้ ต้นทุนของสินค้าทุกรายการ <b>เพิ่มขึ้นทันที</b> โดยไม่สามารถย้อนกลับได้ <b>กรุณายืนยันเพื่อดำเนินการ</b></span>
            </div>
            {/* preset % — iOS-style segmented control (mirror DiscountDialog, โทน primary) */}
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              {[3, 5, 10, 15, 20].map(p => {
                const sur = parseFloat(surchargeBaht) || 0
                const isActive = surchargeBase > 0 && Math.abs(sur - surchargeBase * p / 100) < 0.01
                return (
                  <Button key={p} variant="ghost" size="sm"
                    onClick={() => {
                      const baht = parseFloat((surchargeBase * p / 100).toFixed(2))
                      setSurchargeBaht(String(baht)); setSurchargePct(String(p))
                      setSurTotalInput(String(parseFloat((surchargeBase + baht).toFixed(2))))
                    }}
                    className={`relative w-full h-8 rounded-md text-sm font-medium transition-colors hover:bg-transparent active:scale-100 active:translate-y-0 ${isActive ? 'text-primary-foreground hover:text-primary-foreground' : 'text-foreground/60 hover:text-foreground'}`}>
                    {isActive && (
                      <motion.div layoutId="surcharge-pct-pill" aria-hidden
                        className="absolute inset-0 rounded-md bg-primary shadow-md"
                        transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                    )}
                    <span className="relative z-10">{p}%</span>
                  </Button>
                )
              })}
            </div>

            {/* ส่วนเพิ่ม (%)  +  ส่วนเพิ่ม (บาท) — เคียงกัน */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ส่วนเพิ่ม (%)</Label>
                <div className="relative">
                  <Input
                    type="text" inputMode="decimal"
                    value={surFocus === 'pct' ? surchargePct : formatNum(surchargePct)}
                    onFocus={e => { setSurFocus('pct'); e.currentTarget.select() }}
                    onBlur={() => setSurFocus(null)}
                    onChange={e => {
                      const v = stripCommas(e.target.value)
                      setSurchargePct(v)
                      const p = parseFloat(v)
                      if (!isNaN(p)) {
                        const baht = parseFloat((surchargeBase * p / 100).toFixed(2))
                        setSurchargeBaht(String(baht))
                        setSurTotalInput(String(parseFloat((surchargeBase + baht).toFixed(2))))
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') applySurcharge() }}
                    placeholder="0"
                    className="h-10 text-right text-xl font-bold leading-none pl-4 pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle text-lg font-bold pointer-events-none">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>ส่วนเพิ่ม (บาท)</Label>
                <Input
                  type="text" inputMode="decimal" autoFocus
                  value={surFocus === 'baht' ? surchargeBaht : formatNum(surchargeBaht, true)}
                  onFocus={e => { setSurFocus('baht'); e.currentTarget.select() }}
                  onBlur={() => setSurFocus(null)}
                  onChange={e => {
                    const v = stripCommas(e.target.value)
                    setSurchargeBaht(v)
                    const baht = parseFloat(v) || 0
                    if (surchargeBase > 0) setSurchargePct(String(parseFloat((baht / surchargeBase * 100).toFixed(2))))
                    setSurTotalInput(String(parseFloat((surchargeBase + baht).toFixed(2))))
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') applySurcharge() }}
                  placeholder="0.00"
                  className="h-10 text-right text-xl font-bold leading-none px-6"
                />
              </div>
            </div>

            {/* กล่องสรุป — ต้นทุนรวมเดิม / ส่วนเพิ่ม / ต้นทุนรวมใหม่ (แก้ย้อนกลับได้) */}
            <div className="rounded-lg border border-primary/20 bg-primary-soft/50">
              <div className="flex items-center justify-between pl-4 pr-6 h-9">
                <span className="text-sm text-muted-foreground">ต้นทุนรวมเดิม</span>
                <span className="text-xl font-semibold text-foreground">{formatCurrency(surchargeBase)}</span>
              </div>
              <div className="flex items-center justify-between pl-4 pr-6 h-9">
                <span className="text-sm text-muted-foreground">ส่วนเพิ่ม</span>
                <span className="text-xl font-semibold text-primary">{(parseFloat(surchargeBaht) || 0) > 0 ? '+' : ''}{formatCurrency(parseFloat(surchargeBaht) || 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pl-4 pr-4 py-2.5">
                <span className="text-sm font-semibold text-foreground">ต้นทุนรวมใหม่</span>
                <Input
                  type="text" inputMode="decimal"
                  value={surFocus === 'total' ? surTotalInput : formatNum(surTotalInput, true)}
                  onFocus={e => { setSurFocus('total'); e.currentTarget.select() }}
                  onBlur={() => setSurFocus(null)}
                  onChange={e => {
                    const v = stripCommas(e.target.value)
                    setSurTotalInput(v)
                    const tp = parseFloat(v)
                    if (!isNaN(tp)) {
                      const baht = Math.max(0, parseFloat((tp - surchargeBase).toFixed(2)))
                      setSurchargeBaht(String(baht))
                      if (surchargeBase > 0) setSurchargePct(String(parseFloat((baht / surchargeBase * 100).toFixed(2))))
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') applySurcharge() }}
                  placeholder={formatCurrency(surchargeBase)}
                  className="h-10 w-36 text-right text-xl font-bold leading-none px-2"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" className="flex-1" onClick={closeSurcharge}>ยกเลิก</Button>
            <Button size="xl" className="flex-1" onClick={applySurcharge}>ยืนยัน</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── รวมส่วนลดในต้นทุน — confirm (ทางเดียว) ── */}
      <ConfirmDialog
        open={showMergeConfirm}
        onOpenChange={setShowMergeConfirm}
        variant="warning"
        title="รวมส่วนลดในต้นทุน"
        description={<>ส่วนลดทั้งหมดจะถูก <b>รวมเข้าในต้นทุนสินค้าโดยอัตโนมัติ</b> และ<b>ไม่สามารถย้อนกลับได้</b> กรุณายืนยันเพื่อทำรายการ</>}
        content={
          <div className="rounded-lg border border-amber/25 bg-amber-soft/50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>ราคารวมก่อนลด</span><span className="pr-2.5">{formatCurrency(grossSubtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>ส่วนลดรวม</span><span className="pr-2.5">−{formatCurrency(lineDiscountTotal)}</span></div>
            <div className="flex justify-between font-semibold text-foreground pt-1.5 mt-0.5 border-t border-amber/20"><span>ราคารวมต้นทุนใหม่</span><span className="pr-2.5">{formatCurrency(totalCost)}</span></div>
          </div>
        }
        confirmLabel="ยืนยัน"
        onConfirm={applyMergeDiscount}
      />

      {/* ── Import paste modal ── */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o && !importing) { setShowImport(false); setImportText('') } }}>
        <DialogContent size="2xl" divided>
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
                      <SelectTrigger variant="elevated" size="sm" className="h-8 text-sm">
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
                        variant="destructive-soft"
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
              variant="elevated"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'CETRIZIN\t200\t41128\t04/11/2028\t04/11/2028\t1,020.00'}
              className="text-sm h-40"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" disabled={importing} onClick={() => { setShowImport(false); setImportText('') }}>ยกเลิก</Button>
            <Button size="xl" disabled={importing || !importText.trim() || !importColumns.includes('key')} onClick={handleImport}>
              {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ── Success dialog ── */}
      <ConfirmDialog
        open={showSuccess}
        onOpenChange={setShowSuccess}
        variant="success"
        singleButton
        title="บันทึกสำเร็จ"
        description={savedInvoice}
        confirmLabel="เสร็จสิ้น"
        onConfirm={() => setShowSuccess(false)}
      />

      {/* ── Add / Edit product wizard (replaces inline row editing) ── */}
      <AddProductWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditIdx(null) }}
        onConfirm={handleWizardConfirm}
        editing={editIdx !== null ? rows[editIdx] : null}
      />

      {/* ส่วนลดรายตัว — แก้ตรงคอลัมน์ "ส่วนลด" ในตาราง (ย้ายออกจาก wizard) */}
      {discountIdx !== null && rows[discountIdx] && (
        <DiscountDialog
          open
          onClose={() => setDiscountIdx(null)}
          itemName={rows[discountIdx].trade_name}
          totalPrice={(parseFloat(rows[discountIdx].qty) || 0) * (parseFloat(rows[discountIdx].cost_price) || 0)}
          initialDiscount={parseFloat(rows[discountIdx].discount) || 0}
          onApply={(d) => applyLineDiscount(discountIdx, d)}
        />
      )}

    </div>
  )
}
