import React, { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import type { ProductCategory, ItemUnit, DrugType, Setting } from '@/types'
import { Save, Plus, Edit2, ToggleLeft, ToggleRight, Store, Tag, Ruler, Pill, Printer } from 'lucide-react'

// ---- Shared helpers ----
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start">
      <label className="text-sm font-medium pt-2 text-right text-muted-foreground">{label}</label>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1 mb-3">{children}</h3>
}

function NumInput({ value, onChange, label, unit, min, step, className = '' }: {
  value: number | string; onChange: (v: string) => void; label?: string; unit?: string; min?: number; step?: number; className?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm text-muted-foreground whitespace-nowrap">{label}</span>}
      <Input type="number" value={value} onChange={e => onChange(e.target.value)} className="w-20" min={min ?? 0} step={step ?? 1} />
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  )
}

// ========================
// TAB: SHOP INFO
// ========================
function ShopTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<Partial<Setting>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.getShop().then(data => setForm((data as Setting) ?? {}))
  }, [])

  const setF = (k: keyof Setting, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveShop(form)
      toast({ title: 'บันทึกข้อมูลร้านสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <div className="max-w-xl space-y-4">
      <SectionTitle>ข้อมูลร้านค้า / ร้านยา</SectionTitle>
      <div className="space-y-3">
        <FieldGroup label="ชื่อร้าน">
          <Input value={form.shop_name ?? ''} onChange={e => setF('shop_name', e.target.value)} placeholder="ร้านยา..." />
        </FieldGroup>
        <FieldGroup label="ที่อยู่">
          <textarea
            value={form.shop_address ?? ''}
            onChange={e => setF('shop_address' as any, e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </FieldGroup>
        <FieldGroup label="โทรศัพท์">
          <Input value={form.shop_phone ?? ''} onChange={e => setF('shop_phone', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="เลขใบอนุญาต">
          <Input value={form.shop_license_no ?? ''} onChange={e => setF('shop_license_no', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="เลขผู้เสียภาษี">
          <Input value={form.shop_tax_id ?? ''} onChange={e => setF('shop_tax_id', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="LINE ID">
          <Input value={form.shop_line_id ?? ''} onChange={e => setF('shop_line_id', e.target.value)} />
        </FieldGroup>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1.5" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>
    </div>
  )
}

// ========================
// TAB: CATEGORIES
// ========================
function CategoriesTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ProductCategory[]>([])
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
    setForm({ id: c.id, code: c.code ?? '', name: c.name, description: c.description ?? '', sort_order: c.sort_order })
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

  const handleToggle = async (id: number) => {
    try {
      await window.api.settings.toggleCategory(id)
      load()
    } catch (e: any) {
      toast({ title: 'ดำเนินการไม่สำเร็จ', variant: 'error' })
    }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted-foreground">หมวดหมู่สินค้าและยา</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มหมวดหมู่</Button>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">รหัส</TableHead>
              <TableHead>ชื่อหมวดหมู่</TableHead>
              <TableHead>คำอธิบาย</TableHead>
              <TableHead className="text-center w-20">ลำดับ</TableHead>
              <TableHead className="text-center w-24">สถานะ</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">ยังไม่มีข้อมูล</TableCell></TableRow>
            ) : rows.map(c => (
              <TableRow key={c.id} className={c.is_disabled ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.code ?? '—'}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.description ?? '—'}</TableCell>
                <TableCell className="text-center text-sm">{c.sort_order}</TableCell>
                <TableCell className="text-center">
                  {c.is_disabled
                    ? <Badge variant="secondary" className="text-xs">ปิด</Badge>
                    : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleToggle(c.id)} title={c.is_disabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}>
                      {c.is_disabled ? <ToggleLeft className="w-4 h-4 text-muted-foreground" /> : <ToggleRight className="w-4 h-4 text-primary" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{form.id ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">รหัส</label>
              <Input value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="เช่น MED, SUP" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อหมวดหมู่ <span className="text-destructive">*</span></label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">คำอธิบาย</label>
              <Input value={form.description ?? ''} onChange={e => setF('description', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ลำดับการแสดง</label>
              <Input type="number" value={form.sort_order ?? 0} onChange={e => setF('sort_order', Number(e.target.value))} className="w-24" min={0} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========================
// TAB: UNITS
// ========================
function UnitsTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ItemUnit[]>([])
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const data = await window.api.settings.listUnits() as ItemUnit[]
    setRows(data)
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setForm({ name: '', multiply: 1 }); setDialog(true) }
  const openEdit = (u: ItemUnit) => { setForm({ id: u.id, name: u.name, multiply: u.multiply }); setDialog(true) }

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

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted-foreground">หน่วยนับสินค้า (เม็ด, ซอง, ขวด ...)</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มหน่วย</Button>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อหน่วย</TableHead>
              <TableHead className="text-right w-32">ตัวคูณ</TableHead>
              <TableHead className="text-right w-32">ใช้งานใน</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">ยังไม่มีข้อมูล</TableCell></TableRow>
            ) : rows.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-right text-sm">{u.multiply}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{(u.usage_count ?? 0).toLocaleString()} สินค้า</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(u)}><Edit2 className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{form.id ? 'แก้ไขหน่วย' : 'เพิ่มหน่วย'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อหน่วย <span className="text-destructive">*</span></label>
              <Input value={form.name ?? ''} onChange={e => setF('name', e.target.value)} placeholder="เช่น เม็ด, ซอง, ขวด" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ตัวคูณ (กรณีเป็นหน่วยใหญ่)</label>
              <Input type="number" value={form.multiply ?? 1} onChange={e => setF('multiply', Number(e.target.value))} className="w-28" min={1} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========================
// TAB: DRUG TYPES
// ========================
function DrugTypesTab() {
  const { toast } = useToast()
  const [rows, setRows] = useState<DrugType[]>([])
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const data = await window.api.settings.listDrugTypes() as DrugType[]
    setRows(data)
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setForm({ code: '', name_th: '', is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0 }); setDialog(true) }
  const openEdit = (d: DrugType) => {
    setForm({ id: d.id, code: d.code, name_th: d.name_th, is_fda9: (d as any).is_fda9 ?? 0, is_fda10: (d as any).is_fda10 ?? 0, is_fda11: (d as any).is_fda11 ?? 0, is_fda13: (d as any).is_fda13 ?? 0 })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name_th?.trim()) { toast({ title: 'กรุณาระบุรหัสและชื่อ', variant: 'error' }); return }
    setSaving(true)
    try {
      await window.api.settings.saveDrugType(form)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      setDialog(false); load()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const handleToggle = async (id: number) => {
    try { await window.api.settings.toggleDrugType(id); load() }
    catch { toast({ title: 'ดำเนินการไม่สำเร็จ', variant: 'error' }) }
  }

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted-foreground">ประเภทยาตามกฎหมาย</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มประเภทยา</Button>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">รหัส</TableHead>
              <TableHead>ชื่อประเภทยา</TableHead>
              <TableHead className="text-center">อย.9</TableHead>
              <TableHead className="text-center">อย.10</TableHead>
              <TableHead className="text-center">อย.11</TableHead>
              <TableHead className="text-center">อย.13</TableHead>
              <TableHead className="text-center w-24">สถานะ</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">ยังไม่มีข้อมูล</TableCell></TableRow>
            ) : rows.map(d => (
              <TableRow key={d.id} className={d.is_disabled ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-sm font-medium">{d.code}</TableCell>
                <TableCell>{d.name_th}</TableCell>
                {(['is_fda9', 'is_fda10', 'is_fda11', 'is_fda13'] as const).map(f => (
                  <TableCell key={f} className="text-center text-sm">
                    {(d as any)[f] ? '✓' : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
                <TableCell className="text-center">
                  {d.is_disabled
                    ? <Badge variant="secondary" className="text-xs">ปิด</Badge>
                    : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(d)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleToggle(d.id)}>
                      {d.is_disabled ? <ToggleLeft className="w-4 h-4 text-muted-foreground" /> : <ToggleRight className="w-4 h-4 text-primary" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{form.id ? 'แก้ไขประเภทยา' : 'เพิ่มประเภทยา'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">รหัส <span className="text-destructive">*</span></label>
              <Input value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="เช่น GENERAL, OTC" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ชื่อประเภทยา <span className="text-destructive">*</span></label>
              <Input value={form.name_th ?? ''} onChange={e => setF('name_th', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">รายงาน อย.</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'is_fda9', label: 'รายงาน อย. 9' },
                  { key: 'is_fda10', label: 'รายงาน อย. 10' },
                  { key: 'is_fda11', label: 'รายงาน อย. 11' },
                  { key: 'is_fda13', label: 'รายงาน อย. 13' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={!!form[key]} onChange={e => setF(key, e.target.checked ? 1 : 0)} className="w-4 h-4 rounded" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========================
// TAB: LABEL SETTINGS
// ========================
function LabelSettingsTab() {
  const { toast } = useToast()
  const [form, setForm] = useState<any>({
    paper_width: 100, paper_height: 75,
    padding_top: 3, padding_right: 3, padding_bottom: 3, padding_left: 3,
    font_family: 'Tahoma',
    font_size_shop: 13, font_size_product: 14, font_size_dosage: 16, font_size_small: 10,
    bold_shop: 1, bold_product: 1, bold_dosage: 1,
    line_spacing: 1.4, section_gap: 4,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.getLabelSettings().then(data => {
      if (data) setForm((f: any) => ({ ...f, ...(data as any) }))
    })
  }, [])

  const setF = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveLabelSettings(form)
      toast({ title: 'บันทึกการตั้งค่าฉลากสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }

  const FONTS = ['Tahoma', 'Arial', 'Sarabun', 'Noto Sans Thai', 'Angsana New', 'Cordia New']

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-3">
        <SectionTitle>ขนาดกระดาษ</SectionTitle>
        <FieldGroup label="กว้าง × สูง">
          <div className="flex items-center gap-2">
            <Input type="number" value={form.paper_width} onChange={e => setF('paper_width', Number(e.target.value))} className="w-20" min={50} />
            <span className="text-sm text-muted-foreground">×</span>
            <Input type="number" value={form.paper_height} onChange={e => setF('paper_height', Number(e.target.value))} className="w-20" min={30} />
            <span className="text-sm text-muted-foreground">มม.</span>
          </div>
        </FieldGroup>
        <FieldGroup label="ระยะขอบ (บน/ขวา/ล่าง/ซ้าย)">
          <div className="flex items-center gap-1">
            {['padding_top', 'padding_right', 'padding_bottom', 'padding_left'].map(k => (
              <Input key={k} type="number" value={form[k]} onChange={e => setF(k, Number(e.target.value))} className="w-16" min={0} />
            ))}
            <span className="text-sm text-muted-foreground ml-1">มม.</span>
          </div>
        </FieldGroup>
      </div>

      <div className="space-y-3">
        <SectionTitle>ฟอนต์</SectionTitle>
        <FieldGroup label="ชนิดฟอนต์">
          <div className="relative">
            <select
              value={form.font_family}
              onChange={e => setF('font_family', e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground text-xs">▾</span>
          </div>
        </FieldGroup>
        <FieldGroup label="ขนาดฟอนต์">
          <div className="space-y-1.5">
            {[
              { key: 'font_size_shop', label: 'ชื่อร้าน', boldKey: 'bold_shop' },
              { key: 'font_size_product', label: 'ชื่อสินค้า', boldKey: 'bold_product' },
              { key: 'font_size_dosage', label: 'วิธีใช้', boldKey: 'bold_dosage' },
              { key: 'font_size_small', label: 'ข้อความเล็ก', boldKey: null },
            ].map(({ key, label, boldKey }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-24 text-right">{label}</span>
                <Input type="number" value={form[key]} onChange={e => setF(key, Number(e.target.value))} className="w-16" min={6} max={30} />
                <span className="text-sm text-muted-foreground">pt</span>
                {boldKey && (
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="checkbox" checked={!!form[boldKey]} onChange={e => setF(boldKey, e.target.checked ? 1 : 0)} className="w-4 h-4 rounded" />
                    ตัวหนา
                  </label>
                )}
              </div>
            ))}
          </div>
        </FieldGroup>
      </div>

      <div className="space-y-3">
        <SectionTitle>ระยะห่าง</SectionTitle>
        <FieldGroup label="ระยะห่างบรรทัด">
          <div className="flex items-center gap-2">
            <Input type="number" value={form.line_spacing} onChange={e => setF('line_spacing', parseFloat(e.target.value))} className="w-20" min={1} max={3} step={0.1} />
            <span className="text-sm text-muted-foreground">เท่า</span>
          </div>
        </FieldGroup>
        <FieldGroup label="ระยะห่างส่วน">
          <div className="flex items-center gap-2">
            <Input type="number" value={form.section_gap} onChange={e => setF('section_gap', Number(e.target.value))} className="w-20" min={0} max={20} />
            <span className="text-sm text-muted-foreground">pt</span>
          </div>
        </FieldGroup>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <SectionTitle>ตัวอย่างฉลาก</SectionTitle>
        <div
          className="border-2 border-dashed border-border rounded-lg bg-white text-black overflow-hidden"
          style={{
            width: `${Math.min(form.paper_width * 2.5, 400)}px`,
            minHeight: `${form.paper_height * 1.5}px`,
            padding: `${form.padding_top * 1.5}px ${form.padding_right * 1.5}px ${form.padding_bottom * 1.5}px ${form.padding_left * 1.5}px`,
            fontFamily: form.font_family,
            lineHeight: form.line_spacing,
          }}
        >
          <div style={{ fontSize: form.font_size_shop * 0.9, fontWeight: form.bold_shop ? 'bold' : 'normal' }}>
            ร้านยา ซินโทรปิก เภสัช
          </div>
          <div style={{ fontSize: form.font_size_small * 0.9, marginBottom: form.section_gap }}>
            123/4 ถ.สุขุมวิท กรุงเทพ โทร. 02-xxx-xxxx
          </div>
          <div style={{ fontSize: form.font_size_product * 0.9, fontWeight: form.bold_product ? 'bold' : 'normal' }}>
            Paracetamol 500mg tablets
          </div>
          <div style={{ fontSize: form.font_size_dosage * 0.9, fontWeight: form.bold_dosage ? 'bold' : 'normal', marginTop: form.section_gap / 2 }}>
            รับประทาน 1–2 เม็ด วันละ 3 ครั้ง หลังอาหาร
          </div>
          <div style={{ fontSize: form.font_size_small * 0.9, marginTop: form.section_gap / 2 }}>
            หมดอายุ: 12/2027 · Lot: ABC001
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1.5" />{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </Button>
      </div>
    </div>
  )
}

// ========================
// MAIN PAGE
// ========================
export default function SettingsPage() {
  const [tab, setTab] = useState('shop')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">จัดการข้อมูลร้านและระบบ</p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 pt-4 shrink-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="shop"><Store className="w-3.5 h-3.5 mr-1.5" />ข้อมูลร้าน</TabsTrigger>
              <TabsTrigger value="categories"><Tag className="w-3.5 h-3.5 mr-1.5" />หมวดหมู่</TabsTrigger>
              <TabsTrigger value="units"><Ruler className="w-3.5 h-3.5 mr-1.5" />หน่วยนับ</TabsTrigger>
              <TabsTrigger value="drugtypes"><Pill className="w-3.5 h-3.5 mr-1.5" />ประเภทยา</TabsTrigger>
              <TabsTrigger value="labels"><Printer className="w-3.5 h-3.5 mr-1.5" />การพิมพ์ฉลาก</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-8 pt-4">
          {tab === 'shop' && <ShopTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'units' && <UnitsTab />}
          {tab === 'drugtypes' && <DrugTypesTab />}
          {tab === 'labels' && <LabelSettingsTab />}
        </div>
      </div>
    </div>
  )
}
