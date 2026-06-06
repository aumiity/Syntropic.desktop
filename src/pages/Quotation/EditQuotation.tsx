import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { DateInput } from '@/components/ui/date-input'
import { TintIcon } from '@/components/ui/tint-icon'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { QuotationProductSearchDialog, type PickedProduct } from '@/components/dialogs/QuotationProductSearchDialog'
import { CustomerSearchDialog } from '@/components/dialogs/CustomerSearchDialog'
import { CustomerFormDialog } from '@/components/dialogs/CustomerFormDialog'
import { printQuotation, previewQuotation } from '@/lib/receipt/print'
import { useQuotationConvert } from '@/lib/quotation/useConvert'
import { extractVat } from '@/lib/vat'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getCurrentUserId } from '@/stores/userStore'
import type { Customer, QuotationForPrint, QuotationItem } from '@/types'
import { ArrowLeft, Save, Printer, FileText, Plus, Trash2, UserSearch, UserPlus, User, ShoppingCart, Play, X, Package, Ban } from 'lucide-react'

// Statuses from which the document can be canceled (terminal). Mirrors the IPC guard.
const CANCELABLE = ['draft', 'sent', 'accepted']

interface LineRow extends QuotationItem {}

const STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง', sent: 'รอตอบรับ', accepted: 'ยอมรับ', rejected: 'ปฏิเสธ', expired: 'พ้นกำหนด', canceled: 'ยกเลิก', converting: 'กำลังแปลง', converted: 'แปลงเป็นบิลแล้ว',
}
const STATUS_VARIANT: Record<string, any> = {
  draft: 'neutral-outline', sent: 'info-outline', accepted: 'success-outline', rejected: 'destructive-outline', expired: 'warning-outline', canceled: 'muted-outline', converting: 'warning-outline', converted: 'violet-outline',
}

// valid_until in the past while still draft/sent → display as expired (พ้นกำหนด).
const effectiveStatus = (status: string, validUntil: string | null | undefined): string =>
  (status === 'draft' || status === 'sent') && validUntil && validUntil.slice(0, 10) < dayjs().format('YYYY-MM-DD')
    ? 'expired' : status

