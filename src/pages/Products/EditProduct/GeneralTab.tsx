import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingRow } from '@/components/ui/setting-row'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import {
  Package, ScanBarcode, Pill, PackageOpen, Settings, Plus, Trash2, History,
} from 'lucide-react'
import type { ProductCategory, DrugType, ItemUnit } from '@/types'
import type { GenericNameSuggestion } from './shared'
import { PriceSection, PriceHistoryDialog } from './PriceSection'

const Field = FormField

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
// 'YYYY-MM' → 'พ.ค. 69' (last two digits of Buddhist-Era year)
function formatThaiMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const be = (y + 543) % 100
  return `${THAI_MONTHS_SHORT[m - 1]} ${String(be).padStart(2, '0')}`
}

type MonthlySales = {
  current_month: { ym: string; qty: number }
  history: Array<{ ym: string; qty: number }>
  avg_per_month: number
}

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
  productId?: number
  isNew?: boolean
  /** weighted-avg cost (products.cost_price) — informational only, 0 when new */
  avgCost: number
  baseUnit: string
  /** Changes whenever the product is re-fetched (after save) → reload price history. */
  reloadToken: string | number
}

export function GeneralTab({
  form, setF, setForm, errors, categories, drugTypes, itemUnits,
  initialGenericQuery = '',
  productId,
  isNew = false,
  avgCost,
  baseUnit,
  reloadToken,
}: Props) {
  const [genericQuery, setGenericQuery] = useState(initialGenericQuery)
  const [genericSuggestions, setGenericSuggestions] = useState<GenericNameSuggestion[]>([])
  const [showGenericSugg, setShowGenericSugg] = useState(false)
  const genericTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [monthlySales, setMonthlySales] = useState<MonthlySales | null>(null)
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false)
  const [salesHistoryOpen, setSalesHistoryOpen] = useState(false)

  // Barcode rows are progressively disclosed — start with 1, click + to add another.
  // Auto-grow on load when the product already has barcodes 2/3/4 saved (so users
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

  useEffect(() => {
    if (isNew || !productId) { setMonthlySales(null); return }
    let cancelled = false
    ;(async () => {
      const data = await window.api.products.monthlySales(productId) as MonthlySales
      if (!cancelled) setMonthlySales(data)
    })()
    return () => { cancelled = true }
  }, [productId, isNew])

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
    <div className="grid grid-cols-[3fr_2fr] items-start gap-4 pt-4">

      {/* LEFT COLUMN */}
      <div className="flex flex-col gap-4">

        <SectionCard icon={Package} title="ข้อมูลพื้นฐาน" tint="primary">
          <div className="grid grid-cols-2 gap-3">
            {/* Row 1: รหัสสินค้า | คีย์เวิร์ดค้นหา */}
            <Field label="รหัสสินค้า">
              <Input variant="elevated" value={form.code} readOnly className="bg-muted cursor-not-allowed"
                      placeholder="สร้างอัตโนมัติ" />
            </Field>
            <Field label="คีย์เวิร์ดค้นหา">
              <Input
                variant="elevated"
                value={form.search_keywords}
                onChange={e => setF('search_keywords', e.target.value)}
                placeholder="ชื่ออื่นๆ คั่นด้วยจุลภาค เช่น พารา,para,tylenol"
              />
            </Field>

            {/* Row 2: ชื่อสินค้า* | ชื่อสำหรับพิมพ์ */}
            <div data-field="trade_name">
              <Field label="ชื่อสินค้า" required>
                <Input
                  variant="elevated"
                  value={form.trade_name}
                  onChange={e => setF('trade_name', e.target.value)}
                  aria-invalid={errors.has('trade_name')}
                />
              </Field>
            </div>
            <Field label="ชื่อสำหรับพิมพ์">
              <Input variant="elevated" value={form.name_for_print} onChange={e => setF('name_for_print', e.target.value)} placeholder="ถ้าว่างใช้ชื่อสินค้า" />
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
          avgCost={avgCost}
          baseUnit={baseUnit}
          isNew={isNew}
          onOpenHistory={() => setPriceHistoryOpen(true)}
        />

        <SectionCard
          icon={PackageOpen}
          title="สต็อกและการแจ้งเตือน"
          tint="amber"
          right={
            <Button
              size="lg"
              variant="elevated"
              className="h-9 px-3"
              onClick={() => setSalesHistoryOpen(true)}
              disabled={isNew}
              title={isNew ? 'บันทึกสินค้าก่อนเพื่อดูประวัติยอดขาย' : 'ดูยอดขายย้อนหลัง 6 เดือน'}
            >
              <History className="size-4" /> ประวัติ
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="จุดสั่งซื้อ">
              <Input variant="elevated" type="number" value={form.reorder_point} onChange={e => setF('reorder_point', e.target.value)} min={0} />
            </Field>
            <Field label="สต็อกปลอดภัย">
              <Input variant="elevated" type="number" value={form.safety_stock} onChange={e => setF('safety_stock', e.target.value)} min={0} />
            </Field>
          </div>

          {!isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-amber-soft/50 border border-amber-strong/25 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">เฉลี่ย / เดือน</span>
                {monthlySales
                  ? <span className="text-base font-bold text-amber-strong">{monthlySales.avg_per_month.toFixed(2)}</span>
                  : <span className="text-sm text-foreground-subtle">—</span>}
              </div>
              <div className="rounded-lg bg-amber-soft/50 border border-amber-strong/25 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">เดือนปัจจุบัน</span>
                {monthlySales
                  ? <span className="text-base font-bold text-amber-strong">{monthlySales.current_month.qty.toFixed(2)}</span>
                  : <span className="text-sm text-foreground-subtle">—</span>}
              </div>
            </div>
          )}
        </SectionCard>

      </div>

      {/* RIGHT COLUMN */}
      <div className="flex flex-col gap-4">

        <SectionCard icon={Settings} title="การตั้งค่า" tint="secondary">
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            <SettingRow
              framed={false}
              variant="destructive"
              title="ปิดใช้งาน"
              description="ปิดการใช้งานสินค้าชนิดนี้"
              checked={!!form.is_disabled}
              onChange={v => setF('is_disabled', v ? 1 : 0)}
            />
            <SettingRow
              framed={false}
              title="การเคลื่อนไหวของสต็อก"
              description="เปิดเพื่อให้มีการเดินของสต็อกสินค้า"
              checked={!!form.is_stock_item}
              onChange={v => setF('is_stock_item', v ? 1 : 0)}
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

        <SectionCard
          icon={Pill}
          title="ข้อมูลยา"
          tint="teal"
        >
          <SettingRow
            control="switch"
            title="สินค้านี้เป็นยาตามกฎหมาย"
            description="ใช้ระบุข้อมูลเพิ่มเติมสำหรับยาตามที่กฏหมายกำหนดไว้"
            checked={!!form.is_drug}
            onChange={v => {
              setF('is_drug', v ? 1 : 0)
              // ข.ย.9 (purchase report) is always tied to is_drug — every drug must be logged
              setF('is_fda9', v ? 1 : 0)
            }}
          />
          {!!form.is_drug && (
            <>
              <div className="space-y-3">
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
                  <SelectTrigger variant="elevated" className="w-full">
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
                    variant="elevated"
                    value={genericQuery}
                    onChange={e => handleGenericSearch(e.target.value)}
                    onFocus={() => setShowGenericSugg(true)}
                    onBlur={() => setTimeout(() => setShowGenericSugg(false), 200)}
                    placeholder="ค้นหาชื่อสามัญ..."
                  />
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
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {/* ข.ย.9 — locked to is_drug, shown read-only */}
                <SettingRow
                  framed={false}
                  readOnly
                  title="ข.ย.9"
                  description="บัญชีการซื้อยา (อัตโนมัติ)"
                  checked={!!form.is_fda9}
                />
                <SettingRow
                  framed={false}
                  title="ข.ย.10"
                  description="ขายยาควบคุมพิเศษ"
                  checked={!!form.is_fda10}
                  onChange={v => setF('is_fda10', v ? 1 : 0)}
                />
                <SettingRow
                  framed={false}
                  title="ข.ย.11"
                  description="ขายยาอันตราย (ที่ อ.ย. กำหนด)"
                  checked={!!form.is_fda11}
                  onChange={v => setF('is_fda11', v ? 1 : 0)}
                />
                <SettingRow
                  framed={false}
                  title="ข.ย.13"
                  description="ขายส่ง (เฉพาะร้านขายส่ง)"
                  checked={!!form.is_fda13}
                  onChange={v => setF('is_fda13', v ? 1 : 0)}
                />
              </div>
            </>
          )}
        </SectionCard>

      </div>

      <PriceHistoryDialog
        open={priceHistoryOpen}
        onOpenChange={setPriceHistoryOpen}
        productId={productId ?? 0}
        isNew={isNew}
        reloadToken={reloadToken}
      />

      <Dialog open={salesHistoryOpen} onOpenChange={setSalesHistoryOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5" /> ยอดขายย้อนหลัง
              <Badge variant="neutral-outline" className="ml-1">6 เดือน</Badge>
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="p-0">
            <Table containerClassName="max-h-[60vh] scrollbar-thin">
              <TableHeader>
                <TableRow>
                  <TableHead>เดือน</TableHead>
                  <TableHead className="text-right">จำนวนขาย</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(monthlySales?.history ?? Array.from({ length: 6 }, (_, i) => ({ ym: `_${i}`, qty: 0 }))).map(h => (
                  <TableRow key={h.ym} className="[&_td]:py-1.5 [&_td]:font-medium">
                    <TableCell className="text-sm text-muted-foreground">
                      {monthlySales ? formatThaiMonth(h.ym) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {monthlySales
                        ? <span className="font-semibold text-foreground">{h.qty.toFixed(2)}</span>
                        : <span className="text-foreground-subtle">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogBody>
          <DialogFooter>
            <Button size="xl" onClick={() => setSalesHistoryOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
