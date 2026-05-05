import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCartStore } from '@/stores/cartStore'
import { getCurrentUserId } from '@/stores/userStore'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, getExpiryStatus, formatThaiDateHeader } from '@/lib/utils'
import dayjs from 'dayjs'
import type { Product, ProductUnit, ProductLot, Customer } from '@/types'
import { redistributeDiscounts } from './redistributeDiscount'
import {
  Search, User, Trash2, Plus, Minus,
  Banknote, AlertTriangle, ChevronDown, X, UserPlus, Info,
  RotateCcw, ChevronRight, ChevronLeft, Tag,
  ShoppingBasket, Timer,
} from 'lucide-react'

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
  const [showCustomerInfo, setShowCustomerInfo] = useState(false)

  // Quick add customer
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaName, setQaName] = useState('')
  const [qaPhone, setQaPhone] = useState('')
  const [qaNote, setQaNote] = useState('')
  const [qaSaving, setQaSaving] = useState(false)

  // Success
  const [lastInvoice, setLastInvoice] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  // Per-row modals
  const [unitModalIdx, setUnitModalIdx] = useState<number | null>(null)
  const [priceModalIdx, setPriceModalIdx] = useState<number | null>(null)
  const [customPriceInput, setCustomPriceInput] = useState<string>('')
  const [discountModalIdx, setDiscountModalIdx] = useState<number | null>(null)
  const [discountInput, setDiscountInput] = useState<string>('')
  const [discountPctInput, setDiscountPctInput] = useState<string>('')
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

  // Adjust stock dialog (System A — multi-item, mirrors return modal)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustQuery, setAdjustQuery] = useState('')
  const [adjustResults, setAdjustResults] = useState<ProductWithDetails[]>([])
  const [adjustSearching, setAdjustSearching] = useState(false)
  const [adjustSelected, setAdjustSelected] = useState<ProductWithDetails | null>(null)
  const [adjustSelectedLotId, setAdjustSelectedLotId] = useState<number | null>(null)
  const [adjustQtyInput, setAdjustQtyInput] = useState('1')
  const [adjustList, setAdjustList] = useState<AdjustLineItem[]>([])
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const adjustInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDailyStats()
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const anyModalOpen = searchOpen || showPayment || showCustomerSearch || showQuickAdd || showSuccess || showCustomerInfo ||
    showReturn || showAdjust || unitModalIdx !== null || priceModalIdx !== null || discountModalIdx !== null || qtyModalIdx !== null

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

  // Flatten results into selectable items (each unit is a selectable entry)
  const flatItems = results.flatMap(p =>
    p.units?.length > 0
      ? p.units.map(u => ({ product: p, unit: u }))
      : [{ product: p, unit: null as ProductUnit | null }]
  )

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
    if (!q.trim()) { setCustomerResults([]); return }
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
    setAdjustSelectedLotId(null); setAdjustQtyInput('1')
    setAdjustList([]); setAdjustReason('')
  }

  const handleAdjustSearch = useCallback(async (q: string) => {
    setAdjustQuery(q)
    setAdjustSelected(null)
    setAdjustSelectedLotId(null)
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
    // Default to FEFO lot (already first in lots array from pos:searchProducts)
    setAdjustSelectedLotId(product.lots?.[0]?.id ?? null)
    setTimeout(() => adjustInputRef.current?.blur(), 0)
  }

  const handleAddAdjustItem = () => {
    if (!adjustSelected || !adjustSelectedLotId) return
    const qty = parseFloat(adjustQtyInput)
    if (!qty || qty <= 0) { toast('กรุณาระบุจำนวน', 'error'); return }
    const lot = adjustSelected.lots?.find(l => l.id === adjustSelectedLotId)
    if (!lot) { toast('ไม่พบล็อต', 'error'); return }

    const existingIdx = adjustList.findIndex(i => i.product_id === adjustSelected.id && i.lot_id === adjustSelectedLotId)
    const alreadyQueued = existingIdx >= 0 ? adjustList[existingIdx].qty : 0
    if (qty + alreadyQueued > lot.qty_on_hand) {
      toast(`จำนวนรวม (${qty + alreadyQueued}) เกินคงเหลือในล็อต (${lot.qty_on_hand})`, 'error')
      return
    }

    if (existingIdx >= 0) {
      const merged = adjustList[existingIdx].qty + qty
      setAdjustList(list => list.map((it, i) => i === existingIdx
        ? { ...it, qty: merged, line_total: merged * lot.cost_price }
        : it))
    } else {
      setAdjustList(list => [...list, {
        product_id: adjustSelected.id,
        lot_id: adjustSelectedLotId,
        product_name: adjustSelected.trade_name,
        unit_name: adjustSelected.unit_name ?? 'ชิ้น',
        lot_number: lot.lot_number || '',
        expiry_date: lot.expiry_date ?? null,
        qty,
        cost_price: lot.cost_price,
        line_total: qty * lot.cost_price,
      }])
    }

    // Reset for next item — back to search
    setAdjustSelected(null)
    setAdjustQuery('')
    setAdjustResults([])
    setAdjustSelectedLotId(null)
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
    setReturnSelectedProduct(product)
    setReturnQuery(product.trade_name)
    setReturnResults([])
    setReturnSelectedLotId(null)
    setReturnQtyInput('1')
    const lots = await (window.api.products as any).getLots(product.id) as ProductLot[]
    setReturnProductLots(lots)
    if (lots.length === 1) setReturnSelectedLotId(lots[0].id)
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
    if (cart.items.length === 0) { toast('กรุณาเพิ่มสินค้าในตะกร้า', 'error'); return }
    setSaving(true)
    try {
      const result = await window.api.pos.saveBill({
        sale_type: cart.saleType, customer_id: cart.customer?.id ?? null, customer_name_free: cart.customerNameFree,
        items: cart.items.map((i, idx) => {
          const d = pendingEffectiveDiscounts[idx]
          return { product_id: i.product_id, item_name: i.item_name, unit_name: i.unit_name, qty: i.qty, unit_price: i.unit_price, discount: d, line_total: i.qty * i.unit_price - d, item_note: i.item_note }
        }),
        subtotal: cart.subtotal(), total_discount: pendingTotalDiscount, total_amount: pendingNet,
        cash_amount: parseFloat(cashAmount) || 0, card_amount: parseFloat(cardAmount) || 0, transfer_amount: parseFloat(transferAmount) || 0,
        change_amount: Math.max(0, change), symptom_note: cart.symptomNote, age_range: cart.ageRange, sold_by: getCurrentUserId(),
      }) as any
      setLastInvoice(result.invoice_no)
      setDailyStats({ bills: result.daily_bills, total: result.daily_total, latest: result.latest_bill_time })
      cart.clearCart(); setShowPayment(false); setShowSuccess(true)
      setCashAmount(''); setCardAmount(''); setTransferAmount('')
    } catch (err: any) { toast(err.message ?? 'เกิดข้อผิดพลาด', 'error') }
    finally { setSaving(false) }
  }

  const changeCartUnit = (idx: number, unit: ProductUnit) => {
    const price = resolveSalePrice(unit, cart.saleType)
    cart.updateItem(idx, { unit_name: unit.unit_name, unit_price: price, selectedUnit: unit })
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
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">

      {/* ── HEADER ── */}
      <div className="flex items-end justify-between shrink-0 px-1 mb-2">
        <h1 className="text-3xl font-bold leading-none tracking-tight">หน้าจอการขายสินค้า</h1>
        <div className="text-m font-semibold text-foreground">
          {dateStr} · <span className="tabular-nums">{timeStr}</span>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">

        {/* Left column: toolbar + cart card */}
        <div className="flex-1 flex flex-col gap-3.5 min-h-0">

          {/* Cart slot + customer cards */}
          <div className="grid grid-cols-4 gap-3.5 shrink-0">
            {([0, 1, 2] as const).map(i => {
              const slot = i === cart.activeSlot
                ? { items: cart.items, saleType: cart.saleType }
                : { items: cart.slots[i].items, saleType: cart.slots[i].saleType }
              const pieces = slot.items.reduce((n, it) => n + it.qty, 0)
              const total = slot.items.reduce((s, it) => s + it.line_total, 0)
              const isActive = i === cart.activeSlot
              const hasItems = slot.items.length > 0
              const isWaiting = !isActive && hasItems
              const Icon = isWaiting ? Timer : ShoppingBasket
              const iconBox = isActive
                ? 'bg-card text-primary'
                : isWaiting
                  ? 'bg-accent-soft text-warning-strong'
                  : 'bg-primary-soft text-primary'
              return (
                <Button key={i} variant="ghost"
                  onClick={() => { cart.setActiveSlot(i); refocusSearch() }}
                  className={`flex flex-col items-stretch justify-between text-left h-40 p-5 rounded-2xl transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      : 'bg-card text-foreground hover:bg-surface-hover'
                  }`}>
                  <div className="flex items-start justify-between w-full">
                    <span className="text-base font-semibold">รายการขาย {i + 1}</span>
                    <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${iconBox}`}>
                      <Icon className="size-5" strokeWidth={2}/>
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    <span className="text-3xl font-bold tabular-nums leading-none">
                      <span className="opacity-70 mr-1 text-2xl">฿</span>{formatCurrency(total)}
                    </span>
                    <span className={`text-sm tabular-nums ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {pieces} รายการ {' '}
                      {slot.saleType === 'wholesale' ? (
                        <Badge variant="tertiary" className="ml-2 text-xs rounded-md">ขายส่ง</Badge>
                      ) : (
                        <Badge variant="quaternary" className="ml-2 text-xs rounded-md">ขายปลีก</Badge>
                      )}
                    </span>
                  </div>
                </Button>
              )
            })}
            <div className="flex flex-col gap-2 h-40 p-3 bg-card rounded-2xl">
              <Button variant="ghost"
                onClick={() => setShowCustomerSearch(true)}
                className="relative flex items-center gap-3 flex-1 min-h-0 p-2 rounded-xl hover:bg-transparent text-left">
                <span className="grid place-items-center w-14 h-14 rounded-full shrink-0 bg-primary-soft text-primary">
                  <User className="size-7" />
                </span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-base font-bold leading-tight truncate flex items-center gap-1.5">
                    {cart.customer ? cart.customer.full_name : 'ลูกค้าทั่วไป'}
                  </span>
                  <span className="text-sm text-muted-foreground truncate">
                    {cart.customer?.phone || 'แตะเพื่อเลือกลูกค้า'}
                  </span>
                  {cart.customer?.is_alert && cart.customer.alert_note ? (
                    <Badge variant="destructive" className="text-xs rounded-md"><AlertTriangle className="size-3 shrink-0" />
                      {cart.customer.alert_note}
                    </Badge>
                  ) : null}
                </div>
              </Button>
              <div className="grid grid-cols-2 gap-2 shrink-0">
                <Button variant="quaternary"
                  onClick={() => setShowCustomerInfo(true)}
                  disabled={!cart.customer}
                  className="h-9 rounded-lg text-xs gap-1">
                  <Info className="size-3.5" /> ดูข้อมูล
                </Button>
                <Button variant="tertiary"
                  onClick={() => setShowQuickAdd(true)}
                  className="h-9 rounded-lg text-xs gap-1">
                  <UserPlus className="size-3.5" /> เพิ่มลูกค้า
                </Button>
              </div>
            </div>
          </div>

          {/* Cart card (search + table + footer) */}
          <div className="flex flex-1 flex-col min-h-0 bg-card rounded-2xl shadow-card overflow-hidden">

          {/* Sale type + search + clear-all header */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 shrink-0 border-0 border-border">
            <Button
              type="button"
              variant={cart.saleType === 'retail' ? 'default' : 'secondary'}
              onClick={() => { cart.setSaleType('retail'); refocusSearch() }}
              className="flex h-9 w-[84px] px-0 rounded-lg text-sm font-semibold shrink-0 justify-center">
              ขายปลีก
            </Button>
            <Button
              type="button"
              variant={cart.saleType === 'wholesale' ? 'tertiary' : 'secondary'}
              onClick={() => { cart.setSaleType('wholesale'); refocusSearch() }}
              className="flex h-9 w-[84px] px-0 rounded-lg text-sm font-semibold shrink-0 justify-center">
              ขายส่ง
            </Button>
            <div className="relative flex-1 min-w-0">
              <Input
                ref={mainInputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด / รหัสสินค้า"
                autoFocus
                autoComplete="off"
                className="h-9 py-2 pl-3 pr-9 text-sm rounded-lg border-0 shadow-none focus-visible:ring-0"/>
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground pointer-events-none"/>
            </div>
            <Button variant="outline" size="sm" disabled={cart.items.length === 0}
              onClick={() => { cart.clearCart(); refocusSearch() }}
              className="gap-1.5 px-3 py-1.5 h-auto rounded-lg bg-destructive-soft text-destructive text-sm font-medium hover:bg-destructive-soft shrink-0">
              <Trash2 className="size-3.5" /> ลบสินค้าทั้งหมด
            </Button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin border-0" tabIndex={-1}>
              <table className="w-full caption-bottom text-base table-fixed border-0">
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 60 }} />
                </colgroup>
                <TableHeader className="sticky top-0 z-10 bg-input border-0">
                  <TableRow className="hover:bg-input">
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-foreground-subtle">#</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">ชื่อสินค้า</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-foreground-subtle">หน่วย</TableHead>
                    <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-foreground-subtle">จำนวน</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-foreground-subtle">ราคา</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-foreground-subtle">ส่วนลด</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-foreground-subtle">รวม</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.items.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={8} className="text-center py-16 border-0">
                        <div className="flex flex-col items-center justify-center text-foreground-subtle gap-3">
                          <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="text-xl font-medium">ยังไม่มีรายการสั่งซื้อ</p>
                          <p className="text-base">คลิกช่องค้นหาหรือสแกนบาร์โค้ด</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : cart.items.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-surface-hover">
                      <TableCell className="text-center text-base text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="min-w-0 pr-2">
                        <div className="font-medium truncate text-base">{item.item_name}</div>
                      </TableCell>

                      <TableCell className="text-center">
                        <Button variant="outline" size="sm" onClick={() => setUnitModalIdx(idx)}
                          className="min-w-14 inline-flex items-center justify-center h-8 px-2.5 rounded-md text-foreground text-base font-semibold hover:bg-muted transition-colors">
                          {item.unit_name}
                        </Button>
                      </TableCell>

                      <TableCell className="text-center">
                        <Button variant="outline" size="sm"
                          onClick={() => { setQtyInput(String(item.qty)); setQtyModalIdx(idx) }}
                          className="inline-flex items-center gap-1 min-w-14 h-8 px-2.5 rounded-md bg-warning-soft text-warning-strong text-base font-semibold tabular-nums hover:bg-warning-soft transition-colors">
                          <span className="flex-1 text-center">{item.qty}</span>
                        </Button>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => { setCustomPriceInput(String(item.unit_price)); setPriceModalIdx(idx) }}
                          className="inline-flex items-center gap-1 min-w-16 h-8 px-2.5 rounded-md bg-primary-soft text-primary text-base font-semibold tabular-nums hover:bg-primary-soft transition-colors">
                          <span className="flex-1 text-right">{formatCurrency(item.unit_price)}</span>
                        </Button>
                      </TableCell>

                      <TableCell className="text-right">
                        {item.discount ? (
                          <Button variant="outline" size="sm"
                            onClick={() => { const totalPrice = item.unit_price * item.qty; setDiscountInput(String(parseFloat(item.discount.toFixed(2)))); setDiscountPctInput(totalPrice > 0 ? String(parseFloat((item.discount / totalPrice * 100).toFixed(2))) : ''); setFinalPriceInput(String(parseFloat((totalPrice - item.discount).toFixed(2)))); setDiscountModalIdx(idx) }}
                            className="inline-flex flex-col items-end justify-center min-w-14 h-8 px-2.5 rounded-md bg-destructive-soft text-destructive hover:bg-destructive/20 transition-colors">
                            <span className="text-base font-semibold tabular-nums leading-none">{formatCurrency(item.discount)}</span>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm"
                            onClick={() => { setDiscountInput(''); setDiscountPctInput(''); setFinalPriceInput(''); setDiscountModalIdx(idx) }}
                            className="inline-flex items-center gap-1 min-w-14 h-8 px-2.5 rounded-md bg-card text-foreground-subtle text-base font-medium tabular-nums hover:bg-muted hover:text-destructive transition-colors">
                            <span className="flex-1 text-right">0</span>
                          </Button>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-semibold text-primary text-base">
                        {formatCurrency(item.line_total)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => { cart.removeItem(idx); refocusSearch() }}
                          className="w-7 h-7 rounded inline-flex items-center justify-center text-foreground-subtle hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>

            {cart.items.length > 0 && (
              <div className="px-4 h-9 shrink-0 flex items-center gap-6 bg-muted">
                <div>
                  <div className="text-sm uppercase tracking-wider font-semibold text-foreground-subtle">จำนวน <span className="text-sm font-medium tabular-nums text-foreground">{cart.items.length}</span> รายการ</div>
                </div>
                <div className="flex-1" />
                {cart.totalDiscount() > 0 && (
                  <div className="text-right">
                    <div className="text-sm uppercase tracking-wider font-semibold text-foreground-subtle">ส่วนลดรวม
                    <span className="text-sm font-bold text-destructive"> ฿{formatCurrency(cart.totalDiscount())}</span></div>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-sm uppercase tracking-wider font-semibold text-foreground-subtle">ราคารวม <span className="text-sm font-bold tabular-nums text-foreground">฿{formatCurrency(cart.subtotal())}</span></div>
                </div>
              </div>
            )}
          </div>
          </div>

        </div>

        {/* Right column */}
        <div className="w-80 shrink-0 flex flex-col gap-3.5">
          {/* Total card */}
          <div className="h-40 rounded-2xl bg-primary text-primary-foreground p-6 shadow-card shrink-0">
            <div className="text-right text-md font-medium opacity-80 tracking-wide">ยอดสุทธิ</div>
            <div className="mt-6 text-right font-bold tabular-nums leading-[1.05] tracking-tight text-right" style={{ fontSize: '62px', letterSpacing: '-1.5px' }}>
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
            className="w-full h-40 justify-between bg-accent text-accent-foreground hover:bg-tertiary-hover disabled:bg-muted disabled:text-foreground-subtle disabled:opacity-100 rounded-2xl px-5 py-5">
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-xl font-bold leading-none">ชำระเงิน</span>
            </span>
            <ChevronRight className="size-[22px]" strokeWidth={2.4} />
          </Button>

          {/* Quick actions (vertical stack) */}
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => { (window.api.printer as any)?.openCashDrawer?.(); refocusSearch() }}
              className="w-full justify-start gap-3 rounded-xl px-4 py-3.5 h-auto bg-card text-foreground hover:bg-muted text-xs font-medium">
              <Banknote className="size-4 text-foreground-subtle" /> เปิดลิ้นชัก
            </Button>
            <Button variant="outline" disabled
              className="w-full justify-start gap-3 rounded-xl px-4 py-3.5 h-auto bg-card text-foreground hover:bg-muted text-xs font-medium">
              <Tag className="size-4 text-foreground-subtle" /> พิมพ์ฉลาก
            </Button>
            <Button variant="outline" onClick={() => setShowAdjust(true)}
              className="w-full justify-start gap-3 rounded-xl px-4 py-3.5 h-auto bg-card hover:bg-warning-soft hover:text-warning-strong text-xs font-medium text-foreground">
              <Minus className="size-4 text-foreground-subtle" /> ตัดสต็อก
            </Button>
            <Button variant="outline" onClick={() => setShowReturn(true)}
              className="w-full justify-start gap-3 rounded-xl px-4 py-3.5 h-auto bg-card text-foreground hover:bg-muted text-xs font-medium">
              <RotateCcw className="size-4 text-foreground-subtle" /> รับคืนสินค้า
            </Button>
            <Button variant="outline" disabled={cart.items.length === 0} onClick={() => { cart.clearCart(); refocusSearch() }}
              className="w-full justify-start gap-3 rounded-xl px-4 py-3.5 h-auto bg-card text-foreground hover:bg-muted hover:text-destructive text-xs font-medium">
              <Trash2 className="size-4 text-foreground-subtle" /> ยกเลิกบิล
            </Button>
          </div>

          {/* Daily summary */}
          <div className="mt-auto rounded-2xl bg-card shadow-card p-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-foreground">สรุปยอดขายวันนี้</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm uppercase tracking-wider font-semibold text-foreground-subtle mb-1">บิลล่าสุด</div>
                <div className="text-base font-medium tabular-nums">{dailyStats.latest ? dailyStats.latest.slice(11, 16) : '—'}</div>
              </div>
              <div>
                <div className="text-sm uppercase tracking-wider font-semibold text-foreground-subtle mb-1">จำนวนบิล</div>
                <div className="text-base font-medium tabular-nums">{dailyStats.bills} บิล</div>
              </div>
              <div className="col-span-2">
                <div className="text-sm uppercase tracking-wider font-semibold text-foreground-subtle mb-1">ยอดรวมของวัน</div>
                <div className="text-xl font-semibold tabular-nums text-primary">฿ {formatCurrency(dailyStats.total)}</div>
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
          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 shrink-0">
            <Search className="h-5 w-5 text-primary shrink-0" />
            <Input
              ref={modalInputRef}
              value={query}
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
          <div className="grid items-center px-4 py-2 bg-input text-sm font-bold text-muted-foreground shrink-0"
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
                const stock = it.product.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0
                const price = it.unit ? it.unit.price_retail : it.product.price_retail
                const unitName = it.unit?.unit_name ?? it.product.unit_name ?? '-'
                const active = i === highlightIdx
                const expiryWarn = it.product.lots?.some(l => getExpiryStatus(l.expiry_date) !== 'normal')
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
                    <div className="text-right font-bold text-primary text-base tabular-nums">฿{formatCurrency(price)}</div>
                    <div className={`text-right text-base font-semibold tabular-nums ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>{stock}</div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer status */}
          <div className="px-4 py-2 bg-input text-sm text-muted-foreground shrink-0">
            ค้นหา: "{query}" — พบ {results.length} รายการ
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CUSTOMER SEARCH DIALOG ── */}
      <Dialog open={showCustomerSearch} onOpenChange={(v) => { if (!v) { setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]) } }}>
        <DialogContent size="md" onClose={() => { setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]) }}>
          <DialogHeader><DialogTitle>เลือกลูกค้า</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <Input className="h-10" autoFocus placeholder="ชื่อ, เบอร์โทร, รหัส, HN..."
                value={customerQuery}
                onChange={e => handleSearchCustomer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && customerResults[0]) { cart.setCustomer(customerResults[0]); closeCustomerSearch() } }}
              />
              <Button variant="secondary" onClick={() => { cart.setCustomer(null); closeCustomerSearch() }}
                className="w-full h-12 justify-start px-4 py-3 rounded-xl text-foreground font-medium text-left transition-colors text-base">
                <User className="size-8 p-1 bg-background rounded-full text-muted-foreground shrink-0" /> ลูกค้าทั่วไป
              </Button>
              <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                {customerResults.map(c => (
                  <Button key={c.id} variant="secondary" onClick={() => { cart.setCustomer(c); closeCustomerSearch() }}
                    className="w-full px-4 py-3 h-12 justify-start flex items-center rounded-xl bg-background hover:bg-surface-hover text-left transition-colors">
                    <User className="size-8 p-1 bg-muted rounded-full text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium text-base flex items-center gap-1">
                        {c.is_alert > 0}{c.full_name}
                      </div>
                      <div className="text-sm text-muted-foreground">{c.code}{c.phone ? ` · ${c.phone}` : ''}</div>
                    </div>
                  </Button>
                ))}
                {customerQuery && customerResults.length === 0 && <div className="text-base text-center text-muted-foreground py-4">ไม่พบลูกค้า</div>}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]) }}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CUSTOMER INFO DIALOG ── */}
      <Dialog open={showCustomerInfo} onOpenChange={setShowCustomerInfo}>
        <DialogContent size="md" onClose={() => setShowCustomerInfo(false)}>
          <DialogHeader><DialogTitle>ข้อมูลลูกค้า</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
              {cart.customer && (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="text-xl font-bold text-foreground flex items-center gap-1.5">
                        {cart.customer.full_name}
                      </CardTitle>
                      <CardDescription className="flex gap-3 text-sm">
                        <span><span className="text-foreground-subtle">รหัส:</span> <span className="text-muted-foreground font-mono">{cart.customer.code || '-'}</span></span>
                        <span><span className="text-foreground-subtle">HN:</span> <span className="text-muted-foreground">{cart.customer.hn || '-'}</span></span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
                      <span className="text-foreground-subtle">เบอร์โทร</span>
                      <span className="text-foreground">{cart.customer.phone || '-'}</span>
                      <span className="text-foreground-subtle">ที่อยู่</span>
                      <span className="text-foreground whitespace-pre-line">{cart.customer.address || '-'}</span>
                    </CardContent>
                  </Card>
                  {(cart.customer.hc_uc || cart.customer.hc_gov || cart.customer.hc_sso) ? (
                    <div>
                      <div className="text-sm text-foreground-subtle">สิทธิการรักษา</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {cart.customer.hc_uc ? <Badge variant="outline" className="text-sm bg-primary-soft text-primary px-2 py-0.5 rounded-md">บัตรทอง</Badge> : null}
                        {cart.customer.hc_gov ? <Badge variant="outline" className="text-sm bg-primary-soft text-primary px-2 py-0.5 rounded-md">ข้าราชการ</Badge> : null}
                        {cart.customer.hc_sso ? <Badge variant="outline" className="text-sm bg-warning-soft text-warning-strong px-2 py-0.5 rounded-md">ประกันสังคม</Badge> : null}
                      </div>
                    </div>
                  ) : null}
                  {cart.customer.food_allergy ? (
                    <div>
                      <div className="text-sm text-foreground-subtle">แพ้อาหาร</div>
                      <div className="text-foreground whitespace-pre-line">{cart.customer.food_allergy}</div>
                    </div>
                  ) : null}
                  {cart.customer.other_allergy ? (
                    <div>
                      <div className="text-sm text-foreground-subtle">แพ้อื่นๆ</div>
                      <div className="text-foreground whitespace-pre-line">{cart.customer.other_allergy}</div>
                    </div>
                  ) : null}
                  {cart.customer.chronic_diseases ? (
                    <div>
                      <div className="text-sm text-foreground-subtle">โรคประจำตัว</div>
                      <div className="text-foreground whitespace-pre-line">{cart.customer.chronic_diseases}</div>
                    </div>
                  ) : null}
                  {cart.customer.alert_note ? (
                    <div>
                      <div className="text-sm text-foreground-subtle">หมายเหตุ / ประวัติแพ้ยา</div>
                      <div className="text-destructive whitespace-pre-line bg-destructive-soft rounded-lg px-3 py-2 text-base">{cart.customer.alert_note}</div>
                    </div>
                  ) : null}
                  {cart.customer.warning_note ? (
                    <div>
                      <div className="text-sm text-foreground-subtle">คำเตือน</div>
                      <div className="text-warning-strong whitespace-pre-line bg-warning-soft rounded-lg px-3 py-2 text-base">{cart.customer.warning_note}</div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button autoFocus variant="secondary" onClick={() => setShowCustomerInfo(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QUICK ADD CUSTOMER DIALOG ── */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent size="md" onClose={() => setShowQuickAdd(false)}>
          <DialogHeader><DialogTitle>เพิ่มลูกค้าใหม่</DialogTitle></DialogHeader>
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
            <Button variant="secondary" onClick={() => setShowQuickAdd(false)}>ยกเลิก</Button>
            <Button onClick={handleQuickAdd} disabled={qaSaving}>{qaSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PAYMENT DIALOG ── */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent size="lg" onClose={() => setShowPayment(false)}>
          <DialogHeader><DialogTitle>ชำระเงิน</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            {(() => {
              const subtotal = cart.subtotal()
              const totalCost = cart.items.reduce((s, i) => s + i.qty * (i.product?.cost_price ?? 0), 0)
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
                <>
                  {/* Section 1 — Gross + editable discount */}
                  <div className="rounded-xl bg-background p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-lg text-muted-foreground">ราคาขายรวม</span>
                      <span className="text-2xl font-semibold tabular-nums">฿{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg text-muted-foreground">ส่วนลดรวม</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={totalDiscountInput}
                        onChange={e => { setTotalDiscountInput(e.target.value); applyTotalDiscount(e.target.value) }}
                        onBlur={normalizeTotalDiscount}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        placeholder="0.00"
                        disabled={cart.items.length === 0 || subtotal <= 0}
                        className="text-right tabular-nums w-52 h-12 text-2xl font-semibold bg-destructive-soft text-destructive focus-visible:ring-destructive/30"
                      />
                    </div>
                  </div>

                  {/* Section 2 — Net total */}
                  <div className={`rounded-xl px-5 py-4 ${netNegative
                    ? 'bg-destructive-soft'
                    : 'bg-primary-soft'}`}>
                    <div className="text-base text-muted-foreground font-semibold mb-1">เป็นเงินทั้งสิ้น</div>
                    <div className={`text-6xl font-extrabold text-right leading-none tabular-nums ${netNegative ? 'text-destructive' : 'text-primary'}`}>
                      {formatCurrency(net)}
                    </div>
                  </div>

                  {/* Single-line breakdown + toggle */}
                  <div className="flex items-center justify-between gap-3 text-base">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowBreakdown(v => !v)}
                      className="ml-left shrink-0"
                    >
                      {'ดูรายละเอียด'}
                    </Button>
                    {showBreakdown ? (
                      <div className="flex items-center gap-3 tabular-nums">
                        <span><span className="text-muted-foreground">ต้นทุน</span> ฿{formatCurrency(totalCost)}</span>
                        <span className="text-muted-foreground">•</span>
                        <span><span className="text-muted-foreground">กำไร</span> <span className={`font-semibold ${profit >= 0 ? 'text-primary' : 'text-destructive'}`}>฿{formatCurrency(profit)}</span></span>
                        <span className="text-muted-foreground">•</span>
                        <span><span className="text-muted-foreground">% กำไร</span> <span className={`font-semibold ${margin >= 0 ? 'text-primary' : 'text-destructive'}`}>{margin.toFixed(2)}%</span></span>
                      </div>
                    ) : <span />}
                  </div>

                  {/* Cash input */}
                  <div className="space-y-2">
                    <Label className="text-lg">
                      <Banknote className="h-5 w-5 text-success" /> รับเงินมา
                    </Label>
                    <Input
                      type="number"
                      value={cashAmount}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => setCashAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCompleteSale() }}
                      placeholder="0.00"
                      className="text-right text-4xl font-bold tabular-nums h-16"
                      autoFocus
                    />
                  </div>

                  {/* Change */}
                  <div className={`rounded-xl px-5 py-4 ${needsCheck ? 'bg-destructive-soft' : 'bg-muted'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">เงินทอน</span>
                      {needsCheck ? (
                        <span className="flex items-center gap-2 text-4xl font-extrabold text-destructive tracking-wider">
                          <AlertTriangle className="h-7 w-7" />
                          กรุณาตรวจสอบ
                        </span>
                      ) : (
                        <span className="text-4xl font-extrabold tabular-nums text-success">
                          ฿{formatCurrency(Math.max(0, change))}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )
            })()}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowPayment(false)}>ยกเลิก</Button>
            <Button variant="success" disabled={saving || change < 0 || pendingNet < 0} onClick={handleCompleteSale} className="min-w-[120px]">
              {saving ? 'กำลังบันทึก...' : '✓ บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ADJUST STOCK DIALOG (System A — multi-item) ── */}
      <Dialog open={showAdjust} onOpenChange={(v) => { if (!v) closeAdjust() }}>
        <DialogContent size="2xl" onClose={closeAdjust}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning-strong">
              <Minus className="size-4" /> ตัดสต็อก
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex gap-0 p-0 overflow-hidden rounded-xl" style={{ height: '460px' }}>
            {/* Left column — search + product results / lot picker */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <div className="p-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={adjustInputRef}
                    placeholder="สแกนหรือค้นหาชื่อ/บาร์โค้ด..."
                    value={adjustQuery}
                    onChange={e => handleAdjustSearch(e.target.value)}
                    className="h-10 pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {!adjustSelected ? (
                  adjustSearching ? (
                    <div className="py-10 text-center text-muted-foreground text-base">กำลังค้นหา...</div>
                  ) : adjustQuery && adjustResults.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-base">ไม่พบสินค้า "{adjustQuery}"</div>
                  ) : !adjustQuery ? (
                    <div className="h-full flex flex-col items-center justify-center text-foreground-subtle gap-2">
                      <Search className="h-8 w-8 opacity-30" />
                      <p className="text-base">พิมพ์ชื่อ, บาร์โค้ด หรือรหัสสินค้า</p>
                    </div>
                  ) : (
                    adjustResults.map(p => (
                      <div key={p.id} onClick={() => handleAdjustSelectProduct(p)}
                        className="px-4 py-2.5 cursor-pointer last:border-0 hover:bg-surface-hover flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-base truncate">{p.trade_name}</div>
                          <div className="text-sm text-muted-foreground">{p.unit_name} · {p.barcode || p.code || '—'}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    ))
                  )
                ) : (
                  <div className="p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-base">{adjustSelected.trade_name}</div>
                        <div className="text-sm text-muted-foreground">{adjustSelected.unit_name}</div>
                      </div>
                      <button
                        onClick={() => { setAdjustSelected(null); setAdjustQuery(''); setAdjustSelectedLotId(null); setTimeout(() => adjustInputRef.current?.focus(), 50) }}
                        className="text-sm text-primary flex items-center gap-0.5 shrink-0 hover:underline mt-0.5"
                      >
                        <ChevronLeft className="h-3 w-3" /> เปลี่ยน
                      </button>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-foreground-subtle mb-1.5">เลือก Lot (ค่าเริ่มต้น = FEFO)</div>
                      {(adjustSelected.lots?.length ?? 0) === 0 ? (
                        <div className="text-base text-muted-foreground py-1">ไม่พบ Lot ที่มีสต็อก</div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                          {adjustSelected.lots.map(lot => (
                            <button key={lot.id} onClick={() => setAdjustSelectedLotId(lot.id)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-base transition-colors ${adjustSelectedLotId === lot.id ? 'bg-primary-soft text-primary' : 'bg-background hover:bg-muted'}`}>
                              <div className="flex justify-between items-center">
                                <span className="font-mono font-medium">{lot.lot_number || '—'}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold tabular-nums">฿{formatCurrency(lot.cost_price)}</span>
                                  <Badge variant="outline" className="text-sm px-1.5">คงเหลือ {lot.qty_on_hand}</Badge>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                หมดอายุ: {lot.expiry_date ? dayjs(lot.expiry_date).format('DD/MM/YYYY') : '—'}
                                {lot.supplier_name ? ` · ${lot.supplier_name}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-foreground-subtle block">จำนวนที่ตัด ({adjustSelected.unit_name})</Label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon"
                          onClick={() => setAdjustQtyInput(v => String(Math.max(1, (parseFloat(v) || 1) - 1)))}
                          className="h-12 w-12 shrink-0 rounded-xl">
                          <Minus className="size-5" />
                        </Button>
                        <Input
                          type="number"
                          value={adjustQtyInput}
                          onChange={e => setAdjustQtyInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddAdjustItem() }}
                          className="h-12 text-center text-3xl font-bold tabular-nums"
                          min="1" step="1"
                        />
                        <Button variant="outline" size="icon"
                          onClick={() => setAdjustQtyInput(v => String((parseFloat(v) || 0) + 1))}
                          className="h-12 w-12 shrink-0 rounded-xl">
                          <Plus className="size-5" />
                        </Button>
                      </div>
                      <Button
                        onClick={handleAddAdjustItem}
                        disabled={!adjustSelectedLotId || !adjustQtyInput || parseFloat(adjustQtyInput) <= 0}
                        className="w-full h-10 gap-1.5"
                      >
                        <Plus className="size-4" /> เพิ่มในรายการตัด
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right column — adjust list + total + reason */}
            <div className="flex flex-col w-72 shrink-0 overflow-hidden">
              <div className="px-3 py-2.5 shrink-0 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground-subtle">รายการที่จะตัด</span>
                {adjustList.length > 0 && (
                  <Badge variant="outline" className="bg-warning-soft text-warning-strong text-sm">{adjustList.length} รายการ</Badge>
                )}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
                {adjustList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Minus className="h-7 w-7 opacity-25" />
                    <p className="text-base">ยังไม่มีรายการ</p>
                  </div>
                ) : adjustList.map((item, idx) => (
                  <div key={idx} className="bg-background rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{item.product_name}</div>
                      <div className="text-sm text-muted-foreground font-mono">{item.lot_number || '—'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm text-muted-foreground tabular-nums">×{item.qty}</div>
                      <div className="text-sm font-bold tabular-nums text-warning-strong">฿{formatCurrency(item.line_total)}</div>
                    </div>
                    <Button variant="ghost" size="icon"
                      onClick={() => setAdjustList(list => list.filter((_, i) => i !== idx))}
                      className="w-6 h-6 shrink-0 text-foreground-subtle hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="p-3 shrink-0 space-y-2">
                {adjustList.length > 0 && (
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-warning-soft">
                    <span className="text-sm font-semibold text-warning-strong">มูลค่าทุนรวม</span>
                    <span className="text-lg font-extrabold tabular-nums text-warning-strong">
                      ฿{formatCurrency(adjustList.reduce((s, i) => s + i.line_total, 0))}
                    </span>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-semibold text-foreground-subtle mb-1 block">
                    สาเหตุการตัด <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {['ใช้ภายใน', 'เสียหาย/แตกหัก', 'สูญหาย'].map(reason => (
                      <Button key={reason} variant="outline" size="sm"
                        onClick={() => setAdjustReason(r => r === reason ? '' : reason)}
                        className={`h-6 px-2 text-sm rounded-md ${adjustReason === reason ? 'bg-primary-soft text-primary' : ''}`}>
                        {reason}
                      </Button>
                    ))}
                  </div>
                  <Input
                    placeholder="ระบุสาเหตุ..."
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={closeAdjust}>ยกเลิก</Button>
            <Button
              onClick={handleConfirmAdjust}
              disabled={adjustList.length === 0 || !adjustReason.trim() || adjustSaving}
              className="bg-warning hover:bg-warning-hover text-white font-semibold gap-1.5"
            >
              <Minus className="size-4" />
              {adjustSaving ? 'กำลังบันทึก...' : `ยืนยันตัดสต็อก${adjustList.length > 0 ? ` ${adjustList.length} รายการ` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RETURN ITEMS DIALOG ── */}
      <Dialog open={showReturn} onOpenChange={(v) => { if (!v) closeReturn() }}>
        <DialogContent size="2xl" onClose={closeReturn}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning-strong">
              <RotateCcw className="size-4" /> คืนสินค้า
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex gap-0 p-0 overflow-hidden rounded-xl" style={{ height: '460px' }}>
            {/* Left column — search + product results / lot picker */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <div className="p-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={returnInputRef}
                    placeholder="สแกนหรือค้นหาชื่อ/บาร์โค้ด..."
                    value={returnQuery}
                    onChange={e => handleReturnSearch(e.target.value)}
                    className="h-10 pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {!returnSelectedProduct ? (
                  returnSearching ? (
                    <div className="py-10 text-center text-muted-foreground text-base">กำลังค้นหา...</div>
                  ) : returnQuery && returnResults.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-base">ไม่พบสินค้า "{returnQuery}"</div>
                  ) : !returnQuery ? (
                    <div className="h-full flex flex-col items-center justify-center text-foreground-subtle gap-2">
                      <Search className="h-8 w-8 opacity-30" />
                      <p className="text-base">พิมพ์ชื่อ, บาร์โค้ด หรือรหัสสินค้า</p>
                    </div>
                  ) : (
                    returnResults.map(p => (
                      <div key={p.id} onClick={() => handleReturnSelectProduct(p)}
                        className="px-4 py-2.5 cursor-pointer last:border-0 hover:bg-surface-hover flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-base truncate">{p.trade_name}</div>
                          <div className="text-sm text-muted-foreground">{p.unit_name} · {p.barcode || p.code || '—'}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    ))
                  )
                ) : (
                  <div className="p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-base">{returnSelectedProduct.trade_name}</div>
                        <div className="text-sm text-muted-foreground">{returnSelectedProduct.unit_name}</div>
                      </div>
                      <button
                        onClick={() => { setReturnSelectedProduct(null); setReturnQuery(''); setReturnProductLots([]); setReturnSelectedLotId(null); setTimeout(() => returnInputRef.current?.focus(), 50) }}
                        className="text-sm text-primary flex items-center gap-0.5 shrink-0 hover:underline mt-0.5"
                      >
                        <ChevronLeft className="h-3 w-3" /> เปลี่ยน
                      </button>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-foreground-subtle mb-1.5">เลือก Lot</div>
                      {returnProductLots.length === 0 ? (
                        <div className="text-base text-muted-foreground py-1">ไม่พบ Lot สำหรับสินค้านี้</div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                          {returnProductLots.map(lot => (
                            <button key={lot.id} onClick={() => setReturnSelectedLotId(lot.id)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-base transition-colors ${returnSelectedLotId === lot.id ? 'bg-primary-soft text-primary' : 'bg-background hover:bg-muted'}`}>
                              <div className="flex justify-between items-center">
                                <span className="font-mono font-medium">{lot.lot_number || '—'}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold tabular-nums">฿{formatCurrency(lot.sell_price)}</span>
                                  <Badge variant="outline" className="text-sm px-1.5">คงเหลือ {lot.qty_on_hand}</Badge>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                หมดอายุ: {lot.expiry_date ? dayjs(lot.expiry_date).format('DD/MM/YYYY') : '—'}
                                {lot.supplier_name ? ` · ${lot.supplier_name}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-foreground-subtle block">จำนวนที่คืน ({returnSelectedProduct.unit_name})</Label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon"
                          onClick={() => setReturnQtyInput(v => String(Math.max(1, (parseFloat(v) || 1) - 1)))}
                          className="h-12 w-12 shrink-0 rounded-xl">
                          <Minus className="size-5" />
                        </Button>
                        <Input
                          type="number"
                          value={returnQtyInput}
                          onChange={e => setReturnQtyInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddReturnItem() }}
                          className="h-12 text-center text-3xl font-bold tabular-nums"
                          min="1" step="1"
                        />
                        <Button variant="outline" size="icon"
                          onClick={() => setReturnQtyInput(v => String((parseFloat(v) || 0) + 1))}
                          className="h-12 w-12 shrink-0 rounded-xl">
                          <Plus className="size-5" />
                        </Button>
                      </div>
                      <Button
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
            </div>

            {/* Right column — return list + total + reason */}
            <div className="flex flex-col w-72 shrink-0 overflow-hidden">
              <div className="px-3 py-2.5 shrink-0 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground-subtle">รายการที่จะคืน</span>
                {returnList.length > 0 && (
                  <Badge variant="outline" className="bg-warning-soft text-warning-strong text-sm">{returnList.length} รายการ</Badge>
                )}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
                {returnList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <RotateCcw className="h-7 w-7 opacity-25" />
                    <p className="text-base">ยังไม่มีรายการ</p>
                  </div>
                ) : returnList.map((item, idx) => (
                  <div key={idx} className="bg-background rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{item.product_name}</div>
                      <div className="text-sm text-muted-foreground font-mono">{item.lot_number || '—'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm text-muted-foreground tabular-nums">×{item.qty}</div>
                      <div className="text-sm font-bold tabular-nums text-warning-strong">฿{formatCurrency(item.line_total)}</div>
                    </div>
                    <Button variant="ghost" size="icon"
                      onClick={() => setReturnList(list => list.filter((_, i) => i !== idx))}
                      className="w-6 h-6 shrink-0 text-foreground-subtle hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="p-3 shrink-0 space-y-2">
                {returnList.length > 0 && (
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-warning-soft">
                    <span className="text-sm font-semibold text-warning-strong">ยอดคืนรวม</span>
                    <span className="text-lg font-extrabold tabular-nums text-warning-strong">
                      ฿{formatCurrency(returnList.reduce((s, i) => s + i.line_total, 0))}
                    </span>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-semibold text-foreground-subtle mb-1 block">
                    สาเหตุการคืน <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="ระบุสาเหตุ..."
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={closeReturn}>ยกเลิก</Button>
            <Button
              onClick={handleConfirmReturn}
              disabled={returnList.length === 0 || !returnReason.trim() || returnSaving}
              className="bg-warning hover:bg-warning-hover text-white font-semibold gap-1.5"
            >
              <RotateCcw className="size-4" />
              {returnSaving ? 'กำลังบันทึก...' : `ยืนยันคืน${returnList.length > 0 ? ` ${returnList.length} รายการ` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SUCCESS DIALOG ── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent size="sm" onClose={() => setShowSuccess(false)}>
          <DialogBody className="text-center py-8 space-y-4">
            <div className="text-6xl">✅</div>
            <div><div className="text-xl font-semibold">บันทึกบิลสำเร็จ</div>
              <div className="text-muted-foreground text-base mt-1">{lastInvoice}</div></div>
            <Button autoFocus onClick={() => setShowSuccess(false)} className="w-full">เปิดบิลใหม่</Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ── UNIT DIALOG ── */}
      <Dialog open={unitModalIdx !== null} onOpenChange={(v) => { if (!v) setUnitModalIdx(null) }}>
        {unitModalIdx !== null && (() => {
          const item = cart.items[unitModalIdx]
          const product = item?.product as ProductWithDetails | undefined
          const units = product?.units ?? []
          const baseUnit = product ? {
            id: -1,
            unit_name: product.unit_name ?? item?.unit_name ?? '',
            price_retail: product.price_retail,
            price_wholesale1: product.price_wholesale1,
            price_wholesale2: product.price_wholesale2,
            is_base_unit: true,
          } as unknown as ProductUnit : null
          const allUnits = baseUnit ? [baseUnit, ...units.filter(u => u.unit_name !== baseUnit.unit_name)] : units
          return (
            <DialogContent size="sm" onClose={() => setUnitModalIdx(null)}>
              <DialogHeader><DialogTitle>เลือกหน่วย — {item?.item_name}</DialogTitle></DialogHeader>
              <DialogBody>
                <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
                  {allUnits.map(u => {
                    const active = item?.unit_name === u.unit_name
                    return (
                      <Button key={u.id} variant="outline"
                        onClick={() => changeCartUnit(unitModalIdx, u)}
                        className={`w-full px-4 py-3 rounded-xl text-left transition-colors ${active ? 'bg-primary-soft text-primary font-bold' : 'bg-card hover:bg-muted'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-base">{u.unit_name}</span>
                          {u.id === -1 && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">หลัก</span>}
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setUnitModalIdx(null)}>ปิด</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>

      {/* ── PRICE DIALOG ── */}
      <Dialog open={priceModalIdx !== null} onOpenChange={(v) => { if (!v) setPriceModalIdx(null) }}>
        {priceModalIdx !== null && (() => {
          const item = cart.items[priceModalIdx]
          const product = item?.product as ProductWithDetails | undefined
          const cost = product?.cost_price ?? 0
          const priceOptions = product ? [
            { label: 'ราคาปลีก', price: item.selectedUnit ? item.selectedUnit.price_retail : product.price_retail },
            ...(product.has_wholesale1 || product.price_wholesale1 > 0 ? [{ label: 'ราคาส่ง 1', price: item.selectedUnit ? item.selectedUnit.price_wholesale1 : product.price_wholesale1 }] : []),
            ...(product.has_wholesale2 || product.price_wholesale2 > 0 ? [{ label: 'ราคาส่ง 2', price: item.selectedUnit ? item.selectedUnit.price_wholesale2 : product.price_wholesale2 }] : []),
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
              <DialogHeader><DialogTitle>ราคา — {item?.item_name}</DialogTitle></DialogHeader>
              <DialogBody>
                <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                  {/* Custom price input */}
                  <div className="w-full px-4 py-3 rounded-xl bg-primary-soft">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-m font-bold text-primary">กำหนดราคา</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        type="number"
                        autoFocus
                        value={customPriceInput}
                        min={0}
                        step="0.01"
                        style={{ MozAppearance: 'textfield' }}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setCustomPriceInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyCustomPrice() }}
                        placeholder="0.00"
                        className="w-full flex-1 h-10 text-right text-xl font-bold bg-card rounded-lg focus:ring-2 focus:ring-primary outline-none px-3 tabular-nums"
                      />
                      <Button onClick={applyCustomPrice} disabled={customPrice <= 0} className="h-11 px-4">ตกลง</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-foreground-subtle">ทุน</div>
                        <div className="font-semibold text-muted-foreground tabular-nums">฿{formatCurrency(cost)}</div>
                      </div>
                      <div>
                        <div className="text-foreground-subtle">กำไร</div>
                        <div className={`font-semibold tabular-nums ${customProfit > 0 ? 'text-success' : 'text-destructive'}`}>฿{formatCurrency(customProfit)}</div>
                      </div>
                      <div>
                        <div className="text-foreground-subtle">% ทุน</div>
                        <div className={`font-semibold tabular-nums ${customProfit > 0 ? 'text-success' : 'text-destructive'}`}>{cost > 0 ? customMarkupPct.toFixed(1) : '0.0'}%</div>
                      </div>
                    </div>
                  </div>

                  {priceOptions.map((opt, i) => {
                    const active = item?.unit_price === opt.price
                    const profit = opt.price - cost
                    const markupPct = cost > 0 ? (profit / cost) * 100 : 0
                    return (
                      <Button key={i} variant="outline"
                        onClick={() => changeCartPrice(priceModalIdx, opt.price)}
                        className={`w-full px-4 py-3 rounded-xl text-left transition-colors ${active ? 'bg-primary-soft' : 'bg-card hover:bg-muted'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-base font-bold ${active ? 'text-primary' : 'text-foreground'}`}>{opt.label}</span>
                          <span className="text-lg font-extrabold text-primary tabular-nums">฿{formatCurrency(opt.price)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <div className="text-foreground-subtle">ทุน</div>
                            <div className="font-semibold text-muted-foreground tabular-nums">฿{formatCurrency(cost)}</div>
                          </div>
                          <div>
                            <div className="text-foreground-subtle">กำไร</div>
                            <div className={`font-semibold tabular-nums ${profit > 0 ? 'text-success' : 'text-destructive'}`}>฿{formatCurrency(profit)}</div>
                          </div>
                          <div>
                            <div className="text-foreground-subtle">% ทุน</div>
                            <div className={`font-semibold tabular-nums ${profit > 0 ? 'text-success' : 'text-destructive'}`}>{cost > 0 ? markupPct.toFixed(1) : '0.0'}%</div>
                          </div>
                        </div>
                      </Button>
                    )
                  })}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPriceModalIdx(null)}>ปิด</Button>
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
              <DialogHeader><DialogTitle>จำนวน — {item?.item_name}</DialogTitle></DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex justify-between text-base">
                  <span className="text-muted-foreground">คงเหลือ</span>
                  <span className={`font-semibold tabular-nums ${stockQty > 0 ? 'text-foreground' : 'text-destructive'}`}>{stockQty} {item?.unit_name}</span>
                </div>
                <div>
                  <Label className="block text-base font-bold text-muted-foreground mb-1">จำนวน ({item?.unit_name})</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => bump(-1)}
                      className="w-14 h-14 rounded-xl flex items-center justify-center bg-muted hover:bg-muted text-muted-foreground font-bold shrink-0">
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
                      className="w-16 flex-1 h-14 text-center text-3xl font-bold bg-card rounded-xl focus:ring-2 focus:ring-primary outline-none px-4 tabular-nums"
                    />
                    <Button variant="outline" size="icon" onClick={() => bump(1)}
                      className="w-14 h-14 rounded-xl flex items-center justify-center bg-muted hover:bg-muted text-muted-foreground font-bold shrink-0">
                      <Plus className="size-5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 5, 10, 20, 50].map(n => (
                    <Button key={n} variant="outline" size="sm" onClick={() => setQtyInput(String(n))}
                      className="h-10 rounded-xl bg-card hover:bg-muted text-base font-semibold text-muted-foreground tabular-nums transition-colors">
                      {n}
                    </Button>
                  ))}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setQtyModalIdx(null)}>ยกเลิก</Button>
                <Button onClick={() => applyQty(q)}>ตกลง</Button>
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
            <DialogContent size="sm" onClose={() => setDiscountModalIdx(null)}>
              <DialogHeader><DialogTitle>ส่วนลด — {item?.item_name}</DialogTitle></DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex justify-between text-base">
                  <span className="text-muted-foreground">ราคารวม</span>
                  <span className="font-semibold text-foreground tabular-nums">฿{formatCurrency(totalPrice)}</span>
                </div>

                {/* Percent presets */}
                <div className="grid grid-cols-5 gap-2">
                  {([
                    { pct: 3,  base: 'bg-destructive-soft text-destructive hover:bg-destructive/15',  active: 'bg-destructive/25 text-destructive ring-2 ring-destructive/30' },
                    { pct: 5,  base: 'bg-destructive/15 text-destructive hover:bg-destructive/25', active: 'bg-destructive/35 text-destructive ring-2 ring-destructive/40' },
                    { pct: 10, base: 'bg-destructive/25 text-destructive hover:bg-destructive/35', active: 'bg-destructive/50 text-white ring-2 ring-destructive/50' },
                    { pct: 15, base: 'bg-destructive/35 text-destructive hover:bg-destructive/50', active: 'bg-destructive/65 text-white ring-2 ring-destructive/60' },
                    { pct: 20, base: 'bg-destructive/50 text-white hover:bg-destructive/65',   active: 'bg-destructive text-primary-foreground ring-2 ring-destructive/70' },
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
                        type="number"
                        value={discountPctInput}
                        min={0}
                        max={100}
                        style={{ MozAppearance: 'textfield' }}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => {
                          setDiscountPctInput(e.target.value)
                          const pct = parseFloat(e.target.value)
                          if (!isNaN(pct)) {
                            const disc = parseFloat((totalPrice * pct / 100).toFixed(2))
                            setDiscountInput(String(disc))
                            setFinalPriceInput(String(parseFloat((totalPrice - disc).toFixed(2))))
                          }
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') applyDiscount(d) }}
                        placeholder="0"
                        className="w-full h-14 text-right text-3xl font-bold bg-card rounded-xl focus:ring-2 focus:ring-destructive/50 outline-none pl-4 pr-10 tabular-nums"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle text-xl font-bold pointer-events-none">%</span>
                    </div>
                  </div>

                  <div>
                    <Label className="block text-base font-bold text-muted-foreground mb-1">ส่วนลด (บาท)</Label>
                    <Input
                      type="number"
                      autoFocus
                      value={discountInput}
                      min={0}
                      style={{ MozAppearance: 'textfield' }}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => {
                        setDiscountInput(e.target.value)
                        const disc = parseFloat(e.target.value) || 0
                        if (totalPrice > 0) setDiscountPctInput(String(parseFloat((disc / totalPrice * 100).toFixed(2))))
                        setFinalPriceInput(String(parseFloat((totalPrice - disc).toFixed(2))))
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') applyDiscount(d) }}
                      placeholder="0.00"
                      className="w-full h-14 text-right text-3xl font-bold bg-card rounded-xl focus:ring-2 focus:ring-destructive/50 outline-none px-4 tabular-nums"
                    />
                  </div>
                </div>

                {/* Final price reverse-calc input */}
                <div>
                  <Label className="block text-base font-bold text-muted-foreground mb-1">ราคาสุดท้าย (บาท)</Label>
                  <Input
                    type="number"
                    value={finalPriceInput}
                    min={0}
                    style={{ MozAppearance: 'textfield' }}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => {
                      setFinalPriceInput(e.target.value)
                      const fp = parseFloat(e.target.value)
                      if (!isNaN(fp)) {
                        const disc = Math.max(0, parseFloat((totalPrice - fp).toFixed(2)))
                        setDiscountInput(String(disc))
                        if (totalPrice > 0) setDiscountPctInput(String(parseFloat((disc / totalPrice * 100).toFixed(2))))
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') applyDiscount(d) }}
                    placeholder={formatCurrency(totalPrice)}
                    className="w-full h-14 text-right text-3xl font-bold bg-card rounded-xl focus:ring-2 focus:ring-primary outline-none px-4 tabular-nums"
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDiscountInput('0'); applyDiscount(0) }}>ล้าง</Button>
                <Button variant="secondary" onClick={() => setDiscountModalIdx(null)}>ยกเลิก</Button>
                <Button onClick={() => applyDiscount(d)}>ตกลง</Button>
              </DialogFooter>
            </DialogContent>
          )
        })()}
      </Dialog>
    </div>
  )
}