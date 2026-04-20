import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCartStore } from '@/stores/cartStore'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductUnit, ProductLot, Customer } from '@/types'
import {
  Search, UserPlus, User, ShoppingCart, Trash2, Plus, Minus,
  CreditCard, Banknote, Smartphone, Receipt, AlertTriangle,
} from 'lucide-react'

interface ProductWithDetails extends Product {
  lots: ProductLot[]
  units: ProductUnit[]
}

export default function POSPage() {
  const { toast } = useToast()
  const cart = useCartStore()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductWithDetails[]>([])
  const [searching, setSearching] = useState(false)
  const [dailyStats, setDailyStats] = useState({ bills: 0, total: 0, latest: '' })

  // Payment dialog
  const [showPayment, setShowPayment] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [saving, setSaving] = useState(false)

  // Customer search dialog
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])

  // Success dialog
  const [lastInvoice, setLastInvoice] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDailyStats()
    searchRef.current?.focus()
  }, [])

  const loadDailyStats = async () => {
    const stats = await window.api.pos.getDailyStats() as any
    setDailyStats({ bills: stats?.bills ?? 0, total: stats?.total ?? 0, latest: stats?.latest ?? '' })
  }

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const data = await window.api.pos.searchProducts(q)
      setResults(data as ProductWithDetails[])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleAddToCart = (product: ProductWithDetails, unit?: ProductUnit) => {
    const selectedUnit = unit ?? product.units?.[0]
    const price = selectedUnit
      ? (cart.saleType === 'wholesale' ? selectedUnit.price_wholesale1 : selectedUnit.price_retail)
      : (cart.saleType === 'wholesale' ? product.price_wholesale1 : product.price_retail)
    const unitName = selectedUnit?.unit_name ?? 'ชิ้น'

    cart.addItem({
      product_id: product.id,
      item_name: product.trade_name,
      unit_name: unitName,
      qty: 1,
      unit_price: price,
      discount: 0,
      line_total: price,
      product,
      selectedUnit,
    })
    setQuery('')
    setResults([])
    searchRef.current?.focus()
  }

  const handleSearchCustomer = async (q: string) => {
    setCustomerQuery(q)
    if (!q.trim()) { setCustomerResults([]); return }
    const data = await window.api.pos.searchCustomers(q)
    setCustomerResults(data as Customer[])
  }

  const totalPaid = (parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(transferAmount) || 0)
  const change = totalPaid - cart.totalAmount()

  const handleCompleteSale = async () => {
    if (cart.items.length === 0) { toast('กรุณาเพิ่มสินค้าในตะกร้า', 'error'); return }
    setSaving(true)
    try {
      const result = await window.api.pos.saveBill({
        sale_type: cart.saleType,
        customer_id: cart.customer?.id ?? null,
        customer_name_free: cart.customerNameFree,
        items: cart.items.map(i => ({
          product_id: i.product_id,
          item_name: i.item_name,
          unit_name: i.unit_name,
          qty: i.qty,
          unit_price: i.unit_price,
          discount: i.discount,
          line_total: i.line_total,
          item_note: i.item_note,
        })),
        subtotal: cart.subtotal(),
        total_discount: cart.totalDiscount(),
        total_amount: cart.totalAmount(),
        cash_amount: parseFloat(cashAmount) || 0,
        card_amount: parseFloat(cardAmount) || 0,
        transfer_amount: parseFloat(transferAmount) || 0,
        change_amount: Math.max(0, change),
        symptom_note: cart.symptomNote,
        age_range: cart.ageRange,
        sold_by: 1,
      }) as any

      setLastInvoice(result.invoice_no)
      setDailyStats({ bills: result.daily_bills, total: result.daily_total, latest: result.latest_bill_time })
      cart.clearCart()
      setShowPayment(false)
      setShowSuccess(true)
      setCashAmount(''); setCardAmount(''); setTransferAmount('')
      searchRef.current?.focus()
    } catch (err: any) {
      toast(err.message ?? 'เกิดข้อผิดพลาด', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Left: search + results */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-4">
        {/* Stats bar */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>บิลวันนี้: <strong className="text-foreground">{dailyStats.bills}</strong> บิล</span>
          <span>ยอดรวม: <strong className="text-green-500">฿{formatCurrency(dailyStats.total)}</strong></span>
          {dailyStats.latest && <span className="ml-auto">บิลล่าสุด: {dailyStats.latest.slice(11, 16)}</span>}
        </div>

        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="ค้นหาสินค้า: ชื่อ, บาร์โค้ด, รหัส..."
            className="pl-9 h-12 text-base"
            autoFocus
          />
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
            {results.map(product => {
              const totalStock = product.lots?.reduce((s, l) => s + l.qty_on_hand, 0) ?? 0
              return (
                <div key={product.id} className="border border-border rounded-lg p-3 bg-card hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{product.trade_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.code && <span className="mr-2">{product.code}</span>}
                        {product.category_name && <span className="mr-2">{product.category_name}</span>}
                        <span>คงเหลือ: {totalStock} {product.unit_name}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-primary">฿{formatCurrency(product.price_retail)}</div>
                    </div>
                  </div>

                  {/* Lot expiry warnings */}
                  {product.lots?.slice(0, 2).map(lot => {
                    const status = getExpiryStatus(lot.expiry_date)
                    if (status === 'normal') return null
                    return (
                      <div key={lot.id} className="text-xs flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Lot {lot.lot_number}: {formatExpiry(lot.expiry_date)}</span>
                      </div>
                    )
                  })}

                  {/* Unit buttons */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {product.units?.length > 0 ? (
                      product.units.map(unit => (
                        <Button
                          key={unit.id}
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddToCart(product, unit)}
                          className="text-xs h-8"
                        >
                          <Plus className="h-3 w-3" />
                          {unit.unit_name} ({unit.qty_per_base > 1 ? `${unit.qty_per_base}x` : ''})
                          ฿{formatCurrency(unit.price_retail)}
                        </Button>
                      ))
                    ) : (
                      <Button size="sm" onClick={() => handleAddToCart(product)} className="text-xs h-8">
                        <Plus className="h-3 w-3" /> เพิ่ม
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {query && !searching && results.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            ไม่พบสินค้า "{query}"
          </div>
        )}

        {!query && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mx-auto mb-3 opacity-20" />
              <p>สแกนบาร์โค้ดหรือพิมพ์ชื่อสินค้า</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="flex flex-col w-[380px] border-l border-border bg-card">
        {/* Customer */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="flex-1 justify-start text-xs" onClick={() => setShowCustomerSearch(true)}>
              <User className="h-3.5 w-3.5" />
              {cart.customer ? (
                <span className="truncate">
                  {cart.customer.is_alert ? <AlertTriangle className="h-3 w-3 text-red-500 inline mr-1" /> : null}
                  {cart.customer.full_name}
                </span>
              ) : (
                <span className="text-muted-foreground">เลือกลูกค้า (ลูกค้าทั่วไป)</span>
              )}
            </Button>
            {cart.customer && (
              <Button size="icon-sm" variant="ghost" onClick={() => cart.setCustomer(null)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {cart.customer?.is_alert && cart.customer.alert_note && (
            <div className="mt-1.5 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded px-2 py-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {cart.customer.alert_note}
            </div>
          )}
        </div>

        {/* Sale type */}
        <div className="flex p-2 gap-1 border-b border-border">
          {['retail', 'wholesale', 'rx'].map(t => (
            <button
              key={t}
              onClick={() => cart.setSaleType(t)}
              className={`flex-1 rounded text-xs py-1.5 font-medium transition-colors ${cart.saleType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              {t === 'retail' ? 'ขายปลีก' : t === 'wholesale' ? 'ขายส่ง' : 'ใบสั่งยา'}
            </button>
          ))}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          {cart.items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">ยังไม่มีสินค้า</div>
          ) : (
            cart.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 group">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.item_name}</div>
                  <div className="text-xs text-muted-foreground">{item.unit_name} · ฿{formatCurrency(item.unit_price)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => cart.updateItem(idx, { qty: Math.max(1, item.qty - 1) })}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <input
                    type="number"
                    value={item.qty}
                    min={1}
                    onChange={e => cart.updateItem(idx, { qty: parseFloat(e.target.value) || 1 })}
                    className="w-12 h-7 text-center text-sm bg-background border border-border rounded"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => cart.updateItem(idx, { qty: item.qty + 1 })}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-sm font-semibold w-16 text-right">฿{formatCurrency(item.line_total)}</div>
                <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => cart.removeItem(idx)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-border p-3 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>ยอดรวม</span>
            <span>฿{formatCurrency(cart.subtotal())}</span>
          </div>
          {cart.totalDiscount() > 0 && (
            <div className="flex justify-between text-destructive">
              <span>ส่วนลด</span>
              <span>-฿{formatCurrency(cart.totalDiscount())}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
            <span>รวมทั้งสิ้น</span>
            <span className="text-primary">฿{formatCurrency(cart.totalAmount())}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={cart.clearCart}>
            <Trash2 className="h-4 w-4" /> ล้าง
          </Button>
          <Button
            className="flex-2 flex-1"
            size="lg"
            disabled={cart.items.length === 0}
            onClick={() => {
              setCashAmount(cart.totalAmount().toFixed(2))
              setShowPayment(true)
            }}
          >
            <Receipt className="h-4 w-4" /> ชำระเงิน
          </Button>
        </div>
      </div>

      {/* Customer search dialog */}
      <Dialog open={showCustomerSearch} onOpenChange={setShowCustomerSearch}>
        <DialogContent size="md" onClose={() => setShowCustomerSearch(false)}>
          <DialogHeader><DialogTitle>ค้นหาลูกค้า</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <Input
              autoFocus
              placeholder="ชื่อ, เบอร์โทร, รหัส, HN..."
              value={customerQuery}
              onChange={e => handleSearchCustomer(e.target.value)}
            />
            <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin">
              {customerResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => { cart.setCustomer(c); setShowCustomerSearch(false); setCustomerQuery(''); setCustomerResults([]) }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-md hover:bg-muted text-left transition-colors"
                >
                  <User className="h-8 w-8 p-1.5 bg-muted rounded-full text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {c.is_alert ? <AlertTriangle className="h-3 w-3 text-red-500" /> : null}
                      {c.full_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.code} {c.phone ? `· ${c.phone}` : ''}</div>
                  </div>
                </button>
              ))}
              {customerQuery && customerResults.length === 0 && (
                <div className="text-sm text-center text-muted-foreground py-4">ไม่พบลูกค้า</div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerSearch(false)}>ยกเลิก</Button>
            <Button variant="secondary" onClick={() => { cart.setCustomer(null); setShowCustomerSearch(false) }}>
              <UserPlus className="h-4 w-4" /> ลูกค้าทั่วไป
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent size="sm" onClose={() => setShowPayment(false)}>
          <DialogHeader><DialogTitle>ชำระเงิน</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="text-center">
              <div className="text-muted-foreground text-sm">ยอดที่ต้องชำระ</div>
              <div className="text-3xl font-bold text-primary">฿{formatCurrency(cart.totalAmount())}</div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Banknote className="h-4 w-4 text-green-500" /> เงินสด
              </label>
              <Input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                placeholder="0.00" className="text-right text-lg" />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4 text-blue-500" /> บัตรเครดิต/เดบิต
              </label>
              <Input type="number" value={cardAmount} onChange={e => setCardAmount(e.target.value)}
                placeholder="0.00" className="text-right" />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Smartphone className="h-4 w-4 text-purple-500" /> โอนเงิน
              </label>
              <Input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                placeholder="0.00" className="text-right" />
            </div>

            <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>รับเงินรวม</span>
                <span className={totalPaid >= cart.totalAmount() ? 'text-green-500' : 'text-red-500'}>
                  ฿{formatCurrency(totalPaid)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>เงินทอน</span>
                <span className={change >= 0 ? 'text-green-500' : 'text-red-500'}>
                  ฿{formatCurrency(Math.max(0, change))}
                </span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>ยกเลิก</Button>
            <Button
              variant="success"
              disabled={saving || totalPaid < cart.totalAmount()}
              onClick={handleCompleteSale}
              className="min-w-[120px]"
            >
              {saving ? 'กำลังบันทึก...' : '✓ บันทึกบิล'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent size="sm" onClose={() => setShowSuccess(false)}>
          <DialogBody className="text-center py-8 space-y-4">
            <div className="text-6xl">✅</div>
            <div>
              <div className="text-lg font-semibold">บันทึกบิลสำเร็จ</div>
              <div className="text-muted-foreground text-sm mt-1">{lastInvoice}</div>
            </div>
            <Button onClick={() => setShowSuccess(false)} className="w-full">เปิดบิลใหม่</Button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
