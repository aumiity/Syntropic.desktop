import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DateInput } from '@/components/ui/date-input'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { Bell } from 'lucide-react'
import type { Customer, DrugAllergy } from '@/types'

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'เล็กน้อย', moderate: 'ปานกลาง', severe: 'รุนแรง', life_threatening: 'อันตรายถึงชีวิต',
}
const SEVERITY_VARIANTS: Record<string, any> = {
  mild: 'secondary', moderate: 'warning', severe: 'amber-soft', life_threatening: 'destructive',
}

// Enter on a working input fires the primary OK action (modal contract).
// Textarea is exempted so multi-line input keeps newline behaviour.
const submitOnEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
    e.preventDefault()
    fn()
  }
}

const blankForm = (defaultName = '') => ({
  full_name: defaultName, id_card: '', dob: '', phone: '', address: '',
  branch: '',
  chronic_diseases: '', is_alert: 0, alert_note: '', is_disabled: 0,
})

export interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Customer id to edit. Omit/null = add mode. */
  customerId?: number | null
  /** Prefill the name field in add mode (e.g. a POS search query). */
  defaultName?: string
  /** Fired with the saved customer row after a successful save. */
  onSaved?: (customer: Customer) => void
}

/**
 * Shared add/edit customer dialog used by both the People page and POS.
 * Owns its own form state + save IPC + success toast; the parent reacts via
 * `onSaved` (set into cart, reload list, etc.).
 */
export function CustomerFormDialog({ open, onOpenChange, customerId, defaultName, onSaved }: CustomerFormDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<any>(blankForm())
  const [allergies, setAllergies] = useState<DrugAllergy[]>([])
  const [editingName, setEditingName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load on open: fetch the customer in edit mode, reset to blank in add mode.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    if (customerId) {
      window.api.people.getCustomer(customerId).then((data: any) => {
        if (cancelled || !data) return
        setEditingName(data.full_name ?? '')
        setAllergies(data.allergies ?? [])
        setForm({
          id: data.id,
          full_name: data.full_name ?? '',
          id_card: data.id_card ?? '',
          dob: data.dob ?? '',
          phone: data.phone ?? '',
          address: data.address ?? '',
          branch: data.branch ?? '',
          chronic_diseases: data.chronic_diseases ?? '',
          is_alert: data.is_alert ?? 0,
          alert_note: data.alert_note ?? '',
          is_disabled: data.is_disabled ?? 0,
        })
      })
    } else {
      setEditingName(null)
      setAllergies([])
      setForm(blankForm(defaultName ?? ''))
    }
    return () => { cancelled = true }
  }, [open, customerId, defaultName])

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.full_name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      const saved = await window.api.people.saveCustomer(form) as Customer
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      onOpenChange(false)
      onSaved?.(saved)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const isEdit = !!customerId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" divided onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `แก้ไข: ${editingName ?? ''}` : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4" onKeyDown={submitOnEnter(handleSave)}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ชื่อ-นามสกุล <span className="text-destructive">*</span></Label>
              <Input variant="elevated" value={form.full_name ?? ''} onChange={e => setF('full_name', e.target.value)} autoFocus placeholder="ระบุชื่อ-นามสกุล..." />
            </div>
            <div className="space-y-1.5">
              <Label>โทรศัพท์</Label>
              <Input variant="elevated" value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} placeholder="08X-XXX-XXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี</Label>
              <Input variant="elevated" inputMode="numeric" maxLength={13}
                value={form.id_card ?? ''} onChange={e => setF('id_card', e.target.value.replace(/\D/g, ''))}
                placeholder="13 หลัก" />
            </div>
            <div className="space-y-1.5">
              <Label>วันเกิด</Label>
              <DateInput variant="elevated" value={form.dob ?? ''} onChange={iso => setF('dob', iso)} />
            </div>
            <div className="space-y-1.5">
              <Label>สาขา (สำหรับใบกำกับภาษี)</Label>
              <Input variant="elevated" value={form.branch ?? ''} onChange={e => setF('branch', e.target.value)} placeholder="สำนักงานใหญ่" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>ที่อยู่</Label>
              <Textarea variant="elevated" value={form.address ?? ''} onChange={e => setF('address', e.target.value)} rows={3} className="resize-none" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>โรคประจำตัว</Label>
            <Input variant="elevated" value={form.chronic_diseases ?? ''} onChange={e => setF('chronic_diseases', e.target.value)} />
          </div>

          {/* Alert section — switch header + message grouped in one elevated card */}
          <div className={`rounded-lg border p-3 shadow-sm transition-colors ${form.is_alert ? 'bg-card border-destructive/40' : 'bg-muted/40 border-border'}`}>
            <label className="flex items-center gap-2 h-12 cursor-pointer select-none">
              <Checkbox checked={!!form.is_alert} onCheckedChange={v => setF('is_alert', v ? 1 : 0)} />
              <Bell className={`size-4 ${form.is_alert ? 'text-destructive' : 'text-foreground-subtle'}`} />
              <Label className="cursor-pointer">การแจ้งเตือนลูกค้า</Label>
            </label>
            <Input variant="elevated" className="mt-2.5"
              value={form.alert_note ?? ''} onChange={e => setF('alert_note', e.target.value)}
              disabled={!form.is_alert} placeholder="เช่น แพ้ยา, แพ้อาหาร, ลดราคาพิเศษ" />
          </div>

          {/* Drug allergies (readonly, edit mode only) */}
          {isEdit && allergies.length > 0 && (
            <div className="space-y-1.5">
              <Label>ประวัติแพ้ยา</Label>
              <div className="space-y-1.5">
                {allergies.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
                    <Badge variant={SEVERITY_VARIANTS[a.severity ?? 'moderate'] ?? 'secondary'} className="shrink-0">
                      {SEVERITY_LABELS[a.severity ?? 'moderate']}
                    </Badge>
                    <span className="font-medium">{a.generic_name ?? a.drug_name_free ?? '—'}</span>
                    {a.reaction && <span className="text-muted-foreground">→ {a.reaction}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
