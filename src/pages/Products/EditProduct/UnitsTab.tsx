import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { Switch, Toggle } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { TintIcon } from '@/components/ui/tint-icon'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Edit, Blocks, EyeOff, Eye } from 'lucide-react'
import type { ProductUnit, ItemUnit } from '@/types'
import type { FullProduct } from './shared'

const Field = FormField

interface Props {
  product: FullProduct
  productId: number
  itemUnits: ItemUnit[]
  baseUnit: string
  defaultPriceRetail: any
  onRefresh: () => Promise<void> | void
}

export function UnitsTab({
  product, productId, itemUnits, baseUnit, defaultPriceRetail, onRefresh,
}: Props) {
  const { toast } = useToast()

  const [unitDialog, setUnitDialog] = useState(false)
  const [editingUnit, setEditingUnit] = useState<ProductUnit | null>(null)
  const [unitForm, setUnitForm] = useState<any>({})
  const [unitSaving, setUnitSaving] = useState(false)
  const [deletingUnit, setDeletingUnit] = useState<ProductUnit | null>(null)

  const openAddUnit = () => {
    setEditingUnit(null)
    setUnitForm({
      unit_id: itemUnits[0]?.id ?? 0,
      barcode: '',
      qty_per_base: 1,
      price_retail: defaultPriceRetail ?? 0,
      price_wholesale1: 0,
      price_wholesale2: 0,
      is_for_sale: 1,
      is_for_purchase: 0,
      is_disabled: 0,
    })
    setUnitDialog(true)
  }

  const openEditUnit = (u: ProductUnit) => {
    setEditingUnit(u)
    setUnitForm({
      unit_id: u.unit_id ?? 0,
      barcode: u.barcode ?? '',
      qty_per_base: u.qty_per_base,
      price_retail: u.price_retail,
      price_wholesale1: u.price_wholesale1,
      price_wholesale2: u.price_wholesale2,
      is_for_sale: u.is_for_sale,
      is_for_purchase: u.is_for_purchase,
      is_disabled: u.is_disabled,
    })
    setUnitDialog(true)
  }

  const handleSaveUnit = async () => {
    setUnitSaving(true)
    try {
      if (editingUnit) {
        await window.api.products.updateUnit(editingUnit.id, {
          unit_id: Number(unitForm.unit_id),
          barcode: unitForm.barcode || null,
          qty_per_base: parseFloat(unitForm.qty_per_base) || 1,
          price_retail: parseFloat(unitForm.price_retail) || 0,
          price_wholesale1: parseFloat(unitForm.price_wholesale1) || 0,
          price_wholesale2: parseFloat(unitForm.price_wholesale2) || 0,
          is_for_sale: unitForm.is_for_sale ? 1 : 0,
          is_for_purchase: unitForm.is_for_purchase ? 1 : 0,
          is_disabled: unitForm.is_disabled ? 1 : 0,
        })
      } else {
        await window.api.products.addUnit({
          product_id: productId,
          unit_id: Number(unitForm.unit_id),
          barcode: unitForm.barcode || null,
          qty_per_base: parseFloat(unitForm.qty_per_base) || 1,
          price_retail: parseFloat(unitForm.price_retail) || 0,
          price_wholesale1: parseFloat(unitForm.price_wholesale1) || 0,
          price_wholesale2: parseFloat(unitForm.price_wholesale2) || 0,
          is_for_sale: unitForm.is_for_sale ? 1 : 0,
          is_for_purchase: unitForm.is_for_purchase ? 1 : 0,
          is_disabled: unitForm.is_disabled ? 1 : 0,
        })
      }
      toast({ title: 'บันทึกหน่วยสำเร็จ', variant: 'success' })
      setUnitDialog(false)
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setUnitSaving(false)
    }
  }

  const handleToggleDisable = async (u: ProductUnit) => {
    const next = u.is_disabled ? 0 : 1
    try {
      await window.api.products.updateUnit(u.id, { is_disabled: next })
      toast({ title: next ? 'ปิดการใช้งานหน่วยแล้ว' : 'เปิดใช้งานหน่วยแล้ว', variant: 'success' })
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'ทำรายการไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  const handleDeleteUnit = async (unitId: number) => {
    setUnitSaving(true)
    try {
      await window.api.products.deleteUnit(unitId)
      toast({ title: 'ลบหน่วยสำเร็จ', variant: 'success' })
      setDeletingUnit(null)
      await onRefresh()
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setUnitSaving(false)
    }
  }

  return (
    <div className="pt-4">
      <div className="bg-card rounded-card shadow-card border border-border overflow-hidden">
        <div className="px-4 h-14 shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <TintIcon icon={Blocks} tint="neutral" size="sm" />
            <h3 className="text-lg font-semibold text-foreground">หน่วยนับ</h3>
            <Badge variant="neutral-outline">{(product.units?.length ?? 0) + 1}</Badge>
          </div>
          <Button variant="elevated" onClick={openAddUnit} className="h-9 px-3 ml-auto shrink-0">
            <Plus className="size-4" /> เพิ่มหน่วย
          </Button>
        </div>
        <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-[16px] border-r-[16px] border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-24">หน่วย</TableHead>
                <TableHead className="min-w-20">ตัวคูณ</TableHead>
                <TableHead className="min-w-24">ราคาปลีก</TableHead>
                <TableHead className="min-w-24">ราคาส่ง 1</TableHead>
                <TableHead className="min-w-24">ราคาส่ง 2</TableHead>
                <TableHead className="min-w-16">ขาย</TableHead>
                <TableHead className="min-w-16">ซื้อ</TableHead>
                <TableHead className="min-w-24">สถานะ</TableHead>
                <TableHead className="min-w-32">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Base unit row — sourced from the products table. Edited via General tab. */}
              <TableRow className="[&_td]:py-2.5 [&_td]:font-medium">
                <TableCell className="text-sm font-semibold">{baseUnit}</TableCell>
                <TableCell className="text-sm">1</TableCell>
                <TableCell className="text-sm font-semibold">{formatCurrency(product.price_retail ?? 0)}</TableCell>
                <TableCell className="text-sm font-semibold text-muted-foreground">{(product.price_wholesale1 ?? 0) > 0 ? formatCurrency(product.price_wholesale1) : '—'}</TableCell>
                <TableCell className="text-sm font-semibold text-muted-foreground">{(product.price_wholesale2 ?? 0) > 0 ? formatCurrency(product.price_wholesale2) : '—'}</TableCell>
                <TableCell><Checkbox checked tabIndex={-1} className="pointer-events-none" /></TableCell>
                <TableCell><Checkbox checked tabIndex={-1} className="pointer-events-none" /></TableCell>
                <TableCell><Badge variant="warning-outline" className="rounded-md">หลัก</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">แก้ที่แท็บข้อมูลทั่วไป</TableCell>
              </TableRow>
              {product.units?.map(u => (
                <TableRow key={u.id} className="[&_td]:py-2.5 [&_td]:font-medium">
                  <TableCell className="text-sm font-semibold">{u.unit_name ?? `Unit #${u.unit_id}`}</TableCell>
                  <TableCell className="text-sm">{u.qty_per_base}</TableCell>
                  <TableCell className="text-sm font-semibold">{formatCurrency(u.price_retail)}</TableCell>
                  <TableCell className="text-sm font-semibold text-muted-foreground">{u.price_wholesale1 > 0 ? formatCurrency(u.price_wholesale1) : '—'}</TableCell>
                  <TableCell className="text-sm font-semibold text-muted-foreground">{u.price_wholesale2 > 0 ? formatCurrency(u.price_wholesale2) : '—'}</TableCell>
                  <TableCell><Checkbox checked={!!u.is_for_sale} tabIndex={-1} className="pointer-events-none" /></TableCell>
                  <TableCell><Checkbox checked={!!u.is_for_purchase} tabIndex={-1} className="pointer-events-none" /></TableCell>
                  <TableCell>
                    {u.is_disabled
                      ? <Badge variant="destructive-outline">ปิดใช้งาน</Badge>
                      : <Badge variant="success-outline">ใช้งาน</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Button size="icon-lg" variant="elevated" onClick={() => openEditUnit(u)} title="แก้ไข">
                        <Edit />
                      </Button>
                      {u.is_disabled ? (
                        <Button size="icon-lg" variant="elevated" onClick={() => handleToggleDisable(u)} title="เปิดใช้งาน">
                          <Eye />
                        </Button>
                      ) : (
                        <Button size="icon-lg" variant="elevated-warning" onClick={() => handleToggleDisable(u)} title="ปิดการใช้งาน">
                          <EyeOff />
                        </Button>
                      )}
                      <Button size="icon-lg" variant="elevated-destructive" onClick={() => setDeletingUnit(u)} title="ลบ">
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="px-5 h-12 bg-card border-t border-border flex items-center justify-between text-sm text-muted-foreground shrink-0">
          <span>ทั้งหมด <span className="font-semibold text-foreground">{(product.units?.length ?? 0) + 1}</span> หน่วย</span>
          <span>หน่วยหลัก: <span className="font-semibold text-foreground">{baseUnit}</span></span>
        </div>
      </div>

      {/* ======================== UNIT DIALOG ======================== */}
      <Dialog open={unitDialog} onOpenChange={setUnitDialog}>
        <DialogContent size="4xl" divided>
          <DialogHeader>
            <DialogTitle>{editingUnit ? 'แก้ไขหน่วยนับ' : 'เพิ่มหน่วยนับ'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {(() => {
              const baseCost = product.cost_price ?? 0
              const qpb = parseFloat(String(unitForm.qty_per_base)) || 1
              const unitCost = baseCost * qpb
              const newUnit = itemUnits.find(u => u.id === Number(unitForm.unit_id))?.name ?? 'หน่วยใหม่'
              const calc = (price: number) => {
                const perPiece = qpb > 0 ? price / qpb : 0
                const profit = price - unitCost
                const pct = unitCost > 0 ? (profit / unitCost) * 100 : 0
                return { perPiece, profit, pct, pos: profit >= 0, dim: price <= 0 || unitCost <= 0 }
              }
              const retail = calc(parseFloat(String(unitForm.price_retail)) || 0)
              const ws1 = calc(parseFloat(String(unitForm.price_wholesale1)) || 0)
              const ws2 = calc(parseFloat(String(unitForm.price_wholesale2)) || 0)
              const unitSuffix = (u: string) => <span className="font-normal normal-case text-muted-foreground"> ({u})</span>
              return (
                <div className="grid grid-cols-2 gap-5 items-start">
                  {/* ── ซ้าย: ข้อมูลหน่วย + ตัวเลือก ── */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="หน่วยนับ" required>
                        <Select value={String(unitForm.unit_id ?? 0)} onValueChange={v => setUnitForm((f: any) => ({ ...f, unit_id: Number(v) }))}>
                          <SelectTrigger variant="elevated" className="h-10 w-full">
                            <SelectValue placeholder="— เลือกหน่วย —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">— เลือกหน่วย —</SelectItem>
                            {itemUnits.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="ขนาดบรรจุ">
                        <Input variant="elevated" type="number" value={unitForm.qty_per_base ?? 1} onChange={e => setUnitForm((f: any) => ({ ...f, qty_per_base: e.target.value }))} className="text-right" min={0.0001} step="0.0001" />
                      </Field>
                    </div>
                    <Field label="บาร์โค้ด">
                      <Input variant="elevated" value={unitForm.barcode ?? ''} onChange={e => setUnitForm((f: any) => ({ ...f, barcode: e.target.value }))} />
                    </Field>

                    {/* ตัวเลือกการใช้งาน */}
                    <Toggle
                      framed
                      size="lg"
                      label="ใช้ขาย — ใช้หน่วยนี้ในการขาย"
                      checked={!!unitForm.is_for_sale}
                      onChange={v => setUnitForm((f: any) => ({ ...f, is_for_sale: v ? 1 : 0 }))}
                      className="justify-between w-full"
                    />
                    <Toggle
                      framed
                      size="lg"
                      label="ใช้ซื้อ — ใช้หน่วยนี้ในการรับเข้าสต็อก"
                      checked={!!unitForm.is_for_purchase}
                      onChange={v => setUnitForm((f: any) => ({ ...f, is_for_purchase: v ? 1 : 0 }))}
                      className="justify-between w-full"
                    />
                  </div>

                  {/* ── ขวา: ราคา + รายละเอียด ── */}
                  <div className="space-y-3">
                    {/* ราคาทุน — รวมหน่วยฐาน + หน่วยใหม่ ในกรอบเดียว */}
                    <div className="rounded-lg bg-warm/50 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">ราคาทุน ({baseUnit})</span>
                        <span className="text-sm font-bold text-warm-foreground">{formatCurrency(baseCost)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">ราคาทุน ({newUnit})</span>
                        <span className="text-sm font-bold text-warm-foreground">{formatCurrency(unitCost)}</span>
                      </div>
                    </div>

                    {/* ราคาปลีก + รายละเอียด */}
                    <Field label={<>ราคาปลีก{unitSuffix(newUnit)}</>}>
                      <PriceInput variant="elevated" value={unitForm.price_retail} onChange={v => setUnitForm((f: any) => ({ ...f, price_retail: v }))} />
                    </Field>
                    <div className="rounded-lg bg-success-soft/50 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">คิดเป็น ({baseUnit})</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(retail.perPiece)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${retail.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไร ({newUnit})</span>
                        {retail.dim ? (
                          <span className="text-sm text-foreground-subtle">—</span>
                        ) : (
                          <span className={`text-sm font-bold ${retail.pos ? 'text-success' : 'text-destructive'}`}>
                            {retail.pos ? '+' : ''}{retail.profit.toFixed(2)} ({retail.pos ? '+' : ''}{retail.pct.toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ราคาส่ง 1 + รายละเอียด */}
                    {([
                      { label: 'ราคาส่ง 1', key: 'price_wholesale1', value: unitForm.price_wholesale1, d: ws1 },
                      { label: 'ราคาส่ง 2', key: 'price_wholesale2', value: unitForm.price_wholesale2, d: ws2 },
                    ] as const).map(({ label, key, value, d }) => (
                      <div key={key} className="space-y-3">
                        <Field label={<>{label}{unitSuffix(newUnit)}</>}>
                          <PriceInput variant="elevated" value={value} onChange={v => setUnitForm((f: any) => ({ ...f, [key]: v }))} />
                        </Field>
                        <div className="rounded-lg bg-success-soft/50 px-3 py-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">คิดเป็น ({baseUnit})</span>
                            <span className="text-sm font-bold text-foreground">{formatCurrency(d.perPiece)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไร ({newUnit})</span>
                            {d.dim ? (
                              <span className="text-sm text-foreground-subtle">—</span>
                            ) : (
                              <span className={`text-sm font-bold ${d.pos ? 'text-success' : 'text-destructive'}`}>
                                {d.pos ? '+' : ''}{d.profit.toFixed(2)} ({d.pos ? '+' : ''}{d.pct.toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </DialogBody>
          <DialogFooter>
            <Button variant="elevated" size="xl" onClick={() => setUnitDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveUnit} disabled={unitSaving}>{unitSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================== DELETE CONFIRM ======================== */}
      <ConfirmDialog
        open={!!deletingUnit}
        onOpenChange={(v) => { if (!v && !unitSaving) setDeletingUnit(null) }}
        variant="destructive"
        title="ลบหน่วยนับ"
        description={deletingUnit && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted px-3 py-2.5 space-y-1.5">
              <div className="text-sm font-semibold text-foreground">{deletingUnit.unit_name ?? `Unit #${deletingUnit.unit_id}`}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">ขนาดบรรจุ</dt>
                <dd>{deletingUnit.qty_per_base}</dd>
                <dt className="text-muted-foreground">ราคาปลีก</dt>
                <dd>{formatCurrency(deletingUnit.price_retail)}</dd>
              </dl>
            </div>
            <p className="text-sm text-muted-foreground">
              ประวัติการขายเก่ายังคงแสดงชื่อหน่วยถูกต้อง — หากต้องการซ่อนชั่วคราว ให้ใช้ <span className="font-medium text-foreground">"ปิดการใช้งานหน่วยนี้"</span> แทน
            </p>
          </div>
        )}
        confirmLabel={unitSaving ? 'กำลังลบ...' : 'ยืนยันลบ'}
        cancelLabel="ยกเลิก"
        onConfirm={() => { if (deletingUnit) handleDeleteUnit(deletingUnit.id) }}
      />
    </div>
  )
}
