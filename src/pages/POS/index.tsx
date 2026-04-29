import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCartStore } from '@/stores/cartStore'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { formatCurrency, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductUnit, ProductLot, Customer } from '@/types'
import { redistributeDiscounts } from './redistributeDiscount'
import {
  Search, User, Trash2, Plus, Minus,
  Banknote, AlertTriangle, ChevronDown, X, UserPlus, Info,
} from 'lucide-react'

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

  useEffect(() => {
    loadDailyStats()
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const anyModalOpen = searchOpen || showPayment || showCustomerSearch || showQuickAdd || showSuccess || showCustomerInfo ||
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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [qtyModalIdx, discountModalIdx, priceModalIdx, unitModalIdx, searchOpen, showQuickAdd, showCustomerInfo, showCustomerSearch])

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
        change_amount: Math.max(0, change), symptom_note: cart.symptomNote, age_range: cart.ageRange, sold_by: 1,
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

  const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col h-full p-3 gap-2">

          {/* Gradient banner */}
          <div className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 text-white shadow-md flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold leading-tight">Rx Syntropic</h1>
              <p className="text-xs opacity-80">หน้าจอขายสินค้า</p>
            </div>
            <div className="text-right text-xs opacity-90 leading-relaxed">
              <div>วันที่: <span className="font-semibold">{dateStr}</span></div>
              <div>เวลา: <span className="font-semibold tabular-nums">{timeStr}</span></div>
            </div>
          </div>
      {/* ── TOP ROW ── */}
      <div className="flex gap-3 shrink-0">
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">

          {/* Search input + controls */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-500 pointer-events-none" />
              <Input
                ref={mainInputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="ค้นหารหัส, ชื่อยา หรือสแกนบาร์โค้ด [F2]..."
                autoFocus
                autoComplete="off"
                className="w-full h-[52px] pl-12 pr-4 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base bg-white outline-none transition-all"
              />
            </div>

            {/* Sale type */}
            <div className="flex rounded-xl overflow-hidden border border-slate-300 shadow-sm shrink-0" style={{ height: '52px' }}>
              {(['retail', 'wholesale'] as const).map(t => (
                <button key={t} onClick={() => { cart.setSaleType(t); refocusSearch() }}
                  className={`font-bold text-sm transition-colors ${cart.saleType === t ? 'min w-12 bg-primary text-primary-foreground' : 'min w-12 bg-primary-foreground text-primary hover:bg-slate-50'}`}>
                  {t === 'retail' ? 'ปลีก' : 'ส่ง'}
                </button>
              ))}
            </div>

            {/* Customer selector */}
            <button onClick={() => setShowCustomerSearch(true)}
              className="h-[52px] bg-white border border-slate-300 rounded-xl px-4 w-64 flex items-center justify-between hover:bg-slate-50 transition-colors shadow-sm shrink-0">
              <div className="flex flex-col text-left overflow-hidden pr-2">
                <span className="text-xs text-slate-400 font-medium">ลูกค้า / สมาชิก</span>
                <span className={`text-sm font-bold truncate ${cart.customer ? 'text-slate-400' : 'text-emerald-600'}`}>
                  {cart.customer
                    ? <span className="flex items-center gap-1">{cart.customer.is_alert && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}{cart.customer.full_name}</span>
                    : 'ลูกค้าทั่วไป (เงินสด)'}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
            </button>

            {cart.customer && (
              <button onClick={() => { cart.setCustomer(null); refocusSearch() }}
                className="h-[52px] w-[52px] bg-white border border-slate-300 rounded-xl flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors shadow-sm shrink-0 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            )}

            <button onClick={() => setShowCustomerInfo(true)} disabled={!cart.customer} title="ข้อมูลลูกค้า"
              className="h-[52px] w-[52px] bg-white border border-slate-300 rounded-xl flex flex-col items-center justify-center transition-colors shadow-sm shrink-0 gap-0.5 enabled:text-slate-500 enabled:hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed">
              <Info className="h-5 w-5" />
              <span className="text-[10px] leading-none">ข้อมูล</span>
            </button>

            <button onClick={() => setShowQuickAdd(true)}
              className="h-[52px] w-[52px] bg-white border border-slate-300 rounded-xl flex flex-col items-center justify-center hover:bg-slate-50 transition-colors shadow-sm shrink-0 text-slate-500 gap-0.5">
              <UserPlus className="h-5 w-5" />
              <span className="text-[10px] leading-none">เพิ่มลูกค้า</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Cart table */}
        <div className="flex flex-1 flex-col min-h-0">
          {cart.customer?.is_alert && cart.customer.alert_note && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600 flex items-center gap-2 font-medium shrink-0 mb-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />{cart.customer.alert_note}
            </div>
          )}

          {/* Chrome-style tab strip */}
          <div className="flex items-end border-b border-slate-200 shrink-0">
            {([0, 1, 2] as const).map(i => {
              const isActive = i === cart.activeSlot
              const hasItems = (i === cart.activeSlot ? cart.items : cart.slots[i].items).length > 0
              const showSep = i > 0 && cart.activeSlot !== i && cart.activeSlot !== i - 1
              return (
                <React.Fragment key={i}>
                  {i > 0 && <span className={`self-center h-3.5 w-px mx-0.5 shrink-0 transition-colors ${showSep ? 'bg-slate-300' : 'bg-transparent'}`} />}
                  <button
                    onClick={() => { cart.setActiveSlot(i); refocusSearch() }}
                    className={`relative px-12 py-1.5 text-sm font-semibold rounded-t-lg -mb-px border border-b-0 transition-colors ${
                      isActive
                        ? 'bg-slate-100 border-slate-200 text-slate-700 z-10'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    รายการขาย {i + 1}
                    {hasItems && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  </button>
                </React.Fragment>
              )
            })}
          </div>

          <div className="flex-1 bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-t-0 border-slate-200 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin" tabIndex={-1}>
              <table className="w-full caption-bottom text-sm table-fixed">
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
                <TableHeader className="sticky top-0 z-10 bg-slate-100">
                  <TableRow className="hover:bg-slate-100">
                    <TableHead className="text-center text-xs font-bold text-slate-600">#</TableHead>
                    <TableHead className="text-xs font-bold text-slate-600">รายการสินค้า</TableHead>
                    <TableHead className="text-center text-xs font-bold text-slate-600">หน่วย</TableHead>
                    <TableHead className="text-center text-xs font-bold text-slate-600">จำนวน</TableHead>
                    <TableHead className="text-right text-xs font-bold text-slate-600">ราคา/หน่วย</TableHead>
                    <TableHead className="text-right text-xs font-bold text-slate-600">ส่วนลด</TableHead>
                    <TableHead className="text-right text-xs font-bold text-slate-600">รวมเงิน</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.items.length === 0 ? (
                    <TableRow className="hover:bg-white">
                      <TableCell colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center justify-center text-slate-300 gap-3">
                          <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="text-lg font-medium">ยังไม่มีรายการสั่งซื้อ</p>
                          <p className="text-sm">คลิกช่องค้นหาหรือสแกนบาร์โค้ด</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : cart.items.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50">
                        <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="min-w-0 pr-2">
                          <div className="font-medium truncate text-sm">{item.item_name}</div>
                        </TableCell>

                        <TableCell className="text-center">
                          <button onClick={() => setUnitModalIdx(idx)}
                            className="min-w-14 inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors">
                            {item.unit_name}
                          </button>
                        </TableCell>

                        <TableCell className="text-center">
                          <button
                            onClick={() => { setQtyInput(String(item.qty)); setQtyModalIdx(idx) }}
                            className="inline-flex items-center gap-1 min-w-14 h-8 px-2.5 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-700 text-sm font-semibold tabular-nums hover:bg-yellow-100 hover:border-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 transition-colors">
                            <span className="flex-1 text-center">{item.qty}</span>
                          </button>
                        </TableCell>

                        <TableCell className="text-right">
                          <button onClick={() => { setCustomPriceInput(String(item.unit_price)); setPriceModalIdx(idx) }}
                            className="inline-flex items-center gap-1 min-w-16 h-8 px-2.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold tabular-nums hover:bg-emerald-100 hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 transition-colors">
                            <span className="flex-1 text-right">{formatCurrency(item.unit_price)}</span>
                          </button>
                        </TableCell>

                        <TableCell className="text-right">
                          {item.discount ? (
                            <button
                              onClick={() => { const totalPrice = item.unit_price * item.qty; setDiscountInput(String(parseFloat(item.discount.toFixed(2)))); setDiscountPctInput(totalPrice > 0 ? String(parseFloat((item.discount / totalPrice * 100).toFixed(2))) : ''); setFinalPriceInput(String(parseFloat((totalPrice - item.discount).toFixed(2)))); setDiscountModalIdx(idx) }}
                              className="inline-flex flex-col items-end justify-center min-w-14 h-8 px-2.5 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors">
                              <span className="text-sm font-semibold tabular-nums leading-none">{formatCurrency(item.discount)}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => { setDiscountInput(''); setDiscountPctInput(''); setFinalPriceInput(''); setDiscountModalIdx(idx) }}
                              className="inline-flex items-center gap-1 min-w-14 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-slate-400 text-sm font-medium tabular-nums hover:bg-slate-50 hover:border-red-200 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors">
                              <span className="flex-1 text-right">0</span>
                            </button>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-semibold text-emerald-700 text-sm">
                          {formatCurrency(item.line_total)}
                        </TableCell>

                        <TableCell className="text-right">
                          <button onClick={() => { cart.removeItem(idx); refocusSearch() }}
                            className="w-7 h-7 rounded inline-flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </table>
            </div>

            {cart.items.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-2.5 bg-slate-50 shrink-0 flex justify-between text-sm">
                <span className="text-muted-foreground">
                  รายการ: <span className="font-semibold text-foreground">{cart.items.length} รายการ</span>
                </span>
                <div className="flex gap-6">
                  <span className="text-muted-foreground">ราคารวม: <span className="font-semibold text-foreground">฿{formatCurrency(cart.subtotal())}</span></span>
                  {cart.totalDiscount() > 0 && (
                    <span className="text-muted-foreground">ส่วนลด: <span className="font-semibold text-red-500">-฿{formatCurrency(cart.totalDiscount())}</span></span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right action panel */}
        <div className="w-64 shrink-0 flex flex-col gap-2.5">
                  {/* Grand total */}
        <div className="w-64 bg-white rounded-xl shadow-sm border-2 border-emerald-50 p-5 flex flex-col justify-center shrink-0">
          <div className="text-right text-sm font-bold text-slate-500 mb-1">ยอดสุทธิ</div>
          <div className="text-right text-5xl font-extrabold text-emerald-600 leading-none tabular-nums">
            {formatCurrency(cart.totalAmount())}
          </div>
        </div>
          <Button disabled={cart.items.length === 0}
            onClick={() => {
              setPendingDiscounts(cart.items.map(i => i.discount))
              setTotalDiscountInput(cart.totalDiscount().toFixed(2))
              setCashAmount(cart.totalAmount().toFixed(2))
              setShowBreakdown(false)
              setShowPayment(true)
            }}
            className="flex-1 flex-col gap-1 min-h-[120px] h-auto rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100 text-white font-bold text-2xl shadow-md">
            <span>รับชำระเงิน</span>
            <span className="text-sm bg-black/10 px-3 py-0.5 rounded-md font-medium">F9</span>
          </Button>
          <Button variant="outline" onClick={() => { (window.api.printer as any)?.openCashDrawer?.(); refocusSearch() }}
            className="w-full h-10 rounded-xl text-sm shadow-sm text-slate-600">
            เปิดลิ้นชัก
          </Button>
          <Button variant="outline" disabled={cart.items.length === 0} onClick={() => { cart.clearCart(); refocusSearch() }}
            className="w-full h-10 rounded-xl text-sm shadow-sm text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 gap-2">
            <Trash2 className="h-4 w-4" /> ยกเลิกบิล
          </Button>

          <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-50 p-4 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 text-sm">บิลล่าสุด</span>
              <span className="font-bold text-slate-700">{dailyStats.latest ? dailyStats.latest.slice(11, 16) : '—'}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 text-sm">จำนวนบิล</span>
              <span className="font-bold text-slate-700">{dailyStats.bills}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-sm">ยอดรวม</span>
              <span className="font-bold text-emerald-500">฿{formatCurrency(dailyStats.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SEARCH MODAL (fixed 600×480) ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            style={{ width: '1000px', height: '800px' }}
            onMouseDown={e => e.stopPropagation()}>

            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
              <Search className="h-5 w-5 text-emerald-500 shrink-0" />
              <Input
                ref={modalInputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={handleModalKeyDown}
                placeholder="ค้นหารหัส, ชื่อยา หรือสแกนบาร์โค้ด..."
                className="flex-1 text-base outline-none bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 h-auto px-0"
                autoComplete="off"
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults([]); modalInputRef.current?.focus() }}
                  className="text-slate-400 hover:text-slate-600 p-1"><X className="h-4 w-4" /></button>
              )}
              <button onClick={closeSearch}
                className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50">
                Esc
              </button>
            </div>

            {/* Column header */}
            <div className="grid items-center px-4 py-2 bg-slate-50 text-xs font-bold text-slate-500 border-b border-slate-200 shrink-0"
              style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}>
              <div>ชื่อสินค้า</div>
              <div className="text-center">หน่วย</div>
              <div className="text-right">ราคาขาย</div>
              <div className="text-right">คงเหลือ</div>
            </div>

            {/* Results — flex-1, scrolls internally, empty space stays empty */}
            <div className="flex-1 overflow-y-auto scrollbar-thin" tabIndex={-1}>
              {searching && flatItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">กำลังค้นหา...</div>
              ) : query && flatItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">ไม่พบสินค้า "{query}"</div>
              ) : !query ? (
                <div className="py-12 text-center text-slate-300">
                  <Search className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">พิมพ์เพื่อค้นหาสินค้า</p>
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
                      className={`grid items-center px-4 py-2.5 cursor-pointer border-b border-slate-100 transition-colors ${active ? 'bg-emerald-100' : 'hover:bg-emerald-50'}`}
                      style={{ gridTemplateColumns: '1fr 100px 120px 100px' }}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                          {expiryWarn && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          <span className="truncate">{it.product.trade_name}</span>
                          {stock === 0 && <span className="text-[15px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium shrink-0">หมด</span>}
                        </div>
                        {it.product.code && <div className="text-xs text-slate-400 font-mono truncate">{it.product.code}</div>}
                      </div>
                      <div className="text-center text-sm text-slate-600 truncate">{unitName}</div>
                      <div className="text-right font-bold text-emerald-600 text-sm tabular-nums">฿{formatCurrency(price)}</div>
                      <div className={`text-right text-sm font-semibold tabular-nums ${stock > 0 ? 'text-slate-700' : 'text-red-500'}`}>{stock}</div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer status */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-muted-foreground shrink-0">
              ค้นหา: "{query}" — พบ {results.length} รายการ
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOGS ── */}

      {showCustomerSearch && (
        <InlineModal
          title="เลือกลูกค้า"
          onClose={() => setShowCustomerSearch(false)}
          maxWidth="max-w-md"
          footer={
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <Button variant="outline" onClick={() => setShowCustomerSearch(false)}>ปิด</Button>
            </div>
          }
        >
          <div className="p-5 space-y-3">
            <Input className="h-10" autoFocus placeholder="ชื่อ, เบอร์โทร, รหัส, HN..." value={customerQuery} onChange={e => handleSearchCustomer(e.target.value)} />
            <button onClick={() => { cart.setCustomer(null); closeCustomerSearch() }}
              className="w-full px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-left transition-colors text-sm">
              👤 ลูกค้าทั่วไป (เงินสด)
            </button>
            <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
              {customerResults.map(c => (
                <button key={c.id} onClick={() => { cart.setCustomer(c); closeCustomerSearch() }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted text-left transition-colors">
                  <User className="h-8 w-8 p-1.5 bg-muted rounded-full text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {c.is_alert && <AlertTriangle className="h-3 w-3 text-red-500" />}{c.full_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.code}{c.phone ? ` · ${c.phone}` : ''}</div>
                  </div>
                </button>
              ))}
              {customerQuery && customerResults.length === 0 && <div className="text-sm text-center text-muted-foreground py-4">ไม่พบลูกค้า</div>}
            </div>
          </div>
        </InlineModal>
      )}

      {showCustomerInfo && (
        <InlineModal
          title="ข้อมูลลูกค้า"
          onClose={() => setShowCustomerInfo(false)}
          footer={
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <Button variant="outline" onClick={() => setShowCustomerInfo(false)}>ปิด</Button>
            </div>
          }
        >
          <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
              {cart.customer && (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                        {cart.customer.is_alert ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> : null}
                        {cart.customer.full_name}
                      </CardTitle>
                      <CardDescription className="flex gap-3 text-xs">
                        <span><span className="text-slate-400">รหัส:</span> <span className="text-slate-600 font-mono">{cart.customer.code || '-'}</span></span>
                        <span><span className="text-slate-400">HN:</span> <span className="text-slate-600">{cart.customer.hn || '-'}</span></span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <span className="text-slate-400">เบอร์โทร</span>
                      <span className="text-slate-700">{cart.customer.phone || '-'}</span>
                      <span className="text-slate-400">ที่อยู่</span>
                      <span className="text-slate-700 whitespace-pre-line">{cart.customer.address || '-'}</span>
                    </CardContent>
                  </Card>
                  {(cart.customer.hc_uc || cart.customer.hc_gov || cart.customer.hc_sso) ? (
                    <div>
                      <div className="text-xs text-slate-400">สิทธิการรักษา</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {cart.customer.hc_uc ? <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">บัตรทอง</span> : null}
                        {cart.customer.hc_gov ? <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-md">ข้าราชการ</span> : null}
                        {cart.customer.hc_sso ? <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">ประกันสังคม</span> : null}
                      </div>
                    </div>
                  ) : null}
                  {cart.customer.food_allergy ? (
                    <div>
                      <div className="text-xs text-slate-400">แพ้อาหาร</div>
                      <div className="text-slate-700 whitespace-pre-line">{cart.customer.food_allergy}</div>
                    </div>
                  ) : null}
                  {cart.customer.other_allergy ? (
                    <div>
                      <div className="text-xs text-slate-400">แพ้อื่นๆ</div>
                      <div className="text-slate-700 whitespace-pre-line">{cart.customer.other_allergy}</div>
                    </div>
                  ) : null}
                  {cart.customer.chronic_diseases ? (
                    <div>
                      <div className="text-xs text-slate-400">โรคประจำตัว</div>
                      <div className="text-slate-700 whitespace-pre-line">{cart.customer.chronic_diseases}</div>
                    </div>
                  ) : null}
                  {cart.customer.alert_note ? (
                    <div>
                      <div className="text-xs text-slate-400">หมายเหตุ / ประวัติแพ้ยา</div>
                      <div className="text-red-600 whitespace-pre-line bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">{cart.customer.alert_note}</div>
                    </div>
                  ) : null}
                  {cart.customer.warning_note ? (
                    <div>
                      <div className="text-xs text-slate-400">คำเตือน</div>
                      <div className="text-amber-700 whitespace-pre-line bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">{cart.customer.warning_note}</div>
                    </div>
                  ) : null}
                </>
              )}
          </div>
        </InlineModal>
      )}

      {showQuickAdd && (
        <InlineModal
          title="เพิ่มลูกค้าใหม่"
          onClose={() => setShowQuickAdd(false)}
          footer={
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowQuickAdd(false)}>ยกเลิก</Button>
              <Button onClick={handleQuickAdd} disabled={qaSaving}>{qaSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
            </div>
          }
        >
          <div className="p-5 space-y-4">
            <div>
              <Label className="block text-sm font-medium mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
              <Input autoFocus value={qaName} onChange={e => setQaName(e.target.value)} placeholder="ชื่อ-นามสกุล" />
            </div>
            <div>
              <Label className="block text-sm font-medium mb-1">เบอร์โทรศัพท์</Label>
              <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="เบอร์โทร" />
            </div>
            <div>
              <Label className="block text-sm font-medium mb-1">หมายเหตุ / ประวัติแพ้ยา</Label>
              <Input value={qaNote} onChange={e => setQaNote(e.target.value)} placeholder="ถ้ามี" />
            </div>
          </div>
        </InlineModal>
      )}

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
                  <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-base text-muted-foreground">ราคาขายรวม</span>
                      <span className="text-xl font-semibold tabular-nums">฿{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base text-muted-foreground">ส่วนลดรวม</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={totalDiscountInput}
                        onChange={e => { setTotalDiscountInput(e.target.value); applyTotalDiscount(e.target.value) }}
                        onBlur={normalizeTotalDiscount}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        placeholder="0.00"
                        disabled={cart.items.length === 0 || subtotal <= 0}
                        className="text-right tabular-nums w-52 h-12 text-xl font-semibold bg-red-50 border-red-300 text-red-600 focus-visible:border-red-400 focus-visible:ring-red-200"
                      />
                    </div>
                  </div>

                  {/* Section 2 — Net total */}
                  <div className={`rounded-xl px-5 py-4 border ${netNegative
                    ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                    : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200'}`}>
                    <div className="text-sm text-slate-600 font-semibold mb-1">เป็นเงินทั้งสิ้น</div>
                    <div className={`text-5xl font-extrabold text-right leading-none tabular-nums ${netNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(net)}
                    </div>
                  </div>

                  {/* Single-line breakdown + toggle */}
                  <div className="flex items-center justify-between gap-3 text-sm">
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
                        <span><span className="text-muted-foreground">กำไร</span> <span className={`font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>฿{formatCurrency(profit)}</span></span>
                        <span className="text-muted-foreground">•</span>
                        <span><span className="text-muted-foreground">% กำไร</span> <span className={`font-semibold ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{margin.toFixed(2)}%</span></span>
                      </div>
                    ) : <span />}
                  </div>

                  {/* Cash input */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-base font-medium">
                      <Banknote className="h-5 w-5 text-green-500" /> รับเงินมา
                    </label>
                    <Input
                      type="number"
                      value={cashAmount}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => setCashAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCompleteSale() }}
                      placeholder="0.00"
                      className="text-right text-3xl font-bold tabular-nums h-16"
                      autoFocus
                    />
                  </div>

                  {/* Change */}
                  <div className={`rounded-xl px-5 py-4 ${needsCheck ? 'bg-red-50 border border-red-200' : 'bg-muted'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold">เงินทอน</span>
                      {needsCheck ? (
                        <span className="flex items-center gap-2 text-3xl font-extrabold text-red-600 tracking-wider">
                          <AlertTriangle className="h-7 w-7" />
                          กรุณาตรวจสอบ
                        </span>
                      ) : (
                        <span className="text-3xl font-extrabold tabular-nums text-green-600">
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
            <Button variant="outline" onClick={() => setShowPayment(false)}>ยกเลิก</Button>
            <Button variant="success" disabled={saving || change < 0 || pendingNet < 0} onClick={handleCompleteSale} className="min-w-[120px]">
              {saving ? 'กำลังบันทึก...' : '✓ บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent size="sm" onClose={() => setShowSuccess(false)}>
          <DialogBody className="text-center py-8 space-y-4">
            <div className="text-6xl">✅</div>
            <div><div className="text-lg font-semibold">บันทึกบิลสำเร็จ</div>
              <div className="text-muted-foreground text-sm mt-1">{lastInvoice}</div></div>
            <Button onClick={() => setShowSuccess(false)} className="w-full">เปิดบิลใหม่</Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ── UNIT MODAL ── */}
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
          <InlineModal
            title={`เลือกหน่วย — ${item?.item_name}`}
            onClose={() => setUnitModalIdx(null)}
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
                <Button variant="outline" onClick={() => setUnitModalIdx(null)}>ปิด</Button>
              </div>
            }
          >
            <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
              {allUnits.map(u => {
                const active = item?.unit_name === u.unit_name
                return (
                  <button key={u.id}
                    onClick={() => changeCartUnit(unitModalIdx, u)}
                    className={`w-full px-4 py-3 rounded-xl text-left transition-colors border ${active ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-emerald-300'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{u.unit_name}</span>
                      {u.id === -1 && <span className="text-[15px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">หลัก</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </InlineModal>
        )
      })()}

      {/* ── PRICE MODAL ── */}
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
          <InlineModal
            title={`ราคา — ${item?.item_name}`}
            onClose={() => setPriceModalIdx(null)}
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
                <Button variant="outline" onClick={() => setPriceModalIdx(null)}>ปิด</Button>
              </div>
            }
          >
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                {/* Custom price input */}
                <div className="w-full px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-m font-bold text-emerald-700">กำหนดราคา</span>
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
                      className="w-full flex-1 h-10 text-right text-lg font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none px-3 tabular-nums"
                    />
                    <Button onClick={applyCustomPrice} disabled={customPrice <= 0} className="h-11 px-4">ตกลง</Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-400">ทุน</div>
                      <div className="font-semibold text-slate-600 tabular-nums">฿{formatCurrency(cost)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">กำไร</div>
                      <div className={`font-semibold tabular-nums ${customProfit > 0 ? 'text-green-600' : 'text-red-500'}`}>฿{formatCurrency(customProfit)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">% ทุน</div>
                      <div className={`font-semibold tabular-nums ${customProfit > 0 ? 'text-green-600' : 'text-red-500'}`}>{cost > 0 ? customMarkupPct.toFixed(1) : '0.0'}%</div>
                    </div>
                  </div>
                </div>

                {priceOptions.map((opt, i) => {
                  const active = item?.unit_price === opt.price
                  const profit = opt.price - cost
                  const markupPct = cost > 0 ? (profit / cost) * 100 : 0
                  return (
                    <button key={i}
                      onClick={() => changeCartPrice(priceModalIdx, opt.price)}
                      className={`w-full px-4 py-3 rounded-xl text-left transition-colors border ${active ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-emerald-300'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-bold ${active ? 'text-emerald-700' : 'text-slate-700'}`}>{opt.label}</span>
                        <span className="text-base font-extrabold text-emerald-600 tabular-nums">฿{formatCurrency(opt.price)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-slate-400">ทุน</div>
                          <div className="font-semibold text-slate-600 tabular-nums">฿{formatCurrency(cost)}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">กำไร</div>
                          <div className={`font-semibold tabular-nums ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>฿{formatCurrency(profit)}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">% ทุน</div>
                          <div className={`font-semibold tabular-nums ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>{cost > 0 ? markupPct.toFixed(1) : '0.0'}%</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
          </InlineModal>
        )
      })()}

      {/* ── QTY MODAL ── */}
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
          <InlineModal
            title={`จำนวน — ${item?.item_name}`}
            onClose={() => setQtyModalIdx(null)}
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setQtyModalIdx(null)}>ยกเลิก</Button>
                <Button onClick={() => applyQty(q)}>ตกลง</Button>
              </div>
            }
          >
            <div className="p-5 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">คงเหลือ</span>
                <span className={`font-semibold tabular-nums ${stockQty > 0 ? 'text-slate-700' : 'text-red-500'}`}>{stockQty} {item?.unit_name}</span>
              </div>
              <div>
                <Label className="block text-sm font-bold text-slate-500 mb-1">จำนวน ({item?.unit_name})</Label>
                <div className="flex items-center gap-2">
                  <button onClick={() => bump(-1)}
                    className="w-14 h-14 rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold shrink-0">
                    <Minus className="h-5 w-5" />
                  </button>
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
                    className="w-16 flex-1 h-14 text-center text-2xl font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none px-4 tabular-nums"
                  />
                  <button onClick={() => bump(1)}
                    className="w-14 h-14 rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold shrink-0">
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 5, 10, 20, 50].map(n => (
                  <button key={n} onClick={() => setQtyInput(String(n))}
                    className="h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-emerald-300 text-sm font-semibold text-slate-600 tabular-nums transition-colors">
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </InlineModal>
        )
      })()}

      {/* ── DISCOUNT MODAL ── */}
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
          <InlineModal
            title={`ส่วนลด — ${item?.item_name}`}
            onClose={() => setDiscountModalIdx(null)}
            footer={
              <div className="px-5 py-3 border-t border-slate-200 flex justify-between gap-2">
                <Button variant="outline" onClick={() => { setDiscountInput('0'); applyDiscount(0) }}>ล้าง</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDiscountModalIdx(null)}>ยกเลิก</Button>
                  <Button onClick={() => applyDiscount(d)}>ตกลง</Button>
                </div>
              </div>
            }
          >
            <div className="p-5 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">ราคารวม</span>
                <span className="font-semibold text-slate-700 tabular-nums">฿{formatCurrency(totalPrice)}</span>
              </div>

              {/* Percent presets */}
              <div className="grid grid-cols-5 gap-2">
                {([
                  { pct: 3,  base: 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300',   active: 'bg-red-200 border-red-500 text-red-800 ring-2 ring-red-300' },
                  { pct: 5,  base: 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200 hover:border-red-400',  active: 'bg-red-300 border-red-600 text-red-900 ring-2 ring-red-400' },
                  { pct: 10, base: 'bg-red-200 border-red-400 text-red-800 hover:bg-red-300 hover:border-red-500', active: 'bg-red-400 border-red-700 text-white ring-2 ring-red-500' },
                  { pct: 15, base: 'bg-red-300 border-red-500 text-red-900 hover:bg-red-400 hover:border-red-600', active: 'bg-red-500 border-red-800 text-white ring-2 ring-red-600' },
                  { pct: 20, base: 'bg-red-400 border-red-600 text-white hover:bg-red-500 hover:border-red-700',   active: 'bg-red-600 border-red-900 text-white ring-2 ring-red-700' },
                ] as const).map(({ pct, base, active }) => {
                  const isActive = totalPrice > 0 && Math.abs(d - totalPrice * pct / 100) < 0.01
                  return (
                    <button key={pct} onClick={() => applyPercent(pct)}
                      className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${isActive ? active : base}`}>
                      {pct}%
                    </button>
                  )
                })}
              </div>

              {/* ส่วนลด (%)  +  ส่วนลด (บาท) — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-sm font-bold text-slate-500 mb-1">ส่วนลด (%)</Label>
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
                      className="w-full h-14 text-right text-2xl font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none pl-4 pr-10 tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-bold pointer-events-none">%</span>
                  </div>
                </div>

                <div>
                  <Label className="block text-sm font-bold text-slate-500 mb-1">ส่วนลด (บาท)</Label>
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
                    className="w-full h-14 text-right text-2xl font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none px-4 tabular-nums"
                  />
                </div>
              </div>

              {/* Final price reverse-calc input */}
              <div>
                <Label className="block text-sm font-bold text-slate-500 mb-1">ราคาสุดท้าย (บาท)</Label>
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
                  className="w-full h-14 text-right text-2xl font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none px-4 tabular-nums"
                />
              </div>
            </div>
          </InlineModal>
        )
      })()}
    </div>
  )
}

