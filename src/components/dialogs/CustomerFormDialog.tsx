import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label, FormField } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-input'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { UserRound, HeartPulse, Bell } from 'lucide-react'
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
  note: '', is_alert: 0, alert_note: '', is_disabled: 0,
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
          note: data.note ?? '',
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
      <DialogContent size="4xl" divided onClose={() => onOpenChange(false)} className="max-h-[88vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? `แก้ไข: ${editingName ?? ''}` : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid grid-cols-[3fr_2fr] items-start gap-4 overflow-y-auto min-h-0 scrollbar-thin" onKeyDown={submitOnEnter(handleSave)}>

          {/* ── LEFT: ข้อมูลส่วนตัว ── */}
          <SectionCard icon={UserRound} title="ข้อมูลส่วนตัว" tint="primary">
            <FormField label="ชื่อ-นามสกุล" required>
              <Input value={form.full_name ?? ''} onChange={e => setF('full_name', e.target.value)} autoFocus placeholder="ระบุชื่อ-นามสกุล..." />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="โทรศัพท์">
                <Input value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} placeholder="08X-XXX-XXXX" />
              </FormField>
              <FormField label="เลขบัตรประชาชน / ผู้เสียภาษี">
                <Input inputMode="numeric" maxLength={13}
                  value={form.id_card ?? ''} onChange={e => setF('id_card', e.target.value.replace(/\D/g, ''))}
                  placeholder="13 หลัก" />
              </FormField>
              <FormField label="วันเกิด">
                <DateInput variant="elevated" value={form.dob ?? ''} onChange={iso => setF('dob', iso)} />
              </FormField>
              <FormField label={<>สาขา <span className="font-normal normal-case text-muted-foreground">(สำหรับใบกำกับภาษี)</span></>}>
                <Input value={form.branch ?? ''} onChange={e => setF('branch', e.target.value)} placeholder="เช่น สำนักงานใหญ่" />
              </FormField>
            </div>
            <FormField label="ที่อยู่">
              <Textarea value={form.address ?? ''} onChange={e => setF('address', e.target.value)} rows={3} className="resize-none" placeholder="" />
            </FormField>
          </SectionCard>

          {/* ── RIGHT: ข้อมูลสุขภาพ + การแจ้งเตือน ── */}
          <div className="flex flex-col gap-4">

          {/* ── สุขภาพ & โน้ต ── */}
          <SectionCard icon={HeartPulse} title="สุขภาพ & โน้ต" tint="teal">
            {/* Stored in customers.note — free-form multi-line note. POS renders it
                with whitespace-pre-line so newlines survive. */}
            <FormField label="โน้ต / หมายเหตุ">
              <Textarea value={form.note ?? ''} onChange={e => setF('note', e.target.value)} rows={4} className="resize-none"
                placeholder="บันทึกเพิ่มเติม เช่น โรคประจำตัว, ข้อควรระวัง, ยาที่ใช้" />
            </FormField>

            {/* Drug allergies (readonly, edit mode only) */}
            {isEdit && allergies.length > 0 && (
              <FormField label="ประวัติแพ้ยา">
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
              </FormField>
            )}
          </SectionCard>

          {/* ── การแจ้งเตือน ── */}
          <SectionCard icon={Bell} title="การแจ้งเตือน" tint="amber">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox checked={!!form.is_alert} onCheckedChange={v => setF('is_alert', v ? 1 : 0)} />
              <Label className="cursor-pointer">แสดงข้อความแจ้งเตือนเมื่อขายให้ลูกค้ารายนี้</Label>
            </label>
            <Input
              value={form.alert_note ?? ''} onChange={e => setF('alert_note', e.target.value)}
              disabled={!form.is_alert} placeholder="เช่น แพ้ยา, แพ้อาหาร, ลดราคาพิเศษ" />
          </SectionCard>

          </div>

        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
