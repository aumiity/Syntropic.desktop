import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { printDomSheets } from '@/lib/print/printDomSheets'
import { buildPrinterOptions } from '@/lib/print/pdfPrinter'
import { PrinterSelectItems } from '@/components/ui/printer-select-items'
import { ZoomControl } from '@/components/ui/zoom-control'
import { A4Sheet, A4_PORTRAIT } from '@/pages/Reports/a4'
import { taxInvoiceSheetParts } from '@/components/receipt/taxInvoiceSheet'
import type { DocumentSettings, SaleForPrint, Setting, TaxInvoice } from '@/types'
import { Printer, Save } from 'lucide-react'

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

export function DocumentSettingsTab({ onActions }: { onActions?: (node: ReactNode) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<DocumentForm>(DEFAULTS)
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [printRender, setPrintRender] = useState(false)  // mount the hidden .a4-doc only while test-printing
  // Preview zoom — on top of the fit-to-box scale (like the receipt/label tabs).
  const [zoom, setZoom] = useState(2)
  const ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.5
  // Track the preview box size; fit = shrink the A4-portrait sheet so the WHOLE
  // page shows inside the box (never up). Zoom multiplies on top.
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(0)
  const [wrapH, setWrapH] = useState(0)
  useEffect(() => {
    const el = previewWrapRef.current
    if (!el) return
    const update = () => { setWrapW(el.clientWidth); setWrapH(el.clientHeight) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const availW = Math.max(0, wrapW - 48)   // minus p-6 padding (24px each side)
  const availH = Math.max(0, wrapH - 48)
  const fitScale = availW && availH
    ? Math.min(1, availW / A4_PORTRAIT.W, availH / A4_PORTRAIT.H)
    : 1
  const scale = fitScale * zoom

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

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.api.settings.saveDocumentSettings(form)
      toast({ title: 'บันทึกการตั้งค่าเอกสาร A4 สำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }, [form, toast])

  // Test print — mount the hidden .a4-doc (the sample sheet), then spool it via
  // the same printDomSheets path the real tax-invoice print uses.
  useEffect(() => {
    if (!printRender) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await printDomSheets({
          docSelector: '.a4-doc',
          printerName: form.printer_name || '',
          copies: form.copies || 1,
          orientation: 'portrait',
        })
        if (cancelled) return
        if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
        else toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
      } finally {
        if (!cancelled) setPrintRender(false)
      }
    })()
    return () => { cancelled = true }
  }, [printRender, form.printer_name, form.copies, toast])

  const printerOptions = useMemo(() => buildPrinterOptions(printers), [printers])

  const parts = useMemo(() => taxInvoiceSheetParts({ sale: SAMPLE_SALE, shop, tax: SAMPLE_TAX, copy: false }), [shop])

  // The sample sheet — shared by the on-screen preview and the hidden test-print doc.
  const sampleSheet = (
    <A4Sheet orientation="portrait" pageNo={1} pageCount={1} header={parts.headerBlock}>
      <div className="flex h-full flex-col">
        {parts.partiesBlock}
        <div className="flex-1 min-h-0">
          {parts.renderTable(
            SAMPLE_SALE.items.map((it, i) => (
              <tr key={i}>{parts.rowCells(it, i)}</tr>
            )),
          )}
        </div>
        {parts.totalsBlock}
        {parts.signatureBlock}
      </div>
    </A4Sheet>
  )

  // Lift บันทึก to the shared sub-tab strip (PrintersTab) via a ref so the node
  // never goes stale without a re-register every render.
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

  const previewActions = (
    <div className="flex items-center gap-2">
      <ZoomControl value={zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={setZoom} />
      <Button className="h-9" onClick={() => setPrintRender(true)} disabled={printRender} variant="elevated">
        <Printer className="size-4" />{printRender ? 'กำลังพิมพ์...' : 'ทดสอบพิมพ์'}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Body: preview (LEFT) + settings (RIGHT). */}
      <div className="grid grid-cols-[7fr_3fr] grid-rows-1 gap-4 items-stretch flex-1 min-h-0">
        <SectionCard title="ตัวอย่างเอกสาร" tint="success" className="min-w-0" right={previewActions} fill>
          <div ref={previewWrapRef} className="h-full bg-muted/30 rounded-lg p-6 overflow-auto">
            {/* The A4Sheet renders at TRUE px size, then a CSS transform scales it
                to fit the column (mx-auto centers while it fits; left-aligns when
                zoom overflows so scroll reveals the page). */}
            <div className="mx-auto" style={{ width: A4_PORTRAIT.W * scale, height: A4_PORTRAIT.H * scale }}>
              <div style={{ width: A4_PORTRAIT.W, height: A4_PORTRAIT.H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                {sampleSheet}
              </div>
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

      {/* Hidden test-print doc — mounted only during the print click. */}
      {printRender && (
        <div className="a4-doc" aria-hidden style={{ position: 'absolute', left: -100000, top: 0 }}>
          {sampleSheet}
        </div>
      )}
    </div>
  )
}
