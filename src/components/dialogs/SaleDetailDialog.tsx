import { Fragment, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import dayjs from 'dayjs'
import { Ban, ChevronRight, Boxes, ClockAlert } from 'lucide-react'
import type { Sale, SaleItem } from '@/types'

// One sale_item_lots row exposed to the renderer. Joined fields come from
// reports:getSaleByInvoice — see the IPC for the source query.
interface ComponentLot {
  id: number
  lot_id: number | null
  product_id: number
  qty: number
  is_cancelled: number
  component_name?: string
  component_unit_name?: string
  lot_number?: string
  expiry_date?: string
  cost_price?: number
}

interface BundleSaleItem extends SaleItem {
  item_cost: number
  is_bundle?: number
  component_lots?: ComponentLot[]
}

export interface SaleDetail extends Sale {
  customer_name?: string
  sold_by_name?: string
  items: BundleSaleItem[]
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const fetchDetail = (inv: string) => {
    setLoading(true)
    window.api.reports.getSaleByInvoice(inv)
      .then((data: any) => setDetail(data as SaleDetail | null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !invoiceNo) return
    setDetail(null)
    setExpanded(new Set())
    fetchDetail(invoiceNo)
  }, [open, invoiceNo])

  const toggleExpand = (saleItemId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(saleItemId)) next.delete(saleItemId)
      else next.add(saleItemId)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl" divided>
        {loading || !detail ? (
          <>
            <DialogHeader><DialogTitle>กำลังโหลด...</DialogTitle></DialogHeader>
            <DialogBody><div className="py-8 text-center text-muted-foreground">กำลังโหลดข้อมูล...</div></DialogBody>
          </>
        ) : (
          <>
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="flex items-center gap-3">
                <span>{detail.invoice_no}</span>
                {detail.status === 'voided'
                  ? <Badge variant="destructive-outline">ยกเลิกแล้ว</Badge>
                  : <Badge variant="success-outline">สำเร็จ</Badge>}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="relative grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {([
                    detail.cash_amount > 0 && { label: 'เงินสด', variant: 'success-outline' as const },
                    detail.card_amount > 0 && { label: 'บัตร', variant: 'info-outline' as const },
                    detail.transfer_amount > 0 && { label: 'โอน', variant: 'warning-outline' as const },
                  ].filter(Boolean) as { label: string; variant: 'success-outline' | 'info-outline' | 'warning-outline' }[]).map(m => (
                    <Badge key={m.label} variant={m.variant}>{m.label}</Badge>
                  ))}
                </div>
                <div><span className="text-muted-foreground">วันที่:</span> <span className="font-medium">{formatDateTime(detail.sold_at)}</span></div>
                <div className="pr-40"><span className="text-muted-foreground">พนักงาน:</span> <span className="font-medium">{detail.sold_by_name ?? '—'}</span></div>
                <div><span className="text-muted-foreground">ลูกค้า:</span> <span className="font-medium">{detail.customer_name ?? detail.customer_name_free ?? 'ลูกค้าทั่วไป'}</span></div>
                <div><span className="text-muted-foreground">ประเภทการขาย:</span> <span className="font-medium">{SALE_TYPE_LABELS[detail.sale_type] ?? detail.sale_type}</span></div>
                {detail.cash_amount > 0 && <div><span className="text-muted-foreground">รับเงินมา:</span> <span className="font-medium">{formatCurrency(detail.cash_amount)}</span></div>}
                {detail.change_amount > 0 && <div><span className="text-muted-foreground">เงินทอน:</span> <span className="font-medium">{formatCurrency(detail.change_amount)}</span></div>}
                {detail.void_reason && (
                  <div className="col-span-2 text-destructive"><span className="font-medium">เหตุผลยกเลิก:</span> {detail.void_reason}</div>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                {/* Locked to 10-row height — fewer rows leave empty space below
                    the sticky tfoot rather than shrinking the modal; more rows
                    scroll inside the container. Breakdown: header h-10 (40) +
                    10×~33 + sticky tfoot (~72) ≈ 450.
                    Table is h-full so a `<tr h-full>` spacer at the end of
                    tbody can absorb the slack — without it, sticky tfoot only
                    "sticks" when content overflows, otherwise it floats below
                    the last data row leaving a big blank band underneath. */}
                <Table containerClassName="h-[450px] scrollbar-thin" className=" scrollbar-thin border-separate border-spacing-0 table-fixed h-full">
                  {/* Divider rides with the sticky header — works because the
                      <Table> is border-separate (collapse model strands cell
                      borders behind sticking cells). Same pattern as the
                      pinned tfoot's border-t below. */}
                  <TableHeader className="[&_th]:border-b [&_th]:border-border">
                    <TableRow>
                      <TableHead className="text-center w-8">#</TableHead>
                      <TableHead className="w-64">รายการ</TableHead>
                      <TableHead className="text-center w-12">จำนวน</TableHead>
                      <TableHead className="text-center w-12">หน่วย</TableHead>
                      <TableHead className="text-right w-20">ราคา</TableHead>
                      <TableHead className="text-right w-20">ส่วนลด</TableHead>
                      <TableHead className="text-right w-20">รวม</TableHead>
                      <TableHead className="text-right w-20">ต้นทุน</TableHead>
                      <TableHead className="text-right w-20 pr-4">กำไร</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item, i) => {
                      const profit = item.line_total - (item.item_cost ?? 0)
                      const isBundle = item.is_bundle === 1
                      const hasLots = (item.component_lots?.length ?? 0) > 0
                      const isExpanded = expanded.has(item.id)
                      const dimmed = item.is_cancelled ? 'opacity-40 line-through' : ''
                      return (
                        <Fragment key={item.id}>
                          <TableRow key={item.id} className={dimmed}>
                            <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {hasLots && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(item.id)}
                                    className="shrink-0 inline-flex items-center justify-center size-5 rounded hover:bg-muted"
                                    title={isExpanded ? 'ย่อ' : (isBundle ? 'ดูรายการ' : 'ดูล็อต/วันหมดอายุ')}
                                    aria-expanded={isExpanded}
                                  >
                                    <motion.span
                                      animate={{ rotate: isExpanded ? 90 : 0 }}
                                      transition={{ duration: 0.2, ease: 'easeOut' }}
                                      className="inline-flex"
                                    >
                                      <ChevronRight className="size-4" />
                                    </motion.span>
                                  </button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm flex items-center gap-2">
                                    {isBundle && <Badge variant="violet-outline" className="shrink-0"><Boxes className="size-3 mr-1" />ชุด</Badge>}
                                    <span className="truncate">{item.item_name}</span>
                                  </div>
                                  {item.item_note && detail.sale_type !== 'return' && <div className="text-sm text-muted-foreground">{item.item_note}</div>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm">{item.qty}</TableCell>
                            <TableCell className="text-center text-sm">{item.unit_name}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right text-sm text-warning-strong">
                              {item.discount > 0 ? formatCurrency(item.discount) : '0'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.line_total)}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(item.item_cost ?? 0)}</TableCell>
                            <TableCell className={`text-right pr-4 text-sm font-medium ${profitColor(profit)}`}>
                              {formatCurrency(profit)}
                            </TableCell>
                          </TableRow>
                          <AnimatePresence initial={false}>
                            {isExpanded && hasLots && item.component_lots && (
                              <motion.tr
                                key={`${item.id}-components`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1, transition: { duration: 0.16, ease: 'easeOut' } }}
                                exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
                                className="bg-muted/20"
                              >
                                <TableCell colSpan={9} className="p-0">
                                  <motion.div
                                    initial={{ height: 0, y: -4 }}
                                    animate={{ height: 'auto', y: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
                                    exit={{ height: 0, y: -4, transition: { duration: 0.16, ease: 'easeIn' } }}
                                    className="overflow-hidden"
                                  >
                                    <div className="py-2 pl-8 pr-2">
                                      <table className="w-full text-sm">
                                        <thead className="text-xs text-muted-foreground">
                                          <tr className="text-left">
                                            {isBundle && <th className="py-1 pr-4">รายการ</th>}
                                            <th className="py-1 pr-4">ล็อต</th>
                                            <th className="py-1 pr-4">วันหมดอายุ</th>
                                            <th className="py-1 pr-4 text-right">จำนวน</th>
                                            <th className="py-1 pr-4 text-right">ทุน/หน่วย</th>
                                            <th className="py-1 text-right">รวม</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {item.component_lots.map(cl => {
                                            const lineCost = cl.lot_id != null ? cl.qty * (cl.cost_price ?? 0) : 0
                                            const cancelledStyle = cl.is_cancelled ? 'opacity-40 line-through' : ''
                                            return (
                                              <tr key={cl.id} className={cancelledStyle}>
                                                {isBundle && <td className="py-1 pr-4">{cl.component_name ?? '—'}</td>}
                                                <td className="py-1 pr-4 text-xs">
                                                  {cl.lot_id == null
                                                    ? <span className="text-destructive">ไม่มีล็อต (ขายเกิน)</span>
                                                    : (cl.lot_number ?? '—')}
                                                </td>
                                                <td className="py-1 pr-4">
                                                  {!cl.expiry_date ? '—'
                                                    : dayjs(cl.expiry_date).diff(dayjs(detail.sold_at), 'day') < 0 ? (
                                                      <span className="inline-flex items-center gap-1 text-destructive" title="ล็อตนี้หมดอายุไปแล้ว ณ วันที่ขาย">
                                                        <ClockAlert className="size-3" /> {formatDate(cl.expiry_date)}
                                                      </span>
                                                    ) : formatDate(cl.expiry_date)}
                                                </td>
                                                <td className="py-1 pr-4 text-right">{cl.qty}</td>
                                                <td className="py-1 pr-4 text-right text-muted-foreground">
                                                  {cl.lot_id != null ? formatCurrency(cl.cost_price ?? 0) : '—'}
                                                </td>
                                                <td className="py-1 text-right">
                                                  {cl.lot_id != null ? formatCurrency(lineCost) : '—'}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </motion.div>
                                </TableCell>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      )
                    })}
                    {/* Slack-absorber — keeps tfoot pinned to the actual
                        container bottom when data rows don't fill the 450px.
                        Uses a raw <tr> so TableRow's border-b doesn't add a
                        stray separator above the empty band. */}
                    <tr aria-hidden><td colSpan={9} className="h-full p-0" /></tr>
                  </TableBody>
                  {/* Pinned totals: each <td> is sticky (per-cell, not <tr> —
                      sticky on <tr>/<tfoot> is flaky in Chromium). Single
                      row aligns values directly under their column headers
                      (ส่วนลด → col 6, รวม → col 7, ต้นทุน → col 8, กำไร → col 9). */}
                  <tfoot>
                    <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-border">
                      <td colSpan={4} className="py-2" />
                      <td className="pr-2 py-2 text-right text-sm font-bold">ยอดสุทธิ</td>
                      <td className="px-2 py-2 text-right text-sm font-medium text-warning-strong">
                        {detail.total_discount > 0 ? `-${formatCurrency(detail.total_discount)}` : '0'}
                      </td>
                      <td className="pr-2 py-2 text-right font-bold text-primary">{formatCurrency(detail.total_amount)}</td>
                      <td className="pr-2 py-2 text-right text-sm text-muted-foreground">
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.item_cost ?? 0), 0))}
                      </td>
                      <td className={`pr-4 py-2 text-right font-bold ${profitColor(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}`}>
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            </DialogBody>
            <DialogFooter className="sm:items-center">
              {detail.sale_type === 'return' && detail.note && (
                <div className="mr-auto text-sm text-left">
                  <span className="font-medium text-muted-foreground">เหตุผลรับคืนสินค้า:</span>{' '}
                  <span className="text-foreground">{detail.note}</span>
                </div>
              )}
              {onVoidRequest && detail.status !== 'voided' && detail.sale_type !== 'return' && (
                <Button size="xl" variant="destructive" onClick={() => onVoidRequest(detail)}>
                  <Ban className="size-4 mr-1.5" /> ยกเลิกบิล
                </Button>
              )}
              <Button size="xl" variant="elevated" onClick={() => onOpenChange(false)}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
