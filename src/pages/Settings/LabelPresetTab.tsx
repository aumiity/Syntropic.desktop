import { useState, useEffect, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { TintIcon } from '@/components/ui/tint-icon'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Plus, Edit, Trash2, ListChecks } from 'lucide-react'
import type { LabelPreset } from '@/types'
import type { LabelFormLookups } from '@/components/label/LabelFormDialog'
import { LabelPresetDialog } from '@/components/dialogs/LabelPresetDialog'

const emptyLookups: LabelFormLookups = {
  labelFrequencies: [], labelDosages: [], labelMealRelations: [], labelTimes: [], labelAdvices: [],
}

export function LabelPresetTab() {
  const { toast } = useToast()
  const [presets, setPresets] = useState<LabelPreset[]>([])
  const [lookups, setLookups] = useState<LabelFormLookups>(emptyLookups)
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<LabelPreset | null>(null)
  const [confirmDel, setConfirmDel] = useState<LabelPreset | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [rows, freqs, dosages, meals, times, advices] = await Promise.all([
        window.api.settings.listLabelPresets(),
        window.api.settings.listLabelFrequencies(),
        window.api.settings.listLabelDosages(),
        window.api.settings.listLabelMealRelations(),
        window.api.settings.listLabelTimes(),
        window.api.settings.listLabelAdvices(),
      ])
      setPresets(rows as LabelPreset[])
      setLookups({
        labelFrequencies: freqs as any[], labelDosages: dosages as any[],
        labelMealRelations: meals as any[], labelTimes: times as any[], labelAdvices: advices as any[],
      })
    } catch (e: any) {
      toast({ title: 'โหลดข้อมูลไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }, [toast])
  useEffect(() => { load() }, [load])

  // id → name_th maps for display.
  const nameMaps = useMemo(() => {
    const m = (arr: any[]) => new Map(arr.map(x => [x.id, x.name_th]))
    return {
      dosage_id: m(lookups.labelDosages), frequency_id: m(lookups.labelFrequencies),
      timing_id: m(lookups.labelMealRelations), label_time_id: m(lookups.labelTimes),
      advice_id: m(lookups.labelAdvices),
    }
  }, [lookups])
  const nm = (map: Map<any, any>, id?: number | null) => (id != null ? (map.get(id) ?? '—') : '—')

  const openAdd = () => { setEditing(null); setDialog(true) }
  const openEdit = (p: LabelPreset) => { setEditing(p); setDialog(true) }

  const handleDelete = async () => {
    if (!confirmDel) return
    setDelBusy(true)
    try {
      await window.api.settings.deleteLabelPreset(confirmDel.id)
      toast({ title: 'ลบ preset แล้ว', variant: 'success' })
      setConfirmDel(null); await load()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setDelBusy(false) }
  }

  const needle = q.trim().toLowerCase()
  const filtered = needle ? presets.filter(p => p.name.toLowerCase().includes(needle)) : presets

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={ListChecks} tint="elevated" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">preset วิธีใช้ยา</h3>
            <Badge variant="neutral">{filtered.length.toLocaleString()}</Badge>
          </div>
          <SearchInput variant="elevated" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ preset..." />
          <Button size="lg" className="h-9 px-2 shrink-0 ml-auto" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่ม preset
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[100px] whitespace-normal">ชื่อ preset</TableHead>
                <TableHead className="min-w-[90px] whitespace-normal">ปริมาณยา</TableHead>
                <TableHead className="min-w-[80px] whitespace-normal">ความถี่</TableHead>
                <TableHead className="min-w-[90px] whitespace-normal">เวลาเทียบมื้อ</TableHead>
                <TableHead className="min-w-[80px] whitespace-normal">เวลา</TableHead>
                <TableHead className="min-w-[90px] whitespace-normal">คำแนะนำ</TableHead>
                <TableHead className="text-center w-28">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <ListChecks className="size-10 mx-auto mb-2 opacity-30" />
                    {needle ? 'ไม่พบข้อมูล' : 'ยังไม่มี preset'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm font-semibold text-foreground whitespace-normal break-words align-top">{p.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{nm(nameMaps.dosage_id, p.dosage_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{nm(nameMaps.frequency_id, p.frequency_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{nm(nameMaps.timing_id, p.timing_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{nm(nameMaps.label_time_id, p.label_time_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-top">{nm(nameMaps.advice_id, p.advice_id)}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex justify-center gap-1.5">
                      <Button size="icon-lg" variant="elevated" tooltip="แก้ไข" onClick={() => openEdit(p)}><Edit /></Button>
                      <Button size="icon-lg" variant="elevated-destructive-soft" tooltip="ลบ" onClick={() => setConfirmDel(p)}><Trash2 /></Button>
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

      <LabelPresetDialog
        open={dialog}
        onOpenChange={setDialog}
        editing={editing}
        lookups={lookups}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={v => { if (!v) setConfirmDel(null) }}
        title="ต้องการลบรายการนี้?"
        variant="destructive"
        confirmLabel="ยืนยัน"
        busy={delBusy}
        onConfirm={handleDelete}
        content={confirmDel && (
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <div className="flex justify-center items-center">
              <span className="text-base font-semibold text-foreground">{confirmDel.name}</span>
            </div>
          </div>
        )}
      />
    </div>
  )
}
