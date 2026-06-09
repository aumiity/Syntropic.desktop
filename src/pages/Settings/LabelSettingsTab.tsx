import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Toggle } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Save, Printer, Bold, FileText, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Wand2, RotateCcw, ZoomIn, ZoomOut, Info, Barcode } from 'lucide-react'
import { cn } from '@/lib/utils'

// Bundled fonts + the @font-face/esc helpers are shared with the receipt/tax
// print paths — see src/lib/print/fonts.ts for why base64 embedding is needed.
import { FONTS } from '@/lib/print/fonts'

// Label anatomy (sections / per-section style / form shape / defaults) is the
// SSOT shared with the per-product LabelsTab preview — see src/lib/label/sections.ts
import { SECTIONS, LABEL_DEFAULTS, type LabelSettingsForm } from '@/lib/label/sections'
import { SAMPLE_CONTENT, composeLabelContent, todayBE } from '@/lib/label/content'
import { buildLabelHtml } from '@/lib/label/html'
import { LabelPaper } from '@/components/label/LabelPaper'

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

// Size-appropriate default styling, scaled with label HEIGHT to the owner-tuned
// targets: font = round(0.16·h + 2) → 50mm→10pt, 60mm→12pt, 75mm→14pt; lineSpacing
// stays tight at 1.3 and only loosens to 1.4 on the tall (≥70mm) stickers that
// have the room. gap 1pt, thin margins. Used by "ใช้ค่าเริ่มต้นของขนาดนี้".
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
function sizeDefaults(_w: number, h: number) {
  return {
    baseFont:    clampN(Math.round(0.16 * h + 2), 10, 16),   // 50→10, 60→12, 75→14
    pad:         clampN(Math.round((h / 25) * 2) / 2, 2, 3),  // 50→2, 60→2.5, 75→3
    gap:         1,
    lineSpacing: h >= 70 ? 1.4 : 1.3,                         // 50/60→1.3, 75→1.4
  }
}

// Number input with a local string buffer — fixes the "can't delete the 0"
// problem that controlled `value={number}` inputs have. Strategy: hold the
// in-flight text locally so the user can clear / type freely; only commit a
// real number to parent state. On blur, snap back to the parent's last good
// value if the buffer is empty/invalid (keeps state consistent on focus loss).
// Press-and-hold auto-repeat. `bind(fn)` returns pointer handlers for a button:
// one immediate call, then repeat every 70ms after a 350ms hold, until pointer
// up / leave / cancel / unmount. Shared by the NumInput steppers AND the
// per-section position arrows so both feel identical.
function useHoldRepeat() {
  const ref = React.useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({})
  const stop = React.useCallback(() => {
    if (ref.current.t) clearTimeout(ref.current.t)
    if (ref.current.i) clearInterval(ref.current.i)
    ref.current = {}
  }, [])
  React.useEffect(() => stop, [stop])
  return React.useCallback((fn: () => void) => ({
    onPointerDown: () => { stop(); fn(); ref.current.t = setTimeout(() => { ref.current.i = setInterval(fn, 70) }, 350) },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  }), [stop])
}

