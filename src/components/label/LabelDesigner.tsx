import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ZoomControl } from '@/components/ui/zoom-control'
import { NumInput, useHoldRepeat } from '@/components/ui/num-input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Save, Printer, Bold, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Wand2, RotateCcw, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Bundled fonts + the @font-face/esc helpers are shared with the receipt/tax
// print paths — see src/lib/print/fonts.ts for why base64 embedding is needed.
import { FONTS } from '@/lib/print/fonts'

// Label anatomy (sections / per-section style / form shape / defaults) is the
// SSOT shared with the per-product LabelsTab preview — see src/lib/label/sections.ts
import { SECTIONS, LABEL_DEFAULTS, presetDefaults, type LabelSettingsForm } from '@/lib/label/sections'
import { buildBlankLabelHtml } from '@/lib/label/blankLabel'
import { buildLabelHtml } from '@/lib/label/html'
import { SAMPLE_CONTENT_BY_LANG, todayBE } from '@/lib/label/content'
import { buildPrinterOptions } from '@/lib/print/pdfPrinter'
import { PrinterSelectItems } from '@/components/ui/printer-select-items'

// The full drug-label / blank-label DESIGNER (preview + paper + per-section
// style editor + save/print). Extracted from Settings/LabelSettingsTab so the
// same editor drives BOTH label_settings profiles:
//   - profile='drug'  (ตั้งค่า > ฉลากยา) — the real dispensing label; preview
//     renders SAMPLE content (Paracetamol demo over the real shop letterhead).
//   - profile='blank' (พิมพ์ฉลาก > ฉลากเปล่า) — the write-your-own form; a fully
//     INDEPENDENT settings row (lazily seeded as a copy of drug), previewed and
//     printed via buildBlankLabelHtml with its own วันที่ box + copies controls.
// Sections a blank label never renders (expiry, barcode — per-dispense data)
// are hidden from the blank editor.

// Common label sticker sizes sold by Thai suppliers (thermal roll). 80×50 mm is
// the GPP-recommended pharmacy standard (used as default by Hygeia / EasyPrint).
// Smaller sizes are typical barcode/price labels; larger sizes are prescription
// bag labels. Users can still fine-tune via the W/H inputs — picking a value
// outside the list flips the dropdown to "กำหนดเอง".
const PAPER_PRESETS: { w: number; h: number; label: string }[] = [
  { w: 70,  h: 50, label: '70 × 50 มม.' },
  { w: 80,  h: 50, label: '80 × 50 มม. (มาตรฐาน GPP)' },
  { w: 80,  h: 60, label: '80 × 60 มม.' },
  { w: 100, h: 75, label: '100 × 75 มม. (ซองยาใหญ่)' },
]
const presetKey = (w: number, h: number) => `${w}x${h}`

