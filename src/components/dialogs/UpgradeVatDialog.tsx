import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { DateInput } from '@/components/ui/date-input'
import { useToast } from '@/components/ui/toast'
import { VAT_RATE_DEFAULT } from '@/lib/vat'
import { TriangleAlert, ReceiptText } from 'lucide-react'
import type { Setting } from '@/types'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Guarded one-way upgrade to VAT-registered mode (Phase 3). Re-enters the
// registration data (tax id / branch / rate / effective date) and calls
// settings:upgradeToVat — admin-only on the main side, audited in
// vat_audit_log. There is intentionally no way back: a VAT shop charges VAT
// on every bill from the effective date onward.
export function UpgradeVatDialog({
  open, onOpenChange, onUpgraded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpgraded?: () => void
}) {
  const { toast } = useToast()
  const [taxId, setTaxId] = useState('')
  const [branch, setBranch] = useState('สำนักงานใหญ่')
  const [rateStr, setRateStr] = useState(String(VAT_RATE_DEFAULT))
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setRateStr(String(VAT_RATE_DEFAULT))
    setEffectiveDate(todayIso())
    setBusy(false)
    // Prefill registration identity from shop settings when already entered
    window.api.settings.getShop().then((s: Setting | null) => {
      setTaxId((s as any)?.shop_tax_id ?? '')
      setBranch((s as any)?.shop_branch || 'สำนักงานใหญ่')
    })
  }, [open])

  const handleConfirm = async () => {
    if (busy) return
    if (!/^\d{13}$/.test(taxId.trim())) {
      toast({ title: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก', variant: 'error' }); return
    }
    const rate = parseFloat(rateStr)
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      toast({ title: 'อัตราภาษีไม่ถูกต้อง', variant: 'error' }); return
    }
    if (!effectiveDate) {
      toast({ title: 'กรุณาระบุวันที่จดทะเบียน VAT', variant: 'error' }); return
    }
    setBusy(true)
    try {
      await window.api.settings.upgradeToVat({
        tax_id: taxId.trim(),
        branch: branch.trim() || 'สำนักงานใหญ่',
        vat_rate: rate,
        effective_date: effectiveDate,
      })
      toast({ title: 'เปิดใช้ระบบ VAT แล้ว', description: 'ระบบจะคิด VAT กับทุกบิลตั้งแต่ตอนนี้เป็นต้นไป', variant: 'success' })
      onOpenChange(false)
      onUpgraded?.()
    } catch (e: any) {
      toast({ title: 'เปิดใช้ระบบ VAT ไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" divided onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="size-5" /> เปิดใช้ระบบภาษีมูลค่าเพิ่ม (VAT)
          </DialogTitle>
        </DialogHeader>
        <DialogBody
          className="space-y-3"
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label="เลขประจำตัวผู้เสียภาษี (13 หลัก)">
              <Input
                inputMode="numeric"
                maxLength={13}
                value={taxId}
                onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </FormField>
            <FormField label="สาขา">
              <Input value={branch} onChange={e => setBranch(e.target.value)} placeholder="สำนักงานใหญ่" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="อัตราภาษี (%)">
              <Input
                inputMode="decimal"
                value={rateStr}
                onChange={e => setRateStr(e.target.value)}
              />
            </FormField>
            <FormField label="วันที่จดทะเบียน VAT">
              <DateInput variant="elevated" value={effectiveDate} onChange={setEffectiveDate} />
            </FormField>
          </div>
          <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 flex items-start gap-2 text-sm">
            <TriangleAlert className="size-4 shrink-0 mt-0.5 text-warning-strong" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">โปรดตัดสินใจอย่างรอบคอบ</p>
              <p className="text-muted-foreground">
                เมื่อเปิดใช้แล้ว ระบบจะคิด VAT กับสินค้าทุกรายการในทุกบิล —
                ร้านที่จดทะเบียน VAT ต้องเก็บภาษีต่อเนื่องทุกบิลตามกฎหมาย
                การปิดทำได้เฉพาะผู้ดูแลระบบยืนยันรหัสผ่านพร้อมเหตุผล และ
                <span className="font-medium text-foreground">ถูกบันทึกประวัติทุกครั้ง</span>.
                บิลที่ขายไปก่อนหน้านี้จะไม่ถูกคิดภาษีย้อนหลัง
              </p>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="xl" variant="elevated" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button size="xl" variant="default" onClick={handleConfirm} disabled={busy}>
            {busy ? 'กำลังบันทึก...' : 'ยืนยันเปิดใช้ VAT'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
