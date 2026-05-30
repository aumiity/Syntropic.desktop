import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Switch, Toggle } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Save, Type, MoveVertical, Eye, Printer, LayoutList } from 'lucide-react'

const FONTS = ['Tahoma', 'Arial', 'Sarabun', 'Noto Sans Thai', 'Angsana New', 'Cordia New']

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
  offset_x_shop: number; offset_y_shop: number
  offset_x_product: number; offset_y_product: number
  offset_x_dosage: number; offset_y_dosage: number
  offset_x_indication: number; offset_y_indication: number
  offset_x_notes: number; offset_y_notes: number
  offset_x_lot_expiry: number; offset_y_lot_expiry: number
  offset_x_barcode: number; offset_y_barcode: number
}

const LABEL_DEFAULTS: LabelSettingsForm = {
  printer_name: '',
  width_mm: 100, height_mm: 75,
  pad_top: 3, pad_right: 3, pad_bottom: 3, pad_left: 3,
  font_family: 'Tahoma',
  font_size_shop: 13, font_size_product: 14, font_size_dosage: 16, font_size_small: 10,
  bold_shop: 1, bold_product: 1, bold_dosage: 1,
  line_spacing: 1.4, section_gap: 4,
  show_shop: 1, show_product: 1, show_dosage: 1, show_indication: 1,
  show_notes: 1, show_lot_expiry: 1, show_barcode: 0,
  offset_x_shop: 0, offset_y_shop: 0,
  offset_x_product: 0, offset_y_product: 0,
  offset_x_dosage: 0, offset_y_dosage: 0,
  offset_x_indication: 0, offset_y_indication: 0,
  offset_x_notes: 0, offset_y_notes: 0,
  offset_x_lot_expiry: 0, offset_y_lot_expiry: 0,
  offset_x_barcode: 0, offset_y_barcode: 0,
}

type SectionKey = 'shop' | 'product' | 'dosage' | 'indication' | 'notes' | 'lot_expiry' | 'barcode'

interface SectionDef {
  key: SectionKey
  label: string
  fontSizeKey: 'font_size_shop' | 'font_size_product' | 'font_size_dosage' | 'font_size_small'
  boldKey: 'bold_shop' | 'bold_product' | 'bold_dosage' | null
  sample: string
}

// Single source of truth: drives the LEFT "บรรทัดบนฉลาก" card, the RIGHT
// preview, and the print-HTML builder. Keeps preview and print rendering
// from drifting.
const SECTIONS: SectionDef[] = [
  { key: 'shop',       label: 'ส่วนหัวร้าน',  fontSizeKey: 'font_size_shop',    boldKey: 'bold_shop',    sample: 'ร้านยา ซินโทรปิก เภสัช\n123/4 ถ.สุขุมวิท กรุงเทพ โทร. 02-xxx-xxxx' },
  { key: 'product',    label: 'ชื่อสินค้า',   fontSizeKey: 'font_size_product', boldKey: 'bold_product', sample: 'Paracetamol 500mg tablets' },
  { key: 'dosage',     label: 'วิธีใช้',      fontSizeKey: 'font_size_dosage',  boldKey: 'bold_dosage',  sample: 'รับประทาน 1–2 เม็ด วันละ 3 ครั้ง หลังอาหาร' },
  { key: 'indication', label: 'สรรพคุณ',     fontSizeKey: 'font_size_small',   boldKey: null,           sample: 'บรรเทาอาการปวด ลดไข้' },
  { key: 'notes',      label: 'หมายเหตุ',    fontSizeKey: 'font_size_small',   boldKey: null,           sample: 'หากแพ้ยา หยุดใช้ทันที' },
  { key: 'lot_expiry', label: 'Lot / หมดอายุ', fontSizeKey: 'font_size_small', boldKey: null,           sample: 'Lot: ABC001 · หมดอายุ: 12/2027' },
  { key: 'barcode',    label: 'บาร์โค้ด',    fontSizeKey: 'font_size_small',   boldKey: null,           sample: '8851234567890' },
]

