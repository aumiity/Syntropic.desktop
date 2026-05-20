import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, Banknote, AlertTriangle } from 'lucide-react'
import type { ProductLot } from '@/types'

interface ReceiptItem extends ProductLot {
  trade_name: string
  product_code: string
  supplier_name: string
}

// Shared GR (goods-receipt) detail modal — opened from both the Purchases
// report page and the EditProduct → ความเคลื่อนไหว tab. Styling mirrors
// SaleDetailDialog (header divider, grid metadata, sticky discount tfoot,
// count + grand total in the footer bar).
export function PurchaseReceiptDialog({
  open, onOpenChange, invoiceNo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNo: string | null
}) {
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !invoiceNo) return
    setLoading(true)
    setItems([])
    window.api.purchase.getReceipt(invoiceNo)
      .then((data: any) => setItems(data as ReceiptItem[]))
      .finally(() => setLoading(false))
  }, [open, invoiceNo])

  const header = items[0]
  const rawTotal = items.reduce((s, i) => s + i.cost_price * i.qty_received, 0)
  const discountAmt = header?.discount_amount ?? 0
  const surchargeAmt = header?.surcharge_amount ?? 0
  const hasAdjust = discountAmt > 0 || surchargeAmt > 0
  const finalTotal = rawTotal - discountAmt + surchargeAmt
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = !!header && header.payment_type === 'credit' && !header.is_paid && !!header.due_date && header.due_date < today

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl" className="max-h-[88vh] flex flex-col">
        {loading || !header ? (
          <>
            <DialogHeader><DialogTitle>กำลังโหลด...</DialogTitle></DialogHeader>
            <DialogBody>
              <div className="py-8 text-center text-muted-foreground">
                {loading ? 'กำลังโหลดข้อมูล...' : 'ไม่พบรายการ'}
              </div>
            </DialogBody>
          </>
        ) : (
          <>
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="flex items-center gap-3">
                <span>{invoiceNo}</span>
                {header.payment_type === 'credit'
                  ? header.is_paid
                    ? <Badge variant="success">ชำระแล้ว</Badge>
                    : isOverdue
                      ? <Badge variant="destructive"><AlertTriangle className="size-3" />{header.due_date ? formatDate(header.due_date) : ''}</Badge>
                      : <Badge variant="warm"><CreditCard className="size-3" />{header.due_date ? formatDate(header.due_date) : 'เครดิต'}</Badge>
                  : <Badge variant="brand-soft"><Banknote className="size-3" />เงินสด</Badge>}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3 shrink-0">
                <div><span className="text-muted-foreground">ผู้จัดจำหน่าย:</span> <span className="font-medium">{header.supplier_name ?? '—'}</span></div>
                <div><span className="text-muted-foreground">เลขที่ใบกำกับ:</span> <span className="font-medium">{header.supplier_invoice_no || '—'}</span></div>
                <div><span className="text-muted-foreground">วันที่สั่งซื้อ:</span> <span className="font-medium">{header.order_date ? formatDate(header.order_date) : '—'}</span></div>
                <div><span className="text-muted-foreground">วันที่รับสินค้า:</span> <span className="font-medium">{header.created_at ? formatDate(header.created_at) : '—'}</span></div>
              </div>

              <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden">
                <Table containerClassName="h-full overflow-auto scrollbar-thin" className="border-separate border-spacing-0">
                  {/* Divider rides with the sticky header — works because the
                      <Table> is border-separate (collapse model strands cell
                      borders behind sticking cells). */}
                  <TableHeader className="[&_th]:border-b [&_th]:border-border">
                    <TableRow>
                      <TableHead className="text-center w-8">#</TableHead>
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
                    {items.map((item, i) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{item.trade_name}</div>
                          {item.product_code && <div className="text-sm text-muted-foreground font-mono">{item.product_code}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.lot_number}</TableCell>
                        <TableCell className="text-center text-sm">{item.expiry_date ? formatDate(item.expiry_date) : '—'}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.cost_price)}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.sell_price)}</TableCell>
                        <TableCell className="text-right text-sm">{item.qty_received}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.cost_price * item.qty_received)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {/* Sticky discount/surcharge rows — per-cell sticky because
                      sticky on <tr>/<tfoot> is flaky in Chromium. Only shown
                      when there's actually an adjustment. Grand total lives in
                      DialogFooter, not here. */}
                  {hasAdjust && (
                    <tfoot>
                      <tr className="[&>td]:sticky [&>td]:bottom-9 [&>td]:z-20 [&>td]:bg-muted/40 [&>td]:border-t [&>td]:border-border">
                        <td colSpan={7} className="px-4 py-1.5 text-right text-sm text-muted-foreground">ราคารวมก่อนปรับ</td>
                        <td className="px-4 py-1.5 text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(rawTotal)}</td>
                      </tr>
                      {discountAmt > 0 && (
                        <tr className={`[&>td]:sticky ${surchargeAmt > 0 ? '[&>td]:bottom-[2.25rem]' : '[&>td]:bottom-0'} [&>td]:z-20 [&>td]:bg-muted/40`}>
                          <td colSpan={7} className="px-4 py-1 text-right text-sm text-primary">ส่วนลดรวม</td>
                          <td className="px-4 py-1 text-right text-sm tabular-nums text-primary">−{formatCurrency(discountAmt)}</td>
                        </tr>
                      )}
                      {surchargeAmt > 0 && (
                        <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:z-20 [&>td]:bg-muted/40">
                          <td colSpan={7} className="px-4 py-1 text-right text-sm text-warning-strong">ส่วนเพิ่ม</td>
                          <td className="px-4 py-1 text-right text-sm tabular-nums text-warning-strong">+{formatCurrency(surchargeAmt)}</td>
                        </tr>
                      )}
                    </tfoot>
                  )}
                </Table>
              </div>
            </DialogBody>
            <DialogFooter className="border-t border-border pt-3 sm:justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{items.length} รายการ</span>
                <span className="font-extrabold text-primary tabular-nums text-lg">{formatCurrency(finalTotal)}</span>
              </div>
              <Button size="xl" variant="destructive2" onClick={() => onOpenChange(false)}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
