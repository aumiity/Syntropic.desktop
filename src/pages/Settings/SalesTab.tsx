import { useCallback, useEffect, useState } from 'react'
import { SectionCard } from '@/components/ui/card'
import { CheckRow } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { UpgradeVatDialog } from '@/components/dialogs/UpgradeVatDialog'
import { DowngradeVatDialog } from '@/components/dialogs/DowngradeVatDialog'
import { ClockAlert, PackageX, Info, Bell, ReceiptText } from 'lucide-react'
import { EXPIRY_WARN_MONTHS, EXPIRY_DANGER_MONTHS } from '@/lib/expiry'
import { formatDate } from '@/lib/utils'
import type { SalesSettings } from '@/types'

// Form keys mirror sales_settings columns 1:1 — settings:saveSalesSettings
// builds dynamic SQL from Object.keys(), so any renamed key throws "no such column".
// Note: expiry warn/danger months are NOT here — they're fixed constants in
// '@/lib/expiry', not settings columns. See that file.
// vat_enabled/vat_rate are NOT form fields: VAT mode is a one-time decision
// (setup wizard / upgradeToVat) — the backend strips them from this save too.
type SalesForm = Omit<SalesSettings, 'id' | 'updated_at' | 'vat_enabled' | 'vat_rate'>

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
  // VAT status display (read-only here) — mode itself is changed only through
  // the guarded one-way UpgradeVatDialog, never a toggle on this tab.
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState(7)
  const [vatRegisteredDate, setVatRegisteredDate] = useState<string | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [downgradeOpen, setDowngradeOpen] = useState(false)

  const loadVatStatus = useCallback(() => {
    window.api.settings.getSalesSettings().then((d: any) => {
      if (!d) return
      setVatEnabled(d.vat_enabled === 1)
      setVatRate(Number(d.vat_rate) || 7)
    })
    window.api.settings.getShop().then((s: any) => {
      setVatRegisteredDate(s?.vat_registered_date ?? null)
    })
  }, [])

  useEffect(() => {
    window.api.settings.getSalesSettings().then(data => {
      if (data) {
        const d = data as SalesSettings
        setForm({
          expiry_alert_enabled: d.expiry_alert_enabled,
          expired_alert_enabled: d.expired_alert_enabled,
          low_stock_alert_enabled: d.low_stock_alert_enabled,
          // ระบบคูณจำนวน — บังคับเปิดตลอด ไม่อ่านค่าจาก DB (ไม่มี toggle ใน UI แล้ว)
          qty_multiplier_enabled: 1,
        })
      }
    })
    loadVatStatus()
  }, [loadVatStatus])

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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 items-start">

        <SectionCard
          icon={Bell}
          title="การแจ้งเตือนการขาย"
          tint="accent-soft"
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
              <CheckRow
                className="w-full h-11 px-3"
                label="แจ้งเตือนเมื่อสินค้าใกล้หมดอายุ"
                checked={expiryOn}
                onChange={v => setF('expiry_alert_enabled', v ? 1 : 0)}
              />
              <CheckRow
                className="w-full h-11 px-3"
                label="แจ้งเตือนสินค้าที่หมดอายุแล้ว"
                checked={!!form.expired_alert_enabled}
                onChange={v => setF('expired_alert_enabled', v ? 1 : 0)}
              />
              <CheckRow
                className="w-full h-11 px-3"
                label="แจ้งเตือนเมื่อสต๊อกไม่พอขาย"
                checked={!!form.low_stock_alert_enabled}
                onChange={v => setF('low_stock_alert_enabled', v ? 1 : 0)}
              />
            </div>

            <div className="rounded-lg border bg-muted/50 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span className="font-medium text-foreground">ความหมายของการแจ้งเตือน</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ClockAlert className="size-3.5 shrink-0 text-warning" />
                <span><span className="font-medium text-warning">เตือนล่วงหน้า</span> — เหลือไม่ถึง {EXPIRY_WARN_MONTHS} เดือน แสดงป้ายสีเหลือง</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ClockAlert className="size-3.5 shrink-0 text-accent-soft-foreground" />
                <span><span className="font-medium text-accent-soft-foreground">ระดับอันตราย</span> — เหลือไม่ถึง {EXPIRY_DANGER_MONTHS} เดือน แสดงป้ายสีส้ม</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ClockAlert className="size-3.5 shrink-0 text-destructive" />
                <span><span className="font-medium text-destructive">หมดอายุแล้ว</span> — เลยวันหมดอายุ แสดงป้ายสีแดง</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <PackageX className="size-3.5 shrink-0 text-destructive" />
                <span><span className="font-medium text-destructive">สต๊อกไม่พอขาย</span> — จำนวนคงเหลือไม่พอต่อการขาย</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={ReceiptText}
          title="ภาษีมูลค่าเพิ่ม (VAT)"
          tint="info-soft"
        >
          <div className="space-y-3">
            {/* VAT mode is a one-time decision — no toggle here by design.
                NO-VAT shops get the guarded one-way upgrade button instead. */}
            <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
              <div className="flex items-center justify-between gap-3 h-11 px-3">
                <span className="text-sm font-medium text-foreground">สถานะร้าน</span>
                {vatEnabled
                  ? <Badge variant="success-outline">จดทะเบียน VAT</Badge>
                  : <Badge variant="neutral-outline">ไม่จดทะเบียน VAT</Badge>}
              </div>
              {vatEnabled ? (
                <>
                  <div className="flex items-center justify-between gap-3 h-11 px-3">
                    <span className="text-sm font-medium text-foreground">อัตราภาษี</span>
                    <span className="text-sm text-foreground">{vatRate}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 h-11 px-3">
                    <span className="text-sm font-medium text-foreground">วันที่จดทะเบียน</span>
                    <span className="text-sm text-foreground">{vatRegisteredDate ? formatDate(vatRegisteredDate) : '—'}</span>
                  </div>
                  {/* Guarded downgrade — admin password re-entry + reason, audited */}
                  <div className="flex items-center justify-between gap-3 h-11 px-3">
                    <span className="text-sm text-muted-foreground">เพิกถอนทะเบียน VAT แล้ว?</span>
                    <Button variant="destructive-soft" onClick={() => setDowngradeOpen(true)}>
                      ปิดระบบ VAT
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3 h-11 px-3">
                  <span className="text-sm text-muted-foreground">ร้านจดทะเบียน VAT แล้วใช่ไหม?</span>
                  <Button variant="default" onClick={() => setUpgradeOpen(true)}>
                    เปิดใช้ระบบ VAT
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/50 px-3 py-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              {vatEnabled ? (
                <span>ราคาสินค้าที่ตั้งไว้ถือว่า<span className="font-medium text-foreground">รวม VAT แล้ว</span> — ระบบถอดภาษีออกมาแสดงในใบเสร็จ ยอดที่ลูกค้าจ่ายไม่เปลี่ยน และคิดกับ<span className="font-medium text-foreground">สินค้าทุกรายการ</span>. การปิดระบบทำได้เฉพาะผู้ดูแลระบบยืนยันรหัสผ่านพร้อมเหตุผล และ<span className="font-medium text-foreground">ถูกบันทึกประวัติทุกครั้ง</span></span>
              ) : (
                <span>ขณะนี้ระบบ<span className="font-medium text-foreground">ไม่คิด VAT</span> กับการขาย. หากร้านจดทะเบียน VAT ในภายหลัง ให้กด "เปิดใช้ระบบ VAT" — ระบบจะคิด VAT กับทุกบิลนับจากนั้น การเปิด/ปิดถูก<span className="font-medium text-foreground">บันทึกประวัติเพื่อการตรวจสอบทุกครั้ง</span></span>
              )}
            </div>
          </div>
        </SectionCard>

      </div>

      <UpgradeVatDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} onUpgraded={loadVatStatus} />
      <DowngradeVatDialog open={downgradeOpen} onOpenChange={setDowngradeOpen} onDowngraded={loadVatStatus} />
    </div>
  )
}
