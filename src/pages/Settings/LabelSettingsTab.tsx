import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Save, FileText, Type, MoveVertical, Eye } from 'lucide-react'

const FONTS = ['Tahoma', 'Arial', 'Sarabun', 'Noto Sans Thai', 'Angsana New', 'Cordia New']

const FONT_ROWS = [
  { key: 'font_size_shop', label: 'ชื่อร้าน', boldKey: 'bold_shop' },
  { key: 'font_size_product', label: 'ชื่อสินค้า', boldKey: 'bold_product' },
  { key: 'font_size_dosage', label: 'วิธีใช้', boldKey: 'bold_dosage' },
  { key: 'font_size_small', label: 'ข้อความเล็ก', boldKey: null },
] as const

export function LabelSettingsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<any>({
    paper_width: 100, paper_height: 75,
    padding_top: 3, padding_right: 3, padding_bottom: 3, padding_left: 3,
    font_family: 'Tahoma',
    font_size_shop: 13, font_size_product: 14, font_size_dosage: 16, font_size_small: 10,
    bold_shop: 1, bold_product: 1, bold_dosage: 1,
    line_spacing: 1.4, section_gap: 4,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.getLabelSettings().then(data => {
      if (data) setForm((f: any) => ({ ...f, ...(data as any) }))
    })
  }, [])

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveLabelSettings(form)
      toast({ title: 'บันทึกการตั้งค่าฉลากสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <div className="grid grid-cols-2 gap-4 pt-4">
      {/* LEFT COLUMN — settings */}
      <div className="space-y-4">
        <SectionCard
          icon={FileText}
          title="ขนาดกระดาษ"
          tint="primary"
          right={
            <Button onClick={handleSave} disabled={saving}>
              <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </Button>
          }
        >
          <FormField label="กว้าง × สูง (มม.)">
            <div className="flex items-center gap-2">
              <Input type="number" value={form.paper_width} onChange={e => setF('paper_width', Number(e.target.value))} className="w-24" min={50} />
              <span className="text-sm text-muted-foreground">×</span>
              <Input type="number" value={form.paper_height} onChange={e => setF('paper_height', Number(e.target.value))} className="w-24" min={30} />
            </div>
          </FormField>
          <FormField label="ระยะขอบ บน / ขวา / ล่าง / ซ้าย (มม.)">
            <div className="flex items-center gap-1.5">
              {['padding_top', 'padding_right', 'padding_bottom', 'padding_left'].map(k => (
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
                  <Input type="number" value={form[key]} onChange={e => setF(key, Number(e.target.value))} className="w-20" min={6} max={30} />
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

        <SectionCard icon={MoveVertical} title="ระยะห่าง" tint="info-soft">
          <FormField label="ระยะห่างบรรทัด (เท่า)">
            <Input type="number" value={form.line_spacing} onChange={e => setF('line_spacing', parseFloat(e.target.value))} className="w-24" min={1} max={3} step={0.1} />
          </FormField>
          <FormField label="ระยะห่างส่วน (pt)">
            <Input type="number" value={form.section_gap} onChange={e => setF('section_gap', Number(e.target.value))} className="w-24" min={0} max={20} />
          </FormField>
        </SectionCard>
      </div>

      {/* RIGHT COLUMN — live preview */}
      <div>
        <SectionCard icon={Eye} title="ตัวอย่างฉลาก" tint="success">
          {/* Physical-paper preview: white sheet + black ink is the real-world
              artifact, not themed UI — bg-white/text-black literals are intentional
              here and exempt from the no-color-literal rule. */}
          <div
            className="border-2 border-dashed border-border rounded-lg bg-white text-black overflow-hidden"
            style={{
              width: `${Math.min(form.paper_width * 2.5, 400)}px`,
              minHeight: `${form.paper_height * 1.5}px`,
              padding: `${form.padding_top * 1.5}px ${form.padding_right * 1.5}px ${form.padding_bottom * 1.5}px ${form.padding_left * 1.5}px`,
              fontFamily: form.font_family,
              lineHeight: form.line_spacing,
            }}
          >
            <div style={{ fontSize: form.font_size_shop * 0.9, fontWeight: form.bold_shop ? 'bold' : 'normal' }}>
              ร้านยา ซินโทรปิก เภสัช
            </div>
            <div style={{ fontSize: form.font_size_small * 0.9, marginBottom: form.section_gap }}>
              123/4 ถ.สุขุมวิท กรุงเทพ โทร. 02-xxx-xxxx
            </div>
            <div style={{ fontSize: form.font_size_product * 0.9, fontWeight: form.bold_product ? 'bold' : 'normal' }}>
              Paracetamol 500mg tablets
            </div>
            <div style={{ fontSize: form.font_size_dosage * 0.9, fontWeight: form.bold_dosage ? 'bold' : 'normal', marginTop: form.section_gap / 2 }}>
              รับประทาน 1–2 เม็ด วันละ 3 ครั้ง หลังอาหาร
            </div>
            <div style={{ fontSize: form.font_size_small * 0.9, marginTop: form.section_gap / 2 }}>
              หมดอายุ: 12/2027 · Lot: ABC001
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
