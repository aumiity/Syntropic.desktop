import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DateInput } from '@/components/ui/date-input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog'
import { SearchInput } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { QuotationProductSearchDialog, type PickedProduct } from '@/components/dialogs/QuotationProductSearchDialog'
import { printQuotation, previewQuotation } from '@/lib/receipt/print'
import { useQuotationConvert } from '@/lib/quotation/useConvert'
import { extractVat } from '@/lib/vat'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getCurrentUserId } from '@/stores/userStore'
import type { QuotationForPrint, QuotationItem } from '@/types'
import { ArrowLeft, Save, Printer, FileText, Plus, Trash2, UserSearch, ShoppingCart, Play, X } from 'lucide-react'

interface LineRow extends QuotationItem {}

const STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง', sent: 'ส่งแล้ว', accepted: 'ตอบรับ', rejected: 'ปฏิเสธ', converting: 'กำลังแปลง', converted: 'แปลงเป็นบิลแล้ว',
}
const STATUS_VARIANT: Record<string, any> = {
  draft: 'neutral-outline', sent: 'info-outline', accepted: 'success-outline', rejected: 'destructive-outline', converting: 'warning-outline', converted: 'violet-outline',
}

// Inline customer picker — searches via pos:searchCustomers and returns the
// full row (full_name / address / id_card) for prefill.
function CustomerPickDialog({ open, onOpenChange, onPick }: {
  open: boolean; onOpenChange: (o: boolean) => void; onPick: (c: any) => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { if (open) { setQ(''); setRows([]) } }, [open])
  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const term = q.trim()
      if (!term) { setRows([]); return }
      setRows((await window.api.pos.searchCustomers(term)) as any[])
    }, 250)
    return () => clearTimeout(t)
  }, [q, open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" divided onClose={() => onOpenChange(false)}>
        <DialogHeader><DialogTitle>เลือกลูกค้า</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <SearchInput variant="elevated" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ / เบอร์ / รหัสลูกค้า..." className="h-10" autoFocus />
          <div className="h-72 overflow-y-auto scrollbar-thin rounded-lg border border-border divide-y divide-border">
            {q.trim() && rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบลูกค้า</div>
            ) : rows.map(c => (
              <button key={c.id} type="button" onClick={() => { onPick(c); onOpenChange(false) }}
                className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors">
                <div className="text-sm font-medium text-foreground">{c.full_name}</div>
                <div className="text-xs text-muted-foreground">{[c.code, c.phone].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

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

  const readOnly = status !== 'draft'

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

  const pickCustomer = (c: any) => {
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

  const canPrint = !!quoteId && items.length > 0

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title={quoteNo || 'ใบเสนอราคาใหม่'} />

      {/* Action bar: status (left) + back/print/save buttons (right). Buttons
          live here — NOT in PageHeader's floating right slot — so they sit a row
          below the title instead of colliding with the window controls. */}
      <TabStrip className="-mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{STATUS_LABEL[status] ?? status}</Badge>
          {status === 'converted' && convertedInvoiceNo && (
            <span className="text-sm text-muted-foreground truncate">แปลงเป็นบิล <span className="font-medium text-foreground">{convertedInvoiceNo}</span></span>
          )}
          {readOnly && status !== 'converted' && <span className="text-sm text-muted-foreground truncate">ใบนี้พ้นสถานะร่างแล้ว — แก้ไขไม่ได้ (ดู/พิมพ์ได้)</span>}
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="elevated" className="h-10" onClick={() => navigate('/quotation')}>
            <ArrowLeft className="size-4" /> กลับ
          </Button>
          <Button variant="elevated" className="h-10" onClick={handlePreview} disabled={!canPrint || busyPrint}>
            <FileText className="size-4" /> ดูตัวอย่าง PDF
          </Button>
          <Button variant="elevated" className="h-10" onClick={handlePrint} disabled={!canPrint || busyPrint}>
            <Printer className="size-4" /> พิมพ์
          </Button>
          {status === 'accepted' && quoteId && (
            <Button className="h-10" onClick={() => convert.start(quoteId)}>
              <ShoppingCart className="size-4" /> แปลงเป็นการขาย
            </Button>
          )}
          {status === 'converting' && quoteId && (
            <>
              <Button className="h-10" onClick={() => convert.start(quoteId)}>
                <Play className="size-4" /> ดำเนินการขายต่อ
              </Button>
              <Button variant="elevated" className="h-10" onClick={cancelConversion}>
                <X className="size-4" /> ยกเลิกการแปลง
              </Button>
            </>
          )}
          {!readOnly && (
            <Button className="h-10" onClick={handleSave} disabled={saving}>
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          )}
        </div>
      </TabStrip>

      <div className="flex-1 min-h-0 overflow-y-auto pt-3 pb-4 [scrollbar-gutter:stable] space-y-4">
        <div className="grid grid-cols-2 gap-4 items-start">
          <SectionCard icon={UserSearch} title="ลูกค้า" tint="primary"
            right={!readOnly && <Button variant="elevated" size="sm" onClick={() => setCustomerOpen(true)}><UserSearch className="size-4" /> ค้นหา</Button>}>
            <div className="space-y-3">
              <FormField label="ชื่อลูกค้า">
                <Input variant="elevated" value={customerName} onChange={e => setCustomerName(e.target.value)} disabled={readOnly} placeholder="ชื่อบุคคล / นิติบุคคล" />
              </FormField>
              <FormField label="ที่อยู่">
                <Textarea variant="elevated" rows={2} className="resize-none" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} disabled={readOnly} />
              </FormField>
              <FormField label="เลขประจำตัวผู้เสียภาษี">
                <Input variant="elevated" value={customerTaxId} onChange={e => setCustomerTaxId(e.target.value)} disabled={readOnly} />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard icon={FileText} title="รายละเอียดเอกสาร" tint="info-soft">
            <div className="space-y-3">
              <FormField label="วันที่ออก">
                <Input variant="elevated" value={issueDate ? formatDate(issueDate) : 'วันนี้ (เมื่อบันทึก)'} readOnly disabled />
              </FormField>
              <FormField label="ยืนราคาถึง">
                <DateInput variant="elevated" value={validUntil} onChange={setValidUntil} disabled={readOnly} />
              </FormField>
              <FormField label="หมายเหตุ">
                <Textarea variant="elevated" rows={2} className="resize-none" value={note} onChange={e => setNote(e.target.value)} disabled={readOnly} />
              </FormField>
            </div>
          </SectionCard>
        </div>

        <SectionCard icon={Plus} title="รายการสินค้า" tint="success"
          right={!readOnly && <Button variant="elevated" size="sm" onClick={() => setProductOpen(true)}><Plus className="size-4" /> เพิ่มสินค้า</Button>}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead className="w-24 text-center">หน่วย</TableHead>
                <TableHead className="w-28 text-right">จำนวน</TableHead>
                <TableHead className="w-32 text-right">ราคา/หน่วย</TableHead>
                <TableHead className="w-28 text-right">ส่วนลด</TableHead>
                <TableHead className="w-32 text-right">รวม</TableHead>
                {!readOnly && <TableHead className="w-12 text-center">ลบ</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={readOnly ? 7 : 8} className="text-center text-muted-foreground py-10">ยังไม่มีรายการ</TableCell></TableRow>
              ) : items.map((it, i) => (
                <TableRow key={i} className="[&_td]:py-1.5">
                  <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{it.item_name}</TableCell>
                  <TableCell className="text-center text-sm">{it.unit_name}</TableCell>
                  <TableCell className="text-right">
                    <PriceInput value={it.qty} decimals={0} onChange={v => updateItem(i, { qty: parseFloat(v) || 0 })} disabled={readOnly} className="h-9 w-24 text-right ml-auto" />
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceInput value={it.unit_price} onChange={v => updateItem(i, { unit_price: parseFloat(v) || 0 })} disabled={readOnly} className="h-9 w-28 text-right ml-auto" />
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceInput value={it.discount} onChange={v => updateItem(i, { discount: parseFloat(v) || 0 })} disabled={readOnly} className="h-9 w-24 text-right ml-auto" />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(it.line_total)}</TableCell>
                  {!readOnly && (
                    <TableCell className="text-center">
                      <Button variant="destructive2" size="icon-lg" onClick={() => removeItem(i)}><Trash2 /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">ยอดรวม</span><span>{formatCurrency(totals.subtotal)}</span></div>
              {totals.totalDiscount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">ส่วนลด</span><span className="text-warm-foreground">-{formatCurrency(totals.totalDiscount)}</span></div>}
              {vatEnabled && (<>
                <div className="flex justify-between"><span className="text-muted-foreground">มูลค่าก่อนภาษี</span><span>{formatCurrency(totals.exVat)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ภาษีมูลค่าเพิ่ม {vatRate}%</span><span>{formatCurrency(totals.totalVat)}</span></div>
              </>)}
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold"><span>รวมทั้งสิ้น</span><span className="text-primary">{formatCurrency(totals.totalAmount)}</span></div>
            </div>
          </div>
        </SectionCard>
      </div>

      <QuotationProductSearchDialog open={productOpen} onOpenChange={setProductOpen} onPick={addPicked} />
      <CustomerPickDialog open={customerOpen} onOpenChange={setCustomerOpen} onPick={pickCustomer} />
      {convert.dialogs}
    </div>
  )
}
