import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { TriangleAlert, ShieldAlert } from 'lucide-react'

// Guarded downgrade out of VAT-registered mode. The logged-in admin re-enters
// their OWN password (verified main-side with the login lockout backoff) and
// must give a reason; both land in vat_audit_log. Old bills keep their VAT
// snapshots — only future bills stop carrying VAT. Counterpart to
// UpgradeVatDialog; re-upgrading later uses that same flow.
export function DowngradeVatDialog({
  open, onOpenChange, onDowngraded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDowngraded?: () => void
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason('')
    setPassword('')
    setBusy(false)
  }, [open])

  const handleConfirm = async () => {
    if (busy) return
    if (!reason.trim()) { toast({ title: 'กรุณาระบุเหตุผลในการปิดระบบ VAT', variant: 'error' }); return }
    if (!password) { toast({ title: 'กรุณายืนยันรหัสผ่าน', variant: 'error' }); return }
    setBusy(true)
    try {
      await window.api.settings.downgradeFromVat({ password, reason: reason.trim() })
      toast({ title: 'ปิดระบบ VAT แล้ว', description: 'บิลใหม่จะไม่มี VAT — บิลและรายงานย้อนหลังไม่เปลี่ยนแปลง', variant: 'success' })
      onOpenChange(false)
      onDowngraded?.()
    } catch (e: any) {
      if (e?.message?.includes('LOCKED')) {
        toast({ title: 'ใส่รหัสผ่านผิดหลายครั้ง', description: 'ระบบล็อกชั่วคราว กรุณารอสักครู่แล้วลองใหม่', variant: 'error' })
      } else {
        toast({ title: 'ปิดระบบ VAT ไม่สำเร็จ', description: e?.message?.replace(/^.*Error: /, '') ?? '', variant: 'error' })
      }
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" divided onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" /> ปิดระบบภาษีมูลค่าเพิ่ม (VAT)
          </DialogTitle>
        </DialogHeader>
        <DialogBody
          className="space-y-3"
          onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') handleConfirm() }}
        >
          <div className="rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2.5 flex items-start gap-2 text-sm">
            <TriangleAlert className="size-4 shrink-0 mt-0.5 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">ผลของการปิดระบบ VAT</p>
              <ul className="text-muted-foreground space-y-0.5 list-disc pl-4">
                <li>บิลขายใหม่จะไม่มี VAT และออกใบกำกับภาษีไม่ได้</li>
                <li>รายงานภาษีขาย/ภาษีซื้อ/ภ.พ.30 หยุดนับตั้งแต่วันนี้</li>
                <li>บิลและรายงานย้อนหลังไม่เปลี่ยนแปลง และยังเปิดดูได้</li>
                <li>การปิดถูกบันทึกประวัติ (ผู้ทำ วันเวลา เหตุผล) เพื่อการตรวจสอบ</li>
              </ul>
              <p className="text-muted-foreground">
                ควรปิดเมื่อร้าน<span className="font-medium text-foreground">เพิกถอนทะเบียน VAT กับสรรพากรแล้ว</span>เท่านั้น
              </p>
            </div>
          </div>
          <FormField label="เหตุผลในการปิด" required>
            <Textarea
              rows={2}
              className="resize-none"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="เช่น เพิกถอนทะเบียน VAT แล้ว ตามหนังสือเลขที่..."
              autoFocus
            />
          </FormField>
          <FormField label="รหัสผ่านของผู้ดูแลระบบ (ยืนยันตัวตน)" required>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="รหัสผ่านของบัญชีที่ล็อกอินอยู่"
            />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button size="xl" variant="destructive-soft" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button size="xl" variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy ? 'กำลังบันทึก...' : 'ยืนยันปิดระบบ VAT'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
