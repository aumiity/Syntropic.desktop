import { Fragment, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Ban, ChevronRight, Boxes, Printer, FileText, UserPen } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { printSlip, resolveSlipMode } from '@/lib/receipt/print'
import { saleDetailToPrint } from '@/lib/receipt/normalizeSale'
import { TaxInvoiceBuyerDialog } from '@/components/dialogs/TaxInvoiceBuyerDialog'
import { CustomerSearchDialog } from '@/components/dialogs/CustomerSearchDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { useShopVat } from '@/hooks/useShopVat'
import type { Sale, SaleItem, Customer } from '@/types'

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
  customer_id_card?: string
  customer_address?: string
  customer_branch?: string
  tax_original_printed?: number | null
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
  open, onOpenChange, invoiceNo, onVoidRequest, onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNo: string | null
  onVoidRequest?: (sale: SaleDetail) => void
  /** Fired after the bill's customer is reassigned or a tax invoice is issued. */
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const { vatEnabled, vatRate } = useShopVat()
  const ov = useManagerOverride()
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [taxOpen, setTaxOpen] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  // Customer picked in the search dialog but NOT yet committed — drives the
  // confirm step so a misclick doesn't overwrite the bill's customer instantly.
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null)

  const reprintReceipt = async (d: SaleDetail) => {
    const sale = saleDetailToPrint(d)
    const mode = resolveSlipMode(sale)
    const res = await printSlip(sale, mode)
    if (!res.success) toast({ title: 'พิมพ์ใบเสร็จไม่สำเร็จ', description: res.error, variant: 'error' })
  }

  const fetchDetail = (inv: string) => {
    setLoading(true)
    window.api.reports.getSaleByInvoice(inv)
      .then((data: any) => setDetail(data as SaleDetail | null))
      .finally(() => setLoading(false))
  }

  // Runs only after the user confirms the change in the ConfirmDialog. Still
  // goes through manager-override (admin password) on the backend.
  const commitReassign = () => {
    const c = pendingCustomer
    if (!c || !detail) return
    setPendingCustomer(null)
    ov.run(
      async (o) => { await window.api.reports.updateSaleCustomer({ sale_id: detail.id, customer_id: c.id }, o) },
      {
        title: 'แก้ไขลูกค้าของบิล',
        onDone: () => {
          toast({ title: 'แก้ไขลูกค้าของบิลแล้ว', variant: 'success' })
          fetchDetail(detail.invoice_no)
          onChanged?.()
        },
        onError: (e: any) => toast({ title: 'แก้ไขลูกค้าไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }),
      },
    )
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

  // A printed-original tax invoice locks the bill: no void, no customer change.
  const locked = detail?.tax_original_printed === 1
  const taxEligible = !!detail && vatEnabled && detail.total_vat > 0
    && detail.status !== 'voided' && detail.sale_type !== 'return'
  // Customer reassignment works on ANY bill the backend accepts (not just VAT
  // ones) — it only rejects voided / return / locked-tax-original bills, so
  // mirror exactly those guards here.
  const canReassign = !!detail && !locked
    && detail.status !== 'voided' && detail.sale_type !== 'return'

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
              <div className="flex items-center justify-between gap-3 pr-10">
                <DialogTitle className="flex items-center gap-3">
                  <span>{detail.invoice_no}</span>
                  {detail.status === 'voided'
                    ? <Badge variant="destructive-outline">ยกเลิกแล้ว</Badge>
                    : <Badge variant="success-outline">สำเร็จ</Badge>}
                  {vatEnabled && detail.total_vat > 0 && <Badge variant="info-outline">VAT</Badge>}
                </DialogTitle>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="icon-lg" variant="elevated" tooltip="พิมพ์ใบเสร็จ" onClick={() => reprintReceipt(detail)}>
                    <Printer className="size-4" />
                  </Button>
                  {taxEligible && (
                    <Button size="icon-lg" variant="default" tooltip={locked ? 'พิมพ์สำเนาใบกำกับภาษี' : 'พิมพ์ใบกำกับภาษี'} onClick={() => setTaxOpen(true)}>
                      <FileText className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 border border-border rounded-lg p-3">
                <div><span className="text-muted-foreground">วันที่:</span> <span className="font-medium">{formatDateTime(detail.sold_at)}</span></div>
                <div><span className="text-muted-foreground">พนักงาน:</span> <span className="font-medium">{detail.sold_by_name ?? '—'}</span></div>
                <div><span className="text-muted-foreground">ลูกค้า:</span> <span className="font-medium">{detail.customer_name ?? detail.customer_name_free ?? 'ลูกค้าทั่วไป'}</span></div>
                <div><span className="text-muted-foreground">ประเภทการขาย:</span> <span className="font-medium">{SALE_TYPE_LABELS[detail.sale_type] ?? detail.sale_type}</span></div>
                <div>
                  <span className="text-muted-foreground">รูปแบบการชำระเงิน:</span>{' '}
                  <span className="font-medium">{[
                    detail.cash_amount > 0 && 'เงินสด',
                    detail.card_amount > 0 && 'บัตร',
                    detail.transfer_amount > 0 && 'โอน',
                  ].filter(Boolean).join(', ') || '—'}</span>
                </div>
                {detail.cash_amount > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span><span className="text-muted-foreground">รับเงินมา:</span> <span className="font-medium">{formatCurrency(detail.cash_amount)}</span></span>
                    <span><span className="text-muted-foreground">เงินทอน:</span> <span className="font-medium">{formatCurrency(detail.change_amount)}</span></span>
                  </div>
                )}
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
                            <TableCell className="text-right text-sm text-accent-soft-foreground">
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
                                                  {!cl.expiry_date ? '—' : formatDate(cl.expiry_date)}
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
                      sticky on <tr>/<tfoot> is flaky in Chromium). One sticky
                      row — the customer money summary (มูลค่า/ส่วนลด/ก่อนภาษี/
                      VAT/ยอดสุทธิ) is a vertical list inside the ราคา→รวม span
                      (cols 5-7); the internal ต้นทุน/กำไร grand totals stay
                      column-aligned under their headers (col 8 / col 9),
                      bottom-aligned onto the ยอดสุทธิ baseline. */}
                  <tfoot>
                    <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:z-20 [&>td]:bg-muted [&>td]:border-t [&>td]:border-border">
                      <td colSpan={4} className="py-2" />
                      <td colSpan={3} className="px-3 py-2 align-bottom">
                        <div className="ml-auto max-w-[280px] space-y-1 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">มูลค่าสินค้า</span>
                            <span className="font-medium">{formatCurrency(detail.subtotal)}</span>
                          </div>
                          {detail.total_discount > 0 && (
                            <div className="flex justify-between gap-4 text-accent-soft-foreground">
                              <span>ส่วนลด</span>
                              <span className="font-medium">-{formatCurrency(detail.total_discount)}</span>
                            </div>
                          )}
                          {detail.total_vat > 0 && (
                            <>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">มูลค่าก่อนภาษี</span>
                                <span className="font-medium">{formatCurrency(detail.total_amount - detail.total_vat)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">ภาษีมูลค่าเพิ่ม {vatRate}%</span>
                                <span className="font-medium">{formatCurrency(detail.total_vat)}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between gap-4 border-t border-border pt-1">
                            <span className="font-bold">ยอดสุทธิ</span>
                            <span className="font-bold text-primary">{formatCurrency(detail.total_amount)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="pr-2 py-2 text-right text-sm text-muted-foreground align-bottom">
                        {formatCurrency(detail.items.reduce((s, i) => s + (i.item_cost ?? 0), 0))}
                      </td>
                      <td className={`pr-4 py-2 text-right font-bold align-bottom ${profitColor(detail.items.reduce((s, i) => s + (i.line_total - (i.item_cost ?? 0)), 0))}`}>
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
              {canReassign && (
                <Button size="xl" variant="elevated" className="mr-auto" onClick={() => setReassignOpen(true)}>
                  <UserPen className="size-4 mr-1.5" /> แก้ไขลูกค้า
                </Button>
              )}
              {onVoidRequest && detail.status !== 'voided' && detail.sale_type !== 'return' && (
                <div className={`flex items-center gap-2 ${canReassign ? '' : 'mr-auto'}`}>
                  <Button size="xl" variant="destructive" disabled={locked} onClick={() => onVoidRequest(detail)}>
                    <Ban className="size-4 mr-1.5" /> ยกเลิก
                  </Button>                  
                </div>
              )}
              <Button size="xl" variant="default" onClick={() => onOpenChange(false)}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      {detail && (
        <TaxInvoiceBuyerDialog
          open={taxOpen}
          onOpenChange={setTaxOpen}
          saleId={detail.id}
          sale={saleDetailToPrint(detail)}
          buyer={{
            name: detail.customer_name ?? '',
            address: detail.customer_address ?? '',
            taxId: detail.customer_id_card ?? '',
            branch: detail.customer_branch ?? '',
          }}
          onIssued={() => { fetchDetail(detail.invoice_no); onChanged?.() }}
        />
      )}
      {detail && (
        <CustomerSearchDialog
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          showWalkIn={false}
          onSelect={c => { if (c) setPendingCustomer(c) }}
        />
      )}
      <ConfirmDialog
        variant="default"
        open={!!pendingCustomer}
        onOpenChange={o => { if (!o) setPendingCustomer(null) }}
        title="แก้ไขรายชื่อลูกค้า"
        description="กรุณาตรวจสอบข้อมูลให้ถูกต้อง"
        confirmLabel="ยืนยัน"
        onConfirm={commitReassign}
        content={pendingCustomer && detail && (
          <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground shrink-0">เลขที่บิล</span>
              <span className="font-semibold">{detail.invoice_no}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground shrink-0">ลูกค้าเดิม</span>
              <span className="font-medium text-right">{detail.customer_name ?? detail.customer_name_free ?? 'ลูกค้าทั่วไป'}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground shrink-0">เปลี่ยนเป็น</span>
              <span className="font-semibold text-primary text-right">{pendingCustomer.full_name}</span>
            </div>
          </div>
        )}
      />
      {ov.dialog}
    </Dialog>
  )
}
