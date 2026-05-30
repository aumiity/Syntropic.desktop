import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { SortableTableBody, SortableRow } from '@/components/ui/sortable'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import type { ProductCategory } from '@/types'
import { Plus, Edit, Tag, ArrowUpDown, Check, X } from 'lucide-react'

export function CategoriesTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ProductCategory[]>([])
  const [q, setQ] = useState('')
  const [reorderMode, setReorderMode] = useState(false)
  // Order before entering reorder mode — restored if the user cancels.
  const [snapshot, setSnapshot] = useState<ProductCategory[]>([])
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const data = await window.api.settings.listCategories() as ProductCategory[]
    setRows(data)
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setForm({ code: '', name: '', description: '', sort_order: rows.length }); setDialog(true) }
  const openEdit = (c: ProductCategory) => {
    setForm({
      id: c.id, code: c.code ?? '', name: c.name, description: c.description ?? '',
      sort_order: c.sort_order, is_disabled: c.is_disabled ?? 0,
    })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อหมวดหมู่', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.settings.saveCategory(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  // Drags only mutate local `rows`. Nothing is persisted until the user
  // explicitly confirms — so "ยกเลิก" can cleanly restore the snapshot.
  const enterReorder = () => {
    setSnapshot(rows)
    setReorderMode(true)
  }

  const cancelReorder = () => {
    setRows(snapshot)
    setReorderMode(false)
    toast({ title: 'ยกเลิกการจัดลำดับ — คืนลำดับเดิม' })
  }

  const saveReorder = async () => {
    try {
      // Renumbered 1..n server-side in one transaction.
      await window.api.settings.reorderCategories(rows.map(r => r.id))
      setReorderMode(false)
      await load()
      toast({ title: 'บันทึกลำดับแล้ว', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'จัดลำดับไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // Client-side filter — categories list is small, no IPC needed.
  // Filtering during reorder would scramble the visible order, so search is
  // hidden while reordering (see top bar below).
  const filtered = q.trim()
    ? rows.filter(c => {
        const needle = q.trim().toLowerCase()
        return c.name.toLowerCase().includes(needle)
          || (c.code ?? '').toLowerCase().includes(needle)
          || (c.description ?? '').toLowerCase().includes(needle)
      })
    : rows

  return (
    <div className="pt-4 h-full flex flex-col min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          {reorderMode ? (
            <>
              <div className="flex-1 min-w-0 pl-2 text-sm text-muted-foreground">
                กำลังจัดลำดับ — ลากแถวเพื่อเรียงใหม่
              </div>
              <Button size="lg" className="h-10 px-2 shrink-0" variant="elevated" onClick={cancelReorder}>
                <X className="size-4" /> ยกเลิก
              </Button>
              <Button size="lg" className="h-10 px-2 shrink-0" variant="success" onClick={saveReorder}>
                <Check className="size-4" /> เสร็จสิ้น
              </Button>
            </>
          ) : (
            <>
              <SearchInput
                variant="elevated"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="ค้นหารหัส, ชื่อหมวดหมู่, คำอธิบาย..."
              />
              <Button size="lg" className="h-10 px-2 shrink-0 ml-auto" variant="elevated" onClick={enterReorder} disabled={rows.length < 2}>
                <ArrowUpDown className="size-4" /> จัดลำดับ
              </Button>
              <Button size="lg" className="h-10 px-2 shrink-0" onClick={openAdd}>
                <Plus className="size-4" /> เพิ่มหมวดหมู่
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                {reorderMode
                  ? <TableHead className="text-center min-w-16">ลาก</TableHead>
                  : <TableHead className="text-center min-w-20">ลำดับ</TableHead>}
                <TableHead className="min-w-28">รหัส</TableHead>
                <TableHead className="min-w-[200px]">ชื่อหมวดหมู่</TableHead>
                <TableHead className="min-w-[220px]">คำอธิบาย</TableHead>
                <TableHead className="text-center min-w-24">สถานะ</TableHead>
                {!reorderMode && <TableHead className="text-center min-w-24">จัดการ</TableHead>}
              </TableRow>
            </TableHeader>

            {reorderMode ? (
              <SortableTableBody values={rows} onReorder={setRows}>
                {rows.map(c => (
                  <SortableRow key={c.id} value={c}>
                    <TableCell className="text-sm text-muted-foreground">{c.code ?? '—'}</TableCell>
                    <TableCell className="font-semibold text-sm text-foreground">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {c.is_disabled
                        ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                        : <Badge variant="success-outline">ใช้งาน</Badge>}
                    </TableCell>
                  </SortableRow>
                ))}
              </SortableTableBody>
            ) : (
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                      <Tag className="size-10 mx-auto mb-2 opacity-30" />
                      {q.trim() ? 'ไม่พบข้อมูล' : 'ยังไม่มีหมวดหมู่'}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.code ?? '—'}</TableCell>
                    <TableCell className="font-semibold text-sm text-foreground">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {c.is_disabled
                        ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                        : <Badge variant="success-outline">ใช้งาน</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Button size="icon-lg" variant="elevated" onClick={() => openEdit(c)} title="แก้ไข">
                          <Edit />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>

        <div className="px-4 h-12 bg-card border-t border-border flex items-center justify-end text-sm shrink-0">
          <span className="text-muted-foreground">
            แสดง <span className="font-semibold text-foreground">{(reorderMode ? rows : filtered).length.toLocaleString()}</span> รายการ
          </span>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm" divided>
          <DialogHeader><DialogTitle className="text-xl">{form.id ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <FormField label="รหัส">
              <Input variant="elevated" value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="เช่น MED, SUP" />
            </FormField>
            <FormField label="ชื่อหมวดหมู่" required>
              <Input variant="elevated" value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </FormField>
            <FormField label="คำอธิบาย">
              <Input variant="elevated" value={form.description ?? ''} onChange={e => setF('description', e.target.value)} />
            </FormField>
            {form.id ? (
              <Toggle
                framed
                size="lg"
                variant="destructive"
                label="พักการใช้งานหมวดหมู่นี้"
                checked={!!form.is_disabled}
                onChange={v => setF('is_disabled', v ? 1 : 0)}
                className="justify-between w-full"
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
