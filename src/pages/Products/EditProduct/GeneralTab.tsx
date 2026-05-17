import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch, Toggle } from '@/components/ui/switch'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Package, ScanBarcode, Tag, Pill, Boxes, FileText, EyeOff,
} from 'lucide-react'
import type { ProductCategory, DrugType, ItemUnit } from '@/types'
import type { GenericNameSuggestion } from './shared'

const Field = FormField

interface Props {
  form: any
  setF: (key: string, value: any) => void
  setForm: (updater: (f: any) => any) => void
  errors: Set<string>
  categories: ProductCategory[]
  drugTypes: DrugType[]
  itemUnits: ItemUnit[]
  /** Initial query string for the generic-name autocomplete — empty for new products,
      resolved by drug_generic_name_id lookup later. */
  initialGenericQuery?: string
}

export function GeneralTab({
  form, setF, setForm, errors, categories, drugTypes, itemUnits,
  initialGenericQuery = '',
}: Props) {
  const [genericQuery, setGenericQuery] = useState(initialGenericQuery)
  const [genericSuggestions, setGenericSuggestions] = useState<GenericNameSuggestion[]>([])
  const [showGenericSugg, setShowGenericSugg] = useState(false)
  const genericTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleGenericSearch = (q: string) => {
    setGenericQuery(q)
    setShowGenericSugg(true)
    if (genericTimer.current) clearTimeout(genericTimer.current)
    if (!q.trim()) { setGenericSuggestions([]); return }
    genericTimer.current = setTimeout(async () => {
      const data = await window.api.products.searchGenericNames(q) as GenericNameSuggestion[]
      setGenericSuggestions(data)
    }, 220)
  }

  const selectGeneric = (g: GenericNameSuggestion) => {
    setF('drug_generic_name_id', g.id)
    setGenericQuery(g.name)
    setGenericSuggestions([])
    setShowGenericSugg(false)
    // Auto-tick antibiotic flag
    if (g.is_antibiotic) setF('is_antibiotic', 1)
  }

  return (
    <div className="grid grid-cols-2 gap-4 pt-4">

      {/* LEFT COLUMN */}
      <div className="space-y-4">

        <SectionCard icon={Package} title="ข้อมูลพื้นฐาน" tint="primary">
          <div className="grid grid-cols-2 gap-3">
            {/* Row 1: รหัสสินค้า | คีย์เวิร์ดค้นหา */}
            <Field label="รหัสสินค้า">
              <Input value={form.code} readOnly className="bg-muted cursor-not-allowed"
                      placeholder="สร้างอัตโนมัติ" />
            </Field>
            <Field label="คีย์เวิร์ดค้นหา">
              <Input
                value={form.search_keywords}
                onChange={e => setF('search_keywords', e.target.value)}
                placeholder="ชื่ออื่นๆ คั่นด้วยจุลภาค เช่น พารา,para,tylenol"
              />
            </Field>

            {/* Row 2: ชื่อสินค้า* (full width) */}
            <div className="col-span-2" data-field="trade_name">
              <Field label="ชื่อสินค้า" required>
                <Input
                  value={form.trade_name}
                  onChange={e => setF('trade_name', e.target.value)}
                  aria-invalid={errors.has('trade_name')}
                />
              </Field>
            </div>

            {/* Row 3: ชื่อสำหรับพิมพ์ (full width) */}
            <div className="col-span-2">
              <Field label="ชื่อสำหรับพิมพ์">
                <Input value={form.name_for_print} onChange={e => setF('name_for_print', e.target.value)} placeholder="ถ้าว่างใช้ชื่อสินค้า" />
              </Field>
            </div>

            {/* Row 4: หมวดหมู่ | หน่วยหลัก */}
            <Field label="หมวดหมู่">
              <Select value={String(form.category_id ?? 0)} onValueChange={v => setF('category_id', Number(v))}>
                <SelectTrigger className="h-10 w-full">
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
                  <SelectTrigger aria-invalid={errors.has('unit_id')} className="h-10 w-full">
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

        <SectionCard icon={Tag} title="ราคาและต้นทุน" tint="success">
          <div className="grid grid-cols-2 gap-3">

            {/* col1 row1: ราคาขายปลีก */}
            <div className="col-start-1 row-start-1" data-field="price_retail">
              <Field label="ราคาขายปลีก" required>
                <Input
                  type="number"
                  value={form.price_retail}
                  onChange={e => setF('price_retail', e.target.value)}
                  aria-invalid={errors.has('price_retail')}
                  className="text-right tabular-nums" min={0} step="0.01"
                />
              </Field>
            </div>

            {/* col1 row2: ราคาส่ง 1 */}
            <div className="col-start-1 row-start-2">
              <Field label="ราคาส่ง 1">
                <Input type="number" value={form.price_wholesale1} onChange={e => setF('price_wholesale1', e.target.value)}
                  className="text-right tabular-nums" min={0} step="0.01" />
              </Field>
            </div>

            {/* col2 row1-2: สรุปกำไร */}
            <div className="col-start-2 row-start-1 row-span-2 h-full space-y-1.5">
              <span className="block text-sm font-semibold text-foreground">สรุปกำไร</span>
              {(() => {
                const cost = parseFloat(form.cost_price) || 0
                const calc = (price: number) => {
                  const profit = price - cost
                  const pct = cost > 0 ? (profit / cost) * 100 : 0
                  return { profit, pct, pos: profit >= 0, dim: price <= 0 || cost <= 0 }
                }
                const retail = calc(parseFloat(form.price_retail) || 0)
                const ws1 = calc(parseFloat(form.price_wholesale1) || 0)
                const ws2 = calc(parseFloat(form.price_wholesale2) || 0)
                return (
                  <div className="h-[calc(100%-1.75rem)] rounded-lg bg-muted/50 px-3 py-2 flex flex-col">
                    {/* ราคาขายปลีก */}
                    <div className="flex-1 flex items-center justify-between tabular-nums">
                      <span className={`text-sm ${retail.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>ราคาขายปลีก</span>
                      {retail.dim ? (
                        <span className="text-sm text-foreground-subtle">—</span>
                      ) : (
                        <div className="text-right">
                          <span className={`text-sm font-bold ${retail.pos ? 'text-success' : 'text-destructive'}`}>
                            {retail.pos ? '+' : ''}{retail.profit.toFixed(2)}
                          </span>
                          <span className={`ml-1 text-sm font-bold ${retail.pos ? 'text-success' : 'text-destructive'}`}>
                            ({retail.pos ? '+' : ''}{retail.pct.toFixed(0)}%)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ราคาส่ง 1 */}
                    <div className="flex-1 flex items-center justify-between tabular-nums">
                      <span className={`text-sm ${ws1.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>ราคาส่ง 1</span>
                      {ws1.dim ? (
                        <span className="text-sm text-foreground-subtle">—</span>
                      ) : (
                        <div className="text-right">
                          <span className={`text-sm font-bold ${ws1.pos ? 'text-success' : 'text-destructive'}`}>
                            {ws1.pos ? '+' : ''}{ws1.profit.toFixed(2)}
                          </span>
                          <span className={`ml-1 text-sm font-bold ${ws1.pos ? 'text-success' : 'text-destructive'}`}>
                            ({ws1.pos ? '+' : ''}{ws1.pct.toFixed(0)}%)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ราคาส่ง 2 */}
                    <div className="flex-1 flex items-center justify-between tabular-nums">
                      <span className={`text-sm ${ws2.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>ราคาส่ง 2</span>
                      {ws2.dim ? (
                        <span className="text-sm text-foreground-subtle">—</span>
                      ) : (
                        <div className="text-right">
                          <span className={`text-sm font-bold ${ws2.pos ? 'text-success' : 'text-destructive'}`}>
                            {ws2.pos ? '+' : ''}{ws2.profit.toFixed(2)}
                          </span>
                          <span className={`ml-1 text-sm font-bold ${ws2.pos ? 'text-success' : 'text-destructive'}`}>
                            ({ws2.pos ? '+' : ''}{ws2.pct.toFixed(0)}%)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* col1 row3: ส่ง 2 */}
            <div className="col-start-1 row-start-3">
              <Field label="ราคาส่ง 2">
                <Input type="number" value={form.price_wholesale2} onChange={e => setF('price_wholesale2', e.target.value)}
                  className="text-right tabular-nums" min={0} step="0.01" />
              </Field>
            </div>

            {/* col2 row3: ราคาทุน */}
            <div className="col-start-2 row-start-3">
              <Field label="ราคาทุน (ล่าสุด)">
                <Input type="number" value={form.cost_price} onChange={e => setF('cost_price', e.target.value)}
                  className="text-right tabular-nums" min={0} step="0.01" placeholder="ทุนล่าสุดที่ซื้อ — ใช้อ้างอิงตั้งราคา" />
              </Field>
            </div>

            {/* col1 row4: มี VAT */}
            <div className="p-2 col-start-1 row-start-4 flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">มี VAT</div>
                <div className="text-xs text-muted-foreground">บวก 7% เมื่อออกใบกำกับภาษี</div>
              </div>
              <Switch size="lg" checked={!!form.is_vat} onCheckedChange={v => setF('is_vat', v ? 1 : 0)} />
            </div>

            {/* col2 row4: นับสต็อก */}
            <div className="col-start-2 row-start-4 flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">นับสต็อก</div>
                <div className="text-xs text-muted-foreground">ตัดสต็อกอัตโนมัติเมื่อขาย</div>
              </div>
              <Switch size="lg" checked={!!form.is_stock_item} onCheckedChange={v => setF('is_stock_item', v ? 1 : 0)} />
            </div>

          </div>
        </SectionCard>

        <SectionCard icon={FileText} title="หมายเหตุและคำบรรยาย" tint="secondary">
          <Field label="สรรพคุณ">
            <Textarea
              value={form.indication_note}
              onChange={e => setF('indication_note', e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="ผลข้างเคียง">
            <Textarea
              value={form.side_effect_note}
              onChange={e => setF('side_effect_note', e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="หมายเหตุ">
            <Textarea
              value={form.note}
              onChange={e => setF('note', e.target.value)}
              rows={2}
            />
          </Field>
        </SectionCard>

      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-4">

        <SectionCard icon={ScanBarcode} title="บาร์โค้ด" tint="secondary">
          <div className="grid grid-cols-2 gap-3">
            <Field label="บาร์โค้ด 1">
              <Input value={form.barcode} onChange={e => setF('barcode', e.target.value)} placeholder="ตัวเลข 13 หลัก" />
            </Field>
            <Field label="บาร์โค้ด 2">
              <Input value={form.barcode2} onChange={e => setF('barcode2', e.target.value)} />
            </Field>
            <Field label="บาร์โค้ด 3">
              <Input value={form.barcode3} onChange={e => setF('barcode3', e.target.value)} />
            </Field>
            <Field label="บาร์โค้ด 4">
              <Input value={form.barcode4} onChange={e => setF('barcode4', e.target.value)} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard icon={Boxes} title="สต็อกและการแจ้งเตือน" tint="warning">
          <div className="grid grid-cols-2 gap-3">
            <Field label="จุดสั่งซื้อ">
              <Input type="number" value={form.reorder_point} onChange={e => setF('reorder_point', e.target.value)} min={0} />
            </Field>
            <Field label="สต็อกปลอดภัย">
              <Input type="number" value={form.safety_stock} onChange={e => setF('safety_stock', e.target.value)} min={0} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          icon={Pill}
          title="ข้อมูลยา"
          tint="warning"
        >
          <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-foreground">เป็นยาตามกฎหมาย</div>
              <div className="text-xs text-muted-foreground">เปิดสวิตช์เพื่อกรอกข้อมูลยา</div>
            </div>
            <Toggle
              size="lg"
              checked={!!form.is_drug}
              onChange={v => {
                setF('is_drug', v ? 1 : 0)
                // ข.ย.9 (purchase report) is always tied to is_drug — every drug must be logged
                setF('is_fda9', v ? 1 : 0)
              }}
            />
          </div>
          {!!form.is_drug && (
            <>
              <div className="grid grid-cols-2 gap-3">
              <Field label="ประเภทยา">
                <Select
                  value={String(form.drug_type_id ?? 0)}
                  onValueChange={v => {
                    const id = Number(v)
                    const dt = drugTypes.find(d => d.id === id)
                    // Auto-fill ข.ย.10/11/13 defaults from the selected drug type
                    setForm((f: any) => ({
                      ...f,
                      drug_type_id: id,
                      is_fda10: dt?.is_fda10 ?? 0,
                      is_fda11: dt?.is_fda11 ?? 0,
                      is_fda13: dt?.is_fda13 ?? 0,
                    }))
                  }}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="— ไม่ระบุ —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— ไม่ระบุ —</SelectItem>
                    {drugTypes.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name_th}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="ชื่อสามัญ">
                <div className="relative">
                  <Input
                    value={genericQuery}
                    onChange={e => handleGenericSearch(e.target.value)}
                    onFocus={() => setShowGenericSugg(true)}
                    onBlur={() => setTimeout(() => setShowGenericSugg(false), 200)}
                    placeholder="ค้นหาชื่อสามัญ..."
                  />
                  {form.drug_generic_name_id > 0 && !showGenericSugg && (
                    <div className="mt-1 text-sm text-muted-foreground">ID: {form.drug_generic_name_id}</div>
                  )}
                  {showGenericSugg && genericSuggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border border-border rounded-card shadow-card max-h-48 overflow-y-auto p-1">
                      {genericSuggestions.map(g => (
                        <Button
                          key={g.id}
                          type="button"
                          variant="ghost"
                          onMouseDown={() => selectGeneric(g)}
                          className="w-full h-auto justify-start px-3 py-2"
                        >
                          <span className="flex-1 text-left">{g.name}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              </div>
              {/* TMT ID — ซ่อน UI ไว้ก่อน (ยังไม่ได้ใช้เร็วๆ นี้) ค่า tmt_id ยังคงอยู่ใน form state + โหลด/บันทึกตามปกติ */}
              {/* <Field label="TMT ID">
                <Input value={form.tmt_id} onChange={e => setF('tmt_id', e.target.value)} />
              </Field> */}
              <div className="grid grid-cols-2 gap-3">
                {/* ข.ย.9 — locked to is_drug, shown read-only */}
                <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">ข.ย.9</div>
                    <div className="text-xs text-muted-foreground">บัญชีการซื้อยา (อัตโนมัติ)</div>
                  </div>
                  <Switch size="lg" checked={!!form.is_fda9} disabled />
                </div>
                {/* ข.ย.10 */}
                <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">ข.ย.10</div>
                    <div className="text-xs text-muted-foreground">ขายยาควบคุมพิเศษ</div>
                  </div>
                  <Switch size="lg" checked={!!form.is_fda10} onCheckedChange={v => setF('is_fda10', v ? 1 : 0)} />
                </div>
                {/* ข.ย.11 */}
                <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">ข.ย.11</div>
                    <div className="text-xs text-muted-foreground">ขายยาอันตราย (ที่ อ.ย. กำหนด)</div>
                  </div>
                  <Switch size="lg" checked={!!form.is_fda11} onCheckedChange={v => setF('is_fda11', v ? 1 : 0)} />
                </div>
                {/* ข.ย.13 */}
                <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">ข.ย.13</div>
                    <div className="text-xs text-muted-foreground">ขายส่ง (เฉพาะร้านขายส่ง)</div>
                  </div>
                  <Switch size="lg" checked={!!form.is_fda13} onCheckedChange={v => setF('is_fda13', v ? 1 : 0)} />
                </div>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard icon={EyeOff} title="สถานะ" tint="secondary">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">ซ่อน</div>
                <div className="text-xs text-muted-foreground">ซ่อนจากการค้นหา</div>
              </div>
              <Switch size="lg" checked={!!form.is_hidden} onCheckedChange={v => setF('is_hidden', v ? 1 : 0)} />
            </div>
            <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">ปิดใช้งาน</div>
                <div className="text-xs text-muted-foreground">ปิดการใช้งานทั้งสินค้า</div>
              </div>
              <Switch size="lg" checked={!!form.is_disabled} onCheckedChange={v => setF('is_disabled', v ? 1 : 0)} />
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
