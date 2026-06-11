import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ZoomControl } from '@/components/ui/zoom-control'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { useShopVat } from '@/hooks/useShopVat'
import { FONTS } from '@/lib/print/fonts'
import { buildSlipHtml } from '@/lib/receipt/buildSlipHtml'
import { RC_SECTIONS, type RcAlign } from '@/lib/receipt/sections'
import type { ReceiptSettings, SaleForPrint, Setting } from '@/types'
import {
  Printer, FileText, Save, Bold,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from 'lucide-react'

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
  footer_note: 'ขอบคุณที่ใช้บริการ',
  abbrev_tax_invoice: 1,
  // Per-section style — defaults mirror the receipt_settings column defaults.
  show_shop: 1,         bold_shop: 1,         align_shop: 'center',
  show_shop_contact: 1, bold_shop_contact: 0, align_shop_contact: 'center',
  show_tax_id: 1,       bold_tax_id: 0,       align_tax_id: 'center',
  show_title: 1,        bold_title: 1,        align_title: 'center',
  show_bill_info: 1,    bold_bill_info: 0,    align_bill_info: 'justify',
  show_summary: 1,      bold_summary: 0,      align_summary: 'justify',
  show_payment: 1,      bold_payment: 0,      align_payment: 'justify',
  show_footer: 1,       bold_footer: 0,       align_footer: 'center',
  show_salesperson: 1,  bold_salesperson: 0,  align_salesperson: 'center',
}

