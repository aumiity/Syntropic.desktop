import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table'
import { ProductSearchDialog } from '@/components/dialogs/ProductSearchDialog'
import { TintIcon } from '@/components/ui/tint-icon'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ProductLot } from '@/types'
import {
  Check, ChevronLeft, ChevronRight, Plus, RotateCcw, Save,
  AlertTriangle, ShoppingBag, CalendarClock, Coins, Info, ClipboardCheck, ClockAlert,
} from 'lucide-react'

// ── Shared types (single source — index.tsx imports these) ───────────────────

export interface ProductUnitOption {
  id: number
  unit_name: string
  qty_per_base: number
  price_retail?: number
  price_wholesale1?: number
  price_wholesale2?: number
}

// ราคาขายต่อหน่วย (ฐาน + variants ที่ is_for_sale) — capture ไว้กับ row เพื่อให้ modal แก้ราคาที่ตาราง GR ใช้ทีหลัง.
// product_unit_id === null คือหน่วยฐาน (เขียนผ่าน updatePrice/log); ตัวเลข = product_units.id (updateUnitPrice/ไม่ log)
export interface SellUnitPrice {
  key: string
  product_unit_id: number | null
  unit_name: string
  qty_per_base: number
  price_retail: number
  price_wholesale1: number
  price_wholesale2: number
}

export interface ReceiptRow {
  product_id: number
  trade_name: string
  product_code: string
  unit_name: string
  units: ProductUnitOption[]
  default_sell_price: number
  stored_cost_price?: number
  /** ทุนล่าสุดที่จ่ายจริง (last_cost_price) ตอนเลือกสินค้า — baseline เทียบ "ทุนเปลี่ยน" ใน step 4 */
  stored_last_cost?: number
  lot_number: string
  manufactured_date: string
  expiry_date: string
  /** วันหมดอายุว่างได้โดยตั้งใจ — ติดธงเมื่อ row นี้ merge เข้าล็อตเดิม (matchedLot) ที่ไม่มีวันหมดอายุ.
   *  ทำให้ตาราง GR ไม่ติด badge "ไม่สมบูรณ์" กับล็อตที่จงใจไม่มีวันหมดอายุ (paste/import ที่ไม่มีธงยังเตือนปกติ) */
  expiry_optional?: boolean
  qty: string
  /** ทุน/หน่วยปัจจุบัน (รวมส่วนเพิ่มท้ายบิลที่ commit แล้ว) — ไม่ถูกหักโดยส่วนลด; โชว์เป็น "ทุนก่อนลด" */
  cost_price: string
  /** ส่วนลดรายตัว (กรอกใน wizard) */
  discount: string
  /** ส่วนลดท้ายบิลที่กระจายลงแถวนี้ — แยกจาก discount เพื่อ tooltip แยกที่มา (สินค้า/ท้ายบิล) */
  bill_discount?: string
  /** ยอดสุทธิของแถว = qty*cost_price − discount − bill_discount (ส่วนเพิ่มฝังใน cost_price แล้ว) */
  total: string
  note: string
  /** หน่วยที่ขายได้ (ฐาน + is_for_sale variants) — capture ตอนเลือกสินค้า ไว้ให้ modal แก้ราคาที่ตาราง GR ใช้ทีหลัง */
  sell_units?: SellUnitPrice[]
}

export const emptyRow = (): ReceiptRow => ({
  product_id: 0, trade_name: '', product_code: '',
  unit_name: '', units: [], default_sell_price: 0,
  lot_number: '', manufactured_date: '', expiry_date: '',
  qty: '', cost_price: '', discount: '', bill_discount: '0', total: '', note: '',
})

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
  // Receiving unit list = every enabled variant (see enrichProduct). The base
  // unit is synthesized separately; this supplies the non-base receivable
  // variants (กล่อง/แพ็ค) that `units` (POS sale-only) would hide.
  purchase_units?: ProductUnitOption[]
  // pos:searchProducts enriches each hit with its open lots — used for the
  // "คงเหลือ" column (same source POS reads for stock).
  lots?: Array<{ qty_on_hand: number }>
  // When a scanned barcode matches a non-base unit, the row that unit lives on
  // is pre-highlighted (mirrors POS). null/absent → default to the base row.
  matched_unit_id?: number | null
}

// One navigable row in the search modal = a product paired with a specific unit
// (base = unit:null). Mirrors POS: base row first, then each receivable variant,
// so the user can pick กล่อง/แพ็ค straight from the list (not just in step 1).
type SearchItem = { product: ProductSuggestion; unit: ProductUnitOption | null }

// ประวัติราคาทุนที่ได้รับจริงต่อสินค้า (จาก ledger purchase_receipt_items) — โชว์ใน step 2
// ให้ผู้กรอกเทียบว่าเคยซื้อจากผู้จำหน่ายไหน ราคาเท่าไร ก่อนตัดสินใจกรอกต้นทุนรอบนี้.
interface PurchaseHistoryRow {
  supplier_name: string | null
  cost_price: number
  qty: number
  unit_name: string | null
  qty_per_base: number
  created_at: string
  order_date: string | null
  invoice_no: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

const stripTrailingZeros = (s: string) =>
  s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
const stripCommas = (v: string) => v.replace(/,/g, '')
const formatNum = (raw: string, two = false): string => {
  if (raw === '' || raw == null) return ''
  const n = parseFloat(raw)
  if (!isFinite(n)) return raw
  return two
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

// สร้างรายการหน่วยที่ขายได้สำหรับตัวแก้ราคา: ฐาน (จาก product) ก่อน แล้ว variants is_for_sale (จาก p.units).
// ใช้ p.units (is_for_sale) ไม่ใช่ purchase_units — ตัวแก้ราคาคุมเฉพาะหน่วยที่ "ขาย" ได้ (spec §7)
export function buildSellUnits(p: { unit_name?: string; price_retail?: number; price_wholesale1?: number; price_wholesale2?: number; units?: ProductUnitOption[] }): SellUnitPrice[] {
  const baseName = p.unit_name || 'ชิ้น'
  const base: SellUnitPrice = {
    key: 'base', product_unit_id: null, unit_name: baseName, qty_per_base: 1,
    price_retail: p.price_retail ?? 0,
    price_wholesale1: p.price_wholesale1 ?? 0,
    price_wholesale2: p.price_wholesale2 ?? 0,
  }
  const variants = (p.units ?? [])
    .filter(u => u.unit_name !== baseName)
    .map<SellUnitPrice>(u => ({
      key: String(u.id), product_unit_id: u.id, unit_name: u.unit_name, qty_per_base: u.qty_per_base,
      price_retail: u.price_retail ?? 0,
      price_wholesale1: u.price_wholesale1 ?? 0,
      price_wholesale2: u.price_wholesale2 ?? 0,
    }))
  return [base, ...variants]
}

// Months between today and an ISO/`yyyy-mm` expiry date (rough, for the FEFO hint).
const monthsToExpiry = (exp: string): number | null => {
  const m = exp.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const now = new Date()
  const diff = (Number(m[1]) - now.getFullYear()) * 12 + (Number(m[2]) - (now.getMonth() + 1))
  return diff
}

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { title: 'เลือกสินค้า', icon: ShoppingBag },
  { title: 'จำนวน & ต้นทุน', icon: Coins },
  { title: 'Lot & วันหมดอายุ', icon: CalendarClock },
  { title: 'สรุป & ยืนยัน', icon: ClipboardCheck },
] as const
const LAST = STEPS.length - 1

interface AddProductWizardProps {
  open: boolean
  onClose: () => void
  /** opts.addNext = บันทึกแล้วไม่ปิด (parent คงสถานะเปิดไว้) เพื่อให้ wizard รีเซ็ตรับสินค้าตัวถัดไป */
  onConfirm: (row: ReceiptRow, opts?: { addNext?: boolean }) => void
  /** When set, the wizard opens pre-filled to edit this row instead of adding a new one. */
  editing?: ReceiptRow | null
}

export function AddProductWizard({ open, onClose, onConfirm, editing }: AddProductWizardProps) {
  const [step, setStep] = useState(0)
  const [row, setRow] = useState<ReceiptRow>(emptyRow())

  // product search — typing in the step-1 field opens the shared
  // ProductSearchDialog on top (mirrors the POS adjust mini-POS pattern).
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)   // step-1 page field
  const modalSearchRef = useRef<HTMLInputElement>(null)   // ProductSearchDialog input
  const confirmBtnRef = useRef<HTMLButtonElement>(null)   // footer confirm (focused on the last step)
  const nextBtnRef = useRef<HTMLButtonElement>(null)      // footer next (focused after a product is picked on step 1)

