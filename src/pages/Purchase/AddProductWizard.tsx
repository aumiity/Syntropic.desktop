import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { ProductSearchDialog } from '@/components/dialogs/ProductSearchDialog'
import { TintIcon } from '@/components/ui/tint-icon'
import { formatCurrency } from '@/lib/utils'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import {
  Check, ChevronLeft, ChevronRight, Plus, RotateCcw,
  AlertTriangle, ShoppingBag, CalendarClock, Coins, Tag, Info, Lock, ClipboardCheck,
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

// ราคาขายต่อหน่วยที่แก้ได้ใน step 4 (ฐาน + variants ที่ is_for_sale).
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
  qty: string
  cost_price: string
  discount: string
  total: string
  note: string
  /** หน่วยที่ขายได้ (ฐาน + is_for_sale variants) สำหรับตัวแก้ราคา step 4 — capture ตอนเลือกสินค้า */
  sell_units?: SellUnitPrice[]
}

export const emptyRow = (): ReceiptRow => ({
  product_id: 0, trade_name: '', product_code: '',
  unit_name: '', units: [], default_sell_price: 0,
  lot_number: '', manufactured_date: '', expiry_date: '',
  qty: '', cost_price: '', discount: '', total: '', note: '',
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
  { title: 'Lot & วันหมดอายุ', icon: CalendarClock },
  { title: 'จำนวน & ต้นทุน', icon: Coins },
  { title: 'ราคาขาย', icon: Tag },
  { title: 'สรุป & ยืนยัน', icon: ClipboardCheck },
] as const
const LAST = STEPS.length - 1

interface AddProductWizardProps {
  open: boolean
  onClose: () => void
  onConfirm: (row: ReceiptRow) => void
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

  // optional fields revealed on demand
  const [showMfg, setShowMfg] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)

  // drafts ราคาต่อหน่วย: key = SellUnitPrice.key ('base' | product_unit_id) → 3 ราคา (string)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { retail: string; ws1: string; ws2: string }>>({})

  const { run: runOverride, dialog: overrideDialog, isAdmin } = useManagerOverride()
  // ปลดล็อกการแก้ราคา: admin ปลดอัตโนมัติ; พนักงานต้องผ่าน verifyAdmin ก่อน
  const [priceUnlocked, setPriceUnlocked] = useState(false)
  const [grantedOverride, setGrantedOverride] = useState<{ userId: number; password: string } | undefined>(undefined)
  const canEditPrice = isAdmin || priceUnlocked

  // ── (re)initialise whenever the dialog opens ──
  useEffect(() => {
    if (!open) return
    const base = editing ? { ...editing } : emptyRow()
    setRow(base)
    setQuery(editing?.trade_name ?? '')
    setSuggestions([])
    setSearchOpen(false)
    setSearching(false)
    setShowMfg(!!editing?.manufactured_date)
    setShowDiscount(!!editing && parseFloat(editing.discount) > 0)
    setStep(0)
    setPriceUnlocked(false)
    setGrantedOverride(undefined)
    const su = editing?.sell_units ?? []
    const drafts: Record<string, { retail: string; ws1: string; ws2: string }> = {}
    for (const u of su) drafts[u.key] = { retail: String(u.price_retail || ''), ws1: String(u.price_wholesale1 || ''), ws2: String(u.price_wholesale2 || '') }
    setPriceDrafts(drafts)
  }, [open, editing])

  const patch = useCallback((f: Partial<ReceiptRow>) => setRow(r => ({ ...r, ...f })), [])

  // เมื่อเลือกสินค้าใหม่ (sell_units มาทีหลัง pick) → seed drafts ถ้ายังว่าง
  useEffect(() => {
    const su = row.sell_units ?? []
    if (su.length === 0) return
    setPriceDrafts(prev => {
      if (Object.keys(prev).length > 0) return prev
      const d: Record<string, { retail: string; ws1: string; ws2: string }> = {}
      for (const u of su) d[u.key] = { retail: String(u.price_retail || ''), ws1: String(u.price_wholesale1 || ''), ws2: String(u.price_wholesale2 || '') }
      return d
    })
  }, [row.sell_units])

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
    }))
    setQuery(p.trade_name)
    setSuggestions([])
    setSearchOpen(false)
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
    setPriceDrafts({})
    setQuery('')
    setSuggestions([])
    setSearchOpen(false)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const selectUnit = (u: ProductUnitOption) => {
    patch({ unit_name: u.unit_name, default_sell_price: u.price_retail ?? row.default_sell_price })
  }

  // ── per-step validation ──
  const stepValid = (s: number): boolean => {
    switch (s) {
      case 0: return row.product_id > 0
      case 1: return row.lot_number.trim() !== '' && row.expiry_date !== ''
      case 2: return parseFloat(row.qty) > 0 && parseFloat(row.total) > 0
      case 3: return true
      case 4: return true
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

  const requestPriceUnlock = () => {
    runOverride(
      async (ov) => {
        await window.api.auth.verifyAdmin(ov)   // throws ถ้ารหัสผิด → dialog ค้างโชว์ error
        setGrantedOverride(ov)
        setPriceUnlocked(true)
      },
      { title: 'ขอสิทธิ์แก้ราคา', description: 'การแก้ราคาขายต้องใช้สิทธิ์ผู้ดูแลระบบ' },
    )
  }

  const confirm = async () => {
    const units = row.sell_units ?? []
    if (row.product_id > 0 && canEditPrice) {
      try {
        for (const u of units) {
          const d = priceDrafts[u.key]
          if (!d) continue
          const nRetail = parseFloat(d.retail); const nWs1 = parseFloat(d.ws1); const nWs2 = parseFloat(d.ws2)
          if (u.product_unit_id === null) {
            // หน่วยฐาน → updatePrice ต่อ price_type ที่เปลี่ยน (log + gate)
            if (isFinite(nRetail) && Math.abs(nRetail - u.price_retail) > 0.0001)
              await window.api.products.updatePrice(row.product_id, { price_type: 'retail', new_price: nRetail, note: 'แก้ราคาจากหน้ารับสินค้า' }, grantedOverride)
            if (isFinite(nWs1) && Math.abs(nWs1 - u.price_wholesale1) > 0.0001)
              await window.api.products.updatePrice(row.product_id, { price_type: 'wholesale1', new_price: nWs1, note: 'แก้ราคาจากหน้ารับสินค้า' }, grantedOverride)
            if (isFinite(nWs2) && Math.abs(nWs2 - u.price_wholesale2) > 0.0001)
              await window.api.products.updatePrice(row.product_id, { price_type: 'wholesale2', new_price: nWs2, note: 'แก้ราคาจากหน้ารับสินค้า' }, grantedOverride)
          } else {
            // หน่วยอื่น → updateUnitPrice (ไม่ log) เฉพาะฟิลด์ที่เปลี่ยน
            const patch: { price_retail?: number; price_wholesale1?: number; price_wholesale2?: number } = {}
            if (isFinite(nRetail) && Math.abs(nRetail - u.price_retail) > 0.0001) patch.price_retail = nRetail
            if (isFinite(nWs1) && Math.abs(nWs1 - u.price_wholesale1) > 0.0001) patch.price_wholesale1 = nWs1
            if (isFinite(nWs2) && Math.abs(nWs2 - u.price_wholesale2) > 0.0001) patch.price_wholesale2 = nWs2
            if (Object.keys(patch).length > 0)
              await window.api.products.updateUnitPrice(u.product_unit_id, patch, grantedOverride)
          }
        }
      } catch (e: any) {
        console.error('[wizard] price write failed:', e?.message)
        return  // ไม่ปิด wizard ถ้าเขียนราคาพลาด
      }
    }
    // default_sell_price ของ row = ราคาปลีกของหน่วยที่รับเข้า (สำหรับ lot.sell_price + แสดงในตาราง GR)
    const receivedKey = units.find(u => u.unit_name === row.unit_name)?.key ?? 'base'
    const receivedRetail = parseFloat(priceDrafts[receivedKey]?.retail ?? '')
    onConfirm({ ...row, default_sell_price: isFinite(receivedRetail) ? receivedRetail : row.default_sell_price })
  }

  // ── derived numbers for step 4 ──
  const qtyNum = parseFloat(row.qty) || 0
  const totalNum = parseFloat(row.total) || 0
  const typedCost = parseFloat(row.cost_price)
  const cost = isFinite(typedCost) && typedCost > 0 ? typedCost : (qtyNum > 0 ? totalNum / qtyNum : 0)
  // ราคาปลีกของ "หน่วยที่รับเข้า" (row.unit_name) จาก drafts — ใช้คำนวณกำไรการ์ดสรุป
  const receivedUnitKey = (row.sell_units ?? []).find(u => u.unit_name === row.unit_name)?.key ?? 'base'
  const sellNum = parseFloat(priceDrafts[receivedUnitKey]?.retail ?? '') || 0
  const profit = sellNum - cost
  const marginPct = cost > 0 ? (profit / cost) * 100 : 0
  const expMonths = monthsToExpiry(row.expiry_date)

  // ทุนเปลี่ยน: เทียบทุน/หน่วยที่กรอก (cost) กับทุนล่าสุดที่จ่ายจริง (stored_last_cost).
  // ใช้ last_cost_price เป็น baseline — ไม่ fallback ไป weighted-avg (ของฟรี=0 ต้องคง 0).
  const prevCost = row.stored_last_cost
  const costChanged = prevCost != null && cost > 0 && Math.abs(cost - prevCost) > 0.0001

  // sub-label previews for the rail
  const railSub = (s: number): string => {
    if (!isDone(s) && s !== step) {
      return ['ค้นหา / ยิงบาร์โค้ด', 'Lot No. และวันหมดอายุ', 'จำนวน · ต้นทุน', 'ราคาขาย · กำไร', 'ตรวจสอบ · ยืนยัน'][s]
    }
    switch (s) {
      case 0: return row.trade_name ? `${row.trade_name} · ${row.unit_name}` : 'ยังไม่เลือก'
      case 1: return row.lot_number ? `${row.lot_number} · หมด ${row.expiry_date}` : 'ยังไม่กรอก'
      case 2: return qtyNum > 0 ? `${formatNum(row.qty)} ${row.unit_name} · ฿${formatNum(row.total, true)}` : 'ยังไม่กรอก'
      case 3: return sellNum > 0 ? `ขาย ฿${formatNum(priceDrafts[receivedUnitKey]?.retail ?? '', true)} · กำไร ${marginPct.toFixed(1)}%` : 'ยังไม่กำหนด'
      case 4: return totalNum > 0 ? `รวม ฿${formatNum(row.total, true)}` : 'พร้อมยืนยัน'
      default: return ''
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    // Enter inside the search box is handled there (select suggestion)
    const target = e.target as HTMLElement
    if (target.dataset?.role === 'search') return
    e.preventDefault()
    goNext()
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        size="3xl"
        onClose={onClose}
        className="h-[580px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 overflow-hidden"
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
                      className="h-10 text-base"
                      autoComplete="off"
                    />
                    <p className="text-sm text-foreground-subtle mt-3">พิมพ์ชื่อ รหัส หรือยิงบาร์โค้ด ระบบจะเปิดหน้าต่างค้นหาให้เลือกสินค้า แล้วจึงเลือกหน่วยที่รับเข้า</p>
                  </div>
                ) : (
                  <div>
                    {/* name frame */}
                    <div className="flex items-center gap-3 rounded-lg border-2 border-primary bg-primary-soft/50 px-4 py-2">
                      <div className="min-w-0 flex-1 text-base font-bold truncate text-primary">{row.trade_name}</div>
                      <Button type="button" variant="elevated" size="icon-sm" onClick={clearProduct} tooltip="เปลี่ยนสินค้า" className="h-8 w-8 shrink-0">
                        <RotateCcw className="size-4" />
                      </Button>
                    </div>

                    {/* price frame — cost / sell, split into two cells */}
                    <div className="mt-2.5 grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg bg-accent-soft/50 border border-accent-soft-foreground/25">
                      <div className="px-4 py-2">
                        <div className="text-sm text-muted-foreground">ทุนล่าสุด</div>
                        <div className="mt-0.5 text-sm font-bold text-accent-soft-foreground">{formatCurrency((row.stored_cost_price ?? 0) * (row.units.find(u => u.unit_name === row.unit_name)?.qty_per_base ?? 1))}</div>
                      </div>
                      <div className="px-4 py-2">
                        <div className="text-sm text-muted-foreground">ราคาขายปัจจุบัน</div>
                        <div className="mt-0.5 text-sm font-bold text-accent-soft-foreground">{formatCurrency(row.default_sell_price ?? 0)}</div>
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
                    <div className="mt-3 h-7 w-44 flex items-center gap-2 rounded-lg border border-accent-soft-foreground/25 bg-accent-soft/50 px-4 py-2 text-xs">
                      <Info className="size-3 shrink-0" />
                      <span className="text-muted-foreground">ขนาดบรรจุ</span>
                      <span className="font-bold text-accent-soft-foreground">
                        = {row.units.find(u => u.unit_name === row.unit_name)?.qty_per_base ?? 1} {row.units[0]?.unit_name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 — lot & expiry */}
            {step === 1 && (
              <div>
                <h3 className="text-lg font-bold mb-4">Lot &amp; วันหมดอายุ</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Lot No. <span className="text-destructive">*</span></label>
                    <Input autoFocus value={row.lot_number} onChange={e => patch({ lot_number: e.target.value })} placeholder="เช่น A2401" className="h-10" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันหมดอายุ <span className="text-destructive">*</span></label>
                    <DateInput value={row.expiry_date} onChange={v => patch({ expiry_date: v })} className="h-10" />
                  </div>
                </div>
                {!showMfg ? (
                  <Button type="button" variant="link" onClick={() => setShowMfg(true)} className="mt-3 h-auto p-0 text-sm font-semibold text-primary">+ ระบุวันผลิต (ไม่บังคับ)</Button>
                ) : (
                  <div className="mt-4 max-w-[calc(50%-0.5rem)]">
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันผลิต</label>
                    <DateInput value={row.manufactured_date} onChange={v => patch({ manufactured_date: v })} className="h-10" />
                  </div>
                )}
                {expMonths !== null && (
                  <div className={`mt-4 flex items-center gap-2 text-sm ${expMonths <= 6 ? 'text-warning-strong' : 'text-foreground-subtle'}`}>
                    <AlertTriangle className="size-4 shrink-0" />
                    {expMonths <= 0
                      ? 'สินค้าหมดอายุแล้ว — โปรดตรวจสอบวันที่อีกครั้ง'
                      : `เหลืออายุ ~${expMonths} เดือน — ระบบจ่ายออกตาม FEFO (ใกล้หมดอายุก่อน) อัตโนมัติ`}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3 — qty & cost */}
            {step === 2 && (
              <div>
                <h3 className="text-lg font-bold mb-4">จำนวน &amp; ต้นทุน</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">จำนวน ({row.unit_name}) <span className="text-destructive">*</span></label>
                    <Input
                      autoFocus type="text" inputMode="decimal"
                      value={row.qty}
                      onChange={e => lineMath('qty', stripCommas(e.target.value))}
                      placeholder="0" className="h-12 text-xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ต้นทุน/หน่วย</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.cost_price}
                      onChange={e => lineMath('cost_price', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.cost_price); if (isFinite(n)) lineMath('cost_price', n.toFixed(2)) }}
                      placeholder="0.00" className="h-12 text-xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ราคารวม</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.total}
                      onChange={e => lineMath('total', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.total); if (isFinite(n)) lineMath('total', n.toFixed(2)) }}
                      placeholder="0.00" className="h-12 text-xl font-bold text-center"
                    />
                  </div>
                </div>
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
                      placeholder="0.00" className="h-10 text-right"
                    />
                  </div>
                )}
                <div className="mt-5 rounded-card border border-border overflow-hidden">
                  <div className="flex justify-between px-4 py-2 text-sm border-b border-border">
                    <span className="text-foreground-subtle">{formatNum(row.qty) || 0} {row.unit_name} × {formatNum(row.cost_price, true) || '0.00'}</span>
                    <span className="font-medium">{formatCurrency(qtyNum * (parseFloat(row.cost_price) || 0))}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 text-sm border-b border-border">
                    <span className="text-foreground-subtle">ส่วนลด</span>
                    <span className="font-medium text-primary">−{formatCurrency(parseFloat(row.discount) || 0)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2 bg-primary-soft/50">
                    <span className="font-bold">รวมเป็นเงิน</span>
                    <span className="font-extrabold text-primary text-base">{formatCurrency(totalNum)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4 — sell price */}
            {step === 3 && (
              <div>
                <h3 className="text-lg font-bold mb-4">ราคาขาย</h3>
                {costChanged && (
                  <div className="mb-4 rounded-card border border-accent-soft-foreground/30 bg-accent-soft/50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-accent-soft-foreground">
                      <AlertTriangle className="size-4 shrink-0" />
                      ทุนเปลี่ยนจาก {formatCurrency(prevCost!)} → {formatCurrency(cost)} · ทบทวนราคาขาย
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-lg bg-card border border-border px-3 py-2">
                        <div className="text-xs text-foreground-subtle">ทุนเดิม</div>
                        <div className="font-bold">{formatCurrency(prevCost!)}</div>
                      </div>
                      <div className="rounded-lg bg-card border border-border px-3 py-2">
                        <div className="text-xs text-foreground-subtle">ทุนใหม่</div>
                        <div className="font-bold">{formatCurrency(cost)}</div>
                      </div>
                      <div className="rounded-lg bg-card border border-border px-3 py-2">
                        <div className="text-xs text-foreground-subtle">ส่วนต่าง</div>
                        <div className={`font-bold ${cost - prevCost! > 0 ? 'text-destructive' : 'text-success'}`}>
                          {cost - prevCost! > 0 ? '+' : ''}{formatCurrency(cost - prevCost!)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-card border border-border overflow-hidden">
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-px bg-border text-sm">
                    {/* header */}
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground">หน่วย</div>
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground text-right">ราคาปลีก</div>
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground text-right">ราคาส่ง 1</div>
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground text-right">ราคาส่ง 2</div>
                    {(row.sell_units ?? []).map(u => {
                      const d = priceDrafts[u.key] ?? { retail: '', ws1: '', ws2: '' }
                      const setD = (field: 'retail' | 'ws1' | 'ws2', v: string) =>
                        setPriceDrafts(prev => ({ ...prev, [u.key]: { ...(prev[u.key] ?? { retail: '', ws1: '', ws2: '' }), [field]: v } }))
                      return (
                        <React.Fragment key={u.key}>
                          <div className="bg-card px-3 py-2 flex items-center gap-2">
                            <span className="font-semibold">{u.unit_name}</span>
                            {u.qty_per_base > 1 && <span className="text-xs text-foreground-subtle">×{u.qty_per_base}</span>}
                          </div>
                          <div className="bg-card px-2 py-1.5">
                            <PriceInput value={d.retail} onChange={v => setD('retail', v)} readOnly={!canEditPrice} onFocus={e => e.currentTarget.select()} className={`h-9 text-right ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`} />
                          </div>
                          <div className="bg-card px-2 py-1.5">
                            <PriceInput value={d.ws1} onChange={v => setD('ws1', v)} readOnly={!canEditPrice} onFocus={e => e.currentTarget.select()} className={`h-9 text-right ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`} />
                          </div>
                          <div className="bg-card px-2 py-1.5">
                            <PriceInput value={d.ws2} onChange={v => setD('ws2', v)} readOnly={!canEditPrice} onFocus={e => e.currentTarget.select()} className={`h-9 text-right ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`} />
                          </div>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
                {!canEditPrice && (
                  <Button type="button" variant="elevated" size="sm" onClick={requestPriceUnlock} className="mt-3 gap-1.5">
                    <Lock className="size-3.5" /> ขอสิทธิ์แก้ราคา
                  </Button>
                )}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="rounded-card border border-border p-2.5 text-center">
                    <div className="text-xs text-foreground-subtle">ทุน</div>
                    <div className="text-lg font-extrabold mt-0.5">{formatCurrency(cost)}</div>
                  </div>
                  <div className="rounded-card border border-border p-2.5 text-center">
                    <div className="text-xs text-foreground-subtle">กำไร/หน่วย</div>
                    <div className={`text-lg font-extrabold mt-0.5 ${profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : ''}`}>{formatCurrency(profit)}</div>
                  </div>
                  <div className="rounded-card border border-border p-2.5 text-center">
                    <div className="text-xs text-foreground-subtle">กำไร %</div>
                    <div className={`text-lg font-extrabold mt-0.5 ${profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : ''}`}>{cost > 0 ? marginPct.toFixed(1) : '0.0'}%</div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5 — summary & confirm */}
            {step === 4 && (
              <div>
                <h3 className="text-lg font-bold mb-4">สรุป &amp; ยืนยัน<span className="ml-2 text-xs text-foreground-subtle">ขั้นสุดท้าย</span></h3>
                <div className="rounded-card border border-border bg-muted/40 p-3.5">
                  <h4 className="text-sm font-bold text-foreground-subtle mb-2">สรุปรายการที่จะ{editing ? 'บันทึก' : 'เพิ่ม'}</h4>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">สินค้า</span><span className="font-semibold">{row.trade_name}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">Lot / วันหมดอายุ</span><span className="font-semibold">{row.lot_number} · {row.expiry_date}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">จำนวน × ทุน</span><span className="font-semibold">{formatNum(row.qty)} {row.unit_name} × {formatCurrency(cost)}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">ราคาขาย ({row.unit_name})</span><span className="font-semibold">{sellNum > 0 ? formatCurrency(sellNum) : '—'}</span></div>
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
            <Button type="button" variant="success" size="lg" onClick={confirm} className="gap-1.5">
              <Check className="size-4" /> {editing ? 'บันทึกการแก้ไข' : 'ยืนยันเพิ่มลงรายการ'}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={goNext} disabled={!canNext} className="gap-1.5">
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
    {overrideDialog}
    </>
  )
}
