import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ProductLot } from '@/types'

interface ReceiptItem extends ProductLot {
  trade_name: string
  product_code: string
  supplier_name: string
}

// Shared GR (goods-receipt) detail modal — opened from both the Purchases
// report page and the EditProduct → ความเคลื่อนไหว tab.
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

  const total = items.reduce((s, i) => s + i.cost_price * i.qty_received, 0)
  const header = items[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>รายละเอียดใบรับสินค้า: {invoiceNo ?? '—'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">กำลังโหลดข้อมูล...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">ไม่พบรายการ</div>
          ) : (
            <>
              {header && (
                <div className="flex flex-wrap gap-4 text-sm bg-muted/30 rounded-lg px-4 py-2.5">
                  <div><span className="text-muted-foreground">ผู้จัดจำหน่าย:</span> <span className="font-medium">{header.supplier_name ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">ประเภทชำระ:</span>
                    <span className="font-medium ml-1">
                      {header.payment_type === 'credit' ? 'เครดิต' : 'เงินสด'}
                      {header.payment_type === 'credit' && header.due_date && ` (ครบ ${formatDate(header.due_date)})`}
                    </span>
                  </div>
                  {header.supplier_invoice_no && (
                    <div><span className="text-muted-foreground">เลขที่ใบกำกับ:</span> <span className="font-medium">{header.supplier_invoice_no}</span></div>
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
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{item.trade_name}</div>
                          {item.product_code && <div className="text-sm text-muted-foreground font-mono">{item.product_code}</div>}
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
                      <td className="px-4 py-2 text-right font-bold text-primary">{formatCurrency(total)}</td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="destructive2" onClick={() => onOpenChange(false)}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
