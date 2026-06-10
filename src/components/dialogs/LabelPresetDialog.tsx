import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { Info } from 'lucide-react'
import type { LabelPreset } from '@/types'
import type { LabelFormLookups } from '@/components/label/LabelFormDialog'

const Field = FormField

type UsageKey = 'dosage_id' | 'frequency_id' | 'timing_id' | 'label_time_id' | 'advice_id'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: LabelPreset | null
  lookups: LabelFormLookups
  onSaved: () => void | Promise<void>
  /** Restricted mode (lookup-delete impact flow): enable ONLY this usage field;
      name + the other fields are locked, and the field starts cleared. */
  restrictField?: UsageKey
  /** Hide this lookup id from the restricted field's options (it is the row about
      to be deleted). */
  excludeLookupId?: number
}

const blank = () => ({ name: '', dosage_id: 0, frequency_id: 0, timing_id: 0, label_time_id: 0, advice_id: 0 })

export function LabelPresetDialog({ open, onOpenChange, editing, lookups, onSaved, restrictField, excludeLookupId }: Props) {
  const { toast } = useToast()
  const [form, setForm] = useState<any>(blank())
  const [saving, setSaving] = useState(false)
  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const restricted = !!restrictField
  const enabled = (key: UsageKey) => !restricted || key === restrictField

  // The 5 usage fields → their lookup list (mirror of LabelFormDialog).
  const usageFields: { key: UsageKey; label: string; items: any[]; searchPh: string }[] = [
    { key: 'dosage_id',     label: 'ปริมาณยา',           items: lookups.labelDosages,       searchPh: 'พิมพ์ค้นหาปริมาณยา...' },
    { key: 'frequency_id',  label: 'ความถี่',            items: lookups.labelFrequencies,   searchPh: 'พิมพ์ค้นหาความถี่...' },
    { key: 'timing_id',     label: 'เวลาเทียบมื้ออาหาร',  items: lookups.labelMealRelations, searchPh: 'พิมพ์ค้นหาเวลาเทียบมื้อ...' },
    { key: 'label_time_id', label: 'เวลาที่รับประทาน',    items: lookups.labelTimes,         searchPh: 'พิมพ์ค้นหาเวลา...' },
    { key: 'advice_id',     label: 'คำแนะนำ',            items: lookups.labelAdvices,       searchPh: 'พิมพ์ค้นหาคำแนะนำ...' },
  ]

  useEffect(() => {
    if (!open) return
    if (editing) {
      const e = editing as any
      setForm({
        name: e.name ?? '',
        dosage_id: e.dosage_id ?? 0,
        frequency_id: e.frequency_id ?? 0,
        timing_id: e.timing_id ?? 0,
        label_time_id: e.label_time_id ?? 0,
        advice_id: e.advice_id ?? 0,
        // Restricted mode: clear the offending field so the user must reassign it.
        ...(restrictField ? { [restrictField]: 0 } : {}),
      })
    } else {
      setForm(blank())
    }
  }, [open, editing, restrictField])

  const handleSave = async () => {
    if (!String(form.name ?? '').trim()) { toast({ title: 'กรุณาระบุชื่อ preset', variant: 'error' }); return }
    setSaving(true)
    try {
      const payload: any = {
        name: form.name,
        dosage_id: form.dosage_id || null,
        frequency_id: form.frequency_id || null,
        timing_id: form.timing_id || null,
        label_time_id: form.label_time_id || null,
        advice_id: form.advice_id || null,
      }
      if (editing) payload.id = editing.id
      await window.api.settings.saveLabelPreset(payload)
      toast({ title: 'บันทึก preset สำเร็จ', variant: 'success' })
      onOpenChange(false)
      await onSaved()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" divided className="max-h-[90vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>{editing ? 'แก้ไข preset วิธีใช้' : 'เพิ่ม preset วิธีใช้'}</DialogTitle>
          {restricted && (
            <div className="flex items-start gap-1.5 text-xs text-warning-soft-foreground">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>แก้ได้เฉพาะช่องที่ไฮไลต์ เพื่อเลิกอ้างอิงรายการที่กำลังจะลบ</span>
            </div>
          )}
        </DialogHeader>
        <DialogBody className="space-y-3 overflow-y-auto min-h-0 scrollbar-thin">
          <Field label="ชื่อ preset" required>
            <Input variant="elevated" value={form.name ?? ''} onChange={e => setF('name', e.target.value)} placeholder="เช่น 1x2" disabled={restricted} autoFocus={!restricted} />
          </Field>
          {usageFields.map(f => (
            <div key={f.key} className={cn(restricted && enabled(f.key) && 'rounded-lg ring-2 ring-primary/40 p-2 -m-2')}>
              <Field label={f.label}>
                <Combobox
                  variant="elevated"
                  items={(restricted && f.key === restrictField && excludeLookupId != null)
                    ? f.items.filter((i: any) => i.id !== excludeLookupId)
                    : f.items}
                  value={f.items.find((i: any) => i.id === Number(form[f.key])) ?? null}
                  onChange={(i: any) => setF(f.key, i?.id ?? 0)}
                  getKey={(i: any) => i.id}
                  getLabel={(i: any) => i.name_th}
                  placeholder="— เลือก —"
                  searchPlaceholder={f.searchPh}
                  emptyLabel="— ไม่เลือก —"
                  emptyText="ไม่พบรายการ"
                  disabled={!enabled(f.key)}
                />
              </Field>
            </div>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
