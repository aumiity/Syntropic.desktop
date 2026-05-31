import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TintIcon } from '@/components/ui/tint-icon'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Save, Printer, Bold, FileText } from 'lucide-react'

// Bundled fonts + the @font-face/esc helpers are shared with the receipt/tax
// print paths — see src/lib/print/fonts.ts for why base64 embedding is needed.
import { FONTS, esc, buildPrintFontFaceCss } from '@/lib/print/fonts'

// Common label sticker sizes sold by Thai suppliers (thermal roll). 80×50 mm is
// the GPP-recommended pharmacy standard (used as default by Hygeia / EasyPrint).
// Smaller sizes are typical barcode/price labels; larger sizes are prescription
// bag labels. Users can still fine-tune via the W/H inputs — picking a value
// outside the list flips the dropdown to "กำหนดเอง".
const PAPER_PRESETS: { w: number; h: number; label: string }[] = [
  { w: 32,  h: 25, label: '32 × 25 มม. (บาร์โค้ดเล็ก)' },
  { w: 40,  h: 30, label: '40 × 30 มม. (บาร์โค้ด)' },
  { w: 50,  h: 30, label: '50 × 30 มม.' },
  { w: 50,  h: 40, label: '50 × 40 มม.' },
  { w: 60,  h: 40, label: '60 × 40 มม.' },
  { w: 75,  h: 50, label: '75 × 50 มม.' },
  { w: 80,  h: 50, label: '80 × 50 มม. (มาตรฐาน GPP)' },
  { w: 100, h: 50, label: '100 × 50 มม.' },
  { w: 100, h: 75, label: '100 × 75 มม. (ซองยาใหญ่)' },
]
const presetKey = (w: number, h: number) => `${w}x${h}`

const FONT_ROWS = [
  { key: 'font_size_shop',    label: 'ชื่อร้าน',     boldKey: 'bold_shop' as const },
  { key: 'font_size_product', label: 'ชื่อสินค้า',  boldKey: 'bold_product' as const },
  { key: 'font_size_dosage',  label: 'วิธีใช้',     boldKey: 'bold_dosage' as const },
  { key: 'font_size_small',   label: 'ข้อความเล็ก', boldKey: null },
] as const

// Form keys are canonical DB column names — `Object.keys(form)` flows straight
// into the dynamic-SQL UPDATE in `settings:saveLabelSettings`, so any key here
// must be a real column on `label_settings`.
interface LabelSettingsForm {
  printer_name: string
  width_mm: number
  height_mm: number
  pad_top: number; pad_right: number; pad_bottom: number; pad_left: number
  font_family: string
  font_size_shop: number; font_size_product: number; font_size_dosage: number; font_size_small: number
  bold_shop: number; bold_product: number; bold_dosage: number
  line_spacing: number; section_gap: number
  show_shop: number; show_product: number; show_dosage: number
  show_indication: number; show_notes: number; show_lot_expiry: number; show_barcode: number
  show_header_line: number; show_footer_line: number
  offset_x_shop: number; offset_y_shop: number
  offset_x_product: number; offset_y_product: number
  offset_x_dosage: number; offset_y_dosage: number
  offset_x_indication: number; offset_y_indication: number
  offset_x_notes: number; offset_y_notes: number
  offset_x_lot_expiry: number; offset_y_lot_expiry: number
  offset_x_barcode: number; offset_y_barcode: number
  offset_x_header_line: number; offset_y_header_line: number
  offset_x_footer_line: number; offset_y_footer_line: number
}

const LABEL_DEFAULTS: LabelSettingsForm = {
  printer_name: '',
  width_mm: 80, height_mm: 50,  // GPP-recommended pharmacy standard
  pad_top: 3, pad_right: 3, pad_bottom: 3, pad_left: 3,
  font_family: 'Bai Jamjuree',
  font_size_shop: 10, font_size_product: 10, font_size_dosage: 10, font_size_small: 10,
  bold_shop: 1, bold_product: 1, bold_dosage: 1,
  line_spacing: 1.5, section_gap: 2,
  show_shop: 1, show_product: 1, show_dosage: 1, show_indication: 1,
  show_notes: 1, show_lot_expiry: 1, show_barcode: 0,
  show_header_line: 1, show_footer_line: 1,
  offset_x_shop: 0, offset_y_shop: 0,
  offset_x_product: 0, offset_y_product: 0,
  offset_x_dosage: 0, offset_y_dosage: 0,
  offset_x_indication: 0, offset_y_indication: 0,
  offset_x_notes: 0, offset_y_notes: 0,
  offset_x_lot_expiry: 0, offset_y_lot_expiry: 0,
  offset_x_barcode: 0, offset_y_barcode: 0,
  offset_x_header_line: 0, offset_y_header_line: 0,
  offset_x_footer_line: 0, offset_y_footer_line: 0,
}

