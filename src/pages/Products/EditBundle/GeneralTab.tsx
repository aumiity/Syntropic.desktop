import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SectionCard } from '@/components/ui/card'
import { FileText, Barcode, Settings } from 'lucide-react'
import type { ProductCategory, ItemUnit } from '@/types'

interface Props {
  form: any
  setF: (key: string, v: any) => void
  categories: ProductCategory[]
  itemUnits: ItemUnit[]
}

// Bundle General tab — fields that apply to bundles only.
// Excluded vs EditProduct/GeneralTab: drug-info section, stock-alert section,
// FDA flags, antibiotic toggle, last_cost_price field. Bundles aren't drugs
// themselves and have no own lots, so reorder_point / safety_stock are N/A.
export function GeneralTab({ form, setF, categories, itemUnits }: Props) {
  return (
    <div className="space-y-3">
      <SectionCard icon={FileText} title="ข้อมูลทั่วไป">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <FormField label="ชื่อชุดสินค้า" required>
              <Input value={form.trade_name ?? ''} onChange={e => setF('trade_name', e.target.value)} autoFocus />
            </FormField>
          </div>
          <FormField label="ชื่อสำหรับพิมพ์ใบเสร็จ">
            <Input value={form.name_for_print ?? ''} onChange={e => setF('name_for_print', e.target.value)} />
          </FormField>
          <FormField label="รหัส">
            <Input value={form.code ?? ''} onChange={e => setF('code', e.target.value)} placeholder="P0001" />
          </FormField>
          <FormField label="หมวดหมู่">
            <Select value={String(form.category_id ?? 0)} onValueChange={v => setF('category_id', Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="เลือก..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">— ไม่ระบุ —</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="หน่วยนับ">
            <Select value={String(form.unit_id ?? 0)} onValueChange={v => setF('unit_id', Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="เลือก..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">— ไม่ระบุ —</SelectItem>
                {itemUnits.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </SectionCard>

      <SectionCard icon={Barcode} title="บาร์โค้ด">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="บาร์โค้ดหลัก">
            <Input value={form.barcode ?? ''} onChange={e => setF('barcode', e.target.value)} />
          </FormField>
          <FormField label="บาร์โค้ดสำรอง 1">
            <Input value={form.barcode2 ?? ''} onChange={e => setF('barcode2', e.target.value)} />
          </FormField>
          <FormField label="บาร์โค้ดสำรอง 2">
            <Input value={form.barcode3 ?? ''} onChange={e => setF('barcode3', e.target.value)} />
          </FormField>
          <FormField label="บาร์โค้ดสำรอง 3">
            <Input value={form.barcode4 ?? ''} onChange={e => setF('barcode4', e.target.value)} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard icon={Settings} title="ตัวเลือกเพิ่มเติม">
        <div className="space-y-3">
          <FormField label="คำค้นหา (search keywords)">
            <Input
              value={form.search_keywords ?? ''}
              onChange={e => setF('search_keywords', e.target.value)}
              placeholder="คั่นด้วย comma เช่น ปวดหัว, ลดไข้, paracetamol"
            />
          </FormField>
          <FormField label="หมายเหตุ">
            <Textarea value={form.note ?? ''} onChange={e => setF('note', e.target.value)} rows={3} />
          </FormField>
          <div className="flex items-center gap-4 pt-1">
            <Toggle
              size="lg"
              checked={!!form.has_vat}
              onChange={v => setF('has_vat', v ? 1 : 0)}
              label="คิดภาษีมูลค่าเพิ่ม (VAT)"
            />
            <Toggle
              size="lg"
              variant="destructive"
              checked={!!form.is_disabled}
              onChange={v => setF('is_disabled', v ? 1 : 0)}
              label="พักการใช้งาน"
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
