import { useEffect, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import type { ProductLot } from '@/types'

interface ReceiptItem extends ProductLot {
  trade_name: string
  product_code: string
  supplier_name: string
  status?: 'completed' | 'cancelled'
  cancelled_at?: string
  cancel_reason?: string
}

// Shared GR (goods-receipt) detail modal — opened from the Purchases report
// page (with edit/cancel actions) and the EditProduct → ความเคลื่อนไหว tab
// (view-only). The `actions` slot renders before the close button in the
// footer; `footerLeft` puts hint/info content on the bottom-left (e.g. a
// "edit this in the Purchases page" note for view-only callers); `onLoad`
// lets the parent hydrate state for follow-up actions.
export function PurchaseReceiptDialog({
  open, onOpenChange, invoiceNo, actions, footerLeft, onLoad, refreshKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNo: string | null
  actions?: ReactNode
  footerLeft?: ReactNode
  onLoad?: (items: ReceiptItem[]) => void
  refreshKey?: number
}) {
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !invoiceNo) return
    setLoading(true)
    setItems([])
    window.api.purchase.getReceipt(invoiceNo)
      .then((data: any) => {
        const list = data as ReceiptItem[]
        setItems(list)
        onLoad?.(list)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceNo, refreshKey])

  const header = items[0]
  const rawTotal = items.reduce((s, i) => s + i.cost_price * i.qty_received, 0)
  const discountAmt = header?.discount_amount ?? 0
  const surchargeAmt = header?.surcharge_amount ?? 0
  const hasAdjust = discountAmt > 0 || surchargeAmt > 0
  const finalTotal = rawTotal - discountAmt + surchargeAmt
  const today = new Date().toISOString().split('T')[0]
  const isCancelled = header?.status === 'cancelled'
  const isOverdue = !!header && !isCancelled && header.payment_type === 'credit' && !header.is_paid && !!header.due_date && header.due_date < today

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl" className="h-[85vh] flex flex-col">
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
              <DialogTitle className="flex items-center gap-3 pr-10">
                <span className={isCancelled ? 'text-muted-foreground line-through' : ''}>{invoiceNo}</span>
                {isCancelled
                  ? <Badge variant="destructive-outline">ยกเลิกแล้ว</Badge>
                  : header.payment_type === 'credit'
                    ? header.is_paid
                      ? <Badge variant="success-outline">ชำระแล้ว</Badge>
                      : isOverdue
                        ? <Badge variant="destructive-outline">เกินกำหนด</Badge>
                        : <Badge variant="warning-outline">เครดิต</Badge>
                    : <Badge variant="info-outline">เงินสด</Badge>}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
              {isCancelled && (
                <div className="px-4 py-2.5 bg-destructive-soft rounded-lg shrink-0">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-destructive">
                        บิลถูกยกเลิก{header.cancelled_at ? ` · ${formatDate(header.cancelled_at)}` : ''}
                      </div>
                      {header.cancel_reason && (
                        <div className="text-sm text-destructive mt-0.5 break-words">เหตุผล: {header.cancel_reason}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3 shrink-0">
                <div><span className="text-muted-foreground">ผู้จัดจำหน่าย:</span> <span className="font-medium">{header.supplier_name ?? '—'}</span></div>
                <div><span className="text-muted-foreground">เลขที่ใบกำกับ:</span> <span className="font-medium">{header.supplier_invoice_no || '—'}</span></div>
                <div><span className="text-muted-foreground">วันที่สั่งซื้อ:</span> <span className="font-medium">{header.order_date ? formatDate(header.order_date) : '—'}</span></div>
                <div><span className="text-muted-foreground">วันที่รับสินค้า:</span> <span className="font-medium">{header.created_at ? formatDate(header.created_at) : '—'}</span></div>
                {header.payment_type === 'credit' && (
                  <div>
                    <span className="text-muted-foreground">วันครบกำหนด:</span>{' '}
                    <span className={`font-medium inline-flex items-center gap-1 ${isOverdue ? 'text-destructive' : ''}`}>
                      {isOverdue && <AlertTriangle className="size-3.5" />}
                      {header.due_date ? formatDate(header.due_date) : '—'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden">
                <Table containerClassName="h-full overflow-y-auto overflow-x-auto scrollbar-thin" className="border-separate border-spacing-0 h-full">
                  {/* Divider rides with the sticky header — works because the
                      <Table> is border-separate (collapse model strands cell
                      borders behind sticking cells). */}
                  <TableHeader className="[&_th]:border-b [&_th]:border-border">
                    <TableRow>
                      <TableHead className="min-w-12 text-center">#</TableHead>
                      <TableHead className="min-w-[220px]">รายการ</TableHead>
                      <TableHead className="min-w-16 text-right">จำนวน</TableHead>
                      <TableHead className="min-w-20">หน่วย</TableHead>
                      <TableHead className="min-w-24 text-right">ราคา</TableHead>
                      <TableHead className="min-w-24 text-right">ส่วนลด</TableHead>
                      <TableHead className="min-w-28 text-right">รวม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{item.trade_name}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            {item.lot_number && (
                              <span className="text-sm text-foreground-subtle">Lot. {item.lot_number}</span>
                            )}
                            {item.expiry_date && (
                              <span className="text-sm text-foreground-subtle">exp. {formatDate(item.expiry_date)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.qty_received}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.unit_name || '—'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.cost_price)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(0)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(item.cost_price * item.qty_received)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Slack-absorber — keeps tfoot pinned to the actual
                        container bottom when data rows don't fill the height.
                        Uses a raw <tr> so TableRow's border-b doesn't add a
                        stray separator above the empty band. */}
                    <tr aria-hidden><td colSpan={7} className="h-full p-0" /></tr>
                  </TableBody>
                  {/* Pinned totals: each <td> is sticky (per-cell, not <tr> —
                      sticky on <tr>/<tfoot> is flaky in Chromium). Every row
                      is forced to h-8 (32px) so the bottom offsets stack as
                      exact multiples of 2rem with no transparent gaps
                      between layers. */}
                  <tfoot>
                    {hasAdjust && (
                      <>
                        <tr className={`[&>td]:sticky [&>td]:h-8 ${
                          discountAmt > 0 && surchargeAmt > 0
                            ? '[&>td]:bottom-24'
                            : '[&>td]:bottom-16'
                        } [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-border`}>
                          <td colSpan={6} className="px-2 py-0.5 text-right text-sm text-muted-foreground">ราคารวม</td>
                          <td className="px-2 py-0.5 text-right text-sm text-muted-foreground">{formatCurrency(rawTotal)}</td>
                        </tr>
                        {discountAmt > 0 && (
                          <tr className={`[&>td]:sticky [&>td]:h-8 ${surchargeAmt > 0 ? '[&>td]:bottom-16' : '[&>td]:bottom-8'} [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-border`}>
                            <td colSpan={6} className="px-2 py-0.5 text-right text-sm text-warning-strong">ส่วนลด</td>
                            <td className="px-2 py-0.5 text-right text-sm text-warning-strong">−{formatCurrency(discountAmt)}</td>
                          </tr>
                        )}
                        {surchargeAmt > 0 && (
                          <tr className="[&>td]:sticky [&>td]:h-8 [&>td]:bottom-8 [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-border">
                            <td colSpan={6} className="px-2 py-0.5 text-right text-sm text-warning-strong">ส่วนเพิ่ม</td>
                            <td className="px-2 py-0.5 text-right text-sm text-warning-strong">+{formatCurrency(surchargeAmt)}</td>
                          </tr>
                        )}
                      </>
                    )}
                    <tr className="[&>td]:sticky [&>td]:h-8 [&>td]:bottom-0 [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-border">
                      <td colSpan={6} className="px-2 py-0.5 text-right text-sm font-bold">ยอดสุทธิ</td>
                      <td className="px-2 py-0.5 text-right font-bold text-primary">{formatCurrency(finalTotal)}</td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            </DialogBody>
            <DialogFooter className={`pt-3 ${footerLeft ? 'sm:justify-between' : 'sm:justify-end'}`}>
              {footerLeft && <div className="flex items-center min-w-0">{footerLeft}</div>}
              <div className="flex items-center gap-2">
                {!isCancelled && actions}
                <Button size="xl" variant="destructive2" onClick={() => onOpenChange(false)}>ปิด</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
