import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { buildTaxInvoiceHtml } from '@/lib/receipt/buildTaxInvoiceHtml'
import { buildPrinterOptions } from '@/lib/print/pdfPrinter'
import { PrinterSelectItems } from '@/components/ui/printer-select-items'
import type { DocumentSettings, SaleForPrint, Setting, TaxInvoice } from '@/types'
import { FileText, Printer, Save } from 'lucide-react'

// Form keys are canonical document_settings column names — Object.keys(form)
// flows into the dynamic-SQL UPDATE in settings:saveDocumentSettings, so any key
// here must be a real column.
type DocumentForm = Omit<DocumentSettings, 'id' | 'updated_at'>

const DEFAULTS: DocumentForm = {
  printer_name: '',
  copies: 1,
  paper_size: 'A4',
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

// Physical page dimensions (mm) for the supported document page sizes. The
// preview renders the real print HTML at true size, then scales DOWN to fit the
// column width so the whole page width is always visible and the user scrolls
// the page to see its length. 1mm = 96/25.4 px at 96dpi.
const PAGE_MM: Record<'A4' | 'A5', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
}
const mmToPx = (mm: number) => (mm * 96) / 25.4

export function DocumentSettingsTab({ onActions }: { onActions?: (node: ReactNode) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<DocumentForm>(DEFAULTS)
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  // Track the preview column width; scale = fit the true-size page into it (never
  // up). Recomputed below whenever the width OR the chosen page size changes.
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(0)
  useEffect(() => {
    const el = previewWrapRef.current
    if (!el) return
    const update = () => setWrapW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const dims = PAGE_MM[form.paper_size] ?? PAGE_MM.A4
  const paperWpx = mmToPx(dims.w)
  const paperHpx = mmToPx(dims.h)
  // Scale is ALWAYS referenced to A4 (never the current page), so the preview
  // column is fixed to A4 width: A4 fills it, A5 renders proportionally smaller
  // (0.705×) inside the same column — showing the real physical size difference
  // instead of shrinking the column to fit the smaller page.
  const scale = wrapW ? Math.min(1, wrapW / mmToPx(PAGE_MM.A4.w)) : 1

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

  // Rebuild the live preview (iframe srcDoc) when the shop info or page size changes.
  useEffect(() => {
    let cancelled = false
    buildTaxInvoiceHtml(SAMPLE_SALE, shop, SAMPLE_TAX, { copy: false, paperSize: form.paper_size })
      .then(html => { if (!cancelled) setPreviewHtml(html) })
    return () => { cancelled = true }
  }, [shop, form.paper_size])

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
      const html = await buildTaxInvoiceHtml(SAMPLE_SALE, shop, SAMPLE_TAX, { copy: false, paperSize: form.paper_size })
      const res = await window.api.printer.previewHtmlPdf({ html, pageFormat: form.paper_size })
      if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setPdfLoading(false) }
  }

  const handleTestPrint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      const html = await buildTaxInvoiceHtml(SAMPLE_SALE, shop, SAMPLE_TAX, { copy: false, paperSize: form.paper_size })
      const res = await window.api.printer.printHtml({
        html, printerName: form.printer_name || '', paperWidthMm: dims.w, heightMm: dims.h, copies: form.copies || 1,
      })
      if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
      else toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally { setPrinting(false) }
  }

  const printerOptions = useMemo(() => buildPrinterOptions(printers), [printers])

  // Lift the action buttons up to the shared sub-tab strip (PrintersTab). Handlers
  // are read through a ref so the registered node never goes stale without forcing
  // a re-register on every render — the effect only re-runs when the visible
  // disabled/label state changes. onActions (setActions) is stable, so no loop.
  const actRef = useRef({ handleSave })
  actRef.current = { handleSave }
  useEffect(() => {
    onActions?.(
      <Button className="h-10" onClick={() => actRef.current.handleSave()} disabled={saving}>
        <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    )
    return () => onActions?.(null)
  }, [onActions, saving])

  // Preview/test-print actions live INSIDE the preview card header (like the
  // other print sub-tabs) — only บันทึก rides the top sub-tab strip.
  const previewActions = (
    <div className="flex items-center gap-2">
      <Button className="h-9" onClick={handlePreviewPdf} disabled={pdfLoading} variant="elevated">
        <FileText className="size-4" />{pdfLoading ? 'กำลังสร้าง...' : 'ดูตัวอย่าง PDF'}
      </Button>
      <Button className="h-9" onClick={handleTestPrint} disabled={printing} variant="elevated">
        <Printer className="size-4" />{printing ? 'กำลังพิมพ์...' : 'ทดสอบพิมพ์'}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">

      {/* Body: preview (LEFT) + settings (RIGHT) */}
      <div className="grid grid-cols-[7fr_3fr] gap-4 items-start">
        <SectionCard title="ตัวอย่างเอกสาร" tint="success" className="min-w-0" right={previewActions}>
          <div ref={previewWrapRef} className="flex justify-center bg-muted/30 rounded-lg p-6">
            {/* The iframe renders the real print HTML at TRUE page size, then a
                CSS transform scales the whole thing down to fit the column width.
                The wrapper is sized to the scaled box so it reserves the right
                amount of vertical space — the page scrolls to reveal the rest. */}
            <div
              className="shrink-0 bg-white overflow-hidden"
              style={{
                width: `${paperWpx * scale}px`,
                height: `${paperHpx * scale}px`,
                // Match the receipt/label preview shadow depth.
                boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
              }}
            >
              <iframe
                title="document-preview"
                srcDoc={previewHtml}
                scrolling="no"
                className="bg-white border-0 block"
                style={{
                  width: `${dims.w}mm`, height: `${dims.h}mm`,
                  transform: `scale(${scale})`, transformOrigin: 'top left',
                }}
              />
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-col space-y-3 min-w-0">
          <SectionCard icon={Printer} title="เครื่องพิมพ์ & กระดาษ" tint="primary">
            <div className="space-y-3">
              <FormField label="เครื่องพิมพ์ (ใช้ร่วมกันทุกเอกสาร A4)">
                <Select value={form.printer_name || '__default__'} onValueChange={v => setF('printer_name', v === '__default__' ? '' : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <PrinterSelectItems options={printerOptions} />
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="ขนาดกระดาษ">
                <Select value={form.paper_size} onValueChange={v => setF('paper_size', v as 'A4' | 'A5')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 (210 × 297 มม.)</SelectItem>
                    <SelectItem value="A5">A5 (148 × 210 มม.)</SelectItem>
                  </SelectContent>
                </Select>
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