type SectionKey =
  | 'shop' | 'product' | 'dosage' | 'indication' | 'notes' | 'lot_expiry' | 'barcode'
  | 'header_line' | 'footer_line'

// Text sections carry font + bold + sample; line sections are horizontal rules
// (no text, no font), but share the same show/X/Y controls so the user edits
// them uniformly with text rows.
type SectionDef =
  | {
      key: SectionKey
      label: string
      kind: 'text'
      fontSizeKey: 'font_size_shop' | 'font_size_product' | 'font_size_dosage' | 'font_size_small'
      boldKey: 'bold_shop' | 'bold_product' | 'bold_dosage' | null
      sample: string
    }
  | {
      key: SectionKey
      label: string
      kind: 'line'
    }

// Single source of truth: drives the "บรรทัด" sub-tab, the preview, and the
// print-HTML builder. Lines sit between visual groups (header / body / footer)
// and are nudgeable like any other section.
const SECTIONS: SectionDef[] = [
  { kind: 'text', key: 'shop',         label: 'ส่วนหัวร้าน',     fontSizeKey: 'font_size_shop',    boldKey: 'bold_shop',    sample: 'ร้านยา ซินโทรปิก เภสัช\n123/4 ถ.สุขุมวิท กรุงเทพ โทร. 02-xxx-xxxx' },
  { kind: 'line', key: 'header_line',  label: 'เส้นคั่นส่วนหัว' },
  { kind: 'text', key: 'product',      label: 'ชื่อสินค้า',      fontSizeKey: 'font_size_product', boldKey: 'bold_product', sample: 'Paracetamol 500mg tablets' },
  { kind: 'text', key: 'dosage',       label: 'วิธีใช้',         fontSizeKey: 'font_size_dosage',  boldKey: 'bold_dosage',  sample: 'รับประทาน 1–2 เม็ด วันละ 3 ครั้ง หลังอาหาร' },
  { kind: 'text', key: 'indication',   label: 'สรรพคุณ',        fontSizeKey: 'font_size_small',   boldKey: null,           sample: 'บรรเทาอาการปวด ลดไข้' },
  { kind: 'text', key: 'notes',        label: 'หมายเหตุ',       fontSizeKey: 'font_size_small',   boldKey: null,           sample: 'หากแพ้ยา หยุดใช้ทันที' },
  { kind: 'line', key: 'footer_line',  label: 'เส้นคั่นส่วนท้าย' },
  { kind: 'text', key: 'lot_expiry',   label: 'Lot / หมดอายุ',  fontSizeKey: 'font_size_small',   boldKey: null,           sample: 'Lot: ABC001 · หมดอายุ: 12/2027' },
  { kind: 'text', key: 'barcode',      label: 'บาร์โค้ด',       fontSizeKey: 'font_size_small',   boldKey: null,           sample: '8851234567890' },
]

function buildSectionStyle(def: SectionDef, form: LabelSettingsForm): React.CSSProperties {
  const ox = form[`offset_x_${def.key}` as keyof LabelSettingsForm] as number
  const oy = form[`offset_y_${def.key}` as keyof LabelSettingsForm] as number
  const base: React.CSSProperties = {
    transform: `translate(${ox}mm, ${oy}mm)`,
    marginTop: `${form.section_gap}pt`,
    position:  'relative',
  }
  if (def.kind === 'line') {
    return { ...base, borderTop: '0.5pt solid #000', width: '100%' }
  }
  return {
    ...base,
    fontSize:   `${form[def.fontSizeKey]}pt`,
    fontWeight: def.boldKey && form[def.boldKey] ? 'bold' : 'normal',
    whiteSpace: 'pre-line',
  }
}

