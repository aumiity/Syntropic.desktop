import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { FormField } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { Edit, Pencil, Trash2 } from 'lucide-react'
import type { ProductLabel } from '@/types'
import { LabelFormDialog, type LabelFormLookups } from '@/components/label/LabelFormDialog'
import { LabelPresetDialog } from '@/components/dialogs/LabelPresetDialog'

type UsageKey = 'dosage_id' | 'frequency_id' | 'timing_id' | 'label_time_id' | 'advice_id'

// kind → the product_labels/label_presets FK column + which lookup list feeds the
// "reassign to" picker. Mirrors LOOKUP_KINDS in electron/ipc/settings.ts.
const KIND_META: Record<string, { fk: UsageKey; listKey: keyof LabelFormLookups }> = {
  dosage:    { fk: 'dosage_id',     listKey: 'labelDosages' },
  frequency: { fk: 'frequency_id',  listKey: 'labelFrequencies' },
  meal:      { fk: 'timing_id',     listKey: 'labelMealRelations' },
  time:      { fk: 'label_time_id', listKey: 'labelTimes' },
  advice:    { fk: 'advice_id',     listKey: 'labelAdvices' },
}

interface RefLabel { label_id: number; label_name: string | null; product_id: number; product_name: string }
interface RefPreset { preset_id: number; name: string }

interface Props {
  open: boolean
  onClose: () => void
  kind: string
  item: { id: number; name_th: string }
  lookups: LabelFormLookups
  /** Called after the lookup row is finally deleted (parent reloads its list). */
  onResolved: () => void
}

