import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { FONTS } from '@/lib/print/fonts'
import { buildSlipHtml } from '@/lib/receipt/buildSlipHtml'
import type { ReceiptSettings, SaleForPrint, Setting } from '@/types'
import { Receipt, Printer, FileText, Save } from 'lucide-react'

// Form keys are canonical receipt_settings column names — Object.keys(form)
// flows into the dynamic-SQL UPDATE in settings:saveReceiptSettings, so any key
// here must be a real column.
type ReceiptForm = Omit<ReceiptSettings, 'id' | 'updated_at'>

const DEFAULTS: ReceiptForm = {
  printer_name: '',
  paper_width_mm: 80,
  paper_height_mm: 0,
  auto_print: 0,
  copies: 1,
  font_family: 'Bai Jamjuree',
  font_size: 11,
  header_note: '',
  footer_note: 'ขอบคุณที่ใช้บริการ',
  abbrev_tax_invoice: 1,
}

// Sample bill for the live preview / test print — includes VAT so the tax
// breakdown is visible, plus a discounted line.
const SAMPLE_SALE: SaleForPrint = {
  invoice_no: 'RC-25670531-0001',
  sold_at: new Date().toISOString(),
  sale_type: 'retail',
  status: 'completed',
  customer_name: 'ลูกค้าทั่วไป',
  items: [
    { item_name: 'Paracetamol 500mg', unit_name: 'แผง', qty: 2, unit_price: 12, discount: 0, unit_vat: 0.785, line_total: 24 },
    { item_name: 'Vitamin C 1000mg', unit_name: 'ขวด', qty: 1, unit_price: 120, discount: 10, unit_vat: 7.196, line_total: 110 },
  ],
  subtotal: 144,
  total_discount: 10,
  total_vat: 8.77,
  total_amount: 134,
  cash_amount: 200,
  change_amount: 66,
}

