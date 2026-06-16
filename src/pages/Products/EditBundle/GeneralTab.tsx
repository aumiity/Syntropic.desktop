import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { SettingRow } from '@/components/ui/setting-row'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { SectionCard } from '@/components/ui/card'
import { Package, ScanBarcode, Settings, Plus, Trash2 } from 'lucide-react'
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
    <div className="grid grid-cols-[3fr_2fr] items-start gap-4 pt-4">

      {/* LEFT COLUMN */}
      <div className="flex flex-col gap-4">

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

            {/* Row 2: ชื่อชุดสินค้า* | ชื่อสำหรับพิมพ์ */}
            <div data-field="trade_name">
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
            <Field label="ชื่อสำหรับพิมพ์">
              <Input variant="elevated" value={form.name_for_print ?? ''} onChange={e => setF('name_for_print', e.target.value)} placeholder="ถ้าว่างใช้ชื่อชุดสินค้า" />
            </Field>
          </div>

          {/* Row 3: หมวดหมู่ | หน่วยหลัก | จำนวนตั้งต้นการขาย — 3 คอลัมน์ */}
          <div className="grid grid-cols-3 gap-3">
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
            <Field label="จำนวนตั้งต้นการขาย">
              <Input type="number" value={form.default_qty} onChange={e => setF('default_qty', e.target.value)} min={1} step="any" />
            </Field>
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
      <div className="flex flex-col gap-4">

        <SectionCard icon={Settings} title="การตั้งค่า" tint="secondary">
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            <SettingRow
              framed={false}
              variant="destructive"
              title="ปิดใช้งาน"
              description="ปิดการใช้งานชุดสินค้านี้"
              checked={!!form.is_disabled}
              onChange={v => setF('is_disabled', v ? 1 : 0)}
            />
          </div>
        </SectionCard>

        <SectionCard
          icon={ScanBarcode}
          title="บาร์โค้ด"
          tint="secondary"
          right={
            <Button
              size="lg"
              variant="elevated"
              className="h-9 px-3"
              onClick={() => setBarcodeSlots(n => Math.min(4, n + 1))}
              disabled={barcodeSlots >= 4}
            >
              <Plus className="size-4" /> เพิ่ม
            </Button>
          }
        >
          <div className="space-y-3">
            {Array.from({ length: barcodeSlots }, (_, i) => {
              const key = i === 0 ? 'barcode' : `barcode${i + 1}`
              const isLast = i === barcodeSlots - 1
              return (
                <Field key={key} label={`บาร์โค้ด ${i + 1}`}>
                  <div className="flex gap-2">
                    <Input
                      value={form[key] ?? ''}
                      onChange={e => setF(key, e.target.value)}
                      className="flex-1"
                      placeholder={i === 0 ? 'ตัวเลข 13 หลัก' : undefined}
                    />
                    {isLast && i > 0 && (
                      <Button
                        type="button"
                        size="lg"
                        variant="elevated-destructive-soft"
                        className="h-9 w-9 p-0 shrink-0"
                        onClick={collapseLastBarcode}
                        tooltip="ลบบาร์โค้ดนี้"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </Field>
              )
            })}
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
