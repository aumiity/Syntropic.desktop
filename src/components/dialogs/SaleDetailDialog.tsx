import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Ban } from 'lucide-react'
import type { Sale, SaleItem } from '@/types'

export interface SaleDetail extends Sale {
  customer_name?: string
  sold_by_name?: string
  items: (SaleItem & { item_cost: number })[]
}

const SALE_TYPE_LABELS: Record<string, string> = {
  retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า',
}

function profitColor(profit: number) {
  if (profit > 0) return 'text-success'
  if (profit < 0) return 'text-destructive'
  return ''
}

// Shared sale-detail modal — opened from both the Sales report page and the
// EditProduct → ความเคลื่อนไหว tab. Owns its own fetch lifecycle: parent
// just supplies `invoiceNo` and `open`. Pass `onVoidRequest` to let users
// trigger a void from inside the modal; omit it to disable the button (e.g.,
// when the host page has no void flow).
export function SaleDetailDialog({
  open, onOpenChange, invoiceNo, onVoidRequest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNo: string | null
  onVoidRequest?: (sale: SaleDetail) => void
}) {
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !invoiceNo) return
    setLoading(true)
    setDetail(null)
    window.api.reports.getSaleByInvoice(invoiceNo)
      .then((data: any) => setDetail(data as SaleDetail | null))
      .finally(() => setLoading(false))
  }, [open, invoiceNo])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        {loading || !detail ? (
          <>
            <DialogHeader><DialogTitle>กำลังโหลด...</DialogTitle></DialogHeader>
            <DialogBody><div className="py-8 text-center text-muted-foreground">กำลังโหลดข้อมูล...</div></DialogBody>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span>{detail.invoice_no}</span>
                {detail.status === 'voided'
                  ? <Badge variant="destructive">ยกเลิกแล้ว</Badge>
                  : <Badge variant="success">สำเร็จ</Badge>}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                <div><span className="text-muted-foreground">วันที่:</span> <span className="font-medium">{formatDateTime(detail.sold_at)}</span></div>
                <div><span className="text-muted-foreground">พนักงาน:</span> <span className="font-medium">{detail.sold_by_name ?? '—'}</span></div>
                <div><span className="text-muted-foreground">ลูกค้า:</span> <span className="font-medium">{detail.customer_name ?? detail.customer_name_free ?? 'ลูกค้าทั่วไป'}</span></div>
                <div><span className="text-muted-foreground">ประเภทการขาย:</span> <span className="font-medium">{SALE_TYPE_LABELS[detail.sale_type] ?? detail.sale_type}</span></div>
                {detail.cash_amount > 0 && <div><span className="text-muted-foreground">เงินสด:</span> <span className="font-medium">{formatCurrency(detail.cash_amount)}</span></div>}
                {detail.card_amount > 0 && <div><span className="text-muted-foreground">บัตร:</span> <span className="font-medium">{formatCurrency(detail.card_amount)}</span></div>}
                {detail.transfer_amount > 0 && <div><span className="text-muted-foreground">โอน:</span> <span className="font-medium">{formatCurrency(detail.transfer_amount)}</span></div>}
                {detail.change_amount > 0 && <div><span className="text-muted-foreground">เงินทอน:</span> <span className="font-medium">{formatCurrency(detail.change_amount)}</span></div>}
                {detail.void_reason && (
                  <div className="col-span-2 text-destructive"><span className="font-medium">เหตุผลยกเลิก:</span> {detail.void_reason}</div>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายการ</TableHead>
                      <TableHead className="text-center">หน่วย</TableHead>
                      <TableHead className="text-right">จำนวน</TableHead>
                      <TableHead className="text-right">ราคา/หน่วย</TableHead>
                      <TableHead className="text-right">ส่วนลด</TableHead>
                      <TableHead className="text-right">รวม</TableHead>
                      <TableHead className="text-right">ต้นทุน</TableHead>
                      <TableHead className="text-right">กำไร</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map(item => {
                      const profit = item.line_total - (item.item_cost ?? 0)
                      return (
                        <TableRow key={item.id} className={item.is_cancelled ? 'opacity-40 line-through' : ''}>
                          <TableCell>
                            <div className="font-medium text-sm">{item.item_name}</div>
                            {item.item_note && <div className="text-sm text-muted-foreground">{item.item_note}</div>}
                          </TableCell>
                          <TableCell className="text-center text-sm">{item.unit_name}</TableCell>
                          <TableCell className="text-right text-sm">{item.qty}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                          <TableCell className="text-right text-sm text-warning-strong">
                            {item.discount > 0 ? formatCurrency(item.discount) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.line_total)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(item.item_cost ?? 0)}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${profitColor(profit)}`}>
                            {formatCurrency(profit)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="px-4 py-2" />
                      <td className="px-4 py-2 text-right text-sm font-medium text-muted-foreground">ส่วนลด</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-warning-strong">
                        {detail.total_discount > 0 ? `-${formatCurrency(detail.total_discount)}` : '—'}
                      </td>
                      <td colSpan={2} />
                    </tr>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="px-4 py-2" />
                      <td className="px-4 py-2 text-right text-sm font-bold">ยอดสุทธิ</td>
                      <td className="px-4 py-2 text-right font-bold text-primary">{formatCurrency(detail.total_amount)}</td>
                      <td className="px-4 py-2 text-right text-sm text-muted-foreground">
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.item_cost ?? 0), 0))}
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${profitColor(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}`}>
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            </DialogBody>
            <DialogFooter>
              {onVoidRequest && detail.status !== 'voided' && (
                <Button variant="destructive" onClick={() => onVoidRequest(detail)}>
                  <Ban className="w-4 h-4 mr-1.5" /> ยกเลิกบิล
                </Button>
              )}
              <Button variant="destructive2" onClick={() => onOpenChange(false)}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
