import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '@/stores/cartStore'
import { getCurrentUserId, getCurrentUserName } from '@/stores/userStore'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Label } from '@/components/ui/label'
import { CustomerFormDialog } from '@/components/dialogs/CustomerFormDialog'
import { CustomerSearchDialog } from '@/components/dialogs/CustomerSearchDialog'
import { ProductSearchDialog } from '@/components/dialogs/ProductSearchDialog'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { InitialAvatar } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { UnitPickerDialog } from '@/components/ui/unit-picker-dialog'
import { QtyDialog } from '@/components/ui/qty-dialog'
import { LotPickerDialog } from '@/components/ui/lot-picker-dialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatCurrency } from '@/lib/utils'
import dayjs from 'dayjs'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product, ProductUnit, ProductLot, Customer, DrugAllergy, SalesSettings, ReceiptSettings, Setting, SaleForPrint } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { printSlip } from '@/lib/receipt/print'
import { Printer, FileText } from 'lucide-react'
import { redistributeDiscounts } from './redistributeDiscount'
import { getCartItemAlert, alertColorClass, getProductExpiryLevel } from './cartAlerts'
import { EXPIRY_WARN_MONTHS, EXPIRY_DANGER_MONTHS } from '@/lib/expiry'
import { extractVat, VAT_RATE_DEFAULT } from '@/lib/vat'
import {
  Search, Trash2, Plus, Minus,
  Banknote, AlertTriangle, PackageX,
  X, UserPlus, Info,
  RotateCcw, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Tag,
  ShoppingBag, Hourglass, RefreshCcw, HandCoins,
  Phone, MapPin, CreditCard, Cake, Pill, HeartPulse, Contact, Users, PackageMinus, ClockAlert,
  Check, SquarePen,
} from 'lucide-react'

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'เล็กน้อย', moderate: 'ปานกลาง', severe: 'รุนแรง', life_threatening: 'อันตรายถึงชีวิต',
}
const SEVERITY_VARIANTS: Record<string, any> = {
  mild: 'secondary', moderate: 'warning', severe: 'warm', life_threatening: 'destructive',
}

