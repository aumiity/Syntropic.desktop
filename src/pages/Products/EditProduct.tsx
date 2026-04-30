import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductUnit, ProductLot, ProductLabel, ProductCategory, DrugType, DosageForm, ItemUnit } from '@/types'
import { ArrowLeft, Save, Plus, Trash2, Edit2, ChevronDown, AlertTriangle } from 'lucide-react'

// ---- Types ----
interface FullProduct extends Product {
  units: ProductUnit[]
  lots: ProductLot[]
  labels: ProductLabel[]
}

interface GenericNameSuggestion { id: number; name: string; is_antibiotic: number }

// ---- Helpers ----
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1 mb-3">{children}</h3>
}

function FieldRow({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start">
      <label className="text-sm font-medium pt-2 text-right">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

function SelectField({ value, onChange, children, className = '' }: {
  value: number | string; onChange: (v: string) => void; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  )
}

// ========================
// MAIN COMPONENT
// ========================
export default function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const productId = Number(id)

  const [tab, setTab] = useState('general')
  const [product, setProduct] = useState<FullProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dropdown data
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [drugTypes, setDrugTypes] = useState<DrugType[]>([])
  const [dosageForms, setDosageForms] = useState<DosageForm[]>([])
  const [itemUnits, setItemUnits] = useState<ItemUnit[]>([])
  const [labelFrequencies, setLabelFrequencies] = useState<any[]>([])
  const [labelDosages, setLabelDosages] = useState<any[]>([])
  const [labelMealRelations, setLabelMealRelations] = useState<any[]>([])
  const [labelTimes, setLabelTimes] = useState<any[]>([])
  const [labelAdvices, setLabelAdvices] = useState<any[]>([])

  // Form state (general tab)
  const [form, setForm] = useState<any>({})

  // Generic name autocomplete
  const [genericQuery, setGenericQuery] = useState('')
  const [genericSuggestions, setGenericSuggestions] = useState<GenericNameSuggestion[]>([])
  const [showGenericSugg, setShowGenericSugg] = useState(false)
  const genericTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Unit dialog
  const [unitDialog, setUnitDialog] = useState(false)
  const [editingUnit, setEditingUnit] = useState<ProductUnit | null>(null)
  const [unitForm, setUnitForm] = useState<any>({})
  const [unitSaving, setUnitSaving] = useState(false)

  // Label dialog
  const [labelDialog, setLabelDialog] = useState(false)
  const [editingLabel, setEditingLabel] = useState<ProductLabel | null>(null)
  const [labelForm, setLabelForm] = useState<any>({})
  const [labelSaving, setLabelSaving] = useState(false)

  useEffect(() => {
    loadAll()
  }, [productId])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, cats, dts, dfs, units, freqs, dosages, meals, times, advices] = await Promise.all([
        window.api.products.get(productId),
        window.api.settings.allCategories(),
        window.api.settings.allDrugTypes(),
        window.api.settings.allDosageForms(),
        window.api.settings.allUnits(),
        window.api.settings.listLabelFrequencies(),
        window.api.settings.listLabelDosages(),
        window.api.settings.listLabelMealRelations(),
        window.api.settings.listLabelTimes(),
        window.api.settings.listLabelAdvices(),
      ])
      if (!p) { navigate('/products'); return }
      const prod = p as FullProduct
      setProduct(prod)
      setForm({
        trade_name: prod.trade_name ?? '',
        name_for_print: prod.name_for_print ?? '',
        code: prod.code ?? '',
        barcode: prod.barcode ?? '',
        barcode2: prod.barcode2 ?? '',
        barcode3: prod.barcode3 ?? '',
        barcode4: prod.barcode4 ?? '',
        unit_name: prod.unit_name ?? '',
        category_id: prod.category_id ?? 0,
        drug_type_id: prod.drug_type_id ?? 0,
        dosage_form_id: prod.dosage_form_id ?? 0,
        drug_generic_name_id: prod.drug_generic_name_id ?? 0,
        strength: prod.strength ?? '',
        registration_no: prod.registration_no ?? '',
        tmt_id: prod.tmt_id ?? '',
        price_retail: prod.price_retail ?? 0,
        price_wholesale1: prod.price_wholesale1 ?? 0,
        price_wholesale2: prod.price_wholesale2 ?? 0,
        cost_price: prod.cost_price ?? 0,
        has_wholesale1: prod.has_wholesale1 ?? 0,
        has_wholesale2: prod.has_wholesale2 ?? 0,
        is_vat: prod.has_vat ?? 0,
        is_not_discount: prod.no_discount ?? 0,
        is_stock_item: prod.is_stock_item ?? 1,
        default_qty: prod.default_qty ?? 1,
        reorder_point: prod.reorder_point ?? 0,
        safety_stock: prod.safety_stock ?? 0,
        expiry_alert_days1: prod.expiry_alert_days1 ?? 90,
        expiry_alert_days2: prod.expiry_alert_days2 ?? 60,
        expiry_alert_days3: prod.expiry_alert_days3 ?? 30,
        is_original_drug: prod.is_original_drug ?? 0,
        is_antibiotic: prod.is_antibiotic ?? 0,
        max_dispense_qty: prod.max_dispense_qty ?? '',
        is_fda_report: prod.is_fda_report ?? 0,
        is_fda13_report: prod.is_fda13_report ?? 0,
        is_sale_control: prod.is_sale_control ?? 0,
        sale_control_qty: prod.sale_control_qty ?? '',
        indication_note: prod.indication_note ?? '',
        side_effect_note: prod.side_effect_note ?? '',
        search_keywords: prod.search_keywords ?? '',
        note: prod.note ?? '',
        is_hidden: prod.is_hidden ?? 0,
        is_disabled: prod.is_disabled ?? 0,
      })
      setGenericQuery('') // will be resolved by generic_name_id lookup later
      setCategories(cats as ProductCategory[])
      setDrugTypes(dts as DrugType[])
      setDosageForms(dfs as DosageForm[])
      setItemUnits(units as ItemUnit[])
      setLabelFrequencies(freqs as any[])
      setLabelDosages(dosages as any[])
      setLabelMealRelations(meals as any[])
      setLabelTimes(times as any[])
      setLabelAdvices(advices as any[])
    } finally {
      setLoading(false)
    }
  }

  const setF = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }))

  // ---- Save general ----
  const handleSave = async () => {
    if (!form.trade_name?.trim()) { toast({ title: 'กรุณาระบุชื่อสินค้า', variant: 'error' }); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        drug_type_id: form.drug_type_id || null,
        dosage_form_id: form.dosage_form_id || null,
        drug_generic_name_id: form.drug_generic_name_id || null,
        price_retail: parseFloat(form.price_retail) || 0,
        price_wholesale1: parseFloat(form.price_wholesale1) || 0,
        price_wholesale2: parseFloat(form.price_wholesale2) || 0,
        cost_price: parseFloat(form.cost_price) || null,
        max_dispense_qty: form.max_dispense_qty !== '' ? parseFloat(form.max_dispense_qty) : null,
        sale_control_qty: form.sale_control_qty !== '' ? parseFloat(form.sale_control_qty) : null,
        barcode: form.barcode || null,
        barcode2: form.barcode2 || null,
        barcode3: form.barcode3 || null,
        barcode4: form.barcode4 || null,
        code: form.code || null,
        has_vat: form.is_vat,
        no_discount: form.is_not_discount,
      }
      await window.api.products.update(productId, payload)
      toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
      // Refresh product
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ---- Generic name search ----
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

  // ---- Unit dialog ----
  const openAddUnit = () => {
    setEditingUnit(null)
    setUnitForm({
      unit_id: itemUnits[0]?.id ?? 0,
      barcode: '',
      qty_per_base: 1,
      price_retail: form.price_retail ?? 0,
      price_wholesale1: 0,
      price_wholesale2: 0,
      is_base_unit: 0,
      is_for_sale: 1,
      is_for_purchase: 0,
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
      is_base_unit: u.is_base_unit,
      is_for_sale: u.is_for_sale,
      is_for_purchase: u.is_for_purchase,
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
          is_base_unit: unitForm.is_base_unit ? 1 : 0,
          is_for_sale: unitForm.is_for_sale ? 1 : 0,
          is_for_purchase: unitForm.is_for_purchase ? 1 : 0,
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
          is_base_unit: unitForm.is_base_unit ? 1 : 0,
          is_for_sale: unitForm.is_for_sale ? 1 : 0,
          is_for_purchase: unitForm.is_for_purchase ? 1 : 0,
        })
      }
      toast({ title: 'บันทึกหน่วยสำเร็จ', variant: 'success' })
      setUnitDialog(false)
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setUnitSaving(false)
    }
  }

  const handleDeleteUnit = async (unitId: number) => {
    try {
      await window.api.products.deleteUnit(unitId)
      toast({ title: 'ลบหน่วยสำเร็จ', variant: 'success' })
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  // ---- Label dialog ----
  const openAddLabel = () => {
    setEditingLabel(null)
    setLabelForm({
      label_name: '',
      dose_qty: '',
      dosage_id: 0,
      frequency_id: 0,
      timing_id: 0,
      label_time_id: 0,
      advice_id: 0,
      indication_th: '',
      indication_mm: '',
      indication_zh: '',
      note_th: '',
      note_mm: '',
      note_zh: '',
      show_barcode: 0,
      is_default: 0,
      is_active: 1,
      sort_order: 0,
    })
    setLabelDialog(true)
  }

  const openEditLabel = (l: ProductLabel) => {
    setEditingLabel(l)
    setLabelForm({
      label_name: l.label_name ?? '',
      dose_qty: l.dose_qty ?? '',
      dosage_id: l.dosage_id ?? 0,
      frequency_id: l.frequency_id ?? 0,
      timing_id: l.timing_id ?? 0,
      label_time_id: l.label_time_id ?? 0,
      advice_id: l.advice_id ?? 0,
      indication_th: l.indication_th ?? '',
      indication_mm: l.indication_mm ?? '',
      indication_zh: l.indication_zh ?? '',
      note_th: l.note_th ?? '',
      note_mm: l.note_mm ?? '',
      note_zh: l.note_zh ?? '',
      show_barcode: l.show_barcode ?? 0,
      is_default: l.is_default ?? 0,
      is_active: l.is_active ?? 1,
      sort_order: l.sort_order ?? 0,
    })
    setLabelDialog(true)
  }

  const handleSaveLabel = async () => {
    setLabelSaving(true)
    try {
      const payload: any = {
        product_id: productId,
        label_name: labelForm.label_name || null,
        dose_qty: labelForm.dose_qty !== '' ? parseFloat(labelForm.dose_qty) : null,
        dosage_id: Number(labelForm.dosage_id) || null,
        frequency_id: Number(labelForm.frequency_id) || null,
        timing_id: Number(labelForm.timing_id) || null,
        label_time_id: Number(labelForm.label_time_id) || null,
        advice_id: Number(labelForm.advice_id) || null,
        indication_th: labelForm.indication_th || null,
        indication_mm: labelForm.indication_mm || null,
        indication_zh: labelForm.indication_zh || null,
        note_th: labelForm.note_th || null,
        note_mm: labelForm.note_mm || null,
        note_zh: labelForm.note_zh || null,
        show_barcode: labelForm.show_barcode ? 1 : 0,
        is_default: labelForm.is_default ? 1 : 0,
        is_active: labelForm.is_active ? 1 : 0,
        sort_order: Number(labelForm.sort_order) || 0,
      }
      if (editingLabel) payload.id = editingLabel.id
      await window.api.products.saveLabel(payload)
      toast({ title: 'บันทึกฉลากสำเร็จ', variant: 'success' })
      setLabelDialog(false)
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setLabelSaving(false)
    }
  }

  const handleDeleteLabel = async (labelId: number) => {
    try {
      await window.api.products.deleteLabel(labelId)
      toast({ title: 'ลบฉลากสำเร็จ', variant: 'success' })
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast({ title: 'ลบไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">กำลังโหลด...</div>
  }
  if (!product) return null

  const setLF = (key: string, v: any) => setLabelForm((f: any) => ({ ...f, [key]: v }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-4 shrink-0">
        <button onClick={() => navigate('/products')} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{product.trade_name}</h1>
          <p className="text-xs text-muted-foreground">{product.code ?? ''} {product.barcode ? `· ${product.barcode}` : ''}</p>
        </div>
        {tab === 'general' && (
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 shrink-0">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="general">ข้อมูลทั่วไป</TabsTrigger>
            <TabsTrigger value="units">หน่วยนับ ({product.units?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="labels">ฉลากยา ({product.labels?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="lots">ล็อต ({product.lots?.length ?? 0})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">

        {/* ======================== TAB: GENERAL ======================== */}
        {tab === 'general' && (
          <div className="max-w-2xl space-y-6 pt-4">

            <div className="space-y-3">
              <SectionTitle>ข้อมูลพื้นฐาน</SectionTitle>
              <FieldRow label="ชื่อสินค้า" required>
                <Input value={form.trade_name} onChange={e => setF('trade_name', e.target.value)} />
              </FieldRow>
              <FieldRow label="ชื่อสำหรับพิมพ์">
                <Input value={form.name_for_print} onChange={e => setF('name_for_print', e.target.value)} placeholder="ถ้าว่างใช้ชื่อสินค้า" />
              </FieldRow>
              <FieldRow label="รหัสสินค้า">
                <Input value={form.code} onChange={e => setF('code', e.target.value)} placeholder="MED001" />
              </FieldRow>
              <FieldRow label="หมวดหมู่">
                <SelectField value={form.category_id} onChange={v => setF('category_id', Number(v))}>
                  <option value={0}>— ไม่ระบุ —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              </FieldRow>
              <FieldRow label="หน่วยนับหลัก">
                <Input value={form.unit_name} onChange={e => setF('unit_name', e.target.value)} placeholder="เม็ด, ซอง, ขวด" />
              </FieldRow>
              <FieldRow label="จำนวนเริ่มต้น">
                <Input type="number" value={form.default_qty} onChange={e => setF('default_qty', e.target.value)} className="w-24" min={1} />
              </FieldRow>
              <FieldRow label="คีย์เวิร์ดค้นหา">
                <Input value={form.search_keywords} onChange={e => setF('search_keywords', e.target.value)} placeholder="ชื่ออื่นๆ คั่นด้วยจุลภาค เช่น พารา,para,tylenol" />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>บาร์โค้ด</SectionTitle>
              <FieldRow label="บาร์โค้ด 1">
                <Input value={form.barcode} onChange={e => setF('barcode', e.target.value)} placeholder="8851234567890" />
              </FieldRow>
              <FieldRow label="บาร์โค้ด 2">
                <Input value={form.barcode2} onChange={e => setF('barcode2', e.target.value)} />
              </FieldRow>
              <FieldRow label="บาร์โค้ด 3">
                <Input value={form.barcode3} onChange={e => setF('barcode3', e.target.value)} />
              </FieldRow>
              <FieldRow label="บาร์โค้ด 4">
                <Input value={form.barcode4} onChange={e => setF('barcode4', e.target.value)} />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>ราคาและต้นทุน</SectionTitle>
              <FieldRow label="ราคาขายปลีก" required>
                <Input type="number" value={form.price_retail} onChange={e => setF('price_retail', e.target.value)} className="w-36" min={0} step="0.01" />
              </FieldRow>
              <FieldRow label="ราคาส่ง 1">
                <div className="flex items-center gap-3">
                  <Toggle checked={!!form.has_wholesale1} onChange={v => setF('has_wholesale1', v ? 1 : 0)} label="" />
                  {!!form.has_wholesale1 && (
                    <Input type="number" value={form.price_wholesale1} onChange={e => setF('price_wholesale1', e.target.value)} className="w-36" min={0} step="0.01" />
                  )}
                </div>
              </FieldRow>
              <FieldRow label="ราคาส่ง 2">
                <div className="flex items-center gap-3">
                  <Toggle checked={!!form.has_wholesale2} onChange={v => setF('has_wholesale2', v ? 1 : 0)} label="" />
                  {!!form.has_wholesale2 && (
                    <Input type="number" value={form.price_wholesale2} onChange={e => setF('price_wholesale2', e.target.value)} className="w-36" min={0} step="0.01" />
                  )}
                </div>
              </FieldRow>
              <FieldRow label="ราคาทุน">
                <Input type="number" value={form.cost_price} onChange={e => setF('cost_price', e.target.value)} className="w-36" min={0} step="0.01" placeholder="คำนวณอัตโนมัติจากล็อต" />
              </FieldRow>
              <FieldRow label="ตัวเลือก">
                <div className="flex flex-wrap gap-4">
                  <Toggle checked={!!form.is_vat} onChange={v => setF('is_vat', v ? 1 : 0)} label="มี VAT" />
                  <Toggle checked={!!form.is_not_discount} onChange={v => setF('is_not_discount', v ? 1 : 0)} label="ไม่รับส่วนลด" />
                  <Toggle checked={!!form.is_stock_item} onChange={v => setF('is_stock_item', v ? 1 : 0)} label="นับสต็อก" />
                </div>
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>ข้อมูลยา</SectionTitle>
              <FieldRow label="ประเภทยา">
                <SelectField value={form.drug_type_id} onChange={v => setF('drug_type_id', Number(v))}>
                  <option value={0}>— ไม่ระบุ —</option>
                  {drugTypes.map(d => <option key={d.id} value={d.id}>{d.name_th}</option>)}
                </SelectField>
              </FieldRow>
              <FieldRow label="รูปแบบยา">
                <SelectField value={form.dosage_form_id} onChange={v => setF('dosage_form_id', Number(v))}>
                  <option value={0}>— ไม่ระบุ —</option>
                  {dosageForms.map(d => <option key={d.id} value={d.id}>{d.name_th}</option>)}
                </SelectField>
              </FieldRow>
              <FieldRow label="ชื่อสามัญ">
                <div className="relative">
                  <Input
                    value={genericQuery}
                    onChange={e => handleGenericSearch(e.target.value)}
                    onFocus={() => setShowGenericSugg(true)}
                    onBlur={() => setTimeout(() => setShowGenericSugg(false), 200)}
                    placeholder="ค้นหาชื่อสามัญ..."
                  />
                  {form.drug_generic_name_id > 0 && !showGenericSugg && (
                    <div className="mt-1 text-xs text-muted-foreground">ID: {form.drug_generic_name_id}</div>
                  )}
                  {showGenericSugg && genericSuggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {genericSuggestions.map(g => (
                        <button key={g.id} type="button" onMouseDown={() => selectGeneric(g)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2">
                          <span className="flex-1">{g.name}</span>
                          {g.is_antibiotic ? <Badge variant="warning" className="text-xs">ยาปฏิชีวนะ</Badge> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FieldRow>
              <FieldRow label="ความแรง (strength)">
                <Input value={form.strength} onChange={e => setF('strength', e.target.value)} placeholder="500mg, 5%" className="w-36" />
              </FieldRow>
              <FieldRow label="เลขทะเบียนยา">
                <Input value={form.registration_no} onChange={e => setF('registration_no', e.target.value)} placeholder="1A 12/55" />
              </FieldRow>
              <FieldRow label="TMT ID">
                <Input value={form.tmt_id} onChange={e => setF('tmt_id', e.target.value)} />
              </FieldRow>
              <FieldRow label="คุณสมบัติ">
                <div className="flex flex-wrap gap-4">
                  <Toggle checked={!!form.is_original_drug} onChange={v => setF('is_original_drug', v ? 1 : 0)} label="ยาต้นแบบ" />
                  <Toggle checked={!!form.is_antibiotic} onChange={v => setF('is_antibiotic', v ? 1 : 0)} label="ยาปฏิชีวนะ" />
                  <Toggle checked={!!form.is_fda_report} onChange={v => setF('is_fda_report', v ? 1 : 0)} label="รายงาน อย." />
                  <Toggle checked={!!form.is_fda13_report} onChange={v => setF('is_fda13_report', v ? 1 : 0)} label="รายงาน อย.13" />
                </div>
              </FieldRow>
              <FieldRow label="ควบคุมการจ่าย">
                <div className="flex items-center gap-3">
                  <Toggle checked={!!form.is_sale_control} onChange={v => setF('is_sale_control', v ? 1 : 0)} label="ควบคุม" />
                  {!!form.is_sale_control && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">สูงสุด/ครั้ง</span>
                      <Input type="number" value={form.sale_control_qty} onChange={e => setF('sale_control_qty', e.target.value)} className="w-24" min={0} />
                    </div>
                  )}
                </div>
              </FieldRow>
              <FieldRow label="จ่ายสูงสุด/ครั้ง">
                <Input type="number" value={form.max_dispense_qty} onChange={e => setF('max_dispense_qty', e.target.value)} className="w-24" min={0} />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>สต็อกและการแจ้งเตือน</SectionTitle>
              <FieldRow label="จุดสั่งซื้อ">
                <Input type="number" value={form.reorder_point} onChange={e => setF('reorder_point', e.target.value)} className="w-28" min={0} />
              </FieldRow>
              <FieldRow label="สต็อกปลอดภัย">
                <Input type="number" value={form.safety_stock} onChange={e => setF('safety_stock', e.target.value)} className="w-28" min={0} />
              </FieldRow>
              <FieldRow label="แจ้งเตือนหมดอายุ (วัน)">
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.expiry_alert_days1} onChange={e => setF('expiry_alert_days1', e.target.value)} className="w-20" min={0} />
                  <span className="text-muted-foreground">/</span>
                  <Input type="number" value={form.expiry_alert_days2} onChange={e => setF('expiry_alert_days2', e.target.value)} className="w-20" min={0} />
                  <span className="text-muted-foreground">/</span>
                  <Input type="number" value={form.expiry_alert_days3} onChange={e => setF('expiry_alert_days3', e.target.value)} className="w-20" min={0} />
                  <span className="text-xs text-muted-foreground">(เหลือง/ส้ม/แดง)</span>
                </div>
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>หมายเหตุและคำบรรยาย</SectionTitle>
              <FieldRow label="สรรพคุณ">
                <textarea
                  value={form.indication_note}
                  onChange={e => setF('indication_note', e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </FieldRow>
              <FieldRow label="ผลข้างเคียง">
                <textarea
                  value={form.side_effect_note}
                  onChange={e => setF('side_effect_note', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </FieldRow>
              <FieldRow label="หมายเหตุ">
                <textarea
                  value={form.note}
                  onChange={e => setF('note', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>สถานะ</SectionTitle>
              <FieldRow label="การมองเห็น">
                <div className="flex gap-4">
                  <Toggle checked={!!form.is_hidden} onChange={v => setF('is_hidden', v ? 1 : 0)} label="ซ่อนจากการค้นหา" />
                  <Toggle checked={!!form.is_disabled} onChange={v => setF('is_disabled', v ? 1 : 0)} label="ปิดการใช้งาน" />
                </div>
              </FieldRow>
            </div>
          </div>
        )}

        {/* ======================== TAB: UNITS ======================== */}
        {tab === 'units' && (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">หน่วยนับสำหรับซื้อ/ขายสินค้า</p>
              <Button size="sm" onClick={openAddUnit}>
                <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มหน่วย
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>หน่วย</TableHead>
                    <TableHead>บาร์โค้ด</TableHead>
                    <TableHead className="text-right">จำนวนต่อหน่วยหลัก</TableHead>
                    <TableHead className="text-right">ราคาปลีก</TableHead>
                    <TableHead className="text-right">ราคาส่ง 1</TableHead>
                    <TableHead className="text-center">ขาย</TableHead>
                    <TableHead className="text-center">ซื้อ</TableHead>
                    <TableHead className="text-center">หน่วยหลัก</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(product.units?.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">ยังไม่มีหน่วยนับ</TableCell>
                    </TableRow>
                  ) : product.units.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.unit_name ?? `Unit #${u.unit_id}`}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{u.barcode ?? '—'}</TableCell>
                      <TableCell className="text-right">{u.qty_per_base}</TableCell>
                      <TableCell className="text-right">{formatCurrency(u.price_retail)}</TableCell>
                      <TableCell className="text-right">{u.price_wholesale1 > 0 ? formatCurrency(u.price_wholesale1) : '—'}</TableCell>
                      <TableCell className="text-center">{u.is_for_sale ? '✓' : '—'}</TableCell>
                      <TableCell className="text-center">{u.is_for_purchase ? '✓' : '—'}</TableCell>
                      <TableCell className="text-center">{u.is_base_unit ? <Badge variant="secondary" className="text-xs">หลัก</Badge> : '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditUnit(u)}><Edit2 className="w-3.5 h-3.5" /></Button>
                          {!u.is_base_unit && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteUnit(u.id)} className="text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ======================== TAB: LABELS ======================== */}
        {tab === 'labels' && (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">ฉลากยาสำหรับพิมพ์</p>
              <Button size="sm" onClick={openAddLabel}>
                <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มฉลาก
              </Button>
            </div>
            <div className="space-y-3">
              {(product.labels?.length ?? 0) === 0 ? (
                <div className="text-center text-muted-foreground py-12 border border-border rounded-lg">ยังไม่มีฉลาก</div>
              ) : product.labels.map(l => (
                <div key={l.id} className="border border-border rounded-lg p-4 hover:bg-muted/20">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {l.label_name && <span className="font-medium">{l.label_name}</span>}
                        {l.is_default ? <Badge variant="success" className="text-xs">ค่าเริ่มต้น</Badge> : null}
                        {!l.is_active ? <Badge variant="secondary" className="text-xs">ปิดใช้งาน</Badge> : null}
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        {l.dosage_name && <span>ปริมาณ: {l.dosage_name}</span>}
                        {l.frequency_name && <span>ความถี่: {l.frequency_name}</span>}
                        {l.timing_name && <span>เวลา: {l.timing_name}</span>}
                      </div>
                      {l.indication_th && <p className="text-sm mt-1">{l.indication_th}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openEditLabel(l)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteLabel(l.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================== TAB: LOTS ======================== */}
        {tab === 'lots' && (
          <div className="pt-4">
            <p className="text-sm text-muted-foreground mb-3">ประวัติล็อตสินค้าทั้งหมด</p>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot No.</TableHead>
                    <TableHead>ใบรับ</TableHead>
                    <TableHead>ผู้จัดจำหน่าย</TableHead>
                    <TableHead className="text-center">วันหมดอายุ</TableHead>
                    <TableHead className="text-right">รับเข้า</TableHead>
                    <TableHead className="text-right">คงเหลือ</TableHead>
                    <TableHead className="text-right">ราคาทุน</TableHead>
                    <TableHead className="text-center">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(product.lots?.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">ยังไม่มีล็อต</TableCell>
                    </TableRow>
                  ) : product.lots.map(lot => {
                    const expStatus = getExpiryStatus(lot.expiry_date, form.expiry_alert_days1, form.expiry_alert_days2, form.expiry_alert_days3)
                    return (
                      <TableRow key={lot.id}>
                        <TableCell className="font-mono text-sm">{lot.lot_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lot.invoice_no ?? '—'}</TableCell>
                        <TableCell className="text-sm">{lot.supplier_name ?? '—'}</TableCell>
                        <TableCell className="text-center text-sm">
                          <span className={
                            expStatus === 'expired' ? 'text-destructive font-medium' :
                            expStatus === 'danger' ? 'text-warning-strong font-medium' :
                            expStatus === 'warning' ? 'text-warning' : ''
                          }>
                            {formatExpiry(lot.expiry_date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{lot.qty_received}</TableCell>
                        <TableCell className="text-right font-medium">{lot.qty_on_hand}</TableCell>
                        <TableCell className="text-right">{formatCurrency(lot.cost_price)}</TableCell>
                        <TableCell className="text-center">
                          {lot.is_cancelled
                            ? <Badge variant="destructive" className="text-xs">ยกเลิก</Badge>
                            : lot.is_closed
                            ? <Badge variant="secondary" className="text-xs">ปิด</Badge>
                            : lot.qty_on_hand === 0
                            ? <Badge variant="secondary" className="text-xs">หมด</Badge>
                            : <Badge variant="success" className="text-xs">ใช้งาน</Badge>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* ======================== UNIT DIALOG ======================== */}
      <Dialog open={unitDialog} onOpenChange={setUnitDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingUnit ? 'แก้ไขหน่วยนับ' : 'เพิ่มหน่วยนับ'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">หน่วยนับ <span className="text-destructive">*</span></label>
              <SelectField value={unitForm.unit_id ?? 0} onChange={v => setUnitForm((f: any) => ({ ...f, unit_id: Number(v) }))}>
                <option value={0}>— เลือกหน่วย —</option>
                {itemUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </SelectField>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">บาร์โค้ด</label>
              <Input value={unitForm.barcode ?? ''} onChange={e => setUnitForm((f: any) => ({ ...f, barcode: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">จำนวนต่อหน่วยหลัก</label>
              <Input type="number" value={unitForm.qty_per_base ?? 1} onChange={e => setUnitForm((f: any) => ({ ...f, qty_per_base: e.target.value }))} className="w-28" min={0.0001} step="0.0001" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">ราคาปลีก</label>
                <Input type="number" value={unitForm.price_retail ?? 0} onChange={e => setUnitForm((f: any) => ({ ...f, price_retail: e.target.value }))} min={0} step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ราคาส่ง 1</label>
                <Input type="number" value={unitForm.price_wholesale1 ?? 0} onChange={e => setUnitForm((f: any) => ({ ...f, price_wholesale1: e.target.value }))} min={0} step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ราคาส่ง 2</label>
                <Input type="number" value={unitForm.price_wholesale2 ?? 0} onChange={e => setUnitForm((f: any) => ({ ...f, price_wholesale2: e.target.value }))} min={0} step="0.01" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle checked={!!unitForm.is_base_unit} onChange={v => setUnitForm((f: any) => ({ ...f, is_base_unit: v ? 1 : 0 }))} label="หน่วยหลัก" />
              <Toggle checked={!!unitForm.is_for_sale} onChange={v => setUnitForm((f: any) => ({ ...f, is_for_sale: v ? 1 : 0 }))} label="ใช้ขาย" />
              <Toggle checked={!!unitForm.is_for_purchase} onChange={v => setUnitForm((f: any) => ({ ...f, is_for_purchase: v ? 1 : 0 }))} label="ใช้ซื้อ" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSaveUnit} disabled={unitSaving}>{unitSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================== LABEL DIALOG ======================== */}
      <Dialog open={labelDialog} onOpenChange={setLabelDialog}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'แก้ไขฉลาก' : 'เพิ่มฉลาก'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อฉลาก</label>
                <Input value={labelForm.label_name ?? ''} onChange={e => setLF('label_name', e.target.value)} placeholder="เช่น วิธีรับประทานมาตรฐาน" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ลำดับ</label>
                <Input type="number" value={labelForm.sort_order ?? 0} onChange={e => setLF('sort_order', e.target.value)} className="w-24" min={0} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">ปริมาณยา</label>
                <SelectField value={labelForm.dosage_id ?? 0} onChange={v => setLF('dosage_id', v)}>
                  <option value={0}>— เลือก —</option>
                  {labelDosages.map((d: any) => <option key={d.id} value={d.id}>{d.name_th}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ความถี่</label>
                <SelectField value={labelForm.frequency_id ?? 0} onChange={v => setLF('frequency_id', v)}>
                  <option value={0}>— เลือก —</option>
                  {labelFrequencies.map((f: any) => <option key={f.id} value={f.id}>{f.name_th}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เวลาเทียบมื้ออาหาร</label>
                <SelectField value={labelForm.timing_id ?? 0} onChange={v => setLF('timing_id', v)}>
                  <option value={0}>— เลือก —</option>
                  {labelMealRelations.map((m: any) => <option key={m.id} value={m.id}>{m.name_th}</option>)}
                </SelectField>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เวลาที่รับประทาน</label>
                <SelectField value={labelForm.label_time_id ?? 0} onChange={v => setLF('label_time_id', v)}>
                  <option value={0}>— เลือก —</option>
                  {labelTimes.map((t: any) => <option key={t.id} value={t.id}>{t.name_th}</option>)}
                </SelectField>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">คำแนะนำ</label>
              <SelectField value={labelForm.advice_id ?? 0} onChange={v => setLF('advice_id', v)}>
                <option value={0}>— เลือก —</option>
                {labelAdvices.map((a: any) => <option key={a.id} value={a.id}>{a.name_th}</option>)}
              </SelectField>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">สรรพคุณ (ไทย)</label>
              <textarea value={labelForm.indication_th ?? ''} onChange={e => setLF('indication_th', e.target.value)} rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">สรรพคุณ (ภาษาพม่า)</label>
                <textarea value={labelForm.indication_mm ?? ''} onChange={e => setLF('indication_mm', e.target.value)} rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">สรรพคุณ (ภาษาจีน)</label>
                <textarea value={labelForm.indication_zh ?? ''} onChange={e => setLF('indication_zh', e.target.value)} rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">หมายเหตุ (ไทย)</label>
              <textarea value={labelForm.note_th ?? ''} onChange={e => setLF('note_th', e.target.value)} rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle checked={!!labelForm.is_default} onChange={v => setLF('is_default', v ? 1 : 0)} label="ฉลากค่าเริ่มต้น" />
              <Toggle checked={!!labelForm.is_active} onChange={v => setLF('is_active', v ? 1 : 0)} label="เปิดใช้งาน" />
              <Toggle checked={!!labelForm.show_barcode} onChange={v => setLF('show_barcode', v ? 1 : 0)} label="แสดงบาร์โค้ด" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSaveLabel} disabled={labelSaving}>{labelSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
