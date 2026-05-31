import { useCallback, useEffect, useState } from 'react'
import { SectionCard } from '@/components/ui/card'
import { Toggle } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { ClockAlert, PackageX, Calculator, Info, Bell } from 'lucide-react'
import { EXPIRY_WARN_MONTHS, EXPIRY_DANGER_MONTHS } from '@/lib/expiry'
import type { SalesSettings } from '@/types'

// Form keys mirror sales_settings columns 1:1 — settings:saveSalesSettings
// builds dynamic SQL from Object.keys(), so any renamed key throws "no such column".
// Note: expiry warn/danger months are NOT here — they're fixed constants in
// '@/lib/expiry', not settings columns. See that file.
type SalesForm = Omit<SalesSettings, 'id' | 'updated_at'>

const DEFAULT_FORM: SalesForm = {
  expiry_alert_enabled: 1,
  expired_alert_enabled: 1,
  low_stock_alert_enabled: 1,
  qty_multiplier_enabled: 1,
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
          expired_alert_enabled: d.expired_alert_enabled,
          low_stock_alert_enabled: d.low_stock_alert_enabled,
          qty_multiplier_enabled: d.qty_multiplier_enabled,
        })
      }
    })
  }, [])

  const setF = <K extends keyof SalesForm>(k: K, v: SalesForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = useCallback(async () => {
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
          icon={Bell}
          title="การแจ้งเตือนการขาย"
          tint="warning"
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
              <Toggle
                className="justify-between w-full h-11 px-3"
                label="แจ้งเตือนเมื่อสินค้าใกล้หมดอายุ"
                checked={expiryOn}
                onChange={v => setF('expiry_alert_enabled', v ? 1 : 0)}
              />
              <Toggle
                className="justify-between w-full h-11 px-3"
                label="แจ้งเตือนสินค้าที่หมดอายุแล้ว"
                checked={!!form.expired_alert_enabled}
                onChange={v => setF('expired_alert_enabled', v ? 1 : 0)}
              />
              <Toggle
                className="justify-between w-full h-11 px-3"
                label="แจ้งเตือนเมื่อสต๊อกไม่พอขาย"
                checked={!!form.low_stock_alert_enabled}
                onChange={v => setF('low_stock_alert_enabled', v ? 1 : 0)}
              />
            </div>

            <div className="rounded-lg border bg-muted/50 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span className="font-medium text-foreground">ความหมายของการแจ้งเตือน</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClockAlert className="size-3.5 shrink-0 text-warning" />
                <span><span className="font-medium text-warning">เตือนล่วงหน้า</span> — เหลือไม่ถึง {EXPIRY_WARN_MONTHS} เดือน แสดงป้ายสีเหลือง</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClockAlert className="size-3.5 shrink-0 text-warm-foreground" />
                <span><span className="font-medium text-warm-foreground">ระดับอันตราย</span> — เหลือไม่ถึง {EXPIRY_DANGER_MONTHS} เดือน แสดงป้ายสีส้ม</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClockAlert className="size-3.5 shrink-0 text-destructive" />
                <span><span className="font-medium text-destructive">หมดอายุแล้ว</span> — เลยวันหมดอายุ แสดงป้ายสีแดง</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PackageX className="size-3.5 shrink-0 text-destructive" />
                <span><span className="font-medium text-destructive">สต๊อกไม่พอขาย</span> — จำนวนคงเหลือไม่พอต่อการขาย</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={Calculator}
          title="การขายหน้าร้าน (POS)"
          tint="primary"
        >
          <Toggle
            framed
            className="justify-between w-full"
            label="เปิดใช้ระบบคูณจำนวน (พิมพ์จำนวนแล้วกด * เช่น 5* ก่อนสแกน)"
            checked={!!form.qty_multiplier_enabled}
            onChange={v => setF('qty_multiplier_enabled', v ? 1 : 0)}
          />
        </SectionCard>

      </div>
    </div>
  )
}
