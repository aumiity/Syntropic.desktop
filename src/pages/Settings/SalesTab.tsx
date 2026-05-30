import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { ClockAlert, PackageX } from 'lucide-react'
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

export function SalesTab({ registerSave, saving, setSaving }: {
  registerSave: (fn: () => void) => void
  saving: boolean
  setSaving: (v: boolean) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<SalesForm>(DEFAULT_FORM)

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

  const handleSave = useCallback(async () => {
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
  }, [form, setSaving, toast])

  useEffect(() => { registerSave(handleSave) }, [handleSave, registerSave])

  const expiryOn = !!form.expiry_alert_enabled

  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4 items-start">

        <SectionCard
          icon={ClockAlert}
          title="การแจ้งเตือนหมดอายุ"
          tint="warning"
        >
          <div className="space-y-3">
            <Toggle
              framed
              label={<span className="flex items-center gap-1.5"><ClockAlert className="size-4 text-warning" />แจ้งเตือนเมื่อสินค้าใกล้หมดอายุ</span>}
              checked={expiryOn}
              onChange={v => setF('expiry_alert_enabled', v ? 1 : 0)}
            />

            <FormField label="เกณฑ์การแจ้งเตือนใกล้หมดอายุ">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-24 shrink-0">เตือนล่วงหน้า</span>
                  <Input
                    variant="elevated"
                    type="number"
                    min={1}
                    max={36}
                    value={form.expiry_warn_months}
                    onChange={e => setF('expiry_warn_months', Number(e.target.value))}
                    className="w-20"
                    disabled={!expiryOn}
                  />
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><ClockAlert className="size-4 text-warning" />เดือน</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-24 shrink-0">ระดับอันตราย</span>
                  <Input
                    variant="elevated"
                    type="number"
                    min={1}
                    max={36}
                    value={form.expiry_danger_months}
                    onChange={e => setF('expiry_danger_months', Number(e.target.value))}
                    className="w-20"
                    disabled={!expiryOn}
                  />
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><ClockAlert className="size-4 text-warm-foreground" />เดือน</span>
                </div>
              </div>
            </FormField>

            <Toggle
              framed
              label={<span className="flex items-center gap-1.5"><ClockAlert className="size-4 text-destructive" />แจ้งเตือนสินค้าที่หมดอายุแล้ว</span>}
              checked={!!form.expired_alert_enabled}
              onChange={v => setF('expired_alert_enabled', v ? 1 : 0)}
            />
          </div>
        </SectionCard>

        <SectionCard
          icon={PackageX}
          title="การแจ้งเตือนสต๊อก"
          tint="destructive"
        >
          <Toggle
            framed
            label={<span className="flex items-center gap-1.5"><PackageX className="size-4 text-destructive" />แจ้งเตือนเมื่อสต๊อกไม่พอขาย</span>}
            checked={!!form.low_stock_alert_enabled}
            onChange={v => setF('low_stock_alert_enabled', v ? 1 : 0)}
          />
        </SectionCard>

      </div>
    </div>
  )
}
