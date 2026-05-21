import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Save, BellRing } from 'lucide-react'
import type { SalesSettings } from '@/types'

// Form keys mirror sales_settings columns 1:1 — settings:saveSalesSettings
// builds dynamic SQL from Object.keys(), so any renamed key throws "no such column".
type SalesForm = Omit<SalesSettings, 'id' | 'updated_at'>

const DEFAULT_FORM: SalesForm = {
  expiry_alert_enabled: 1,
  expiry_warn_months: 6,
  expiry_danger_months: 3,
  expired_alert_enabled: 1,
  low_stock_alert_enabled: 1,
}

export function SalesTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<SalesForm>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.getSalesSettings().then(data => {
      if (data) {
        const d = data as SalesSettings
        setForm({
          expiry_alert_enabled: d.expiry_alert_enabled,
          expiry_warn_months: d.expiry_warn_months,
          expiry_danger_months: d.expiry_danger_months,
          expired_alert_enabled: d.expired_alert_enabled,
          low_stock_alert_enabled: d.low_stock_alert_enabled,
        })
      }
    })
  }, [])

  const setF = <K extends keyof SalesForm>(k: K, v: SalesForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (form.expiry_warn_months < form.expiry_danger_months) {
      toast({
        title: 'ค่าไม่ถูกต้อง',
        description: 'เดือนแจ้งเตือน (warn) ต้องมากกว่าหรือเท่ากับเดือน danger',
        variant: 'error',
      })
      return
    }
    setSaving(true)
    try {
      await window.api.settings.saveSalesSettings(form)
      toast({ title: 'บันทึกการตั้งค่าการขายสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const expiryOn = !!form.expiry_alert_enabled

  return (
    <div className="max-w-3xl pt-4 space-y-4">
      <SectionCard
        icon={BellRing}
        title="การแจ้งเตือนในตะกร้า"
        tint="primary"
        right={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </Button>
        }
      >
        <div className="space-y-3">
          <Toggle
            framed
            label="แจ้งเตือนเมื่อสินค้าใกล้หมดอายุ"
            checked={expiryOn}
            onChange={v => setF('expiry_alert_enabled', v ? 1 : 0)}
          />

          <FormField label="เกณฑ์การแจ้งเตือนใกล้หมดอายุ">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">เตือนล่วงหน้า</span>
                <Input
                  type="number"
                  min={1}
                  max={36}
                  value={form.expiry_warn_months}
                  onChange={e => setF('expiry_warn_months', Number(e.target.value))}
                  className="w-20"
                  disabled={!expiryOn}
                />
                <span className="text-sm text-muted-foreground">เดือน (สีเหลือง)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">ระดับอันตราย</span>
                <Input
                  type="number"
                  min={1}
                  max={36}
                  value={form.expiry_danger_months}
                  onChange={e => setF('expiry_danger_months', Number(e.target.value))}
                  className="w-20"
                  disabled={!expiryOn}
                />
                <span className="text-sm text-muted-foreground">เดือน (สีส้ม)</span>
              </div>
            </div>
          </FormField>

          <Toggle
            framed
            label="แจ้งเตือนสินค้าที่หมดอายุแล้ว"
            checked={!!form.expired_alert_enabled}
            onChange={v => setF('expired_alert_enabled', v ? 1 : 0)}
          />

          <Toggle
            framed
            label="แจ้งเตือนเมื่อสต๊อกไม่พอขาย"
            checked={!!form.low_stock_alert_enabled}
            onChange={v => setF('low_stock_alert_enabled', v ? 1 : 0)}
          />
        </div>
      </SectionCard>
    </div>
  )
}
