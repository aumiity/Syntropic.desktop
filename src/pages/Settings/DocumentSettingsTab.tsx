import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { buildTaxInvoiceHtml } from '@/lib/receipt/buildTaxInvoiceHtml'
import type { DocumentSettings, SaleForPrint, Setting, TaxInvoice } from '@/types'
import { FileText, Printer, Save } from 'lucide-react'

// Form keys are canonical document_settings column names — Object.keys(form)
// flows into the dynamic-SQL UPDATE in settings:saveDocumentSettings, so any key
// here must be a real column.
type DocumentForm = Omit<DocumentSettings, 'id' | 'updated_at'>

const DEFAULTS: DocumentForm = {
  printer_name: '',
  copies: 1,
}

// Sample sale + tax record for the live A4 preview / test print.
const SAMPLE_SALE: SaleForPrint = {
  invoice_no: 'RC-25670531-0001',
  sold_at: new Date().toISOString(),
  sale_type: 'retail',
  status: 'completed',
  customer_name: 'บริษัท ตัวอย่าง จำกัด',
  items: [
    { item_name: 'Paracetamol 500mg', unit_name: 'กล่อง', qty: 5, unit_price: 120, discount: 0, unit_vat: 7.85, line_total: 600 },
    { item_name: 'Vitamin C 1000mg', unit_name: 'ขวด', qty: 2, unit_price: 250, discount: 0, unit_vat: 16.36, line_total: 500 },
  ],
  subtotal: 1100,
  total_discount: 0,
  total_vat: 71.96,
  total_amount: 1100,
  cash_amount: 1100,
  change_amount: 0,
}

const SAMPLE_TAX: TaxInvoice = {
  id: 1,
  sale_id: 1,
  doc_no: 'RC-25670531-0001',
  buyer_name: 'บริษัท ตัวอย่าง จำกัด',
  buyer_address: '123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10000',
  buyer_tax_id: '0105500000000',
  buyer_branch: 'สำนักงานใหญ่',
  original_printed: 0,
  issued_at: new Date().toISOString(),
}

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function DocumentSettingsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<DocumentForm>(DEFAULTS)
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  // Load settings — explicit per-key overwrite keeps stale UI-only keys out of
  // form (which would poison the dynamic-SQL UPDATE).
  useEffect(() => {
    window.api.settings.getDocumentSettings().then(data => {
      if (!data) return
      setForm(prev => {
        const next = { ...prev }
        for (const k of Object.keys(prev) as (keyof DocumentForm)[]) {
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

  const setF = <K extends keyof DocumentForm>(k: K, v: DocumentForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Rebuild the live preview (iframe srcDoc) whenever the shop info changes.
  useEffect(() => {
    let cancelled = false
    buildTaxInvoiceHtml(SAMPLE_SALE, shop, SAMPLE_TAX, { copy: false })
      .then(html => { if (!cancelled) setPreviewHtml(html) })
    return () => { cancelled = true }
  }, [shop])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.api.settings.saveDocumentSettings(form)
      toast({ title: 'บันทึกการตั้งค่าเอกสาร A4 สำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }, [form, toast])

  const handlePreviewPdf = async () => {
    if (pdfLoading) return
    setPdfLoading(true)
    try {
      const html = await buildTaxInvoiceHtml(SAMPLE_SALE, shop, SAMPLE_TAX, { copy: false })
      const res = await window.api.printer.previewHtmlPdf({ html, pageFormat: 'A4' })
      if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setPdfLoading(false) }
  }

  const handleTestPrint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      const html = await buildTaxInvoiceHtml(SAMPLE_SALE, shop, SAMPLE_TAX, { copy: false })
      const res = await window.api.printer.printHtml({
        html, printerName: form.printer_name || '', paperWidthMm: 210, heightMm: 297, copies: form.copies || 1,
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
        <TintIcon icon={FileText} tint="primary" size="sm" bordered />
        <h3 className="text-base font-semibold text-foreground">เอกสาร A4</h3>
        <span className="text-xs text-muted-foreground">ใบกำกับภาษี · ใบรับสินค้า · ใบเสนอราคา</span>
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
        <SectionCard title="ตัวอย่างเอกสาร" tint="success" className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex items-start justify-center bg-muted/30 rounded-lg p-6 overflow-auto">
            {/* True render via the real builder so the preview matches print. */}
            <iframe
              title="document-preview"
              srcDoc={previewHtml}
              className="bg-white shadow-card shrink-0 border-0"
              style={{ width: '210mm', height: '297mm' }}
            />
          </div>
        </SectionCard>

        <div className="flex flex-col min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable] space-y-3">
          <SectionCard icon={Printer} title="เครื่องพิมพ์ & กระดาษ" tint="primary">
            <div className="space-y-3">
              <FormField label="เครื่องพิมพ์ (ใช้ร่วมกันทุกเอกสาร A4)">
                <Select value={form.printer_name || '__default__'} onValueChange={v => setF('printer_name', v === '__default__' ? '' : v)}>
                  <SelectTrigger className="w-full">
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
              <FormField label="ขนาดกระดาษ">
                <Input value="A4 (210 × 297 มม.)" readOnly disabled className="w-full" />
              </FormField>
              <FormField label="จำนวนสำเนา">
                <Input
                  type="number" min={1} max={20}
                  value={String(form.copies)}
                  onChange={e => setF('copies', Math.max(1, Number(e.target.value) || 1))}
                  className="w-32"
                />
              </FormField>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
