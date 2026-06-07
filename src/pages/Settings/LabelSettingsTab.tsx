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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Save, Printer, Bold, FileText, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Wand2 } from 'lucide-react'

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
  const [subTab, setSubTab] = useState<'paper' | 'sections' | 'spacing'>('paper')
  // Real shop info for the preview header (ชื่อร้าน / ที่อยู่ / เบอร์ / LINE ID).
  const [shop, setShop] = useState<any>(null)
  // Pending "apply size defaults" confirmation ({w,h} of the target size).
  const [sizeConfirm, setSizeConfirm] = useState<{ w: number; h: number } | null>(null)

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
  const nudge = (k: keyof LabelSettingsForm, delta: number) =>
    setForm(f => ({ ...f, [k]: Math.round(((f[k] as number) + delta) * 10) / 10 }))

  // Apply size-appropriate defaults: set every text section's font to one base
  // size + uniform margins + section gap for the given paper size. Show/bold/
  // offset and other content choices are left untouched.
  const applySizeTemplate = (w: number, h: number) => {
    const { baseFont, pad, gap, lineSpacing } = sizeDefaults(w, h)
    setForm(f => {
      const next = {
        ...f, width_mm: w, height_mm: h,
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
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* LEFT — preview, centered, true 1:1 mm scale, no page scroll */}
        <SectionCard title="ตัวอย่างฉลาก" tint="success" className="flex flex-col min-h-0">
          {/* The label paper itself is rendered by the shared LabelPaper
              component (also used by the per-product LabelsTab preview), so the
              designer preview and the printed sticker stay 1:1. */}
          <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/30 rounded-lg p-6 overflow-auto">
            <LabelPaper settings={form} content={previewContent} date={todayBE()} />
          </div>
        </SectionCard>

        {/* RIGHT — sub-tabs: กระดาษ / ฟอนต์ & บรรทัด / ช่วง */}
        <div className="flex flex-col min-h-0">
          <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)} className="flex flex-col flex-1 min-h-0 gap-3">
            <TabsList variant="segmented" className="w-full shrink-0">
              <TabsTrigger value="paper">กระดาษ</TabsTrigger>
              <TabsTrigger value="sections">ฟอนต์ &amp; บรรทัด</TabsTrigger>
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
                        if (hit) {
                          // Switch size now (so the dropdown reflects it), then
                          // offer to apply size-appropriate font/margin defaults.
                          setForm(f => ({ ...f, width_mm: hit.w, height_mm: hit.h }))
                          setSizeConfirm({ w: hit.w, h: hit.h })
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
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="elevated"
                      className="h-9 w-full"
                      onClick={() => setSizeConfirm({ w: form.width_mm, h: form.height_mm })}
                    >
                      <Wand2 className="size-4" /> ใช้ค่าเริ่มต้นของขนาดนี้
                    </Button>
                    <p className="pt-1.5 text-xs text-muted-foreground">
                      ปรับฟอนต์ทุกส่วน + ระยะขอบ + ระยะห่าง ให้พอดีกับขนาดกระดาษปัจจุบัน (ตำแหน่ง/การแสดงผลคงเดิม)
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

                  {/* One row per section — text sections carry size + bold; line
                      sections (header_line) skip those two and keep only show +
                      X/Y. Size/bold/X/Y are disabled when the section is hidden. */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1 pb-1 text-sm font-semibold text-foreground">
                      <span className="w-4 shrink-0" />
                      <span className="flex-1">บรรทัด</span>
                      <span className="w-16 text-center shrink-0">ขนาด</span>
                      <span className="w-9 text-center shrink-0">หนา</span>
                      <span className="w-28 text-center shrink-0">ตำแหน่ง</span>
                    </div>
                    {SECTIONS.map(def => {
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
                                value={form[fsKey] as number}
                                onChange={n => setF(fsKey, n as never)}
                                className="w-16" min={6} max={30} disabled={!visible}
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
                              <span className="w-16 shrink-0" />
                              <span className="w-9 shrink-0" />
                            </>
                          )}
                          {/* Position nudge — ◄ ► move X, ▲ ▼ move Y (±0.5mm
                              each); the live preview shifts as you click. Y+ is
                              down (matches translate() in buildSectionStyle). */}
                          <div className="flex items-center justify-center gap-1 w-28 shrink-0">
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} onClick={() => nudge(oxKey, -0.5)} title="เลื่อนซ้าย">
                              <ChevronLeft />
                            </Button>
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} onClick={() => nudge(oxKey, 0.5)} title="เลื่อนขวา">
                              <ChevronRight />
                            </Button>
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} onClick={() => nudge(oyKey, -0.5)} title="เลื่อนขึ้น">
                              <ChevronUp />
                            </Button>
                            <Button type="button" size="icon-sm" variant="elevated" disabled={!visible} onClick={() => nudge(oyKey, 0.5)} title="เลื่อนลง">
                              <ChevronDown />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* ข้อความเพิ่มเติม — the input is revealed by its own row's
                      checkbox (show_custom_text) in the list above, so the toggle
                      lives in one place: tick it to print + edit the text. */}
                  {!!form.show_custom_text && (
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
                  )}
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

      <ConfirmDialog
        open={!!sizeConfirm}
        onOpenChange={o => { if (!o) setSizeConfirm(null) }}
        variant="warning"
        icon={Wand2}
        title="ใช้ค่าเริ่มต้นของขนาดนี้?"
        description={sizeConfirm ? ((sd) =>
          `ขนาด ${sizeConfirm.w}×${sizeConfirm.h} มม. — จะปรับฟอนต์ทุกส่วนเป็น ${sd.baseFont}pt, ระยะขอบ ${sd.pad} มม., ระยะห่างบรรทัด ${sd.lineSpacing} และระยะห่างส่วน ${sd.gap}pt ให้พอดีกับกระดาษ (การแสดงผล/ตำแหน่งที่ตั้งไว้จะไม่เปลี่ยน)`
        )(sizeDefaults(sizeConfirm.w, sizeConfirm.h)) : undefined}
        confirmLabel="ใช้ค่าเริ่มต้น"
        cancelLabel="ไม่เปลี่ยน"
        onConfirm={() => { if (sizeConfirm) applySizeTemplate(sizeConfirm.w, sizeConfirm.h); setSizeConfirm(null) }}
      />
    </div>
  )
}
