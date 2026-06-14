import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { SectionCard } from '@/components/ui/card'
import { Package, ScanBarcode, Settings, Plus, X } from 'lucide-react'
import type { ProductCategory, ItemUnit } from '@/types'
import type { FullProduct } from '../EditProduct/shared'
import { PriceSection, PriceHistoryDialog } from './PriceSection'

const Field = FormField

interface Props {
  form: any
  setF: (key: string, v: any) => void
  errors: Set<string>
  categories: ProductCategory[]
  itemUnits: ItemUnit[]
  product: FullProduct | null
  productId: number
  isNew: boolean
  reloadToken: string | number
}

// Bundle General tab — mirrors EditProduct/GeneralTab structure (status on
// top of the right column, PriceSection embedded inline, history as dialog).
// Excluded vs. EditProduct: ข้อมูลยา (drug-info), สต็อกและการแจ้งเตือน
// (bundles have no own lots), FDA flags, antibiotic flag, last_cost_price,
// สรรพคุณ / ผลข้างเคียง (drug-only).
export function GeneralTab({
  form, setF, errors, categories, itemUnits,
  product, productId, isNew, reloadToken,
}: Props) {
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false)

  // Base unit label for the price section badge — derived from form.unit_id
  // so it stays in sync when the user changes หน่วยหลัก. Fallback "หน่วย"
  // covers the brief window before unit_id resolves.
  const baseUnit = itemUnits.find(u => u.id === form.unit_id)?.name ?? 'หน่วย'

  // Barcode rows are progressively disclosed — start with 1, click + to add another.
  // Auto-grow on load when the bundle already has barcodes 2/3/4 saved (so users
  // never have to expand to see their own data). Never shrinks automatically;
  // collapse is explicit via the X on the last visible row.
  const [barcodeSlots, setBarcodeSlots] = useState(1)
  useEffect(() => {
    const filledMax = form.barcode4 ? 4
                    : form.barcode3 ? 3
                    : form.barcode2 ? 2
                    : 1
    setBarcodeSlots(prev => Math.max(prev, filledMax))
  }, [form.barcode2, form.barcode3, form.barcode4])
  const collapseLastBarcode = () => {
    const key = barcodeSlots === 4 ? 'barcode4'
              : barcodeSlots === 3 ? 'barcode3'
              : 'barcode2'
    setF(key, '')
    setBarcodeSlots(n => Math.max(1, n - 1))
  }

  return (
    <div className="grid grid-cols-[3fr_2fr] gap-4 pt-4">

      {/* LEFT COLUMN */}
      <div className="space-y-4">

        <SectionCard icon={Package} title="ข้อมูลพื้นฐาน" tint="primary">
          <div className="grid grid-cols-2 gap-3">
            {/* Row 1: รหัสสินค้า | คีย์เวิร์ดค้นหา */}
            <Field label="รหัสสินค้า">
              <Input variant="elevated" value={form.code ?? ''} readOnly className="bg-muted cursor-not-allowed"
                     placeholder="สร้างอัตโนมัติ" />
            </Field>
            <Field label="คีย์เวิร์ดค้นหา">
              <Input
                variant="elevated"
                value={form.search_keywords ?? ''}
                onChange={e => setF('search_keywords', e.target.value)}
                placeholder="ชื่ออื่นๆ คั่นด้วยจุลภาค"
              />
            </Field>

            {/* Row 2: ชื่อชุดสินค้า* (full width) */}
            <div className="col-span-2" data-field="trade_name">
              <Field label="ชื่อชุดสินค้า" required>
                <Input
                  variant="elevated"
                  value={form.trade_name ?? ''}
                  onChange={e => setF('trade_name', e.target.value)}
                  aria-invalid={errors.has('trade_name')}
                  autoFocus
                />
              </Field>
            </div>

            {/* Row 3: ชื่อสำหรับพิมพ์ (full width) */}
            <div className="col-span-2">
              <Field label="ชื่อสำหรับพิมพ์">
                <Input
                  variant="elevated"
                  value={form.name_for_print ?? ''}
                  onChange={e => setF('name_for_print', e.target.value)}
                  placeholder="ถ้าว่างใช้ชื่อชุดสินค้า"
                />
              </Field>
            </div>

            {/* Row 4: หมวดหมู่ | หน่วยหลัก */}
            <Field label="หมวดหมู่">
              <Select value={String(form.category_id ?? 0)} onValueChange={v => setF('category_id', Number(v))}>
                <SelectTrigger variant="elevated" className="w-full">
                  <SelectValue placeholder="— ไม่ระบุ —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— ไม่ระบุ —</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div data-field="unit_id">
              <Field label="หน่วยหลัก" required>
                <Combobox
                  variant="elevated"
                  items={itemUnits}
                  value={itemUnits.find(u => u.id === form.unit_id) ?? null}
                  onChange={u => setF('unit_id', u?.id ?? null)}
                  getKey={u => u.id}
                  getLabel={u => u.name}
                  placeholder="— เลือกหน่วย —"
                  searchPlaceholder="พิมพ์เพื่อค้นหาหน่วย..."
                  emptyText="ไม่พบหน่วย"
                  triggerClassName={errors.has('unit_id') ? 'border-destructive' : undefined}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        <PriceSection
          form={form}
          setF={setF}
          errors={errors}
          product={product}
          baseUnit={baseUnit}
          isNew={isNew}
          onOpenHistory={() => setPriceHistoryOpen(true)}
        />

      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-4">

        <SectionCard icon={Settings} title="การตั้งค่า" tint="secondary">
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            <label className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none ${form.is_disabled ? 'bg-destructive-soft/40' : ''}`}>
              <Checkbox checked={!!form.is_disabled} onCheckedChange={v => setF('is_disabled', v ? 1 : 0)} />
              <div>
                <div className="text-sm font-semibold text-foreground">ปิดใช้งาน</div>
                <div className="text-xs text-muted-foreground">ปิดการใช้งานทั้งชุดสินค้า</div>
              </div>
            </label>
          </div>
        </SectionCard>

        <SectionCard icon={ScanBarcode} title="บาร์โค้ด" tint="secondary">
          <div className="space-y-3">
            <Field label="บาร์โค้ด 1">
              <Input variant="elevated" value={form.barcode ?? ''} onChange={e => setF('barcode', e.target.value)} placeholder="ตัวเลข 13 หลัก" />
            </Field>
            {barcodeSlots >= 2 && (
              <Field label="บาร์โค้ด 2">
                <div className="flex gap-2">
                  <Input variant="elevated" value={form.barcode2 ?? ''} onChange={e => setF('barcode2', e.target.value)} className="flex-1" />
                  {barcodeSlots === 2 && (
                    <Button type="button" variant="ghost" size="icon" onClick={collapseLastBarcode} title="ยุบ" aria-label="ยุบบาร์โค้ด 2">
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </Field>
            )}
            {barcodeSlots >= 3 && (
              <Field label="บาร์โค้ด 3">
                <div className="flex gap-2">
                  <Input variant="elevated" value={form.barcode3 ?? ''} onChange={e => setF('barcode3', e.target.value)} className="flex-1" />
                  {barcodeSlots === 3 && (
                    <Button type="button" variant="ghost" size="icon" onClick={collapseLastBarcode} title="ยุบ" aria-label="ยุบบาร์โค้ด 3">
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </Field>
            )}
            {barcodeSlots >= 4 && (
              <Field label="บาร์โค้ด 4">
                <div className="flex gap-2">
                  <Input variant="elevated" value={form.barcode4 ?? ''} onChange={e => setF('barcode4', e.target.value)} className="flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={collapseLastBarcode} title="ยุบ" aria-label="ยุบบาร์โค้ด 4">
                    <X className="size-4" />
                  </Button>
                </div>
              </Field>
            )}
            {barcodeSlots < 4 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBarcodeSlots(n => Math.min(4, n + 1))}
                className="w-full justify-center"
              >
                <Plus className="size-4" /> เพิ่มบาร์โค้ด
              </Button>
            )}
          </div>
        </SectionCard>

      </div>

      <PriceHistoryDialog
        open={priceHistoryOpen}
        onOpenChange={setPriceHistoryOpen}
        productId={productId}
        isNew={isNew}
        reloadToken={reloadToken}
      />
    </div>
  )
}