function styleToCss(s: React.CSSProperties): string {
  return Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`)
    .join(';')
}

// Number input with a local string buffer — fixes the "can't delete the 0"
// problem that controlled `value={number}` inputs have. Strategy: hold the
// in-flight text locally so the user can clear / type freely; only commit a
// real number to parent state. On blur, snap back to the parent's last good
// value if the buffer is empty/invalid (keeps state consistent on focus loss).
function NumInput({
  value, onChange, ...rest
}: { value: number; onChange: (n: number) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = React.useState(String(value))
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])
  return (
    <Input
      type="number"
      variant={rest.variant ?? 'elevated'}
      {...rest}
      value={text}
      onFocus={e => { setFocused(true); rest.onFocus?.(e) }}
      onChange={e => {
        const v = e.target.value
        setText(v)
        if (v === '' || v === '-') return
        const n = Number(v)
        if (!Number.isNaN(n)) onChange(n)
      }}
      onBlur={e => {
        setFocused(false)
        if (text === '' || text === '-' || Number.isNaN(Number(text))) {
          setText(String(value))
        }
        rest.onBlur?.(e)
      }}
    />
  )
}

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function LabelSettingsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [subTab, setSubTab] = useState<'paper' | 'font' | 'lines' | 'spacing'>('paper')

  // Load settings — explicit per-key overwrite to keep stale UI-only keys out
  // of `form` (which would later poison the dynamic-SQL UPDATE).
  useEffect(() => {
    window.api.settings.getLabelSettings().then(data => {
      if (!data) return
      setForm(prev => {
        const next = { ...prev }
        for (const k of Object.keys(prev) as (keyof LabelSettingsForm)[]) {
          const v = (data as any)[k]
          if (v !== undefined && v !== null) (next as any)[k] = v
        }
        return next
      })
    })
  }, [])

  useEffect(() => {
    window.api.printer.listPrinters().then(list => {
      setPrinters((list ?? []).map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault })))
    }).catch(() => setPrinters([]))
  }, [])

  const setF = <K extends keyof LabelSettingsForm>(k: K, v: LabelSettingsForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveLabelSettings(form)
      toast({ title: 'บันทึกการตั้งค่าฉลากสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  // Validate paper size + margins, toasting on failure. Shared by print + PDF.
  const validatePaper = (): boolean => {
    if (!(form.width_mm > 0) || !(form.height_mm > 0)) {
      toast({ title: 'กรุณาตั้งขนาดกระดาษ (กว้าง × สูง > 0)', variant: 'error' })
      return false
    }
    for (const k of ['pad_top', 'pad_right', 'pad_bottom', 'pad_left'] as const) {
      if (!(form[k] >= 0) || !Number.isFinite(form[k])) {
        toast({ title: 'ระยะขอบไม่ถูกต้อง', variant: 'error' }); return false
      }
    }
    return true
  }

  // Build the full label HTML (with embedded @font-face) used for both silent
  // print and the PDF preview — single source so they render identically.
  const buildLabelHtml = async (): Promise<string> => {
    const sectionsHtml = SECTIONS
      .filter(s => form[`show_${s.key}` as keyof LabelSettingsForm])
      .map(s => {
        const styleStr = styleToCss(buildSectionStyle(s, form))
        if (s.kind === 'line') return `<div style="${styleStr}"></div>`
        const body = esc(s.sample).replace(/\n/g, '<br>')
        return `<div style="${styleStr}">${body}</div>`
      })
      .join('')

    const fontFaceCss = await buildPrintFontFaceCss(form.font_family)
    return `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaceCss}