  // optional fields revealed on demand
  const [showDiscount, setShowDiscount] = useState(false)

  // existing open lots for the chosen product — FEFO reference shown in step 2
  // so staff can sanity-check the new lot against what's already on the shelf.
  const [existingLots, setExistingLots] = useState<ProductLot[]>([])
  const [lotsLoading, setLotsLoading] = useState(false)
  const [showClosedLots, setShowClosedLots] = useState(false)
  const [lotSort, setLotSort] = useState<{ by: 'lot_number' | 'expiry_date' | 'qty_on_hand'; dir: 'asc' | 'desc' }>({ by: 'expiry_date', dir: 'desc' })

  // ประวัติราคาทุนที่ได้รับจริง (ผู้จำหน่าย + ราคาทุน) — โชว์ในกล่อง step 2 อ้างอิงตอนกรอกต้นทุน
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // แถวประวัติที่กดขยายดูทุนต่อหน่วยย่อย (เฉพาะแถวที่รับเป็นหน่วยใหญ่ qty_per_base > 1)
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set())

  // ── (re)initialise whenever the dialog opens ──
  useEffect(() => {
    if (!open) return
    // แก้ไขแถว = เริ่มสะอาด: ลบส่วนลด/ส่วนเพิ่มท้ายบิลที่กระจายไว้ (จะกระจายใหม่ตอนปรับยอดท้ายบิล)
    // แล้วคิดยอดรวมจาก ทุน − ส่วนลดรายตัว เท่านั้น เพื่อให้ cost_price คงเป็นทุนเต็มล้วน ๆ
    let base: ReceiptRow
    if (editing) {
      const q = parseFloat(editing.qty) || 0
      const c = parseFloat(editing.cost_price)
      const d = parseFloat(editing.discount) || 0
      const t = q > 0 && isFinite(c) ? Math.max(q * c - d, 0).toFixed(2) : editing.total
      base = { ...editing, bill_discount: '0', total: t }
    } else {
      base = emptyRow()
    }
    setRow(base)
    setQuery(editing?.trade_name ?? '')
    setSuggestions([])
    setSearchOpen(false)
    setSearching(false)
    setShowDiscount(!!editing && parseFloat(editing.discount) > 0)
    setStep(0)
    setShowClosedLots(false)
    setLotSort({ by: 'expiry_date', dir: 'desc' })
  }, [open, editing])

  const patch = useCallback((f: Partial<ReceiptRow>) => setRow(r => ({ ...r, ...f })), [])

  // load existing lots for the FEFO reference table whenever the product changes
  useEffect(() => {
    if (!open) return
    const pid = row.product_id
    if (!pid) { setExistingLots([]); return }
    let cancelled = false
    setLotsLoading(true)
    window.api.products.getLots(pid)
      .then((rows: ProductLot[]) => { if (!cancelled) setExistingLots(rows) })
      .catch(() => { if (!cancelled) setExistingLots([]) })
      .finally(() => { if (!cancelled) setLotsLoading(false) })
    return () => { cancelled = true }
  }, [open, row.product_id])

  // โหลดประวัติราคาทุน (ผู้จำหน่าย + ทุนที่ได้รับ) เมื่อสินค้าเปลี่ยน — ใช้ในกล่องอ้างอิง step 2
  useEffect(() => {
    if (!open) return
    const pid = row.product_id
    setExpandedHistory(new Set())
    if (!pid) { setPurchaseHistory([]); return }
    let cancelled = false
    setHistoryLoading(true)
    window.api.products.getPurchaseHistory(pid)
      .then((rows: PurchaseHistoryRow[]) => { if (!cancelled) setPurchaseHistory(rows) })
      .catch(() => { if (!cancelled) setPurchaseHistory([]) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [open, row.product_id])

  // last step has no fields → drop focus on the confirm button so the Enter
  // chain finishes the job (review, then one more Enter confirms — no mouse).
  useEffect(() => {
    if (open && step === LAST) confirmBtnRef.current?.focus()
  }, [open, step])

  // ล็อตที่รับเข้าได้ — ไม่รวมที่ยกเลิก; ล็อตปิด/หมดดันไปท้ายสุด (เหมือน AdjustStockDialog)
  const mergeCandidates = useMemo(() =>
    existingLots
      .filter(l => l.is_cancelled === 0)
      .sort((a, b) => {
        const aClosed = (a.is_closed === 1 || a.qty_on_hand <= 0) ? 1 : 0
        const bClosed = (b.is_closed === 1 || b.qty_on_hand <= 0) ? 1 : 0
        if (aClosed !== bClosed) return aClosed - bClosed
        return b.id - a.id
      }), [existingLots])

  // สวิตช์ "แสดงล็อตที่ปิด/หมดแล้ว" → default โชว์เฉพาะล็อตคงเหลือ (qty > 0, ยังเปิด)
  const visibleLots = useMemo(() =>
    showClosedLots ? mergeCandidates : mergeCandidates.filter(l => l.is_closed === 0 && l.qty_on_hand > 0),
    [mergeCandidates, showClosedLots])

  // เรียงตามหัวคอลัมน์ที่คลิก; วันหมดอายุว่างดันไปท้าย (far-future)
  const sortedLots = useMemo(() => {
    const dir = lotSort.dir === 'asc' ? 1 : -1
    return [...visibleLots].sort((a, b) => {
      if (lotSort.by === 'lot_number') return a.lot_number.localeCompare(b.lot_number) * dir
      if (lotSort.by === 'qty_on_hand') return (a.qty_on_hand - b.qty_on_hand) * dir
      const ae = a.expiry_date || '9999-99-99'
      const be = b.expiry_date || '9999-99-99'
      return ae.localeCompare(be) * dir
    })
  }, [visibleLots, lotSort])

  // ล็อตเดิมที่ "เลขล็อตที่กรอกตรงพอดี" — ตัวขับเดียวของการ merge: backend จับคู่
  // (product_id, lot_number) แล้วรวมเข้าล็อตนี้ โดยคงวันหมดอายุ/วันผลิตเดิม. ช่องล็อต
  // พิมพ์แก้ได้ตลอด; เมื่อเลขตรง → ล็อก+ดึงวันของล็อตเดิมมาโชว์ (read-only).
  const matchedLot = useMemo(() => {
    const ln = row.lot_number.trim()
    return ln ? mergeCandidates.find(l => l.lot_number === ln) ?? null : null
  }, [row.lot_number, mergeCandidates])

  // sync วันตามสถานะ match: ตรงล็อตเดิม → ดึงวันหมดอายุ/วันผลิตของล็อตมาใส่ฟอร์ม (ล็อก);
  // เพิ่งหลุดจากการตรง (แก้เลขจนไม่ตรง) → เคลียร์วันให้กรอกล็อตใหม่. ผูก dep แค่ matchedLot
  // + ใช้ functional setRow เพื่อเลี่ยง loop และไม่ทับค่าที่ผู้ใช้กรอกเองตอนยังไม่ตรง.
  const prevMatchId = useRef<number | null>(null)
  useEffect(() => {
    if (matchedLot) {
      const exp = matchedLot.expiry_date ?? ''
      const mfg = matchedLot.manufactured_date ?? ''
      setRow(r => (r.expiry_date === exp && r.manufactured_date === mfg) ? r : { ...r, expiry_date: exp, manufactured_date: mfg })
      prevMatchId.current = matchedLot.id
    } else {
      if (prevMatchId.current !== null) setRow(r => ({ ...r, expiry_date: '', manufactured_date: '' }))
      prevMatchId.current = null
    }
  }, [matchedLot])

  const toggleLotSort = (field: 'lot_number' | 'expiry_date' | 'qty_on_hand') =>
    setLotSort(s => s.by === field ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by: field, dir: 'asc' })

  // total = qty * cost − discount; editing any field auto-fills dependents (mirrors GR table math)
  const lineMath = (field: 'qty' | 'cost_price' | 'discount' | 'total', value: string) => {
    setRow(r => {
      const next: ReceiptRow = { ...r, [field]: value }
      const qty = parseFloat(next.qty)
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
    })
  }

  // ── product search ── typing opens the shared modal and drives its results
  const runSearch = (q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setSuggestions([]); return }
    setSearchOpen(true)
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await window.api.pos.searchProducts(q) as ProductSuggestion[]
        setSuggestions(data.slice(0, 30))
      } catch { /* best-effort */ }
      finally { setSearching(false) }
    }, 180)
  }

  // Esc / outside the modal: clear the query and return focus to the step-1
  // field (matches POS — closing the picker resets the search).
  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
    setSuggestions([])
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  // Live refs so the once-registered focus listeners below read current state
  // without stale closures (same trick POS uses).
  const openRef = useRef(open); openRef.current = open
  const stepRef = useRef(step); stepRef.current = step
  const searchOpenRef = useRef(searchOpen); searchOpenRef.current = searchOpen
  const hasProductRef = useRef(row.product_id > 0); hasProductRef.current = row.product_id > 0

  // Keep the product-search field permanently focused on step 1 — mirrors the
  // POS always-focused search. Active ONLY while the wizard is open, on step 0,
  // and no product is picked yet (other steps own their own inputs; once a
  // product is chosen the field is gone). Routes to the modal input when the
  // picker is open, else the page field. Registered once; reads refs.
  useEffect(() => {
    const INTERACTIVE = 'input, button, select, textarea, a, [role="button"], [contenteditable="true"]'
    const armed = () => openRef.current && stepRef.current === 0 && !hasProductRef.current
    const target = () => (searchOpenRef.current ? modalSearchRef.current : searchInputRef.current)
    const hasSelection = () => (window.getSelection()?.toString().length ?? 0) > 0

    // Re-grab the scan field after a plain click on empty chrome — but on
    // mouseup, and only when the click produced no text selection. The old
    // version preventDefault'd mousedown, which let the field stay glued for
    // barcode scanning but ALSO blocked the user from ever starting a drag-
    // selection (Windows Chromium then refuses to select inside the modal).
    // Deferring to mouseup keeps the field focused for scanning yet lets the
    // user drag out text and copy it.
    const onMouseUp = (e: MouseEvent) => {
      if (!armed()) return
      const t = e.target as HTMLElement | null
      if (!t || t.closest(INTERACTIVE)) return
      if (hasSelection()) return
      target()?.focus()
    }
    // Safety net: if our input loses focus to a non-interactive target, snap back
    // — unless the user is mid-selection (refocusing would collapse the range).
    const onFocusOut = (e: FocusEvent) => {
      if (!armed()) return
      const lost = e.target as HTMLElement | null
      if (lost !== searchInputRef.current && lost !== modalSearchRef.current) return
      setTimeout(() => {
        if (!armed()) return
        if (hasSelection()) return
        const active = document.activeElement as HTMLElement | null
        if (active && active.matches(INTERACTIVE)) return
        target()?.focus()
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Pick a product with a chosen unit (null = base). The chosen unit becomes the
  // receiving unit + seeds the sell price; step-1 chips still let the user switch.
  const pickProduct = (p: ProductSuggestion, picked: ProductUnitOption | null) => {
    const baseName = p.unit_name || 'ชิ้น'
    const baseUnit: ProductUnitOption = { id: -1, unit_name: baseName, qty_per_base: 1, price_retail: p.price_retail ?? 0 }
    const variants = (p.purchase_units ?? p.units ?? []).filter(u => u.unit_name !== baseName)
    const units = [baseUnit, ...variants]
    const chosen = picked ?? baseUnit
    // ค่าตั้งต้น step 2: จำนวน = 1, ต้นทุน/หน่วย = ทุนล่าสุดที่จ่ายจริง (last_cost_price).
    // ของฟรี/ไม่เคยซื้อ (last_cost ว่างหรือ 0) → คงช่องต้นทุนว่าง ไม่ coerce → 0 (กฏ stock/cost field).
    const lastCost = p.last_cost_price
    const qtyDefault = '1'
    const costDefault = lastCost != null && lastCost > 0 ? (lastCost * chosen.qty_per_base).toFixed(2) : ''
    const totalDefault = costDefault ? (parseFloat(qtyDefault) * lastCost! * chosen.qty_per_base).toFixed(2) : ''
    setRow(r => ({
      ...r,
      product_id: p.id,
      trade_name: p.trade_name,
      product_code: p.code ?? '',
      unit_name: chosen.unit_name,
      units,
      default_sell_price: chosen.price_retail ?? p.price_retail ?? 0,
      stored_cost_price: p.cost_price,
      stored_last_cost: p.last_cost_price,
      sell_units: buildSellUnits(p),
      qty: qtyDefault,
      cost_price: costDefault,
      total: totalDefault,
    }))
    setQuery(p.trade_name)
    setSuggestions([])
    setSearchOpen(false)
    // modal closes → focus would fall to <body>; park it on "ถัดไป" so Enter
    // advances straight to step 2 (chips stay reachable by Tab/click for a unit swap).
    setTimeout(() => nextBtnRef.current?.focus(), 50)
  }

  // Flatten results → one row per (product, unit): base first, then each variant.
  const flatItems: SearchItem[] = suggestions.flatMap(p => {
    const baseName = p.unit_name || 'ชิ้น'
    const variants = (p.purchase_units ?? p.units ?? []).filter(u => u.unit_name !== baseName)
    return [{ product: p, unit: null }, ...variants.map(u => ({ product: p, unit: u }))]
  })
  // Pre-highlight the scanned unit's row (base stays first; only highlight moves).
  const searchInitialIdx = (() => {
    const i = flatItems.findIndex(it => it.unit != null && it.unit.id === it.product.matched_unit_id)
    return i >= 0 ? i : undefined
  })()

  const clearProduct = () => {
    patch({ product_id: 0, trade_name: '', product_code: '', unit_name: '', units: [], sell_units: undefined, default_sell_price: 0, stored_cost_price: undefined })
    setQuery('')
    setSuggestions([])
    setSearchOpen(false)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  // Re-default cost per the newly-chosen unit (= ทุนล่าสุด × qty_per_base).
  // MIRROR pickProduct's blank→0 guard — free/never-bought (stored_last_cost
  // null or ≤0) keeps the cost field blank, never ?? 0.
  const selectUnit = (u: ProductUnitOption) => {
    const lc = row.stored_last_cost
    const q = parseFloat(row.qty) || 0
    const c = lc != null && lc > 0 ? (lc * u.qty_per_base).toFixed(2) : ''
    patch({
      unit_name: u.unit_name,
      default_sell_price: u.price_retail ?? row.default_sell_price,
      cost_price: c,
      total: c && q > 0 ? (q * lc! * u.qty_per_base).toFixed(2) : '',
    })
  }

  // ── per-step validation ──
  const stepValid = (s: number): boolean => {
    switch (s) {
      case 0: return row.product_id > 0
      case 1: return parseFloat(row.qty) > 0 && parseFloat(row.total) > 0   // จำนวน & ต้นทุน
      // Lot & วันหมดอายุ: ล็อตเดิม (matchedLot) ใช้วันของล็อตตามจริง — ถ้าตั้งใจไม่มีวันหมดอายุก็ข้ามได้;
      // ล็อตใหม่ยังบังคับกรอกวันหมดอายุเหมือนเดิม
      case 2: return row.lot_number.trim() !== '' && (matchedLot != null || row.expiry_date !== '')
      case 3: return true                                                   // สรุป
      default: return false
    }
  }
  const canNext = stepValid(step)
  // a step counts as "done" in the rail once every earlier step is valid AND it has data
  const isDone = (s: number) => s < step && stepValid(s)

  const goNext = () => {
    if (!canNext) return
    if (step === LAST) { void confirm(); return }
    setStep(s => Math.min(LAST, s + 1))
  }
  const goBack = () => setStep(s => Math.max(0, s - 1))
  const jump = (s: number) => {
    // allow jumping back freely, or forward only through already-valid steps
    if (s <= step || stepValid(step)) setStep(s)
  }

  // ราคาขายแยกไปแก้ที่ modal ในตาราง GR ทีหลัง — wizard แค่ส่ง row (default_sell_price
  // = ราคาปลีกของหน่วยที่เลือก ตั้งไว้แล้วใน pickProduct/selectUnit) ไม่เขียนราคาเองที่นี่
  // ส่ง row พร้อมธง expiry_optional: ล็อตเดิม (matchedLot) → วันหมดอายุว่างได้โดยตั้งใจ
  const buildRow = (): ReceiptRow => ({ ...row, expiry_optional: matchedLot != null })
  const confirm = () => {
    onConfirm(buildRow())
  }

  // รีเซ็ต wizard กลับ step 1 สำหรับรับสินค้าตัวถัดไป (open ยังจริงอยู่ → init effect ไม่ยิงเอง
  // เพราะ deps [open, editing] ไม่เปลี่ยน จึงต้องรีเซ็ต state เองให้ครบเหมือน init).
  const resetForNext = () => {
    setRow(emptyRow())
    setQuery('')
    setSuggestions([])
    setSearchOpen(false)
    setSearching(false)
    setShowDiscount(false)
    setStep(0)
    setShowClosedLots(false)
    setLotSort({ by: 'expiry_date', dir: 'desc' })
    setExistingLots([])
    // โฟกัสช่องค้นหา step 1 ให้สแกนบาร์โค้ด/พิมพ์ตัวถัดไปได้เลย ไม่ต้องจับเมาส์
    setTimeout(() => searchInputRef.current?.focus(), 60)
  }

  // บันทึก & เพิ่มถัดไป (โหมดเพิ่มเท่านั้น): ส่ง row พร้อม addNext เพื่อให้ parent คงสถานะเปิดไว้
  const confirmAndNext = () => {
    onConfirm(buildRow(), { addNext: true })
    resetForNext()
  }

  // ── derived numbers ──
  const qtyNum = parseFloat(row.qty) || 0
  const totalNum = parseFloat(row.total) || 0
  const typedCost = parseFloat(row.cost_price)
  const cost = isFinite(typedCost) && typedCost > 0 ? typedCost : (qtyNum > 0 ? totalNum / qtyNum : 0)
  const expMonths = monthsToExpiry(row.expiry_date)

  // ทุนล่าสุดจริง (last_cost_price) ปรับสเกลตามหน่วยที่เลือกรับเข้า — ใช้เป็นทั้งตัวเลขอ้างอิงที่โชว์
  // (step 1 + step 2) และ baseline เทียบ "ทุนเปลี่ยน" เพื่อให้ทุกจุดอิงค่าเดียวกัน ไม่ขัดกันเอง.
  // last_cost_price ถือเป็น "ต่อหน่วยฐาน" (ตามธรรมเนียมการโชว์เดิมของ step 1) → คูณ qty_per_base
  // ของหน่วยที่เลือก. baseline = last_cost_price เท่านั้น ไม่ fallback weighted-avg (ของฟรี=0 ต้องคง 0).
  const selectedQtyPerBase = row.units.find(u => u.unit_name === row.unit_name)?.qty_per_base ?? 1
  const lastCostForUnit = row.stored_last_cost != null ? row.stored_last_cost * selectedQtyPerBase : null
  const stockOnHand = existingLots
    .filter(l => l.is_cancelled === 0 && l.is_closed === 0 && l.qty_on_hand > 0)
    .reduce((sum, l) => sum + l.qty_on_hand, 0)
  const prevCost = lastCostForUnit
  const costChanged = prevCost != null && cost > 0 && Math.abs(cost - prevCost) > 0.0001

  // sub-label previews for the rail
  const railSub = (s: number): React.ReactNode => {
    if (!isDone(s) && s !== step) {
      return ['ค้นหา / ยิงบาร์โค้ด', 'จำนวน · ต้นทุน', 'Lot No. และวันหมดอายุ', 'ตรวจสอบ · ยืนยัน'][s]
    }
    switch (s) {
      case 0: return row.trade_name ? `${row.trade_name} · ${row.unit_name}` : 'ยังไม่เลือก'
      case 1: return qtyNum > 0 ? `${formatNum(row.qty)} ${row.unit_name} · ฿${formatNum(row.total, true)}` : 'ยังไม่กรอก'
      case 2: return row.lot_number
        ? <span className="inline-flex items-center gap-1">{row.lot_number} · <ClockAlert className="size-3 shrink-0" />{formatDate(row.expiry_date)}</span>
        : 'ยังไม่กรอก'
      case 3: return totalNum > 0 ? `รวม ฿${formatNum(row.total, true)}` : 'พร้อมยืนยัน'
      default: return ''
    }
  }

  // Enter walks to the next text field in the current step; on the last field
  // it advances the step. Lets staff type → Enter → type → Enter straight down
  // a step without reaching for Tab. Each step's first field has autoFocus, so
  // advancing also drops focus onto the next step's first field.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    // Enter inside the search box is handled there (select suggestion)
    const target = e.target as HTMLElement
    if (target.dataset?.role === 'search') return
    e.preventDefault()
    const pane = e.currentTarget as HTMLElement
    const fields = Array.from(
      pane.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([disabled]):not([readonly]):not([tabindex="-1"])'),
    ).filter(el => el.offsetParent !== null)
    const idx = fields.indexOf(target as HTMLInputElement)
    if (idx >= 0 && idx < fields.length - 1) {
      const next = fields[idx + 1]
      next.focus()
      next.select?.()
      return
    }
    goNext()
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        size="3xl"
        onClose={onClose}
        className="h-[70vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 overflow-hidden"
      >
        {/* ── Header ── */}
        <DialogHeader className="flex-row items-center gap-3 px-5 py-3 border-b border-border">
          <TintIcon icon={Plus} tint="primary" size="md" bordered />
          <div className="min-w-0">
            <DialogTitle className="text-lg">{editing ? 'แก้ไขรายการรับสินค้า' : 'เพิ่มสินค้า'}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {row.trade_name ? `${row.trade_name} · กรอกข้อมูลการรับเข้า` : 'เลือกสินค้าที่จะรับเข้า แล้วกรอกข้อมูลทีละขั้นตอน'}
            </p>
          </div>
        </DialogHeader>

        {/* ── Body: rail + pane ── */}
        <DialogBody className="p-0 min-h-0 overflow-hidden flex" onKeyDown={handleKeyDown}>

          {/* timeline rail */}
          <div className="w-52 shrink-0 border-r border-border bg-muted/40 overflow-y-auto scrollbar-thin p-4">
            {STEPS.map((s, i) => {
              const done = isDone(i)
              const active = i === step
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => jump(i)}
                  className="relative flex w-full items-start gap-3 pb-5 last:pb-0 text-left"
                >
                  {i < LAST && (
                    <span className={`absolute left-[13px] top-7 bottom-1 w-0.5 ${done ? 'bg-primary' : 'bg-border'}`} />
                  )}
                  <span className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors
                    ${done ? 'border-primary bg-primary text-primary-foreground'
                      : active ? 'border-primary text-primary ring-4 ring-ring/40'
                      : 'border-border bg-card text-foreground-subtle'}`}>
                    {done ? <Check className="size-4" /> : active ? (() => { const Icon = s.icon; return <Icon className="size-3.5" /> })() : i + 1}
                  </span>
                  <span className="min-w-0 pt-1">
                    <span className={`block text-sm font-semibold ${active || done ? 'text-foreground' : 'text-foreground-subtle'}`}>{s.title}</span>
                    <span className={`block text-xs mt-0.5 truncate max-w-[140px] ${done ? 'text-primary font-medium' : 'text-foreground-subtle'}`}>{railSub(i)}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* content pane */}
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-7 py-6">

            {/* STEP 1 — product */}
            {step === 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4">เลือกสินค้า</h3>

                {row.product_id === 0 ? (
                  <div>
                    <SearchInput
                      ref={searchInputRef}
                      autoFocus
                      data-role="search"
                      value={query}
                      onChange={e => runSearch(e.target.value)}
                      onFocus={() => { if (query.trim()) setSearchOpen(true) }}
                      placeholder="พิมพ์ชื่อ รหัส หรือยิงบาร์โค้ด เพื่อค้นหาสินค้า…"
                      wrapperClassName="w-full"
                      className="h-9 text-base"
                      autoComplete="off"
                    />
                    <p className="text-sm text-foreground-subtle mt-3">พิมพ์ชื่อ รหัส หรือยิงบาร์โค้ด ระบบจะเปิดหน้าต่างค้นหาให้เลือกสินค้า แล้วจึงเลือกหน่วยที่รับเข้า</p>
                  </div>
                ) : (
                  <div>
                    {/* name frame */}
                    <div className="flex h-14 items-center gap-3 rounded-lg border-2 border-primary bg-primary-soft/50 px-4 py-2">
                      <div className="min-w-0 flex-1 text-xl font-bold truncate text-primary">{row.trade_name}</div>
                      <Button type="button" variant="elevated" size="icon-sm" onClick={clearProduct} tooltip="เปลี่ยนสินค้า" className="h-8 w-8 shrink-0">
                        <RotateCcw className="size-4" />
                      </Button>
                    </div>

                    {/* price frame — cost / sell / stock */}
                    <div className="mt-2.5 grid h-14 grid-cols-3 divide-x divide-border overflow-hidden rounded-lg bg-amber-soft/50 border border-amber-strong/25">
                      <div className="px-4 py-2">
                        <div className="text-sm text-muted-foreground">ทุนล่าสุด</div>
                        <div className="mt-0.5 text-sm font-bold text-amber-strong">{lastCostForUnit != null ? formatCurrency(lastCostForUnit) : '—'}</div>
                      </div>
                      <div className="px-4 py-2">
                        <div className="text-sm text-muted-foreground">ราคาขายปัจจุบัน</div>
                        <div className="mt-0.5 text-sm font-bold text-amber-strong">{formatCurrency(row.default_sell_price ?? 0)}</div>
                      </div>
                      <div className="px-4 py-2">
                        <div className="text-sm text-muted-foreground">คงเหลือ</div>
                        <div className="mt-0.5 text-sm font-bold text-amber-strong">{stockOnHand.toLocaleString()} {row.units[0]?.unit_name ?? ''}</div>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-muted-foreground mt-5 mb-2.5">หน่วยที่รับเข้า</div>
                    <div className="flex gap-2 flex-wrap">
                      {row.units.map(u => (
                        <Button
                          key={u.id}
                          type="button"
                          variant="primary-soft"
                          onClick={() => selectUnit(u)}
                          className={`h-7 w-auto px-4 text-sm font-semibold rounded-md ${u.unit_name === row.unit_name ? 'ring-1 ring-primary' : ''}`}
                        >
                          {u.unit_name}
                        </Button>
                      ))}
                    </div>

                    {/* pack size — qty of the SELECTED unit per base unit, single line */}
                    <div className="mt-3 h-7 w-44 flex items-center gap-2 rounded-lg border border-amber-strong/25 bg-amber-soft/50 px-4 py-2 text-xs">
                      <Info className="size-3 shrink-0" />
                      <span className="text-muted-foreground">ขนาดบรรจุ</span>
                      <span className="font-bold text-amber-strong">
                        = {row.units.find(u => u.unit_name === row.unit_name)?.qty_per_base ?? 1} {row.units[0]?.unit_name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3 — lot, mfg, expiry + existing-lot FEFO reference */}
            {step === 2 && (
              <div>
                <h3 className="text-lg font-bold mb-4">Lot &amp; วันหมดอายุ</h3>

                {/* Lot No. แก้ได้ตลอด; วันผลิต/วันหมดอายุ read-only เมื่อเลขตรงล็อตเดิม (backend ไม่แก้ exp/mfg ตอน merge) */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Lot No. <span className="text-destructive">*</span></label>
                    <Input autoFocus value={row.lot_number} onChange={e => patch({ lot_number: e.target.value })} maxLength={30} placeholder="เช่น A2401" className="h-9" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันผลิต</label>
                    {matchedLot ? (
                      <div className="h-9 px-3 flex items-center bg-muted border border-border rounded-md text-sm text-muted-foreground">{matchedLot.manufactured_date ? formatDate(matchedLot.manufactured_date) : '—'}</div>
                    ) : (
                      <DateInput value={row.manufactured_date} onChange={v => patch({ manufactured_date: v })} className="h-9" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันหมดอายุ {!matchedLot && <span className="text-destructive">*</span>}</label>
                    {matchedLot ? (
                      <div className="h-9 px-3 flex items-center bg-muted border border-border rounded-md text-sm text-muted-foreground">{matchedLot.expiry_date ? formatDate(matchedLot.expiry_date) : '—'}</div>
                    ) : (
                      <DateInput value={row.expiry_date} onChange={v => patch({ expiry_date: v })} className="h-9" />
                    )}
                  </div>
                </div>

                {/* chip ยาวเท่าข้อความ บรรทัดเดียวกัน: ล็อตซ้ำชิดซ้าย (amber) + อายุคงเหลือชิดขวาให้ตรงวันหมดอายุ (สีตามความเร่งด่วน) */}
                {(matchedLot || expMonths !== null) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {matchedLot && (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-strong/30 bg-amber-soft/50 px-3 py-1.5 text-xs text-amber-strong">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>ล็อต {matchedLot.lot_number} มีอยู่แล้วในสต็อก</span>
                      </div>
                    )}
                    {expMonths !== null && (
                      <div className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                        expMonths <= 0 ? 'border-destructive bg-destructive text-destructive-foreground'
                        : expMonths <= 6 ? 'border-destructive/30 bg-destructive-soft/50 text-destructive'
                        : expMonths <= 12 ? 'border-border bg-muted/50 text-foreground-subtle'
                        : 'border-primary/30 bg-primary-soft/50 text-primary'}`}>
                        <ClockAlert className="size-3.5 shrink-0" />
                        <span>{expMonths <= 0 ? 'สินค้าหมดอายุแล้ว — โปรดตรวจสอบวันที่อีกครั้ง' : `เหลืออายุ ${expMonths} เดือน`}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ล็อตเดิมในสต็อก — คลิกแถวเพื่อรับเข้าล็อตนั้น (merge); ไม่เลือก = สร้างล็อตใหม่จากฟอร์มด้านบน */}
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-muted-foreground">รายการสต็อก</h4>
                      <p className="text-xs text-foreground-subtle mt-0.5">คลิกล็อตเพื่อรับเข้าล็อตเดิม หรือกรอกเลขล็อตใหม่ด้านบน</p>
                    </div>
                    <Button
                      type="button"
                      variant={showClosedLots ? 'default' : 'elevated'}
                      size="sm"
                      onClick={() => setShowClosedLots(v => !v)}
                      className="shrink-0"
                    >
                      แสดงล็อตที่หมดแล้ว
                    </Button>
                  </div>
                  {lotsLoading ? (
                    <div className="rounded-lg border border-border px-4 py-6 text-center text-sm text-foreground-subtle">กำลังโหลดล็อต…</div>
                  ) : (
                    <Table containerClassName="rounded-lg border border-border max-h-60 overflow-auto scrollbar-thin">
                      <TableHeader>
                        {/* ลดความสูง header ของตารางล็อตนี้เป็น h-9 (default primitive = h-10) — override เฉพาะที่นี่ */}
                        <TableRow className="[&>th]:h-9">
                          <SortableTableHead field="lot_number" sort={lotSort} onToggle={toggleLotSort}>เลขที่ล็อต</SortableTableHead>
                          <SortableTableHead field="expiry_date" sort={lotSort} onToggle={toggleLotSort}>วันหมดอายุ</SortableTableHead>
                          <SortableTableHead field="qty_on_hand" align="right" sort={lotSort} onToggle={toggleLotSort}>คงเหลือ</SortableTableHead>
                          <TableHead>สถานะ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLots.map(l => {
                          const selected = matchedLot?.id === l.id
                          const depleted = l.is_closed === 1 || l.qty_on_hand <= 0
                          return (
                            <TableRow
                              key={l.id}
                              onClick={() => {
                                // เลือกล็อตเดิม → ย้ายโฟกัสไปปุ่ม "ถัดไป" (หน่วงให้ปุ่มพ้น disabled ก่อน)
                                // เพื่อให้กด Enter ไปต่อได้ทันที โดยไม่ต้องจับเมาส์ (เหมือน pickProduct ใน step 1)
                                patch({ lot_number: l.lot_number })
                                setTimeout(() => nextBtnRef.current?.focus(), 50)
                              }}
                              data-state={selected ? 'selected' : undefined}
                              className="cursor-pointer"
                            >
                              <TableCell className="font-medium text-foreground">
                                <span className="flex items-center gap-1.5">
                                  {selected && <Check className="size-3.5 text-primary" />}
                                  {l.lot_number}
                                </span>
                              </TableCell>
                              <TableCell>{l.expiry_date ? formatDate(l.expiry_date) : '—'}</TableCell>
                              <TableCell className="text-right">{l.qty_on_hand.toLocaleString()}</TableCell>
                              <TableCell>
                                {depleted
                                  ? <Badge variant="destructive-outline">หมด</Badge>
                                  : <Badge variant="success-outline">ใช้งาน</Badge>}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {sortedLots.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-10 text-center text-sm text-foreground-subtle">
                              {showClosedLots
                                ? 'ยังไม่มีล็อตของสินค้านี้ — นี่คือล็อตแรก'
                                : 'ไม่มีล็อตคงเหลือ — เปิดสวิตช์เพื่อดูล็อตที่ปิดแล้ว หรือกรอกเลขล็อตใหม่ด้านบน'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2 — qty & cost */}
            {step === 1 && (
              <div>
                <h3 className="text-lg font-bold mb-4">จำนวน &amp; ต้นทุน</h3>

                {/* อ้างอิงตอนกรอกต้นทุน: ทุนล่าสุดที่จ่ายจริง + ราคาขายปัจจุบัน (ของหน่วยที่รับเข้า) */}
                <div className="mb-4 grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg bg-amber-soft/50 border border-amber-strong/25">
                  <div className="px-4 py-2">
                    <div className="text-sm text-muted-foreground">ทุนล่าสุด</div>
                    <div className="mt-0.5 text-sm font-bold text-amber-strong">{lastCostForUnit != null ? formatCurrency(lastCostForUnit) : '—'}</div>
                  </div>
                  <div className="px-4 py-2">
                    <div className="text-sm text-muted-foreground">ราคาขายปัจจุบัน</div>
                    <div className="mt-0.5 text-sm font-bold text-amber-strong">{formatCurrency(row.default_sell_price ?? 0)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">จำนวน ({row.unit_name}) <span className="text-destructive">*</span></label>
                    <Input
                      autoFocus type="text" inputMode="decimal"
                      value={row.qty}
                      onChange={e => lineMath('qty', stripCommas(e.target.value))}
                      onFocus={e => e.currentTarget.select()}
                      placeholder="0" className="h-9 text-base font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ต้นทุน/หน่วย</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.cost_price}
                      onChange={e => lineMath('cost_price', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.cost_price); if (isFinite(n)) lineMath('cost_price', n.toFixed(2)) }}
                      placeholder="0.00" className="h-9 text-base font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ราคารวม</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.total}
                      onChange={e => lineMath('total', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.total); if (isFinite(n)) lineMath('total', n.toFixed(2)) }}
                      placeholder="0.00" className="h-9 text-base font-bold text-center"
                    />
                  </div>
                </div>

                {/* ต้นทุนที่กรอกต่างจากทุนล่าสุด → เตือนทิศทาง+ส่วนต่าง เพื่อไปทบทวนราคาขายให้ถูกต้อง */}
                {costChanged && (
                  <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
                    cost - prevCost! > 0 ? 'border-destructive/30 bg-destructive-soft/50 text-destructive'
                                         : 'border-success/30 bg-success-soft/50 text-success'}`}>
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <b className="font-semibold">ต้นทุน{cost - prevCost! > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} {formatCurrency(Math.abs(cost - prevCost!))} บาท</b> — กรุณาตรวจสอบราคาขาย
                    </div>
                  </div>
                )}

                {!showDiscount ? (
                  <Button type="button" variant="link" onClick={() => setShowDiscount(true)} className="mt-3 h-auto p-0 text-sm font-semibold text-primary">+ เพิ่มส่วนลดรายการ (ไม่บังคับ)</Button>
                ) : (
                  <div className="mt-4 max-w-[calc(33%-0.5rem)]">
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ส่วนลด (บาท)</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.discount}
                      onChange={e => lineMath('discount', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.discount); if (isFinite(n)) lineMath('discount', n.toFixed(2)) }}
                      placeholder="0.00" className="h-9 text-right"
                    />
                  </div>
                )}
                {/* ประวัติราคาทุนที่ได้รับจริง — ผู้จำหน่าย + ทุนที่จ่ายในแต่ละครั้ง อ่านจาก ledger
                    (ไม่ใช่ทุนเฉลี่ย) เพื่อเทียบราคาก่อนกรอกต้นทุนรอบนี้ */}
                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">ประวัติราคาทุน</h4>
                  {historyLoading ? (
                    <div className="rounded-lg border border-border px-4 py-6 text-center text-sm text-foreground-subtle">กำลังโหลดประวัติ…</div>
                  ) : purchaseHistory.length === 0 ? (
                    <div className="rounded-lg border border-border px-4 py-6 text-center text-sm text-foreground-subtle">ยังไม่มีประวัติการรับเข้าของสินค้านี้</div>
                  ) : (
                    <Table containerClassName="rounded-lg border border-border max-h-60 overflow-auto scrollbar-thin">
                      <TableHeader>
                        <TableRow className="[&>th]:h-9">
                          <TableHead className="w-8 px-1" />
                          <TableHead>วันที่</TableHead>
                          <TableHead>ผู้จำหน่าย</TableHead>
                          <TableHead className="text-right">จำนวน</TableHead>
                          <TableHead className="text-right">ราคาทุน/หน่วย</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseHistory.map((h, i) => {
                          // รับเป็นหน่วยใหญ่กว่าหน่วยฐาน → ขยายดูทุนต่อหน่วยย่อยสุดได้
                          const expandable = h.qty_per_base > 1
                          const open = expandedHistory.has(i)
                          const baseUnitName = row.units[0]?.unit_name ?? ''
                          return (
                            <React.Fragment key={`${h.invoice_no}-${i}`}>
                              <TableRow
                                onClick={expandable ? () => setExpandedHistory(s => {
                                  const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n
                                }) : undefined}
                                className={expandable ? 'cursor-pointer' : undefined}
                              >
                                <TableCell className="w-8 px-1 text-center">
                                  {expandable && (
                                    <ChevronRight className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                                  )}
                                </TableCell>
                                <TableCell>{formatDate(h.order_date || h.created_at)}</TableCell>
                                <TableCell className="font-medium text-foreground">{h.supplier_name || '—'}</TableCell>
                                <TableCell className="text-right">{formatNum(String(h.qty))} {h.unit_name || ''}</TableCell>
                                <TableCell className="text-right font-semibold text-primary">{formatCurrency(h.cost_price)}</TableCell>
                              </TableRow>
                              {expandable && open && (
                                <TableRow className="bg-muted/30">
                                  <TableCell className="w-8 px-1" />
                                  <TableCell />
                                  <TableCell />
                                  <TableCell className="text-right">
                                    <span className="inline-block text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200">1 {baseUnitName}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className="inline-block text-xs font-semibold text-primary animate-in fade-in slide-in-from-top-1 duration-200">{formatCurrency(h.cost_price / h.qty_per_base)}</span>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4 — summary & confirm */}
            {step === 3 && (
              <div>
                <h3 className="text-lg font-bold mb-4">สรุป &amp; ยืนยัน<span className="ml-2 text-xs text-foreground-subtle"></span></h3>
                <div className="rounded-card border border-border bg-muted/40 p-3.5">
                  <h4 className="text-sm font-bold text-foreground-subtle mb-2">รายการที่จะ{editing ? 'บันทึก' : 'เพิ่ม'}</h4>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">สินค้า</span><span className="font-semibold">{row.trade_name}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">Lot</span><span className="font-semibold">{row.lot_number}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">วันหมดอายุ</span><span className="font-semibold">{formatDate(row.expiry_date)}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">จำนวน</span><span className="font-semibold">{formatNum(row.qty)} {row.unit_name}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">ราคาทุน</span><span className="font-semibold">{formatCurrency(cost)}</span></div>
                  <div className="flex justify-between text-sm py-1 border-t border-border mt-1 pt-2"><span className="text-foreground-subtle">รวมเป็นเงิน</span><span className="font-extrabold text-primary">{formatCurrency(totalNum)}</span></div>
                </div>
              </div>
            )}

          </div>
        </DialogBody>

        {/* ── Footer ── */}
        <DialogFooter className="flex-row items-center gap-2.5 px-5 py-3.5 border-t border-border">
          <span className="text-xs text-foreground-subtle mr-auto">ขั้นที่ <b className="text-foreground">{step + 1}</b> จาก <b className="text-foreground">{STEPS.length}</b></span>
          <Button type="button" variant="elevated" size="lg" onClick={goBack} disabled={step === 0} className="gap-1.5">
            <ChevronLeft className="size-4" /> ย้อนกลับ
          </Button>
          {step === LAST ? (
            editing ? (
              <Button ref={confirmBtnRef} type="button" variant="success" size="lg" onClick={confirm} className="gap-1.5">
                <Save className="size-4" /> บันทึกการแก้ไข
              </Button>
            ) : (
              <>
                <Button type="button" variant="success-soft" size="lg" onClick={confirm} className="gap-1.5">
                  <Save className="size-4" /> บันทึก
                </Button>
                {/* default/Enter → บันทึกแล้ววนรับตัวถัดไป (สแกนต่อได้ทันที); เสร็จแล้วกด Esc ปิด */}
                <Button ref={confirmBtnRef} type="button" variant="success" size="lg" onClick={confirmAndNext} className="gap-1.5">
                  <Save className="size-4" /> บันทึกและเพิ่มใหม่
                </Button>
              </>
            )
          ) : (
            <Button ref={nextBtnRef} type="button" size="lg" onClick={goNext} disabled={!canNext} className="gap-1.5">
              ถัดไป <ChevronRight className="size-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Shared product-search modal — opens on top of the wizard when the user
        types in the step-1 field (same picker as POS / EditBundle). Keyboard
        nav + highlight are owned internally; this consumer owns query/results. */}
    <ProductSearchDialog<SearchItem>
      open={searchOpen}
      onClose={closeSearch}
      query={query}
      onQueryChange={runSearch}
      searching={searching}
      rows={flatItems}
      resultCount={flatItems.length}
      initialIdx={searchInitialIdx}
      inputRef={modalSearchRef}
      rowKey={(it) => `${it.product.id}:${it.unit?.id ?? 'base'}`}
      rowClassName="grid items-center px-4 py-2.5"
      rowStyle={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
      onPick={(it) => pickProduct(it.product, it.unit)}
      placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อ/รหัสสินค้าเพื่อเพิ่ม..."
      header={
        <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
          style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
          <div>ชื่อสินค้า</div>
          <div className="text-center">หน่วย</div>
          <div className="text-right">ราคาทุน</div>
          <div className="text-right">คงเหลือ</div>
        </div>
      }
      renderRow={(it) => {
        const p = it.product
        // คงเหลือ = สต็อกฐานดิบ (ไม่แปลงตามหน่วย) ให้แสดงผลเหมือนหน้า POS
        const baseStock = p.lots?.reduce((s, l) => s + (l.qty_on_hand ?? 0), 0) ?? 0
        // ราคาทุน = ทุนล่าสุด (ระดับสินค้า/หน่วยฐาน — product_units ไม่เก็บ cost)
        const cost = p.last_cost_price ?? 0
        const unitName = it.unit?.unit_name ?? p.unit_name ?? '-'
        return (
          <>
            <div className="min-w-0 pr-2">
              <div className="font-semibold text-base flex items-center gap-1.5 truncate">
                <span className="truncate">{p.trade_name}</span>
                {baseStock === 0 && <Badge variant="destructive-outline" className="shrink-0">หมด</Badge>}
              </div>
            </div>
            <div className="text-center text-base text-muted-foreground truncate">{unitName}</div>
            <div className="text-right font-bold text-primary text-base">{formatCurrency(cost)}</div>
            <div className={`text-right text-base font-semibold ${baseStock > 0 ? 'text-foreground' : 'text-destructive'}`}>{baseStock}</div>
          </>
        )
      }}
    />
    </>
  )
}
