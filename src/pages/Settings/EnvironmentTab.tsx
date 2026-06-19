import { useCallback, useEffect, useState } from 'react'
import { SectionCard } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Thermometer, Droplets, Refrigerator, Info } from 'lucide-react'
import type { EnvSettings } from '@/types'

// Threshold fields edited here (the zone-enabled flags are owned by the on-page
// "จุดวัด" popover, NOT this tab). Kept as strings so a blank field stays blank —
// validated + coerced to number only on Save (never blank → 0).
type ThreshKey =
  | 'store_temp_max' | 'store_humidity_max'
  | 'reserve_temp_max' | 'reserve_humidity_max'
  | 'fridge_temp_min' | 'fridge_temp_max'

type Form = Record<ThreshKey, string>

const KEYS: ThreshKey[] = [
  'store_temp_max', 'store_humidity_max',
  'reserve_temp_max', 'reserve_humidity_max',
  'fridge_temp_min', 'fridge_temp_max',
]

const DEFAULT_FORM: Form = {
  store_temp_max: '30',
  store_humidity_max: '75',
  reserve_temp_max: '30',
  reserve_humidity_max: '75',
  fridge_temp_min: '2',
  fridge_temp_max: '8',
}

const LABELS: Record<ThreshKey, string> = {
  store_temp_max: 'อุณหภูมิสูงสุด (°C)',
  store_humidity_max: 'ความชื้นสูงสุด (%RH)',
  reserve_temp_max: 'อุณหภูมิสูงสุด (°C)',
  reserve_humidity_max: 'ความชื้นสูงสุด (%RH)',
  fridge_temp_min: 'อุณหภูมิต่ำสุด (°C)',
  fridge_temp_max: 'อุณหภูมิสูงสุด (°C)',
}

export function EnvironmentTab({ registerSave, saving, setSaving }: {
  registerSave: (fn: () => void) => void
  saving: boolean
  setSaving: (v: boolean) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<Form>(DEFAULT_FORM)

  useEffect(() => {
    window.api.env.getSettings().then((d: EnvSettings) => {
      if (!d) return
      setForm({
        store_temp_max: String(d.store_temp_max),
        store_humidity_max: String(d.store_humidity_max),
        reserve_temp_max: String(d.reserve_temp_max),
        reserve_humidity_max: String(d.reserve_humidity_max),
        fridge_temp_min: String(d.fridge_temp_min),
        fridge_temp_max: String(d.fridge_temp_max),
      })
    }).catch(() => {})
  }, [])

  const setF = (k: ThreshKey, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = useCallback(async () => {
    // Validate every field: non-blank, numeric, non-negative. NEVER blank → 0.
    const out: Record<ThreshKey, number> = {} as Record<ThreshKey, number>
    for (const k of KEYS) {
      const raw = form[k].trim()
      if (raw === '') {
        toast({ title: 'กรุณากรอกค่าเกณฑ์ให้ครบทุกช่อง', variant: 'destructive' })
        return
      }
      const n = parseFloat(raw)
      if (Number.isNaN(n) || n < 0) {
        toast({ title: 'ค่าเกณฑ์ต้องเป็นตัวเลขไม่ติดลบ', variant: 'destructive' })
        return
      }
      out[k] = n
    }
    // Fridge band sanity: min must be below max.
    if (out.fridge_temp_min >= out.fridge_temp_max) {
      toast({ title: 'อุณหภูมิตู้เย็นต่ำสุดต้องน้อยกว่าสูงสุด', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await window.api.env.saveSettings(out)
      toast({ title: 'บันทึกเกณฑ์อุณหภูมิ–ความชื้นสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [form, setSaving, toast])

  useEffect(() => { registerSave(handleSave) }, [handleSave, registerSave])

  const numField = (k: ThreshKey) => (
    <FormField label={LABELS[k]}>
      <Input
        type="number"
        min={0}
        step="0.1"
        value={form[k]}
        onChange={e => setF(k, e.target.value)}
        disabled={saving}
      />
    </FormField>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 items-start">
        <SectionCard icon={Thermometer} title="พื้นที่ภายในร้าน" tint="primary">
          <div className="space-y-3">
            {numField('store_temp_max')}
            {numField('store_humidity_max')}
          </div>
        </SectionCard>

        <SectionCard icon={Droplets} title="พื้นที่เก็บสำรอง" tint="info-soft">
          <div className="space-y-3">
            {numField('reserve_temp_max')}
            {numField('reserve_humidity_max')}
          </div>
        </SectionCard>

        <SectionCard icon={Refrigerator} title="ตู้เย็น" tint="amber">
          <div className="space-y-3">
            {numField('fridge_temp_min')}
            {numField('fridge_temp_max')}
          </div>
        </SectionCard>
      </div>

      <div className="rounded-lg border bg-muted/50 px-3 py-2 flex items-start gap-1.5 text-sm text-muted-foreground">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>
          ค่ามาตรฐาน GPP สำหรับร้านยา — พื้นที่เก็บยาทั่วไปไม่เกิน <span className="font-medium text-foreground">30°C</span> และ
          {' '}<span className="font-medium text-foreground">75%RH</span>, ตู้เย็นอยู่ในช่วง
          {' '}<span className="font-medium text-foreground">2–8°C</span>. ค่าที่บันทึกเกินเกณฑ์เหล่านี้จะถูกไฮไลต์สีแดงในตารางบันทึก
        </span>
      </div>
    </div>
  )
}