const PAPER_PRESETS = [
  { v: 80, label: '80 มม. (มาตรฐาน)' },
  { v: 58, label: '58 มม.' },
]

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function ReceiptSettingsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<ReceiptForm>(DEFAULTS)
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  // Load settings — explicit per-key overwrite keeps stale UI-only keys out of
  // form (which would poison the dynamic-SQL UPDATE).
  useEffect(() => {
    window.api.settings.getReceiptSettings().then(data => {
      if (!data) return
      setForm(prev => {
        const next = { ...prev }
        for (const k of Object.keys(prev) as (keyof ReceiptForm)[]) {
          const v = (data as any)[k]
          if (v !== undefined && v !== null) (next as any)[k] = v
        }
        return next
      })
    })
    window.api.settings.getShop().then(d => setShop((d as Setting) ?? {}))
    window.api.printer.listPrinters().then(list => {
      setPrinters((list ?? []).map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault })))
    }).catch(() => setPrinters([]))
  }, [])

  const setF = <K extends keyof ReceiptForm>(k: K, v: ReceiptForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const settingsForBuild: ReceiptSettings = useMemo(() => ({ id: 1, ...form }), [form])
  const previewMode = form.abbrev_tax_invoice ? 'abbrevTax' as const : 'receipt' as const

  // Rebuild the live preview (iframe srcDoc) whenever the form/shop changes.
  useEffect(() => {
    let cancelled = false
    buildSlipHtml(SAMPLE_SALE, shop, settingsForBuild, { mode: previewMode })
      .then(html => { if (!cancelled) setPreviewHtml(html) })
    return () => { cancelled = true }
  }, [settingsForBuild, shop, previewMode])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.api.settings.saveReceiptSettings(form)
      toast({ title: 'บันทึกการตั้งค่าใบเสร็จสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }, [form, toast])

  const slipHeight = (): number | 'auto' =>
    form.paper_height_mm && form.paper_height_mm > 0 ? form.paper_height_mm : 'auto'

  const handlePreviewPdf = async () => {
    if (pdfLoading) return
    setPdfLoading(true)
    try {
      const html = await buildSlipHtml(SAMPLE_SALE, shop, settingsForBuild, { mode: previewMode })
      const res = await window.api.printer.previewHtmlPdf({ html, paperWidthMm: form.paper_width_mm || 80, heightMm: slipHeight() })
      if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setPdfLoading(false) }
  }

  const handleTestPrint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      const html = await buildSlipHtml(SAMPLE_SALE, shop, settingsForBuild, { mode: previewMode })
      const res = await window.api.printer.printHtml({
        html, printerName: form.printer_name || '', paperWidthMm: form.paper_width_mm || 80,
        heightMm: slipHeight(), copies: form.copies || 1,
      })
      if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
      else toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setPrinting(false) }
  }

  const printerOptions = useMemo(
    () => [{ name: '', displayName: 'เครื่องพิมพ์ระบบ (ค่าเริ่มต้น)', isDefault: false }, ...printers],
    [printers]
  )

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Top action bar */}
      <div className="flex items-center gap-2 shrink-0">
        <TintIcon icon={Receipt} tint="primary" size="sm" bordered />
        <h3 className="text-base font-semibold text-foreground">การพิมพ์ใบเสร็จ</h3>
        <div className="flex-1" />
        <Button className="h-9" onClick={handlePreviewPdf} disabled={pdfLoading} variant="elevated">
          <FileText className="size-4" />{pdfLoading ? 'กำลังสร้าง...' : 'ดูตัวอย่าง PDF'}
        </Button>
        <Button className="h-9" onClick={handleTestPrint} disabled={printing} variant="elevated">
          <Printer className="size-4" />{printing ? 'กำลังพิมพ์...' : 'ทดสอบพิมพ์'}
        </Button>
        <Button className="h-9" onClick={handleSave} disabled={saving}>
          <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>

      {/* Body: preview (LEFT) + settings (RIGHT) */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 flex-1 min-h-0">
        <SectionCard title="ตัวอย่างใบเสร็จ" tint="success" className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex items-start justify-center bg-muted/30 rounded-lg p-6 overflow-auto">
            {/* True render via the real builder so the preview matches print. */}
            <iframe
              title="receipt-preview"
              srcDoc={previewHtml}
              className="bg-white shadow-card shrink-0 border-0"
              style={{ width: `${form.paper_width_mm || 80}mm`, height: '100%', minHeight: '500px' }}
            />
          </div>
        </SectionCard>

        <div className="flex flex-col min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable] space-y-3">
          <SectionCard icon={Printer} title="เครื่องพิมพ์ & กระดาษ" tint="primary">
            <div className="space-y-3">
              <FormField label="เครื่องพิมพ์">
                <Select value={form.printer_name || '__default__'} onValueChange={v => setF('printer_name', v === '__default__' ? '' : v)}>
                  <SelectTrigger variant="elevated" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {printerOptions.map(p => (
                      <SelectItem key={p.name || '__default__'} value={p.name || '__default__'}>
                        {p.displayName}{p.isDefault ? ' (default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="ความกว้างกระดาษ">
                <Select value={String(form.paper_width_mm)} onValueChange={v => setF('paper_width_mm', Number(v))}>
                  <SelectTrigger variant="elevated" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPER_PRESETS.map(p => <SelectItem key={p.v} value={String(p.v)}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="ความสูงกระดาษ (มม., 0 = อัตโนมัติตามเนื้อหา)">
                <Input
                  variant="elevated" type="number" min={0}
                  value={String(form.paper_height_mm)}
                  onChange={e => setF('paper_height_mm', Number(e.target.value) || 0)}
                  className="w-32"
                />
              </FormField>
              <FormField label="จำนวนสำเนา">
                <Input
                  variant="elevated" type="number" min={1} max={20}
                  value={String(form.copies)}
                  onChange={e => setF('copies', Math.max(1, Number(e.target.value) || 1))}
                  className="w-32"
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard icon={FileText} title="รูปแบบ" tint="warm">
            <div className="space-y-3">
              <FormField label="ฟอนต์">
                <Select value={form.font_family} onValueChange={v => setF('font_family', v)}>
                  <SelectTrigger variant="elevated" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="ขนาดฟอนต์ (pt)">
                <Input
                  variant="elevated" type="number" min={7} max={20}
                  value={String(form.font_size)}
                  onChange={e => setF('font_size', Number(e.target.value) || 11)}
                  className="w-32"
                />
              </FormField>
              <FormField label="ข้อความหัวกระดาษ (ไม่บังคับ)">
                <Input variant="elevated" value={form.header_note} onChange={e => setF('header_note', e.target.value)} />
              </FormField>
              <FormField label="ข้อความท้ายกระดาษ">
                <Input variant="elevated" value={form.footer_note} onChange={e => setF('footer_note', e.target.value)} />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard icon={Receipt} title="ตัวเลือก" tint="info-soft">
            <div className="space-y-2">
              <Toggle
                framed className="justify-between w-full"
                label="พิมพ์ใบเสร็จอัตโนมัติหลังชำระเงิน"
                checked={!!form.auto_print}
                onChange={v => setF('auto_print', v ? 1 : 0)}
              />
              <Toggle
                framed className="justify-between w-full"
                label="ใช้สลิปเป็นใบกำกับภาษีอย่างย่อ (เมื่อเปิด VAT)"
                checked={!!form.abbrev_tax_invoice}
                onChange={v => setF('abbrev_tax_invoice', v ? 1 : 0)}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