// Sample bill for the live preview / test print — includes VAT so the tax
// breakdown is visible, plus a discounted line.
const SAMPLE_SALE: SaleForPrint = {
  invoice_no: 'RC-25670531-0001',
  sold_at: new Date().toISOString(),
  sale_type: 'retail',
  status: 'completed',
  customer_name: 'ลูกค้าทั่วไป',
  salesperson_name: 'พนักงาน ก',
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

// The four alignment choices for a section. 'justify' = กระจาย — for label/value
// (pair) sections this keeps the 2-column look; for plain text it behaves like
// CSS text-align: justify.
const ALIGN_OPTS: { v: RcAlign; title: string; Icon: typeof AlignLeft }[] = [
  { v: 'left',    title: 'ชิดซ้าย',  Icon: AlignLeft },
  { v: 'center',  title: 'กึ่งกลาง', Icon: AlignCenter },
  { v: 'right',   title: 'ชิดขวา',   Icon: AlignRight },
  { v: 'justify', title: 'กระจาย',   Icon: AlignJustify },
]

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function ReceiptSettingsTab({ onActions }: { onActions?: (node: ReactNode) => void }) {
  const { toast } = useToast()
  const { vatEnabled } = useShopVat()
  const [form, setForm] = useState<ReceiptForm>(DEFAULTS)
  const [shop, setShop] = useState<Partial<Setting>>({})
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [subTab, setSubTab] = useState<'paper' | 'format'>('paper')
  // iframes don't auto-size to content, so the receipt would scroll INSIDE the
  // frame. Measure the rendered body height and set the iframe to it, so the
  // frame is full natural height and the OUTER gray box owns the scrollbar.
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeH, setIframeH] = useState(0)
  // Preview zoom — the slip renders at true 1:1 mm (small on screen). CSS `zoom`
  // (Chromium) scales the real layout box so the overflow-auto box can scroll.
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.5
  const fitIframe = useCallback(() => {
    const el = iframeRef.current
    const doc = el?.contentWindow?.document
    if (!el || !doc) return
    // Collapse before measuring: documentElement.scrollHeight returns
    // max(content, current iframe height), so measuring while the frame still
    // holds its previous (taller) height inflates it a little on every rebuild —
    // the preview crept longer each time the abbrev-tax toggle (or any setting)
    // flipped. Force a reflow at 0, read the true content height, then re-apply.
    el.style.height = '0'
    const h = doc.documentElement.scrollHeight
    // Set directly too, in case `h` is unchanged and React doesn't re-render to
    // re-apply the height style prop (which would leave the frame collapsed).
    el.style.height = `${h + 16}px`
    setIframeH(h)
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
          // Receipt height is ALWAYS auto (continuous roll) and copies ALWAYS 1 —
          // these are no longer user-tunable, so keep the form pinned to the
          // DEFAULTS (0 / 1) regardless of any stale stored value. Saving then
          // normalizes the DB row back to 0 / 1.
          if (k === 'paper_height_mm' || k === 'copies') continue
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

  const handlePreviewPdf = async () => {
    if (pdfLoading) return
    setPdfLoading(true)
    try {
      const html = await buildSlipHtml(SAMPLE_SALE, shop, settingsForBuild, { mode: previewMode })
      const res = await window.api.printer.previewHtmlPdf({ html, paperWidthMm: form.paper_width_mm || 80, heightMm: 'auto' })
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
        heightMm: 'auto', copies: 1,
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

  // Preview/test-print actions live INSIDE the preview card header (beside the
  // zoom control) — only บันทึก rides the top sub-tab strip.
  const previewActions = (
    <div className="flex items-center gap-2">
      <ZoomControl value={zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={setZoom} />
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
      <div className="grid grid-cols-[3fr_2fr] gap-4 items-start">
        <SectionCard
          className="min-w-0 sticky top-0 self-start"
          title="ตัวอย่างใบเสร็จ"
          tint="success"
          right={previewActions}
        >
          {/* No flex `justify-center` here: when the zoomed slip is wider than
              the box, flex-centering pushes it right and leaves a useless blank
              strip + horizontal scroll. A block child with `mx-auto` centers only
              while it fits, then left-aligns (margins collapse to 0) when it
              overflows — so scroll reveals the slip, never empty space. */}
          <div className="bg-muted/30 rounded-lg p-6 overflow-y-auto overflow-x-hidden max-h-[70vh]">
            {/* True render via the real builder so the preview matches print. */}
            {/* Torn-paper bottom edge — same scalloped CSS-mask trick as the POS
                payment dialog (src/pages/POS/index.tsx). The mask layers a solid
                rectangle over a row of repeating radial cut-outs at the bottom;
                the drop-shadow lives on the WRAPPER (not box-shadow) so the shadow
                follows the jagged alpha edge instead of a straight box. +16px of
                height gives the notches blank room so they don't clip the footer. */}
            {/* Zoom via transform (NOT `zoom`): the slip is an iframe, and `zoom`
                would resize its inner viewport — the document reflows to a WIDER
                page instead of magnifying. `transform: scale` rasterizes the whole
                frame so text scales with the paper (true zoom). transform doesn't
                reserve layout space, so the outer wrapper is sized to the scaled
                box (width mm × zoom, height px × zoom) to keep scroll working. */}
            <div
              className="mx-auto"
              style={{
                width: `calc(${form.paper_width_mm || 80}mm * ${zoom})`,
                height: iframeH ? `${(iframeH + 16) * zoom}px` : 'auto',
              }}
            >
            <div
              style={{
                transform: `scale(${zoom})`, transformOrigin: 'top left',
                filter: 'drop-shadow(0 4px 5px rgb(0 0 0 / 0.20)) drop-shadow(0 12px 14px rgb(0 0 0 / 0.16))',
              }}
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
          </div>
        </SectionCard>

        {/* RIGHT — sub-tabs: กระดาษ (เครื่องพิมพ์+กระดาษ) / รูปแบบ (รูปแบบ+ตัวเลือก) */}
        <div className="flex flex-col min-w-0">
          <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)} className="flex flex-col gap-3">
            <TabsList variant="line" className="w-full shrink-0">
              <TabsTrigger value="paper">ตั้งค่าการพิมพ์</TabsTrigger>
              <TabsTrigger value="format">รูปแบบการพิมพ์</TabsTrigger>
            </TabsList>

            <div className="pr-1">
              <TabsContent value="paper" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="ตั้งค่า" tint="primary">
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
              {/* ความสูง = อัตโนมัติเสมอ (กระดาษม้วนต่อเนื่อง — ตัดพอดีเนื้อหา) และ
                  ไม่พิมพ์สำเนา — ทั้งคู่ไม่เปิดให้ปรับอีกต่อไป (บังคับ auto / 1 ใบ
                  ทุกที่ที่พิมพ์, ดู print.ts). */}

              {/* ตัวเลือกการพิมพ์ — both switches share ONE frame (canonical
                  grouped-switch box, cf. SalesTab). Lives on the printer tab. */}
              <div className="pt-1">
                <p className="pb-2 text-sm font-semibold text-foreground">ตัวเลือก</p>
                <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
                  <Toggle
                    className="justify-between w-full h-11 px-3"
                    label="พิมพ์ใบเสร็จอัตโนมัติหลังชำระเงิน"
                    checked={!!form.auto_print}
                    onChange={v => setF('auto_print', v ? 1 : 0)}
                  />
                  {/* Abbrev tax invoice only makes sense for a VAT-registered shop —
                      hidden for NO-VAT (print paths are already data-gated by
                      sale.total_vat > 0, so a stale `on` value stays harmless) */}
                  {vatEnabled && (
                    <Toggle
                      className="justify-between w-full h-11 px-3"
                      label="ใช้สลิปเป็นใบกำกับภาษีอย่างย่อ"
                      checked={!!form.abbrev_tax_invoice}
                      onChange={v => setF('abbrev_tax_invoice', v ? 1 : 0)}
                    />
                  )}
                </div>
              </div>
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="format" className="space-y-3 mt-0">
                <SectionCard icon={FileText} title="รูปแบบใบเสร็จ" tint="warm">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 min-w-0">
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
                    </div>
                    <div className="w-24 shrink-0">
                      <FormField label="ขนาด (pt)">
                        <Input
                          variant="elevated" type="number" min={7} max={20}
                          value={String(form.font_size)}
                          onChange={e => setF('font_size', Number(e.target.value) || 11)}
                          className="w-full"
                        />
                      </FormField>
                    </div>
                  </div>
                  {/* Per-section style — one row per group: show toggle + bold +
                      alignment (ซ้าย/กลาง/ขวา/กระจาย). Font size is global (above).
                      SSOT for the section order/labels = src/lib/receipt/sections.ts.
                      The fixed "รายการขาย" block is shown read-only (no controls). */}
                  <div className="mt-1 pt-1 space-y-1.5">
                    <div className="flex items-center gap-2 px-1 pb-1 text-sm font-semibold text-foreground">
                      <span className="w-4 shrink-0" />
                      <span className="flex-1">กลุ่มข้อความ</span>
                      <span className="w-9 text-center shrink-0">หนา</span>
                      <span className="w-[156px] text-center shrink-0">จัดวาง</span>
                    </div>
                    {RC_SECTIONS.map(def => {
                      // The fixed sale-items block isn't user-styleable — omit it
                      // from the list entirely (no controls to show).
                      if (def.kind === 'items') return null
                      const showKey  = `show_${def.key}`  as keyof ReceiptForm
                      const boldKey  = `bold_${def.key}`  as keyof ReceiptForm
                      const alignKey = `align_${def.key}` as keyof ReceiptForm
                      const visible  = !!form[showKey]
                      const curAlign = form[alignKey] as RcAlign
                      // 'กระจาย' applies only to 2-column (pair) sections; on a plain
                      // text line it looks identical to ชิดซ้าย, so a stale justify
                      // value highlights ชิดซ้าย instead.
                      const effAlign: RcAlign = def.kind !== 'pair' && curAlign === 'justify' ? 'left' : curAlign
                      return (
                        <div key={def.key} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={visible}
                            onCheckedChange={v => setF(showKey, (v ? 1 : 0) as never)}
                          />
                          <span className="flex-1 text-sm text-foreground truncate">{def.label}</span>
                          <Button
                            type="button" size="icon-lg"
                            variant={form[boldKey] ? 'default' : 'elevated'}
                            onClick={() => setF(boldKey, (form[boldKey] ? 0 : 1) as never)}
                            aria-pressed={!!form[boldKey]}
                            title="ตัวหนา" className="size-9" disabled={!visible}
                          >
                            <Bold />
                          </Button>
                          <div className="flex items-center gap-1">
                            {ALIGN_OPTS.map(opt => {
                              // Hide กระจาย on text sections (redundant with ชิดซ้าย);
                              // keep an empty slot so the columns stay aligned.
                              if (opt.v === 'justify' && def.kind !== 'pair') {
                                return <span key={opt.v} className="size-9 shrink-0" aria-hidden />
                              }
                              return (
                                <Button
                                  key={opt.v} type="button" size="icon-lg"
                                  variant={effAlign === opt.v ? 'default' : 'elevated'}
                                  onClick={() => setF(alignKey, opt.v as never)}
                                  aria-pressed={effAlign === opt.v}
                                  title={opt.title} className="size-9" disabled={!visible}
                                >
                                  <opt.Icon />
                                </Button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3">
                    <FormField label="ข้อความท้ายใบเสร็จ">
                      <Input variant="elevated" value={form.footer_note} onChange={e => setF('footer_note', e.target.value)} />
                    </FormField>
                  </div>
                </SectionCard>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
