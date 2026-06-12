import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, SearchInput } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FormField } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import type { ItemUnit } from '@/types'
import { Plus, Edit, Trash2, Ruler } from 'lucide-react'

export function UnitsTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ItemUnit[]>([])
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<ItemUnit | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    const data = await window.api.settings.listUnits() as ItemUnit[]
    setRows(data)
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setForm({ name: '' }); setDialog(true) }
  const openEdit = (u: ItemUnit) => { setForm({ id: u.id, name: u.name }); setDialog(true) }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อหน่วย', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.settings.saveUnit(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!delTarget) return
    setDeleting(true)
    try {
      await window.api.settings.deleteUnit(delTarget.id)
      toast({ title: 'ลบหน่วยสำเร็จ', variant: 'success' })
      setDelTarget(null); load()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setDeleting(false) }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // Client-side filter — unit list is small, no IPC round-trip needed.
  const filtered = q.trim()
    ? rows.filter(u => u.name.toLowerCase().includes(q.trim().toLowerCase()))
    : rows

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
          <SearchInput
            variant="elevated"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาชื่อหน่วย..."
          />
          <Button size="lg" className="h-9 px-2 shrink-0 ml-auto" onClick={openAdd}>
            <Plus className="size-4" /> เพิ่มหน่วย
          </Button>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead className="min-w-[240px]">ชื่อหน่วย</TableHead>
                <TableHead className="text-right min-w-40">จำนวนสินค้า</TableHead>
                <TableHead className="text-center min-w-24">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-16">
                    <Ruler className="size-10 mx-auto mb-2 opacity-30" />
                    {q.trim() ? 'ไม่พบข้อมูล' : 'ยังไม่มีหน่วยนับ'}
                  </TableCell>
                </TableRow>
              ) : filtered.map((u, i) => (
                <TableRow key={u.id}>
                  <TableCell className="text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-semibold text-sm text-foreground">{u.name}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={(u.usage_count ?? 0) > 0 ? 'teal-outline' : 'muted-outline'}>
                      {(u.usage_count ?? 0).toLocaleString()} รายการ
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1.5">
                      <Button size="icon-lg" variant="elevated" onClick={() => openEdit(u)} title="แก้ไข">
                        <Edit />
                      </Button>
                      <Button
                        size="icon-lg"
                        variant="elevated-destructive-soft"
                        disabled={(u.usage_count ?? 0) > 0}
                        onClick={() => setDelTarget(u)}
                        title={(u.usage_count ?? 0) > 0 ? 'ลบไม่ได้ เพราะมีสินค้าใช้หน่วยนี้อยู่' : 'ลบ'}
                      >
                        <Trash2 />
                      </Button>
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

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm" divided>
          <DialogHeader><DialogTitle className="text-xl">{form.id ? 'แก้ไขหน่วย' : 'เพิ่มหน่วย'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <FormField label="ชื่อหน่วย" required>
              <Input variant="elevated" value={form.name ?? ''} onChange={e => setF('name', e.target.value)} placeholder="เช่น เม็ด, ซอง, ขวด" autoFocus />
            </FormField>
            <p className="text-sm text-muted-foreground">
              หน่วยนี้เป็นเพียง “ชื่อหน่วย” กลางที่ใช้ร่วมทุกสินค้า — การแปลงจำนวน (เช่น 1 กล่อง = กี่เม็ด)
              ตั้งรายสินค้าที่ช่อง “ขนาดบรรจุ” ในหน้าแก้ไขสินค้า → แท็บหน่วยนับ
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => { if (!o) setDelTarget(null) }}
        variant="destructive"
        title="ลบหน่วยนับ"
        description={<>
          <div>ต้องการลบหน่วย “{delTarget?.name}” ?</div>
          <div>การลบนี้ไม่สามารถย้อนกลับได้</div>
        </>}
        confirmLabel="ยืนยัน"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