export function LookupDeleteDialog({ open, onClose, kind, item, lookups, onResolved }: Props) {
  const { toast } = useToast()
  const meta = KIND_META[kind]
  const [labels, setLabels] = useState<RefLabel[]>([])
  const [presets, setPresets] = useState<RefPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Edit-one targets
  const [editLabel, setEditLabel] = useState<{ productId: number; label: ProductLabel } | null>(null)
  const [editPreset, setEditPreset] = useState<any | null>(null)
  // Reassign-all sub-dialog
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState<any | null>(null)
  const [reassigning, setReassigning] = useState(false)

  const count = labels.length + presets.length

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.settings.labelLookupRefs({ kind, id: item.id })
      setLabels(res.labels as RefLabel[])
      setPresets(res.presets as RefPreset[])
    } catch (e: any) {
      toast({ title: 'โหลดรายการที่อ้างอิงไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setLoading(false) }
  }, [kind, item.id, toast])

  useEffect(() => { if (open) refresh() }, [open, refresh])

  const openEditLabel = async (r: RefLabel) => {
    try {
      const all = await window.api.products.getLabels(r.product_id) as ProductLabel[]
      const label = all.find(l => l.id === r.label_id)
      if (!label) { toast({ title: 'ไม่พบฉลากนี้แล้ว', variant: 'error' }); refresh(); return }
      setEditLabel({ productId: r.product_id, label })
    } catch (e: any) {
      toast({ title: 'เปิดฉลากไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  // Load the FULL preset row before editing — the refs list carries only
  // {preset_id, name}, but saveLabelPreset writes every field, so a partial
  // payload would wipe the preset's other usage fields.
  const openEditPreset = async (r: RefPreset) => {
    try {
      const all = await window.api.settings.listLabelPresets()
      const full = (all as any[]).find(p => p.id === r.preset_id)
      if (!full) { toast({ title: 'ไม่พบ preset นี้แล้ว', variant: 'error' }); refresh(); return }
      setEditPreset(full)
    } catch (e: any) {
      toast({ title: 'เปิด preset ไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const handleReassign = async () => {
    setReassigning(true)
    try {
      await window.api.settings.reassignLabelLookup({ kind, fromId: item.id, toId: reassignTo?.id ?? null })
      toast({ title: 'ย้ายรายการทั้งหมดแล้ว', variant: 'success' })
      setReassignOpen(false)
      setReassignTo(null)
      await refresh()
    } catch (e: any) {
      toast({ title: 'ย้ายไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setReassigning(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await window.api.settings.deleteLabelLookup({ kind, id: item.id })
      toast({ title: 'ลบรายการแล้ว', variant: 'success' })
      onResolved()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      refresh()
    } finally { setDeleting(false) }
  }

  // Same-kind options for the reassign picker, excluding the dying row.
  const reassignItems = (lookups[meta.listKey] as any[]).filter(i => i.id !== item.id)

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent size="2xl" divided className="h-[min(640px,calc(100vh-3rem))] grid-rows-[auto_1fr_auto]">
          <DialogHeader>
            <DialogTitle>จัดการฉลาก</DialogTitle>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{item.name_th}</span> ถูกใช้ใน{' '}
              <span className="font-semibold text-foreground">{count}</span> รายการ — ต้องทำการแก้ไขทั้งหมดก่อน จึงจะสามารถลบได้
            </div>
          </DialogHeader>

          <DialogBody className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <div className="flex h-12 shrink-0 items-center justify-between">
              <span className="text-sm text-muted-foreground">รายการที่อ้างอิงอยู่</span>
              <Button variant="elevated" size="lg" disabled={count === 0 || loading} onClick={() => setReassignOpen(true)}>
                <Pencil className="size-4" /> แก้ไขทั้งหมด
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto scrollbar-thin rounded-card border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">ชนิด</TableHead>
                    <TableHead className="min-w-[200px]">รายการ</TableHead>
                    <TableHead className="min-w-[160px]">ฉลาก / preset</TableHead>
                    <TableHead className="w-24 text-center">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {count === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-sm text-success">
                        ไม่มีรายการอ้างอิงแล้ว — กด "ลบรายการนี้" ได้เลย
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {labels.map(r => (
                        <TableRow key={`l-${r.label_id}`}>
                          <TableCell><Badge variant="info-outline">ฉลากสินค้า</Badge></TableCell>
                          <TableCell className="text-sm font-medium text-foreground">{r.product_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.label_name || 'ฉลากไม่มีชื่อ'}</TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <Button size="icon-lg" variant="elevated" title="แก้ไข" onClick={() => openEditLabel(r)}>
                                <Edit />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {presets.map(r => (
                        <TableRow key={`p-${r.preset_id}`}>
                          <TableCell><Badge variant="primary-outline">preset</Badge></TableCell>
                          <TableCell className="text-sm font-medium text-foreground">{r.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">preset วิธีใช้</TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <Button size="icon-lg" variant="elevated" title="แก้ไข" onClick={() => openEditPreset(r)}>
                                <Edit />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogBody>

          <DialogFooter className="items-center justify-between sm:justify-between">
            <Button variant="elevated" size="xl" onClick={onClose}>ปิด</Button>
            <Button variant="destructive" size="xl" disabled={count !== 0 || deleting} onClick={handleDelete}>
              <Trash2 className="size-4" /> {deleting ? 'กำลังลบ...' : 'ลบรายการนี้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign-all sub-dialog */}
      <Dialog open={reassignOpen} onOpenChange={v => { if (!v) { setReassignOpen(false); setReassignTo(null) } }}>
        <DialogContent size="md" divided>
          <DialogHeader><DialogTitle>ย้ายทุกรายการ</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="text-sm text-muted-foreground">
              เปลี่ยนจาก <span className="font-semibold text-foreground">{item.name_th}</span> ทั้งหมด
            </div>
            <FormField label="เป็น">
              <Combobox
                variant="elevated"
                items={reassignItems}
                value={reassignTo}
                onChange={(i: any) => setReassignTo(i)}
                getKey={(i: any) => i.id}
                getLabel={(i: any) => i.name_th}
                placeholder="— เลือก —"
                searchPlaceholder="พิมพ์ค้นหา..."
                emptyLabel="— ไม่เลือก (เว้นว่าง) —"
                emptyText="ไม่พบรายการ"
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => { setReassignOpen(false); setReassignTo(null) }}>ยกเลิก</Button>
            <Button size="xl" onClick={handleReassign} disabled={reassigning}>{reassigning ? 'กำลังย้าย...' : 'ยืนยัน'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit one label — restricted to the offending field */}
      {editLabel && (
        <LabelFormDialog
          open={!!editLabel}
          onOpenChange={v => { if (!v) setEditLabel(null) }}
          productId={editLabel.productId}
          editingLabel={editLabel.label}
          lookups={lookups}
          restrictField={meta.fk}
          excludeLookupId={item.id}
          onSaved={async () => { setEditLabel(null); await refresh() }}
        />
      )}

      {/* Edit one preset — restricted to the offending field */}
      {editPreset && (
        <LabelPresetDialog
          open={!!editPreset}
          onOpenChange={v => { if (!v) setEditPreset(null) }}
          editing={editPreset}
          lookups={lookups}
          restrictField={meta.fk}
          excludeLookupId={item.id}
          onSaved={async () => { setEditPreset(null); await refresh() }}
        />
      )}
    </>
  )
}