function NumInput({
  value, onChange, stepper, className, ...rest
}: {
  value: number
  onChange: (n: number) => void
  // `stepper` overlays chevron ▲▼ buttons inside the field for fine adjustment;
  // they step by the `step` prop (default 1), clamped to min/max.
  stepper?: boolean
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = React.useState(String(value))
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const stepN = rest.step != null ? Number(rest.step) : 1
  const minN  = rest.min  != null ? Number(rest.min)  : -Infinity
  const maxN  = rest.max  != null ? Number(rest.max)  :  Infinity
  // Latest value in a ref so the press-and-hold interval (below) reads the
  // current value each tick instead of the stale one captured when it started.
  const valueRef = React.useRef(value)
  valueRef.current = value
  // Step by ±step, clamped, rounded to kill float drift (0.1 steps → 1.2000001).
  const bump = (dir: 1 | -1) => {
    const base = Number.isFinite(valueRef.current) ? valueRef.current : 0
    const n = Math.min(maxN, Math.max(minN, Math.round((base + dir * stepN) * 1000) / 1000))
    setText(String(n))
    if (n !== valueRef.current) onChange(n)
  }

  const bindHold = useHoldRepeat()

  const input = (
    <Input
      type="number"
      variant={rest.variant ?? 'elevated'}
      {...rest}
      className={stepper ? cn('w-full pr-6', className) : className}
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

  if (!stepper) return input

  return (
    <div className={cn('relative', className)}>
      {input}
      <div className="absolute inset-y-0 right-0.5 flex flex-col justify-center">
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} disabled={rest.disabled}
          className="h-1/2 w-5 min-h-0 rounded-sm px-0 text-muted-foreground hover:text-foreground"
          {...bindHold(() => bump(1))}
          title="เพิ่ม (กดค้างได้)">
          <ChevronUp />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} disabled={rest.disabled}
          className="h-1/2 w-5 min-h-0 rounded-sm px-0 text-muted-foreground hover:text-foreground"
          {...bindHold(() => bump(-1))}
          title="ลด (กดค้างได้)">
          <ChevronDown />
        </Button>
      </div>
    </div>
  )
}

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function LabelSettingsTab({ onActions }: { onActions?: (node: React.ReactNode) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [subTab, setSubTab] = useState<'paper' | 'sections'>('paper')
  const [customSizeMode, setCustomSizeMode] = useState(false)
  // Real shop info for the preview header (ชื่อร้าน / ที่อยู่ / เบอร์ / LINE ID).
  const [shop, setShop] = useState<any>(null)
  // Pending confirmation before applying size defaults. `mode` distinguishes the
  // two triggers so the dialog wording + the size-commit behaviour differ:
  //  - 'size'  = user picked a new preset size; the size is NOT applied until
  //              confirmed (cancel leaves the current size, dropdown snaps back).
  //  - 'reset' = user pressed "รีเซ็ตการตั้งค่า"; size stays, only defaults reset.
  const [sizeConfirm, setSizeConfirm] = useState<{ w: number; h: number; mode: 'size' | 'reset' } | null>(null)
  // Preview zoom — the paper renders at true 1:1 mm (small on screen), so let the
  // user magnify it to inspect spacing/fonts. CSS `zoom` (Chromium) scales the
  // real layout box so the overflow-auto container can scroll to the edges.
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 1, ZOOM_MAX = 2, ZOOM_STEP = 0.5

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

  useEffect(() => {
    window.api.settings.getShop().then((s: any) => setShop(s)).catch(() => {})
  }, [])

  // Preview content: real shop header (ชื่อร้าน / ที่อยู่ / เบอร์ / LINE ID) from
  // the saved shop settings; the product/วิธีใช้ rows stay as sample text because
  // the designer has no specific product. custom_text is config and is pulled
  // separately by LabelPaper/buildLabelHtml from form.custom_text. Before shop
  // loads, fall back to SAMPLE_CONTENT so the preview is never blank.
  const previewContent = useMemo(() => {
    if (!shop) return SAMPLE_CONTENT
    const real = composeLabelContent(null, {}, shop, {})
    return {
      ...SAMPLE_CONTENT,
      shop:         real.shop || SAMPLE_CONTENT.shop,
      shop_address: real.shop_address ?? '',
      shop_phone:   real.shop_phone ?? '',
      shop_line_id: real.shop_line_id ?? '',
    }
  }, [shop])

  const setF = <K extends keyof LabelSettingsForm>(k: K, v: LabelSettingsForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Nudge a numeric offset column by ±0.5mm (rounded to 1 decimal to avoid float
  // drift). Drives the per-section X/Y arrow buttons — the live preview moves.
  // Uses the functional setForm, so press-and-hold reads the latest value (no
  // stale closure) automatically.
  const nudge = (k: keyof LabelSettingsForm, delta: number) =>
    setForm(f => ({ ...f, [k]: Math.round(((f[k] as number) + delta) * 10) / 10 }))
  const bindHold = useHoldRepeat()

  // FULL reset to defaults for the given paper size. EVERYTHING returns to
  // LABEL_DEFAULTS — show/bold/offset toggles, custom_text, lookup IDs, the lot —
  // and only the selected `printer_name` is preserved (hardware choice, not a
  // style). Size-appropriate font/margins/spacing are then layered on top.
  // `font_family` is forced to 'Sarabun' so the result is identical on every
  // machine (it's stored per-machine; bare LABEL_DEFAULTS would differ). NOTE:
  // this only updates `form` — nothing persists until the user presses บันทึก.
  const applySizeTemplate = (w: number, h: number) => {
    const { baseFont, pad, gap, lineSpacing } = sizeDefaults(w, h)
    setForm(f => {
      const next: LabelSettingsForm = {
        ...LABEL_DEFAULTS,
        printer_name: f.printer_name,
        width_mm: w, height_mm: h,
        font_family: 'Sarabun',
        pad_top: pad, pad_right: pad, pad_bottom: pad, pad_left: pad,
        section_gap: gap, line_spacing: lineSpacing,
      }
      for (const s of SECTIONS) {
        if (s.kind === 'text') (next as any)[`font_size_${s.key}`] = baseFont
      }
      return next
    })
  }

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

  const handlePreviewPdf = async () => {
    if (pdfLoading) return
    if (!validatePaper()) return
    const html = await buildLabelHtml(form, previewContent, todayBE())
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
    const html = await buildLabelHtml(form, previewContent, todayBE())

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

  // Lift the action buttons up to the shared sub-tab strip (PrintersTab) —
  // handlers via a ref so the node never goes stale without re-registering on
  // every render. The printer picker lives in the "ขนาดกระดาษ" card below.
  const actRef = React.useRef({ handlePreviewPdf, handleTestPrint, handleSave, setF })
  actRef.current = { handlePreviewPdf, handleTestPrint, handleSave, setF }
  React.useEffect(() => {
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

  const matchedPreset = PAPER_PRESETS.find(p => p.w === form.width_mm && p.h === form.height_mm)
  useEffect(() => {
    if (!matchedPreset) setCustomSizeMode(true)
  }, [matchedPreset])

  // กว้าง/สูง แก้ได้เฉพาะตอนเลือก "กำหนดเอง" — ถ้าเลือกขนาดจาก list ให้ล็อกไว้
  const isCustomSize = customSizeMode || !matchedPreset

  return (
    <div className="flex flex-col gap-3">
      {/* Body: preview (LEFT, big) + tabbed settings (RIGHT, compact) */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 items-start">
        {/* LEFT — preview, centered, true 1:1 mm scale */}
        <SectionCard
          className="min-w-0 sticky top-0 self-start"
          title="ตัวอย่างฉลาก"
          tint="success"
          right={
            <div className="flex items-center gap-1">
              <Button
                type="button" size="icon-sm" variant="elevated"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10))}
                title="ซูมออก"
              >
                <ZoomOut className="size-4" />
              </Button>
              <Button
                type="button" variant="ghost" size="sm"
                onClick={() => setZoom(1)}
                className="w-12 justify-center px-0 text-muted-foreground"
                title="รีเซ็ตเป็นขนาดจริง (100%)"
              >
                {Math.round(zoom * 100)}%
              </Button>
              <Button
                type="button" size="icon-sm" variant="elevated"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10))}
                title="ซูมเข้า"
              >
                <ZoomIn className="size-4" />
              </Button>
            </div>
          }
        >
          {/* The label paper itself is rendered by the shared LabelPaper
              component (also used by the per-product LabelsTab preview), so the
              designer preview and the printed sticker stay 1:1. The zoom wrapper
              uses CSS `zoom` (not transform) so the scaled box keeps its layout
              size and the overflow-auto container can scroll to its edges. */}
          {/* `mx-auto` (not flex `justify-center`): centers while the zoomed
              label fits, then left-aligns when it overflows — so scroll reveals
              the label, not a blank strip on the right. */}
          <div className="bg-muted/30 rounded-lg p-6 overflow-auto max-h-[70vh]">
            <div className="w-fit mx-auto" style={{ zoom }}>
              <LabelPaper settings={form} content={previewContent} date={todayBE()} />
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
                        {printerOptions.map(p => (
                          <SelectItem key={p.name || '__default__'} value={p.name || '__default__'}>
                            {p.displayName}{p.isDefault ? ' (default)' : ''}
                          </SelectItem>
                        ))}
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
                <SectionCard icon={Printer} title="ฟอนต์ &amp; บรรทัด" tint="warm">
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
                    {SECTIONS.filter(def => def.key !== 'barcode').map(def => {
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
                                title="ตัวหนา"
                                className="size-9"
                                disabled={!visible}
                              >
                                <Bold />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="w-20 shrink-0" />
                              <span className="w-9 shrink-0" />
                            </>
                          )}
                          {/* Position nudge — ◄ ► move X, ▲ ▼ move Y (±0.5mm
                              each); the live preview shifts as you click. Y+ is
                              down (matches translate() in buildSectionStyle). */}
                          <div className="flex items-center justify-center gap-1 w-28 shrink-0">
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} {...bindHold(() => nudge(oxKey, -0.5))} title="เลื่อนซ้าย (กดค้างได้)">
                              <ChevronLeft />
                            </Button>
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} {...bindHold(() => nudge(oxKey, 0.5))} title="เลื่อนขวา (กดค้างได้)">
                              <ChevronRight />
                            </Button>
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} {...bindHold(() => nudge(oyKey, -0.5))} title="เลื่อนขึ้น (กดค้างได้)">
                              <ChevronUp />
                            </Button>
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} {...bindHold(() => nudge(oyKey, 0.5))} title="เลื่อนลง (กดค้างได้)">
                              <ChevronDown />
                            </Button>
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
                    on/off lives on each product's ฉลาก tab. */}
                <SectionCard icon={Barcode} title="บาร์โค้ด" tint="info">
                  <Toggle
                    framed
                    className="w-full justify-between"
                    checked={!!form.show_barcode}
                    onChange={v => setF('show_barcode', (v ? 1 : 0) as never)}
                    label="แสดงบาร์โค้ดในตัวอย่าง"
                  />
                  {!!form.show_barcode && (
                    <>
                      {/* สูง / กว้าง / ตำแหน่ง on ONE row. Barcode box = สูง × กว้าง;
                          the bars stretch to fill so every product's barcode keeps the
                          same footprint regardless of digit count. flex-wrap lets the
                          ตำแหน่ง group drop to a second line on a narrow panel. */}
                      <div className="flex items-start justify-between gap-3">
                        <FormField label="ความสูง (มม.)">
                          <NumInput stepper value={form.font_size_barcode} onChange={n => setF('font_size_barcode', n)} min={4} max={30} step={1} className="w-20" />
                        </FormField>
                        <FormField label="ความกว้าง (มม.)">
                          <NumInput stepper value={form.barcode_width_mm} onChange={n => setF('barcode_width_mm', n)} min={10} max={120} step={1} className="w-20" />
                        </FormField>
                        <FormField label="ตำแหน่ง">
                          {/* ◄ ► move X, ▲ ▼ move Y (±0.5mm); live preview shifts.
                              size-9 so the buttons match the input field height. */}
                          <div className="flex items-center gap-1">
                            <Button type="button" size="icon-lg" variant="elevated" className="size-9" {...bindHold(() => nudge('offset_x_barcode', -0.5))} title="เลื่อนซ้าย (กดค้างได้)">
                              <ChevronLeft />
                            </Button>
                            <Button type="button" size="icon-lg" variant="elevated" className="size-9" {...bindHold(() => nudge('offset_x_barcode', 0.5))} title="เลื่อนขวา (กดค้างได้)">
                              <ChevronRight />
                            </Button>
                            <Button type="button" size="icon-lg" variant="elevated" className="size-9" {...bindHold(() => nudge('offset_y_barcode', -0.5))} title="เลื่อนขึ้น (กดค้างได้)">
                              <ChevronUp />
                            </Button>
                            <Button type="button" size="icon-lg" variant="elevated" className="size-9" {...bindHold(() => nudge('offset_y_barcode', 0.5))} title="เลื่อนลง (กดค้างได้)">
                              <ChevronDown />
                            </Button>
                          </div>
                        </FormField>
                      </div>
                      <div className="flex items-start gap-1.5 rounded-lg border border-info/30 bg-info-soft p-2.5 text-sm text-info-soft-foreground">
                        <Info className="size-4 shrink-0 mt-0.5" />
                        <span>บาร์โค้ดที่แสดง ใช้เพื่อการปรับรูปแบบเท่านั้น หากต้องการให้แสดงผลบนฉลาก กรุณาตั้งค่าที่สินค้า</span>
                      </div>
                    </>
                  )}
                </SectionCard>
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