// Position nudger for a section's X/Y offset, kept to a SINGLE line (h-9, same
// as an input row). The middle is a vertical ▲▼ stepper for Y — the same compact
// chevron stepper the font-size field uses — flanked by ◄ ► buttons for X. Each
// click steps ±0.5mm with the shared press-and-hold repeat and the live preview
// shifts as you go. Y+ is down (matches translate() in buildSectionStyle), so ▲
// moves up (Y−) and ▼ moves down (Y+).
function PositionPad({
  x, y, onNudge, bindHold, disabled,
}: {
  x: number
  y: number
  onNudge: (axis: 'x' | 'y', dir: 1 | -1) => void
  bindHold: (fn: () => void) => React.ComponentProps<'button'>
  disabled?: boolean
}) {
  // ◄ / ► — slim full-height side bars that move X (narrow to match the
  // stepper's chevrons, not chunky squares).
  const side = (icon: React.ReactNode, label: string, handlers: React.ComponentProps<'button'>) => (
    <Button
      type="button" size="icon-lg" variant="elevated" className="h-9 w-6 px-0"
      disabled={disabled} tooltip={label} {...handlers}
    >
      {icon}
    </Button>
  )
  // ▲ / ▼ — half-height ghost steppers stacked inside the framed middle box.
  const vstep = (icon: React.ReactNode, label: string, handlers: React.ComponentProps<'button'>) => (
    <Button
      type="button" size="icon-xs" variant="ghost"
      className="h-1/2 w-full min-h-0 rounded-none p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
      disabled={disabled} tooltip={label} {...handlers}
    >
      {icon}
    </Button>
  )
  return (
    <div className={cn('inline-flex items-center gap-1', disabled && 'opacity-50')}>
      {side(<ChevronLeft />, `X ${x}`, bindHold(() => onNudge('x', -1)))}
      <div className="flex h-9 w-8 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {vstep(<ChevronUp />, `Y ${y}`, bindHold(() => onNudge('y', -1)))}
        {vstep(<ChevronDown />, `Y ${y}`, bindHold(() => onNudge('y', 1)))}
      </div>
      {side(<ChevronRight />, `X ${x}`, bindHold(() => onNudge('x', 1)))}
    </div>
  )
}

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function LabelDesigner({
  profile = 'drug',
  onActions,
}: {
  profile?: 'drug' | 'blank'
  onActions?: (node: React.ReactNode) => void
}) {
  const isBlank = profile === 'blank'
  const { toast } = useToast()
  const [form, setForm] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [subTab, setSubTab] = useState<'paper' | 'sections'>('paper')
  const [customSizeMode, setCustomSizeMode] = useState(false)
  // Real shop info for the preview header (ชื่อร้าน / ที่อยู่ / เบอร์ / LINE ID).
  const [shop, setShop] = useState<any>(null)
  // Blank profile only: real print copies (the drug designer only test-prints 1).
  const [copies, setCopies] = useState(1)
  // Pending confirmation before applying size defaults. `mode` distinguishes the
  // two triggers so the dialog wording + the size-commit behaviour differ:
  //  - 'size'  = user picked a new preset size; the size is NOT applied until
  //              confirmed (cancel leaves the current size, dropdown snaps back).
  //  - 'reset' = user pressed "รีเซ็ตการตั้งค่า"; size stays, only defaults reset.
  const [sizeConfirm, setSizeConfirm] = useState<{ w: number; h: number; mode: 'size' | 'reset' } | null>(null)
  // Preview zoom — the paper renders at true 1:1 mm (small on screen), so let the
  // user magnify it. CSS `zoom` (Chromium) scales the real layout box so the
  // overflow-auto container can scroll to the edges.
  const [zoom, setZoom] = useState(2)
  const ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.5
  // Preview renders the profile's OWN print path 1:1 — blank = the write-your-own
  // form (buildBlankLabelHtml), drug = a SAMPLE label (Paracetamol demo). The old
  // blank/sample toggle is gone: since the profiles split, each designer previews
  // exactly what ITS profile prints, never the other's.
  const [previewHtml, setPreviewHtml] = useState('')

  // Baseline snapshot of `form` at load / after save. isDirty = form ต่างจาก baseline.
  // null = ยังไม่โหลด → ถือว่าไม่ dirty (กันจุดเด้งตอนเริ่ม). ผูกกับ load effect [profile]
  // จึงรีเซ็ตเองเมื่อสลับ drug ↔ blank.
  const savedRef = React.useRef<string | null>(null)
  const isDirty = savedRef.current != null && JSON.stringify(form) !== savedRef.current

  // Load settings — explicit per-key overwrite to keep stale UI-only keys out
  // of `form` (which would later poison the dynamic-SQL UPDATE).
  useEffect(() => {
    window.api.settings.getLabelSettings(profile).then(data => {
      setForm(prev => {
        const next = { ...prev }
        if (data) {
          for (const k of Object.keys(prev) as (keyof LabelSettingsForm)[]) {
            const v = (data as any)[k]
            if (v !== undefined && v !== null) (next as any)[k] = v
          }
        }
        savedRef.current = JSON.stringify(next)
        return next
      })
    })
  }, [profile])

  useEffect(() => {
    window.api.printer.listPrinters().then(list => {
      setPrinters((list ?? []).map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault })))
    }).catch(() => setPrinters([]))
  }, [])

  useEffect(() => {
    window.api.settings.getShop().then((s: any) => setShop(s)).catch(() => {})
  }, [])

  // Sample drug-label content — demo medicine data (Paracetamol) for the drug-info
  // sections, but the shop header (name / address / phone / LINE) is OVERLAID with
  // the REAL shop so the preview shows the true letterhead; only the
  // product-specific lines are mock. Empty real shop fields collapse to '' (the
  // row self-hides), matching the blank label's shop handling 1:1.
  const sampleContent = useMemo(() => ({
    ...SAMPLE_CONTENT_BY_LANG.th,
    shop:         shop?.shop_name?.trim() || '',
    shop_address: shop?.shop_address?.trim() || '',
    shop_phone:   shop?.shop_phone?.trim() ? shop.shop_phone.trim() : '',
    shop_line_id: shop?.shop_line_id?.trim() ? 'LINE: ' + shop.shop_line_id.trim() : '',
  }), [shop])

  // Debounced rebuild of the preview whenever the form (paper / font / offsets /
  // show toggles) or the shop header changes.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const html = isBlank
        ? await buildBlankLabelHtml(form, shop, 1)
        : await buildLabelHtml(form, sampleContent, todayBE())
      if (!cancelled) setPreviewHtml(html)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form, shop, isBlank, sampleContent])

  const setF = <K extends keyof LabelSettingsForm>(k: K, v: LabelSettingsForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Nudge a numeric offset column by ±0.5mm (rounded to 1 decimal to avoid float
  // drift). Drives the per-section X/Y arrow buttons — the live preview moves.
  // Uses the functional setForm, so press-and-hold reads the latest value (no
  // stale closure) automatically.
  const nudge = (k: keyof LabelSettingsForm, delta: number) =>
    setForm(f => ({ ...f, [k]: Math.round(((f[k] as number) + delta) * 10) / 10 }))
  const bindHold = useHoldRepeat()

  // FULL reset to the per-size default template for the given paper size. The
  // whole form returns to presetDefaults(w, h) — the hand-tuned PRESET_DEFAULTS
  // entry (or the 80x50 standard for a custom size) layered on LABEL_DEFAULTS —
  // so show/bold/offset toggles, fonts, margins and spacing all snap to that
  // size's template. Only `printer_name` is preserved (hardware choice, not a
  // style). NOTE: this only updates `form` — nothing persists until บันทึก.
  const applySizeTemplate = (w: number, h: number) => {
    setForm(f => ({ ...presetDefaults(w, h), printer_name: f.printer_name }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveLabelSettings(form, profile)
      savedRef.current = JSON.stringify(form)
      toast({ title: 'บันทึกการตั้งค่าฉลากสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  // Validate paper size + margins, toasting on failure. Gates printing.
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

  // Drug = ทดสอบพิมพ์ 1 ใบ (sample); blank = the REAL print path with copies.
  const handlePrint = async () => {
    if (printing) return
    if (!validatePaper()) return
    const n = isBlank ? Math.min(50, Math.max(1, Math.round(copies))) : 1
    const html = isBlank
      ? await buildBlankLabelHtml(form, shop, n)
      : await buildLabelHtml(form, sampleContent, todayBE())

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

  const printerOptions = useMemo(() => buildPrinterOptions(printers), [printers])

  // Lift the action buttons up to the shared sub-tab strip (PrintersTab) —
  // handlers via a ref so the node never goes stale without re-registering on
  // every render. The printer picker lives in the "ตั้งค่า" card below.
  const actRef = React.useRef({ handleSave })
  actRef.current = { handleSave }
  React.useEffect(() => {
    if (!onActions) return
    onActions(
      <Button className="h-10" dirty={isDirty} onClick={() => actRef.current.handleSave()} disabled={saving}>
        <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    )
    return () => onActions(null)
  }, [onActions, saving, isDirty])

  // Preview/print actions live INSIDE the preview card header (beside the zoom
  // control). Without an onActions slot (blank designer embedded in PrintTab)
  // บันทึก renders here too; blank additionally gets a copies stepper because
  // its print button IS the real print job, not a test.
  const previewActions = (
    <div className="flex items-center gap-2">
      <ZoomControl value={zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={setZoom} />
      {isBlank && (
        <NumInput stepper value={copies} onChange={n => setCopies(n)} min={1} max={50} step={1} className="w-20" title="จำนวน (ใบ)" />
      )}
      <Button className="h-9" onClick={handlePrint} disabled={printing} variant="elevated">
        <Printer className="size-4" />{printing ? 'กำลังพิมพ์...' : isBlank ? 'พิมพ์' : 'ทดสอบพิมพ์'}
      </Button>
      {!onActions && (
        <Button className="h-9" dirty={isDirty} onClick={handleSave} disabled={saving}>
          <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      )}
    </div>
  )

  const matchedPreset = PAPER_PRESETS.find(p => p.w === form.width_mm && p.h === form.height_mm)
  useEffect(() => {
    if (!matchedPreset) setCustomSizeMode(true)
  }, [matchedPreset])

  // กว้าง/สูง แก้ได้เฉพาะตอนเลือก "กำหนดเอง" — ถ้าเลือกขนาดจาก list ให้ล็อกไว้
  const isCustomSize = customSizeMode || !matchedPreset

  // Sections a blank label never renders (blankLabel.ts skips them: barcode +
  // expiry are per-dispense data). barcode is excluded from the table for BOTH
  // profiles (it has its own card below, hidden for blank).
  const sectionRows = SECTIONS.filter(def =>
    def.key !== 'barcode' && (!isBlank || def.key !== 'expiry'))

  return (
    <div className="flex flex-col gap-3">
      {/* Body: preview (LEFT, big) + tabbed settings (RIGHT, compact) */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 items-start">
        {/* LEFT — preview, centered, true 1:1 mm scale */}
        <SectionCard
          className="min-w-0 sticky top-0 self-start"
          title={isBlank ? 'ตัวอย่างฉลากเปล่า (จัดตำแหน่ง)' : 'ตัวอย่างฉลาก (จัดตำแหน่ง)'}
          tint="success"
          right={previewActions}
        >
          {/* The preview renders through the SAME builder as the print path in an
              isolated <iframe>, so what you tune here is exactly what prints.
              UNLIKE the inline-DOM LabelPaper, an iframe's inner mm-laid-out
              document won't magnify under CSS `zoom` on a wrapper (frame grows,
              contents stay ~physical) — so we scale the iframe itself with
              transform:scale and size the wrapper to the scaled box so
              overflow-auto still scrolls to the edges; mx-auto centers while it
              fits. (Same approach as PrintTab.) */}
          <div className="bg-muted/30 rounded-lg p-6 overflow-auto max-h-[70vh]">
            <div
              className="mx-auto"
              style={{
                width: `calc(${form.width_mm}mm * ${zoom})`,
                height: `calc(${form.height_mm}mm * ${zoom})`,
              }}
            >
              <iframe
                title={isBlank ? 'ตัวอย่างฉลากเปล่า' : 'ตัวอย่างฉลาก'}
                srcDoc={previewHtml}
                scrolling="no"
                className="block border-0 bg-white"
                style={{
                  width: `${form.width_mm}mm`,
                  height: `${form.height_mm}mm`,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
                }}
              />
            </div>
          </div>
        </SectionCard>

        {/* RIGHT — sub-tabs: กระดาษ (ขนาด+ระยะห่าง) / ฟอนต์ & บรรทัด */}
        <div className="flex flex-col min-w-0">
          <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)} className="flex flex-col gap-3">
            <TabsList variant="line" className="w-full shrink-0">
              <TabsTrigger value="paper">ตั้งค่าการพิมพ์</TabsTrigger>
              <TabsTrigger value="sections">รูปแบบการพิมพ์</TabsTrigger>
            </TabsList>

            <div className="pr-1">
              <TabsContent value="paper" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="ตั้งค่า" tint="primary">
                  <FormField label="เครื่องพิมพ์">
                    <Select value={form.printer_name || '__default__'} onValueChange={v => setF('printer_name', v === '__default__' ? '' : v)}>
                      <SelectTrigger variant="elevated" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <PrinterSelectItems options={printerOptions} />
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="ขนาดมาตรฐาน">
                    <Select
                      value={isCustomSize ? '__custom__' : presetKey(form.width_mm, form.height_mm)}
                      onValueChange={key => {
                        if (key === '__custom__') {
                          setCustomSizeMode(true)
                          return
                        }
                        const hit = PAPER_PRESETS.find(p => presetKey(p.w, p.h) === key)
                        if (hit) {
                          // Don't change the size yet — confirm first. On cancel the
                          // size is untouched, so the dropdown (value derived from
                          // form size) snaps back to the current size on its own.
                          setSizeConfirm({ w: hit.w, h: hit.h, mode: 'size' })
                        }
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
                      <NumInput stepper value={form.width_mm}  onChange={n => setF('width_mm',  n)} className="w-24" min={1} step={1} disabled={!isCustomSize} />
                      <span className="text-sm text-muted-foreground">×</span>
                      <NumInput stepper value={form.height_mm} onChange={n => setF('height_mm', n)} className="w-24" min={1} step={1} disabled={!isCustomSize} />
                    </div>
                  </FormField>
                  <FormField label="ระยะขอบ (มม.)">
                    {/* Cross layout — each input sits in its real direction (บน/ล่าง
                        ขนาบด้วย ซ้าย/ขวา) รอบกล่องที่แทนตัวกระดาษตรงกลาง. */}
                    <div className="grid grid-cols-3 gap-1.5 w-fit items-center">
                      <span />
                      <NumInput stepper value={form.pad_top} onChange={n => setF('pad_top', n)} className="w-16" min={0} step={0.5} title="ขอบบน" />
                      <span />
                      <NumInput stepper value={form.pad_left} onChange={n => setF('pad_left', n)} className="w-16" min={0} step={0.5} title="ขอบซ้าย" />
                      <div className="h-9 rounded-md border border-dashed border-border bg-muted/30" />
                      <NumInput stepper value={form.pad_right} onChange={n => setF('pad_right', n)} className="w-16" min={0} step={0.5} title="ขอบขวา" />
                      <span />
                      <NumInput stepper value={form.pad_bottom} onChange={n => setF('pad_bottom', n)} className="w-16" min={0} step={0.5} title="ขอบล่าง" />
                      <span />
                    </div>
                  </FormField>
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="elevated"
                      className="h-9 w-full"
                      onClick={() => setSizeConfirm({ w: form.width_mm, h: form.height_mm, mode: 'reset' })}
                    >
                      <RotateCcw className="size-4" /> รีเซ็ตการตั้งค่า
                    </Button>
                    <p className="pt-1.5 text-xs text-muted-foreground">
                      รีเซ็ตการตั้งค่าฉลากทั้งหมดกลับเป็นค่าเริ่มต้นของขนาดกระดาษปัจจุบัน (อย่าลืมกดบันทึกเพื่อให้มีผล)
                    </p>
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="sections" className="space-y-3 mt-0">
                <SectionCard icon={Printer} title="ฟอนต์ &amp; บรรทัด" tint="amber">
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
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="ระยะห่างบรรทัด (เท่า)">
                      <NumInput stepper value={form.line_spacing} onChange={n => setF('line_spacing', n)} min={1} max={3} step={0.1} />
                    </FormField>
                    <FormField label="ระยะห่างส่วน (pt)">
                      <NumInput stepper value={form.section_gap} onChange={n => setF('section_gap', n)} min={0} max={20} step={1} />
                    </FormField>
                  </div>

                  {/* One row per section — text sections carry size + bold; line
                      sections (header_line) skip those two and keep only show +
                      X/Y. Size/bold/X/Y are disabled when the section is hidden.
                      `barcode` is pulled OUT of this table into its own card below
                      (it's a สูง × กว้าง box, no bold) — see "บาร์โค้ด" SectionCard. */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1 pb-1 text-sm font-semibold text-foreground">
                      <span className="w-4 shrink-0" />
                      <span className="flex-1">บรรทัด</span>
                      <span className="w-20 text-center shrink-0">ขนาด</span>
                      <span className="w-9 text-center shrink-0">หนา</span>
                      <span className="w-28 text-center shrink-0">ตำแหน่ง</span>
                    </div>
                    {sectionRows.map(def => {
                      const showKey = `show_${def.key}` as keyof LabelSettingsForm
                      const oxKey   = `offset_x_${def.key}` as keyof LabelSettingsForm
                      const oyKey   = `offset_y_${def.key}` as keyof LabelSettingsForm
                      const fsKey   = `font_size_${def.key}` as keyof LabelSettingsForm
                      const boldKey = `bold_${def.key}` as keyof LabelSettingsForm
                      const visible = !!form[showKey]
                      const isText  = def.kind === 'text'
                      return (
                        <div key={def.key} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={visible}
                            onCheckedChange={v => setF(showKey, (v ? 1 : 0) as never)}
                          />
                          <span className="flex-1 text-sm text-foreground truncate">{def.label}</span>
                          {isText ? (
                            <>
                              <NumInput
                                stepper
                                value={form[fsKey] as number}
                                onChange={n => setF(fsKey, n as never)}
                                className="w-20" min={6} max={30} step={1} disabled={!visible}
                              />
                              <Button
                                type="button"
                                size="icon-lg"
                                variant={form[boldKey] ? 'default' : 'elevated'}
                                onClick={() => setF(boldKey, (form[boldKey] ? 0 : 1) as never)}
                                aria-pressed={!!form[boldKey]}
                                tooltip="ตัวหนา"
                                className="size-9"
                                disabled={!visible}
                              >
                                <Bold />
                              </Button>
                            </>
                          ) : (
                            <>
                              {/* Line sections: ขนาด = rule THICKNESS in pt
                                  (font_size_<key> reused); no bold. */}
                              <NumInput
                                stepper
                                value={form[fsKey] as number}
                                onChange={n => setF(fsKey, n as never)}
                                className="w-20" min={0.5} max={5} step={0.5} disabled={!visible}
                              />
                              <span className="w-9 shrink-0" />
                            </>
                          )}
                          {/* Position nudge — D-pad: ◄► move X, ▲▼ move Y (±0.5mm
                              each); the live preview shifts as you click. Y+ is
                              down (matches translate() in buildSectionStyle). */}
                          <div className="flex items-center justify-center w-28 shrink-0">
                            <PositionPad
                              x={form[oxKey] as number}
                              y={form[oyKey] as number}
                              onNudge={(axis, dir) => nudge(axis === 'x' ? oxKey : oyKey, dir * 0.5)}
                              bindHold={bindHold}
                              disabled={!visible}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* ข้อความเพิ่มเติม — always editable; whether it PRINTS is
                      gated by its own row's checkbox (show_custom_text) above, so
                      the text can be drafted/kept even while toggled off. */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <FormField label="ข้อความเพิ่มเติม (บรรทัดสุดท้าย)">
                      <Input
                        value={form.custom_text}
                        onChange={e => setF('custom_text', e.target.value)}
                        placeholder="เช่น ขอบคุณที่ใช้บริการค่ะ"
                        className="h-9"
                      />
                    </FormField>
                  </div>
                </SectionCard>

                {/* บาร์โค้ด — pulled out of the per-section table into its own card
                    because it's a สูง × กว้าง BOX (no font/bold like text rows). The
                    toggle + size/position here govern only THIS designer preview so
                    the owner can see + position sample bars; the real per-label
                    on/off lives on each product's ฉลาก tab. Blank labels never
                    render a barcode (needs a real product) → card hidden. */}
                {!isBlank && (
                <SectionCard>
                  {/* Toggle + สูง / กว้าง / ตำแหน่ง all on ONE row — the checkbox sits
                      inline with the controls (h-9 pill, aligned to the input baseline).
                      Size/position controls stay visible but disable until ticked.
                      Barcode box = สูง × กว้าง; the bars stretch to fill so every product's
                      barcode keeps the same footprint regardless of digit count. */}
                  <div className="flex items-end gap-2">
                    {/* Frameless toggle — bare checkbox + label like the per-section
                        rows above, so the checkbox column lines up. Held in an h-9
                        box so items-end drops it to the input baseline. */}
                    <div className="flex flex-1 items-center gap-2 h-9">
                      <Checkbox
                        checked={!!form.show_barcode}
                        onCheckedChange={v => setF('show_barcode', (v ? 1 : 0) as never)}
                      />
                      <span className="text-sm text-foreground">บาร์โค้ด</span>
                    </div>
                    <FormField label="สูง (มม.)" labelClassName="text-center">
                      <NumInput stepper value={form.font_size_barcode} onChange={n => setF('font_size_barcode', n)} min={4} max={30} step={1} className="w-20" disabled={!form.show_barcode} />
                    </FormField>
                    <FormField label="กว้าง (มม.)" labelClassName="text-center">
                      <NumInput stepper value={form.barcode_width_mm} onChange={n => setF('barcode_width_mm', n)} min={10} max={120} step={1} className="w-20" disabled={!form.show_barcode} />
                    </FormField>
                    {/* ตำแหน่ง column — w-28 to line up with the per-section ตำแหน่ง column above. */}
                    <div className="w-28 shrink-0">
                      <FormField label="ตำแหน่ง" labelClassName="text-center">
                        {/* Compact: ◄► move X, ▲▼ move Y (±0.5mm); live preview shifts. */}
                        <div className="flex justify-center">
                          <PositionPad
                            x={form.offset_x_barcode}
                            y={form.offset_y_barcode}
                            onNudge={(axis, dir) => nudge(axis === 'x' ? 'offset_x_barcode' : 'offset_y_barcode', dir * 0.5)}
                            bindHold={bindHold}
                            disabled={!form.show_barcode}
                          />
                        </div>
                      </FormField>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5 rounded-lg border border-info/30 bg-info-soft p-2.5 text-xs text-info-soft-foreground">
                    <Info className="size-4 shrink-0 mt-0.5" />
                    <span>บาร์โค้ดที่แสดง ใช้เพื่อการปรับรูปแบบเท่านั้น หากต้องการให้แสดงผลบนฉลาก กรุณาตั้งค่าที่ตัวสินค้า</span>
                  </div>
                </SectionCard>
                )}
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </div>

      <ConfirmDialog
        open={!!sizeConfirm}
        onOpenChange={o => { if (!o) setSizeConfirm(null) }}
        variant="warning"
        icon={sizeConfirm?.mode === 'size' ? Printer : Wand2}
        title={sizeConfirm?.mode === 'size' ? 'เปลี่ยนขนาดฉลาก?' : 'รีเซ็ตการตั้งค่า?'}
        description={sizeConfirm?.mode === 'size'
          ? 'เมื่อเปลี่ยนขนาดฉลาก การตั้งค่าทั้งหมดจะถูกรีเซ็ตเป็นค่าเริ่มต้นของขนาดใหม่ (กดบันทึกเพื่อให้มีผล)'
          : 'การตั้งค่าฉลากทั้งหมดจะถูกรีเซ็ตคืนเป็นค่าเริ่มต้น (กดบันทึกเพื่อให้มีผล)'}
        confirmLabel={sizeConfirm?.mode === 'size' ? 'ยืนยัน' : 'ใช้ค่าเริ่มต้น'}
        cancelLabel={sizeConfirm?.mode === 'size' ? 'ยกเลิก' : 'ไม่เปลี่ยน'}
        onConfirm={() => {
          if (sizeConfirm) {
            applySizeTemplate(sizeConfirm.w, sizeConfirm.h)
            if (sizeConfirm.mode === 'size') setCustomSizeMode(false)
          }
          setSizeConfirm(null)
        }}
      />
    </div>
  )
}
