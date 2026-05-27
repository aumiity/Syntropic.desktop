import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SectionCard } from '@/components/ui/card'
import { Package, ScanBarcode, FileText, EyeOff } from 'lucide-react'
import type { ProductCategory, ItemUnit } from '@/types'
import type { FullProduct } from '../EditProduct/shared'
import { PriceSection, PriceHistoryDialog } from './PriceTab'

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

  return (
    <div className="grid grid-cols-2 gap-4 pt-4">

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
                <SelectTrigger variant="elevated" className="h-10 w-full">
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
                <Select value={String(form.unit_id ?? 0)} onValueChange={v => setF('unit_id', Number(v) || null)}>
                  <SelectTrigger variant="elevated" aria-invalid={errors.has('unit_id')} className="h-10 w-full">
                    <SelectValue placeholder="— เลือกหน่วย —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— เลือกหน่วย —</SelectItem>
                    {itemUnits.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </SectionCard>

        <PriceSection
          form={form}
          setF={setF}
          errors={errors}
          product={product}
          isNew={isNew}
          onOpenHistory={() => setPriceHistoryOpen(true)}
        />

        <SectionCard icon={FileText} title="หมายเหตุ" tint="secondary">
          <Textarea
            variant="elevated"
            value={form.note ?? ''}
            onChange={e => setF('note', e.target.value)}
            rows={4}
          />
        </SectionCard>

      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-4">

        <SectionCard icon={EyeOff} title="สถานะ" tint="secondary">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 border border-border">
              <div>
                <div className="text-sm font-semibold text-foreground">VAT</div>
                <div className="text-xs text-muted-foreground">คิดภาษีมูลค่าเพิ่ม</div>
              </div>
              <Switch size="lg" checked={!!form.has_vat} onCheckedChange={v => setF('has_vat', v ? 1 : 0)} />
            </div>
            <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 border ${form.is_disabled ? 'border-destructive/40 bg-destructive-soft/40' : 'border-border'}`}>
              <div>
                <div className="text-sm font-semibold text-foreground">ปิดใช้งาน</div>
                <div className="text-xs text-muted-foreground">ปิดการใช้งานทั้งชุดสินค้า</div>
              </div>
              <Switch size="lg" variant="destructive" checked={!!form.is_disabled} onCheckedChange={v => setF('is_disabled', v ? 1 : 0)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={ScanBarcode} title="บาร์โค้ด" tint="secondary">
          <div className="grid grid-cols-2 gap-3">
            <Field label="บาร์โค้ด 1">
              <Input variant="elevated" value={form.barcode ?? ''} onChange={e => setF('barcode', e.target.value)} placeholder="ตัวเลข 13 หลัก" />
            </Field>
            <Field label="บาร์โค้ด 2">
              <Input variant="elevated" value={form.barcode2 ?? ''} onChange={e => setF('barcode2', e.target.value)} />
            </Field>
            <Field label="บาร์โค้ด 3">
              <Input variant="elevated" value={form.barcode3 ?? ''} onChange={e => setF('barcode3', e.target.value)} />
            </Field>
            <Field label="บาร์โค้ด 4">
              <Input variant="elevated" value={form.barcode4 ?? ''} onChange={e => setF('barcode4', e.target.value)} />
            </Field>
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
