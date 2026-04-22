import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { formatCurrency, formatDate, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Supplier, ProductLot } from '@/types'
import { Search, Plus, Trash2, Package, ChevronDown, CheckCircle } from 'lucide-react'

interface ReceiptRow {
  product_id: number
  trade_name: string
  product_code: string
  lot_number: string
  manufactured_date: string
  expiry_date: string
  cost_price: string
  sell_price: string
  qty: string
  note: string
}

const emptyRow = (): ReceiptRow => ({
  product_id: 0,
  trade_name: '',
  product_code: '',
  lot_number: '',
  manufactured_date: '',
  expiry_date: '',
  cost_price: '',
  sell_price: '',
  qty: '',
  note: '',
})

interface HistoryRow {
  invoice_no: string
  created_at: string
  payment_type: string
  is_paid: number
  due_date?: string
  supplier_name?: string
  item_count: number
  total_cost: number
}

interface ReceiptDetail extends ProductLot {
  trade_name: string
  product_code: string
  supplier_name: string
}

interface ProductSuggestion {
  id: number
  trade_name: string
  code?: string
  unit_name?: string
}

export default function PurchasePage() {
  const { toast } = useToast()
  const today = new Date().toISOString().slice(0, 10)

  // --- Form state ---
  const [invoiceNo, setInvoiceNo] = useState('')
  const [supplierId, setSupplierId] = useState<number>(0)
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [receiveDate, setReceiveDate] = useState(today)
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash')
  const [dueDate, setDueDate] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [paidDate, setPaidDate] = useState('')
  const [rows, setRows] = useState<ReceiptRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [savedInvoice, setSavedInvoice] = useState('')

  // --- Suppliers ---
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // --- Product search per row ---
  const [searchQueries, setSearchQueries] = useState<string[]>([''])
  const [suggestions, setSuggestions] = useState<ProductSuggestion[][]>([[]])
  const [activeSuggRow, setActiveSuggRow] = useState<number | null>(null)
  const searchTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null])

  // --- History ---
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [histTotal, setHistTotal] = useState(0)
  const [histPage, setHistPage] = useState(1)
  const [histQ, setHistQ] = useState('')
  const [histSupplierId, setHistSupplierId] = useState<number>(0)
  const [histDateFrom, setHistDateFrom] = useState('')
  const [histDateTo, setHistDateTo] = useState('')
  const [loadingHist, setLoadingHist] = useState(false)

  // --- Receipt detail modal ---
  const [receiptModal, setReceiptModal] = useState(false)
  const [receiptItems, setReceiptItems] = useState<ReceiptDetail[]>([])
  const [receiptInvoice, setReceiptInvoice] = useState('')

  useEffect(() => {
    loadNextGR()
    loadSuppliers()
    loadHistory()
  }, [])

  const loadNextGR = async () => {
    const no = await window.api.purchase.nextGRNumber()
    setInvoiceNo(no as string)
  }

  const loadSuppliers = async () => {
    const data = await window.api.people.allSuppliers()
    setSuppliers(data as Supplier[])
  }

  const loadHistory = useCallback(async (page = 1) => {
    setLoadingHist(true)
    try {
      const res = await window.api.purchase.history({
        q: histQ || undefined,
        supplier_id: histSupplierId || undefined,
        date_from: histDateFrom || undefined,
        date_to: histDateTo || undefined,
        page,
      }) as any
      setHistory(res.rows)
      setHistTotal(res.total)
      setHistPage(page)
    } finally {
      setLoadingHist(false)
    }
  }, [histQ, histSupplierId, histDateFrom, histDateTo])

  // --- Row management ---
  const addRow = () => {
    setRows(r => [...r, emptyRow()])
    setSearchQueries(q => [...q, ''])
    setSuggestions(s => [...s, []])
    searchTimers.current.push(null)
  }

  const removeRow = (i: number) => {
    setRows(r => r.filter((_, idx) => idx !== i))
    setSearchQueries(q => q.filter((_, idx) => idx !== i))
    setSuggestions(s => s.filter((_, idx) => idx !== i))
    searchTimers.current = searchTimers.current.filter((_, idx) => idx !== i)
  }

  const updateRow = (i: number, field: keyof ReceiptRow, value: string | number) => {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  // --- Product search ---
  const handleProductSearch = (i: number, q: string) => {
    setSearchQueries(prev => prev.map((v, idx) => idx === i ? q : v))
    setActiveSuggRow(i)
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
    }, 220)
  }

  const selectProduct = (i: number, p: ProductSuggestion) => {
    updateRow(i, 'product_id', p.id)
    updateRow(i, 'trade_name', p.trade_name)
    updateRow(i, 'product_code', p.code ?? '')
    setSearchQueries(q => q.map((v, idx) => idx === i ? p.trade_name : v))
    setSuggestions(s => s.map((v, idx) => idx === i ? [] : v))
    setActiveSuggRow(null)
  }

  // --- Totals ---
  const totalCost = rows.reduce((sum, r) => {
    const cost = parseFloat(r.cost_price) || 0
    const qty = parseFloat(r.qty) || 0
    return sum + cost * qty
  }, 0)

  // --- Save ---
  const handleSave = async () => {
    const validRows = rows.filter(r => r.product_id && r.lot_number && r.expiry_date && parseFloat(r.qty) > 0)
    if (!supplierId) { toast({ title: 'กรุณาเลือกผู้จัดจำหน่าย', variant: 'error' }); return }
    if (validRows.length === 0) { toast({ title: 'กรุณาเพิ่มรายการสินค้า', variant: 'error' }); return }
    if (paymentType === 'credit' && !dueDate) { toast({ title: 'กรุณาระบุวันครบกำหนดชำระ', variant: 'error' }); return }

    setSaving(true)
    try {
      await window.api.purchase.save({
        invoice_no: invoiceNo,
        supplier_id: supplierId,
        supplier_invoice_no: supplierInvoiceNo,
        receive_date: receiveDate,
        payment_type: paymentType,
        due_date: dueDate || undefined,
        is_paid: isPaid,
        paid_date: paidDate || undefined,
        userId: 1,
        items: validRows.map(r => ({
          product_id: r.product_id,
          lot_number: r.lot_number,
          manufactured_date: r.manufactured_date || undefined,
          expiry_date: r.expiry_date,
          cost_price: parseFloat(r.cost_price) || 0,
          sell_price: parseFloat(r.sell_price) || 0,
          qty: parseFloat(r.qty),
          note: r.note || undefined,
        })),
      })
      setSavedInvoice(invoiceNo)
      setShowSuccess(true)
      // Reset form
      await loadNextGR()
      setSupplierId(0)
      setSupplierInvoiceNo('')
      setReceiveDate(today)
      setPaymentType('cash')
      setDueDate('')
      setIsPaid(false)
      setPaidDate('')
      setRows([emptyRow()])
      setSearchQueries([''])
      setSuggestions([[]])
      loadHistory()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // --- Receipt modal ---
  const openReceipt = async (invoice_no: string) => {
    const data = await window.api.purchase.getReceipt(invoice_no) as ReceiptDetail[]
    setReceiptItems(data)
    setReceiptInvoice(invoice_no)
    setReceiptModal(true)
  }

  const histTotalPages = Math.ceil(histTotal / 20)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold">รับสินค้า</h1>
          <p className="text-sm text-muted-foreground">บันทึกการรับสินค้าเข้าคลัง</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">เลขที่ใบรับ:</span>
          <span className="font-mono font-bold text-primary">{invoiceNo}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* GR Form */}
        <div className="p-6 space-y-6">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* Supplier */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium mb-1">ผู้จัดจำหน่าย <span className="text-destructive">*</span></label>
              <div className="relative">
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={supplierId}
                  onChange={e => setSupplierId(Number(e.target.value))}
                >
                  <option value={0}>— เลือกผู้จัดจำหน่าย —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Supplier invoice no */}
            <div>
              <label className="block text-sm font-medium mb-1">เลขที่ใบกำกับสินค้า</label>
              <Input value={supplierInvoiceNo} onChange={e => setSupplierInvoiceNo(e.target.value)} placeholder="เช่น INV-2024-001" />
            </div>

            {/* Receive date */}
            <div>
              <label className="block text-sm font-medium mb-1">วันที่รับสินค้า</label>
              <Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
            </div>

            {/* Payment type */}
            <div>
              <label className="block text-sm font-medium mb-1">ประเภทการชำระ</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('cash')}
                  className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${paymentType === 'cash' ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
                >
                  เงินสด
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('credit')}
                  className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${paymentType === 'credit' ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
                >
                  เครดิต
                </button>
              </div>
            </div>

            {/* Due date (credit only) */}
            {paymentType === 'credit' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">วันครบกำหนด <span className="text-destructive">*</span></label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ชำระแล้ว</label>
                  <div className="flex items-center gap-3 h-9">
                    <input
                      type="checkbox"
                      id="isPaid"
                      checked={isPaid}
                      onChange={e => setIsPaid(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <label htmlFor="isPaid" className="text-sm">ชำระแล้ว</label>
                    {isPaid && (
                      <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="flex-1" />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Line items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">รายการสินค้า</h2>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มรายการ
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]">ชื่อสินค้า</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Lot No.</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">ผลิต</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">หมดอายุ</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">ราคาทุน</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">ราคาขาย</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">จำนวน</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">รวม</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>

                        {/* Product search */}
                        <td className="px-3 py-1.5 relative">
                          <Input
                            value={searchQueries[i] ?? ''}
                            onChange={e => handleProductSearch(i, e.target.value)}
                            onFocus={() => setActiveSuggRow(i)}
                            onBlur={() => setTimeout(() => setActiveSuggRow(null), 200)}
                            placeholder="ค้นหาสินค้า..."
                            className="h-8 text-sm"
                          />
                          {activeSuggRow === i && (suggestions[i]?.length ?? 0) > 0 && (
                            <div className="absolute left-3 top-full mt-1 z-50 w-72 bg-popover border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
                              {suggestions[i].map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                  onMouseDown={() => selectProduct(i, p)}
                                >
                                  <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{p.trade_name}</span>
                                  {p.code && <span className="text-xs text-muted-foreground ml-auto">{p.code}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-1.5">
                          <Input
                            value={row.lot_number}
                            onChange={e => updateRow(i, 'lot_number', e.target.value)}
                            placeholder="LOT-001"
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="date"
                            value={row.manufactured_date}
                            onChange={e => updateRow(i, 'manufactured_date', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="date"
                            value={row.expiry_date}
                            onChange={e => updateRow(i, 'expiry_date', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={row.cost_price}
                            onChange={e => updateRow(i, 'cost_price', e.target.value)}
                            placeholder="0.00"
                            className="h-8 text-sm text-right"
                            min={0}
                            step="0.01"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={row.sell_price}
                            onChange={e => updateRow(i, 'sell_price', e.target.value)}
                            placeholder="0.00"
                            className="h-8 text-sm text-right"
                            min={0}
                            step="0.01"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={row.qty}
                            onChange={e => updateRow(i, 'qty', e.target.value)}
                            placeholder="0"
                            className="h-8 text-sm text-right"
                            min={1}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {(parseFloat(row.cost_price) || 0) * (parseFloat(row.qty) || 0) > 0
                            ? formatCurrency((parseFloat(row.cost_price) || 0) * (parseFloat(row.qty) || 0))
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(i)}
                              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={8} className="px-3 py-2 text-right text-sm font-medium">มูลค่ารวมทั้งหมด</td>
                      <td className="px-3 py-2 text-right font-bold text-primary">{formatCurrency(totalCost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => {
              setRows([emptyRow()])
              setSearchQueries([''])
              setSuggestions([[]])
              setSupplierId(0)
              setSupplierInvoiceNo('')
              setPaymentType('cash')
              setDueDate('')
              setIsPaid(false)
              setPaidDate('')
              loadNextGR()
            }}>
              ล้างฟอร์ม
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึกการรับสินค้า'}
            </Button>
          </div>

          {/* History */}
          <div>
            <h2 className="text-base font-semibold mb-3">ประวัติการรับสินค้า</h2>

            {/* History filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={histQ}
                  onChange={e => setHistQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadHistory(1)}
                  placeholder="ค้นหาเลขที่ใบรับ..."
                  className="pl-8"
                />
              </div>
              <div className="relative w-44">
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={histSupplierId}
                  onChange={e => setHistSupplierId(Number(e.target.value))}
                >
                  <option value={0}>ผู้จัดจำหน่ายทั้งหมด</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              <Input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)} className="w-36" />
              <Input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)} className="w-36" />
              <Button variant="outline" onClick={() => loadHistory(1)}>
                <Search className="w-3.5 h-3.5 mr-1" /> ค้นหา
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่ใบรับ</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>ผู้จัดจำหน่าย</TableHead>
                    <TableHead className="text-center">รายการ</TableHead>
                    <TableHead className="text-right">มูลค่า</TableHead>
                    <TableHead className="text-center">การชำระ</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHist ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">กำลังโหลด...</TableCell>
                    </TableRow>
                  ) : history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">ไม่พบข้อมูล</TableCell>
                    </TableRow>
                  ) : history.map(h => (
                    <TableRow key={h.invoice_no}>
                      <TableCell className="font-mono text-sm">{h.invoice_no}</TableCell>
                      <TableCell className="text-sm">{formatDate(h.created_at)}</TableCell>
                      <TableCell className="text-sm">{h.supplier_name ?? '—'}</TableCell>
                      <TableCell className="text-center text-sm">{h.item_count}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(h.total_cost)}</TableCell>
                      <TableCell className="text-center">
                        {h.payment_type === 'credit' ? (
                          h.is_paid
                            ? <Badge variant="success" className="text-xs">ชำระแล้ว</Badge>
                            : <Badge variant="warning" className="text-xs">เครดิต {h.due_date ? formatDate(h.due_date) : ''}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">เงินสด</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openReceipt(h.invoice_no)}>
                          ดูรายการ
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {histTotalPages > 1 && (
              <div className="mt-3 flex justify-center">
                <Pagination page={histPage} totalPages={histTotalPages} onPageChange={p => loadHistory(p)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Receipt detail modal */}
      <Dialog open={receiptModal} onOpenChange={setReceiptModal}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>รายละเอียดใบรับสินค้า: {receiptInvoice}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {receiptItems.length > 0 && (
              <div className="text-sm text-muted-foreground mb-3">
                ผู้จัดจำหน่าย: <span className="text-foreground font-medium">{receiptItems[0]?.supplier_name ?? '—'}</span>
              </div>
            )}
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>สินค้า</TableHead>
                    <TableHead>Lot No.</TableHead>
                    <TableHead className="text-center">หมดอายุ</TableHead>
                    <TableHead className="text-right">ราคาทุน</TableHead>
                    <TableHead className="text-right">ราคาขาย</TableHead>
                    <TableHead className="text-right">จำนวน</TableHead>
                    <TableHead className="text-right">รวม</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiptItems.map(item => {
                    const expStatus = getExpiryStatus(item.expiry_date, 90, 60, 30)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.trade_name}</div>
                          {item.product_code && <div className="text-xs text-muted-foreground">{item.product_code}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.lot_number}</TableCell>
                        <TableCell className="text-center text-sm">
                          <span className={expStatus === 'expired' ? 'text-destructive' : expStatus === 'danger' ? 'text-orange-500' : expStatus === 'warning' ? 'text-yellow-500' : ''}>
                            {formatExpiry(item.expiry_date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.cost_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.sell_price)}</TableCell>
                        <TableCell className="text-right">{item.qty_received}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.cost_price * item.qty_received)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td colSpan={6} className="px-4 py-2 text-right text-sm font-medium">มูลค่ารวม</td>
                    <td className="px-4 py-2 text-right font-bold">
                      {formatCurrency(receiptItems.reduce((s, i) => s + i.cost_price * i.qty_received, 0))}
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptModal(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>บันทึกสำเร็จ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-14 h-14 text-green-500" />
              <p className="text-lg font-semibold">{savedInvoice}</p>
              <p className="text-sm text-muted-foreground">บันทึกการรับสินค้าเรียบร้อยแล้ว</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setShowSuccess(false)}>ตกลง</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