@page { size: ${form.width_mm}mm ${form.height_mm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body {
  width: ${form.width_mm}mm; height: ${form.height_mm}mm;
  padding: ${form.pad_top}mm ${form.pad_right}mm ${form.pad_bottom}mm ${form.pad_left}mm;
  font-family: '${form.font_family}', sans-serif;
  line-height: ${form.line_spacing};
  color: #000; background: #fff;
  box-sizing: border-box;
}
div:first-child { margin-top: 0 !important; }
</style></head><body>${sectionsHtml}</body></html>`
  }

  const handlePreviewPdf = async () => {
    if (pdfLoading) return
    if (!validatePaper()) return
    const html = await buildLabelHtml()
    setPdfLoading(true)
    try {
      const res = await window.api.printer.previewLabelPdf({
        html,
        paperWidthMm: form.width_mm,
        paperHeightMm: form.height_mm,
      })
      if (!res.success) toast({ title: 'สร้าง PDF ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally {
      setPdfLoading(false)
    }
  }

  const handleTestPrint = async () => {
    if (printing) return
    if (!validatePaper()) return
    const html = await buildLabelHtml()

    setPrinting(true)
    try {
      const res = await window.api.printer.printLabel({
        html,
        printerName: form.printer_name,
        paperWidthMm: form.width_mm,
        paperHeightMm: form.height_mm,
      })
      if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
      else            toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant: 'error' })
    } finally {
      setPrinting(false)
    }
  }

  const printerOptions = useMemo(
    () => [{ name: '', displayName: 'เครื่องพิมพ์ระบบ (ค่าเริ่มต้น)', isDefault: false }, ...printers],
    [printers]
  )

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Top action bar — always visible, never scrolls */}
      <div className="flex items-center gap-2 shrink-0">
        <TintIcon icon={Printer} tint="primary" size="sm" bordered />
        <h3 className="text-base font-semibold text-foreground">การพิมพ์ฉลาก</h3>
        <div className="flex-1" />

        <Select value={form.printer_name || '__default__'} onValueChange={v => setF('printer_name', v === '__default__' ? '' : v)}>
          <SelectTrigger variant="elevated" className="h-9 w-64">
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

      {/* Body: preview (LEFT, big) + tabbed settings (RIGHT, compact) */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 flex-1 min-h-0">
        {/* LEFT — preview, centered, true 1:1 mm scale, no page scroll */}
        <SectionCard title="ตัวอย่างฉลาก" tint="success" className="flex flex-col min-h-0">
          {/* Physical-paper preview: bg-white/text-black literals are
              intentional (real-world ink on paper, not themed UI) and exempt
              from the no-color-literal rule. */}
          <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/30 rounded-lg p-6 overflow-auto">
            <div
              className="border-2 border-dashed border-border bg-white text-black shrink-0"
              style={{
                width:      `${form.width_mm}mm`,
                height:     `${form.height_mm}mm`,
                padding:    `${form.pad_top}mm ${form.pad_right}mm ${form.pad_bottom}mm ${form.pad_left}mm`,
                // Multi-word family names (e.g. "Bai Jamjuree", "Noto Sans Thai")
                // MUST be quoted in CSS — otherwise the browser parses each word
                // as a separate fallback family ("Bai", "Jamjuree") and falls
                // through to the system default. React inline-style doesn't add
                // the quotes for us.
                fontFamily: `'${form.font_family}', sans-serif`,
                lineHeight: form.line_spacing,
                boxSizing:  'border-box',
              }}
            >
              {SECTIONS
                .filter(s => form[`show_${s.key}` as keyof LabelSettingsForm])
                .map((s, i) => {
                  const style = buildSectionStyle(s, form)
                  // First-rendered element: kill top margin so it sits at the
                  // padding edge (matches `div:first-child` rule in print HTML).
                  if (i === 0) style.marginTop = 0
                  if (s.kind === 'line') return <div key={s.key} style={style} />
                  return <div key={s.key} style={style}>{s.sample}</div>
                })}
            </div>
          </div>
        </SectionCard>

        {/* RIGHT — sub-tabs: กระดาษ / ฟอนต์ / บรรทัด / ช่วง */}
        <div className="flex flex-col min-h-0">
          <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)} className="flex flex-col flex-1 min-h-0 gap-3">
            <TabsList variant="segmented" className="w-full shrink-0">
              <TabsTrigger value="paper">กระดาษ</TabsTrigger>
              <TabsTrigger value="font">ฟอนต์</TabsTrigger>
              <TabsTrigger value="lines">บรรทัด</TabsTrigger>
              <TabsTrigger value="spacing">ช่วง</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
              <TabsContent value="paper" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="ขนาดกระดาษ" tint="primary">
                  <FormField label="ขนาดมาตรฐาน">
                    <Select
                      value={PAPER_PRESETS.some(p => p.w === form.width_mm && p.h === form.height_mm)
                        ? presetKey(form.width_mm, form.height_mm)
                        : '__custom__'}
                      onValueChange={key => {
                        if (key === '__custom__') return
                        const hit = PAPER_PRESETS.find(p => presetKey(p.w, p.h) === key)
                        if (hit) setForm(f => ({ ...f, width_mm: hit.w, height_mm: hit.h }))
                      }}
                    >
                      <SelectTrigger variant="elevated" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPER_PRESETS.map(p => (
                          <SelectItem key={presetKey(p.w, p.h)} value={presetKey(p.w, p.h)}>{p.label}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">กำหนดเอง</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="กว้าง × สูง (มม.)">
                    <div className="flex items-center gap-2">
                      <NumInput value={form.width_mm}  onChange={n => setF('width_mm',  n)} className="w-24" min={1} />
                      <span className="text-sm text-muted-foreground">×</span>
                      <NumInput value={form.height_mm} onChange={n => setF('height_mm', n)} className="w-24" min={1} />
                    </div>
                  </FormField>
                  <FormField label="ระยะขอบ บน / ขวา / ล่าง / ซ้าย (มม.)">
                    <div className="flex items-center gap-1.5">
                      {(['pad_top', 'pad_right', 'pad_bottom', 'pad_left'] as const).map(k => (
                        <NumInput key={k} value={form[k]} onChange={n => setF(k, n)} className="w-16" min={0} />
                      ))}
                    </div>
                  </FormField>
                </SectionCard>
              </TabsContent>

              <TabsContent value="font" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="ฟอนต์" tint="warm">
                  <FormField label="ชนิดฟอนต์">
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
                    <div className="space-y-2">
                      {FONT_ROWS.map(({ key, label, boldKey }) => (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground w-24">{label}</span>
                          <NumInput
                            value={form[key as keyof LabelSettingsForm] as number}
                            onChange={n => setF(key as keyof LabelSettingsForm, n as never)}
                            className="w-20" min={6} max={30}
                          />
                          {boldKey && (
                            <Button
                              type="button"
                              size="icon-lg"
                              variant={form[boldKey] ? 'default' : 'elevated'}
                              onClick={() => setF(boldKey, form[boldKey] ? 0 : 1)}
                              aria-pressed={!!form[boldKey]}
                              title="ตัวหนา"
                              className="size-9"
                            >
                              <Bold />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </FormField>
                </SectionCard>
              </TabsContent>

              <TabsContent value="lines" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="บรรทัดบนฉลาก" tint="info-soft">
                  <div className="space-y-1.5">
                    {SECTIONS.map(def => {
                      const showKey = `show_${def.key}` as keyof LabelSettingsForm
                      const oxKey   = `offset_x_${def.key}` as keyof LabelSettingsForm
                      const oyKey   = `offset_y_${def.key}` as keyof LabelSettingsForm
                      const visible = !!form[showKey]
                      return (
                        <div key={def.key} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={visible}
                            onCheckedChange={v => setF(showKey, (v ? 1 : 0) as never)}
                          />
                          <span className="flex-1 text-sm text-foreground">{def.label}</span>
                          <span className="text-xs text-muted-foreground">X</span>
                          <NumInput
                            step={0.5}
                            value={form[oxKey] as number}
                            onChange={n => setF(oxKey, n as never)}
                            className="w-14" disabled={!visible}
                          />
                          <span className="text-xs text-muted-foreground">Y</span>
                          <NumInput
                            step={0.5}
                            value={form[oyKey] as number}
                            onChange={n => setF(oyKey, n as never)}
                            className="w-14" disabled={!visible}
                          />
                        </div>
                      )
                    })}
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="spacing" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="ระยะห่าง" tint="info-soft">
                  <FormField label="ระยะห่างบรรทัด (เท่า)">
                    <NumInput value={form.line_spacing} onChange={n => setF('line_spacing', n)} className="w-24" min={1} max={3} step={0.1} />
                  </FormField>
                  <FormField label="ระยะห่างส่วน (pt)">
                    <NumInput value={form.section_gap} onChange={n => setF('section_gap', n)} className="w-24" min={0} max={20} />
                  </FormField>
                </SectionCard>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
