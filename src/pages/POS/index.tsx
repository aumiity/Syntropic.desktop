import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCartStore } from '@/stores/cartStore'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductUnit, ProductLot, Customer } from '@/types'
import {
  Search, User, Trash2, Plus, Minus,
  CreditCard, Banknote, Smartphone, AlertTriangle, ChevronDown, X, UserPlus,
} from 'lucide-react'

interface ProductWithDetails extends Product {
  lots: ProductLot[]
  units: ProductUnit[]
}

// Simple inline popover
function Popover({ open, onClose, children, trigger }: {
  open: boolean; onClose: () => void; children: React.ReactNode; trigger: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, onClose])
  return (
    <div className="relative inline-block" ref={ref}>
      {trigger}
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[140px]">
          {children}
        </div>
      )}
    </div>
  )
}

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

  // Customer
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])

  // Quick add customer
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaName, setQaName] = useState('')
  const [qaPhone, setQaPhone] = useState('')
  const [qaNote, setQaNote] = useState('')
  const [qaSaving, setQaSaving] = useState(false)

  // Success
  const [lastInvoice, setLastInvoice] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  // Per-row popovers
  const [openUnitPopover, setOpenUnitPopover] = useState<number | null>(null)
  const [openPricePopover, setOpenPricePopover] = useState<number | null>(null)

  useEffect(() => {
    loadDailyStats()
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Auto-focus modal input when opened
  useEffect(() => {
    if (searchOpen) setTimeout(() => modalInputRef.current?.focus(), 50)
    else setTimeout(() => mainInputRef.current?.focus(), 50)
  }, [searchOpen])

  // Keep highlighted row visible as user navigates with arrow keys
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const refocusSearch = useCallback(() => {
    setTimeout(() => {
      if (showPayment || showCustomerSearch || showQuickAdd || showSuccess) return
      if (searchOpen) modalInputRef.current?.focus()
      else mainInputRef.current?.focus()
    }, 50)
  }, [searchOpen, showPayment, showCustomerSearch, showQuickAdd, showSuccess])

  // Global click listener: any click on non-interactive area returns focus to search
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('input, button, select, textarea, a, [role="button"], [contenteditable="true"]')) return
      if (showPayment || showCustomerSearch || showQuickAdd || showSuccess) return
      if (searchOpen) modalInputRef.current?.focus()
      else mainInputRef.current?.focus()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [searchOpen, showPayment, showCustomerSearch, showQuickAdd, showSuccess])

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
    const price = unit
      ? (cart.saleType === 'wholesale' ? unit.price_wholesale1 : unit.price_retail)
      : (cart.saleType === 'wholesale' ? product.price_wholesale1 : product.price_retail)
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
    else if (e.key === 'Escape') closeSearch()
  }

  const handleSearchCustomer = async (q: string) => {
    setCustomerQuery(q)
    if (!q.trim()) { setCustomerResults([]); return }
    const data = await window.api.pos.searchCustomers(q)
    setCustomerResults(data as Customer[])
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

  const totalPaid = (parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(transferAmount) || 0)
  const change = totalPaid - cart.totalAmount()

  const handleCompleteSale = async () => {
    if (cart.items.length === 0) { toast('กรุณาเพิ่มสินค้าในตะกร้า', 'error'); return }
    setSaving(true)
    try {
      const result = await window.api.pos.saveBill({
        sale_type: cart.saleType, customer_id: cart.customer?.id ?? null, customer_name_free: cart.customerNameFree,
        items: cart.items.map(i => ({ product_id: i.product_id, item_name: i.item_name, unit_name: i.unit_name, qty: i.qty, unit_price: i.unit_price, discount: i.discount, line_total: i.line_total, item_note: i.item_note })),
        subtotal: cart.subtotal(), total_discount: cart.totalDiscount(), total_amount: cart.totalAmount(),
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
    const item = cart.items[idx]
    const price = cart.saleType === 'wholesale' ? unit.price_wholesale1 : unit.price_retail
    cart.updateItem(idx, { unit_name: unit.unit_name, unit_price: price, selectedUnit: unit, line_total: (price - (item.discount || 0)) * item.qty })
    setOpenUnitPopover(null)
    refocusSearch()
  }

  const changeCartPrice = (idx: number, price: number) => {
    const item = cart.items[idx]
    cart.updateItem(idx, { unit_price: price, line_total: (price - (item.discount || 0)) * item.qty })
    setOpenPricePopover(null)
    refocusSearch()
  }

  const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex flex-col h-full p-3 gap-3">

      {/* ── TOP ROW ── */}
      <div className="flex gap-3 shrink-0">
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">

          {/* Gradient banner */}
          <div className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 text-white shadow-md flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold leading-tight">Syntropic RX</h1>
              <p className="text-xs opacity-80">หน้าจอขายสินค้า</p>
            </div>
            <div className="text-right text-xs opacity-90 leading-relaxed">
              <div>วันที่: <span className="font-semibold">{dateStr}</span></div>
              <div>เวลา: <span className="font-semibold tabular-nums">{timeStr}</span></div>
            </div>
          </div>

          {/* Search input + controls */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-500 pointer-events-none" />
              <input
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
                <button key={t} onClick={() => cart.setSaleType(t)}
                  className={`px-4 font-bold text-sm transition-colors ${cart.saleType === t ? 'bg-emerald-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
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
              <button onClick={() => cart.setCustomer(null)}
                className="h-[52px] w-[52px] bg-white border border-slate-300 rounded-xl flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors shadow-sm shrink-0 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            )}

            <button onClick={() => setShowQuickAdd(true)}
              className="h-[52px] w-[52px] bg-white border border-slate-300 rounded-xl flex flex-col items-center justify-center hover:bg-slate-50 transition-colors shadow-sm shrink-0 text-slate-500 gap-0.5">
              <UserPlus className="h-5 w-5" />
              <span className="text-[10px] leading-none">เพิ่มลูกค้า</span>
            </button>
          </div>
        </div>

        {/* Grand total */}
        <div className="w-64 bg-white rounded-xl shadow-sm border-2 border-emerald-50 p-5 flex flex-col justify-center shrink-0">
          <div className="text-right text-sm font-bold text-slate-500 mb-1">ยอดสุทธิ</div>
          <div className="text-right text-5xl font-extrabold text-emerald-600 leading-none tabular-nums">
            {formatCurrency(cart.totalAmount())}
          </div>
          {cart.totalDiscount() > 0 && (
            <div className="text-right text-xs text-muted-foreground mt-2">ส่วนลด ฿{formatCurrency(cart.totalDiscount())}</div>
          )}
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Cart table */}
        <div className="flex-1 flex flex-col gap-2.5 min-h-0">
          {cart.customer?.is_alert && cart.customer.alert_note && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600 flex items-center gap-2 font-medium shrink-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />{cart.customer.alert_note}
            </div>
          )}

          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-0">
            {/* Table header */}
            <div className="grid px-3 py-3 bg-slate-100 text-slate-600 text-xs font-bold border-b border-slate-200 shrink-0"
              style={{ gridTemplateColumns: '36px 1fr 100px 110px 100px 80px 100px 40px' }}>
              <div className="text-center">#</div>
              <div>รายการสินค้า</div>
              <div className="text-center">หน่วย</div>
              <div className="text-center">จำนวน</div>
              <div className="text-right">ราคา/หน่วย</div>
              <div className="text-right">ส่วนลด</div>
              <div className="text-right">รวมเงิน</div>
              <div />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {cart.items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                  <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-lg font-medium">ยังไม่มีรายการสั่งซื้อ</p>
                  <p className="text-sm">คลิกช่องค้นหาหรือสแกนบาร์โค้ด</p>
                </div>
              ) : cart.items.map((item, idx) => {
                const product = item.product as ProductWithDetails | undefined
                const units = product?.units ?? []
                const priceOptions = product ? [
                  { label: 'ราคาปลีก', price: item.selectedUnit ? item.selectedUnit.price_retail : product.price_retail },
                  ...(product.has_wholesale1 || product.price_wholesale1 > 0 ? [{ label: 'ราคาส่ง 1', price: item.selectedUnit ? item.selectedUnit.price_wholesale1 : product.price_wholesale1 }] : []),
                  ...(product.has_wholesale2 || product.price_wholesale2 > 0 ? [{ label: 'ราคาส่ง 2', price: item.selectedUnit ? item.selectedUnit.price_wholesale2 : product.price_wholesale2 }] : []),
                ] : []

                return (
                  <div key={idx}
                    className="grid px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors items-center"
                    style={{ gridTemplateColumns: '36px 1fr 100px 110px 100px 80px 100px 40px' }}>

                    <div className="text-center text-xs text-muted-foreground">{idx + 1}</div>

                    <div className="min-w-0 pr-2">
                      <div className="font-medium truncate text-sm">{item.item_name}</div>
                      <div className="text-xs text-muted-foreground">{cart.saleType === 'wholesale' ? 'ขายส่ง' : 'ขายปลีก'}</div>
                    </div>

                    {/* Unit selector */}
                    <div className="flex justify-center">
                      {units.length > 1 ? (
                        <Popover
                          open={openUnitPopover === idx}
                          onClose={() => setOpenUnitPopover(null)}
                          trigger={
                            <button onClick={() => setOpenUnitPopover(openUnitPopover === idx ? null : idx)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 hover:border-emerald-400 text-xs font-medium text-slate-700 transition-colors">
                              {item.unit_name}
                              <ChevronDown className="h-3 w-3 text-slate-400" />
                            </button>
                          }
                        >
                          {units.map(u => (
                            <button key={u.id} onClick={() => changeCartUnit(idx, u)}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 transition-colors ${item.unit_name === u.unit_name ? 'bg-emerald-50 text-emerald-700 font-semibold' : ''}`}>
                              {u.unit_name}
                            </button>
                          ))}
                        </Popover>
                      ) : (
                        <span className="text-xs text-slate-600">{item.unit_name}</span>
                      )}
                    </div>

                    {/* Qty */}
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => cart.updateItem(idx, { qty: Math.max(1, item.qty - 1) })}
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200">
                        <Minus className="h-3 w-3" />
                      </button>
                      <input type="number" value={item.qty} min={1}
                        onChange={e => cart.updateItem(idx, { qty: parseFloat(e.target.value) || 1 })}
                        className="w-12 h-8 text-center text-sm bg-white border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none" />
                      <button onClick={() => cart.updateItem(idx, { qty: item.qty + 1 })}
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Price selector */}
                    <div className="flex justify-end">
                      {priceOptions.length > 1 ? (
                        <Popover
                          open={openPricePopover === idx}
                          onClose={() => setOpenPricePopover(null)}
                          trigger={
                            <button onClick={() => setOpenPricePopover(openPricePopover === idx ? null : idx)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 hover:border-emerald-400 text-sm font-medium text-emerald-700 transition-colors">
                              ฿{formatCurrency(item.unit_price)}
                              <ChevronDown className="h-3 w-3 text-slate-400" />
                            </button>
                          }
                        >
                          {priceOptions.map((opt, i) => (
                            <button key={i} onClick={() => changeCartPrice(idx, opt.price)}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 transition-colors ${item.unit_price === opt.price ? 'bg-emerald-50 text-emerald-700 font-semibold' : ''}`}>
                              <div className="font-medium">{opt.label}</div>
                              <div className="text-emerald-600">฿{formatCurrency(opt.price)}</div>
                            </button>
                          ))}
                        </Popover>
                      ) : (
                        <span className="text-sm font-medium">฿{formatCurrency(item.unit_price)}</span>
                      )}
                    </div>

                    {/* Discount */}
                    <div className="flex justify-end">
                      <input type="number" value={item.discount || ''} min={0}
                        onChange={e => { const d = parseFloat(e.target.value) || 0; cart.updateItem(idx, { discount: d, line_total: (item.unit_price - d) * item.qty }) }}
                        placeholder="0"
                        className="w-16 h-8 text-right text-sm bg-white border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none px-1" />
                    </div>

                    <div className="text-right font-semibold text-emerald-700 text-sm">฿{formatCurrency(item.line_total)}</div>

                    <div className="flex justify-center">
                      <button onClick={() => cart.removeItem(idx)}
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {cart.items.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-2.5 bg-slate-50 shrink-0 flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">ราคารวม: <span className="font-semibold text-foreground">฿{formatCurrency(cart.subtotal())}</span></span>
                {cart.totalDiscount() > 0 && (
                  <span className="text-muted-foreground">ส่วนลด: <span className="font-semibold text-red-500">-฿{formatCurrency(cart.totalDiscount())}</span></span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right action panel */}
        <div className="w-64 shrink-0 flex flex-col gap-2.5">
          <button disabled={cart.items.length === 0}
            onClick={() => { setCashAmount(cart.totalAmount().toFixed(2)); setShowPayment(true) }}
            className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-2xl shadow-md transition-all flex flex-col items-center justify-center gap-1 min-h-[120px]">
            <span>รับชำระเงิน</span>
            <span className="text-sm bg-black/10 px-3 py-0.5 rounded-md font-medium">F9</span>
          </button>
          <button onClick={() => (window.api.printer as any)?.openCashDrawer?.()}
            className="w-full py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-600 font-medium border border-slate-300 transition-colors shadow-sm text-sm">
            เปิดลิ้นชัก
          </button>
          <button disabled={cart.items.length === 0} onClick={cart.clearCart}
            className="w-full py-3 rounded-xl bg-white hover:bg-red-50 text-slate-600 hover:text-red-500 font-medium border border-slate-300 hover:border-red-200 transition-colors shadow-sm text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            <Trash2 className="h-4 w-4" /> ยกเลิกบิล
          </button>

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
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) closeSearch() }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            style={{ width: '600px', height: '480px' }}
            onMouseDown={e => e.stopPropagation()}>

            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
              <Search className="h-5 w-5 text-emerald-500 shrink-0" />
              <input
                ref={modalInputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={handleModalKeyDown}
                placeholder="ค้นหารหัส, ชื่อยา หรือสแกนบาร์โค้ด..."
                className="flex-1 text-base outline-none bg-transparent"
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
              style={{ gridTemplateColumns: '1fr 80px 100px 70px' }}>
              <div>ชื่อสินค้า</div>
              <div className="text-center">หน่วย</div>
              <div className="text-right">ราคาขาย</div>
              <div className="text-right">คงเหลือ</div>
            </div>

            {/* Results — flex-1, scrolls internally, empty space stays empty */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
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
                  const price = it.unit
                    ? (cart.saleType === 'wholesale' ? it.unit.price_wholesale1 : it.unit.price_retail)
                    : (cart.saleType === 'wholesale' ? it.product.price_wholesale1 : it.product.price_retail)
                  const unitName = it.unit?.unit_name ?? it.product.unit_name ?? '-'
                  const active = i === highlightIdx
                  const expiryWarn = it.product.lots?.some(l => getExpiryStatus(l.expiry_date) !== 'normal')
                  return (
                    <div
                      key={`${it.product.id}-${it.unit?.id ?? 'base'}`}
                      ref={active ? activeRowRef : undefined}
                      onClick={() => handleSelectItem(it.product, it.unit)}
                      className={`grid items-center px-4 py-2.5 cursor-pointer border-b border-slate-100 transition-colors ${active ? 'bg-emerald-100' : 'hover:bg-emerald-50'}`}
                      style={{ gridTemplateColumns: '1fr 80px 100px 70px' }}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                          {expiryWarn && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          <span className="truncate">{it.product.trade_name}</span>
                          {stock === 0 && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium shrink-0">หมด</span>}
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

      <Dialog open={showCustomerSearch} onOpenChange={setShowCustomerSearch}>
        <DialogContent size="md" onClose={() => setShowCustomerSearch(false)}>
          <DialogHeader><DialogTitle>เลือกลูกค้า</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <Input autoFocus placeholder="ชื่อ, เบอร์โทร, รหัส, HN..." value={customerQuery} onChange={e => handleSearchCustomer(e.target.value)} />
            <button onClick={() => { cart.setCustomer(null); setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]) }}
              className="w-full px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-emerald-600 font-medium text-left transition-colors text-sm">
              👤 ลูกค้าทั่วไป (เงินสด)
            </button>
            <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
              {customerResults.map(c => (
                <button key={c.id} onClick={() => { cart.setCustomer(c); setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]) }}
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
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setShowCustomerSearch(false)}>ปิด</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent size="sm" onClose={() => setShowQuickAdd(false)}>
          <DialogHeader><DialogTitle>เพิ่มลูกค้าใหม่</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div><label className="block text-sm font-medium mb-1">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
              <Input autoFocus value={qaName} onChange={e => setQaName(e.target.value)} placeholder="ชื่อ-นามสกุล" /></div>
            <div><label className="block text-sm font-medium mb-1">เบอร์โทรศัพท์</label>
              <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="เบอร์โทร" /></div>
            <div><label className="block text-sm font-medium mb-1">หมายเหตุ / ประวัติแพ้ยา</label>
              <Input value={qaNote} onChange={e => setQaNote(e.target.value)} placeholder="ถ้ามี" /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickAdd(false)}>ยกเลิก</Button>
            <Button onClick={handleQuickAdd} disabled={qaSaving}>{qaSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent size="sm" onClose={() => setShowPayment(false)}>
          <DialogHeader><DialogTitle>ชำระเงิน</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl px-5 py-4 border border-emerald-200">
              <div className="text-sm text-slate-600 font-semibold mb-1">ยอดสุทธิ</div>
              <div className="text-5xl font-extrabold text-emerald-600 text-right leading-none tabular-nums">{formatCurrency(cart.totalAmount())}</div>
            </div>
            <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Banknote className="h-4 w-4 text-green-500" /> เงินสด</label>
              <Input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" className="text-right text-lg" /></div>
            <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><CreditCard className="h-4 w-4 text-blue-500" /> บัตรเครดิต/เดบิต</label>
              <Input type="number" value={cardAmount} onChange={e => setCardAmount(e.target.value)} placeholder="0.00" className="text-right" /></div>
            <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4 text-purple-500" /> โอนเงิน</label>
              <Input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0.00" className="text-right" /></div>
            <div className="rounded-xl bg-muted p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>รับเงินรวม</span>
                <span className={totalPaid >= cart.totalAmount() ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}>฿{formatCurrency(totalPaid)}</span></div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5"><span>เงินทอน</span>
                <span className={change >= 0 ? 'text-green-500' : 'text-red-500'}>฿{formatCurrency(Math.max(0, change))}</span></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>ยกเลิก</Button>
            <Button variant="success" disabled={saving || totalPaid < cart.totalAmount()} onClick={handleCompleteSale} className="min-w-[120px]">
              {saving ? 'กำลังบันทึก...' : '✓ บันทึกบิล'}
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
    </div>
  )
}
