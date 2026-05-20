import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Ban, ChevronDown, ChevronRight, Undo2, Boxes } from 'lucide-react'
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
//
// Phase 2 additions:
// - Bundle rows show an expand chevron revealing component_lots underneath.
// - Bundle rows have a "คืนชุดนี้" button (per-row) that calls pos:returnBundle
//   via ConfirmDialog (requires reason). Disabled when sale is voided or
//   item is already cancelled.
export function SaleDetailDialog({
  open, onOpenChange, invoiceNo, onVoidRequest, onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNo: string | null
  onVoidRequest?: (sale: SaleDetail) => void
  // Optional callback fired after a bundle return successfully completes —
  // lets the host page (Manage/Sales, POS) refresh its own list.
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const currentUser = useUserStore(s => s.current)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [returnTarget, setReturnTarget] = useState<BundleSaleItem | null>(null)

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

  const handleReturnConfirm = async (reason?: string) => {
    if (!returnTarget || !invoiceNo) return
    try {
      const r = await window.api.pos.returnBundle({
        sale_item_id: returnTarget.id,
        reason: reason ?? '',
        created_by: currentUser?.id ?? 0,
      }) as any
      toast({
        title: 'คืนชุดสินค้าสำเร็จ',
        description: `บิลคืน: ${r?.invoice_no ?? ''}`,
        variant: 'success',
      })
      setReturnTarget(null)
      // Refetch so the bundle row shows line-through and the buttons hide.
      fetchDetail(invoiceNo)
      onChanged?.()
    } catch (e: any) {
      toast({ title: 'คืนชุดสินค้าไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      setReturnTarget(null)
    }
  }

  const canReturn = (item: BundleSaleItem): boolean => {
    if (!onVoidRequest) return false  // host page doesn't expose mutation actions
    if (detail?.status === 'voided') return false
    // RT- bills (sale_type='return') already represent a return — clicking
    // "คืนชุด" on the negative bundle line inside one would re-process it
    // through pos:returnBundle and actually deduct stock instead of restoring.
    // The backend now rejects this too (qty<=0 check), but hide the button
    // from the operator entirely so they never see an option that throws.
    if (detail?.sale_type === 'return') return false
    if (item.qty <= 0) return false
    if (item.is_cancelled === 1) return false
    return item.is_bundle === 1
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl">
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
                <div className="col-span-2 flex items-center gap-2">
                  <span className="text-muted-foreground">การชำระเงิน:</span>
                  {(() => {
                    const methods = [
                      detail.cash_amount > 0 && { label: 'เงินสด', variant: 'success' as const },
                      detail.card_amount > 0 && { label: 'บัตร', variant: 'info-soft' as const },
                      detail.transfer_amount > 0 && { label: 'โอน', variant: 'warm' as const },
                    ].filter(Boolean) as { label: string; variant: 'success' | 'info-soft' | 'warm' }[]
                    return methods.length > 0
                      ? methods.map(m => (
                          <Badge key={m.label} variant={m.variant}>
                            {m.label}
                          </Badge>
                        ))
                      : <span className="font-medium">—</span>
                  })()}
                </div>
                {detail.change_amount > 0 && <div><span className="text-muted-foreground">เงินทอน:</span> <span className="font-medium">{formatCurrency(detail.change_amount)}</span></div>}
                {detail.void_reason && (
                  <div className="col-span-2 text-destructive"><span className="font-medium">เหตุผลยกเลิก:</span> {detail.void_reason}</div>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                {/* ~10 rows visible: header h-10 (40) + 10×~33 + sticky tfoot (~72) */}
                <Table containerClassName="max-h-[450px]" className="border-separate border-spacing-0">
                  {/* Divider rides with the sticky header — works because the
                      <Table> is border-separate (collapse model strands cell
                      borders behind sticking cells). Same pattern as the
                      pinned tfoot's border-t below. */}
                  <TableHeader className="[&_th]:border-b [&_th]:border-border">
                    <TableRow>
                      <TableHead className="text-center w-8">#</TableHead>
                      <TableHead>รายการ</TableHead>
                      <TableHead className="text-center">หน่วย</TableHead>
                      <TableHead className="text-right">จำนวน</TableHead>
                      <TableHead className="text-right">ราคา/หน่วย</TableHead>
                      <TableHead className="text-right">ส่วนลด</TableHead>
                      <TableHead className="text-right">รวม</TableHead>
                      <TableHead className="text-right">ต้นทุน</TableHead>
                      <TableHead className="text-right">กำไร</TableHead>
                      <TableHead className="text-center w-24">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item, i) => {
                      const profit = item.line_total - (item.item_cost ?? 0)
                      const isBundle = item.is_bundle === 1
                      const isExpanded = expanded.has(item.id)
                      const dimmed = item.is_cancelled ? 'opacity-40 line-through' : ''
                      return (
                        <>
                          <TableRow key={item.id} className={dimmed}>
                            <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {isBundle && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(item.id)}
                                    className="shrink-0 inline-flex items-center justify-center size-5 rounded hover:bg-muted"
                                    title={isExpanded ? 'ย่อ' : 'ดูส่วนประกอบ'}
                                  >
                                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                  </button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm flex items-center gap-2">
                                    {isBundle && <Badge variant="tertiary" className="shrink-0"><Boxes className="size-3 mr-1" />ชุด</Badge>}
                                    <span className="truncate">{item.item_name}</span>
                                  </div>
                                  {item.item_note && <div className="text-sm text-muted-foreground">{item.item_note}</div>}
                                </div>
                              </div>
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
                            <TableCell className="text-center">
                              {canReturn(item) ? (
                                <Button
                                  size="sm"
                                  variant="warm"
                                  onClick={() => setReturnTarget(item)}
                                  title="คืนชุดนี้"
                                  className="h-8 px-2 gap-1"
                                >
                                  <Undo2 className="size-3.5" /> คืนชุด
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                          {isBundle && isExpanded && item.component_lots && item.component_lots.length > 0 && (
                            <TableRow key={`${item.id}-components`} className="bg-muted/20">
                              <TableCell colSpan={10} className="py-2">
                                <div className="pl-8 pr-2">
                                  <div className="text-xs text-muted-foreground mb-1.5 font-semibold">ส่วนประกอบ (FEFO):</div>
                                  <table className="w-full text-sm">
                                    <thead className="text-xs text-muted-foreground">
                                      <tr className="text-left">
                                        <th className="py-1 pr-4">ส่วนประกอบ</th>
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
                                            <td className="py-1 pr-4">{cl.component_name ?? '—'}</td>
                                            <td className="py-1 pr-4 font-mono text-xs">
                                              {cl.lot_id == null
                                                ? <span className="text-destructive">ไม่มีล็อต (ขายเกิน)</span>
                                                : (cl.lot_number ?? '—')}
                                            </td>
                                            <td className="py-1 pr-4">{cl.expiry_date ?? '—'}</td>
                                            <td className="py-1 pr-4 text-right tabular-nums">{cl.qty}</td>
                                            <td className="py-1 pr-4 text-right tabular-nums text-muted-foreground">
                                              {cl.lot_id != null ? formatCurrency(cl.cost_price ?? 0) : '—'}
                                            </td>
                                            <td className="py-1 text-right tabular-nums">
                                              {cl.lot_id != null ? formatCurrency(lineCost) : '—'}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )
                    })}
                  </TableBody>
                  {/* Pinned totals: each <td> is sticky (per-cell, not <tr> —
                      sticky on <tr>/<tfoot> is flaky in Chromium). Upper row
                      sits at bottom-9 (≈ height of the lower row); opaque
                      bg-muted so scrolling rows don't bleed through. */}
                  <tfoot>
                    <tr className="[&>td]:sticky [&>td]:bottom-9 [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-b [&>td]:border-border">
                      <td colSpan={5} className="px-4 py-2" />
                      <td className="px-4 py-2 text-right text-sm font-medium text-muted-foreground">รวมส่วนลด</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-warning-strong">
                        {detail.total_discount > 0 ? `-${formatCurrency(detail.total_discount)}` : '—'}
                      </td>
                      <td colSpan={3} />
                    </tr>
                    <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:z-20 [&>td]:bg-muted">
                      <td colSpan={5} className="px-4 py-2" />
                      <td className="px-4 py-2 text-right text-sm font-bold">ยอดสุทธิ</td>
                      <td className="px-4 py-2 text-right font-bold text-primary">{formatCurrency(detail.total_amount)}</td>
                      <td className="px-4 py-2 text-right text-sm text-muted-foreground">
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.item_cost ?? 0), 0))}
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${profitColor(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}`}>
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </Table>
              </div>
            </DialogBody>
            <DialogFooter>
              {onVoidRequest && detail.status !== 'voided' && (
                <Button size="xl" variant="destructive" onClick={() => onVoidRequest(detail)}>
                  <Ban className="size-4 mr-1.5" /> ยกเลิกบิล
                </Button>
              )}
              <Button size="xl" variant="destructive2" onClick={() => onOpenChange(false)}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={!!returnTarget}
      onOpenChange={o => { if (!o) setReturnTarget(null) }}
      title="คืนชุดสินค้า"
      description={returnTarget
        ? `คืนชุด "${returnTarget.item_name}" จากบิล ${invoiceNo}? ส่วนประกอบทั้งหมดจะถูกคืนกลับสต็อกที่ล็อตเดิมโดยอัตโนมัติ และจะออกบิลคืน (RT-) ให้ใหม่`
        : ''}
      confirmLabel="คืนชุด"
      variant="destructive"
      requireReason
      reasonLabel="เหตุผลการคืน"
      reasonPresets={['ลูกค้าคืนสินค้า', 'คีย์ผิด', 'สินค้าชำรุด']}
      onConfirm={handleReturnConfirm}
    />
    </>
  )
}
