import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { ProductSearchDialog } from '@/components/dialogs/ProductSearchDialog'
import { formatCurrency } from '@/lib/utils'
import {
  Check, ChevronLeft, ChevronRight, Plus,
  AlertTriangle, ShoppingBag, CalendarClock, Coins, Tag,
} from 'lucide-react'

// ── Shared types (single source — index.tsx imports these) ───────────────────

export interface ProductUnitOption {
  id: number
  unit_name: string
  qty_per_base: number
  price_retail?: number
}

export interface ReceiptRow {
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
  cost_price?: number
  units?: ProductUnitOption[]
  // pos:searchProducts enriches each hit with its open lots — used for the
  // "คงเหลือ" column (same source POS reads for stock).
  lots?: Array<{ qty_on_hand: number }>
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
  { title: 'ราคาขาย & ยืนยัน', icon: Tag },
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

  // sell-price draft (step 4)
  const [sellPrice, setSellPrice] = useState('')

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
    setSellPrice(editing?.default_sell_price ? String(editing.default_sell_price) : '')
    setStep(0)
  }, [open, editing])

  const patch = useCallback((f: Partial<ReceiptRow>) => setRow(r => ({ ...r, ...f })), [])

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

    // mousedown fires before the browser shifts focus — preventDefault is the lock.
    const onMouseDown = (e: MouseEvent) => {
      if (!armed()) return
      const t = e.target as HTMLElement | null
      if (!t || t.closest(INTERACTIVE)) return
      e.preventDefault()
      target()?.focus()
    }
    // Safety net: if our input loses focus to a non-interactive target, snap back.
    const onFocusOut = (e: FocusEvent) => {
      if (!armed()) return
      const lost = e.target as HTMLElement | null
      if (lost !== searchInputRef.current && lost !== modalSearchRef.current) return
      setTimeout(() => {
        if (!armed()) return
        const active = document.activeElement as HTMLElement | null
        if (active && active.matches(INTERACTIVE)) return
        target()?.focus()
      }, 0)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const pickProduct = (p: ProductSuggestion) => {
    const baseName = p.unit_name || 'ชิ้น'
    const baseUnit: ProductUnitOption = { id: -1, unit_name: baseName, qty_per_base: 1, price_retail: p.price_retail ?? 0 }
    const units = [baseUnit, ...(p.units ?? []).filter(u => u.unit_name !== baseName)]
    setRow(r => ({
      ...r,
      product_id: p.id,
      trade_name: p.trade_name,
      product_code: p.code ?? '',
      unit_name: baseName,
      units,
      default_sell_price: p.price_retail ?? 0,
      stored_cost_price: p.cost_price,
    }))
    setSellPrice(p.price_retail ? String(p.price_retail) : '')
    setQuery(p.trade_name)
    setSuggestions([])
    setSearchOpen(false)
  }

  const clearProduct = () => {
    patch({ product_id: 0, trade_name: '', product_code: '', unit_name: '', units: [], default_sell_price: 0, stored_cost_price: undefined })
    setQuery('')
    setSuggestions([])
    setSearchOpen(false)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const selectUnit = (u: ProductUnitOption) => {
    patch({ unit_name: u.unit_name, default_sell_price: u.price_retail ?? row.default_sell_price })
    setSellPrice(u.price_retail ? String(u.price_retail) : sellPrice)
  }

  // ── per-step validation ──
  const stepValid = (s: number): boolean => {
    switch (s) {
      case 0: return row.product_id > 0
      case 1: return row.lot_number.trim() !== '' && row.expiry_date !== ''
      case 2: return parseFloat(row.qty) > 0 && parseFloat(row.total) > 0
      case 3: return true
      default: return false
    }
  }
  const canNext = stepValid(step)
  // a step counts as "done" in the rail once every earlier step is valid AND it has data
  const isDone = (s: number) => s < step && stepValid(s)

  const goNext = () => {
    if (!canNext) return
    if (step === LAST) { confirm(); return }
    setStep(s => Math.min(LAST, s + 1))
  }
  const goBack = () => setStep(s => Math.max(0, s - 1))
  const jump = (s: number) => {
    // allow jumping back freely, or forward only through already-valid steps
    if (s <= step || stepValid(step)) setStep(s)
  }

  const confirm = () => {
    const sp = parseFloat(sellPrice)
    onConfirm({ ...row, default_sell_price: isFinite(sp) ? sp : row.default_sell_price })
  }

  // ── derived numbers for step 4 ──
  const qtyNum = parseFloat(row.qty) || 0
  const totalNum = parseFloat(row.total) || 0
  const typedCost = parseFloat(row.cost_price)
  const cost = isFinite(typedCost) && typedCost > 0 ? typedCost : (qtyNum > 0 ? totalNum / qtyNum : 0)
  const sellNum = parseFloat(sellPrice) || 0
  const profit = sellNum - cost
  const marginPct = cost > 0 ? (profit / cost) * 100 : 0
  const expMonths = monthsToExpiry(row.expiry_date)

  // sub-label previews for the rail
  const railSub = (s: number): string => {
    if (!isDone(s) && s !== step) {
      return ['ค้นหา / ยิงบาร์โค้ด', 'Lot No. และวันหมดอายุ', 'จำนวน · ต้นทุน', 'ราคาขาย · กำไร'][s]
    }
    switch (s) {
      case 0: return row.trade_name ? `${row.trade_name} · ${row.unit_name}` : 'ยังไม่เลือก'
      case 1: return row.lot_number ? `${row.lot_number} · หมด ${row.expiry_date}` : 'ยังไม่กรอก'
      case 2: return qtyNum > 0 ? `${formatNum(row.qty)} ${row.unit_name} · ฿${formatNum(row.total, true)}` : 'ยังไม่กรอก'
      case 3: return sellNum > 0 ? `ขาย ฿${formatNum(sellPrice, true)} · กำไร ${marginPct.toFixed(1)}%` : 'ยังไม่กำหนด'
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
        size="4xl"
        onClose={onClose}
        className="h-[600px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 overflow-hidden"
      >
        {/* ── Header ── */}
        <DialogHeader className="flex-row items-center gap-3 px-5 pt-4 pb-3 border-b border-border">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
            <Plus className="size-5" />
          </span>
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
          <div className="w-60 shrink-0 border-r border-border bg-muted/40 overflow-y-auto scrollbar-thin p-5">
            {STEPS.map((s, i) => {
              const done = isDone(i)
              const active = i === step
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => jump(i)}
                  className="relative flex w-full items-start gap-3 pb-6 last:pb-0 text-left"
                >
                  {i < LAST && (
                    <span className={`absolute left-[15px] top-8 bottom-1 w-0.5 ${done ? 'bg-primary' : 'bg-border'}`} />
                  )}
                  <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors
                    ${done ? 'border-primary bg-primary text-primary-foreground'
                      : active ? 'border-primary text-primary ring-4 ring-ring/40'
                      : 'border-border bg-card text-foreground-subtle'}`}>
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className="min-w-0 pt-1">
                    <span className={`block text-sm font-semibold ${active || done ? 'text-foreground' : 'text-foreground-subtle'}`}>{s.title}</span>
                    <span className={`block text-xs mt-0.5 truncate max-w-[150px] ${done ? 'text-primary font-medium' : 'text-foreground-subtle'}`}>{railSub(i)}</span>
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
                <p className="text-xs font-bold uppercase tracking-wide text-primary">ขั้นที่ 1</p>
                <h3 className="text-xl font-bold mt-0.5 mb-4">เลือกสินค้า</h3>

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
                      className="h-12 text-base"
                      autoComplete="off"
                    />
                    <p className="text-sm text-foreground-subtle mt-3">พิมพ์ชื่อ รหัส หรือยิงบาร์โค้ด ระบบจะเปิดหน้าต่างค้นหาให้เลือกสินค้า แล้วจึงเลือกหน่วยที่รับเข้า</p>
                  </div>
                ) : (
                  <div>
                    <div className="rounded-card border border-primary-soft-border bg-primary-soft/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-bold truncate">{row.trade_name}</div>
                        </div>
                        <Button type="button" variant="elevated" size="sm" onClick={clearProduct} className="ml-auto h-8 text-sm">เปลี่ยน</Button>
                      </div>
                      <div className="mt-3.5 pt-3.5 border-t border-primary-soft-border/60 flex gap-7 text-sm">
                        <div>
                          <div className="text-xs text-foreground-subtle">ทุนล่าสุด</div>
                          <div className="font-bold mt-0.5">{formatCurrency(row.stored_cost_price ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-foreground-subtle">ราคาขายปัจจุบัน</div>
                          <div className="font-bold mt-0.5">{formatCurrency(row.default_sell_price ?? 0)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm font-semibold text-foreground-subtle mt-5 mb-2">หน่วยที่รับเข้า</div>
                    <div className="flex gap-2 flex-wrap">
                      {row.units.map(u => (
                        <Button
                          key={u.id}
                          type="button"
                          variant={u.unit_name === row.unit_name ? 'primary-soft' : 'elevated'}
                          onClick={() => selectUnit(u)}
                          className={`h-10 px-4 text-sm font-semibold ${u.unit_name === row.unit_name ? 'ring-1 ring-primary' : ''}`}
                        >
                          {u.unit_name}
                          {u.qty_per_base > 1 && <span className="ml-1.5 text-xs font-normal text-foreground-subtle">×{u.qty_per_base}</span>}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-foreground-subtle mt-3">เลือกหน่วยให้ตรงกับที่ระบุในบิลผู้จำหน่าย ระบบจะคิดสต็อกตามหน่วยฐานให้อัตโนมัติ</p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 — lot & expiry */}
            {step === 1 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">ขั้นที่ 2</p>
                <h3 className="text-xl font-bold mt-0.5 mb-4">Lot &amp; วันหมดอายุ</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Lot No. <span className="text-destructive">*</span></label>
                    <Input autoFocus value={row.lot_number} onChange={e => patch({ lot_number: e.target.value })} placeholder="เช่น A2401" className="h-11 text-base" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันหมดอายุ <span className="text-destructive">*</span></label>
                    <DateInput value={row.expiry_date} onChange={v => patch({ expiry_date: v })} className="h-11" />
                  </div>
                </div>
                {!showMfg ? (
                  <Button type="button" variant="link" onClick={() => setShowMfg(true)} className="mt-3 h-auto p-0 text-sm font-semibold text-primary">+ ระบุวันผลิต (ไม่บังคับ)</Button>
                ) : (
                  <div className="mt-4 max-w-[calc(50%-0.5rem)]">
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">วันผลิต</label>
                    <DateInput value={row.manufactured_date} onChange={v => patch({ manufactured_date: v })} className="h-11" />
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
                <p className="text-xs font-bold uppercase tracking-wide text-primary">ขั้นที่ 3</p>
                <h3 className="text-xl font-bold mt-0.5 mb-4">จำนวน &amp; ต้นทุน</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">จำนวน ({row.unit_name}) <span className="text-destructive">*</span></label>
                    <Input
                      autoFocus type="text" inputMode="decimal"
                      value={row.qty}
                      onChange={e => lineMath('qty', stripCommas(e.target.value))}
                      placeholder="0" className="h-14 text-2xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ต้นทุน/หน่วย</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.cost_price}
                      onChange={e => lineMath('cost_price', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.cost_price); if (isFinite(n)) lineMath('cost_price', n.toFixed(2)) }}
                      placeholder="0.00" className="h-14 text-2xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ราคารวม</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={row.total}
                      onChange={e => lineMath('total', stripCommas(e.target.value))}
                      onBlur={() => { const n = parseFloat(row.total); if (isFinite(n)) lineMath('total', n.toFixed(2)) }}
                      placeholder="0.00" className="h-14 text-2xl font-bold text-center"
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
                      placeholder="0.00" className="h-11 text-right"
                    />
                  </div>
                )}
                <div className="mt-5 rounded-card border border-border overflow-hidden">
                  <div className="flex justify-between px-4 py-2.5 text-sm border-b border-border">
                    <span className="text-foreground-subtle">{formatNum(row.qty) || 0} {row.unit_name} × {formatNum(row.cost_price, true) || '0.00'}</span>
                    <span className="font-medium">{formatCurrency(qtyNum * (parseFloat(row.cost_price) || 0))}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm border-b border-border">
                    <span className="text-foreground-subtle">ส่วนลด</span>
                    <span className="font-medium text-primary">−{formatCurrency(parseFloat(row.discount) || 0)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 bg-primary-soft/50">
                    <span className="font-bold">รวมเป็นเงิน</span>
                    <span className="font-extrabold text-primary text-base">{formatCurrency(totalNum)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4 — sell price & confirm */}
            {step === 3 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">ขั้นที่ 4 · ขั้นสุดท้าย</p>
                <h3 className="text-xl font-bold mt-0.5 mb-4">ราคาขาย &amp; ยืนยัน</h3>
                <div className="grid grid-cols-2 gap-5 items-end">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">ราคาขาย/หน่วย</label>
                    <PriceInput
                      autoFocus
                      value={sellPrice}
                      onChange={setSellPrice}
                      onFocus={e => e.currentTarget.select()}
                      className="w-full h-14 text-2xl font-extrabold text-primary bg-card border border-border rounded-control shadow-sm focus:ring-2 focus:ring-primary outline-none px-3 text-center"
                    />
                  </div>
                  <div className="pb-1 text-sm text-foreground-subtle">
                    {row.stored_cost_price != null && cost > row.stored_cost_price
                      ? `ทุนใหม่สูงกว่าครั้งก่อน ${formatCurrency(cost - row.stored_cost_price)} — ตรวจสอบว่าราคาขายยังคุ้ม`
                      : 'ราคาขายนี้ใช้กับใบรับนี้ และเป็นค่าตั้งต้นของสินค้า'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="rounded-card border border-border p-3 text-center">
                    <div className="text-xs text-foreground-subtle">ทุน</div>
                    <div className="text-lg font-extrabold mt-0.5">{formatCurrency(cost)}</div>
                  </div>
                  <div className="rounded-card border border-border p-3 text-center">
                    <div className="text-xs text-foreground-subtle">กำไร/หน่วย</div>
                    <div className={`text-lg font-extrabold mt-0.5 ${profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : ''}`}>{formatCurrency(profit)}</div>
                  </div>
                  <div className="rounded-card border border-border p-3 text-center">
                    <div className="text-xs text-foreground-subtle">กำไร %</div>
                    <div className={`text-lg font-extrabold mt-0.5 ${profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : ''}`}>{cost > 0 ? marginPct.toFixed(1) : '0.0'}%</div>
                  </div>
                </div>
                <div className="mt-5 rounded-card border border-border bg-muted/40 p-4">
                  <h4 className="text-sm font-bold text-foreground-subtle mb-2.5">สรุปรายการที่จะ{editing ? 'บันทึก' : 'เพิ่ม'}</h4>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">สินค้า</span><span className="font-semibold">{row.trade_name}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">Lot / วันหมดอายุ</span><span className="font-semibold">{row.lot_number} · {row.expiry_date}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">จำนวน × ทุน</span><span className="font-semibold">{formatNum(row.qty)} {row.unit_name} × {formatCurrency(cost)}</span></div>
                  <div className="flex justify-between text-sm py-1"><span className="text-foreground-subtle">รวมเป็นเงิน</span><span className="font-extrabold text-primary">{formatCurrency(totalNum)}</span></div>
                </div>
              </div>
            )}

          </div>
        </DialogBody>

        {/* ── Footer ── */}
        <DialogFooter className="flex-row items-center gap-2.5 px-5 py-3.5 border-t border-border">
          <span className="text-sm text-foreground-subtle mr-auto">ขั้นที่ <b className="text-foreground">{step + 1}</b> จาก <b className="text-foreground">{STEPS.length}</b></span>
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
    <ProductSearchDialog<ProductSuggestion>
      open={searchOpen}
      onClose={closeSearch}
      query={query}
      onQueryChange={runSearch}
      searching={searching}
      rows={suggestions}
      resultCount={suggestions.length}
      inputRef={modalSearchRef}
      rowKey={(p) => String(p.id)}
      rowClassName="grid items-center px-4 py-2.5"
      rowStyle={{ gridTemplateColumns: '1fr 100px 100px' }}
      onPick={(p) => pickProduct(p)}
      placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อ/รหัสสินค้าเพื่อเพิ่ม..."
      header={
        <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
          style={{ gridTemplateColumns: '1fr 100px 100px' }}>
          <div>ชื่อสินค้า</div>
          <div className="text-center">หน่วย</div>
          <div className="text-right">คงเหลือ</div>
        </div>
      }
      renderRow={(p) => {
        const stock = p.lots?.reduce((s, l) => s + (l.qty_on_hand ?? 0), 0) ?? 0
        return (
          <>
            <div className="min-w-0 pr-2">
              <div className="font-semibold text-base truncate">{p.trade_name}</div>
            </div>
            <div className="text-center text-base text-muted-foreground truncate">{p.unit_name ?? '-'}</div>
            <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock}</div>
          </>
        )
      }}
    />
    </>
  )
}
