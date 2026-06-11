import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { UnitPickerDialog } from '@/components/ui/unit-picker-dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { TintIcon } from '@/components/ui/tint-icon'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Supplier, NegativeStockAlert } from '@/types'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { useShopVat } from '@/hooks/useShopVat'
import { extractVat } from '@/lib/vat'
import {
  Plus, Trash2, Package, Pencil,
  Building2, Banknote, CreditCard, FileText, ClipboardPaste, AlertTriangle, Settings2,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { motion } from 'framer-motion'
import { AddProductWizard, type ReceiptRow, type ProductUnitOption, emptyRow } from './AddProductWizard'

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
  const { vatEnabled: shopVatEnabled, vatRate: shopVatRate } = useShopVat()
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
  // Input VAT (ภาษีซื้อ) — per bill: some suppliers aren't VAT-registered.
  // Only offered when the shop itself is VAT-registered (useShopVat below);
  // the backend re-guards and forces 'none' for NO-VAT shops.
  const [vatMode, setVatMode] = useState<'none' | 'inclusive' | 'exclusive'>('none')
  const [isPaid, setIsPaid] = useState(false)
  const [paidDate, setPaidDate] = useState('')
  const [grNote, setGrNote] = useState('')
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [saving, setSaving] = useState(false)

  // Add/Edit product wizard (replaces the old per-row inline table editing)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [savedInvoice, setSavedInvoice] = useState('')

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Product search per row
  const [searchQueries, setSearchQueries] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<ProductSuggestion[][]>([])
  const [activeSuggRow, setActiveSuggRow] = useState<number | null>(null)
  const [suggHighlight, setSuggHighlight] = useState(0)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const searchTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([])

  // Optional column toggles (default off — keeps default row compact)
  const [showMfg, setShowMfg] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)

  // Tracks which numeric cell is focused — focused cell shows raw "1234.56", others show "1,234.56"
  const [focusedCell, setFocusedCell] = useState<string | null>(null)

  // Unit swap modal (per row)
  const [unitModalIdx, setUnitModalIdx] = useState<number | null>(null)

  // Sell-price quick-edit modal (per row)
  const [priceModalIdx, setPriceModalIdx] = useState<number | null>(null)
  const [priceDraft, setPriceDraft] = useState('')
  const [priceNote, setPriceNote] = useState('')
  const [priceSaving, setPriceSaving] = useState(false)
  const overridePrice = useManagerOverride()
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
  }, [])

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

  // ── Add/Edit product wizard ────────────────────────────────────────────────

  const openAddWizard = () => { setEditIdx(null); setWizardOpen(true) }
  const openEditWizard = (i: number) => { setEditIdx(i); setWizardOpen(true) }

  // Wizard returns a fully-built ReceiptRow. Keep the parallel search/suggestion
  // arrays length-aligned with `rows` so the paste-import bookkeeping stays valid.
  const handleWizardConfirm = (row: ReceiptRow) => {
    setBaseRowTotals(null)
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
    setWizardOpen(false)
    setEditIdx(null)
  }

  // Delete a committed row (no minimum-row guard — the list can be empty).
  const deleteRow = (i: number) => {
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
    const targetId = row.product_id
    setPriceSaving(true)
    overridePrice.run(
      async (ov) => {
        await window.api.products.updatePrice(targetId, {
          price_type: 'retail', new_price: newPrice, note: priceNote || undefined,
        }, ov)
      },
      {
        title: 'แก้ไขราคาขาย',
        onDone: () => {
          setPriceSaving(false)
          setRows(rs => rs.map(r => r.product_id === targetId ? { ...r, default_sell_price: newPrice } : r))
          toast('อัปเดตราคาขายแล้ว', 'success')
          closePriceModal()
        },
        onError: (e: any) => {
          setPriceSaving(false)
          toast(e?.message ?? 'อัปเดตราคาไม่สำเร็จ', 'error')
        },
      },
    )
    if (!overridePrice.isAdmin) setPriceSaving(false)
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

  const validRows = rows.filter(r => r.product_id && r.lot_number && r.expiry_date && parseFloat(r.qty) > 0)
  const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0)

  // VAT preview — inclusive: backed out of the line sum (grand total unchanged);
  // exclusive: added on top (grand total = lines + VAT). Mirrors purchase:save.
  const billVat = vatMode === 'inclusive' ? extractVat(totalCost, shopVatRate)
    : vatMode === 'exclusive' ? totalCost * shopVatRate / 100
    : 0
  const grandTotal = vatMode === 'exclusive' ? totalCost + billVat : totalCost

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
      const saveResult = await window.api.purchase.save({
        invoice_no: invoiceNo, supplier_id: supplierId, supplier_invoice_no: supplierInvoiceNo,
        receive_date: receiveDate, order_date: orderDate || undefined, payment_type: paymentType,
        due_date: dueDate || undefined, is_paid: isPaid, paid_date: paidDate || undefined,
        note: grNote || undefined,
        discount_amount: adjustDiscountAmt || undefined,
        surcharge_amount: adjustSurchargeAmt || undefined,
        vat_mode: vatMode,
        vat_rate: shopVatRate,
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
      setIsPaid(false); setPaidDate(''); setGrNote(''); setVatMode('none')
      setRows([]); setSearchQueries([]); setSuggestions([])
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
    setIsPaid(false); setPaidDate(''); setGrNote(''); setVatMode('none')
    setRows([]); setSearchQueries([]); setSuggestions([])
    setAdjustSubtotal(null); setAdjustDiscountAmt(0); setAdjustSurchargeAmt(0)
    setAppliedDiscount({ baht: '', pct: '' }); setAppliedSurcharge({ baht: '', pct: '' })
    setBaseRowTotals(null)
    loadNextGR()
  }

  const rowIsValid = (r: ReceiptRow) =>
    r.product_id > 0 && r.lot_number.trim() !== '' && r.expiry_date !== '' && parseFloat(r.qty) > 0 && parseFloat(r.total) > 0

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
                      <div className="grid grid-cols-[1fr_200px_200px] gap-3">

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
                              className="h-10 text-sm"
                            />
                          </div>
                        </div>

                        {/* Order date (bill date) */}
                        <div>
                          <label className="block text-base font-semibold text-muted-foreground mb-1.5">วันที่สั่งซื้อตามบิล</label>
                          <DateInput
                            variant="elevated"
                            value={orderDate}
                            onChange={setOrderDate}
                            className="h-10 text-sm"
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
                            ปรับยอดท้ายบิล
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
                            <TableHead className="px-3 w-[26%]">ชื่อสินค้า</TableHead>
                            <TableHead className="px-3 text-center w-[11%]">Lot</TableHead>
                            <TableHead className="px-3 text-center w-[12%]">วันหมดอายุ</TableHead>
                            <TableHead className="px-3 text-center w-[10%]">หน่วย</TableHead>
                            <TableHead className="px-3 text-right w-[9%]">จำนวน</TableHead>
                            <TableHead className="px-3 text-right w-[11%]">ทุน/หน่วย</TableHead>
                            <TableHead className="px-3 text-right w-[11%]">ราคาขาย</TableHead>
                            <TableHead className="px-3 text-right w-[12%]">รวม</TableHead>
                            <TableHead className="px-3 text-center w-20">จัดการ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                              <TableRow className="border-0 hover:bg-transparent">
                                <TableCell colSpan={10} className="py-16 text-center">
                                  <div className="flex flex-col items-center gap-3 text-foreground-subtle">
                                    <TintIcon icon={Package} tint="neutral" size="lg" />
                                    <p className="text-sm leading-relaxed">
                                      ยังไม่มีรายการ<br /> เพิ่มสินค้าทีละรายการผ่านขั้นตอนนำทาง<br />
                                      หรือวางทั้งบิลด้วยปุ่ม “นำเข้าข้อมูล”
                                    </p>
                                    <Button onClick={openAddWizard} className="gap-1.5 mt-1">
                                      <Plus className="size-4" /> เพิ่มสินค้า
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : rows.map((row, i) => {
                              const isValid = rowIsValid(row)
                              const isPartial = rowIsPartial(row)
                              const qtyN = parseFloat(row.qty)
                              const totalN = parseFloat(row.total)
                              const costPerUnit = qtyN > 0 && isFinite(totalN)
                                ? totalN / qtyN
                                : (parseFloat(row.cost_price) || 0)
                              return (
                                <TableRow
                                  key={i}
                                  onClick={() => openEditWizard(i)}
                                  className={`border-0 cursor-pointer ${isPartial ? 'bg-accent-soft/50 hover:bg-accent-soft/70' : 'hover:bg-primary-soft/40'}`}
                                >
                                  <TableCell className="px-3 py-2 text-sm text-foreground-subtle text-center">{i + 1}</TableCell>

                                  <TableCell className="px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="truncate text-sm font-medium">
                                        {row.trade_name || <span className="text-foreground-subtle font-normal">{searchQueries[i] || '—'}</span>}
                                      </span>
                                      {isValid
                                        ? <Badge variant="success-soft" className="shrink-0">ครบ</Badge>
                                        : <Badge variant="warning-outline" className="shrink-0">ไม่ครบ</Badge>}
                                    </div>
                                  </TableCell>

                                  <TableCell className="px-3 py-2 text-center text-sm">{row.lot_number || '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-center text-sm">{row.expiry_date ? formatDate(row.expiry_date) : '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-center text-sm">{row.unit_name || '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm">{formatNum(row.qty) || '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm">{row.total ? formatCurrency(costPerUnit) : '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm">{row.product_id ? formatCurrency(row.default_sell_price || 0) : '—'}</TableCell>
                                  <TableCell className="px-3 py-2 text-right text-sm font-semibold">{row.total ? formatCurrency(totalN) : '—'}</TableCell>

                                  <TableCell className="px-2 py-2">
                                    <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                      <Button variant="outline" size="icon" onClick={() => openEditWizard(i)} className="size-8" title="แก้ไข">
                                        <Pencil className="size-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => deleteRow(i)} className="size-8 text-foreground-subtle hover:text-destructive" title="ลบ">
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
                          <div className="bg-accent-soft px-5 py-2 flex items-center gap-2 text-sm text-accent-soft-foreground">
                            <AlertTriangle className="size-4 text-warning shrink-0" />
                            <span className="font-semibold shrink-0">พบรายการซ้ำ (สินค้า + Lot เดิม):</span>
                            <span className="truncate">{duplicateNames.join(', ')}</span>
                          </div>
                        )}
                        {adjustSubtotal !== null && (
                          <div className="bg-card px-5 py-1 space-y-0.5">
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>ราคารวม</span>
                              <span className="w-32 text-right">{formatCurrency(adjustSubtotal)}</span>
                            </div>
                            {adjustDiscountAmt > 0 && (
                              <div className="flex items-center justify-end gap-6 text-sm text-primary">
                                <span>ส่วนลด</span>
                                <span className="w-32 text-right">−{formatCurrency(adjustDiscountAmt)}</span>
                              </div>
                            )}
                            {adjustSurchargeAmt > 0 && (
                              <div className="flex items-center justify-end gap-6 text-sm text-accent-soft-foreground">
                                <span>ส่วนเพิ่ม</span>
                                <span className="w-32 text-right">+{formatCurrency(adjustSurchargeAmt)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {vatMode !== 'none' && billVat > 0 && (
                          <div className="bg-card px-5 py-1 space-y-0.5">
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>{vatMode === 'inclusive' ? 'มูลค่าก่อนภาษี' : 'ยอดรวมรายการ'}</span>
                              <span className="w-32 text-right">{formatCurrency(vatMode === 'inclusive' ? totalCost - billVat : totalCost)}</span>
                            </div>
                            <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                              <span>ภาษีมูลค่าเพิ่ม {shopVatRate}%{vatMode === 'inclusive' ? ' (รวมในยอด)' : ''}</span>
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
                        <label className="text-sm text-foreground-subtle mb-1 block">วันที่รับสินค้า</label>
                        <DateInput variant="elevated" value={receiveDate} onChange={setReceiveDate} className="h-9 text-sm" />
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
                            <DateInput variant="elevated" value={dueDate} onChange={setDueDate} className="h-9 text-sm" />
                            <div className="flex gap-1 mt-1.5">
                              {[15, 30, 60, 90].map(d => (
                                <Button
                                  key={d}
                                  type="button"
                                  variant="accent-soft"
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
                              <DateInput variant="elevated" value={paidDate} onChange={setPaidDate} className="h-9 text-sm" />
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

                    {/* Input VAT (ภาษีซื้อ) — per bill; only for VAT-registered shops */}
                    {shopVatEnabled && (
                      <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-2">
                        <div className="text-sm font-bold text-foreground uppercase tracking-wide">ภาษีซื้อ (VAT)</div>
                        <Select value={vatMode} onValueChange={v => setVatMode(v as 'none' | 'inclusive' | 'exclusive')}>
                          <SelectTrigger className="w-full h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">บิลนี้ไม่มี VAT</SelectItem>
                            <SelectItem value="inclusive">มี VAT — ราคารวม VAT แล้ว</SelectItem>
                            <SelectItem value="exclusive">มี VAT — ราคายังไม่รวม VAT</SelectItem>
                          </SelectContent>
                        </Select>
                        {vatMode !== 'none' && (
                          <p className="text-xs text-muted-foreground">
                            {vatMode === 'inclusive'
                              ? `ระบบจะถอด VAT ${shopVatRate}% ออกจากต้นทุนสินค้าให้อัตโนมัติ (ภาษีซื้อขอคืนได้ ไม่ใช่ต้นทุน)`
                              : `ระบบจะบวก VAT ${shopVatRate}% เพิ่มจากยอดรวมรายการเป็นยอดชำระ`}
                          </p>
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
            <DialogContent size="lg" divided onClose={closePriceModal}>
              <DialogHeader>
                <DialogTitle className="text-2xl">ราคาขาย</DialogTitle>
                <div className="text-base font-semibold text-foreground">{row.trade_name || '-'}</div>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin p-0.5">
                  {/* Custom price — card-style, mirrors POS price picker */}
                  <div className="w-full rounded-xl border-2 border-primary bg-primary-soft/50 p-3.5 shadow-card">
                    <span className="text-base font-semibold text-primary">กำหนดราคา (ต่อ {row.unit_name || 'ชิ้น'})</span>
                    <div className="mt-2 flex items-center gap-2">
                      <PriceInput
                        autoFocus
                        value={priceDraft}
                        onChange={setPriceDraft}
                        onFocus={e => e.currentTarget.select()}
                        onKeyDown={e => { if (e.key === 'Enter' && customPrice > 0 && !priceSaving) { e.preventDefault(); savePriceModal() } }}
                        className="w-full flex-1 h-12 text-3xl font-extrabold text-primary bg-card border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary outline-none px-3"
                      />
                      <Button variant="default" onClick={savePriceModal} disabled={priceSaving || customPrice <= 0} className="h-12 px-5 text-base">
                        {priceSaving ? 'กำลังบันทึก…' : 'ตกลง'}
                      </Button>
                    </div>
                    <div className="mt-2.5 border-t border-border/60 pt-2 grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">ทุน <span className="font-semibold text-foreground">{formatCurrency(cost)}</span></span>
                      <span className="text-muted-foreground">กำไร <span className={`font-semibold ${customProfit > 0 ? 'text-success' : customProfit < 0 ? 'text-destructive' : 'text-foreground'}`}>{formatCurrency(customProfit)}</span></span>
                      <span className="text-muted-foreground">กำไร% <span className={`font-semibold ${customProfit > 0 ? 'text-success' : customProfit < 0 ? 'text-destructive' : 'text-foreground'}`}>{cost > 0 ? customMarkupPct.toFixed(1) : '0.0'}%</span></span>
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
                      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 space-y-2">
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
                          <div className="text-right text-muted-foreground">{formatCurrency(oldSellPrice)}</div>
                          <div className="text-right text-muted-foreground">{formatCurrency(prevCost)}</div>
                          <div className={`text-right ${profitCls(oldProfit)}`}>{formatCurrency(oldProfit)}</div>
                          <div className={`text-right ${profitCls(oldMargin)}`}>{oldMargin.toFixed(1)}%</div>

                          {/* ใหม่ */}
                          <div className="font-semibold">ใหม่</div>
                          <div className="text-right font-semibold text-foreground">{formatCurrency(newSellPrice)}</div>
                          <div className="text-right font-semibold text-foreground">{formatCurrency(cost)}</div>
                          <div className={`text-right font-semibold ${profitCls(newProfit)}`}>{formatCurrency(newProfit)}</div>
                          <div className={`text-right font-semibold ${profitCls(newMargin)}`}>{newMargin.toFixed(1)}%</div>

                          {/* ส่วนต่าง */}
                          <div className="text-foreground-subtle">ส่วนต่าง</div>
                          <div className={`text-right ${priceDiffCls}`}>{sign(priceDiff)}{formatCurrency(priceDiff)}</div>
                          <div className={`text-right ${costDiffCls}`}>{sign(costDiff)}{formatCurrency(costDiff)}</div>
                          <div className={`text-right ${profitDiffCls}`}>{sign(profitDiff)}{formatCurrency(profitDiff)}</div>
                          <div className={`text-right ${marginDiffCls}`}>{sign(marginDiff)}{marginDiff.toFixed(1)}%</div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Note */}
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1">หมายเหตุ</label>
                    <Input
                      variant="elevated"
                      value={priceNote}
                      onChange={e => setPriceNote(e.target.value)}
                      placeholder="เหตุผลการแก้ไขราคา..."
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* History */}
                  <div>
                    <div className="text-sm font-semibold text-muted-foreground mb-1.5">ประวัติการแก้ไขล่าสุด</div>
                    <div className="rounded-lg border border-border bg-muted/40 max-h-40 overflow-y-auto">
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
                                <td className="px-2 py-1 text-xs text-muted-foreground truncate">{fmtDate(h.created_at)}</td>
                                <td className="px-2 py-1 text-xs text-right text-muted-foreground">{formatCurrency(h.old_price)}</td>
                                <td className="px-2 py-1 text-xs text-right text-foreground font-semibold">{formatCurrency(h.new_price)}</td>
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
                <Button size="xl" className="w-32" onClick={closePriceModal}>ปิด</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {/* ── Bill adjustment modal ── */}
      <Dialog open={showBillAdjust} onOpenChange={(o) => { if (!o) closeBillAdjust() }}>
        <DialogContent size="sm" divided>
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
                            variant="elevated"
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
                            variant="elevated"
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
                    <div className="rounded-lg bg-primary-soft/50 border border-primary/30 px-4 py-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>ยอดรวมเดิม</span>
                        <span className="pr-2.5">{formatCurrency(adjustModalSum)}</span>
                      </div>
                      <div className="flex justify-between text-primary">
                        <span>ส่วนลด</span>
                        <span className="pr-2.5">{previewDisc > 0 ? '−' : ''}{formatCurrency(previewDisc)}</span>
                      </div>
                      <div className="flex justify-between text-accent-soft-foreground">
                        <span>ส่วนเพิ่ม</span>
                        <span className="pr-2.5">{previewSur > 0 ? '+' : ''}{formatCurrency(previewSur)}</span>
                      </div>
                      <div className="flex items-center justify-between font-semibold text-foreground pt-1.5 mt-1">
                        <span>ยอดสุทธิ</span>
                        <div className="relative w-36">
                          <Input
                            variant="elevated"
                            type="text"
                            inputMode="decimal"
                            value={adjFocus === 'net' ? billNetInput : formatNum(billNetInput, true)}
                            onChange={e => handleNetChange(stripCommas(e.target.value))}
                            onFocus={() => setAdjFocus('net')}
                            onBlur={() => { setAdjFocus(null); setBillNetInput(calcNet(billDiscountBaht, billSurchargeBaht)) }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyBillAdjust() } }}
                            className="h-9 text-sm font-semibold text-right"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogBody>
                <DialogFooter>
                  <Button variant="elevated" size="xl" className="flex-1" onClick={closeBillAdjust}>ยกเลิก</Button>
                  <Button size="xl" className="flex-1" onClick={applyBillAdjust}>ตกลง</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

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
      {overridePrice.dialog}

      {/* ── Add / Edit product wizard (replaces inline row editing) ── */}
      <AddProductWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditIdx(null) }}
        onConfirm={handleWizardConfirm}
        editing={editIdx !== null ? rows[editIdx] : null}
      />

    </div>
  )
}
