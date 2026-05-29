import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '@/stores/cartStore'
import { getCurrentUserId } from '@/stores/userStore'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { UnitPickerDialog } from '@/components/ui/unit-picker-dialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatCurrency, getExpiryStatus, formatThaiDateHeader } from '@/lib/utils'
import dayjs from 'dayjs'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product, ProductUnit, ProductLot, Customer, DrugAllergy, SalesSettings } from '@/types'
import { redistributeDiscounts } from './redistributeDiscount'
import { getCartItemAlert, alertColorClass } from './cartAlerts'
import {
  Search, User, Trash2, Plus, Minus,
  Banknote, AlertTriangle, AlertCircle, PackageX,
  X, UserPlus, Info,
  RotateCcw, ChevronRight, ChevronLeft, Tag,
  ShoppingBag, Hourglass, RefreshCcw, HandCoins,
  Phone, MapPin, CreditCard, Cake, Pill, HeartPulse, Contact, Users, PackageMinus, ClockAlert,
  CheckCircle2,
} from 'lucide-react'

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'เล็กน้อย', moderate: 'ปานกลาง', severe: 'รุนแรง', life_threatening: 'อันตรายถึงชีวิต',
}
const SEVERITY_VARIANTS: Record<string, any> = {
  mild: 'secondary', moderate: 'warning', severe: 'danger', life_threatening: 'destructive',
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
  lot_id: number
  product_name: string
  unit_name: string
  lot_number: string
  expiry_date: string | null
  qty: number
  sell_price: number
  line_total: number
}

interface AdjustLineItem {
  product_id: number
  lot_id: number
  product_name: string
  unit_name: string
  lot_number: string
  expiry_date: string | null
  qty: number
  cost_price: number
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

export default function POSPage() {
  const { toast } = useToast()
  const cart = useCartStore()
  const navigate = useNavigate()

  // Search modal
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductWithDetails[]>([])
  const [searching, setSearching] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const modalInputRef = useRef<HTMLInputElement>(null)
  const mainInputRef = useRef<HTMLInputElement>(null)
  const activeRowRef = useRef<HTMLDivElement>(null)

  const [dailyStats, setDailyStats] = useState({ bills: 0, total: 0, latest: '' })
  const [now, setNow] = useState(new Date())

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
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customerHighlightIdx, setCustomerHighlightIdx] = useState(-1)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const activeCustomerRowRef = useRef<HTMLDivElement>(null)
  const [showCustomerInfo, setShowCustomerInfo] = useState(false)
  const [customerDetails, setCustomerDetails] = useState<(Customer & { allergies?: DrugAllergy[] }) | null>(null)