function buildSectionStyle(def: SectionDef, form: LabelSettingsForm): React.CSSProperties {
  const ox = form[`offset_x_${def.key}` as keyof LabelSettingsForm] as number
  const oy = form[`offset_y_${def.key}` as keyof LabelSettingsForm] as number
  return {
    fontSize:   `${form[def.fontSizeKey]}pt`,
    fontWeight: def.boldKey && form[def.boldKey] ? 'bold' : 'normal',
    transform:  `translate(${ox}mm, ${oy}mm)`,
    marginTop:  `${form.section_gap}pt`,
    position:   'relative',
    whiteSpace: 'pre-line',
  }
}

function styleToCss(s: React.CSSProperties): string {
  return Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`)
    .join(';')
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))

interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export function LabelSettingsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<LabelSettingsForm>(LABEL_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])

  // Load settings — explicit per-key overwrite. The previous `{...f, ...data}`
  // pattern left stale UI-only keys alongside DB keys and caused the save IPC
  // to UPDATE non-existent columns.
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

  const handleTestPrint = async () => {
    if (printing) return
    if (!(form.width_mm > 0) || !(form.height_mm > 0)) {
      toast({ title: 'กรุณาตั้งขนาดกระดาษ (กว้าง × สูง > 0)', variant: 'error' })
      return
    }
    for (const k of ['pad_top', 'pad_right', 'pad_bottom', 'pad_left'] as const) {
      if (!(form[k] >= 0) || !Number.isFinite(form[k])) {
        toast({ title: 'ระยะขอบไม่ถูกต้อง', variant: 'error' }); return
      }
    }

    const sectionsHtml = SECTIONS
      .filter(s => form[`show_${s.key}` as keyof LabelSettingsForm])
      .map(s => {
        const styleStr = styleToCss(buildSectionStyle(s, form))
        const body = esc(s.sample).replace(/\n/g, '<br>')
        return `<div style="${styleStr}">${body}</div>`
      })
      .join('')

    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
@page { size: ${form.width_mm}mm ${form.height_mm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body {
  width: ${form.width_mm}mm; height: ${form.height_mm}mm;
  padding: ${form.pad_top}mm ${form.pad_right}mm ${form.pad_bottom}mm ${form.pad_left}mm;
  font-family: ${form.font_family}, sans-serif;
  line-height: ${form.line_spacing};
  color: #000; background: #fff;
  box-sizing: border-box;
}
div:first-child { margin-top: 0 !important; }
</style></head><body>${sectionsHtml}</body></html>`

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

  const printerLabel = useMemo(() => {
    if (!form.printer_name) return 'เครื่องพิมพ์ระบบ (ค่าเริ่มต้น)'
    const hit = printers.find(p => p.name === form.printer_name)
    return hit?.displayName ?? form.printer_name
  }, [form.printer_name, printers])

  return (
    <div className="grid grid-cols-2 gap-4 pt-4">
      {/* LEFT COLUMN — settings */}
      <div className="space-y-4">
        <SectionCard
          icon={Printer}
          title="เครื่องพิมพ์ & กระดาษ"
          tint="primary"
          right={
            <Button onClick={handleSave} disabled={saving}>
              <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </Button>
          }
        >
          <FormField label="เครื่องพิมพ์">
            <Select value={form.printer_name || '__default__'} onValueChange={v => setF('printer_name', v === '__default__' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">เครื่องพิมพ์ระบบ (ค่าเริ่มต้น)</SelectItem>
                {printers.map(p => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.displayName}{p.isDefault ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="กว้าง × สูง (มม.)">
            <div className="flex items-center gap-2">
              <Input type="number" value={form.width_mm}  onChange={e => setF('width_mm',  Number(e.target.value))} className="w-24" min={1} />
              <span className="text-sm text-muted-foreground">×</span>
              <Input type="number" value={form.height_mm} onChange={e => setF('height_mm', Number(e.target.value))} className="w-24" min={1} />
            </div>
          </FormField>
          <FormField label="ระยะขอบ บน / ขวา / ล่าง / ซ้าย (มม.)">
            <div className="flex items-center gap-1.5">
              {(['pad_top', 'pad_right', 'pad_bottom', 'pad_left'] as const).map(k => (
                <Input key={k} type="number" value={form[k]} onChange={e => setF(k, Number(e.target.value))} className="w-16" min={0} />
              ))}
            </div>
          </FormField>
        </SectionCard>

        <SectionCard icon={Type} title="ฟอนต์" tint="warm">
          <FormField label="ชนิดฟอนต์">
            <Select value={form.font_family} onValueChange={v => setF('font_family', v)}>
              <SelectTrigger className="w-full">
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
                  <Input
                    type="number"
                    value={form[key as keyof LabelSettingsForm] as number}
                    onChange={e => setF(key as keyof LabelSettingsForm, Number(e.target.value) as never)}
                    className="w-20" min={6} max={30}
                  />
                  {boldKey && (
                    <Toggle
                      label="ตัวหนา"
                      checked={!!form[boldKey]}
                      onChange={v => setF(boldKey, v ? 1 : 0)}
                      size="sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </FormField>
        </SectionCard>

        <SectionCard icon={LayoutList} title="บรรทัดบนฉลาก" tint="info-soft">
          <div className="space-y-1.5">
            {SECTIONS.map(def => {
              const showKey = `show_${def.key}` as keyof LabelSettingsForm
              const oxKey   = `offset_x_${def.key}` as keyof LabelSettingsForm
              const oyKey   = `offset_y_${def.key}` as keyof LabelSettingsForm
              const visible = !!form[showKey]
              return (
                <div key={def.key} className="flex items-center gap-2 py-1">
                  <Switch
                    checked={visible}
                    onCheckedChange={v => setF(showKey, (v ? 1 : 0) as never)}
                    size="sm"
                  />
                  <span className="flex-1 text-sm text-foreground">{def.label}</span>
                  <span className="text-xs text-muted-foreground">X</span>
                  <Input
                    type="number" step={0.5}
                    value={form[oxKey] as number}
                    onChange={e => setF(oxKey, Number(e.target.value) as never)}
                    className="w-16" disabled={!visible}
                  />
                  <span className="text-xs text-muted-foreground">Y</span>
                  <Input
                    type="number" step={0.5}
                    value={form[oyKey] as number}
                    onChange={e => setF(oyKey, Number(e.target.value) as never)}
                    className="w-16" disabled={!visible}
                  />
                </div>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard icon={MoveVertical} title="ระยะห่าง" tint="info-soft">
          <FormField label="ระยะห่างบรรทัด (เท่า)">
            <Input type="number" value={form.line_spacing} onChange={e => setF('line_spacing', parseFloat(e.target.value))} className="w-24" min={1} max={3} step={0.1} />
          </FormField>
          <FormField label="ระยะห่างส่วน (pt)">
            <Input type="number" value={form.section_gap} onChange={e => setF('section_gap', Number(e.target.value))} className="w-24" min={0} max={20} />
          </FormField>
        </SectionCard>
      </div>

      {/* RIGHT COLUMN — live preview + test print */}
      <div>
        <SectionCard
          icon={Eye}
          title="ตัวอย่างฉลาก"
          tint="success"
          right={
            <div className="flex items-center gap-2">
              <Badge variant="neutral-outline" className="max-w-[180px] truncate" title={printerLabel}>{printerLabel}</Badge>
              <Button onClick={handleTestPrint} disabled={printing}>
                <Printer className="size-4" />{printing ? 'กำลังพิมพ์...' : 'ทดสอบพิมพ์'}
              </Button>
            </div>
          }
        >
          {/* Physical-paper preview at TRUE 1:1 mm scale — what you see is what
              the printer outputs. bg-white/text-black literals are intentional
              (real-world ink on paper, not themed UI) and exempt from the
              no-color-literal rule. */}
          <div className="bg-muted/30 rounded-lg p-4 overflow-auto">
            <div
              className="border-2 border-dashed border-border bg-white text-black mx-auto"
              style={{
                width:      `${form.width_mm}mm`,
                height:     `${form.height_mm}mm`,
                padding:    `${form.pad_top}mm ${form.pad_right}mm ${form.pad_bottom}mm ${form.pad_left}mm`,
                fontFamily: form.font_family,
                lineHeight: form.line_spacing,
                boxSizing:  'border-box',
              }}
            >
              {SECTIONS
                .filter(s => form[`show_${s.key}` as keyof LabelSettingsForm])
                .map((s, i) => {
                  const style = buildSectionStyle(s, form)
                  // First-rendered section: kill the top margin so it sits at
                  // padding edge (matches the `div:first-child` rule in print HTML).
                  if (i === 0) style.marginTop = 0
                  return <div key={s.key} style={style}>{s.sample}</div>
                })
              }
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