export default function EditQuotation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const convert = useQuotationConvert()

  const [quoteId, setQuoteId] = useState<number | null>(id ? Number(id) : null)
  const [quoteNo, setQuoteNo] = useState<string>('')
  const [issueDate, setIssueDate] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [status, setStatus] = useState<string>('draft')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerTaxId, setCustomerTaxId] = useState('')
  const [validUntil, setValidUntil] = useState<string>(dayjs().add(30, 'day').format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [convertedInvoiceNo, setConvertedInvoiceNo] = useState<string | null>(null)
  const [items, setItems] = useState<LineRow[]>([])
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState(7)

  const [saving, setSaving] = useState(false)
  const [busyPrint, setBusyPrint] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const readOnly = status !== 'draft'
  const disp = effectiveStatus(status, validUntil)   // shows พ้นกำหนด when past ครบกำหนด

  // Load existing quote, or seed VAT snapshot from sales_settings for a new one.
  useEffect(() => {
    if (quoteId) {
      window.api.quotation.get(quoteId).then((q: any) => {
        if (!q) { toast({ title: 'ไม่พบใบเสนอราคา', variant: 'error' }); navigate('/quotation'); return }
        setQuoteNo(q.quote_no); setIssueDate(q.issue_date?.slice(0, 10) ?? '')
        setStatus(q.status); setCustomerId(q.customer_id ?? null)
        setCustomerName(q.customer_name ?? ''); setCustomerAddress(q.customer_address ?? ''); setCustomerTaxId(q.customer_tax_id ?? '')
        setValidUntil(q.valid_until?.slice(0, 10) ?? '')
        setNote(q.note ?? ''); setItems(q.items ?? [])
        setConvertedInvoiceNo(q.converted_invoice_no ?? null)
        setVatEnabled(q.vat_enabled === 1); setVatRate(q.vat_rate ?? 7)
      })
    } else {
      window.api.settings.getSalesSettings().then((s: any) => {
        if (s) { setVatEnabled(s.vat_enabled === 1); setVatRate(s.vat_rate ?? 7) }
      })
    }
  }, [quoteId])

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
    const totalDiscount = items.reduce((s, i) => s + (i.discount || 0), 0)
    const totalAmount = items.reduce((s, i) => s + i.line_total, 0)
    const totalVat = vatEnabled ? extractVat(totalAmount, vatRate) : 0
    return { subtotal, totalDiscount, totalAmount, totalVat, exVat: totalAmount - totalVat }
  }, [items, vatEnabled, vatRate])

  const recalcLine = (r: LineRow): LineRow => ({ ...r, line_total: Math.max(0, r.qty * r.unit_price - (r.discount || 0)) })
  const updateItem = (idx: number, patch: Partial<LineRow>) =>
    setItems(arr => arr.map((it, i) => i === idx ? recalcLine({ ...it, ...patch }) : it))
  const removeItem = (idx: number) => setItems(arr => arr.filter((_, i) => i !== idx))
  const addPicked = (p: PickedProduct) =>
    setItems(arr => [...arr, recalcLine({ product_id: p.product_id, item_name: p.item_name, unit_name: p.unit_name, qty: 1, unit_price: p.unit_price, discount: 0, line_total: 0 })])

  const pickCustomer = (c: Customer | null) => {
    if (!c) return
    setCustomerId(c.id); setCustomerName(c.full_name ?? '')
    setCustomerAddress(c.address ?? ''); setCustomerTaxId(c.id_card ?? '')
  }

  const handleSave = async (): Promise<number | null> => {
    if (items.length === 0) { toast({ title: 'กรุณาเพิ่มรายการสินค้า', variant: 'error' }); return null }
    setSaving(true)
    try {
      const saved = await window.api.quotation.save({
        id: quoteId ?? undefined,
        customer_id: customerId,
        customer_name: customerName, customer_address: customerAddress, customer_tax_id: customerTaxId,
        valid_until: validUntil || null, note,
        items: items.map(i => ({ product_id: i.product_id ?? null, item_name: i.item_name, unit_name: i.unit_name, qty: i.qty, unit_price: i.unit_price, discount: i.discount || 0, line_total: i.line_total })),
        created_by: getCurrentUserId(),
      }) as any
      toast({ title: 'บันทึกใบเสนอราคาสำเร็จ', variant: 'success' })
      if (!quoteId && saved?.id) {
        setQuoteId(saved.id); setQuoteNo(saved.quote_no); setIssueDate(saved.issue_date?.slice(0, 10) ?? '')
        navigate(`/quotation/${saved.id}/edit`, { replace: true })
      }
      return saved?.id ?? quoteId
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      return null
    } finally { setSaving(false) }
  }

  // Build the print payload from current (saved) state.
  const buildForPrint = (): QuotationForPrint => ({
    id: quoteId!, quote_no: quoteNo, customer_id: customerId,
    customer_name: customerName, customer_address: customerAddress, customer_tax_id: customerTaxId,
    issue_date: issueDate, valid_until: validUntil, status: status as any,
    vat_enabled: vatEnabled ? 1 : 0, vat_rate: vatRate,
    subtotal: totals.subtotal, total_discount: totals.totalDiscount, total_vat: totals.totalVat, total_amount: totals.totalAmount,
    note, items,
  })

  const handlePreview = async () => {
    if (busyPrint) return
    setBusyPrint(true)
    try {
      const res = await previewQuotation(buildForPrint())
      if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setBusyPrint(false) }
  }
  const handlePrint = async () => {
    if (busyPrint) return
    setBusyPrint(true)
    try {
      const res = await printQuotation(buildForPrint())
      if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
      else toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setBusyPrint(false) }
  }

  const cancelConversion = async () => {
    if (!quoteId) return
    try {
      await window.api.quotation.releaseConversion(quoteId)
      toast({ title: 'ยกเลิกการแปลงแล้ว', variant: 'success' })
      setStatus('accepted')
    } catch (e: any) { toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }) }
  }

  // Cancel the whole document (terminal). Allowed from draft/sent/accepted.
  const doCancelDoc = async () => {
    if (!quoteId) return
    try {
      await window.api.quotation.setStatus({ id: quoteId, status: 'canceled' })
      toast({ title: 'ยกเลิกเอกสารแล้ว', variant: 'success' })
      setStatus('canceled')
    } catch (e: any) { toast({ title: 'ยกเลิกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }) }
  }

  const canPrint = !!quoteId && items.length > 0

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title={quoteNo || 'ใบเสนอราคาใหม่'} />

      {/* Two-column working layout (mirrors the GR/Purchase page): left = header
          fields + full-height line-items table; right = summary + note + actions.
          Only the table body scrolls; the total bar stays pinned. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex gap-4 items-stretch flex-1 min-h-0">

          {/* ── Left: customer/doc fields + line items ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">

            {/* Header fields */}
            <div className="bg-card rounded-card shadow-card border border-border p-4 shrink-0">
              <div className="grid grid-cols-2 gap-4">
                {/* Customer — read-only display; chosen via search / created via add */}
                <div className="space-y-2">
                  <label className="block text-base font-semibold text-muted-foreground">ลูกค้า</label>
                  <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 min-h-[72px]">
                    <span className="grid place-items-center size-10 rounded-full shrink-0 bg-primary text-primary-foreground">
                      <User className="size-5" />
                    </span>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className={`text-sm truncate ${customerName ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {customerName || 'ยังไม่ได้เลือกลูกค้า'}
                      </div>
                      {customerAddress && <div className="text-sm text-muted-foreground line-clamp-2">{customerAddress}</div>}
                      {customerTaxId && <div className="text-sm text-muted-foreground truncate">เลขผู้เสียภาษี {customerTaxId}</div>}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="elevated" onClick={() => setCustomerOpen(true)} className="h-10 gap-1.5">
                        <UserSearch className="size-4" /> เลือกลูกค้า
                      </Button>
                      <Button onClick={() => setQuickAddOpen(true)} className="h-10 gap-1.5">
                        <UserPlus className="size-4" /> เพิ่มลูกค้า
                      </Button>
                    </div>
                  )}
                </div>
                {/* Document */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-base font-semibold text-muted-foreground mb-1.5">วันที่ออก</label>
                    <Input variant="elevated" value={issueDate ? formatDate(issueDate) : 'วันนี้ (เมื่อบันทึก)'} readOnly disabled className="h-10 text-sm" />
                  </div>
                  <div>
                    <label className="block text-base font-semibold text-muted-foreground mb-1.5">ครบกำหนด</label>
                    <DateInput variant="elevated" value={validUntil} onChange={setValidUntil} disabled={readOnly} className="h-10 text-sm" />
                  </div>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-card rounded-card shadow-card border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="px-4 h-12 shrink-0 flex items-center gap-3">
                <div className="flex items-center gap-3 shrink-0">
                  <TintIcon icon={Package} tint="neutral" size="sm" />
                  <h3 className="text-lg font-semibold text-foreground">รายการสินค้า</h3>
                  <Badge variant="neutral-outline">{items.length.toLocaleString()}</Badge>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  {!readOnly && (
                    <Button size="lg" variant="elevated" onClick={() => setProductOpen(true)} className="h-9 rounded-lg text-sm gap-1.5">
                      <Plus className="size-3.5" /> เพิ่มสินค้า
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead className="px-3 text-center w-10">#</TableHead>
                      <TableHead className="px-3 w-[34%]">รายการ</TableHead>
                      <TableHead className="px-3 text-center w-[12%]">หน่วย</TableHead>
                      <TableHead className="px-3 text-right w-[12%]">จำนวน</TableHead>
                      <TableHead className="px-3 text-right w-[14%]">ราคา/หน่วย</TableHead>
                      <TableHead className="px-3 text-right w-[12%]">ส่วนลด</TableHead>
                      <TableHead className="px-3 text-right w-[13%]">รวม</TableHead>
                      {!readOnly && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={readOnly ? 7 : 8} className="text-center text-muted-foreground py-10">ยังไม่มีรายการ</TableCell>
                      </TableRow>
                    ) : items.map((it, i) => (
                      <TableRow key={i} className="border-0 hover:bg-transparent">
                        <TableCell className="px-3 py-1.5 text-sm text-foreground-subtle text-center">{i + 1}</TableCell>
                        <TableCell className="px-3 py-1.5 text-sm font-medium truncate">{it.item_name}</TableCell>
                        <TableCell className="px-3 py-1.5 text-center text-sm">{it.unit_name}</TableCell>
                        <TableCell className="px-2 py-1.5 text-right">
                          <PriceInput value={it.qty} decimals={0} onChange={v => updateItem(i, { qty: parseFloat(v) || 0 })} disabled={readOnly} className="h-8 w-full text-right" />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right">
                          <PriceInput value={it.unit_price} onChange={v => updateItem(i, { unit_price: parseFloat(v) || 0 })} disabled={readOnly} className="h-8 w-full text-right" />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right">
                          <PriceInput value={it.discount} onChange={v => updateItem(i, { discount: parseFloat(v) || 0 })} disabled={readOnly} className="h-8 w-full text-right" />
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-right text-sm font-medium">{formatCurrency(it.line_total)}</TableCell>
                        {!readOnly && (
                          <TableCell className="px-1 py-1.5">
                            <Button variant="elevated" size="icon" onClick={() => removeItem(i)} className="size-7 rounded text-foreground-subtle hover:text-destructive">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* ── Footer bar — pinned at bottom of the card ── */}
              <div className="shrink-0">
                {(totals.totalDiscount > 0 || vatEnabled) && (
                  <div className="bg-card px-5 py-1 space-y-0.5">
                    <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                      <span>ยอดรวม</span><span className="w-32 text-right">{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {totals.totalDiscount > 0 && (
                      <div className="flex items-center justify-end gap-6 text-sm text-warm-foreground">
                        <span>ส่วนลด</span><span className="w-32 text-right">−{formatCurrency(totals.totalDiscount)}</span>
                      </div>
                    )}
                    {vatEnabled && (<>
                      <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                        <span>มูลค่าก่อนภาษี</span><span className="w-32 text-right">{formatCurrency(totals.exVat)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-6 text-sm text-muted-foreground">
                        <span>ภาษีมูลค่าเพิ่ม {vatRate}%</span><span className="w-32 text-right">{formatCurrency(totals.totalVat)}</span>
                      </div>
                    </>)}
                  </div>
                )}
                <div className="h-12 px-5 bg-card border-t border-border flex items-center justify-between gap-3">
                  <Badge variant="primary-soft" className="text-sm rounded-md">{items.length} รายการ</Badge>
                  <div className="flex items-center gap-6">
                    <span className="text-sm font-semibold text-foreground">รวมทั้งสิ้น</span>
                    <span className="font-extrabold text-primary text-base w-32 text-right">{formatCurrency(totals.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>{/* end left */}

          {/* ── Right sidebar ── */}
          <div className="w-64 shrink-0 overflow-y-auto scrollbar-thin [scrollbar-gutter:stable] space-y-3 pr-1">

            {/* Summary */}
            <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-2.5">
              <div className="text-sm font-bold text-foreground uppercase tracking-wide">สรุปใบเสนอราคา</div>
              <div>
                <div className="text-sm text-foreground-subtle mb-0.5">เลขที่เอกสาร</div>
                <div className="text-sm font-bold text-primary">{quoteNo || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-foreground-subtle mb-1">สถานะ</div>
                <Badge variant={STATUS_VARIANT[disp] ?? 'secondary'}>{STATUS_LABEL[disp] ?? disp}</Badge>
              </div>
              {status === 'converted' && convertedInvoiceNo && (
                <div className="text-sm text-muted-foreground">แปลงเป็นบิล <span className="font-medium text-foreground">{convertedInvoiceNo}</span></div>
              )}
              {status === 'canceled' && (
                <div className="text-sm text-muted-foreground">เอกสารถูกยกเลิกแล้ว — ใช้งานต่อไม่ได้</div>
              )}
              {readOnly && status !== 'converted' && status !== 'canceled' && (
                <div className="text-sm text-muted-foreground">ใบนี้พ้นสถานะร่างแล้ว — แก้ไขไม่ได้ (ดู/พิมพ์ได้)</div>
              )}
            </div>

            {/* Note */}
            <div className="bg-card rounded-card shadow-card border border-border p-4 space-y-2">
              <div className="text-sm font-bold text-foreground uppercase tracking-wide">หมายเหตุ</div>
              <Textarea variant="elevated" value={note} onChange={e => setNote(e.target.value)} disabled={readOnly} placeholder="บันทึกเพิ่มเติม..." rows={3} className="resize-none text-sm" />
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {!readOnly && (
                <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl text-base font-bold gap-1.5">
                  <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </Button>
              )}
              {status === 'accepted' && quoteId && (
                <Button onClick={() => convert.start(quoteId)} className="w-full h-12 rounded-xl text-base font-bold gap-1.5">
                  <ShoppingCart className="size-4" /> แปลงเป็นการขาย
                </Button>
              )}
              {status === 'converting' && quoteId && (
                <>
                  <Button onClick={() => convert.start(quoteId)} className="w-full h-12 rounded-xl text-base font-bold gap-1.5">
                    <Play className="size-4" /> ดำเนินการขายต่อ
                  </Button>
                  <Button variant="elevated" onClick={cancelConversion} className="w-full h-10 rounded-xl text-sm gap-1.5">
                    <X className="size-4" /> ยกเลิกการแปลง
                  </Button>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="elevated" onClick={handlePreview} disabled={!canPrint || busyPrint} className="h-10 rounded-xl text-sm gap-1.5">
                  <FileText className="size-4" /> ตัวอย่าง
                </Button>
                <Button variant="elevated" onClick={handlePrint} disabled={!canPrint || busyPrint} className="h-10 rounded-xl text-sm gap-1.5">
                  <Printer className="size-4" /> พิมพ์
                </Button>
              </div>
              <Button variant="elevated" onClick={() => navigate('/quotation')} className="w-full h-10 rounded-xl text-sm gap-1.5">
                <ArrowLeft className="size-4" /> กลับ
              </Button>
              {quoteId && CANCELABLE.includes(status) && (
                <Button variant="destructive2" onClick={() => setCancelOpen(true)} className="w-full h-10 rounded-xl text-sm gap-1.5">
                  <Ban className="size-4" /> ยกเลิกเอกสาร
                </Button>
              )}
            </div>

          </div>{/* end sidebar */}
        </div>{/* end flex row */}
      </div>

      <QuotationProductSearchDialog open={productOpen} onOpenChange={setProductOpen} onPick={addPicked} />
      <CustomerSearchDialog open={customerOpen} onOpenChange={setCustomerOpen} onSelect={pickCustomer} />
      <CustomerFormDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} onSaved={pickCustomer} />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        variant="destructive"
        title="ยกเลิกเอกสารนี้?"
        description={`${quoteNo} — ยกเลิกแล้วจะนำกลับมาใช้งานไม่ได้`}
        confirmLabel="ยกเลิกเอกสาร"
        cancelLabel="ย้อนกลับ"
        onConfirm={doCancelDoc}
      />
      {convert.dialogs}
    </div>
  )
}
