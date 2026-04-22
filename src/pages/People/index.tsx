import React, { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import type { Customer, Supplier, User, DrugAllergy } from '@/types'
import { Search, Plus, Edit2, Trash2, AlertTriangle, Users, Building2, UserCog } from 'lucide-react'

// ---- Helpers ----
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  )
}

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'เล็กน้อย', moderate: 'ปานกลาง', severe: 'รุนแรง', life_threatening: 'อันตรายถึงชีวิต'
}
const SEVERITY_VARIANTS: Record<string, any> = {
  mild: 'secondary', moderate: 'warning', severe: 'danger', life_threatening: 'destructive'
}

// ========================
// CUSTOMERS TAB
// ========================
function CustomersTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<(Customer & { allergies?: DrugAllergy[] }) | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.people.listCustomers({ q: q.trim() || undefined, page: p }) as any
      setRows(res.rows); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q])

  useEffect(() => { load(1) }, [])

  const openAdd = () => {
    setEditing(null)
    setForm({
      full_name: '', id_card: '', hn: '', dob: '', phone: '', address: '',
      hc_uc: 0, hc_gov: 0, hc_sso: 0,
      food_allergy: '', other_allergy: '', chronic_diseases: '',
      is_alert: 0, alert_note: '', warning_note: '',
    })
    setDialog(true)
  }

  const openEdit = async (c: Customer) => {
    const data = await window.api.people.getCustomer(c.id) as any
    setEditing(data)
    setForm({
      id: data.id,
      full_name: data.full_name ?? '',
      id_card: data.id_card ?? '',
      hn: data.hn ?? '',
      dob: data.dob ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      hc_uc: data.hc_uc ?? 0,
      hc_gov: data.hc_gov ?? 0,
      hc_sso: data.hc_sso ?? 0,
      food_allergy: data.food_allergy ?? '',
      other_allergy: data.other_allergy ?? '',
      chronic_diseases: data.chronic_diseases ?? '',
      is_alert: data.is_alert ?? 0,
      alert_note: data.alert_note ?? '',
      warning_note: data.warning_note ?? '',
    })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.full_name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.people.saveCustomer(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load(page)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.people.deleteCustomer(deleteTarget.id)
      toast({ title: 'ลบลูกค้าสำเร็จ', variant: 'success' })
      setDeleteTarget(null)
      load(page)
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div>
      {/* Toolbar */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
            placeholder="ค้นหาชื่อ, โทร, รหัส, HN..." className="pl-8" />
        </div>
        <Button variant="outline" onClick={() => load(1)}><Search className="w-3.5 h-3.5 mr-1" /> ค้นหา</Button>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> เพิ่มลูกค้า</Button>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {loading ? 'กำลังโหลด...' : `${total.toLocaleString()} รายการ`}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">รหัส</TableHead>
              <TableHead>ชื่อ-นามสกุล</TableHead>
              <TableHead>โทรศัพท์</TableHead>
              <TableHead>HN</TableHead>
              <TableHead className="text-center">สิทธิ์</TableHead>
              <TableHead className="text-center w-20">แจ้งเตือน</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">กำลังโหลด...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">ไม่พบข้อมูล</TableCell></TableRow>
            ) : rows.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.code}</TableCell>
                <TableCell>
                  <div className="font-medium">{c.full_name}</div>
                  {c.chronic_diseases && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{c.chronic_diseases}</div>}
                </TableCell>
                <TableCell className="text-sm">{c.phone ?? '—'}</TableCell>
                <TableCell className="text-sm font-mono">{c.hn ?? '—'}</TableCell>
                <TableCell className="text-center">
                  <div className="flex gap-1 justify-center flex-wrap">
                    {c.hc_uc ? <Badge variant="secondary" className="text-xs">บัตรทอง</Badge> : null}
                    {c.hc_gov ? <Badge variant="secondary" className="text-xs">ข้าราชการ</Badge> : null}
                    {c.hc_sso ? <Badge variant="secondary" className="text-xs">ประกันสังคม</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {c.is_alert ? <AlertTriangle className="w-4 h-4 text-destructive mx-auto" /> : null}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(c)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex justify-center">
          <Pagination page={page} totalPages={totalPages} onPageChange={load} />
        </div>
      )}

      {/* Customer dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข: ${editing.full_name}` : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">ชื่อ-นามสกุล <span className="text-destructive">*</span></label>
                <Input value={form.full_name ?? ''} onChange={e => setF('full_name', e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เลขบัตรประชาชน</label>
                <Input value={form.id_card ?? ''} onChange={e => setF('id_card', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">HN</label>
                <Input value={form.hn ?? ''} onChange={e => setF('hn', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">วันเกิด</label>
                <Input type="date" value={form.dob ?? ''} onChange={e => setF('dob', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">โทรศัพท์</label>
                <Input value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">ที่อยู่</label>
                <Input value={form.address ?? ''} onChange={e => setF('address', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">สิทธิ์การรักษา</label>
              <div className="flex gap-4">
                <Toggle checked={!!form.hc_uc} onChange={v => setF('hc_uc', v ? 1 : 0)} label="บัตรทอง (UC)" />
                <Toggle checked={!!form.hc_gov} onChange={v => setF('hc_gov', v ? 1 : 0)} label="ข้าราชการ" />
                <Toggle checked={!!form.hc_sso} onChange={v => setF('hc_sso', v ? 1 : 0)} label="ประกันสังคม" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">แพ้อาหาร</label>
                <Input value={form.food_allergy ?? ''} onChange={e => setF('food_allergy', e.target.value)} placeholder="ระบุชื่ออาหาร" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">แพ้สิ่งอื่นๆ</label>
                <Input value={form.other_allergy ?? ''} onChange={e => setF('other_allergy', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">โรคประจำตัว</label>
                <Input value={form.chronic_diseases ?? ''} onChange={e => setF('chronic_diseases', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Toggle checked={!!form.is_alert} onChange={v => setF('is_alert', v ? 1 : 0)} label="แสดงการแจ้งเตือนเมื่อใช้งาน" />
              {!!form.is_alert && (
                <div className="space-y-2 pl-4 border-l-2 border-destructive/30">
                  <div>
                    <label className="block text-sm font-medium mb-1">ข้อความแจ้งเตือน</label>
                    <Input value={form.alert_note ?? ''} onChange={e => setF('alert_note', e.target.value)} placeholder="แสดงระหว่างขาย" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">หมายเหตุเพิ่มเติม</label>
                    <Input value={form.warning_note ?? ''} onChange={e => setF('warning_note', e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Drug allergies (readonly) */}
            {editing && (editing as any).allergies?.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">ประวัติแพ้ยา</label>
                <div className="space-y-1.5">
                  {((editing as any).allergies as DrugAllergy[]).map(a => (
                    <div key={a.id} className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2 text-sm">
                      <Badge variant={SEVERITY_VARIANTS[a.severity ?? 'moderate'] ?? 'secondary'} className="text-xs shrink-0">
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
            <Button variant="outline" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="ลบลูกค้า"
        description={`ต้องการลบ "${deleteTarget?.full_name}" ออกจากระบบ?`}
        confirmLabel="ลบ"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ========================
// SUPPLIERS TAB
// ========================
function SuppliersTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Supplier[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const limit = 50
  const totalPages = Math.ceil(total / limit)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.api.people.listSuppliers({ q: q.trim() || undefined, page: p }) as any
      setRows(res.rows); setTotal(res.total); setPage(p)
    } finally { setLoading(false) }
  }, [q])

  useEffect(() => { load(1) }, [])

  const openAdd = () => {
    setForm({ name: '', tax_id: '', phone: '', address: '', contact_name: '' })
    setDialog(true)
  }

  const openEdit = (s: Supplier) => {
    setForm({ id: s.id, name: s.name, tax_id: s.tax_id ?? '', phone: s.phone ?? '', address: s.address ?? '', contact_name: s.contact_name ?? '' })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.people.saveSupplier(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load(page)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.people.deleteSupplier(deleteTarget.id)
      toast({ title: 'ปิดใช้งานผู้จำหน่ายสำเร็จ', variant: 'success' })
      setDeleteTarget(null)
      load(page)
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
            placeholder="ค้นหาชื่อ, รหัส, โทร..." className="pl-8" />
        </div>
        <Button variant="outline" onClick={() => load(1)}><Search className="w-3.5 h-3.5 mr-1" /> ค้นหา</Button>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> เพิ่มผู้จำหน่าย</Button>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {loading ? 'กำลังโหลด...' : `${total.toLocaleString()} รายการ`}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">รหัส</TableHead>
              <TableHead>ชื่อบริษัท</TableHead>
              <TableHead>ผู้ติดต่อ</TableHead>
              <TableHead>โทรศัพท์</TableHead>
              <TableHead>เลขผู้เสียภาษี</TableHead>
              <TableHead className="text-center w-20">สถานะ</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">กำลังโหลด...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">ไม่พบข้อมูล</TableCell></TableRow>
            ) : rows.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{s.code}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm">{s.contact_name ?? '—'}</TableCell>
                <TableCell className="text-sm">{s.phone ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{s.tax_id ?? '—'}</TableCell>
                <TableCell className="text-center">
                  {s.is_disabled
                    ? <Badge variant="secondary" className="text-xs">ปิดใช้งาน</Badge>
                    : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(s)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex justify-center">
          <Pagination page={page} totalPages={totalPages} onPageChange={load} />
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อบริษัท / ร้านค้า <span className="text-destructive">*</span></label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ผู้ติดต่อ</label>
              <Input value={form.contact_name ?? ''} onChange={e => setF('contact_name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">โทรศัพท์</label>
                <Input value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เลขผู้เสียภาษี</label>
                <Input value={form.tax_id ?? ''} onChange={e => setF('tax_id', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ที่อยู่</label>
              <textarea value={form.address ?? ''} onChange={e => setF('address', e.target.value)} rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="ปิดใช้งานผู้จำหน่าย"
        description={`ต้องการปิดใช้งาน "${deleteTarget?.name}"?`}
        confirmLabel="ปิดใช้งาน"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ========================
// STAFF TAB
// ========================
function StaffTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await window.api.people.listStaff() as User[]
      setRows(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setForm({ name: '', email: '', password: '', role: 'staff' })
    setDialog(true)
  }

  const openEdit = (u: User) => {
    setForm({ id: u.id, name: u.name, email: u.email, password: '', role: u.role ?? 'staff' })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) { toast({ title: 'กรุณาระบุชื่อ', variant: 'error' }); return }
    if (!form.id && !form.password?.trim()) { toast({ title: 'กรุณาระบุรหัสผ่าน', variant: 'error' }); return }
    setSaving(true)
    try {
      const payload: any = { name: form.name, email: form.email, role: form.role }
      if (form.id) payload.id = form.id
      if (form.password?.trim()) payload.password = form.password
      await window.api.people.saveStaff(payload)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false)
      load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.people.deleteStaff(deleteTarget.id)
      toast({ title: 'ปิดใช้งานพนักงานสำเร็จ', variant: 'success' })
      setDeleteTarget(null)
      load()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const ROLES: Record<string, string> = { admin: 'ผู้ดูแลระบบ', pharmacist: 'เภสัชกร', staff: 'พนักงาน' }

  return (
    <div>
      <div className="flex gap-2 mb-3 justify-end">
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> เพิ่มพนักงาน</Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>อีเมล</TableHead>
              <TableHead className="text-center">ตำแหน่ง</TableHead>
              <TableHead className="text-center">สถานะ</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">กำลังโหลด...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">ไม่พบข้อมูล</TableCell></TableRow>
            ) : rows.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className="text-xs">{ROLES[u.role] ?? u.role}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  {u.is_disabled
                    ? <Badge variant="secondary" className="text-xs">ปิดใช้งาน</Badge>
                    : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(u)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{form.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อ <span className="text-destructive">*</span></label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">อีเมล</label>
              <Input type="email" value={form.email ?? ''} onChange={e => setF('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                รหัสผ่าน{form.id ? ' (เว้นว่างถ้าไม่เปลี่ยน)' : <span className="text-destructive"> *</span>}
              </label>
              <Input type="password" value={form.password ?? ''} onChange={e => setF('password', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ตำแหน่ง</label>
              <div className="relative">
                <select value={form.role ?? 'staff'} onChange={e => setF('role', e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="admin">ผู้ดูแลระบบ</option>
                  <option value="pharmacist">เภสัชกร</option>
                  <option value="staff">พนักงาน</option>
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">▾</span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="ปิดใช้งานพนักงาน"
        description={`ต้องการปิดใช้งานบัญชี "${deleteTarget?.name}"?`}
        confirmLabel="ปิดใช้งาน"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ========================
// MAIN PAGE
// ========================
export default function PeoplePage() {
  const [tab, setTab] = useState('customers')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">บุคคล</h1>
        <p className="text-sm text-muted-foreground">จัดการลูกค้า ผู้จัดจำหน่าย และพนักงาน</p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 pt-4 shrink-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="customers">
                <Users className="w-3.5 h-3.5 mr-1.5" /> ลูกค้า
              </TabsTrigger>
              <TabsTrigger value="suppliers">
                <Building2 className="w-3.5 h-3.5 mr-1.5" /> ผู้จัดจำหน่าย
              </TabsTrigger>
              <TabsTrigger value="staff">
                <UserCog className="w-3.5 h-3.5 mr-1.5" /> พนักงาน
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {tab === 'customers' && <CustomersTab />}
          {tab === 'suppliers' && <SuppliersTab />}
          {tab === 'staff' && <StaffTab />}
        </div>
      </div>
    </div>
  )
}