const stripCommas = (v: string) => v.replace(/,/g, '')
const formatNumWithCommas = (raw: string, forceTwoDecimals = false): string => {
  if (raw === '' || raw == null) return ''
  const n = parseFloat(raw)
  if (!isFinite(n)) return raw
  return forceTwoDecimals
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

interface ReturnLineItem {
  product_id: number
  product_name: string
  /** Kept for the inline unit picker (base + variants) and base pricing. */
  product: ProductWithDetails
  /** Chosen unit: -1 = base unit (price/name from product.*). */
  unit_id: number
  unit_name: string
  /** Conversion factor of the chosen unit → base (1 for base). */
  qty_per_base: number
  /** Refund price per chosen unit (retail of that unit). */
  unit_price: number
  qty: number
  line_total: number
  lot_id: number
  lot_number: string
  expiry_date: string | null
  /** All lots for this product, so the row can switch lot inline. */
  lots: ProductLot[]
}

/** One lot's slice of an adjust row, resolved by FEFO (internal — sent to the
 *  backend on confirm). base_qty is always in base units. */
interface AdjustAllocation {
  lot_id: number
  lot_number: string
  expiry_date: string | null
  base_qty: number
  cost_price: number
}

interface AdjustLineItem {
  product_id: number
  product_name: string
  /** Kept for lots (FEFO allocation) + unit variants. */
  product: ProductWithDetails
  /** Chosen unit: -1 = base unit. Comes from the scan/search pick, not forced base. */
  unit_id: number
  unit_name: string
  /** Chosen unit → base factor (1 for base). */
  qty_per_base: number
  /** Qty in the chosen unit. */
  qty: number
  /** qty * qty_per_base — base units actually removed. */
  base_qty: number
  /** FEFO lot breakdown (one row may span lots; resolved internally). */
  allocations: AdjustAllocation[]
  /** Total cost = Σ base_qty_i * cost_price_i. */
  line_total: number
}

interface ProductWithDetails extends Product {
  lots: ProductLot[]
  units: ProductUnit[]
}

const resolveSalePrice = (
  src: { price_retail: number; price_wholesale1?: number | null },
  saleType: string,
) => saleType === 'wholesale' ? (src.price_wholesale1 || src.price_retail) : src.price_retail

// FEFO allocation for the adjust list. Each product's lots are consumed in
// expiry order, shared across every row of that product (so two rows of the
// same product in different units draw from the same stock, in list order).
// Fills each row's `allocations` + cost `line_total`; `overflow` is true when a
// row could not be fully covered by available stock.
function recomputeAdjustAllocations(rows: AdjustLineItem[]): { rows: AdjustLineItem[]; overflow: boolean } {
  const remainByProduct = new Map<number, ProductLot[]>()
  let overflow = false
  const out = rows.map(row => {
    let lots = remainByProduct.get(row.product_id)
    if (!lots) {
      lots = (row.product.lots ?? [])
        .slice()
        .sort((a, b) => (a.expiry_date ?? '9999-12-31').localeCompare(b.expiry_date ?? '9999-12-31'))
        .map(l => ({ ...l }))
      remainByProduct.set(row.product_id, lots)
    }
    let need = row.qty * row.qty_per_base
    const allocations: AdjustAllocation[] = []
    for (const lot of lots) {
      if (need <= 0) break
      if (lot.qty_on_hand <= 0) continue
      const take = Math.min(need, lot.qty_on_hand)
      allocations.push({
        lot_id: lot.id,
        lot_number: lot.lot_number ?? '',
        expiry_date: lot.expiry_date ?? null,
        base_qty: take,
        cost_price: lot.cost_price,
      })
      lot.qty_on_hand -= take
      need -= take
    }
    if (need > 0) overflow = true
    const line_total = allocations.reduce((s, a) => s + a.base_qty * a.cost_price, 0)
    return { ...row, base_qty: row.qty * row.qty_per_base, allocations, line_total }
  })
  return { rows: out, overflow }
}

export default function POSPage() {
  const { toast } = useToast()
  const cart = useCartStore()
  const navigate = useNavigate()

  // Search modal
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductWithDetails[]>([])
  const [searching, setSearching] = useState(false)
  // highlight nav + scroll now live inside <ProductSearchDialog>.
  const modalInputRef = useRef<HTMLInputElement>(null)
  const mainInputRef = useRef<HTMLInputElement>(null)

  // ── Quantity multiplier (7-Eleven style): พิมพ์ "*" ตามด้วยจำนวน (เช่น *3) ──
  // เก็บข้อความ "*N" ไว้ใน query ตรงๆ (โชว์ในช่องค้นหาเป็นปกติ) แล้วตีความว่าขึ้นต้นด้วย *
  // = กำลังตั้งตัวคูณ. multiplier = ค่าที่ "ติดอาวุธ" ไว้ ใช้ครั้งถัดไปครั้งเดียวแล้วรีเซ็ต.
  const [multiplier, setMultiplier] = useState<number | null>(null)

  const [dailyStats, setDailyStats] = useState({ bills: 0, total: 0, latest: '' })

  // Payment
  const [showPayment, setShowPayment] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [totalDiscountInput, setTotalDiscountInput] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)
  // Per-line discount redistribution preview — local to the payment modal.
  // Not committed to cart store until Save, so cancelling leaves the cart untouched.
  const [pendingDiscounts, setPendingDiscounts] = useState<number[]>([])

  // Customer
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [showCustomerInfo, setShowCustomerInfo] = useState(false)
  const [customerDetails, setCustomerDetails] = useState<(Customer & { allergies?: DrugAllergy[] }) | null>(null)

  // Add/edit customer (shared dialog with the People page).
  // editCustomerId = null → add mode; a customer id → edit mode.
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null)

  // Net-total number auto-fits its card: measured at the max size, then scaled
  // down so any total (up to millions) fits the w-80 card without overflowing.
  const TOTAL_FONT_MAX = 66
  const totalCardRef = useRef<HTMLDivElement>(null)
  const totalNumRef = useRef<HTMLDivElement>(null)
  const [totalFont, setTotalFont] = useState(TOTAL_FONT_MAX)
  const totalAmount = cart.totalAmount()
  useLayoutEffect(() => {
    const num = totalNumRef.current
    const card = totalCardRef.current
    if (!num || !card) return
    const cs = getComputedStyle(card)
    const avail = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    // Measure intrinsic text width at the max size, then scale to fit.
    num.style.fontSize = `${TOTAL_FONT_MAX}px`
    const w = num.scrollWidth
    const next = w > avail ? Math.floor(TOTAL_FONT_MAX * (avail / w)) : TOTAL_FONT_MAX
    setTotalFont(Math.max(20, Math.min(TOTAL_FONT_MAX, next)))
  }, [totalAmount])

  // Success
  const [lastInvoice, setLastInvoice] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  // Sales settings (alert thresholds + toggles) — loaded once on mount.
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null)
  const [shopInfo, setShopInfo] = useState<Partial<Setting>>({})
  // Whether to print a slip after this sale. Initialized from auto_print once
  // settings load; operator can override per-sale via the payment-modal checkbox.
  const [printReceiptChecked, setPrintReceiptChecked] = useState(false)
  // Snapshot of the just-completed sale, captured BEFORE the cart is cleared so
  // the success dialog's "พิมพ์ซ้ำ" button can reprint without a refetch.
  const [lastSaleForPrint, setLastSaleForPrint] = useState<SaleForPrint | null>(null)

  // Bundle row expansion: tracks cart row indices whose component list is open.
  // Keyed by idx because CartItem has no stable id — keep the Set in sync when
  // rows are removed (see removeCartItem).
  const [expandedBundles, setExpandedBundles] = useState<Set<number>>(new Set())

  // Per-row modals
  const [unitModalIdx, setUnitModalIdx] = useState<number | null>(null)
  const [priceModalIdx, setPriceModalIdx] = useState<number | null>(null)
  const [customPriceInput, setCustomPriceInput] = useState<string>('')
  const [discountModalIdx, setDiscountModalIdx] = useState<number | null>(null)
  const [discountInput, setDiscountInput] = useState<string>('')
  const [discountPctInput, setDiscountPctInput] = useState<string>('')
  const [discountFocus, setDiscountFocus] = useState<'pct' | 'baht' | 'final' | null>(null)
  const [finalPriceInput, setFinalPriceInput] = useState<string>('')
  const [qtyModalIdx, setQtyModalIdx] = useState<number | null>(null)

  // Return items dialog — cart-table "mini POS": ProductSearchDialog adds a
  // product (qty 1, base unit, default lot); each row edits unit / qty / lot
  // inline via the shared UnitPickerDialog / QtyDialog / a lot popover.
  const [showReturn, setShowReturn] = useState(false)
  const [returnSearchOpen, setReturnSearchOpen] = useState(false)
  const [returnQuery, setReturnQuery] = useState('')
  const [returnResults, setReturnResults] = useState<ProductWithDetails[]>([])
  const [returnSearching, setReturnSearching] = useState(false)
  const [returnList, setReturnList] = useState<ReturnLineItem[]>([])
  const [returnReason, setReturnReason] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)
  const [returnUnitRowIdx, setReturnUnitRowIdx] = useState<number | null>(null)
  const [returnQtyRowIdx, setReturnQtyRowIdx] = useState<number | null>(null)
  const [returnLotRowIdx, setReturnLotRowIdx] = useState<number | null>(null)
  const returnInputRef = useRef<HTMLInputElement>(null)
  const returnSearchInputRef = useRef<HTMLInputElement>(null)

  // Adjust stock dialog — cart-table flow, mirrors the return modal.
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustSearchOpen, setAdjustSearchOpen] = useState(false)
  const [adjustQuery, setAdjustQuery] = useState('')
  const [adjustResults, setAdjustResults] = useState<ProductWithDetails[]>([])
  const [adjustSearching, setAdjustSearching] = useState(false)
  const [adjustList, setAdjustList] = useState<AdjustLineItem[]>([])
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustQtyRowIdx, setAdjustQtyRowIdx] = useState<number | null>(null)
  const overrideAdjust = useManagerOverride()
  const adjustInputRef = useRef<HTMLInputElement>(null)
  const adjustSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDailyStats()
  }, [])

  // Load POS alert thresholds on mount. Settings changes during a POS session
  // require a refresh — out of scope for this iteration.
  useEffect(() => {
    window.api.settings.getSalesSettings()
      .then(data => { if (data) setSalesSettings(data as SalesSettings) })
      .catch(() => { /* keep defaults / no-alert mode */ })
    window.api.settings.getReceiptSettings()
      .then(data => {
        if (data) {
          const rs = data as ReceiptSettings
          setReceiptSettings(rs)
          setPrintReceiptChecked(rs.auto_print === 1)
        }
      })
      .catch(() => { /* printing simply unavailable */ })
    window.api.settings.getShop()
      .then(data => { if (data) setShopInfo(data as Setting) })
      .catch(() => {})
  }, [])

  const toggleBundleExpand = useCallback((idx: number) => {
    setExpandedBundles(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }, [])

  const anyModalOpen = searchOpen || showPayment || showCustomerSearch || showQuickAdd || showSuccess || showCustomerInfo ||
    showReturn || showAdjust ||
    unitModalIdx !== null || priceModalIdx !== null || discountModalIdx !== null || qtyModalIdx !== null

  // Refs so focus callbacks always see current modal state without stale closures
  const anyModalOpenRef = useRef(anyModalOpen)
  const searchOpenRef = useRef(searchOpen)
  anyModalOpenRef.current = anyModalOpen
  searchOpenRef.current = searchOpen

  // Focus modal input when search opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => modalInputRef.current?.focus(), 50)
  }, [searchOpen])

  useEffect(() => {
    if (showCustomerInfo && cart.customer?.id) {
      let cancelled = false
      window.api.people.getCustomer(cart.customer.id).then((d: any) => {
        if (!cancelled) setCustomerDetails(d)
      })
      return () => { cancelled = true }
    }
    if (!showCustomerInfo) setCustomerDetails(null)
  }, [showCustomerInfo, cart.customer?.id])

  useEffect(() => {
    if (showReturn) setTimeout(() => returnInputRef.current?.focus(), 50)
  }, [showReturn])

  useEffect(() => {
    if (showAdjust) setTimeout(() => adjustInputRef.current?.focus(), 50)
  }, [showAdjust])

  // Refocus main input whenever all modals close
  const prevAnyModalOpen = useRef(false)
  useEffect(() => {
    if (prevAnyModalOpen.current && !anyModalOpen) {
      setTimeout(() => mainInputRef.current?.focus(), 150)
    }
    prevAnyModalOpen.current = anyModalOpen
  }, [anyModalOpen])

  // Global ESC handler for all modals (closes the top-most one)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (qtyModalIdx !== null) { setQtyModalIdx(null); return }
      if (discountModalIdx !== null) { setDiscountModalIdx(null); return }
      if (priceModalIdx !== null) { setPriceModalIdx(null); return }
      if (unitModalIdx !== null) { setUnitModalIdx(null); return }
      if (showQuickAdd) { setShowQuickAdd(false); return }
      if (showCustomerInfo) { setShowCustomerInfo(false); return }
      if (showCustomerSearch) { setShowCustomerSearch(false); return }
      if (searchOpen) { closeSearch(); return }
      if (showReturn) { closeReturn(); return }
      if (showAdjust) { closeAdjust(); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [qtyModalIdx, discountModalIdx, priceModalIdx, unitModalIdx, searchOpen, showQuickAdd, showCustomerInfo, showCustomerSearch, showReturn, showAdjust])

  // F4 toggles the "print receipt after payment" option while the payment
  // dialog is open. A function key is used so it never collides with typing
  // the cash amount (the cash input holds focus throughout).
  useEffect(() => {
    if (!showPayment) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F4') return
      e.preventDefault()
      setPrintReceiptChecked(v => !v)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPayment])

  const refocusSearch = useCallback(() => {
    setTimeout(() => {
      if (anyModalOpenRef.current) return
      mainInputRef.current?.focus()
    }, 100)
  }, [])

  // Wraps cart.removeItem so the expandedBundles Set stays aligned with the
  // shifted row indices (Set keys above the removed index decrement by 1).
  // Without this the kept-around index would point at the wrong cart row after
  // a deletion in front of it.
  const removeCartItem = useCallback((idx: number) => {
    setExpandedBundles(prev => {
      const next = new Set<number>()
      prev.forEach(k => {
        if (k < idx) next.add(k)
        else if (k > idx) next.add(k - 1)
      })
      return next
    })
    cart.removeItem(idx)
    refocusSearch()
  }, [cart, refocusSearch])

  // Keep search input permanently focused.
  // Registered once ([] deps) — reads modal state from refs to avoid stale closures.
  useEffect(() => {
    // Intentionally excludes [tabindex] — Chromium auto-adds tabindex="0" to overflow:scroll/auto
    // containers for keyboard scrolling, making them "focusable". Including [tabindex] in this
    // selector caused the focusout handler to treat those divs as legitimate focus targets and bail.
    const INTERACTIVE = 'input, button, select, textarea, a, [role="button"], [contenteditable="true"]'

    // mousedown fires before the browser shifts focus, so preventDefault here is the real lock.
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.closest(INTERACTIVE)) return
      if (anyModalOpenRef.current && !searchOpenRef.current) return
      e.preventDefault()
      const inp = searchOpenRef.current ? modalInputRef.current : mainInputRef.current
      inp?.focus()
    }

    // Safety net via focusout (bubbles, so one listener catches both inputs).
    // If either the main input or the modal input loses focus to a non-interactive target, snap back.
    const onFocusOut = (e: FocusEvent) => {
      const lost = e.target as HTMLElement | null
      const isOurInput = lost === mainInputRef.current || lost === modalInputRef.current
      if (!isOurInput) return
      setTimeout(() => {
        if (anyModalOpenRef.current && !searchOpenRef.current) return
        const active = document.activeElement as HTMLElement | null
        if (active && active.matches(INTERACTIVE)) return
        const inp = searchOpenRef.current ? modalInputRef.current : mainInputRef.current
        inp?.focus()
      }, 0)
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const loadDailyStats = async () => {
    const stats = await window.api.pos.getDailyStats() as any
    setDailyStats({ bills: stats?.bills ?? 0, total: stats?.total ?? 0, latest: stats?.latest ?? '' })
  }

  // ── Multiplier helpers ──
  // เปิด/ปิดระบบผ่านการตั้งค่าการขาย (null ระหว่างโหลด = ถือว่าเปิดตาม default DB)
  const multiplierEnabled = salesSettings?.qty_multiplier_enabled !== 0

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    // ช่องว่าง: ล้างผลลัพธ์แต่ "ไม่ปิด" modal — ปิดเฉพาะตอนกด Esc หรือเลือกสินค้าเท่านั้น
    if (!q.trim()) { setResults([]); return }
    if (!searchOpen) setSearchOpen(true)
    setSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setResults(data as ProductWithDetails[])
    } finally {
      setSearching(false)
    }
  }, [searchOpen])

  // ปิด search modal — รีเซ็ตตัวคูณทุกครั้ง (ทั้งกรณีเลือกสินค้าแล้วและกด Esc)
  const closeSearch = () => { setSearchOpen(false); setQuery(''); setResults([]); setMultiplier(null) }

  // Base row first (unit=null → uses product.unit_name + product prices), then non-base variants.
  const flatItems = results.flatMap(p => [
    { product: p, unit: null as ProductUnit | null },
    ...(p.units ?? []).map(u => ({ product: p, unit: u })),
  ])

  // Same per-unit flattening for the adjust search, so the chosen unit (base or
  // a pack variant) carries through to the adjust row.
  const adjustFlatItems = adjustResults.flatMap(p => [
    { product: p, unit: null as ProductUnit | null },
    ...(p.units ?? []).map(u => ({ product: p, unit: u })),
  ])

  const handleSelectItem = (product: ProductWithDetails, unit: ProductUnit | null) => {
    const price = resolveSalePrice(unit ?? product, cart.saleType)
    const unitName = unit?.unit_name ?? product.unit_name ?? 'ชิ้น'
    const qty = multiplier ?? 1
    cart.addItem({ product_id: product.id, item_name: product.trade_name, unit_name: unitName, qty, unit_price: price, discount: 0, line_total: price * qty, product, selectedUnit: unit ?? undefined })
    closeSearch() // ปิด modal + รีเซ็ตตัวคูณ (single-use)
  }

  // กด "*" หลังพิมพ์ตัวเลขล้วน 1..999 (เช่น 5*) = ตั้งตัวคูณ แล้วเคลียร์ช่องให้พร้อมสแกน/เลือก.
  // ถ้าช่องไม่ใช่ตัวเลขล้วน หรือเกินช่วง (0 / >999) ปล่อย "*" พิมพ์ลงช่องตามปกติ → ค้นชื่อที่มี * ได้.
  const handleMultiplierKey = (e: React.KeyboardEvent): boolean => {
    if (!multiplierEnabled || e.key !== '*' || !/^\d+$/.test(query)) return false
    const n = parseInt(query, 10)
    if (n < 1 || n > 999) return false
    e.preventDefault()
    setMultiplier(n)
    setQuery(''); setResults([])
    return true
  }

  const handleMainInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleMultiplierKey(e)
  }

  const closeReturn = () => {
    setShowReturn(false)
    setReturnSearchOpen(false)
    setReturnQuery(''); setReturnResults([])
    setReturnList([]); setReturnReason('')
    setReturnUnitRowIdx(null); setReturnQtyRowIdx(null)
  }

  const closeAdjust = () => {
    setShowAdjust(false)
    setAdjustSearchOpen(false)
    setAdjustQuery(''); setAdjustResults([])
    setAdjustList([]); setAdjustReason('')
    setAdjustQtyRowIdx(null)
  }

  // Typing/scanning in the adjust search bar drives the shared ProductSearchDialog.
  const handleAdjustSearch = useCallback(async (q: string) => {
    setAdjustQuery(q)
    if (!q.trim()) { setAdjustResults([]); return }
    setAdjustSearchOpen(true)
    setAdjustSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setAdjustResults(data as ProductWithDetails[])
    } finally {
      setAdjustSearching(false)
    }
  }, [])

  const closeAdjustSearch = () => { setAdjustSearchOpen(false); setAdjustQuery(''); setAdjustResults([]) }

  // Add a product into the adjust list at the SCANNED/SELECTED unit (not forced
  // base), qty 1. FEFO lot allocation is resolved internally by
  // recomputeAdjustAllocations. Merge when the same product+unit is already listed.
  const addAdjustProduct = (product: ProductWithDetails, unit: ProductUnit | null) => {
    if ((product.lots ?? []).length === 0) { toast('ไม่พบล็อตสำหรับสินค้านี้', 'error'); return }
    const unit_id = unit?.id ?? -1
    const unit_name = unit?.unit_name ?? product.unit_name ?? 'ชิ้น'
    const qty_per_base = unit?.qty_per_base ?? 1

    const idx = adjustList.findIndex(i => i.product_id === product.id && i.unit_id === unit_id)
    const draft = idx >= 0
      ? adjustList.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it)
      : [...adjustList, {
          product_id: product.id,
          product_name: product.trade_name,
          product,
          unit_id,
          unit_name,
          qty_per_base,
          qty: 1,
          base_qty: 0,
          allocations: [],
          line_total: 0,
        } as AdjustLineItem]

    const { rows, overflow } = recomputeAdjustAllocations(draft)
    if (overflow) { toast('จำนวนเกินสต็อกคงเหลือ', 'error'); return }
    setAdjustList(rows)
    closeAdjustSearch()
    setTimeout(() => adjustInputRef.current?.focus(), 50)
  }

  const setAdjustRowQty = (idx: number, qty: number) => {
    if (!Number.isFinite(qty) || qty < 1) return
    const draft = adjustList.map((it, i) => i === idx ? { ...it, qty } : it)
    const { rows, overflow } = recomputeAdjustAllocations(draft)
    if (overflow) { toast('จำนวนเกินสต็อกคงเหลือ', 'error'); return }
    setAdjustList(rows)
  }

  const removeAdjustRow = (idx: number) => {
    const { rows } = recomputeAdjustAllocations(adjustList.filter((_, i) => i !== idx))
    setAdjustList(rows)
  }

  const handleConfirmAdjust = async () => {
    if (adjustList.length === 0 || !adjustReason.trim()) return
    const count = adjustList.length
    const payload = {
      items: adjustList.flatMap(i => i.allocations.map(a => ({ product_id: i.product_id, lot_id: a.lot_id, qty: a.base_qty }))),
      reason: adjustReason.trim(),
      user_id: getCurrentUserId(),
    }
    setAdjustSaving(true)
    overrideAdjust.run(
      async (ov) => { await window.api.products.adjustLotBatch(payload, ov) },
      {
        title: 'ตัดสต็อก',
        onDone: () => {
          setAdjustSaving(false)
          toast(`ตัดสต็อก ${count} รายการสำเร็จ`, 'success')
          closeAdjust()
          refocusSearch()
        },
        onError: (e: any) => {
          setAdjustSaving(false)
          toast(e?.message ?? 'ตัดสต็อกไม่สำเร็จ', 'error')
        },
      },
    )
    if (!overrideAdjust.isAdmin) setAdjustSaving(false)
  }

  // Typing in either input (return header or the ProductSearchDialog input)
  // drives the same query — opens the search modal when there's text.
  const handleReturnSearch = useCallback(async (q: string) => {
    setReturnQuery(q)
    if (!q.trim()) { setReturnResults([]); return }
    setReturnSearchOpen(true)
    setReturnSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setReturnResults(data as ProductWithDetails[])
    } finally {
      setReturnSearching(false)
    }
  }, [])

  const closeReturnSearch = () => { setReturnSearchOpen(false); setReturnQuery(''); setReturnResults([]) }

  // Add a product into the return list at its BASE unit, qty 1, default lot
  // (first = FEFO order from getLots). Unit/qty/lot are edited inline after.
  // Merge when the same product+unit+lot is already listed.
  const addReturnProduct = async (product: ProductWithDetails) => {
    // Bundles can't be returned through the manual product-pick flow — there
    // are no own lots and selecting components individually loses the
    // "whole bundle" semantics + the original lot trace. Direct the operator
    // to the sale-detail page (Manage/Sales → bill → "คืนชุดนี้").
    if ((product as any).is_bundle === 1) {
      toast({
        title: 'คืนชุดสินค้าให้ทำผ่านหน้าบิล',
        description: 'เปิด การจัดการ → ประวัติการขาย → คลิกบิล → ปุ่ม "คืนชุดนี้"',
      })
      return
    }
    const lots = await (window.api.products as any).getLots(product.id) as ProductLot[]
    if (!lots || lots.length === 0) { toast('ไม่พบล็อตสำหรับสินค้านี้', 'error'); return }
    const lot = lots[0]
    const unitPrice = product.price_retail ?? 0
    setReturnList(list => {
      const idx = list.findIndex(i => i.product_id === product.id && i.unit_id === -1 && i.lot_id === lot.id)
      if (idx >= 0) {
        return list.map((item, i) => i === idx
          ? { ...item, qty: item.qty + 1, line_total: (item.qty + 1) * item.unit_price }
          : item)
      }
      return [...list, {
        product_id: product.id,
        product_name: product.trade_name,
        product,
        unit_id: -1,
        unit_name: product.unit_name ?? 'ชิ้น',
        qty_per_base: 1,
        unit_price: unitPrice,
        qty: 1,
        line_total: unitPrice,
        lot_id: lot.id,
        lot_number: lot.lot_number ?? '',
        expiry_date: lot.expiry_date ?? null,
        lots,
      }]
    })
    closeReturnSearch()
    setTimeout(() => returnInputRef.current?.focus(), 50)
  }

  // Inline row edits.
  const setReturnRowUnit = (idx: number, u: { id: number; unit_name?: string; qty_per_base?: number; price_retail?: number }) => {
    const isBase = u.id === -1
    const qpb = isBase ? 1 : (u.qty_per_base ?? 1)
    const price = u.price_retail ?? 0
    setReturnList(list => list.map((item, i) =>
      i === idx ? { ...item, unit_id: u.id, unit_name: u.unit_name ?? '', qty_per_base: qpb, unit_price: price, line_total: item.qty * price } : item))
  }
  const setReturnRowQty = (idx: number, qty: number) => {
    if (!Number.isFinite(qty) || qty < 1) return
    setReturnList(list => list.map((item, i) =>
      i === idx ? { ...item, qty, line_total: qty * item.unit_price } : item))
  }
  const setReturnRowLot = (idx: number, lot: ProductLot) => {
    setReturnList(list => list.map((item, i) =>
      i === idx
        ? { ...item, lot_id: lot.id, lot_number: lot.lot_number ?? '', expiry_date: lot.expiry_date ?? null }
        : item))
  }
  const removeReturnRow = (idx: number) => setReturnList(list => list.filter((_, i) => i !== idx))

  const handleConfirmReturn = async () => {
    if (returnList.length === 0 || !returnReason.trim()) return
    setReturnSaving(true)
    try {
      const result = await (window.api.pos as any).returnItems({
        items: returnList.map(i => ({
          product_id: i.product_id, lot_id: i.lot_id,
          product_name: i.product_name, unit_name: i.unit_name,
          qty_per_base: i.qty_per_base,
          qty: i.qty, unit_price: i.unit_price, line_total: i.line_total,
          reason: returnReason.trim(),
        })),
        customer_id: cart.customer?.id ?? null,
        reason: returnReason.trim(),
        created_by: getCurrentUserId(),
      }) as any
      await loadDailyStats()
      toast(`บันทึกการคืนสินค้าสำเร็จ ${result.invoice_no}`, 'success')
      closeReturn()
    } catch (err: any) {
      toast(err?.message ?? 'เกิดข้อผิดพลาด', 'error')
    } finally {
      setReturnSaving(false)
    }
  }


  // Modal-scoped pending values — fall back to cart discounts when the modal
  // hasn't seeded (or items changed since the last seed).
  const pendingEffectiveDiscounts = pendingDiscounts.length === cart.items.length
    ? pendingDiscounts
    : cart.items.map(i => i.discount)
  const pendingTotalDiscount = pendingEffectiveDiscounts.reduce((s, d) => s + d, 0)
  const pendingNet = cart.subtotal() - pendingTotalDiscount
  // VAT-inclusive & all-or-nothing: the single sales_settings.vat_enabled switch
  // is authoritative — when on, VAT applies to EVERY line (there is no per-product
  // VAT flag). Prices already contain VAT, so we back it out of each line's net
  // amount (rate/(100+rate)); pendingNet is unchanged — this is only the breakdown
  // shown/recorded.
  const vatEnabled = salesSettings?.vat_enabled === 1
  const vatRate = salesSettings?.vat_rate ?? VAT_RATE_DEFAULT
  const pendingVat = vatEnabled
    ? cart.items.reduce((sum, i, idx) =>
        sum + extractVat(i.qty * i.unit_price - pendingEffectiveDiscounts[idx], vatRate), 0)
    : 0
  const totalPaid = (parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(transferAmount) || 0)
  const change = totalPaid - pendingNet

  // Live receipt preview — assembled to MIRROR handleCompleteSale's print
  // snapshot exactly (redistributed per-line discount + per-unit VAT backed out
  // of the discounted line), so what the operator sees here equals what prints.
  // invoice_no isn't assigned until the sale is committed, hence the placeholder.
  const previewSale: SaleForPrint = useMemo(() => ({
    invoice_no: '(ตัวอย่าง)',
    sold_at: new Date().toISOString(),
    sale_type: cart.saleType,
    status: 'completed',
    customer_name: cart.customer?.full_name ?? cart.customerNameFree ?? null,
    salesperson_name: getCurrentUserName(),
    items: cart.items.map((i, idx) => {
      const d = pendingEffectiveDiscounts[idx] ?? 0
      const line_total = i.qty * i.unit_price - d
      const unit_vat = vatEnabled && i.qty > 0 ? extractVat(line_total, vatRate) / i.qty : 0
      return { item_name: i.item_name, unit_name: i.unit_name, qty: i.qty, unit_price: i.unit_price, discount: d, unit_vat, line_total }
    }),
    subtotal: cart.subtotal(),
    total_discount: pendingTotalDiscount,
    total_vat: pendingVat,
    total_amount: pendingNet,
    cash_amount: parseFloat(cashAmount) || 0,
    change_amount: Math.max(0, change),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cart.items, cart.saleType, cart.customer, cart.customerNameFree, pendingEffectiveDiscounts, pendingTotalDiscount, pendingVat, pendingNet, cashAmount, change, vatEnabled, vatRate])

  // Re-pull receipt settings + shop each time the payment dialog opens, so both
  // the in-dialog receipt preview AND the actual print reflect the latest saved
  // settings without a full POS refresh (POS otherwise loads them once on mount).
  useEffect(() => {
    if (!showPayment) return
    window.api.settings.getReceiptSettings().then(d => { if (d) setReceiptSettings(d as ReceiptSettings) }).catch(() => {})
    window.api.settings.getShop().then(d => { if (d) setShopInfo(d as Setting) }).catch(() => {})
  }, [showPayment])

  // Print a completed sale's slip. Isolated from the save flow — a print
  // failure must never roll back a committed sale; it just toasts so the
  // operator can retry from the success dialog. VAT-on sales print the slip as
  // an abbreviated tax invoice when that option is enabled.
  const printCompletedSale = useCallback(async (sale: SaleForPrint) => {
    if (!receiptSettings) { toast('ยังไม่ได้ตั้งค่าการพิมพ์ใบเสร็จ', 'error'); return }
    const mode = receiptSettings.abbrev_tax_invoice && sale.total_vat > 0 ? 'abbrevTax' : 'receipt'
    const res = await printSlip(sale, mode, { shop: shopInfo, settings: receiptSettings })
    if (!res.success) toast(`พิมพ์ใบเสร็จไม่สำเร็จ: ${res.error ?? ''}`, 'error')
  }, [receiptSettings, shopInfo, toast])

  const handleCompleteSale = async () => {
    if (saving) return
    if (cart.items.length === 0) { toast('กรุณาเพิ่มสินค้าในตะกร้า', 'error'); return }
    if (pendingNet < 0) { toast('ยอดสุทธิติดลบ กรุณาตรวจสอบ', 'error'); return }
    if (change < 0) { toast('รับเงินไม่พอ กรุณาตรวจสอบ', 'error'); return }
    setSaving(true)
    try {
      // Build line items once — reused for both the saveBill payload and the
      // print snapshot (so the slip matches exactly what was persisted).
      const billItems = cart.items.map((i, idx) => {
        const d = pendingEffectiveDiscounts[idx]
        const line_total = i.qty * i.unit_price - d
        // Per-unit VAT is backed out of the DISCOUNTED line, then divided by qty,
        // so Σ(unit_vat × qty) reconciles exactly with total_vat (which is also
        // computed on the discounted net). Using the raw unit_price here would
        // overstate VAT on discounted lines.
        const unit_vat = vatEnabled && i.qty > 0 ? extractVat(line_total, vatRate) / i.qty : 0
        return { product_id: i.product_id, item_name: i.item_name, unit_name: i.unit_name, qty: i.qty, qty_per_base: i.selectedUnit?.qty_per_base ?? 1, unit_price: i.unit_price, discount: d, unit_vat, line_total, item_note: i.item_note }
      })
      const result = await window.api.pos.saveBill({
        sale_type: cart.saleType, customer_id: cart.customer?.id ?? null, customer_name_free: cart.customerNameFree,
        items: billItems,
        subtotal: cart.subtotal(), total_discount: pendingTotalDiscount, total_vat: pendingVat, total_amount: pendingNet,
        cash_amount: parseFloat(cashAmount) || 0, card_amount: parseFloat(cardAmount) || 0, transfer_amount: parseFloat(transferAmount) || 0,
        change_amount: Math.max(0, change), symptom_note: cart.symptomNote, age_range: cart.ageRange, sold_by: getCurrentUserId(),
      }) as any
      // Snapshot for printing — taken before clearCart wipes the cart.
      const snapshot: SaleForPrint = {
        invoice_no: result.invoice_no,
        sold_at: new Date().toISOString(),
        sale_type: cart.saleType,
        status: 'completed',
        customer_name: cart.customer?.full_name ?? cart.customerNameFree ?? null,
        salesperson_name: getCurrentUserName(),
        items: billItems.map(b => ({
          item_name: b.item_name, unit_name: b.unit_name, qty: b.qty,
          unit_price: b.unit_price, discount: b.discount, unit_vat: b.unit_vat, line_total: b.line_total,
        })),
        subtotal: cart.subtotal(), total_discount: pendingTotalDiscount, total_vat: pendingVat, total_amount: pendingNet,
        cash_amount: parseFloat(cashAmount) || 0, change_amount: Math.max(0, change),
      }
      const wantPrint = printReceiptChecked
      // Capture the source quotation before clearCart wipes it — mark it
      // converted after the sale is committed (best-effort).
      const srcQuote = cart.sourceQuotation
      setLastInvoice(result.invoice_no)
      setLastSaleForPrint(snapshot)
      setDailyStats({ bills: result.daily_bills, total: result.daily_total, latest: result.latest_bill_time })
      cart.clearCart(); setExpandedBundles(new Set()); setShowPayment(false); setShowSuccess(true)
      setCashAmount(''); setCardAmount(''); setTransferAmount('')
      // Bill may have oversold a product (deductFefo writes lot_id=NULL marker
      // rows when stock runs out). Refresh the sidebar badge so the operator
      // sees the queue grow.
      useNegativeStockBadge.getState().refresh()
      // Fire-and-forget print after the sale is committed.
      if (wantPrint) void printCompletedSale(snapshot)
      // Mark the source quotation converted — must not fail the (committed) sale.
      if (srcQuote) {
        window.api.quotation.markConverted({ id: srcQuote.id, invoice_no: result.invoice_no })
          .catch((e: any) => toast(`อัปเดตใบเสนอราคาไม่สำเร็จ: ${e?.message ?? ''}`, 'error'))
      }
    } catch (err: any) { toast(err.message ?? 'เกิดข้อผิดพลาด', 'error') }
    finally { setSaving(false) }
  }

  const changeCartUnit = (idx: number, unit: ProductUnit) => {
    const isBase = unit.id === -1
    const price = resolveSalePrice(unit, cart.saleType)
    cart.updateItem(idx, {
      unit_name: unit.unit_name,
      unit_price: price,
      selectedUnit: isBase ? undefined : unit,
    })
    setUnitModalIdx(null)
    refocusSearch()
  }

  const changeCartPrice = (idx: number, price: number) => {
    cart.updateItem(idx, { unit_price: price })
    setPriceModalIdx(null)
    refocusSearch()
  }

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">

      <PageHeader title="หน้าจอการขายสินค้า" />

      {cart.sourceQuotation && (
        <div className="shrink-0 flex items-center gap-2 rounded-lg border border-info/30 bg-info-soft px-3 h-10 text-sm">
          <FileText className="size-4 text-info-foreground" />
          <span className="text-foreground">กำลังขายจากใบเสนอราคา <span className="font-semibold">{cart.sourceQuotation.quote_no}</span> — ปิดการขายเพื่อยืนยัน</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const src = cart.sourceQuotation
              if (!src) return
              try { await window.api.quotation.releaseConversion(src.id) } catch { /* ignore */ }
              cart.setSourceQuotation(null)
              toast('ยกเลิกการแปลงจากใบเสนอราคาแล้ว', 'success')
            }}
          >
            <X className="size-4" /> ยกเลิกการแปลง
          </Button>
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">

        {/* Left column: toolbar + cart card */}
        <div className="flex-1 flex flex-col gap-3.5 min-h-0">

          {/* Cart slot + customer cards */}
          <div className="grid grid-cols-[repeat(4,minmax(11rem,1fr))] gap-3.5 shrink-0">
            {([0, 1, 2] as const).map(i => {
              const slot = i === cart.activeSlot
                ? { items: cart.items, saleType: cart.saleType }
                : { items: cart.slots[i].items, saleType: cart.slots[i].saleType }
              const lineCount = slot.items.length
              const total = slot.items.reduce((s, it) => s + it.line_total, 0)
              const isActive = i === cart.activeSlot
              const hasItems = slot.items.length > 0
              const Icon = ShoppingBag
              const iconBox = isActive
                ? 'bg-primary-soft text-primary'
                : 'bg-primary text-primary-foreground'
              return (
                <Button key={i} variant="ghost"
                  onClick={() => { cart.setActiveSlot(i); refocusSearch() }}
                  className={`relative flex flex-col items-stretch text-left h-28 px-4 py-3 rounded-2xl border border-border transition-colors ${
                    isActive
                      ? 'text-primary-foreground hover:text-primary-foreground hover:bg-transparent'
                      : 'bg-card text-foreground hover:bg-surface-hover'
                  }`}>
                  {isActive && (
                    <motion.div
                      layoutId="pos-cart-slot-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-primary"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                    />
                  )}
                  <span className={`absolute top-3 right-3 z-10 grid place-items-center w-11 h-11 rounded-xl shrink-0 ${iconBox}`}>
                    <Icon className="size-7" strokeWidth={2}/>
                    {hasItems && (
                      <span
                        aria-label={`${lineCount} รายการ`}
                        className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold ring-2 ring-card"
                      >
                        {lineCount > 99 ? '99+' : lineCount}
                      </span>
                    )}
                  </span>
                  <span className="relative z-10 text-sm font-semibold leading-none pr-12">รายการขาย {i + 1}</span>
                  <div className="relative z-10 flex flex-col gap-1 w-full min-w-0 mt-auto">
                    <span className="text-2xl font-bold leading-none truncate">
                      {formatCurrency(total)}
                    </span>
                    <div className="flex items-center w-full">
                      {slot.saleType === 'wholesale' ? (
                        <Badge variant={isActive ? 'warm' : 'accent'} className="text-xs rounded-md">ขายส่ง</Badge>
                      ) : (
                        <Badge variant={isActive ? 'primary-soft' : 'default'} className="text-xs rounded-md">ขายปลีก</Badge>
                      )}
                    </div>
                  </div>
                </Button>
              )
            })}
            <div className="flex flex-col gap-1.5 h-28 px-3 py-2.5 bg-card rounded-2xl border border-border">
              <Button variant="ghost"
                onClick={() => setShowCustomerSearch(true)}
                className="relative flex items-center gap-2 flex-1 min-h-0 p-1 rounded-xl hover:bg-transparent text-left">
                <span className="relative shrink-0">
                  <InitialAvatar name={cart.customer?.full_name} size="lg" />
                  {cart.customer?.is_alert && cart.customer.alert_note ? (
                    <span
                      title={cart.customer.alert_note}
                      className="absolute -top-1 -right-1 grid place-items-center size-4 rounded-full bg-destructive text-destructive-foreground ring-2 ring-card">
                      <AlertTriangle className="size-2.5" />
                    </span>
                  ) : null}
                </span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-sm font-bold leading-tight truncate">
                    {cart.customer ? cart.customer.full_name : 'ลูกค้าทั่วไป'}
                  </span>
                  <span className="text-sm text-muted-foreground truncate">
                    {cart.customer?.phone || 'แตะเพื่อเลือกลูกค้า'}
                  </span>
                </div>
              </Button>
              <div className="grid grid-cols-2 gap-1.5 shrink-0">
                <Button variant="primary-soft"
                  onClick={() => setShowCustomerInfo(true)}
                  disabled={!cart.customer}
                  className="h-8 rounded-lg text-xs gap-1">
                  <Info className="size-3.5" /> ดูข้อมูล
                </Button>
                <Button variant="default"
                  onClick={() => { setEditCustomerId(null); setShowQuickAdd(true) }}
                  className="h-8 rounded-lg text-xs gap-1">
                  <UserPlus className="size-3.5" /> เพิ่มลูกค้า
                </Button>
              </div>
            </div>
          </div>

          {/* Cart card (search + table + footer) */}
          <div className="flex flex-1 flex-col min-h-0 bg-card rounded-2xl shadow-card overflow-hidden border border-border">

          {/* Sale type + search + clear-all header */}
          <div className="flex items-center gap-2 px-4 h-12 shrink-0 border-0">
            <div className="flex h-9 items-stretch gap-0.5 rounded-lg bg-muted/40 shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { cart.setSaleType('retail'); refocusSearch() }}
                className={`relative flex h-full w-[70px] px-0 rounded-lg text-sm font-semibold justify-center hover:bg-transparent ${
                  cart.saleType === 'retail' ? 'text-primary-foreground hover:text-primary-foreground' : 'text-foreground-subtle hover:text-foreground'
                }`}>
                {cart.saleType === 'retail' && (
                  <motion.div
                    layoutId="pos-sale-type-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-primary"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <span className="relative z-10">ขายปลีก</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { cart.setSaleType('wholesale'); refocusSearch() }}
                className={`relative flex h-full w-[70px] px-0 rounded-lg text-sm font-semibold justify-center hover:bg-transparent ${
                  cart.saleType === 'wholesale' ? 'text-accent-foreground hover:text-accent-foreground' : 'text-foreground-subtle hover:text-foreground'
                }`}>
                {cart.saleType === 'wholesale' && (
                  <motion.div
                    layoutId="pos-sale-type-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-accent"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <span className="relative z-10">ขายส่ง</span>
              </Button>
            </div>
            <div className="relative flex-1 min-w-0">
              <Input
                ref={mainInputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={handleMainInputKeyDown}
                placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด / รหัสสินค้า"
                autoFocus
                autoComplete="off"
                className="h-9 py-2 pl-3 pr-9 text-sm rounded-lg"/>
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground pointer-events-none"/>
            </div>
            <Button variant="destructive2" size="sm" disabled={cart.items.length === 0}
              onClick={() => { cart.clearCart(); setExpandedBundles(new Set()); refocusSearch() }}
              className="gap-1.5 px-3 py-1.5 h-9 rounded-lg text-sm font-medium hover:bg-destructive hover:text-primary-foreground shrink-0">
              <Trash2 className="size-3.5" /> ลบรายการทั้งหมด
            </Button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin" tabIndex={-1}>
              <table className="w-full caption-bottom text-base table-fixed border-l-[16px] border-r-[16px] border-card">
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: 60 }} />
                </colgroup>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow className="hover:bg-muted">
                    <TableHead className="text-center text-sm  text-foreground-subtle">#</TableHead>
                    <TableHead className="text-sm  text-foreground-subtle">ชื่อสินค้า</TableHead>
                    <TableHead className="text-center text-sm  text-foreground-subtle">หน่วย</TableHead>
                    <TableHead className="text-center text-sm  text-foreground-subtle">จำนวน</TableHead>
                    <TableHead className="text-center text-sm  text-foreground-subtle">ราคา</TableHead>
                    <TableHead className="text-center text-sm  text-foreground-subtle">ส่วนลด</TableHead>
                    <TableHead className="text-right text-sm  text-foreground-subtle">รวม</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.items.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center justify-center text-foreground-subtle gap-3">
                          <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="text-xl font-medium">ยังไม่มีรายการสั่งซื้อ</p>
                          <p className="text-base">คลิกช่องค้นหาหรือสแกนบาร์โค้ด</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : cart.items.map((item, idx) => {
                    const isBundle = !!item.product?.is_bundle
                    const isExpanded = expandedBundles.has(idx)
                    const alert = getCartItemAlert(item, salesSettings)
                    const components = isBundle ? (item.product?.bundle_items ?? []) : []
                    return (
                    <React.Fragment key={idx}>
                    <TableRow className="hover:bg-transparent [&_td]:py-1">
                      <TableCell className="text-center text-sm text-muted-foreground p-0">
                        {isBundle ? (
                          <Button
                            variant="ghost"
                            size="icon-lg"
                            onClick={() => toggleBundleExpand(idx)}
                            title={isExpanded ? 'ย่อรายการ' : 'ขยายรายการ'}
                            className="w-full h-8 gap-0.5 rounded"
                          >
                            <motion.span
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              className="inline-flex"
                            >
                              <ChevronRight className="size-3.5" />
                            </motion.span>
                            <span className="text-sm">{idx + 1}</span>
                          </Button>
                        ) : (
                          <>{idx + 1}</>
                        )}
                      </TableCell>
                      <TableCell className="min-w-0 pr-2 ">
                        <div className="font-medium truncate text-sm flex items-center gap-1.5">
                          {alert && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`shrink-0 inline-flex ${alertColorClass(alert.level)}`}>
                                  {/* All expiry levels share ClockAlert — colour (via alertColorClass) carries severity. */}
                                  {alert.level === 'low_stock' ? <PackageX className="size-4" /> : <ClockAlert className="size-4" />}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{alert.reason}</TooltipContent>
                            </Tooltip>
                          )}
                          <span className="truncate">{item.item_name}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        {item.product?.is_bundle ? (
                          // Bundles are base-unit-only in v1 — no unit picker, just a static label.
                          <div className="flex items-center w-full justify-center h-8 px-2 overflow-hidden rounded-md bg-muted text-muted-foreground text-sm font-semibold">
                            <span className="truncate">{item.unit_name}</span>
                          </div>
                        ) : (
                          <Button variant="primary-soft" size="sm" onClick={() => setUnitModalIdx(idx)}
                            className="flex items-center w-full justify-center h-8 px-2 overflow-hidden rounded-md text-sm font-semibold">
                            <span className="truncate">{item.unit_name}</span>
                          </Button>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        <Button variant="primary-soft" size="sm"
                          onClick={() => setQtyModalIdx(idx)}
                          className="flex items-center w-full justify-center h-8 rounded-md text-sm font-semibold">
                          <span className="flex-1 text-center">{item.qty}</span>
                        </Button>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button variant="primary-soft" size="sm" onClick={() => { setCustomPriceInput(String(item.unit_price)); setPriceModalIdx(idx) }}
                          className="flex items-center justify-end w-full h-8 pl-2.5 pr-2 overflow-hidden rounded-md text-sm font-semibold">
                          <span className="text-right truncate">{formatCurrency(item.unit_price)}</span>
                        </Button>
                      </TableCell>

                      <TableCell className="text-right">
                        {item.discount ? (
                          <Button variant="destructive2" size="sm"
                            onClick={() => { const totalPrice = item.unit_price * item.qty; setDiscountInput(String(parseFloat(item.discount.toFixed(2)))); setDiscountPctInput(totalPrice > 0 ? String(parseFloat((item.discount / totalPrice * 100).toFixed(2))) : ''); setFinalPriceInput(String(parseFloat((totalPrice - item.discount).toFixed(2)))); setDiscountModalIdx(idx) }}
                            className="flex items-center justify-end w-full h-8 pl-2.5 pr-2 rounded-md text-sm font-semibold">
                            <span className="leading-none">{formatCurrency(item.discount)}</span>
                          </Button>
                        ) : (
                          <Button variant="destructive2" size="sm"
                            onClick={() => { setDiscountInput(''); setDiscountPctInput(''); setFinalPriceInput(''); setDiscountModalIdx(idx) }}
                            className="flex items-center justify-end w-full h-8 pl-2.5 pr-2 rounded-md text-sm font-medium">
                            <span className="text-right">0</span>
                          </Button>
                        )}
                      </TableCell>

                      <TableCell className="text-right pr-2 font-semibold text-primary text-sm truncate">
                        {formatCurrency(item.line_total)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeCartItem(idx)}
                          className="w-7 h-7 rounded inline-flex items-center justify-center text-foreground-subtle hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    <AnimatePresence initial={false}>
                      {isBundle && isExpanded && components.map((c, ci) => (
                        <motion.tr
                          key={`c-${ci}`}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0, transition: { duration: 0.2, delay: ci * 0.04, ease: 'easeOut' } }}
                          exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } }}
                          className="bg-muted/30 hover:bg-muted/40 [&_td]:py-1"
                        >
                          <TableCell />
                          <TableCell className="pl-6 text-xs text-foreground-subtle truncate">
                            • {c.component_name ?? '-'}
                          </TableCell>
                          <TableCell className="text-center text-xs text-foreground-subtle">
                            {c.component_unit_name ?? '-'}
                          </TableCell>
                          <TableCell className="text-center text-xs text-foreground-subtle">
                            {(c.qty_per_bundle ?? 1) * item.qty}
                          </TableCell>
                          <TableCell colSpan={4} />
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    </React.Fragment>
                    )
                  })}
                </TableBody>
              </table>
            </div>

            <div className="px-5 h-12 shrink-0 flex items-center gap-6 bg-card border-t border-border">
                <div>
                  <div className="text-sm font-semibold text-foreground-subtle">จำนวน <span className="text-sm font-medium text-foreground">{cart.items.length}</span> รายการ</div>
                </div>
                <div className="flex-1 flex items-center justify-center gap-4 text-xs text-foreground-subtle">
                  <span className="inline-flex items-center gap-1">
                    <PackageX className="size-3.5 text-destructive" /> สต๊อกไม่พอ
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ClockAlert className="size-3.5 text-destructive" /> หมดอายุ
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ClockAlert className="size-3.5 text-warm-foreground" /> อายุต่ำกว่า {EXPIRY_DANGER_MONTHS} เดือน
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ClockAlert className="size-3.5 text-warning" /> อายุต่ำกว่า {EXPIRY_WARN_MONTHS} เดือน
                  </span>
                </div>
                {cart.totalDiscount() > 0 && (
                  <div className="text-right">
                    <div className="text-sm font-semibold text-foreground-subtle">ส่วนลดรวม
                    <span className="text-sm font-bold text-destructive"> {formatCurrency(cart.totalDiscount())}</span></div>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-sm font-semibold text-foreground-subtle">ราคารวม <span className="text-sm font-bold text-foreground">{formatCurrency(cart.subtotal())}</span></div>
                </div>
            </div>
          </div>
          </div>

        </div>

        {/* Right column */}
        <div className="w-80 flex flex-col gap-2.5 min-w-0">
          {/* Total card — number auto-fits via useLayoutEffect (see totalFont) */}
          <div ref={totalCardRef} className="h-40 rounded-2xl bg-primary text-primary-foreground p-5 shadow-card shrink-0 overflow-hidden">
            <div className="text-right text-md font-medium opacity-80 tracking-wide">ยอดสุทธิ</div>
            <div ref={totalNumRef}
              className="mt-6 text-right font-bold leading-[1.05] tracking-tight whitespace-nowrap"
              style={{ fontSize: `${totalFont}px`, letterSpacing: '-1.5px' }}>
              {formatCurrency(totalAmount)}
            </div>
          </div>

          {/* Quick actions (vertical stack) */}
          <div className="flex flex-col gap-1.5 flex-1 min-h-0">
            <Button variant="elevated" onClick={() => { (window.api.printer as any)?.openCashDrawer?.(); refocusSearch() }}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto text-xl font-medium">
              <Banknote className="size-6 text-info" /> เปิดลิ้นชัก
            </Button>
            <Button variant="elevated" disabled
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto text-xl font-medium">
              <Tag className="size-6 text-info-soft-foreground" /> พิมพ์ฉลาก
            </Button>
            <Button variant="elevated" onClick={() => setShowAdjust(true)}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto text-xl font-medium">
              <PackageMinus className="size-6 text-accent" /> ตัดสต็อก
            </Button>
            <Button variant="elevated" onClick={() => setShowReturn(true)}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto text-xl font-medium">
              <RotateCcw className="size-6 text-primary" /> รับคืนสินค้า
            </Button>
            <Button variant="elevated" onClick={() => navigate('/manage')}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto text-xl font-medium">
              <Trash2 className="size-6 text-destructive" /> ยกเลิกบิล
            </Button>
          </div>

          {/* Pay button */}
          <Button disabled={cart.items.length === 0}
            onClick={() => {
              setPendingDiscounts(cart.items.map(i => i.discount))
              setTotalDiscountInput(cart.totalDiscount().toFixed(2))
              setCashAmount(cart.totalAmount().toFixed(2))
              setShowBreakdown(false)
              setShowPayment(true)
            }}
            className="w-full flex-1 max-h-32 justify-center gap-3 bg-accent text-accent-foreground hover:bg-accent/85  disabled:text-foreground-subtle disabled:opacity-100 rounded-2xl px-5 py-3">
              <HandCoins className="size-9" strokeWidth={2.2} />
              <span className="text-4xl font-bold leading-none">ชำระเงิน</span>
          </Button>

          {/* Daily summary */}
          <div className="rounded-2xl bg-card px-3 py-2.5 shrink-0 flex flex-col gap-2 border border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <HandCoins className="size-4 text-primary shrink-0" />
                <h3 className="text-sm font-semibold text-foreground truncate">ยอดขายวันนี้</h3>
              </div>
              <div className="text-lg font-bold text-primary leading-none">
                {formatCurrency(dailyStats.total)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg bg-muted px-2.5 py-1.5 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ShoppingBag className="size-3.5" /> บิล
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {dailyStats.bills}
                </div>
              </div>
              <div className="rounded-lg bg-muted px-2.5 py-1.5 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Hourglass className="size-3.5" /> ล่าสุด
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {dailyStats.latest ? dailyStats.latest.slice(11, 16) : '—'}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── PRODUCT SEARCH DIALOG (shared component) ── */}
      <ProductSearchDialog
        open={searchOpen}
        onClose={closeSearch}
        query={query}
        onQueryChange={handleSearch}
        searching={searching}
        rows={flatItems}
        resultCount={results.length}
        inputRef={modalInputRef}
        onInputKeyDown={handleMultiplierKey}
        rowKey={(it) => `${it.product.id}-${it.unit?.id ?? 'base'}`}
        rowClassName="grid items-center px-4 py-2.5"
        rowStyle={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
        onPick={(it) => handleSelectItem(it.product, it.unit)}
        headerRight={multiplier !== null ? <Badge variant="primary-soft" className="shrink-0">ตัวคูณ × {multiplier}</Badge> : undefined}
        footerExtra={multiplier !== null ? <span className="text-primary font-semibold"> · ตัวคูณ × {multiplier}</span> : undefined}
        header={
          <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
            style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
            <div>ชื่อสินค้า</div>
            <div className="text-center">หน่วย</div>
            <div className="text-right">ราคาขาย</div>
            <div className="text-right">คงเหลือ</div>
          </div>
        }
        renderRow={(it) => {
          // Bundles have no own lots — derive stock from components
          // (MIN of floor(component_qty / qty_per_bundle)). Expiry warn also
          // scans across all component lots. Regular products read own lots.
          const isBundle = !!it.product.is_bundle
          const stock = isBundle
            ? (() => {
                const items = it.product.bundle_items ?? []
                if (items.length === 0) return 0
                return Math.min(...items.map(bi => {
                  const compStock = (bi.lots ?? []).reduce((s, l) => s + (l.qty_on_hand ?? 0), 0)
                  return Math.floor(compStock / (bi.qty_per_bundle || 1))
                }))
              })()
            : (it.product.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0)
          const price = it.unit ? it.unit.price_retail : it.product.price_retail
          const unitName = it.unit?.unit_name ?? it.product.unit_name ?? '-'
          const expiryLevel = getProductExpiryLevel(it.product, salesSettings)
          return (
            <>
              <div className="min-w-0 pr-2">
                <div className="font-semibold text-base flex items-center gap-1.5 truncate">
                  {/* Same ClockAlert + severity colour as the cart table (alertColorClass). */}
                  {expiryLevel && (
                    <ClockAlert className={`size-4 shrink-0 ${alertColorClass(expiryLevel)}`} />
                  )}
                  <span className="truncate">{it.product.trade_name}</span>
                  {stock === 0 && <Badge variant="destructive-outline" className="shrink-0">หมด</Badge>}
                </div>
              </div>
              <div className="text-center text-base text-muted-foreground truncate">{unitName}</div>
              <div className="text-right font-bold text-primary text-base">{formatCurrency(price)}</div>
              <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock}</div>
            </>
          )
        }}
      />

      {/* ── CUSTOMER SEARCH DIALOG (shared with the Quotation editor) ── */}
      <CustomerSearchDialog
        open={showCustomerSearch}
        onOpenChange={setShowCustomerSearch}
        onSelect={(c) => cart.setCustomer(c)}
        showWalkIn
      />

      {/* ── CUSTOMER INFO DIALOG ── */}
      <Dialog open={showCustomerInfo} onOpenChange={setShowCustomerInfo}>
        <DialogContent size="md" onClose={() => setShowCustomerInfo(false)}>
          <DialogHeader className="sr-only"><DialogTitle>ข้อมูลลูกค้า</DialogTitle></DialogHeader>
          <DialogBody className="space-y-5 max-h-[70vh] overflow-y-auto scrollbar-thin">
            {(() => {
              const c = customerDetails ?? cart.customer
              if (!c) return null
              const hasAlert = !!(c.is_alert && c.alert_note)
              const allergies = customerDetails?.allergies ?? []
              const dobText = c.dob ? dayjs(c.dob).format('DD/MM/YYYY') : ''
              const contactRows = [
                { Icon: Phone,      label: 'เบอร์โทร',          value: c.phone   || '-', wrap: false },
                { Icon: CreditCard, label: 'เลขบัตรประชาชน',  value: c.id_card || '-', wrap: false },
                { Icon: Cake,       label: 'วันเกิด',            value: dobText   || '-', wrap: false },
                { Icon: MapPin,     label: 'ที่อยู่',              value: c.address || '-', wrap: true  },
              ]
              return (
                <>
                  {/* Hero — centered avatar + name + code */}
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <InitialAvatar name={c.full_name} size="xl" />
                    <div className="text-center space-y-1.5">
                      <div className="text-2xl font-bold leading-tight">{c.full_name}</div>
                      <div className="flex items-center justify-center">
                        <Badge variant="secondary">{c.code || '-'}</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Alert banner */}
                  {hasAlert ? (
                    <div className="flex items-start gap-3 rounded-card border border-destructive/30 bg-destructive-soft px-4 py-3">
                      <AlertTriangle className="size-10 shrink-0 mt-0.5 text-destructive" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-semibold text-destructive">แจ้งเตือน</div>
                        <div className="text-base text-foreground whitespace-pre-line break-words">{c.alert_note}</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Contact rows — icon + label + value, "-" for missing */}
                  <div className="space-y-3 px-1">
                    {contactRows.map(({ Icon, label, value, wrap }) => {
                      const isEmpty = value === '-'
                      return (
                        <div key={label} className="flex items-start gap-3">
                          <Icon className="size-5 shrink-0 mt-0.5 text-foreground-subtle" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-muted-foreground">{label}</div>
                            <div className={`text-base ${isEmpty ? 'text-foreground-subtle' : 'text-foreground'} ${wrap ? 'whitespace-pre-line break-words' : 'truncate'}`}>
                              {value}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Medical */}
                  {(c.chronic_diseases || allergies.length > 0) ? (
                    <SectionCard icon={HeartPulse} title="ข้อมูลทางการแพทย์" tint="warm">
                      {c.chronic_diseases ? (
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-muted-foreground">โรคประจำตัว</div>
                          <div className="text-base text-foreground whitespace-pre-line break-words">{c.chronic_diseases}</div>
                        </div>
                      ) : null}
                      {allergies.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-muted-foreground">ประวัติแพ้ยา ({allergies.length})</div>
                          <div className="space-y-1.5">
                            {allergies.map(a => (
                              <div key={a.id} className="flex items-start gap-2.5 rounded-lg bg-muted px-3 py-2">
                                <Pill className="size-4 mt-1 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-medium text-foreground">{a.generic_name ?? a.drug_name_free ?? '—'}</span>
                                    <Badge variant={SEVERITY_VARIANTS[a.severity ?? 'moderate'] ?? 'secondary'}>
                                      {SEVERITY_LABELS[a.severity ?? 'moderate']}
                                    </Badge>
                                  </div>
                                  {a.reaction ? <div className="text-sm text-muted-foreground">อาการ: {a.reaction}</div> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </SectionCard>
                  ) : null}
                </>
              )
            })()}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl"
              onClick={() => {
                const id = (customerDetails ?? cart.customer)?.id ?? null
                setShowCustomerInfo(false)
                setEditCustomerId(id)
                setShowQuickAdd(true)
              }}>
              <SquarePen className="size-4" /> แก้ไข
            </Button>
            <Button autoFocus variant="default" size="xl" onClick={() => setShowCustomerInfo(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ADD CUSTOMER DIALOG (shared with People page) ── */}
      <CustomerFormDialog
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        customerId={editCustomerId}
        onSaved={(c) => cart.setCustomer(c)}
      />

      {/* ── PAYMENT DIALOG ── */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent size="4xl" divided onClose={() => setShowPayment(false)} className="h-[800px] grid-rows-[auto_1fr_auto]">
          <DialogHeader><DialogTitle className="text-2xl">ชำระเงิน</DialogTitle></DialogHeader>
          <DialogBody className="min-h-0 overflow-hidden">
            {(() => {
              const subtotal = cart.subtotal()
              // True COGS preview via FEFO simulation — mirrors saveBill so
              // the profit shown here equals the profit reports record.
              // lotRemaining is tracked across the whole cart so multiple
              // lines of the same product don't reuse the same lot qty.
              // Quantities are converted to the base unit because
              // lot.qty_on_hand / lot.cost_price are per base unit.
              const lotRemaining = new Map<number, number>()
              const totalCost = cart.items.reduce((sum, i) => {
                let lineCost = 0
                if (i.product?.is_bundle && i.product.bundle_items?.length) {
                  // Bundle: FEFO-walk EACH component's lots, reusing the same
                  // lotRemaining map so the simulation mirrors saveBill's
                  // deductFefo loop. qty_per_base is always 1 for v1 bundles
                  // (base-unit-only), so the multiplier is just qty_per_bundle × qty.
                  for (const bi of i.product.bundle_items) {
                    let cmpRemaining = (Number(bi.qty_per_bundle) || 0) * i.qty
                    for (const lot of bi.lots ?? []) {
                      if (cmpRemaining <= 0) break
                      if (!lotRemaining.has(lot.id)) lotRemaining.set(lot.id, lot.qty_on_hand)
                      const avail = lotRemaining.get(lot.id)!
                      if (avail <= 0) continue
                      const take = Math.min(avail, cmpRemaining)
                      lineCost += take * lot.cost_price
                      lotRemaining.set(lot.id, avail - take)
                      cmpRemaining -= take
                    }
                    if (cmpRemaining > 0) lineCost += cmpRemaining * (Number(bi.component_cost) || 0)
                  }
                } else {
                  const factor = i.selectedUnit?.qty_per_base ?? 1
                  let baseQty = i.qty * factor
                  for (const lot of i.product?.lots ?? []) {
                    if (baseQty <= 0) break
                    if (!lotRemaining.has(lot.id)) lotRemaining.set(lot.id, lot.qty_on_hand)
                    const avail = lotRemaining.get(lot.id)!
                    if (avail <= 0) continue
                    const take = Math.min(avail, baseQty)
                    lineCost += take * lot.cost_price
                    lotRemaining.set(lot.id, avail - take)
                    baseQty -= take
                  }
                  // Oversold remainder → value at weighted-avg cost.
                  if (baseQty > 0) lineCost += baseQty * (i.product?.cost_price ?? 0)
                }
                return sum + lineCost
              }, 0)
              const net = pendingNet
              const profit = net - totalCost
              const margin = net > 0 ? (profit / net) * 100 : 0
              const netNegative = net < 0

              const applyTotalDiscount = (raw: string) => {
                const parsed = parseFloat(raw)
                const next = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
                if (Math.abs(next - pendingTotalDiscount) < 1e-6) return
                const tempItems = cart.items.map((item, idx) => ({ ...item, discount: pendingEffectiveDiscounts[idx] }))
                const newDiscounts = redistributeDiscounts(tempItems, next)
                setPendingDiscounts(newDiscounts)
                const newNet = subtotal - newDiscounts.reduce((s, d) => s + d, 0)
                setCashAmount(Math.max(0, newNet).toFixed(2))
              }

              const normalizeTotalDiscount = () => {
                setTotalDiscountInput(pendingTotalDiscount.toFixed(2))
              }

              return (
                <div className="grid grid-cols-2 gap-4 h-full min-h-0">
                  {/* LEFT COLUMN — designed receipt preview (themed paper, NOT the
                      literal thermal slip — fed by previewSale so it tracks live) */}
                  <div className="flex flex-col gap-2 min-h-0 h-full">
                    <div className="flex-1 min-h-0 flex items-start justify-center rounded-xl border border-border bg-muted/30 p-6 overflow-auto scrollbar-thin">
                      {cart.items.length === 0 ? (
                        <div className="self-center text-sm text-muted-foreground">ไม่มีสินค้า</div>
                      ) : (
                        <div className="w-[300px] shrink-0" style={{ filter: 'drop-shadow(0 4px 5px rgb(0 0 0 / 0.20)) drop-shadow(0 12px 14px rgb(0 0 0 / 0.16))' }}>
                          <div className="bg-card text-foreground rounded-t-md px-6 pt-6 pb-6" style={{
                            WebkitMaskImage: 'linear-gradient(#000,#000), radial-gradient(circle 12px at 50% 100%, transparent 12px, #000 12px)',
                            WebkitMaskSize: '100% calc(100% - 12px), 10% 12px',
                            WebkitMaskPosition: 'top, left bottom',
                            WebkitMaskRepeat: 'no-repeat, repeat-x',
                            maskImage: 'linear-gradient(#000,#000), radial-gradient(circle 12px at 50% 100%, transparent 12px, #000 12px)',
                            maskSize: '100% calc(100% - 12px), 10% 12px',
                            maskPosition: 'top, left bottom',
                            maskRepeat: 'no-repeat, repeat-x',
                          }}>
                            {/* Shop header */}
                            <div className="text-center space-y-0.5">
                              <div className="text-base font-bold leading-tight">{shopInfo.shop_name || 'ร้านขายยา'}</div>
                              {shopInfo.shop_address ? <div className="text-xs text-muted-foreground leading-snug">{shopInfo.shop_address}</div> : null}
                              {shopInfo.shop_phone ? <div className="text-xs text-muted-foreground">โทร. {shopInfo.shop_phone}</div> : null}
                            </div>
                            <div className="my-3 flex justify-center">
                              <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">ใบเสร็จรับเงิน</span>
                            </div>
                            {/* Meta */}
                            <div className="border-t border-dashed border-border pt-2 space-y-1 text-xs">
                              <div className="flex justify-between text-muted-foreground"><span>เลขที่</span><span className="font-medium text-foreground">(ตัวอย่าง)</span></div>
                              <div className="flex justify-between text-muted-foreground"><span>วันที่</span><span className="font-medium text-foreground">{new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
                              {previewSale.customer_name ? <div className="flex justify-between text-muted-foreground"><span>ลูกค้า</span><span className="font-medium text-foreground truncate max-w-[60%] text-right">{previewSale.customer_name}</span></div> : null}
                            </div>
                            {/* Items */}
                            <div className="border-t border-dashed border-border mt-2 pt-2 space-y-2">
                              {previewSale.items.map((it, i) => (
                                <div key={i} className="text-sm">
                                  <div className="font-semibold leading-snug">{it.item_name}</div>
                                  <div className="flex justify-between gap-2 text-muted-foreground">
                                    <span>{it.qty} {it.unit_name} × {formatCurrency(it.unit_price)}</span>
                                    <span className="text-foreground whitespace-nowrap">{formatCurrency(it.qty * it.unit_price)}</span>
                                  </div>
                                  {it.discount > 0 ? (
                                    <div className="flex justify-between text-xs text-destructive"><span>ส่วนลด</span><span>-{formatCurrency(it.discount)}</span></div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            {/* Totals */}
                            <div className="border-t border-dashed border-border mt-2 pt-2 space-y-1 text-sm">
                              <div className="flex justify-between text-muted-foreground"><span>ยอดรวม</span><span className="text-foreground">{formatCurrency(previewSale.subtotal)}</span></div>
                              {previewSale.total_discount > 0 ? <div className="flex justify-between text-destructive"><span>ส่วนลดรวม</span><span>-{formatCurrency(previewSale.total_discount)}</span></div> : null}
                              {previewSale.total_vat > 0 ? (
                                <>
                                  <div className="flex justify-between text-muted-foreground"><span>มูลค่าก่อนภาษี</span><span className="text-foreground">{formatCurrency(previewSale.total_amount - previewSale.total_vat)}</span></div>
                                  <div className="flex justify-between text-muted-foreground"><span>ภาษีมูลค่าเพิ่ม {vatRate}%</span><span className="text-foreground">{formatCurrency(previewSale.total_vat)}</span></div>
                                </>
                              ) : null}
                            </div>
                            {/* Grand total */}
                            <div className="border-t-2 border-foreground/70 mt-2 pt-2 flex items-end justify-between gap-2">
                              <span className="text-sm font-bold">รวมทั้งสิ้น</span>
                              <span className="text-xl font-extrabold whitespace-nowrap">{formatCurrency(previewSale.total_amount)}</span>
                            </div>
                            {/* Cash / change */}
                            {previewSale.cash_amount > 0 ? (
                              <div className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between text-muted-foreground"><span>รับเงิน</span><span className="text-foreground">{formatCurrency(previewSale.cash_amount)}</span></div>
                                <div className="flex justify-between text-muted-foreground"><span>เงินทอน</span><span className="text-foreground">{formatCurrency(previewSale.change_amount)}</span></div>
                              </div>
                            ) : null}
                            {/* Footer */}
                            <div className="mt-4 text-center text-xs text-muted-foreground">{receiptSettings?.footer_note || 'ขอบคุณที่ใช้บริการค่ะ'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Print toggle — sits with the receipt it controls */}
                    <label className="shrink-0 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-4 h-12 cursor-pointer select-none">
                      <Checkbox checked={printReceiptChecked} onCheckedChange={v => setPrintReceiptChecked(v === true)} />
                      <Printer className="size-5 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">พิมพ์ใบเสร็จหลังชำระเงิน</span>
                      <span className="ml-auto inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">F4</span>
                    </label>
                  </div>

                  {/* RIGHT COLUMN — existing payment controls */}
                  <div className="flex flex-col gap-4 overflow-y-auto scrollbar-thin pr-1 min-h-0 h-full">
                  {/* Section 1 — Gross + editable discount */}
                  <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-medium text-muted-foreground">ราคาขายรวม</span>
                      <span className="text-4xl font-semibold pr-2.5">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xl font-medium text-muted-foreground">ส่วนลดรวม</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={totalDiscountInput}
                        onChange={e => {
                          const v = e.target.value
                          const n = parseFloat(v)
                          if (n > 99999) return
                          setTotalDiscountInput(v)
                          applyTotalDiscount(v)
                        }}
                        max={99999}
                        onBlur={normalizeTotalDiscount}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        placeholder="0.00"
                        disabled={cart.items.length === 0 || subtotal <= 0}
                        className="text-right w-52 h-12 text-4xl font-semibold text-destructive focus-visible:ring-destructive/30"
                      />
                    </div>

                    {/* VAT breakdown — VAT-inclusive: splits the net total, does not add to it */}
                    {vatEnabled && pendingVat > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-muted-foreground">มูลค่าก่อนภาษี</span>
                          <span className="text-xl font-semibold pr-2.5">{formatCurrency(net - pendingVat)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-muted-foreground">{`ภาษีมูลค่าเพิ่ม ${vatRate}%`}</span>
                          <span className="text-xl font-semibold pr-2.5">{formatCurrency(pendingVat)}</span>
                        </div>
                      </>
                    )}

                    {/* Net total — the bottom line of this bill block */}
                    <div className="flex items-end justify-between gap-2 border-t border-border pt-3">
                      <span className="text-xl font-medium text-muted-foreground">เป็นเงินทั้งสิ้น</span>
                      <span className={`text-4xl font-extrabold pr-2.5 leading-none ${netNegative ? 'text-destructive' : 'text-success'}`}>{formatCurrency(net)}</span>
                    </div>
                  </div>

                  {/* Cash input */}
                <div className="rounded-xl border border-success/30 bg-success-soft/40 p-4 space-y-3 h-40">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xl font-medium text-muted-foreground flex items-center gap-1.5">
                      <Banknote className="size-7 text-success" /> รับเงินมา
                    </span>
                    <Input
                      type="number"
                      value={cashAmount}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => {
                          const v = e.target.value
                          const n = parseFloat(v)
                          if (n > 99999) return
                          setCashAmount(v)
                        }}
                        max={99999}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return
                        if (!cashAmount.trim()) {
                          setCashAmount(Math.max(0, pendingNet).toFixed(2))
                          return
                        }
                        handleCompleteSale()
                      }}
                      placeholder="0.00"
                      className="text-right w-52 h-12 text-4xl font-semibold focus-visible:ring-success/30"
                      autoFocus
                    />
                  </div>

                  {/* Change */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xl font-medium text-muted-foreground flex items-center gap-1.5"><RefreshCcw className="size-7 text-warning" /> เงินทอน</span>
                      
                    {netNegative ? (
                      <span className="flex items-center justify-end gap-2 text-2xl font-semibold text-destructive whitespace-nowrap">
                        <AlertTriangle className="size-6 shrink-0" />
                        กรุณาตรวจสอบ
                      </span>
                    ) : (
                      <span className={`text-right text-5xl font-extrabold pr-2.5 leading-none ${change < 0 ? 'text-destructive' : 'text-warning'}`}>
                        {formatCurrency(change)}
                      </span>
                    )}
                  </div>
                </div>
                   {/* Breakdown toggle + detail */}
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="elevated"
                      onClick={() => setShowBreakdown(v => !v)}
                      className="gap-2 text-sm"
                    >
                      {showBreakdown ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      {showBreakdown ? 'ซ่อนรายละเอียด' : 'รายละเอียด'}
                    </Button>
                    {showBreakdown && (
                      <div className="rounded-xl border border-border bg-muted/40 px-5 py-3 space-y-2 text-base">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground font-semibold">ต้นทุน</span>
                          <span className="font-semibold">{formatCurrency(totalCost)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground font-semibold">กำไร</span>
                          <div className="flex items-center gap-4">
                            <span className={`font-semibold ${margin >= 0 ? 'text-success' : 'text-destructive'}`}>
                              ({margin.toFixed(2)} %)
                            </span>
                            <span className="text-muted-foreground/30">|</span>
                            <span className={`font-semibold ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {formatCurrency(profit)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-auto">
                    <Button variant="accent" className="w-full h-32 text-4xl font-bold rounded-2xl" disabled={saving || cart.items.length === 0 || change < 0 || pendingNet < 0} onClick={handleCompleteSale}>
                      <HandCoins className="size-10" /> {saving ? 'กำลังบันทึก...' : ' ชำระเงิน'}
                    </Button>
                  </div>
                  </div>
                </div>
              )
            })()}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ── ADJUST STOCK DIALOG (System A — multi-item) ── */}
      <Dialog open={showAdjust} onOpenChange={(v) => { if (!v) closeAdjust() }}>
        <DialogContent size="4xl" divided onClose={closeAdjust} className="h-[760px] grid-rows-[auto_1fr_auto]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <TintIcon icon={PackageMinus} tint="accent" size="md" bordered />
              ตัดสต็อก
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex flex-col p-0 gap-0 overflow-hidden min-h-0">
            {/* Add-product search bar — opens the shared ProductSearchDialog.
                pt-1 (not pt-0) keeps the input's 1px focus ring from being
                clipped by DialogBody's overflow-hidden top edge. */}
            <div className="px-4 pt-1 pb-3 shrink-0">
              <SearchInput
                ref={adjustInputRef}
                placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อ/รหัสสินค้าเพื่อเพิ่ม..."
                value={adjustQuery}
                onChange={e => handleAdjustSearch(e.target.value)}
                onFocus={() => { if (adjustQuery.trim()) setAdjustSearchOpen(true) }}
                wrapperClassName="w-full"
                className="h-11 text-base"
                autoComplete="off"
              />
            </div>

            {/* Cart-style table — the scroll zone */}
            <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-10">#</TableHead>
                    <TableHead className="min-w-[260px]">รายการ</TableHead>
                    <TableHead className="text-center min-w-10">หน่วย</TableHead>
                    <TableHead className="text-center min-w-10">จำนวน</TableHead>
                    <TableHead className="min-w-12">ล็อต</TableHead>
                    <TableHead className="text-right min-w-10">มูลค่าทุน</TableHead>
                    <TableHead className="text-center w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                        <PackageMinus className="size-10 mx-auto mb-2 opacity-30" />
                        ยังไม่มีรายการตัด — สแกนหรือค้นหาสินค้าด้านบนเพื่อเพิ่ม
                      </TableCell>
                    </TableRow>
                  ) : adjustList.map((item, idx) => {
                    const multiLot = item.allocations.length > 1
                    const firstAlloc = item.allocations[0]
                    const expiry = firstAlloc?.expiry_date ? dayjs(firstAlloc.expiry_date).format('DD/MM/YYYY') : null
                    return (
                      <TableRow key={`${item.product_id}-${item.unit_id}`} className="[&_td]:py-1">
                        <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="max-w-0">
                          <div className="font-semibold text-sm text-foreground whitespace-nowrap overflow-x-clip overflow-y-visible" title={item.product_name}>{item.product_name}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center h-8 px-2 text-sm text-muted-foreground">{item.unit_name}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="primary-soft" size="sm" onClick={() => setAdjustQtyRowIdx(idx)}
                            className="h-8 min-w-[3rem] rounded-md font-semibold">
                            {item.qty}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {/* Lot is FEFO-automated — read-only. Multi-lot rows expose the
                              split in a tooltip so the value is still auditable. */}
                          {multiLot ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                                  <ClockAlert className="size-3 shrink-0" />
                                  FEFO · {item.allocations.length} ล็อต
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-0.5 text-xs">
                                  {item.allocations.map(a => (
                                    <div key={a.lot_id}>Lot {a.lot_number || '—'}{a.expiry_date ? ` · ${dayjs(a.expiry_date).format('DD/MM/YYYY')}` : ''} × {a.base_qty}</div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <ClockAlert className="size-3 shrink-0" />
                              Lot {firstAlloc?.lot_number || '—'}{expiry ? ` · ${expiry}` : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-foreground">{formatCurrency(item.line_total)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <Button size="icon-lg" variant="elevated-destructive" onClick={() => removeAdjustRow(idx)} title="ลบรายการ">
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Footer status bar — count + total cost */}
            <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
              <span className="text-muted-foreground">{adjustList.length.toLocaleString()} รายการ</span>
              <span className="text-muted-foreground">
                มูลค่าทุนรวม
                <span className="text-lg font-extrabold text-foreground ml-2">
                  {formatCurrency(adjustList.reduce((s, i) => s + i.line_total, 0))}
                </span>
              </span>
            </div>

            {/* Reason band */}
            <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3 space-y-2">
              <span className="text-sm font-semibold text-foreground">สาเหตุการตัด <span className="text-destructive">*</span></span>
              <div className="flex flex-wrap items-center gap-1.5">
                {['ใช้ภายใน', 'เสียหาย/แตกหัก', 'สูญหาย'].map(reason => (
                  <Button key={reason}
                    variant={adjustReason === reason ? 'accent' : 'elevated'}
                    size="sm"
                    onClick={() => setAdjustReason(r => r === reason ? '' : reason)}
                    className="h-8 rounded-md">
                    {reason}
                  </Button>
                ))}
                <Input
                  placeholder="หรือระบุสาเหตุเอง..."
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="h-8 flex-1 min-w-[140px] text-sm"
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={closeAdjust}>ยกเลิก</Button>
            <Button
              size="xl"
              variant="accent"
              onClick={handleConfirmAdjust}
              disabled={adjustList.length === 0 || !adjustReason.trim() || adjustSaving}
            >
              {adjustSaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RETURN ITEMS DIALOG (cart-table) ── */}
      <Dialog open={showReturn} onOpenChange={(v) => { if (!v) closeReturn() }}>
        <DialogContent size="4xl" divided onClose={closeReturn} className="h-[760px] grid-rows-[auto_1fr_auto]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <TintIcon icon={RotateCcw} tint="primary" size="md" bordered />
              รับคืนสินค้า
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex flex-col p-0 gap-0 overflow-hidden min-h-0">
            {/* Add-product search bar — opens the shared ProductSearchDialog.
                pt-1 (not pt-0) keeps the input's 1px focus ring from being
                clipped by DialogBody's overflow-hidden top edge. */}
            <div className="px-4 pt-1 pb-3 shrink-0">
              <SearchInput
                ref={returnInputRef}
                placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อ/รหัสสินค้าเพื่อเพิ่ม..."
                value={returnQuery}
                onChange={e => handleReturnSearch(e.target.value)}
                onFocus={() => { if (returnQuery.trim()) setReturnSearchOpen(true) }}
                wrapperClassName="w-full"
                className="h-11 text-base"
                autoComplete="off"
              />
            </div>

            {/* Cart-style table — the scroll zone */}
            <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-10">#</TableHead>
                    <TableHead className="min-w-[280px]">รายการ</TableHead>
                    <TableHead className="text-center min-w-10">หน่วย</TableHead>
                    <TableHead className="text-center min-w-10">จำนวน</TableHead>
                    <TableHead className="min-w-14">ล็อต / วันหมดอายุ</TableHead>
                    <TableHead className="text-right min-w-10">รวม</TableHead>
                    <TableHead className="text-center w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                        <PackageX className="size-10 mx-auto mb-2 opacity-30" />
                        ยังไม่มีรายการคืน — สแกนหรือค้นหาสินค้าด้านบนเพื่อเพิ่ม
                      </TableCell>
                    </TableRow>
                  ) : returnList.map((item, idx) => {
                    const expiry = item.expiry_date ? dayjs(item.expiry_date).format('DD/MM/YYYY') : null
                    const multiLot = item.lots.length > 1
                    return (
                      <TableRow key={`${item.product_id}-${item.unit_id}-${item.lot_id}`} className="[&_td]:py-1.5">
                        <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="max-w-0">
                          <div className="font-semibold text-sm text-foreground whitespace-nowrap overflow-x-clip overflow-y-visible" title={item.product_name}>{item.product_name}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="primary-soft" size="sm" onClick={() => setReturnUnitRowIdx(idx)}
                            className="h-8 rounded-md">
                            {item.unit_name}
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="primary-soft" size="sm" onClick={() => setReturnQtyRowIdx(idx)}
                            className="h-8 min-w-[3rem] rounded-md font-semibold">
                            {item.qty}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {multiLot ? (
                            <Button variant="primary-soft" size="sm" onClick={() => setReturnLotRowIdx(idx)}
                              className="h-8 max-w-full gap-1 rounded-md">
                              <span className="truncate">Lot {item.lot_number || '—'}{expiry ? ` · ${expiry}` : ''}</span>
                              <ChevronDown className="size-3 shrink-0" />
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <ClockAlert className="size-3 shrink-0" />
                              Lot {item.lot_number || '—'}{expiry ? ` · ${expiry}` : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-foreground">{formatCurrency(item.line_total)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <Button size="icon-lg" variant="elevated-destructive" onClick={() => removeReturnRow(idx)} title="ลบรายการ">
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Footer status bar — count + total */}
            <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0">
              <span className="text-muted-foreground">{returnList.length.toLocaleString()} รายการ</span>
              <span className="text-muted-foreground">
                ยอดคืนรวม
                <span className="text-lg font-extrabold text-foreground ml-2">
                  {formatCurrency(returnList.reduce((s, i) => s + i.line_total, 0))}
                </span>
              </span>
            </div>

            {/* Reason band */}
            <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3 space-y-2">
              <span className="text-sm font-semibold text-foreground">สาเหตุการคืน <span className="text-destructive">*</span></span>
              <div className="flex flex-wrap items-center gap-1.5">
                {['ลูกค้าเปลี่ยนใจ', 'สินค้าเสียหาย', 'หมดอายุ'].map(reason => (
                  <Button key={reason}
                    variant={returnReason === reason ? 'default' : 'elevated'}
                    size="sm"
                    onClick={() => setReturnReason(r => r === reason ? '' : reason)}
                    className="h-8 rounded-md">
                    {reason}
                  </Button>
                ))}
                <Input
                  placeholder="หรือระบุสาเหตุเอง..."
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="h-8 flex-1 min-w-[140px] text-sm"
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={closeReturn}>ยกเลิก</Button>
            <Button
              size="xl"
              onClick={handleConfirmReturn}
              disabled={returnList.length === 0 || !returnReason.trim() || returnSaving}
            >
              {returnSaving ? 'กำลังบันทึก...' : 'ยืนยันการคืน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return — shared product search (adds a product into the return list) */}
      <ProductSearchDialog
        open={returnSearchOpen}
        onClose={closeReturnSearch}
        query={returnQuery}
        onQueryChange={handleReturnSearch}
        searching={returnSearching}
        rows={returnResults}
        inputRef={returnSearchInputRef}
        rowKey={(p) => String(p.id)}
        rowClassName="grid items-center px-4 py-2.5"
        rowStyle={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
        onPick={(p) => void addReturnProduct(p)}
        header={
          <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
            style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
            <div>ชื่อสินค้า</div>
            <div className="text-center">หน่วย</div>
            <div className="text-right">ราคาขาย</div>
            <div className="text-right">คงเหลือ</div>
          </div>
        }
        renderRow={(p) => {
          const stock = p.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0
          return (
            <>
              <div className="min-w-0 pr-2">
                <div className="font-semibold text-base truncate">{p.trade_name}</div>
              </div>
              <div className="text-center text-base text-muted-foreground truncate">{p.unit_name ?? '-'}</div>
              <div className="text-right font-bold text-primary text-base">{formatCurrency(p.price_retail)}</div>
              <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock}</div>
            </>
          )
        }}
      />

      {/* Return — inline unit picker (shared) */}
      {returnUnitRowIdx !== null && (() => {
        const row = returnList[returnUnitRowIdx]
        if (!row) return null
        const product = row.product
        const baseUnit = { id: -1, unit_name: product.unit_name ?? '', price_retail: product.price_retail } as ProductUnit
        const allUnits = [baseUnit, ...(product.units ?? [])]
        return (
          <UnitPickerDialog
            open
            onClose={() => setReturnUnitRowIdx(null)}
            productName={row.product_name}
            units={allUnits}
            activeUnitName={row.unit_name}
            onSelect={(u) => { setReturnRowUnit(returnUnitRowIdx, u); setReturnUnitRowIdx(null) }}
          />
        )
      })()}

      {/* Return — inline qty (shared) */}
      {returnQtyRowIdx !== null && (() => {
        const row = returnList[returnQtyRowIdx]
        if (!row) return null
        const lot = row.lots.find(l => l.id === row.lot_id)
        return (
          <QtyDialog
            open
            onClose={() => setReturnQtyRowIdx(null)}
            itemName={row.product_name}
            unitName={row.unit_name}
            initialQty={row.qty}
            unitPrice={row.unit_price}
            stockQty={lot?.qty_on_hand}
            onApply={(qty) => setReturnRowQty(returnQtyRowIdx, qty)}
          />
        )
      })()}

      {/* Return — inline lot picker (Dialog, not Popover: scroll-lock safe) */}
      {returnLotRowIdx !== null && (() => {
        const row = returnList[returnLotRowIdx]
        if (!row) return null
        return (
          <LotPickerDialog
            open
            onClose={() => setReturnLotRowIdx(null)}
            title="เลือกล็อต"
            productName={row.product_name}
            lots={row.lots}
            activeLotId={row.lot_id}
            onSelect={(lot) => { setReturnRowLot(returnLotRowIdx, lot); setReturnLotRowIdx(null) }}
          />
        )
      })()}

      {/* Adjust — shared product search (adds a product+unit into the adjust list) */}
      <ProductSearchDialog
        open={adjustSearchOpen}
        onClose={closeAdjustSearch}
        query={adjustQuery}
        onQueryChange={handleAdjustSearch}
        searching={adjustSearching}
        rows={adjustFlatItems}
        resultCount={adjustResults.length}
        inputRef={adjustSearchInputRef}
        rowKey={(it) => `${it.product.id}-${it.unit?.id ?? 'base'}`}
        rowClassName="grid items-center px-4 py-2.5"
        rowStyle={{ gridTemplateColumns: '1fr 100px 100px' }}
        onPick={(it) => addAdjustProduct(it.product, it.unit)}
        header={
          <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0 border-b border-border"
            style={{ gridTemplateColumns: '1fr 100px 100px' }}>
            <div>ชื่อสินค้า</div>
            <div className="text-center">หน่วย</div>
            <div className="text-right">คงเหลือ</div>
          </div>
        }
        renderRow={(it) => {
          const stock = it.product.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0
          return (
            <>
              <div className="min-w-0 pr-2">
                <div className="font-semibold text-base truncate">{it.product.trade_name}</div>
              </div>
              <div className="text-center text-base text-muted-foreground truncate">{it.unit?.unit_name ?? it.product.unit_name ?? '-'}</div>
              <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock}</div>
            </>
          )
        }}
      />

      {/* Adjust — inline qty editor (FEFO auto re-runs on apply) */}
      {adjustQtyRowIdx !== null && (() => {
        const row = adjustList[adjustQtyRowIdx]
        if (!row) return null
        // Stock available for THIS row's unit = (product base stock − what other
        // rows of the same product already consume) ÷ qty_per_base.
        const baseStock = (row.product.lots ?? []).reduce((s, l) => s + l.qty_on_hand, 0)
        const otherBase = adjustList.reduce((s, r, i) =>
          i !== adjustQtyRowIdx && r.product_id === row.product_id ? s + r.base_qty : s, 0)
        const availUnit = Math.floor(Math.max(0, baseStock - otherBase) / row.qty_per_base)
        const costPerUnit = row.qty > 0 ? row.line_total / row.qty : 0
        return (
          <QtyDialog
            open
            onClose={() => setAdjustQtyRowIdx(null)}
            itemName={row.product_name}
            unitName={row.unit_name}
            initialQty={row.qty}
            unitPrice={costPerUnit}
            stockQty={availUnit}
            onApply={(qty) => setAdjustRowQty(adjustQtyRowIdx, qty)}
          />
        )
      })()}

      {/* ── SUCCESS DIALOG ── */}
      <ConfirmDialog
        open={showSuccess}
        onOpenChange={setShowSuccess}
        variant="success"
        singleButton
        title="บันทึกบิลสำเร็จ"
        description={lastInvoice}
        confirmLabel="ตกลง"
        onConfirm={() => setShowSuccess(false)}
        content={lastSaleForPrint ? (
          <div className="flex justify-center">
            <Button
              variant="elevated"
              onClick={() => { if (lastSaleForPrint) void printCompletedSale(lastSaleForPrint) }}
            >
              <Printer className="size-4" /> พิมพ์ใบเสร็จ
            </Button>
          </div>
        ) : undefined}
      />

      {/* ── UNIT DIALOG ── */}
      {unitModalIdx !== null && (() => {
        const item = cart.items[unitModalIdx]
        const product = item?.product as ProductWithDetails | undefined
        if (!product) return null
        // Synthetic base row (id=-1) so the list always shows the base unit on top.
        // changeCartUnit detects id=-1 and clears selectedUnit so the cart pulls
        // pricing from product.* (single source of truth for the base unit).
        const baseUnit = {
          id: -1,
          unit_name: product.unit_name ?? '',
          price_retail: product.price_retail,
          price_wholesale1: product.price_wholesale1,
          price_wholesale2: product.price_wholesale2,
        } as unknown as ProductUnit
        const allUnits = [baseUnit, ...(product.units ?? [])]
        return (
          <UnitPickerDialog
            open
            onClose={() => setUnitModalIdx(null)}
            productName={item?.item_name}
            units={allUnits}
            activeUnitName={item?.unit_name}
            onSelect={(u) => changeCartUnit(unitModalIdx, u)}
          />
        )
      })()}

      {/* ── PRICE DIALOG ── */}
      <Dialog open={priceModalIdx !== null} onOpenChange={(v) => { if (!v) setPriceModalIdx(null) }}>
        {priceModalIdx !== null && (() => {
          const item = cart.items[priceModalIdx]
          const product = item?.product as ProductWithDetails | undefined
          // Margin at POS is judged against the cost of the lot about to be
          // dispensed (FEFO front lot) — that's the true cost of THIS sale.
          // Fall back to last cost paid, then weighted avg, if no open lot.
          // All per base unit, scaled to the selected unit.
          const factor = item?.selectedUnit?.qty_per_base ?? 1
          const fefoLot = product?.lots?.[0]
          const baseCost = fefoLot
            ? fefoLot.cost_price
            : (product?.last_cost_price || product?.cost_price || 0)
          const cost = baseCost * factor
          // No selectedUnit → cart is on the base unit; pull prices from product (source of truth).
          const useUnit = !!item.selectedUnit
          const retail = useUnit ? item.selectedUnit!.price_retail : product?.price_retail ?? 0
          const wholesale1 = useUnit ? item.selectedUnit!.price_wholesale1 : product?.price_wholesale1 ?? 0
          const wholesale2 = useUnit ? item.selectedUnit!.price_wholesale2 : product?.price_wholesale2 ?? 0
          const priceOptions = product ? [
            { label: 'ราคาปลีก', price: retail },
            ...((wholesale1 ?? 0) > 0 ? [{ label: 'ราคาส่ง 1', price: wholesale1 }] : []),
            ...((wholesale2 ?? 0) > 0 ? [{ label: 'ราคาส่ง 2', price: wholesale2 }] : []),
          ] : []
          const customPrice = parseFloat(customPriceInput) || 0
          const customProfit = customPrice - cost
          const customMarkupPct = cost > 0 ? (customProfit / cost) * 100 : 0
          // Custom price is "active" when the cart's unit_price doesn't match
          // any of the predefined options (retail / wholesale 1 / wholesale 2).
          const customActive = item != null && !priceOptions.some(o => o.price === item.unit_price)
          const applyCustomPrice = () => {
            if (customPrice <= 0) return
            changeCartPrice(priceModalIdx, customPrice)
          }
          return (
            <DialogContent size="md" divided onClose={() => setPriceModalIdx(null)}>
              <DialogHeader>
                <DialogTitle className="text-2xl">ราคา</DialogTitle>
                <div className="text-base font-semibold text-foreground">{item?.item_name}</div>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-2 h-[30rem] overflow-y-auto scrollbar-thin p-0.5">
                  {/* Custom price — special card with an input, kept distinct via primary tint */}
                  <div className={`w-full shrink-0 rounded-xl border-2 p-3.5 transition-all ${customActive ? 'border-primary bg-primary-soft/50 shadow-card' : 'border-primary/30 bg-primary-soft/30'}`}>
                    <div className="flex items-start justify-between gap-3 w-full">
                      <span className="text-base font-semibold text-primary">กำหนดราคาเอง</span>
                      <span className={`grid place-items-center size-7 rounded-full shrink-0 ${customActive ? 'bg-primary text-primary-foreground' : ''}`}>
                        {customActive && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <PriceInput
                        autoFocus
                        value={customPriceInput}
                        onChange={setCustomPriceInput}
                        onFocus={e => e.currentTarget.select()}
                        onKeyDown={e => { if (e.key === 'Enter') applyCustomPrice() }}
                        className="w-full flex-1 h-12 text-3xl font-extrabold text-primary bg-card border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary outline-none px-3"
                      />
                      <Button variant="default" onClick={applyCustomPrice} disabled={customPrice <= 0} className="h-12 px-5 text-base">ตกลง</Button>
                    </div>
                    <div className="mt-2.5 border-t border-border/60 pt-2 grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">ทุน <span className="font-semibold text-foreground">{formatCurrency(cost)}</span></span>
                      <span className="text-muted-foreground">กำไร <span className={`font-semibold ${customProfit > 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(customProfit)}</span></span>
                      <span className="text-muted-foreground">กำไร% <span className={`font-semibold ${customProfit > 0 ? 'text-success' : 'text-destructive'}`}>{cost > 0 ? customMarkupPct.toFixed(1) : '0.0'}%</span></span>
                    </div>
                  </div>

                  {priceOptions.map((opt, i) => {
                    const active = item?.unit_price === opt.price
                    const profit = opt.price - cost
                    const markupPct = cost > 0 ? (profit / cost) * 100 : 0
                    return (
                      <Button key={i} variant="elevated"
                        onClick={() => changeCartPrice(priceModalIdx, opt.price)}
                        className={`w-full h-auto shrink-0 flex flex-col items-stretch justify-between gap-2.5 text-left p-3.5 rounded-xl border-2 transition-all ${active ? 'border-primary bg-primary-soft/50 hover:bg-primary-soft/50 shadow-card' : 'hover:border-border-strong'}`}>
                        {/* Top — label (left) + check (top-right corner); price centered below */}
                        <div className="w-full">
                          <div className="flex items-start justify-between gap-3 w-full">
                            <span className="text-base font-semibold text-muted-foreground">{opt.label}</span>
                            <span className={`grid place-items-center size-7 rounded-full shrink-0 ${active ? 'bg-primary text-primary-foreground' : ''}`}>
                              {active && <Check className="size-4" strokeWidth={3} />}
                            </span>
                          </div>
                          <span className="block text-center text-3xl font-extrabold text-primary leading-none mt-1.5">{formatCurrency(opt.price)}</span>
                        </div>
                        {/* Metrics — anchored to the bottom so the row lines up across all cards (justify-between) */}
                        <div className="w-full border-t border-border/60 pt-2 grid grid-cols-3 gap-2 text-sm font-normal">
                          <span className="text-muted-foreground">ทุน <span className="font-semibold text-foreground">{formatCurrency(cost)}</span></span>
                          <span className="text-muted-foreground">กำไร <span className={`font-semibold ${profit > 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(profit)}</span></span>
                          <span className="text-muted-foreground">กำไร% <span className={`font-semibold ${profit > 0 ? 'text-success' : 'text-destructive'}`}>{cost > 0 ? markupPct.toFixed(1) : '0.0'}%</span></span>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button className="w-32 h-10 text-base" onClick={() => setPriceModalIdx(null)}>ปิด</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {/* ── QTY DIALOG (shared) ── */}
      {qtyModalIdx !== null && (() => {
        const item = cart.items[qtyModalIdx]
        if (!item) return null
        const product = item.product as ProductWithDetails | undefined
        const stockQty = product?.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0
        return (
          <QtyDialog
            open
            onClose={() => setQtyModalIdx(null)}
            itemName={item.item_name}
            unitName={item.unit_name}
            initialQty={item.qty}
            unitPrice={item.unit_price}
            discount={item.discount}
            stockQty={stockQty}
            onApply={(qty) => { cart.updateItem(qtyModalIdx, { qty: Math.max(1, qty) }); refocusSearch() }}
          />
        )
      })()}

      {/* ── DISCOUNT DIALOG ── */}
      <Dialog open={discountModalIdx !== null} onOpenChange={(v) => { if (!v) setDiscountModalIdx(null) }}>
        {discountModalIdx !== null && (() => {
          const item = cart.items[discountModalIdx]
          const d = parseFloat(discountInput) || 0
          const unitPrice = item?.unit_price ?? 0
          const qty = item?.qty ?? 1
          const totalPrice = unitPrice * qty
          const applyDiscount = (totalDisc: number) => {
            if (!item) return
            cart.updateItem(discountModalIdx, { discount: totalDisc })
            setDiscountModalIdx(null)
            refocusSearch()
          }
          const applyPercent = (pct: number) => {
            const disc = parseFloat((totalPrice * pct / 100).toFixed(2))
            setDiscountInput(String(disc))
            setDiscountPctInput(String(pct))
            setFinalPriceInput(String(parseFloat((totalPrice - disc).toFixed(2))))
          }
          return (
            <DialogContent size="md" divided onClose={() => setDiscountModalIdx(null)}>
              <DialogHeader>
                <DialogTitle className="text-2xl">ส่วนลด</DialogTitle>
                <div className="text-base font-semibold text-foreground overflow-x-clip overflow-y-visible">{item?.item_name}</div>
              </DialogHeader>
              <DialogBody className="space-y-4">
                {/* Reference total — the one value with no editable input below */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5">
                  <span className="text-base font-medium text-muted-foreground">ราคารวม</span>
                  <span className="text-3xl font-bold text-foreground">{formatCurrency(totalPrice)}</span>
                </div>

                {/* Percent presets — segmented track with a sliding pill (shared-layout) */}
                <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
                  {[3, 5, 10, 15, 20].map(pct => {
                    const isActive = totalPrice > 0 && Math.abs(d - totalPrice * pct / 100) < 0.01
                    return (
                      <Button key={pct} variant="ghost" size="sm" onClick={() => applyPercent(pct)}
                        className={`relative w-full h-9 text-sm font-semibold hover:bg-transparent active:scale-100 active:translate-y-0 ${isActive ? 'hover:text-destructive-foreground text-destructive-foreground' : 'text-foreground'}`}>
                        {isActive && (
                          <motion.div layoutId="discount-pct-pill" aria-hidden
                            className="absolute inset-0 rounded-md bg-destructive shadow-sm"
                            transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                        )}
                        <span className="relative z-10">{pct}%</span>
                      </Button>
                    )
                  })}
                </div>

                {/* ส่วนลด (%)  +  ส่วนลด (บาท) — side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>ส่วนลด (%)</Label>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={discountFocus === 'pct' ? discountPctInput : formatNumWithCommas(discountPctInput)}
                        onFocus={e => { setDiscountFocus('pct'); e.currentTarget.select() }}
                        onBlur={() => setDiscountFocus(null)}
                        onChange={e => {
                          const v = stripCommas(e.target.value)
                          setDiscountPctInput(v)
                          const pct = parseFloat(v)
                          if (!isNaN(pct)) {
                            const disc = parseFloat((totalPrice * pct / 100).toFixed(2))
                            setDiscountInput(String(disc))
                            setFinalPriceInput(String(parseFloat((totalPrice - disc).toFixed(2))))
                          }
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') applyDiscount(d) }}
                        placeholder="0"
                        className="h-14 text-right text-3xl font-bold pl-4 pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle text-xl font-bold pointer-events-none">%</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>ส่วนลด (บาท)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={discountFocus === 'baht' ? discountInput : formatNumWithCommas(discountInput, true)}
                      onFocus={e => { setDiscountFocus('baht'); e.currentTarget.select() }}
                      onBlur={() => setDiscountFocus(null)}
                      onChange={e => {
                        const v = stripCommas(e.target.value)
                        setDiscountInput(v)
                        const disc = parseFloat(v) || 0
                        if (totalPrice > 0) setDiscountPctInput(String(parseFloat((disc / totalPrice * 100).toFixed(2))))
                        setFinalPriceInput(String(parseFloat((totalPrice - disc).toFixed(2))))
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') applyDiscount(d) }}
                      placeholder="0.00"
                      className="h-14 text-right text-3xl font-bold px-4"
                    />
                  </div>
                </div>

                {/* Final price reverse-calc input */}
                <div className="space-y-1.5">
                  <Label>ราคาสุดท้าย (บาท)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={discountFocus === 'final' ? finalPriceInput : formatNumWithCommas(finalPriceInput, true)}
                    onFocus={e => { setDiscountFocus('final'); e.currentTarget.select() }}
                    onBlur={() => setDiscountFocus(null)}
                    onChange={e => {
                      const v = stripCommas(e.target.value)
                      setFinalPriceInput(v)
                      const fp = parseFloat(v)
                      if (!isNaN(fp)) {
                        const disc = Math.max(0, parseFloat((totalPrice - fp).toFixed(2)))
                        setDiscountInput(String(disc))
                        if (totalPrice > 0) setDiscountPctInput(String(parseFloat((disc / totalPrice * 100).toFixed(2))))
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') applyDiscount(d) }}
                    placeholder={formatCurrency(totalPrice)}
                    className="h-14 text-right text-3xl font-bold px-4"
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="destructive2" size="xl" className="mr-auto" onClick={() => { setDiscountInput('0'); applyDiscount(0) }}><RotateCcw className="size-4" /> ล้าง</Button>
                <Button variant="elevated" size="xl" onClick={() => setDiscountModalIdx(null)}>ปิด</Button>
                <Button size="xl" onClick={() => applyDiscount(d)}>ตกลง</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {overrideAdjust.dialog}
    </div>
  )
}