import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { TintIcon } from '@/components/ui/tint-icon'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FormField } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Plus, Edit, Trash2, Stethoscope } from 'lucide-react'
import type { LabelFormLookups } from '@/components/label/LabelFormDialog'
import { LookupDeleteDialog } from '@/components/dialogs/LookupDeleteDialog'
import { LabelPresetTab } from './LabelPresetTab'
import { usePublishDevTab } from '@/stores/devTabStore'

interface LookupRow { id: number; code: string; name_th: string; name_en?: string; name_mm?: string; name_zh?: string }

const KINDS = [
  { key: 'dosage',    label: 'ปริมาณยา',          listKey: 'labelDosages' },
  { key: 'frequency', label: 'ความถี่',           listKey: 'labelFrequencies' },
  { key: 'meal',      label: 'เวลาเทียบมื้อ',      listKey: 'labelMealRelations' },
  { key: 'time',      label: 'เวลา',              listKey: 'labelTimes' },
  { key: 'advice',    label: 'คำแนะนำ',           listKey: 'labelAdvices' },
] as const

const emptyLookups: LabelFormLookups = {
  labelFrequencies: [], labelDosages: [], labelMealRelations: [], labelTimes: [], labelAdvices: [],
}

export function LabelLookupTab() {
  const { toast } = useToast()
  const [kind, setKind] = useState<string>('dosage')
  usePublishDevTab(kind, 1) // DEV ONLY — surfaces 'preset' nested sub-tab file in TitleBar path
  const [lookups, setLookups] = useState<LabelFormLookups>(emptyLookups)
  const [q, setQ] = useState('')

  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [confirmDel, setConfirmDel] = useState<LookupRow | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [impact, setImpact] = useState<LookupRow | null>(null)

  const kindDef = KINDS.find(k => k.key === kind)
  const listKey = (kindDef?.listKey ?? 'labelDosages') as keyof LabelFormLookups
  const rows = (lookups[listKey] as LookupRow[]) ?? []

  const load = useCallback(async () => {
    try {
      const [freqs, dosages, meals, times, advices] = await Promise.all([
        window.api.settings.listLabelFrequencies(),
        window.api.settings.listLabelDosages(),
        window.api.settings.listLabelMealRelations(),
        window.api.settings.listLabelTimes(),
        window.api.settings.listLabelAdvices(),
      ])
      setLookups({
        labelFrequencies: freqs as any[], labelDosages: dosages as any[],
        labelMealRelations: meals as any[], labelTimes: times as any[], labelAdvices: advices as any[],
      })
    } catch (e: any) {
      toast({ title: 'โหลดข้อมูลไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }, [toast])
  useEffect(() => { load() }, [load])

  const openAdd = () => { setForm({ name_th: '', name_en: '', name_mm: '', name_zh: '' }); setDialog(true) }
  const openEdit = (r: LookupRow) => {
    setForm({ id: r.id, name_th: r.name_th, name_en: r.name_en ?? '', name_mm: r.name_mm ?? '', name_zh: r.name_zh ?? '' })
    setDialog(true)
  }
  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!String(form.name_th ?? '').trim()) { toast({ title: 'กรุณาระบุชื่อ (ภาษาไทย)', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.settings.saveLabelLookup({ kind, ...form })
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); await load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  // Delete: ask the backend who references this row. None → quick confirm; some
  // → open the impact dialog so the user resolves each label/preset first.
  const startDelete = async (r: LookupRow) => {
    try {
      const res = await window.api.settings.labelLookupRefs({ kind, id: r.id })
      if (res.count === 0) setConfirmDel(r)
      else setImpact(r)
    } catch (e: any) {
      toast({ title: 'ตรวจสอบการอ้างอิงไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDel) return
    setDelBusy(true)
    try {
      await window.api.settings.deleteLabelLookup({ kind, id: confirmDel.id })
      toast({ title: 'ลบรายการแล้ว', variant: 'success' })
      setConfirmDel(null); await load()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setDelBusy(false) }
  }

  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? rows.filter(r => r.name_th.toLowerCase().includes(needle)
        || (r.name_en ?? '').toLowerCase().includes(needle))
    : rows

  return (
    <div className="h-full flex flex-col min-h-0 gap-4">
      <Tabs value={kind} onValueChange={v => { setKind(v); setQ('') }}>
        <TabsList variant="line" className="w-full">
          {KINDS.map(k => <TabsTrigger key={k.key} value={k.key} className="flex-1 px-4 py-2">{k.label}</TabsTrigger>)}
          <TabsTrigger value="preset" className="flex-1 px-4 py-2">preset วิธีใช้</TabsTrigger>
        </TabsList>
      </Tabs>

      {kind === 'preset' ? <LabelPresetTab /> : (
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Stethoscope} tint="elevated" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">{kindDef?.label ?? 'รายการคำแปล'}</h3>
            <Badge variant="neutral">{filtered.length.toLocaleString()}</Badge>
          </div>
          <SearchInput variant="elevated" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อรายการ..." />
          <Button size="lg" className="h-9 px-2 shrink-0 ml-auto" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่มรายการ
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin [&>[data-slot=table-container]]:[scrollbar-gutter:stable]">
          <Table className="border-l-[16px] border-r-[6px] border-card">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px] whitespace-normal">ชื่อ (ไทย)</TableHead>
                <TableHead className="min-w-[110px] whitespace-normal">อังกฤษ</TableHead>
                <TableHead className="min-w-[100px] whitespace-normal">พม่า</TableHead>
                <TableHead className="min-w-[100px] whitespace-normal">จีน</TableHead>
                <TableHead className="text-center w-28">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                    <Stethoscope className="size-10 mx-auto mb-2 opacity-30" />
                    {needle ? 'ไม่พบข้อมูล' : 'ยังไม่มีรายการ'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium text-foreground whitespace-normal break-words align-top">{r.name_th}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{r.name_en || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{r.name_mm || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{r.name_zh || '—'}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex justify-center gap-1.5">
                      <Button size="icon-lg" variant="elevated" tooltip="แก้ไข" onClick={() => openEdit(r)}><Edit /></Button>
                      <Button size="icon-lg" variant="elevated-destructive-soft" tooltip="ลบ" onClick={() => startDelete(r)}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-4 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            แสดง <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> รายการ
          </span>
        </div>
      </div>
      )}

      {/* Add / edit */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm" divided>
          <DialogHeader><DialogTitle className="text-xl">{form.id ? `แก้ไข${kindDef?.label ?? 'รายการ'}` : `เพิ่ม${kindDef?.label ?? 'รายการ'}`}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <FormField label="ชื่อ (ภาษาไทย)" required>
              <Input variant="elevated" value={form.name_th ?? ''} onChange={e => setF('name_th', e.target.value)} autoFocus />
            </FormField>
            <FormField label="ชื่อ (อังกฤษ)">
              <Input variant="elevated" value={form.name_en ?? ''} onChange={e => setF('name_en', e.target.value)} />
            </FormField>
            <FormField label="ชื่อ (พม่า)">
              <Input variant="elevated" value={form.name_mm ?? ''} onChange={e => setF('name_mm', e.target.value)} />
            </FormField>
            <FormField label="ชื่อ (จีน)">
              <Input variant="elevated" value={form.name_zh ?? ''} onChange={e => setF('name_zh', e.target.value)} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (no references) */}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={v => { if (!v) setConfirmDel(null) }}
        title="ต้องการลบรายการนี้?"
        variant="destructive"
        confirmLabel="ยืนยัน"
        busy={delBusy}
        onConfirm={handleConfirmDelete}
        content={confirmDel && (
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <div className="flex justify-center items-center">
              <span className="text-base font-semibold text-foreground">{confirmDel.name_th}</span>
            </div>
          </div>
        )}
      />

      {/* Delete (has references) — resolve impact then delete */}
      {impact && (
        <LookupDeleteDialog
          open={!!impact}
          onClose={() => setImpact(null)}
          kind={kind}
          item={{ id: impact.id, name_th: impact.name_th }}
          lookups={lookups}
          onResolved={() => { setImpact(null); load() }}
        />
      )}
    </div>
  )
}
