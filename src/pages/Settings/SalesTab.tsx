import { useCallback, useEffect, useState } from 'react'
import { SectionCard } from '@/components/ui/card'
import { Toggle } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { ClockAlert, PackageX, Calculator, Info, Bell, ReceiptText } from 'lucide-react'
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
  vat_enabled: 0,
  vat_rate: 7,
}

export function SalesTab({ registerSave, saving, setSaving }: {
  registerSave: (fn: () => void) => void
  saving: boolean
  setSaving: (v: boolean) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<SalesForm>(DEFAULT_FORM)
  // Raw text for the VAT rate so decimals (e.g. "7.5") and a transient empty
  // field can be typed without each keystroke being reparsed/clamped.
  const [vatRateStr, setVatRateStr] = useState<string>(String(DEFAULT_FORM.vat_rate))

  useEffect(() => {
    window.api.settings.getSalesSettings().then(data => {
      if (data) {
        const d = data as SalesSettings
        setForm({
          expiry_alert_enabled: d.expiry_alert_enabled,
          expired_alert_enabled: d.expired_alert_enabled,
          low_stock_alert_enabled: d.low_stock_alert_enabled,
          qty_multiplier_enabled: d.qty_multiplier_enabled,
          vat_enabled: d.vat_enabled,
          vat_rate: d.vat_rate,
        })
        setVatRateStr(String(d.vat_rate))
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
  const vatOn = !!form.vat_enabled

  return (
    <div className="space-y-4">
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

        <SectionCard
          icon={ReceiptText}
          title="ภาษีมูลค่าเพิ่ม (VAT)"
          tint="info-soft"
        >
          <div className="space-y-3">
            <Toggle
              framed
              className="justify-between w-full"
              label="เปิดใช้ระบบภาษีมูลค่าเพิ่ม (VAT)"
              checked={vatOn}
              onChange={v => setF('vat_enabled', v ? 1 : 0)}
            />

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card shadow-sm h-10 px-3">
              <span className="text-sm font-medium text-foreground">อัตราภาษี</span>
              <div className="flex items-center gap-2">
                <Input
                  variant="elevated"
                  type="text"
                  inputMode="decimal"
                  value={vatRateStr}
                  onChange={e => {
                    const raw = e.target.value
                    setVatRateStr(raw)
                    const n = parseFloat(raw)
                    setF('vat_rate', Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)))
                  }}
                  onBlur={() => setVatRateStr(String(form.vat_rate))}
                  disabled={!vatOn}
                  className="h-8 w-16 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/50 px-3 py-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>ราคาสินค้าที่ตั้งไว้ถือว่า<span className="font-medium text-foreground">รวม VAT แล้ว</span> — ระบบจะถอดภาษีออกมาแสดงในใบเสร็จ ยอดที่ลูกค้าจ่ายไม่เปลี่ยน. เมื่อเปิดใช้งาน VAT จะคิดกับ<span className="font-medium text-foreground">สินค้าทุกรายการ</span> (ทั้งร้านเปิด/ปิดพร้อมกัน ไม่มีการตั้งรายตัว)</span>
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
