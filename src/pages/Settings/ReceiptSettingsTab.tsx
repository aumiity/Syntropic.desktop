import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
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
  font_family: 'Sarabun',
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

export function ReceiptSettingsTab({ onActions }: { onActions?: (node: ReactNode) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<ReceiptForm>(DEFAULTS)
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  // iframes don't auto-size to content, so the receipt would scroll INSIDE the
  // frame. Measure the rendered body height and set the iframe to it, so the
  // frame is full natural height and the OUTER gray box owns the scrollbar.
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeH, setIframeH] = useState(0)
  const fitIframe = useCallback(() => {
    const doc = iframeRef.current?.contentWindow?.document
    if (doc) setIframeH(doc.documentElement.scrollHeight)
  }, [])
  // Re-measure after the embedded (base64) fonts apply — that reflow changes the
  // height after the initial load event fires.
  useEffect(() => {
    if (!previewHtml) return
    const t = setTimeout(fitIframe, 120)
    return () => clearTimeout(t)
  }, [previewHtml, fitIframe])

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

  // Lift the action buttons up to the shared sub-tab strip (PrintersTab) — handlers
  // via a ref so the node never goes stale without a re-register every render.
  const actRef = useRef({ handlePreviewPdf, handleTestPrint, handleSave })
  actRef.current = { handlePreviewPdf, handleTestPrint, handleSave }
  useEffect(() => {
    onActions?.(
      <>
        <Button className="h-9" onClick={() => actRef.current.handlePreviewPdf()} disabled={pdfLoading} variant="elevated">
          <FileText className="size-4" />{pdfLoading ? 'กำลังสร้าง...' : 'ดูตัวอย่าง PDF'}
        </Button>
        <Button className="h-9" onClick={() => actRef.current.handleTestPrint()} disabled={printing} variant="elevated">
          <Printer className="size-4" />{printing ? 'กำลังพิมพ์...' : 'ทดสอบพิมพ์'}
        </Button>
        <Button className="h-9" onClick={() => actRef.current.handleSave()} disabled={saving}>
          <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </>
    )
    return () => onActions?.(null)
  }, [onActions, pdfLoading, printing, saving])

  return (
    <div className="flex flex-col gap-3">
      {/* Body: preview (LEFT) + settings (RIGHT) */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 items-start">
        <SectionCard title="ตัวอย่างใบเสร็จ" tint="success">
          <div className="flex items-start justify-center bg-muted/30 rounded-lg p-6 overflow-auto">
            {/* True render via the real builder so the preview matches print. */}
            {/* Torn-paper bottom edge — same scalloped CSS-mask trick as the POS
                payment dialog (src/pages/POS/index.tsx). The mask layers a solid
                rectangle over a row of repeating radial cut-outs at the bottom;
                the drop-shadow lives on the WRAPPER (not box-shadow) so the shadow
                follows the jagged alpha edge instead of a straight box. +16px of
                height gives the notches blank room so they don't clip the footer. */}
            <div
              className="shrink-0"
              style={{ filter: 'drop-shadow(0 4px 5px rgb(0 0 0 / 0.20)) drop-shadow(0 12px 14px rgb(0 0 0 / 0.16))' }}
            >
              <iframe
                ref={iframeRef}
                title="receipt-preview"
                srcDoc={previewHtml}
                onLoad={fitIframe}
                scrolling="no"
                className="bg-white border-0 block"
                style={{
                  width: `${form.paper_width_mm || 80}mm`,
                  height: iframeH ? `${iframeH + 16}px` : 'auto',
                  WebkitMaskImage: 'linear-gradient(#000,#000), radial-gradient(circle 12px at 50% 100%, transparent 12px, #000 12px)',
                  WebkitMaskSize: '100% calc(100% - 12px), 10% 12px',
                  WebkitMaskPosition: 'top, left bottom',
                  WebkitMaskRepeat: 'no-repeat, repeat-x',
                  maskImage: 'linear-gradient(#000,#000), radial-gradient(circle 12px at 50% 100%, transparent 12px, #000 12px)',
                  maskSize: '100% calc(100% - 12px), 10% 12px',
                  maskPosition: 'top, left bottom',
                  maskRepeat: 'no-repeat, repeat-x',
                }}
              />
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-col space-y-3">
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