  // Quick add customer
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaName, setQaName] = useState('')
  const [qaPhone, setQaPhone] = useState('')
  const [qaNote, setQaNote] = useState('')
  const [qaSaving, setQaSaving] = useState(false)

  // Success
  const [lastInvoice, setLastInvoice] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  // Sales settings (alert thresholds + toggles) — loaded once on mount.
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)

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
  const [qtyInput, setQtyInput] = useState<string>('')

  // Return items dialog
  const [showReturn, setShowReturn] = useState(false)
  const [returnQuery, setReturnQuery] = useState('')
  const [returnResults, setReturnResults] = useState<ProductWithDetails[]>([])
  const [returnSearching, setReturnSearching] = useState(false)
  const [returnSelectedProduct, setReturnSelectedProduct] = useState<ProductWithDetails | null>(null)
  const [returnProductLots, setReturnProductLots] = useState<ProductLot[]>([])
  const [returnSelectedLotId, setReturnSelectedLotId] = useState<number | null>(null)
  const [returnQtyInput, setReturnQtyInput] = useState('1')
  const [returnList, setReturnList] = useState<ReturnLineItem[]>([])
  const [returnReason, setReturnReason] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)
  const returnInputRef = useRef<HTMLInputElement>(null)
  const returnQtyRef = useRef<HTMLInputElement>(null)
  const returnLotRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Adjust stock dialog (System A — multi-item, mirrors return modal)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustQuery, setAdjustQuery] = useState('')
  const [adjustResults, setAdjustResults] = useState<ProductWithDetails[]>([])
  const [adjustSearching, setAdjustSearching] = useState(false)
  const [adjustSelected, setAdjustSelected] = useState<ProductWithDetails | null>(null)
  const [adjustQtyInput, setAdjustQtyInput] = useState('1')
  const [adjustList, setAdjustList] = useState<AdjustLineItem[]>([])
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const adjustInputRef = useRef<HTMLInputElement>(null)
  const adjustQtyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDailyStats()
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Load POS alert thresholds on mount. Settings changes during a POS session
  // require a refresh — out of scope for this iteration.
  useEffect(() => {
    window.api.settings.getSalesSettings()
      .then(data => { if (data) setSalesSettings(data as SalesSettings) })
      .catch(() => { /* keep defaults / no-alert mode */ })
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
    if (showCustomerSearch) { setCustomerQuery(''); handleSearchCustomer('') }
  }, [showCustomerSearch])

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

  // Keep highlighted row visible as user navigates with arrow keys
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  useEffect(() => { setCustomerHighlightIdx(-1) }, [customerQuery])

  useEffect(() => {
    if (customerHighlightIdx >= 0) activeCustomerRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [customerHighlightIdx])

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
      if (showCustomerSearch) { setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]); return }
      if (searchOpen) { setSearchOpen(false); setQuery(''); setResults([]); return }
      if (showReturn) { closeReturn(); return }
      if (showAdjust) { closeAdjust(); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [qtyModalIdx, discountModalIdx, priceModalIdx, unitModalIdx, searchOpen, showQuickAdd, showCustomerInfo, showCustomerSearch, showReturn, showAdjust])

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

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); setSearchOpen(false); return }
    if (!searchOpen) setSearchOpen(true)
    setSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setResults(data as ProductWithDetails[])
    } finally {
      setSearching(false)
    }
  }, [searchOpen])

  // Reset highlight ONLY when the query text changes — never on scroll/focus/hover
  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  const closeSearch = () => { setSearchOpen(false); setQuery(''); setResults([]) }

  // Base row first (unit=null → uses product.unit_name + product prices), then non-base variants.
  const flatItems = results.flatMap(p => [
    { product: p, unit: null as ProductUnit | null },
    ...(p.units ?? []).map(u => ({ product: p, unit: u })),
  ])

  const handleSelectItem = (product: ProductWithDetails, unit: ProductUnit | null) => {
    const price = resolveSalePrice(unit ?? product, cart.saleType)
    const unitName = unit?.unit_name ?? product.unit_name ?? 'ชิ้น'
    cart.addItem({ product_id: product.id, item_name: product.trade_name, unit_name: unitName, qty: 1, unit_price: price, discount: 0, line_total: price, product, selectedUnit: unit ?? undefined })
    closeSearch()
  }

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, flatItems.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const sel = flatItems[highlightIdx]
      if (sel) handleSelectItem(sel.product, sel.unit)
    }
  }

  const handleSearchCustomer = async (q: string) => {
    setCustomerQuery(q)
    const data = await window.api.pos.searchCustomers(q)
    setCustomerResults(data as Customer[])
  }

  const closeCustomerSearch = () => {
    setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([])
  }

  const closeReturn = () => {
    setShowReturn(false)
    setReturnQuery(''); setReturnResults([]); setReturnSelectedProduct(null)
    setReturnProductLots([]); setReturnSelectedLotId(null)
    setReturnQtyInput('1'); setReturnList([]); setReturnReason('')
  }

  const closeAdjust = () => {
    setShowAdjust(false)
    setAdjustQuery(''); setAdjustResults([]); setAdjustSelected(null)
    setAdjustQtyInput('1')
    setAdjustList([]); setAdjustReason('')
  }

  const handleAdjustSearch = useCallback(async (q: string) => {
    setAdjustQuery(q)
    setAdjustSelected(null)
    if (!q.trim()) { setAdjustResults([]); return }
    setAdjustSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setAdjustResults(data as ProductWithDetails[])
    } finally {
      setAdjustSearching(false)
    }
  }, [])

  const handleAdjustSelectProduct = (product: ProductWithDetails) => {
    setAdjustSelected(product)
    setAdjustQuery(product.trade_name)
    setAdjustResults([])
    setAdjustQtyInput('1')
    setTimeout(() => {
      adjustQtyRef.current?.focus()
      adjustQtyRef.current?.select()
    }, 50)
  }

  // Quick adjust: FEFO across lots. If user wants per-lot edit, use EditProduct → Lots.
  const handleAddAdjustItem = () => {
    if (!adjustSelected) return
    const qty = parseFloat(adjustQtyInput)
    if (!qty || qty <= 0) { toast('กรุณาระบุจำนวน', 'error'); return }

    const lots = (adjustSelected.lots ?? []).slice().sort((a, b) => {
      const ad = a.expiry_date ?? '9999-12-31'
      const bd = b.expiry_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    })
    if (lots.length === 0) { toast('ไม่พบล็อตที่มีสต็อก', 'error'); return }

    let remaining = qty
    const merged = [...adjustList]
    for (const lot of lots) {
      if (remaining <= 0) break
      const queued = merged
        .filter(i => i.product_id === adjustSelected.id && i.lot_id === lot.id)
        .reduce((s, i) => s + i.qty, 0)
      const available = lot.qty_on_hand - queued
      if (available <= 0) continue
      const take = Math.min(remaining, available)
      const idx = merged.findIndex(i => i.product_id === adjustSelected.id && i.lot_id === lot.id)
      if (idx >= 0) {
        const newQty = merged[idx].qty + take
        merged[idx] = { ...merged[idx], qty: newQty, line_total: newQty * lot.cost_price }
      } else {
        merged.push({
          product_id: adjustSelected.id,
          lot_id: lot.id,
          product_name: adjustSelected.trade_name,
          unit_name: adjustSelected.unit_name ?? 'ชิ้น',
          lot_number: lot.lot_number || '',
          expiry_date: lot.expiry_date ?? null,
          qty: take,
          cost_price: lot.cost_price,
          line_total: take * lot.cost_price,
        })
      }
      remaining -= take
    }

    if (remaining > 0) {
      const totalAvail = lots.reduce((s, l) => s + l.qty_on_hand, 0)
      toast(`จำนวนเกินสต็อกคงเหลือ (มีทั้งหมด ${totalAvail} ${adjustSelected.unit_name ?? ''})`, 'error')
      return
    }

    setAdjustList(merged)

    // Reset for next item — back to search
    setAdjustSelected(null)
    setAdjustQuery('')
    setAdjustResults([])
    setAdjustQtyInput('1')
    setTimeout(() => adjustInputRef.current?.focus(), 50)
  }

  const handleConfirmAdjust = async () => {
    if (adjustList.length === 0 || !adjustReason.trim()) return
    setAdjustSaving(true)
    try {
      await window.api.products.adjustLotBatch({
        items: adjustList.map(i => ({ product_id: i.product_id, lot_id: i.lot_id, qty: i.qty })),
        reason: adjustReason.trim(),
        user_id: getCurrentUserId(),
      })
      toast(`ตัดสต็อก ${adjustList.length} รายการสำเร็จ`, 'success')
      closeAdjust()
      refocusSearch()
    } catch (e: any) {
      toast(e?.message ?? 'ตัดสต็อกไม่สำเร็จ', 'error')
    } finally {
      setAdjustSaving(false)
    }
  }

  const handleReturnSearch = useCallback(async (q: string) => {
    setReturnQuery(q)
    setReturnSelectedProduct(null)
    setReturnProductLots([]); setReturnSelectedLotId(null)
    if (!q.trim()) { setReturnResults([]); return }
    setReturnSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setReturnResults(data as ProductWithDetails[])
    } finally {
      setReturnSearching(false)
    }
  }, [])

  const handleReturnSelectProduct = async (product: ProductWithDetails) => {
    // Bundles can't be returned through the manual product-pick flow — there
    // are no own lots and selecting components individually loses the
    // "whole bundle" semantics + the original lot trace. Direct the operator
    // to the sale-detail page (Manage/Sales → bill → "คืนชุดนี้").
    if ((product as any).is_bundle === 1) {
      toast({
        title: 'คืนชุดสินค้าให้ทำผ่านหน้าบิล',
        description: 'เปิด ประวัติ & สต็อก → ประวัติการขาย → คลิกบิล → ปุ่ม "คืนชุดนี้"',
      })
      return
    }
    setReturnSelectedProduct(product)
    setReturnQuery(product.trade_name)
    setReturnResults([])
    setReturnSelectedLotId(null)
    setReturnQtyInput('1')
    const lots = await (window.api.products as any).getLots(product.id) as ProductLot[]
    setReturnProductLots(lots)
    if (lots.length > 0) setReturnSelectedLotId(lots[0].id)
    returnLotRefs.current = []
    setTimeout(() => {
      returnInputRef.current?.blur()
      returnLotRefs.current[0]?.focus()
    }, 50)
  }

  const handleAddReturnItem = () => {
    if (!returnSelectedProduct || !returnSelectedLotId) return
    const qty = parseFloat(returnQtyInput)
    if (!qty || qty <= 0) return
    const lot = returnProductLots.find(l => l.id === returnSelectedLotId)
    if (!lot) return
    const sellPrice = lot.sell_price
    const existingIdx = returnList.findIndex(i => i.product_id === returnSelectedProduct.id && i.lot_id === returnSelectedLotId)
    if (existingIdx >= 0) {
      setReturnList(list => list.map((item, idx) => {
        if (idx !== existingIdx) return item
        const newQty = item.qty + qty
        return { ...item, qty: newQty, line_total: newQty * item.sell_price }
      }))
    } else {
      setReturnList(list => [...list, {
        product_id: returnSelectedProduct.id,
        lot_id: returnSelectedLotId,
        product_name: returnSelectedProduct.trade_name,
        unit_name: returnSelectedProduct.unit_name ?? 'ชิ้น',
        lot_number: lot.lot_number ?? '',
        expiry_date: lot.expiry_date ?? null,
        qty,
        sell_price: sellPrice,
        line_total: qty * sellPrice,
      }])
    }
    setReturnQuery(''); setReturnResults([]); setReturnSelectedProduct(null)
    setReturnProductLots([]); setReturnSelectedLotId(null); setReturnQtyInput('1')
    setTimeout(() => returnInputRef.current?.focus(), 50)
  }

  const handleConfirmReturn = async () => {
    if (returnList.length === 0 || !returnReason.trim()) return
    setReturnSaving(true)
    try {
      const result = await (window.api.pos as any).returnItems({
        items: returnList.map(i => ({
          product_id: i.product_id, lot_id: i.lot_id,
          product_name: i.product_name, unit_name: i.unit_name,
          qty: i.qty, unit_price: i.sell_price, line_total: i.line_total,
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

  const handleQuickAdd = async () => {
    if (!qaName.trim()) { toast('กรุณากรอกชื่อ', 'error'); return }
    setQaSaving(true)
    try {
      const c = await window.api.pos.addCustomer({ full_name: qaName.trim(), phone: qaPhone.trim(), alert_note: qaNote.trim() }) as Customer
      cart.setCustomer(c)
      setShowQuickAdd(false); setQaName(''); setQaPhone(''); setQaNote('')
      toast('เพิ่มลูกค้าสำเร็จ', 'success')
    } catch (e: any) { toast(e?.message ?? 'เกิดข้อผิดพลาด', 'error') }
    finally { setQaSaving(false) }
  }

  // Modal-scoped pending values — fall back to cart discounts when the modal
  // hasn't seeded (or items changed since the last seed).
  const pendingEffectiveDiscounts = pendingDiscounts.length === cart.items.length
    ? pendingDiscounts
    : cart.items.map(i => i.discount)
  const pendingTotalDiscount = pendingEffectiveDiscounts.reduce((s, d) => s + d, 0)
  const pendingNet = cart.subtotal() - pendingTotalDiscount
  const totalPaid = (parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(transferAmount) || 0)
  const change = totalPaid - pendingNet

  const handleCompleteSale = async () => {
    if (saving) return
    if (cart.items.length === 0) { toast('กรุณาเพิ่มสินค้าในตะกร้า', 'error'); return }
    if (pendingNet < 0) { toast('ยอดสุทธิติดลบ กรุณาตรวจสอบ', 'error'); return }
    if (change < 0) { toast('รับเงินไม่พอ กรุณาตรวจสอบ', 'error'); return }
    setSaving(true)
    try {
      const result = await window.api.pos.saveBill({
        sale_type: cart.saleType, customer_id: cart.customer?.id ?? null, customer_name_free: cart.customerNameFree,
        items: cart.items.map((i, idx) => {
          const d = pendingEffectiveDiscounts[idx]
          return { product_id: i.product_id, item_name: i.item_name, unit_name: i.unit_name, qty: i.qty, qty_per_base: i.selectedUnit?.qty_per_base ?? 1, unit_price: i.unit_price, discount: d, line_total: i.qty * i.unit_price - d, item_note: i.item_note }
        }),
        subtotal: cart.subtotal(), total_discount: pendingTotalDiscount, total_amount: pendingNet,
        cash_amount: parseFloat(cashAmount) || 0, card_amount: parseFloat(cardAmount) || 0, transfer_amount: parseFloat(transferAmount) || 0,
        change_amount: Math.max(0, change), symptom_note: cart.symptomNote, age_range: cart.ageRange, sold_by: getCurrentUserId(),
      }) as any
      setLastInvoice(result.invoice_no)
      setDailyStats({ bills: result.daily_bills, total: result.daily_total, latest: result.latest_bill_time })
      cart.clearCart(); setExpandedBundles(new Set()); setShowPayment(false); setShowSuccess(true)
      setCashAmount(''); setCardAmount(''); setTransferAmount('')
      // Bill may have oversold a product (deductFefo writes lot_id=NULL marker
      // rows when stock runs out). Refresh the sidebar badge so the operator
      // sees the queue grow.
      useNegativeStockBadge.getState().refresh()
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

  const dateStr = formatThaiDateHeader(now)
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">

      <PageHeader title="หน้าจอการขายสินค้า" />

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
                        <Badge variant={isActive ? 'warm' : 'tertiary'} className="text-xs rounded-md">ขายส่ง</Badge>
                      ) : (
                        <Badge variant={isActive ? 'brand-soft' : 'default'} className="text-xs rounded-md">ขายปลีก</Badge>
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
                <span className="relative grid place-items-center w-10 h-10 rounded-full shrink-0 bg-primary text-primary-foreground">
                  <User className="size-6" />
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
                  onClick={() => setShowQuickAdd(true)}
                  className="h-8 rounded-lg text-xs gap-1">
                  <UserPlus className="size-3.5" /> เพิ่มลูกค้า
                </Button>
              </div>
            </div>
          </div>

          {/* Cart card (search + table + footer) */}
          <div className="flex flex-1 flex-col min-h-0 bg-card rounded-2xl shadow-card overflow-hidden border border-border">

          {/* Sale type + search + clear-all header */}
          <div className="flex items-center gap-2 px-4 h-14 shrink-0 border-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { cart.setSaleType('retail'); refocusSearch() }}
              className={`relative flex h-9 w-[84px] px-0 rounded-lg text-sm font-semibold shrink-0 justify-center hover:bg-transparent ${
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
              className={`relative flex h-9 w-[84px] px-0 rounded-lg text-sm font-semibold shrink-0 justify-center hover:bg-transparent ${
                cart.saleType === 'wholesale' ? 'text-tertiary-foreground hover:text-tertiary-foreground' : 'text-foreground-subtle hover:text-foreground'
              }`}>
              {cart.saleType === 'wholesale' && (
                <motion.div
                  layoutId="pos-sale-type-pill"
                  aria-hidden
                  className="absolute inset-0 rounded-lg bg-tertiary"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                />
              )}
              <span className="relative z-10">ขายส่ง</span>
            </Button>
            <div className="relative flex-1 min-w-0">
              <Input
                ref={mainInputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด / รหัสสินค้า"
                autoFocus
                autoComplete="off"
                className="h-9 py-2 pl-3 pr-9 text-sm rounded-lg border-0 shadow-none"/>
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
                                  {alert.level === 'expired'   && <ClockAlert    className="size-4" />}
                                  {alert.level === 'low_stock' && <PackageX      className="size-4" />}
                                  {alert.level === 'danger'    && <AlertTriangle className="size-4" />}
                                  {alert.level === 'warn'      && <AlertCircle   className="size-4" />}
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
                          <Button variant="outline" size="sm" onClick={() => setUnitModalIdx(idx)}
                            className="flex items-center w-full justify-center h-8 px-2 overflow-hidden rounded-md bg-accent-soft text-warning-strong text-sm font-semibold hover:bg-accent-soft transition-colors">
                            <span className="truncate">{item.unit_name}</span>
                          </Button>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        <Button variant="outline" size="sm"
                          onClick={() => { setQtyInput(String(item.qty)); setQtyModalIdx(idx) }}
                          className="flex items-center w-full justify-center h-8 rounded-md bg-info-soft text-info-soft-foreground text-sm font-semibold hover:bg-info-soft transition-colors ">
                          <span className="flex-1 text-center">{item.qty}</span>
                        </Button>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => { setCustomPriceInput(String(item.unit_price)); setPriceModalIdx(idx) }}
                          className="flex items-center justify-end w-full h-8 pl-2.5 pr-2 overflow-hidden rounded-md bg-primary-soft text-primary text-sm font-semibold hover:bg-primary-soft transition-colors">
                          <span className="text-right truncate">{formatCurrency(item.unit_price)}</span>
                        </Button>
                      </TableCell>

                      <TableCell className="text-right">
                        {item.discount ? (
                          <Button variant="outline" size="sm"
                            onClick={() => { const totalPrice = item.unit_price * item.qty; setDiscountInput(String(parseFloat(item.discount.toFixed(2)))); setDiscountPctInput(totalPrice > 0 ? String(parseFloat((item.discount / totalPrice * 100).toFixed(2))) : ''); setFinalPriceInput(String(parseFloat((totalPrice - item.discount).toFixed(2)))); setDiscountModalIdx(idx) }}
                            className="flex items-center justify-end w-full h-8 pl-2.5 pr-2 rounded-md bg-destructive-soft text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors">
                            <span className="leading-none">{formatCurrency(item.discount)}</span>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm"
                            onClick={() => { setDiscountInput(''); setDiscountPctInput(''); setFinalPriceInput(''); setDiscountModalIdx(idx) }}
                            className="flex items-center justify-end w-full h-8 pl-2.5 pr-2 rounded-md bg-card text-destructive text-sm font-medium bg-destructive-soft hover:bg-destructive-soft hover:text-destructive transition-colors">
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

            {cart.items.length > 0 && (
              <div className="px-5 h-12 shrink-0 flex items-center gap-6 bg-card border-t border-border">
                <div>
                  <div className="text-sm font-semibold text-foreground-subtle">จำนวน <span className="text-sm font-medium text-foreground">{cart.items.length}</span> รายการ</div>
                </div>
                <div className="flex-1 flex items-center justify-center gap-4 text-xs text-foreground-subtle">
                  <span className="inline-flex items-center gap-1">
                    <ClockAlert className="size-3.5 text-destructive" /> หมดอายุ
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <PackageX className="size-3.5 text-destructive" /> สต๊อกไม่พอ
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="size-3.5 text-warning-strong" /> อายุต่ำกว่า {salesSettings?.expiry_danger_months ?? 3} เดือน
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <AlertCircle className="size-3.5 text-warning" /> อายุต่ำกว่า {salesSettings?.expiry_warn_months ?? 6} เดือน
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
            )}
          </div>
          </div>

        </div>

        {/* Right column */}
        <div className="w-80 flex flex-col gap-2.5 min-w-0">
          {/* Total card */}
          <div className="h-40 rounded-2xl bg-primary text-primary-foreground p-5 shadow-card shrink-0 border border-border">
            <div className="text-right text-md font-medium opacity-80 tracking-wide">ยอดสุทธิ</div>
            <div className="mt-6 text-right font-bold leading-[1.05] tracking-tight text-right" style={{ fontSize: '66px', letterSpacing: '-1.5px' }}>
              {formatCurrency(cart.totalAmount())}
            </div>
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
            className="w-full flex-1 max-h-32 justify-center gap-3 bg-accent text-accent-foreground hover:bg-tertiary-hover  disabled:text-foreground-subtle disabled:opacity-100 rounded-2xl px-5 py-3 border border-border">
              <HandCoins className="size-9" strokeWidth={2.2} />
              <span className="text-4xl font-bold leading-none">ชำระเงิน</span>
          </Button>

          {/* Quick actions (vertical stack) */}
          <div className="flex flex-col gap-1.5 flex-1 min-h-0">
            <Button variant="outline" onClick={() => { (window.api.printer as any)?.openCashDrawer?.(); refocusSearch() }}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto bg-card text-foreground hover:bg-muted text-xl font-medium border border-border">
              <Banknote className="size-6 text-foreground-subtle" /> เปิดลิ้นชัก
            </Button>
            <Button variant="outline" disabled
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto bg-card text-foreground hover:bg-muted text-xl font-medium border border-border">
              <Tag className="size-6 text-foreground-subtle" /> พิมพ์ฉลาก
            </Button>
            <Button variant="outline" onClick={() => setShowAdjust(true)}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto bg-card hover:bg-warning-soft hover:text-warning-strong text-xl font-medium text-foreground border border-border">
              <PackageMinus className="size-6 text-foreground-subtle" /> ตัดสต็อก
            </Button>
            <Button variant="outline" onClick={() => setShowReturn(true)}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto bg-card text-foreground hover:bg-muted text-xl font-medium border border-border">
              <RotateCcw className="size-6 text-foreground-subtle" /> รับคืนสินค้า
            </Button>
            <Button variant="outline" onClick={() => navigate('/manage')}
              className="w-full justify-center gap-3 rounded-xl px-4 flex-1 min-h-9 h-auto bg-card text-foreground hover:bg-muted hover:text-destructive text-xl font-medium border border-border">
              <Trash2 className="size-6 text-foreground-subtle" /> ยกเลิกบิล
            </Button>
          </div>

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

      {/* ── PRODUCT SEARCH DIALOG (1000×800) ── */}
      <Dialog open={searchOpen} onOpenChange={(v) => { if (!v) closeSearch() }}>
        <DialogContent
          showCloseButton={false}
          onClose={closeSearch}
          className="flex flex-col overflow-hidden p-0 gap-0 sm:max-w-none border-0 border-transparent"
          style={{ width: '1000px', maxWidth: 'calc(100vw - 2rem)', height: '800px', maxHeight: 'calc(100vh - 4rem)' }}
        >
          <DialogTitle className="sr-only">ค้นหาสินค้า</DialogTitle>
          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 shrink-0">
            <Search className="h-5 w-5 text-primary shrink-0" />
            <Input
              ref={modalInputRef}
              value={query}
              autoFocus
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={handleModalKeyDown}
              placeholder="ค้นหารหัส, ชื่อยา หรือสแกนบาร์โค้ด..."
              className="flex-1 text-lg outline-none bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 h-auto px-0"
              autoComplete="off"
            />
            {query && (
              <Button variant="outline" size="icon-xs" onClick={() => { setQuery(''); setResults([]); modalInputRef.current?.focus() }}
                className="rounded-full text-foreground-subtle"><X className="size-3" strokeWidth={3} /></Button>
            )}
            <Button variant="outline" size="sm" onClick={closeSearch}
              className="h-7">
              Esc
            </Button>
          </div>

          {/* Column header */}
          <div className="grid items-center px-4 py-2 bg-muted text-sm font-bold text-muted-foreground shrink-0"
            style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
            <div>ชื่อสินค้า</div>
            <div className="text-center">หน่วย</div>
            <div className="text-right">ราคาขาย</div>
            <div className="text-right">คงเหลือ</div>
          </div>

          {/* Results — flex-1, scrolls internally, empty space stays empty */}
          <div className="flex-1 overflow-y-auto scrollbar-thin" tabIndex={-1}>
            {searching && flatItems.length === 0 ? (
              <div className="py-12 text-center text-foreground-subtle text-base">กำลังค้นหา...</div>
            ) : query && flatItems.length === 0 ? (
              <div className="py-12 text-center text-foreground-subtle text-base">ไม่พบสินค้า "{query}"</div>
            ) : !query ? (
              <div className="py-12 text-center text-foreground-subtle">
                <Search className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-base">พิมพ์เพื่อค้นหาสินค้า</p>
              </div>
            ) : (
              flatItems.map((it, i) => {
                // Bundles have no own lots — derive stock from components
                // (MIN of floor(component_qty / qty_per_bundle)). Expiry warn
                // also scans across all component lots. Regular products read
                // their own lots as before.
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
                const active = i === highlightIdx
                const expiryWarn = isBundle
                  ? (it.product.bundle_items ?? []).some(bi =>
                      (bi.lots ?? []).some(l => getExpiryStatus(l.expiry_date) !== 'normal'))
                  : it.product.lots?.some(l => getExpiryStatus(l.expiry_date) !== 'normal')
                return (
                  <div
                    key={`${it.product.id}-${it.unit?.id ?? 'base'}`}
                    ref={active ? activeRowRef : undefined}
                    onClick={() => handleSelectItem(it.product, it.unit)}
                    className={`grid items-center px-4 py-2.5 cursor-pointer transition-colors ${active ? 'bg-primary-soft' : 'hover:bg-primary-soft'}`}
                    style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-base flex items-center gap-1.5 truncate">
                        {expiryWarn && <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />}
                        <span className="truncate">{it.product.trade_name}</span>
                        {stock === 0 && <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-medium shrink-0">หมด</span>}
                      </div>
                    </div>
                    <div className="text-center text-base text-muted-foreground truncate">{unitName}</div>
                    <div className="text-right font-bold text-primary text-base">{formatCurrency(price)}</div>
                    <div className={`text-right text-base font-semibold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock}</div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer status */}
          <div className="px-4 py-2 bg-muted text-sm text-muted-foreground shrink-0">
            ค้นหา: "{query}" — พบ {results.length} รายการ
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CUSTOMER SEARCH DIALOG ── */}
      <Dialog open={showCustomerSearch} onOpenChange={(v) => { if (!v) closeCustomerSearch() }}>
        <DialogContent
          showCloseButton={false}
          onClose={closeCustomerSearch}
          className="flex flex-col overflow-hidden p-0 gap-0 sm:max-w-none border-0 border-transparent"
          style={{ width: '560px', maxWidth: 'calc(100vw - 2rem)', height: '620px', maxHeight: 'calc(100vh - 4rem)' }}
        >
          <DialogTitle className="sr-only">เลือกลูกค้า</DialogTitle>

          {/* Search input row */}
          <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-border">
            <Search className="size-5 text-primary shrink-0" />
            <Input
              ref={customerInputRef}
              value={customerQuery}
              autoFocus
              onChange={e => handleSearchCustomer(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setCustomerHighlightIdx(i => Math.min(i + 1, customerResults.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setCustomerHighlightIdx(i => Math.max(i - 1, -1)) }
                else if (e.key === 'Enter') {
                  e.preventDefault()
                  const idx = customerHighlightIdx < 0 ? 0 : customerHighlightIdx
                  const sel = customerResults[idx]
                  if (sel) { cart.setCustomer(sel); closeCustomerSearch() }
                }
              }}
              placeholder="ค้นหา ชื่อ, เบอร์โทร, รหัส..."
              className="flex-1 text-lg outline-none bg-transparent border-0 shadow-none text-sm focus-visible:ring-0 focus-visible:border-0 h-auto px-0"
              autoComplete="off"
            />
            {customerQuery && (
              <Button variant="elevated" size="icon-xs" onClick={() => { setCustomerQuery(''); setCustomerResults([]); customerInputRef.current?.focus() }}
                className="rounded-full text-foreground-subtle"><X className="size-3" strokeWidth={3} /></Button>
            )}
            <Button variant="elevated" size="sm" onClick={closeCustomerSearch} className="h-7">Esc</Button>
          </div>

          {/* Section label */}
          <div className="px-5 pt-3 pb-1.5 text-sm font-semibold text-muted-foreground shrink-0">
            {customerQuery ? `ผลการค้นหา (${customerResults.length})` : 'ลูกค้าทั้งหมด'}
          </div>

          {/* Results — scrolls internally. Walk-in is pinned as the first row of the list. */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-2" tabIndex={-1}>
            <div className="divide-y divide-border">
              {/* Walk-in shortcut — pinned first, styled as a list row */}
              <div
                onClick={() => { cart.setCustomer(null); closeCustomerSearch() }}
                className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-primary-soft/60"
              >
                <span className="grid place-items-center size-11 rounded-xl shrink-0 bg-primary text-primary-foreground">
                  <Users className="size-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">ลูกค้าทั่วไป</div>
                  <div className="text-sm text-muted-foreground">ขายโดยไม่ระบุลูกค้า</div>
                </div>
                <Badge variant="tertiary" className="text-xs rounded-md shrink-0">ค่าเริ่มต้น</Badge>
                <ChevronRight className="size-4 text-foreground-subtle shrink-0 group-hover:text-foreground transition-colors" />
              </div>

              {customerResults.map((c, i) => {
                const active = i === customerHighlightIdx
                const hasAlert = !!(c.is_alert && c.alert_note)
                return (
                  <div
                    key={c.id}
                    ref={active ? activeCustomerRowRef : undefined}
                    onClick={() => { cart.setCustomer(c); closeCustomerSearch() }}
                    className={`group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${active ? 'bg-primary-soft' : 'hover:bg-primary-soft/60'}`}
                  >
                      <span className="grid place-items-center size-11 rounded-xl shrink-0 bg-primary text-primary-foreground">
                        <User className="size-6" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-foreground truncate">{c.full_name}</span>
                          {hasAlert ? (
                            <Badge variant="destructive" className="gap-1 shrink-0">
                              <AlertTriangle className="size-3" /> แจ้งเตือน
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="text-sm">{c.code}</span>
                          {c.phone ? <><span className="text-foreground-subtle">·</span><Phone className="size-3 shrink-0" /><span className="truncate">{c.phone}</span></> : null}
                        </div>
                      </div>
                      <ChevronRight className={`size-4 shrink-0 transition-colors ${active ? 'text-primary' : 'text-foreground-subtle group-hover:text-foreground'}`} />
                    </div>
                  )
              })}
            </div>

            {customerResults.length === 0 && (
              <div className="py-12 text-center text-foreground-subtle">
                {customerQuery ? (
                  <>
                    <UserPlus className="size-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base">ไม่พบลูกค้า "{customerQuery}"</p>
                    <p className="text-sm mt-1">ลองเพิ่มลูกค้าใหม่จากปุ่ม "เพิ่มลูกค้า"</p>
                  </>
                ) : (
                  <>
                    <Search className="size-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base">พิมพ์เพื่อค้นหาลูกค้า</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted border-t border-border text-xs text-muted-foreground shrink-0">
            <span>
              <kbd>↑↓</kbd> เลื่อน · <kbd>Enter</kbd> เลือก · <kbd>Esc</kbd> ปิด
            </span>
            <span>พบ {customerResults.length} รายการ</span>
          </div>
        </DialogContent>
      </Dialog>

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
                    <span className="grid place-items-center size-24 rounded-full bg-primary text-primary-foreground">
                      <User className="size-12" />
                    </span>
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
            <Button autoFocus variant="elevated" size="xl" onClick={() => setShowCustomerInfo(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QUICK ADD CUSTOMER DIALOG ── */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent size="md" onClose={() => setShowQuickAdd(false)}>
          <DialogHeader><DialogTitle className="text-xl">เพิ่มลูกค้าใหม่</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4"
            onKeyDown={e => { if (e.key === 'Enter' && !qaSaving && qaName.trim()) handleQuickAdd() }}>
            <div>
              <Label className="block text-base font-medium mb-1">ชื่อ-นามสกุล <span className="text-destructive">*</span></Label>
              <Input autoFocus value={qaName} onChange={e => setQaName(e.target.value)} />
            </div>
            <div>
              <Label className="block text-base font-medium mb-1">เบอร์โทรศัพท์</Label>
              <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)}/>
            </div>
            <div>
              <Label className="block text-base font-medium mb-1">หมายเหตุ / ประวัติแพ้ยา</Label>
              <Input value={qaNote} onChange={e => setQaNote(e.target.value)}/>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" className="w-32 h-10 text-base" onClick={() => setShowQuickAdd(false)}>ยกเลิก</Button>
            <Button className="w-32 h-10 text-base" onClick={handleQuickAdd} disabled={qaSaving}>{qaSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PAYMENT DIALOG ── */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent size="full" onClose={() => setShowPayment(false)} className="h-[880px] grid-rows-[auto_1fr_auto]">
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
              const needsCheck = netNegative || change < 0

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
                  {/* LEFT COLUMN — customer info + transaction details */}
                  <div className="flex flex-col gap-3 min-h-0 h-full">
                    {/* Customer header */}
                    <div className="flex items-center gap-3 px-1">
                      <span className="grid place-items-center w-12 h-12 rounded-xl shrink-0 bg-primary text-primary-foreground">
                        <User className="size-8" />
                      </span>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="text-base font-bold truncate">
                          {cart.customer ? cart.customer.full_name : 'ลูกค้าทั่วไป'}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {cart.customer?.code ? (
                            <span className="text-sm text-muted-foreground truncate">{cart.customer.code}</span>
                          ) : null}
                          {cart.saleType === 'wholesale' ? (
                            <Badge variant="warm" className="text-xs rounded-md shrink-0">ขายส่ง</Badge>
                          ) : (
                            <Badge variant="brand-soft" className="text-sm rounded-md shrink-0">ขายปลีก</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-sm">
                        <span className="font-semibold whitespace-nowrap">{dateStr}</span>
                        <span className="text-muted-foreground">{timeStr}</span>
                      </div>
                    </div>

                    {/* Transaction details */}
                    <div className="rounded-xl bg-muted p-4 flex flex-col min-h-0 flex-1">
                      <div className="text-base font-semibold mb-2 shrink-0 flex items-center justify-between">
                        <span>รายการสินค้า</span>
                        <span className="text-base font-semibold text-muted-foreground">{cart.items.length} รายการ</span>
                      </div>
                      <div className="overflow-y-auto scrollbar-thin -mr-2 pr-2 flex-1 min-h-0">
                        {cart.items.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-8 text-center">ไม่มีสินค้า</div>
                        ) : (
                          <ul className="divide-y divide-border">
                            {cart.items.map((item, idx) => (
                              <li key={idx} className="flex items-start justify-between gap-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                  <div className="text-base font-semibold truncate">{item.item_name}</div>
                                  <div className="text-sm text-muted-foreground">{formatCurrency(item.line_total)}</div>
                                  {item.product?.is_bundle && item.product.bundle_items?.length ? (
                                    <div className="text-xs text-muted-foreground truncate">
                                      ประกอบด้วย: {item.product.bundle_items
                                        .map(b => `${b.component_name} ×${b.qty_per_bundle}`)
                                        .join(', ')}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="shrink-0 text-right text-sm whitespace-nowrap">
                                  {item.qty}{item.unit_name ? ` ${item.unit_name}` : ''}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN — existing payment controls */}
                  <div className="flex flex-col gap-4 overflow-y-auto scrollbar-thin pr-1 min-h-0 h-full">
                  {/* Section 1 — Gross + editable discount */}
                  <div className="rounded-xl bg-muted p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-semibold text-muted-foreground">ราคาขายรวม</span>
                      <span className="text-3xl font-semibold pr-2.5">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xl font-semibold text-muted-foreground">ส่วนลดรวม</span>
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
                        className="text-right w-52 h-12 text-3xl font-semibold bg-card text-destructive focus-visible:ring-destructive/30"
                      />
                    </div>
                  </div>

                  {/* Section 2 — Net total */}
                  <div className={`rounded-xl p-4 ${netNegative
                    ? 'bg-destructive-soft'
                    : 'bg-primary-soft'}`}>
                    <div className="text-xl text-muted-foreground font-semibold mb-1">เป็นเงินทั้งสิ้น</div>
                    <div className={`pr-2 text-6xl font-extrabold text-right leading-none ${netNegative ? 'text-destructive' : 'text-success'}`}>
                      {formatCurrency(net)}
                    </div>
                  </div>

                  {/* Cash input */}
                <div className="rounded-xl bg-muted p-4 space-y-3 h-36">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xl font-semibold text-muted-foreground flex items-center gap-1.5">
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
                      className="text-right bg-card w-52 h-12 text-4xl font-semibold focus-visible:ring-success/30"
                      autoFocus
                    />
                  </div>

                  {/* Change */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xl font-semibold text-muted-foreground flex items-center gap-1.5"><RefreshCcw className="size-7 text-warning" /> เงินทอน</span>
                      
                    {needsCheck ? (
                      <span className="flex items-center justify-end gap-2 w-80 h-12 text-4xl font-semibold text-destructive">
                        <AlertTriangle className="size-7" />
                        กรุณาตรวจสอบ
                      </span>
                    ) : (
                      <span className="text-right w-52 h-12 text-4xl font-semibold text-warning pr-2.5">
                        {formatCurrency(Math.max(0, change))}
                      </span>
                    )}
                  </div>
                </div>
                   {/* Breakdown toggle + detail */}
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowBreakdown(v => !v)}
                      className="shrink-0 text-base"
                    >
                      {showBreakdown ? 'ซ่อนรายละเอียด' : 'รายละเอียด'}
                    </Button>
                    {showBreakdown && (
                      <div className="rounded-xl bg-muted px-5 py-3 space-y-2 text-base">
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
                  <div className="flex gap-2 mt-auto">
                        <Button variant="tertiary" className="flex-1 h-20 text-4xl" disabled={saving || cart.items.length === 0 || change < 0 || pendingNet < 0} onClick={handleCompleteSale}>
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
        <DialogContent size="4xl" onClose={closeAdjust}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <TintIcon icon={PackageMinus} tint="warning" size="md" />
              ตัดสต็อก
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex gap-0 p-0 overflow-hidden rounded-xl" style={{ height: '520px' }}>
            {/* Left column — search + product results / lot picker */}
            <div className="flex flex-col basis-1/2 min-w-0 overflow-hidden">
              <div className="p-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={adjustInputRef}
                    placeholder="สแกนหรือค้นหาชื่อ / บาร์โค้ด / รหัสสินค้า..."
                    value={adjustQuery}
                    onChange={e => handleAdjustSearch(e.target.value)}
                    className="h-10 pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>

              {!adjustSelected ? (
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                  {adjustSearching ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">กำลังค้นหา...</div>
                  ) : adjustQuery && adjustResults.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">ไม่พบสินค้า "{adjustQuery}"</div>
                  ) : !adjustQuery ? (
                    <div className="h-full flex flex-col items-center justify-center text-foreground-subtle gap-2 px-6 text-center">
                      <Search className="size-10 opacity-30" />
                      <p className="text-sm">พิมพ์ชื่อ, บาร์โค้ด หรือรหัสสินค้า</p>
                    </div>
                  ) : (
                    <div className="px-2 pb-2 space-y-1">
                      {adjustResults.map(p => (
                        <div key={p.id} onClick={() => handleAdjustSelectProduct(p)}
                          className="group flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-colors hover:bg-primary-soft/60">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{p.trade_name}</div>
                            <div className="text-sm text-muted-foreground truncate">{p.unit_name} · {p.barcode || p.code || '—'}</div>
                          </div>
                          <ChevronRight className="size-4 text-foreground-subtle group-hover:text-foreground shrink-0 transition-colors" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col px-3 pb-3 gap-2.5 overflow-hidden">
                  {/* Selected product hero */}
                  <div className="flex items-center gap-2.5 rounded-lg bg-primary-soft px-2.5 py-1.5 shrink-0">
                    <TintIcon icon={PackageMinus} tint="primary-strong" size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate leading-tight">{adjustSelected.trade_name}</div>
                      <div className="text-sm text-muted-foreground truncate leading-tight">หน่วย: {adjustSelected.unit_name ?? '—'}</div>
                    </div>
                    <Button variant="secondary" size="sm"
                      onClick={() => { setAdjustSelected(null); setAdjustQuery(''); setTimeout(() => adjustInputRef.current?.focus(), 50) }}
                      className="h-7 gap-1 shrink-0">
                      <ChevronLeft className="size-3.5" /> เปลี่ยน
                    </Button>
                  </div>

                  {/* FEFO info — tells user the lot picking is automated */}
                  {(() => {
                    const totalStock = (adjustSelected.lots ?? []).reduce((s, l) => s + l.qty_on_hand, 0)
                    const noStock = totalStock <= 0
                    return (
                      <div className={`shrink-0 rounded-lg px-3 py-2.5 ${noStock ? 'bg-destructive-soft' : 'bg-info-soft/50'}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <Info className="size-4 text-info-soft-foreground" />
                            ตัดอัตโนมัติแบบ FEFO
                          </div>
                          <Badge variant={noStock ? 'destructive' : 'secondary'}>คงเหลือ {totalStock} {adjustSelected.unit_name ?? ''}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>ระบบจะตัดจากล็อตที่ใกล้หมดอายุก่อน</div>
                          <div>หากต้องการเลือกล็อต ให้ใช้ <span className="text-foreground font-medium">แก้ไขสินค้า → ล็อต</span></div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Spacer to push qty section to the bottom */}
                  <div className="flex-1 min-h-0" />

                  {/* Qty section — pinned at bottom */}
                  <div className="space-y-2 shrink-0">
                    <Label className="text-sm font-semibold text-foreground block">จำนวนที่ตัด ({adjustSelected.unit_name})</Label>
                    <div className="flex items-center gap-2 rounded-xl ring-1 ring-border">
                      <Button variant="default" size="icon"
                        onClick={() => setAdjustQtyInput(v => String(Math.max(1, (parseFloat(v) || 1) - 1)))}
                        className="ml-2 w-9 h-9 rounded-full bg-secondary-hover hover:bg-primary hover:text-primary-foreground text-muted-foreground shrink-0">
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        ref={adjustQtyRef}
                        type="number"
                        value={adjustQtyInput}
                        min={1}
                        style={{ MozAppearance: 'textfield' }}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setAdjustQtyInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddAdjustItem() }}
                        placeholder="1"
                        className="w-16 flex-1 h-12 text-center text-3xl font-bold bg-card rounded-xl border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 outline-none px-2"
                      />
                      <Button variant="default" size="icon"
                        onClick={() => setAdjustQtyInput(v => String((parseFloat(v) || 0) + 1))}
                        className="mr-2 w-9 h-9 rounded-full bg-secondary-hover hover:bg-primary hover:text-primary-foreground text-muted-foreground shrink-0">
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <Button
                      variant="info-soft"
                      onClick={handleAddAdjustItem}
                      disabled={!adjustQtyInput || parseFloat(adjustQtyInput) <= 0 || (adjustSelected.lots?.length ?? 0) === 0}
                      className="w-full h-10 gap-1.5"
                    >
                      <Plus className="size-4" /> เพิ่มในรายการตัด
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Right column — adjust list + total + reason */}
            <div className="flex flex-col basis-1/2 shrink-0 overflow-hidden bg-muted/40 border-l border-border">
              <div className="px-3 py-2.5 shrink-0 flex items-center justify-between bg-card border-b border-border">
                <span className="text-sm font-semibold text-foreground">รายการที่จะตัด</span>
                {adjustList.length > 0 && (
                  <Badge variant="warning">{adjustList.length} รายการ</Badge>
                )}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
                {adjustList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-foreground-subtle gap-2 px-6 text-center">
                    <PackageMinus className="size-10 opacity-30" />
                    <p className="text-sm">ยังไม่มีรายการที่จะตัด</p>
                  </div>
                ) : adjustList.map((item, idx) => (
                  <div key={idx} className="bg-card rounded-lg px-3 py-2 flex items-center gap-2 shadow-card">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate text-foreground">{item.product_name}</div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="truncate">{item.lot_number || '—'}</span>
                        <span className="text-foreground-subtle">·</span>
                        <span className="">×{item.qty}</span>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-warning-strong shrink-0">{formatCurrency(item.line_total)}</div>
                    <Button variant="ghost" size="icon-sm"
                      onClick={() => setAdjustList(list => list.filter((_, i) => i !== idx))}
                      className="shrink-0 text-foreground-subtle hover:text-destructive hover:bg-destructive-soft">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="p-3 shrink-0 space-y-2.5 bg-card border-t border-border">
                {adjustList.length > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-warning-soft">
                    <span className="text-sm font-semibold text-warning-strong">มูลค่าทุนรวม</span>
                    <span className="text-lg font-extrabold text-warning-strong">
                      {formatCurrency(adjustList.reduce((s, i) => s + i.line_total, 0))}
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground block">
                    สาเหตุการตัด <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {['ใช้ภายใน', 'เสียหาย/แตกหัก', 'สูญหาย'].map(reason => (
                      <Button key={reason}
                        variant={adjustReason === reason ? 'tertiary' : 'secondary'}
                        size="sm"
                        onClick={() => setAdjustReason(r => r === reason ? '' : reason)}
                        className="h-8 rounded-full">
                        {reason}
                      </Button>
                    ))}
                  </div>
                  <Input
                    placeholder="ระบุสาเหตุ..."
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={closeAdjust}>ยกเลิก</Button>
            <Button
              size="xl"
              onClick={handleConfirmAdjust}
              disabled={adjustList.length === 0 || !adjustReason.trim() || adjustSaving}
              className="gap-1.5"
            >
              <PackageMinus className="size-5" />
              {adjustSaving ? 'กำลังบันทึก...' : `ยืนยันตัดสต็อก${adjustList.length > 0 ? ` ${adjustList.length} รายการ` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RETURN ITEMS DIALOG ── */}
      <Dialog open={showReturn} onOpenChange={(v) => { if (!v) closeReturn() }}>
        <DialogContent size="4xl" onClose={closeReturn}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <TintIcon icon={RotateCcw} tint="info-soft" size="md" />
              รับคืนสินค้า
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex gap-0 p-0 overflow-hidden rounded-xl" style={{ height: '520px' }}>
            {/* Left column — search + product results / lot picker */}
            <div className="flex flex-col basis-1/2 min-w-0 overflow-hidden">
              <div className="p-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={returnInputRef}
                    placeholder="สแกนหรือค้นหาชื่อ / บาร์โค้ด / รหัสสินค้า..."
                    value={returnQuery}
                    onChange={e => handleReturnSearch(e.target.value)}
                    className="h-10 pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>

              {!returnSelectedProduct ? (
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                  {returnSearching ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">กำลังค้นหา...</div>
                  ) : returnQuery && returnResults.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">ไม่พบสินค้า "{returnQuery}"</div>
                  ) : !returnQuery ? (
                    <div className="h-full flex flex-col items-center justify-center text-foreground-subtle gap-2 px-6 text-center">
                      <Search className="size-10 opacity-30" />
                      <p className="text-sm">พิมพ์ชื่อ, บาร์โค้ด หรือรหัสสินค้า</p>
                    </div>
                  ) : (
                    <div className="px-2 pb-2 space-y-1">
                      {returnResults.map(p => (
                        <div key={p.id} onClick={() => handleReturnSelectProduct(p)}
                          className="group flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-colors hover:bg-primary-soft/60">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{p.trade_name}</div>
                            <div className="text-sm text-muted-foreground truncate">{p.unit_name} · {p.barcode || p.code || '—'}</div>
                          </div>
                          <ChevronRight className="size-4 text-foreground-subtle group-hover:text-foreground shrink-0 transition-colors" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col px-3 pb-3 gap-2.5 overflow-hidden">
                  {/* Selected product hero */}
                  <div className="flex items-center gap-2.5 rounded-lg bg-primary-soft px-2.5 py-1.5 shrink-0">
                    <TintIcon icon={RotateCcw} tint="primary-strong" size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate leading-tight">{returnSelectedProduct.trade_name}</div>
                      <div className="text-sm text-muted-foreground truncate leading-tight">หน่วย: {returnSelectedProduct.unit_name ?? '—'}</div>
                    </div>
                    <Button variant="secondary" size="sm"
                      onClick={() => { setReturnSelectedProduct(null); setReturnQuery(''); setReturnProductLots([]); setReturnSelectedLotId(null); setTimeout(() => returnInputRef.current?.focus(), 50) }}
                      className="h-7 gap-1 shrink-0">
                      <ChevronLeft className="size-3.5" /> เปลี่ยน
                    </Button>
                  </div>

                  {/* Lot picker — flexible, only this scrolls */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-1.5 shrink-0">
                      <div className="text-sm font-semibold text-foreground">เลือกล็อต</div>
                      <span className="text-sm text-muted-foreground">↑↓ เลื่อน</span>
                    </div>
                    {returnProductLots.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-3 text-center bg-muted rounded-lg shrink-0">ไม่พบล็อตสำหรับสินค้านี้</div>
                    ) : (
                      <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto scrollbar-thin pr-0.5">
                        {returnProductLots.map((lot, idx) => {
                          const selected = returnSelectedLotId === lot.id
                          return (
                            <button
                              key={lot.id}
                              ref={el => { returnLotRefs.current[idx] = el }}
                              onClick={() => setReturnSelectedLotId(lot.id)}
                              onFocus={() => setReturnSelectedLotId(lot.id)}
                              onKeyDown={e => {
                                if (e.key === 'ArrowDown') { e.preventDefault(); returnLotRefs.current[idx + 1]?.focus() }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); returnLotRefs.current[idx - 1]?.focus() }
                                else if (e.key === 'Enter') {
                                  e.preventDefault()
                                  returnQtyRef.current?.focus()
                                  returnQtyRef.current?.select()
                                }
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors focus:outline-none ${selected ? 'bg-primary-soft ring-2 ring-inset ring-primary' : 'bg-muted hover:bg-primary-soft/60'}`}
                            >
                              <div className="flex justify-between items-center gap-2">
                                <span className={`font-semibold text-sm truncate ${selected ? 'text-primary' : 'text-foreground'}`}>{lot.lot_number || '—'}</span>
                                <span className="text-sm font-bold text-foreground shrink-0">{formatCurrency(lot.sell_price)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0 truncate">
                                  <ClockAlert className="size-3.5 shrink-0" />
                                  <span className="truncate">
                                    {lot.expiry_date ? dayjs(lot.expiry_date).format('DD/MM/YYYY') : '—'}
                                    {lot.supplier_name ? ` · ${lot.supplier_name}` : ''}
                                  </span>
                                </div>
                                <Badge variant={selected ? 'default' : 'secondary'} className="shrink-0">คงเหลือ {lot.qty_on_hand}</Badge>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Qty section — pinned at bottom */}
                  <div className="space-y-2 shrink-0">
                    <Label className="text-sm font-semibold text-foreground block">จำนวนที่คืน ({returnSelectedProduct.unit_name})</Label>
                    <div className="flex items-center gap-2 rounded-xl ring-1 ring-border">
                      <Button variant="default" size="icon"
                        onClick={() => setReturnQtyInput(v => String(Math.max(1, (parseFloat(v) || 1) - 1)))}
                        className="ml-2 w-9 h-9 rounded-full bg-secondary-hover hover:bg-primary hover:text-primary-foreground text-muted-foreground shrink-0">
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        ref={returnQtyRef}
                        type="number"
                        value={returnQtyInput}
                        min={1}
                        style={{ MozAppearance: 'textfield' }}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setReturnQtyInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddReturnItem() }}
                        placeholder="1"
                        className="w-16 flex-1 h-12 text-center text-3xl font-bold bg-card rounded-xl border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 outline-none px-2"
                      />
                      <Button variant="default" size="icon"
                        onClick={() => setReturnQtyInput(v => String((parseFloat(v) || 0) + 1))}
                        className="mr-2 w-9 h-9 rounded-full bg-secondary-hover hover:bg-primary hover:text-primary-foreground text-muted-foreground shrink-0">
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <Button
                      variant="info-soft"
                      onClick={handleAddReturnItem}
                      disabled={!returnSelectedLotId || !returnQtyInput || parseFloat(returnQtyInput) <= 0}
                      className="w-full h-10 gap-1.5"
                    >
                      <Plus className="size-4" /> เพิ่มในรายการคืน
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Right column — return list + total + reason */}
            <div className="flex flex-col basis-1/2 shrink-0 overflow-hidden bg-muted/40 border-l border-border">
              <div className="px-3 py-2.5 shrink-0 flex items-center justify-between bg-card border-b border-border">
                <span className="text-sm font-semibold text-foreground">รายการที่จะคืน</span>
                {returnList.length > 0 && (
                  <Badge variant="warning">{returnList.length} รายการ</Badge>
                )}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
                {returnList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-foreground-subtle gap-2 px-6 text-center">
                    <RotateCcw className="size-10 opacity-30" />
                    <p className="text-sm">ยังไม่มีรายการที่จะคืน</p>
                  </div>
                ) : returnList.map((item, idx) => (
                  <div key={idx} className="bg-card rounded-lg px-3 py-2 flex items-center gap-2 shadow-card">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate text-foreground">{item.product_name}</div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="truncate">{item.lot_number || '—'}</span>
                        <span className="text-foreground-subtle">·</span>
                        <span className="">×{item.qty}</span>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-warning-strong shrink-0">{formatCurrency(item.line_total)}</div>
                    <Button variant="ghost" size="icon-sm"
                      onClick={() => setReturnList(list => list.filter((_, i) => i !== idx))}
                      className="shrink-0 text-foreground-subtle hover:text-destructive hover:bg-destructive-soft">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="p-3 shrink-0 space-y-2.5 bg-card border-t border-border">
                {returnList.length > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-warning-soft">
                    <span className="text-sm font-semibold text-warning-strong">ยอดคืนรวม</span>
                    <span className="text-lg font-extrabold text-warning-strong">
                      {formatCurrency(returnList.reduce((s, i) => s + i.line_total, 0))}
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground block">
                    สาเหตุการคืน <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {['ลูกค้าเปลี่ยนใจ', 'สินค้าเสียหาย', 'หมดอายุ'].map(reason => (
                      <Button key={reason}
                        variant={returnReason === reason ? 'tertiary' : 'secondary'}
                        size="sm"
                        onClick={() => setReturnReason(r => r === reason ? '' : reason)}
                        className="h-8 rounded-full">
                        {reason}
                      </Button>
                    ))}
                  </div>
                  <Input
                    placeholder="ระบุสาเหตุ..."
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={closeReturn}>ยกเลิก</Button>
            <Button
              size="xl"
              onClick={handleConfirmReturn}
              disabled={returnList.length === 0 || !returnReason.trim() || returnSaving}
              className="gap-1.5"
            >
              <RotateCcw className="size-5" />
              {returnSaving ? 'กำลังบันทึก...' : `ยืนยันคืน${returnList.length > 0 ? ` ${returnList.length} รายการ` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SUCCESS DIALOG ── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent
          size="sm"
          onClose={() => setShowSuccess(false)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setShowSuccess(false) } }}
        >
          <DialogTitle className="sr-only">บันทึกบิลสำเร็จ</DialogTitle>
          <DialogBody className="text-center py-8 space-y-4">
            <CheckCircle2 className="size-16 mx-auto text-success" />
            <div><div className="text-xl font-semibold">บันทึกบิลสำเร็จ</div>
              <div className="text-muted-foreground text-base mt-1">{lastInvoice}</div></div>
            <Button autoFocus onClick={() => setShowSuccess(false)} className="w-full h-12 text-xl">ตกลง</Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

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
          const applyCustomPrice = () => {
            if (customPrice <= 0) return
            changeCartPrice(priceModalIdx, customPrice)
          }
          return (
            <DialogContent size="sm" onClose={() => setPriceModalIdx(null)}>
              <DialogHeader>
                <DialogTitle className="text-2xl">ราคา</DialogTitle>
                <div className="text-base font-semibold text-foreground">{item?.item_name}</div>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-2 max-h-200 overflow-y-auto scrollbar-thin">
                  {/* Custom price input */}
                  <div className="w-full px-4 py-3 rounded-xl bg-primary-soft">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-base font-bold text-primary">กำหนดราคา</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <PriceInput
                        autoFocus
                        value={customPriceInput}
                        onChange={setCustomPriceInput}
                        onFocus={e => e.currentTarget.select()}
                        onKeyDown={e => { if (e.key === 'Enter') applyCustomPrice() }}
                        className="w-full flex-1 h-10 text-3xl font-bold bg-card rounded-lg focus:ring-2 focus:ring-primary outline-none px-3"
                      />
                      <Button variant="default" onClick={applyCustomPrice} disabled={customPrice <= 0} className="h-10 px-4 text-sm">ตกลง</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-foreground-subtle text-xs">ทุน</div>
                        <div className="font-semibold text-muted-foreground">{formatCurrency(cost)}</div>
                      </div>
                      <div>
                        <div className="text-foreground-subtle text-xs">กำไร</div>
                        <div className={`font-semibold ${customProfit > 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(customProfit)}</div>
                      </div>
                      <div>
                        <div className="text-foreground-subtle text-xs">กำไร %</div>
                        <div className={`font-semibold ${customProfit > 0 ? 'text-success' : 'text-destructive'}`}>{cost > 0 ? customMarkupPct.toFixed(1) : '0.0'}%</div>
                      </div>
                    </div>
                  </div>

                  {priceOptions.map((opt, i) => {
                    const active = item?.unit_price === opt.price
                    const profit = opt.price - cost
                    const markupPct = cost > 0 ? (profit / cost) * 100 : 0
                    return (
                      <Button key={i} variant="brand-soft"
                        onClick={() => changeCartPrice(priceModalIdx, opt.price)}
                        className={`w-full h-auto px-4 py-3 rounded-xl transition-colors ${active ? 'ring-2 ring-inset ring-primary' : ''}`}>
                        <div className="space-y-1 w-full">
                          <div className={`text-base font-bold text-left ${active ? 'text-primary' : 'text-foreground'}`}>{opt.label}</div>
                          <div className="text-right text-3xl font-extrabold text-primary"> {formatCurrency(opt.price)}</div>
                          <div className="text-left grid grid-cols-3 gap-2 text-sm pt-1">
                            <div>
                              <div className="text-foreground-subtle text-xs">ทุน</div>
                              <div className="font-semibold text-muted-foreground">{formatCurrency(cost)}</div>
                            </div>
                            <div>
                              <div className="text-foreground-subtle text-xs">กำไร</div>
                              <div className={`font-semibold ${profit > 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(profit)}</div>
                            </div>
                            <div>
                              <div className="text-foreground-subtle text-xs">กำไร %</div>
                              <div className={`font-semibold ${profit > 0 ? 'text-success' : 'text-destructive'}`}>{cost > 0 ? markupPct.toFixed(1) : '0.0'}%</div>
                            </div>
                          </div>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary" className="w-32 h-10 text-base" onClick={() => setPriceModalIdx(null)}>ปิด</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {/* ── QTY DIALOG ── */}
      <Dialog open={qtyModalIdx !== null} onOpenChange={(v) => { if (!v) setQtyModalIdx(null) }}>
        {qtyModalIdx !== null && (() => {
          const item = cart.items[qtyModalIdx]
          const q = Math.max(1, parseFloat(qtyInput) || 0)
          const lineTotal = Math.max(0, (item?.unit_price ?? 0) * q - (item?.discount ?? 0))
          const product = item?.product as ProductWithDetails | undefined
          const stockQty = product?.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0
          const applyQty = (val: number) => {
            if (!item) return
            const safe = Math.max(1, val)
            cart.updateItem(qtyModalIdx, { qty: safe })
            setQtyModalIdx(null)
            refocusSearch()
          }
          const bump = (delta: number) => {
            const cur = parseFloat(qtyInput) || 0
            const next = Math.max(1, cur + delta)
            setQtyInput(String(next))
          }
          return (
            <DialogContent size="sm" onClose={() => setQtyModalIdx(null)}>
              <DialogHeader>
                <DialogTitle className="text-2xl">จำนวน</DialogTitle>
                <div className="text-base font-semibold text-foreground">{item?.item_name}</div>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex justify-between text-base">
                  <span className="font-bold text-muted-foreground">คงเหลือ</span>
                  <span className={`font-semibold ${stockQty > 0 ? 'text-foreground' : 'text-destructive'}`}>{stockQty} {item?.unit_name}</span>
                </div>
                <div>
                  <Label className="block text-base font-bold text-muted-foreground mb-2">จำนวน ({item?.unit_name})</Label>
                  <div className="flex items-center gap-2 rounded-xl ring-1 ring-border">
                    <Button variant="default" size="icon" onClick={() => bump(-1)}
                      className="ml-3 w-10 h-10 rounded-full flex items-center justify-center bg-secondary-hover hover:text-primary-foreground hover:bg-primary text-muted-foreground font-bold shrink-0">
                      <Minus className="size-5" />
                    </Button>
                    <Input
                      type="number"
                      autoFocus
                      value={qtyInput}
                      min={1}
                      style={{ MozAppearance: 'textfield' }}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => setQtyInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyQty(q) }}
                      placeholder="1"
                      className="w-16 flex-1 h-14 text-center text-3xl font-bold bg-card rounded-xl focus:ring-0 focus:ring-primary outline-none px-4"
                    />
                    <Button variant="default" size="icon" onClick={() => bump(1)}
                      className="mr-3 w-10 h-10 rounded-full flex items-center justify-center bg-secondary-hover hover:text-primary-foreground hover:bg-primary text-muted-foreground font-bold shrink-0">
                      <Plus className="size-5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 5, 10, 20, 50].map(n => (
                    <Button key={n} variant="brand-soft" size="sm" onClick={() => setQtyInput(String(n))}
                      className="h-10 rounded-xl text-base font-semibold transition-colors">
                      {n}
                    </Button>
                  ))}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary" className="w-32 h-10 text-base" onClick={() => setQtyModalIdx(null)}>ยกเลิก</Button>
                <Button variant="default" className="w-32 h-10 text-base" onClick={() => applyQty(q)}>ตกลง</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

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
            <DialogContent size="md" onClose={() => setDiscountModalIdx(null)}>
              <DialogHeader>
                <DialogTitle className="text-2xl">ส่วนลด</DialogTitle>
                <div className="text-base font-semibold text-foreground">{item?.item_name}</div>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex justify-between border-t border-b border-border">
                  <span className="py-2 text-base font-bold text-muted-foreground">ราคารวม</span>
                  <span className="py-2 text-2xl font-semibold text-foreground">{formatCurrency(totalPrice)}</span>
                </div>

                {/* Percent presets */}
                <div className="grid grid-cols-5 gap-2">
                  {([
                    { pct: 3,  base: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive', active: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive ring-2 ring-destructive' },
                    { pct: 5,  base: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive', active: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive ring-2 ring-destructive' },
                    { pct: 10, base: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive', active: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive ring-2 ring-destructive' },
                    { pct: 15, base: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive', active: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive ring-2 ring-destructive' },
                    { pct: 20, base: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive', active: 'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive ring-2 ring-destructive' },
                  ] as const).map(({ pct, base, active }) => {
                    const isActive = totalPrice > 0 && Math.abs(d - totalPrice * pct / 100) < 0.01
                    return (
                      <Button key={pct} variant="outline" size="sm" onClick={() => applyPercent(pct)}
                        className={`h-10 rounded-xl text-base font-semibold transition-colors ${isActive ? active : base}`}>
                        {pct}%
                      </Button>
                    )
                  })}
                </div>

                {/* ส่วนลด (%)  +  ส่วนลด (บาท) — side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="block text-base font-bold text-muted-foreground mb-1">ส่วนลด (%)</Label>
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
                        className="w-full h-14 text-right text-3xl font-bold bg-card rounded-xl ring-border ring-1 focus:ring-2 focus:ring-destructive/50 outline-none pl-4 pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle text-xl font-bold pointer-events-none">%</span>
                    </div>
                  </div>

                  <div>
                    <Label className="block text-base font-bold text-muted-foreground mb-1">ส่วนลด (บาท)</Label>
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
                      className="w-full h-14 text-right text-3xl font-bold bg-card ring-border ring-1 rounded-xl focus:ring-2 focus:ring-destructive/50 outline-none px-4"
                    />
                  </div>
                </div>

                {/* Final price reverse-calc input */}
                <div>
                  <Label className="block text-base font-bold text-muted-foreground mb-1">ราคาสุดท้าย (บาท)</Label>
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
                    className="w-full h-14 text-right text-3xl font-bold bg-card ring-border ring-1 rounded-xl focus:ring-2 focus:ring-primary outline-none px-4"
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="destructive2" className="w-32 h-10 text-base" onClick={() => { setDiscountInput('0'); applyDiscount(0) }}><RotateCcw className="size-4" /> ล้าง</Button>
                <Button variant="tertiary" className="w-32 h-10 text-base" onClick={() => setDiscountModalIdx(null)}>ปิด</Button>
                <Button className="w-32 h-10 text-base" onClick={() => applyDiscount(d)}>ตกลง</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

    </div>
  )
}