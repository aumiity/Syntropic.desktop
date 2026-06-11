import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriceInput } from '@/components/ui/price-input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  // Enable/disable confirm target (null = closed)
  const [confirmToggle, setConfirmToggle] = useState<ProductUnit | null>(null)
  // ราคาส่งซ่อนหลัง disclosure — กางอัตโนมัติเมื่อหน่วยมีราคาส่งอยู่แล้ว
  const [showWholesale, setShowWholesale] = useState(false)

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
    setShowWholesale(false)
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
    setShowWholesale(((u.price_wholesale1 ?? 0) > 0) || ((u.price_wholesale2 ?? 0) > 0))
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
        <div className="px-4 h-12 shrink-0 flex items-center gap-3">
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
                        <Button size="icon-lg" variant="elevated" onClick={() => setConfirmToggle(u)} title="เปิดใช้งาน">
                          <Eye />
                        </Button>
                      ) : (
                        <Button size="icon-lg" variant="elevated" onClick={() => setConfirmToggle(u)} title="ปิดการใช้งาน">
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
              const profitBox = (d: ReturnType<typeof calc>) => {
                const labelCls = `text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`
                const valCls = `text-sm font-bold ${d.pos ? 'text-success' : 'text-destructive'}`
                const dash = <span className="text-sm text-foreground-subtle">—</span>
                return (
                  <div className="rounded-lg bg-success-soft/50 border border-success/30 grid grid-cols-2 divide-x divide-success/30">
                    <div className="space-y-0.5 min-w-0 px-3 py-2">
                      <div className={labelCls}>คิดเป็น ({baseUnit})</div>
                      <div className="text-sm font-bold text-foreground">{formatCurrency(d.perPiece)}</div>
                    </div>
                    <div className="space-y-0.5 min-w-0 px-3 py-2">
                      <div className={labelCls}>กำไร ({newUnit})</div>
                      {d.dim ? dash : <div className={valCls}>{d.pos ? '+' : ''}{d.profit.toFixed(2)} ({d.pos ? '+' : ''}{d.pct.toFixed(0)}%)</div>}
                    </div>
                  </div>
                )
              }
              const wholesaleBlock = (label: string, key: string, value: any, d: ReturnType<typeof calc>) => (
                <div className="space-y-3">
                  <Field label={label}>
                    <PriceInput variant="elevated" className="text-left" value={value} onChange={v => setUnitForm((f: any) => ({ ...f, [key]: v }))} />
                  </Field>
                  {profitBox(d)}
                </div>
              )
              return (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-5 items-start">
                  {/* ── ซ้าย: หน่วย + ราคา + รายละเอียด ── */}
                  <div className="space-y-3">
                    {/* หน่วยนับ + ขนาดบรรจุ — เลือกก่อน เพราะเป็นตัวตั้งของราคาทุน/ราคา */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="หน่วยนับ" required>
                        <Select value={String(unitForm.unit_id ?? 0)} onValueChange={v => setUnitForm((f: any) => ({ ...f, unit_id: Number(v) }))}>
                          <SelectTrigger variant="elevated" className="w-full">
                            <SelectValue placeholder="— เลือกหน่วย —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">— เลือกหน่วย —</SelectItem>
                            {itemUnits.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="ขนาดบรรจุ">
                        <Input variant="elevated" type="number" value={unitForm.qty_per_base ?? 1} onChange={e => setUnitForm((f: any) => ({ ...f, qty_per_base: e.target.value }))} className="text-left" min={0.0001} step="0.0001" />
                      </Field>
                    </div>

                    {/* ราคาทุน — รวมหน่วยฐาน + หน่วยใหม่ ในกรอบเดียว */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">ราคาทุน</h4>
                      <div className="rounded-lg bg-accent-soft/50 border border-accent-soft-foreground/25 px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">ต่อ {baseUnit}</span>
                          <span className="text-sm font-bold text-accent-soft-foreground">{formatCurrency(baseCost)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">ต่อ {newUnit}</span>
                          <span className="text-sm font-bold text-accent-soft-foreground">{formatCurrency(unitCost)}</span>
                        </div>
                      </div>
                    </div>

                    {/* ราคาปลีก + รายละเอียด */}
                    <Field label="ราคาปลีก">
                      <PriceInput variant="elevated" className="text-left" value={unitForm.price_retail} onChange={v => setUnitForm((f: any) => ({ ...f, price_retail: v }))} />
                    </Field>
                    {profitBox(retail)}

                  </div>

                  {/* ── ขวา: ข้อมูลหน่วย + ตัวเลือก ── */}
                  <div className="space-y-3">
                    <Field label="บาร์โค้ด">
                      <Input variant="elevated" value={unitForm.barcode ?? ''} onChange={e => setUnitForm((f: any) => ({ ...f, barcode: e.target.value }))} />
                    </Field>

                    {/* การตั้งค่า — รวมตัวเลือกการใช้งานไว้ในกรอบเดียว */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">การตั้งค่า</h4>
                      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                          <div>
                            <div className="text-sm font-semibold text-foreground">ใช้หน่วยนี้ในการขาย</div>
                            <div className="text-xs text-muted-foreground">ให้เลือกหน่วยนี้ได้ที่หน้าขาย (POS)</div>
                          </div>
                          <Switch size="lg" checked={!!unitForm.is_for_sale} onCheckedChange={v => setUnitForm((f: any) => ({ ...f, is_for_sale: v ? 1 : 0 }))} />
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                          <div>
                            <div className="text-sm font-semibold text-foreground">ใช้หน่วยนี้ในการซื้อ</div>
                            <div className="text-xs text-muted-foreground">ให้เลือกหน่วยนี้ได้ตอนรับเข้า/สั่งซื้อ</div>
                          </div>
                          <Switch size="lg" checked={!!unitForm.is_for_purchase} onCheckedChange={v => setUnitForm((f: any) => ({ ...f, is_for_purchase: v ? 1 : 0 }))} />
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                          <div>
                            <div className="text-sm font-semibold text-foreground">ตั้งราคาส่ง</div>
                            <div className="text-xs text-muted-foreground">กำหนดราคาส่ง 1 / 2 ของหน่วยนี้</div>
                          </div>
                          <Switch size="lg" checked={showWholesale} onCheckedChange={setShowWholesale} />
                        </div>
                      </div>
                    </div>

                  </div>
                  </div>

                  {/* ── ราคาส่ง — โชว์เมื่อเปิดสวิตช์ "ตั้งราคาส่ง" ในกรอบการตั้งค่า ── */}
                  {showWholesale && (
                    <div className="grid grid-cols-2 gap-5 items-start">
                      {wholesaleBlock('ราคาส่ง 1', 'price_wholesale1', unitForm.price_wholesale1, ws1)}
                      {wholesaleBlock('ราคาส่ง 2', 'price_wholesale2', unitForm.price_wholesale2, ws2)}
                    </div>
                  )}
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
        content={deletingUnit && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">หน่วย</span>
                <span className="font-semibold text-right">{deletingUnit.unit_name ?? `Unit #${deletingUnit.unit_id}`}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">ขนาดบรรจุ</span>
                <span className="font-semibold">{deletingUnit.qty_per_base}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground shrink-0">ราคาปลีก</span>
                <span className="font-semibold">{formatCurrency(deletingUnit.price_retail)}</span>
              </div>
            </div>
            <div className="rounded-xl bg-muted p-3 text-sm text-muted-foreground leading-relaxed">
              ประวัติการขายเก่ายังคงแสดงชื่อหน่วยถูกต้อง — หากต้องการซ่อนชั่วคราว ให้ใช้ <span className="font-medium text-foreground">"ปิดการใช้งานหน่วยนี้"</span> แทน
            </div>
          </div>
        )}
        confirmLabel={unitSaving ? 'กำลังลบ...' : 'ยืนยันลบ'}
        cancelLabel="ยกเลิก"
        onConfirm={() => { if (deletingUnit) handleDeleteUnit(deletingUnit.id) }}
      />

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={(v) => { if (!v) setConfirmToggle(null) }}
        variant={confirmToggle?.is_disabled ? 'success' : 'destructive'}
        title={confirmToggle?.is_disabled ? 'เปิดการใช้งาน' : 'ปิดการใช้งาน'}
        description={confirmToggle ? `ต้องการ${confirmToggle.is_disabled ? 'เปิด' : 'ปิด'}ใช้งาน "${confirmToggle.unit_name ?? `Unit #${confirmToggle.unit_id}`}" ?` : undefined}
        onConfirm={() => { if (confirmToggle) handleToggleDisable(confirmToggle); setConfirmToggle(null) }}
      />
    </div>
  )
}
