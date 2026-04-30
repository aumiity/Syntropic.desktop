import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Supplier, ProductLot } from '@/types'
import { Search, ChevronDown } from 'lucide-react'

interface PurchaseRow {
  invoice_no: string
  receive_date: string
  supplier_id: number
  supplier_name?: string
  payment_type: string
  is_paid: number
  due_date?: string
  item_count: number
  total_cost: number
}

interface ReceiptItem extends ProductLot {
  trade_name: string
  product_code: string
  supplier_name: string
}

export default function ReportsPurchasesPage() {
  const { toast } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 7) + '-01'

  // Filters
  const [q, setQ] = useState('')
  const [supplierId, setSupplierId] = useState<number>(0)
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)

  // Data
  const [rows, setRows] = useState<PurchaseRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Receipt detail modal
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [receiptInvoice, setReceiptInvoice] = useState('')
  const [receiptOpen, setReceiptOpen] = useState(false)

  const limit = 30
  const totalPages = Math.ceil(total / limit)

  useEffect(() => {
    loadSuppliers()
    load(1)
  }, [])

  const loadSuppliers = async () => {
    const data = await window.api.people.allSuppliers() as Supplier[]
    setSuppliers(data)
  }

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.reports.purchaseList({
        q: q.trim() || undefined,
        supplier_id: supplierId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page: p,
      }) as any
      setRows(res.rows)
      setTotal(res.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [q, supplierId, dateFrom, dateTo])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    load(1)
  }

  const openReceipt = async (invoice_no: string) => {
    try {
      const data = await window.api.purchase.getReceipt(invoice_no) as ReceiptItem[]
      setReceiptItems(data)
      setReceiptInvoice(invoice_no)
      setReceiptOpen(true)
    } catch (e: any) {
      toast({ title: 'โหลดข้อมูลไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  // Summary from current page
  const pageTotalCost = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0)
  const pageItemCount = rows.reduce((s, r) => s + (r.item_count ?? 0), 0)
  const creditUnpaid = rows.filter(r => r.payment_type === 'credit' && !r.is_paid)

  const receiptTotal = receiptItems.reduce((s, i) => s + i.cost_price * i.qty_received, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">รายงานการรับสินค้า</h1>
        <p className="text-sm text-muted-foreground">ประวัติการรับสินค้าและการชำระเงิน</p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="px-6 py-3 border-b border-border bg-muted/30 shrink-0 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเลขใบรับ..." className="pl-8" />
        </div>
        <div className="relative w-44">
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
            value={supplierId}
            onChange={e => setSupplierId(Number(e.target.value))}
          >
            <option value={0}>ผู้จัดจำหน่ายทั้งหมด</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>ตั้งแต่</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          <span>ถึง</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button type="submit"><Search className="w-3.5 h-3.5 mr-1" /> ค้นหา</Button>
      </form>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">

          {/* Quick summary strip */}
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-4 text-sm bg-muted/30 rounded-lg px-4 py-2.5">
              <div><span className="text-muted-foreground">ใบรับในช่วงนี้:</span> <span className="font-semibold">{total.toLocaleString()} ใบ</span></div>
              <div><span className="text-muted-foreground">มูลค่ารวม (หน้านี้):</span> <span className="font-semibold">{formatCurrency(pageTotalCost)}</span></div>
              <div><span className="text-muted-foreground">จำนวนรายการ:</span> <span className="font-semibold">{pageItemCount.toLocaleString()}</span></div>
              {creditUnpaid.length > 0 && (
                <div className="text-warning-strong font-medium">⚠ เครดิตค้างชำระ {creditUnpaid.length} ใบ</div>
              )}
            </div>
          )}

          {/* Table */}
          <div className="text-xs text-muted-foreground mb-2">
            {loading ? 'กำลังโหลด...' : `${total.toLocaleString()} รายการ`}
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ใบรับ</TableHead>
                  <TableHead>วันที่รับ</TableHead>
                  <TableHead>ผู้จัดจำหน่าย</TableHead>
                  <TableHead className="text-center">รายการ</TableHead>
                  <TableHead className="text-right">มูลค่า</TableHead>
                  <TableHead className="text-center">การชำระ</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-16">ไม่พบข้อมูล</TableCell></TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.invoice_no}>
                    <TableCell className="font-mono text-sm">{r.invoice_no}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.receive_date)}</TableCell>
                    <TableCell className="text-sm">{r.supplier_name ?? '—'}</TableCell>
                    <TableCell className="text-center text-sm">{r.item_count}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.total_cost)}</TableCell>
                    <TableCell className="text-center">
                      {r.payment_type === 'credit' ? (
                        r.is_paid
                          ? <Badge variant="success" className="text-xs">ชำระแล้ว</Badge>
                          : <div className="space-y-0.5">
                              <Badge variant="warning" className="text-xs block">เครดิต</Badge>
                              {r.due_date && (
                                <div className="text-xs text-muted-foreground">ครบ {formatDate(r.due_date)}</div>
                              )}
                            </div>
                      ) : (
                        <Badge variant="secondary" className="text-xs">เงินสด</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openReceipt(r.invoice_no)}>
                        ดูรายการ
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex justify-center">
              <Pagination page={page} totalPages={totalPages} onPageChange={load} />
            </div>
          )}
        </div>
      </div>

      {/* Receipt detail modal */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>รายละเอียดใบรับสินค้า: {receiptInvoice}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {receiptItems.length > 0 && (
              <div className="flex flex-wrap gap-4 text-sm bg-muted/30 rounded-lg px-4 py-2.5">
                <div><span className="text-muted-foreground">ผู้จัดจำหน่าย:</span> <span className="font-medium">{receiptItems[0]?.supplier_name ?? '—'}</span></div>
                <div><span className="text-muted-foreground">ประเภทชำระ:</span>
                  <span className="font-medium ml-1">
                    {receiptItems[0]?.payment_type === 'credit' ? 'เครดิต' : 'เงินสด'}
                    {receiptItems[0]?.payment_type === 'credit' && receiptItems[0]?.due_date && ` (ครบ ${formatDate(receiptItems[0].due_date)})`}
                  </span>
                </div>
                {receiptItems[0]?.supplier_invoice_no && (
                  <div><span className="text-muted-foreground">เลขที่ใบกำกับ:</span> <span className="font-medium">{receiptItems[0].supplier_invoice_no}</span></div>
                )}
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>สินค้า</TableHead>
                    <TableHead>Lot No.</TableHead>
                    <TableHead className="text-center">วันหมดอายุ</TableHead>
                    <TableHead className="text-right">ราคาทุน</TableHead>
                    <TableHead className="text-right">ราคาขาย</TableHead>
                    <TableHead className="text-right">จำนวน</TableHead>
                    <TableHead className="text-right">รวม</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiptItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{item.trade_name}</div>
                        {item.product_code && <div className="text-xs text-muted-foreground font-mono">{item.product_code}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.lot_number}</TableCell>
                      <TableCell className="text-center text-sm">{formatDate(item.expiry_date ?? '')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.cost_price)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.sell_price)}</TableCell>
                      <TableCell className="text-right">{item.qty_received}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.cost_price * item.qty_received)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td colSpan={6} className="px-4 py-2 text-right text-sm font-medium">มูลค่ารวมทั้งหมด</td>
                    <td className="px-4 py-2 text-right font-bold text-primary">{formatCurrency(receiptTotal)}</td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
