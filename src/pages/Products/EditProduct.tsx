import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch, Toggle } from '@/components/ui/switch'
import { MetricCard, SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductUnit, ProductLot, ProductLabel, ProductCategory, DrugType, ItemUnit } from '@/types'
import { DateInput } from '@/components/ui/date-input'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  ArrowLeft, Save, Plus, Trash2, Edit2, ChevronDown, Check, X, AlertTriangle,
  Package, ScanBarcode, Tag, Pill, Boxes, FileText, HandCoins, Percent, EyeOff,
} from 'lucide-react'

// ---- Types ----
interface FullProduct extends Product {
  units: ProductUnit[]
  lots: ProductLot[]
  labels: ProductLabel[]
}

interface GenericNameSuggestion { id: number; name: string; is_antibiotic: number }

// ---- Helpers ----
const Field = FormField
const SelectField = NativeSelect

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
  const [priceWarning, setPriceWarning] = useState<string[]>([])

  // Dropdown data
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [drugTypes, setDrugTypes] = useState<DrugType[]>([])
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

  // Lot inline edit
  const [editingLotId, setEditingLotId] = useState<number | null>(null)
  const [lotEditForm, setLotEditForm] = useState<{
    lot_number: string; expiry_date: string; manufactured_date: string
    qty_on_hand: string; cost_price: string
  }>({ lot_number: '', expiry_date: '', manufactured_date: '', qty_on_hand: '', cost_price: '' })
  const [lotSaving, setLotSaving] = useState(false)

  useEffect(() => {
    loadAll()
  }, [productId])


  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, cats, dts, units, freqs, dosages, meals, times, advices] = await Promise.all([
        window.api.products.get(productId),
        window.api.settings.allCategories(),
        window.api.settings.allDrugTypes(),
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
        category_id: prod.category_id ?? 0,
        drug_type_id: prod.drug_type_id ?? 0,
        drug_generic_name_id: prod.drug_generic_name_id ?? 0,
        tmt_id: prod.tmt_id ?? '',
        price_retail: prod.price_retail ?? 0,
        price_wholesale1: prod.price_wholesale1 ?? 0,
        price_wholesale2: prod.price_wholesale2 ?? 0,
        cost_price: prod.cost_price ?? 0,
        has_wholesale1: prod.has_wholesale1 ?? 0,
        has_wholesale2: prod.has_wholesale2 ?? 0,
        is_vat: prod.has_vat ?? 0,
        is_drug: prod.is_drug ?? 0,
        is_stock_item: prod.is_stock_item ?? 1,
        default_qty: prod.default_qty ?? 1,
        reorder_point: prod.reorder_point ?? 0,
        safety_stock: prod.safety_stock ?? 0,
        is_antibiotic: prod.is_antibiotic ?? 0,
        is_fda9:  prod.is_fda9  ?? 0,
        is_fda10: prod.is_fda10 ?? 0,
        is_fda11: prod.is_fda11 ?? 0,
        is_fda13: prod.is_fda13 ?? 0,
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
    const cost = parseFloat(form.cost_price) || 0
    const retail = parseFloat(form.price_retail) || 0
    const ws1 = parseFloat(form.price_wholesale1) || 0
    const ws2 = parseFloat(form.price_wholesale2) || 0
    if (cost > 0) {
      const below = [
        retail > 0 && retail < cost ? 'ราคาปลีก' : null,
        ws1 > 0 && ws1 < cost ? 'ราคาส่ง 1' : null,
        ws2 > 0 && ws2 < cost ? 'ราคาส่ง 2' : null,
      ].filter(Boolean) as string[]
      if (below.length > 0) { setPriceWarning(below); return }
    }
    await doSave()
  }

  const doSave = async () => {
    setPriceWarning([])
    setSaving(true)
    try {
      // products:update builds dynamic SQL from Object.keys(data); any non-column key
      // aborts the UPDATE with "no such column". Strip UI-only / renamed keys here.
      const {
        is_vat,
        drug_generic_name_id, has_wholesale1, has_wholesale2, default_qty,
        ...rest
      } = form
      const payload = {
        ...rest,
        category_id: form.category_id || null,
        drug_type_id: form.drug_type_id || null,
        price_retail: parseFloat(form.price_retail) || 0,
        price_wholesale1: parseFloat(form.price_wholesale1) || 0,
        price_wholesale2: parseFloat(form.price_wholesale2) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        barcode: form.barcode || null,
        barcode2: form.barcode2 || null,
        barcode3: form.barcode3 || null,
        barcode4: form.barcode4 || null,
        code: form.code || null,
        has_vat: is_vat ? 1 : 0,
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
      if (editingUnit?.is_base_unit) {
        // Base unit: only the unit_id (display name) is editable; everything else
        // mirrors the products table or is locked by invariant.
        await window.api.products.updateUnit(editingUnit.id, {
          unit_id: Number(unitForm.unit_id),
        })
      } else if (editingUnit) {
        await window.api.products.updateUnit(editingUnit.id, {
          unit_id: Number(unitForm.unit_id),
          barcode: unitForm.barcode || null,
          qty_per_base: parseFloat(unitForm.qty_per_base) || 1,
          price_retail: parseFloat(unitForm.price_retail) || 0,
          price_wholesale1: parseFloat(unitForm.price_wholesale1) || 0,
          price_wholesale2: parseFloat(unitForm.price_wholesale2) || 0,
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

  const startEditLot = (lot: ProductLot) => {
    setEditingLotId(lot.id)
    setLotEditForm({
      lot_number: lot.lot_number ?? '',
      expiry_date: lot.expiry_date ?? '',
      manufactured_date: (lot as any).manufactured_date ?? '',
      qty_on_hand: String(lot.qty_on_hand ?? 0),
      cost_price: String(lot.cost_price ?? 0),
    })
  }

  const handleSaveLot = async () => {
    if (!editingLotId) return
    setLotSaving(true)
    try {
      await window.api.products.updateLot(editingLotId, {
        lot_number: lotEditForm.lot_number || undefined,
        expiry_date: lotEditForm.expiry_date || null,
        manufactured_date: lotEditForm.manufactured_date || null,
        qty_on_hand: parseFloat(lotEditForm.qty_on_hand) || 0,
        cost_price: parseFloat(lotEditForm.cost_price) || 0,
        user_id: getCurrentUserId(),
      })
      toast('บันทึกล็อตสำเร็จ', 'success')
      setEditingLotId(null)
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast(e?.message ?? 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setLotSaving(false)
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">กำลังโหลด...</div>
  }
  if (!product) return null

  const setLF = (key: string, v: any) => setLabelForm((f: any) => ({ ...f, [key]: v }))

  // ---- Derived stats for ProductInfoCard ----
  const activeLotList = (product.lots ?? []).filter(l => !l.is_cancelled)
  const totalStock = activeLotList.reduce((sum, l) => sum + (Number(l.qty_on_hand) || 0), 0)
  const nearExpiryCount = activeLotList.filter(l => {
    const status = getExpiryStatus(l.expiry_date)
    return status === 'warning' || status === 'danger' || status === 'expired'
  }).length
  const baseUnit = product.units?.find(u => u.is_base_unit)?.unit_name ?? '—'
  const categoryName = categories.find(c => c.id === product.category_id)?.name
  const profit = (product.price_retail ?? 0) - (product.cost_price ?? 0)
  const profitPct = (product.cost_price ?? 0) > 0
    ? (profit / product.cost_price!) * 100
    : 0
  const updatedShort = (product as any).updated_at ? String((product as any).updated_at).slice(0, 10) : null

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader
        title='สินค้า'
        right={
          <>
            <button onClick={() => navigate('/products')} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Button onClick={handleSave} disabled={saving || tab !== 'general'}
              className={tab !== 'general' ? 'invisible pointer-events-none' : ''}>
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </>
        }
      />

      {/* 4 cards: meta + 3 stats */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {/* Meta card */}
        <div className="bg-card rounded-2xl p-4 shadow-card h-32 overflow-hidden relative">
          <span className="absolute top-4 right-4 grid place-items-center size-11 rounded-xl bg-primary-soft text-primary">
            <Package className="size-7" />
          </span>
          <div className="pr-14 min-w-0">
            <div
              className="text-base font-bold text-foreground leading-snug truncate"
              title={product.trade_name}
            >
              {product.trade_name}
            </div>
            <div className="text-sm text-muted-foreground truncate mt-0.5">
              <span className="font-mono">{product.code ?? '—'}</span>
              <span className="mx-1.5">·</span>
              <span>{categoryName ?? 'ไม่ระบุ'}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap min-h-[18px] mt-6">
              {!!product.is_drug && <Badge variant="success" className="text-sm rounded-md px-1.5 py-0">ยา</Badge>}
              {!!product.is_disabled && <Badge variant="destructive" className="text-sm rounded-md px-1.5 py-0">ปิดใช้งาน</Badge>}
              {!!product.is_hidden && <Badge variant="secondary" className="text-sm rounded-md px-1.5 py-0">ซ่อน</Badge>}
            </div>
          </div>
        </div>

        <MetricCard
          label="ราคาทุน"
          value={formatCurrency(product.cost_price)}
          sub={baseUnit ? `ต่อ ${baseUnit}` : undefined}
          icon={Tag}
          tint="secondary"
        />
        <MetricCard
          label="ราคาขาย"
          value={formatCurrency(product.price_retail)}
          valueClassName={'text-foreground'}
          sub={(product.cost_price ?? 0) > 0
            ? `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${profit >= 0 ? '+' : ''}${profitPct.toFixed(0)}%)`
            : undefined}
          subClassName={profit >= 0 ? 'text-success font-semibold' : 'text-destructive font-semibold'}
          icon={HandCoins}
          tint="success"
        />
        <MetricCard
          label="คงเหลือ"
          value={totalStock.toLocaleString()}
          sub={baseUnit}
          icon={Boxes}
          tint={totalStock <= 0 ? 'destructive' : 'primary'}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]">
        <Tabs value={tab} onValueChange={setTab} className="items-center">
          <TabsList variant="segmented">
            <TabsTrigger value="general"><FileText /> ข้อมูลทั่วไป</TabsTrigger>
            <TabsTrigger value="units"><Boxes /> หน่วยนับ ({product.units?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="labels"><Pill /> ฉลากยา ({product.labels?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="lots"><Package /> ล็อต ({product.lots?.length ?? 0})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ======================== TAB: GENERAL ======================== */}
        {tab === 'general' && (
          <div className="grid grid-cols-2 gap-4 pt-4">

            {/* LEFT COLUMN */}
            <div className="space-y-4">

              <SectionCard icon={Package} title="ข้อมูลพื้นฐาน" tint="primary">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ชื่อสินค้า" required>
                    <Input value={form.trade_name} onChange={e => setF('trade_name', e.target.value)} className="h-10 rounded-xl" />
                  </Field>
                  <Field label="ชื่อสำหรับพิมพ์">
                    <Input value={form.name_for_print} onChange={e => setF('name_for_print', e.target.value)} placeholder="ถ้าว่างใช้ชื่อสินค้า" className="h-10 rounded-xl" />
                  </Field>
                  <Field label="รหัสสินค้า">
                    <Input value={form.code} readOnly className="h-10 rounded-xl bg-muted cursor-not-allowed" />
                  </Field>
                  <Field label="จำนวนเริ่มต้น">
                    <Input type="number" value={form.default_qty} onChange={e => setF('default_qty', e.target.value)} className="h-10 rounded-xl" min={1} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="หมวดหมู่">
                      <SelectField value={form.category_id} onChange={v => setF('category_id', Number(v))}>
                        <option value={0}>— ไม่ระบุ —</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </SelectField>
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="คีย์เวิร์ดค้นหา">
                      <Input
                        value={form.search_keywords}
                        onChange={e => setF('search_keywords', e.target.value)}
                        placeholder="ชื่ออื่นๆ คั่นด้วยจุลภาค เช่น พารา,para,tylenol"
                        className="h-10 rounded-xl"
                      />
                    </Field>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={Tag} title="ราคาและต้นทุน" tint="success">
                <div className="grid grid-cols-2 gap-3">

                  {/* col1 row1 */}
                  <div className="col-start-1 row-start-1">
                    <Field label="ราคาทุน">
                      <Input type="number" value={form.cost_price} onChange={e => setF('cost_price', e.target.value)}
                        className="h-10 rounded-xl text-right tabular-nums" min={0} step="0.01" placeholder="คำนวณจากล็อต" />
                    </Field>
                  </div>

                  {/* col1 row2 */}
                  <div className="col-start-1 row-start-2">
                    <Field label="ราคาขายปลีก" required>
                      <Input type="number" value={form.price_retail} onChange={e => setF('price_retail', e.target.value)}
                        className="h-10 rounded-xl text-right tabular-nums" min={0} step="0.01" />
                    </Field>
                  </div>

                  {/* col2 row1-2: สรุปกำไร */}
                  <div className="col-start-2 row-start-1 row-span-2 h-full space-y-1.5">
                    <span className="block text-sm font-semibold uppercase text-foreground">สรุปกำไร</span>
                    {(() => {
                      const cost = parseFloat(form.cost_price) || 0
                      const rows = [
                        { label: 'ปลีก', price: parseFloat(form.price_retail) || 0 },
                        { label: 'ส่ง 1', price: parseFloat(form.price_wholesale1) || 0 },
                        { label: 'ส่ง 2', price: parseFloat(form.price_wholesale2) || 0 },
                      ]
                      return (
                        <div className="h-[calc(100%-1.75rem)] rounded-xl bg-muted/50 px-3 py-2 flex flex-col">
                          {rows.map(r => {
                            const profit = r.price - cost
                            const pct = cost > 0 ? (profit / cost) * 100 : 0
                            const pos = profit >= 0
                            const dim = r.price <= 0 || cost <= 0
                            return (
                              <div key={r.label} className="flex-1 flex items-center justify-between tabular-nums">
                                <span className={`text-sm ${dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>{r.label}</span>
                                {dim ? (
                                  <span className="text-sm text-foreground-subtle">—</span>
                                ) : (
                                  <div className="text-right">
                                    <span className={`text-sm font-bold ${pos ? 'text-success' : 'text-destructive'}`}>
                                      {pos ? '+' : ''}{profit.toFixed(2)}
                                    </span>
                                    <span className={`ml-1 text-xs ${pos ? 'text-success' : 'text-destructive'}`}>
                                      ({pos ? '+' : ''}{pct.toFixed(0)}%)
                                    </span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>

                  {/* col1 row3: ส่ง 1 */}
                  <div className="col-start-1 row-start-3">
                    <Field label="ราคาส่ง 1">
                      <Input type="number" value={form.price_wholesale1} onChange={e => setF('price_wholesale1', e.target.value)}
                        className="h-10 rounded-xl text-right tabular-nums" min={0} step="0.01" />
                    </Field>
                  </div>

                  {/* col2 row3: ส่ง 2 */}
                  <div className="col-start-2 row-start-3">
                    <Field label="ราคาส่ง 2">
                      <Input type="number" value={form.price_wholesale2} onChange={e => setF('price_wholesale2', e.target.value)}
                        className="h-10 rounded-xl text-right tabular-nums" min={0} step="0.01" />
                    </Field>
                  </div>

                  {/* col1 row4: มี VAT */}
                  <div className="p-2 col-start-1 row-start-4 flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold uppercase text-foreground">มี VAT</div>
                      <div className="text-xs text-muted-foreground">บวก 7% เมื่อออกใบกำกับภาษี</div>
                    </div>
                    <Switch checked={!!form.is_vat} onCheckedChange={v => setF('is_vat', v ? 1 : 0)} />
                  </div>

                  {/* col2 row4: นับสต็อก */}
                  <div className="col-start-2 row-start-4 flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold uppercase text-foreground">นับสต็อก</div>
                      <div className="text-xs text-muted-foreground">ตัดสต็อกอัตโนมัติเมื่อขาย</div>
                    </div>
                    <Switch checked={!!form.is_stock_item} onCheckedChange={v => setF('is_stock_item', v ? 1 : 0)} />
                  </div>

                </div>
              </SectionCard>

              <SectionCard icon={FileText} title="หมายเหตุและคำบรรยาย" tint="secondary">
                <Field label="สรรพคุณ">
                  <textarea
                    value={form.indication_note}
                    onChange={e => setF('indication_note', e.target.value)}
                    rows={3}
                    className="w-full rounded-xl bg-input px-3 py-2 text-sm resize-none outline-none transition-all focus:ring-[2px] focus:ring-ring"
                  />
                </Field>
                <Field label="ผลข้างเคียง">
                  <textarea
                    value={form.side_effect_note}
                    onChange={e => setF('side_effect_note', e.target.value)}
                    rows={2}
                    className="w-full rounded-xl bg-input px-3 py-2 text-sm resize-none outline-none transition-all focus:ring-[2px] focus:ring-ring"
                  />
                </Field>
                <Field label="หมายเหตุ">
                  <textarea
                    value={form.note}
                    onChange={e => setF('note', e.target.value)}
                    rows={2}
                    className="w-full rounded-xl bg-input px-3 py-2 text-sm resize-none outline-none transition-all focus:ring-[2px] focus:ring-ring"
                  />
                </Field>
              </SectionCard>

            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-4">

              <SectionCard icon={ScanBarcode} title="บาร์โค้ด" tint="secondary">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="บาร์โค้ด 1">
                    <Input value={form.barcode} onChange={e => setF('barcode', e.target.value)} placeholder="8851234567890" className="h-10 rounded-xl" />
                  </Field>
                  <Field label="บาร์โค้ด 2">
                    <Input value={form.barcode2} onChange={e => setF('barcode2', e.target.value)} className="h-10 rounded-xl" />
                  </Field>
                  <Field label="บาร์โค้ด 3">
                    <Input value={form.barcode3} onChange={e => setF('barcode3', e.target.value)} className="h-10 rounded-xl" />
                  </Field>
                  <Field label="บาร์โค้ด 4">
                    <Input value={form.barcode4} onChange={e => setF('barcode4', e.target.value)} className="h-10 rounded-xl" />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard icon={Boxes} title="สต็อกและการแจ้งเตือน" tint="warning">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="จุดสั่งซื้อ">
                    <Input type="number" value={form.reorder_point} onChange={e => setF('reorder_point', e.target.value)} className="h-10 rounded-xl" min={0} />
                  </Field>
                  <Field label="สต็อกปลอดภัย">
                    <Input type="number" value={form.safety_stock} onChange={e => setF('safety_stock', e.target.value)} className="h-10 rounded-xl" min={0} />
                  </Field>
                </div>
                {nearExpiryCount > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-strong">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>มีล็อตใกล้หมดอายุ/หมดอายุแล้ว {nearExpiryCount} ล็อต — ดูที่แท็บล็อต</span>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                icon={Pill}
                title="ข้อมูลยา"
                tint="warning"
                right={
                  <Toggle
                    checked={!!form.is_drug}
                    onChange={v => {
                      setF('is_drug', v ? 1 : 0)
                      // ข.ย.9 (purchase report) is always tied to is_drug — every drug must be logged
                      setF('is_fda9', v ? 1 : 0)
                    }}
                    label="เป็นยาตามกฎหมาย"
                  />
                }
              >
                {!!form.is_drug ? (
                  <>
                    <Field label="ประเภทยา">
                      <SelectField
                        value={form.drug_type_id}
                        onChange={v => {
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
                        <option value={0}>— ไม่ระบุ —</option>
                        {drugTypes.map(d => <option key={d.id} value={d.id}>{d.name_th}</option>)}
                      </SelectField>
                    </Field>
                    <Field label="ชื่อสามัญ">
                      <div className="relative">
                        <Input
                          value={genericQuery}
                          onChange={e => handleGenericSearch(e.target.value)}
                          onFocus={() => setShowGenericSugg(true)}
                          onBlur={() => setTimeout(() => setShowGenericSugg(false), 200)}
                          placeholder="ค้นหาชื่อสามัญ..."
                          className="h-10 rounded-xl"
                        />
                        {form.drug_generic_name_id > 0 && !showGenericSugg && (
                          <div className="mt-1 text-xs text-muted-foreground">ID: {form.drug_generic_name_id}</div>
                        )}
                        {showGenericSugg && genericSuggestions.length > 0 && (
                          <div className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border border-border rounded-xl shadow-card max-h-48 overflow-y-auto">
                            {genericSuggestions.map(g => (
                              <button
                                key={g.id}
                                type="button"
                                onMouseDown={() => selectGeneric(g)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-primary-soft flex items-center gap-2"
                              >
                                <span className="flex-1">{g.name}</span>
                                {g.is_antibiotic ? <Badge variant="warning" className="text-xs">ยาปฏิชีวนะ</Badge> : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>
                    <Field label="TMT ID">
                      <Input value={form.tmt_id} onChange={e => setF('tmt_id', e.target.value)} className="h-10 rounded-xl" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      {/* ข.ย.9 — locked to is_drug, shown read-only */}
                      <div className="flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2 opacity-70">
                        <div>
                          <div className="text-sm font-semibold uppercase text-foreground">ข.ย.9</div>
                          <div className="text-xs text-muted-foreground">บัญชีการซื้อยา (อัตโนมัติ)</div>
                        </div>
                        <Switch checked={!!form.is_fda9} disabled />
                      </div>
                      {/* ข.ย.10 */}
                      <div className="flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold uppercase text-foreground">ข.ย.10</div>
                          <div className="text-xs text-muted-foreground">ขายยาควบคุมพิเศษ</div>
                        </div>
                        <Switch checked={!!form.is_fda10} onCheckedChange={v => setF('is_fda10', v ? 1 : 0)} />
                      </div>
                      {/* ข.ย.11 */}
                      <div className="flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold uppercase text-foreground">ข.ย.11</div>
                          <div className="text-xs text-muted-foreground">ขายยาอันตราย (ที่ อ.ย. กำหนด)</div>
                        </div>
                        <Switch checked={!!form.is_fda11} onCheckedChange={v => setF('is_fda11', v ? 1 : 0)} />
                      </div>
                      {/* ข.ย.13 */}
                      <div className="flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold uppercase text-foreground">ข.ย.13</div>
                          <div className="text-xs text-muted-foreground">ขายส่ง (เฉพาะร้านขายส่ง)</div>
                        </div>
                        <Switch checked={!!form.is_fda13} onCheckedChange={v => setF('is_fda13', v ? 1 : 0)} />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground px-1">เปิดสวิตช์ด้านบนเพื่อกรอกข้อมูลยา</p>
                )}
              </SectionCard>

              <SectionCard icon={EyeOff} title="สถานะ" tint="secondary">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold uppercase text-foreground">ซ่อน</div>
                      <div className="text-xs text-muted-foreground">ซ่อนจากการค้นหา</div>
                    </div>
                    <Switch checked={!!form.is_hidden} onCheckedChange={v => setF('is_hidden', v ? 1 : 0)} />
                  </div>
                  <div className="flex items-center justify-between gap-2 border border-border rounded-xl px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold uppercase text-foreground">ปิดใช้งาน</div>
                      <div className="text-xs text-muted-foreground">ปิดการใช้งานทั้งสินค้า</div>
                    </div>
                    <Switch checked={!!form.is_disabled} onCheckedChange={v => setF('is_disabled', v ? 1 : 0)} />
                  </div>
                </div>
              </SectionCard>

            </div>
          </div>
        )}

        {/* ======================== TAB: UNITS ======================== */}
        {tab === 'units' && (
          <div className="pt-4">
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
                <span>หน่วยนับสำหรับซื้อ/ขายสินค้า</span>
                <Button onClick={openAddUnit} className="h-9 rounded-lg px-2 text-sm">
                  <Plus className="size-4" /> เพิ่มหน่วย
                </Button>
              </div>
              <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
                <Table className="table-fixed">
                  <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted">
                    <TableRow>
                      <TableHead className="text-foreground-subtle">หน่วย</TableHead>
                      <TableHead className="w-16 text-center text-foreground-subtle">ตัวคูณ</TableHead>
                      <TableHead className="w-28 text-right text-foreground-subtle">ราคาปลีก</TableHead>
                      <TableHead className="w-28 text-right text-foreground-subtle">ราคาส่ง 1</TableHead>
                      <TableHead className="w-28 text-right text-foreground-subtle">ราคาส่ง 2</TableHead>
                      <TableHead className="w-16 text-center text-foreground-subtle">ขาย</TableHead>
                      <TableHead className="w-16 text-center text-foreground-subtle">ซื้อ</TableHead>
                      <TableHead className="w-24 text-center text-foreground-subtle">หน่วยหลัก</TableHead>
                      <TableHead className="w-32 text-center text-foreground-subtle">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {(product.units?.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
                        <Boxes className="size-10 mx-auto mb-2 opacity-30" />
                        ยังไม่มีหน่วยนับ
                      </TableCell>
                    </TableRow>
                  ) : product.units.map(u => (
                    <TableRow key={u.id} className="hover:bg-primary-soft/60 transition-colors">
                      <TableCell className="font-semibold text-sm">{u.unit_name ?? `Unit #${u.unit_id}`}</TableCell>
                      <TableCell className="text-center text-sm tabular-nums">{u.qty_per_base}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrency(u.price_retail)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-muted-foreground">{u.price_wholesale1 > 0 ? formatCurrency(u.price_wholesale1) : '—'}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-muted-foreground">{u.price_wholesale2 > 0 ? formatCurrency(u.price_wholesale2) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {u.is_for_sale ? <Check className="size-4 mx-auto text-success" /> : <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {u.is_for_purchase ? <Check className="size-4 mx-auto text-success" /> : <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {u.is_base_unit ? <Badge variant="secondary" className="text-xs rounded-md">หลัก</Badge> : <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button size="icon-xl" variant="outline" onClick={() => openEditUnit(u)} title="แก้ไข">
                            <Edit2 />
                          </Button>
                          {!u.is_base_unit && (
                            <Button size="icon-xl" variant="outline" onClick={() => handleDeleteUnit(u.id)} className="text-destructive hover:text-destructive" title="ลบ">
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground shrink-0 flex items-center justify-between">
                <span>ทั้งหมด <span className="font-semibold text-foreground tabular-nums">{product.units?.length ?? 0}</span> หน่วย</span>
                <span>หน่วยหลัก: <span className="font-semibold text-foreground">{baseUnit}</span></span>
              </div>
            </div>
          </div>
        )}

        {/* ======================== TAB: LABELS ======================== */}
        {tab === 'labels' && (
          <div className="pt-4">
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
                <span>ฉลากยาสำหรับพิมพ์</span>
                <Button onClick={openAddLabel} className="h-9 rounded-lg px-2 text-sm">
                  <Plus className="size-4" /> เพิ่มฉลาก
                </Button>
              </div>
              <div className="border-l-8 border-r-8 border-card">
                {(product.labels?.length ?? 0) === 0 ? (
                  <div className="text-center text-muted-foreground py-16">
                    <Pill className="size-10 mx-auto mb-2 opacity-30" />
                    ยังไม่มีฉลาก
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {product.labels.map(l => (
                      <div key={l.id} className="px-4 py-3 hover:bg-primary-soft/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {l.label_name && <span className="font-semibold text-sm">{l.label_name}</span>}
                              {l.is_default ? <Badge variant="success" className="text-xs rounded-md">ค่าเริ่มต้น</Badge> : null}
                              {!l.is_active ? <Badge variant="secondary" className="text-xs rounded-md">ปิดใช้งาน</Badge> : null}
                            </div>
                            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              {l.dosage_name && <span>ปริมาณ: {l.dosage_name}</span>}
                              {l.frequency_name && <span>ความถี่: {l.frequency_name}</span>}
                              {l.timing_name && <span>เวลา: {l.timing_name}</span>}
                            </div>
                            {l.indication_th && <p className="text-sm mt-1.5 text-foreground">{l.indication_th}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="icon-xl" variant="outline" onClick={() => openEditLabel(l)} title="แก้ไข">
                              <Edit2 />
                            </Button>
                            <Button size="icon-xl" variant="outline" onClick={() => handleDeleteLabel(l.id)} className="text-destructive hover:text-destructive" title="ลบ">
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground shrink-0 flex items-center justify-between">
                <span>ทั้งหมด <span className="font-semibold text-foreground tabular-nums">{product.labels?.length ?? 0}</span> ฉลาก</span>
                <span className="flex items-center gap-3">
                  <span>เปิดใช้งาน <span className="font-semibold text-success tabular-nums">{product.labels?.filter(l => l.is_active).length ?? 0}</span></span>
                  <span>ปิดใช้งาน <span className="font-semibold text-foreground tabular-nums">{product.labels?.filter(l => !l.is_active).length ?? 0}</span></span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ======================== TAB: LOTS ======================== */}
        {tab === 'lots' && (
          <div className="pt-4">
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center gap-2">
                <Edit2 className="size-4 shrink-0" />
                <span>คลิกไอคอนแก้ไขเพื่อแก้ข้อมูลล็อตโดยตรง — การเปลี่ยนจำนวนคงเหลือจะบันทึกในประวัติการเคลื่อนไหวสต็อกอัตโนมัติ</span>
              </div>
              <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
                <Table className="table-fixed">
                  <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted">
                    <TableRow>
                      <TableHead className="w-32 text-foreground-subtle">Lot No.</TableHead>
                      <TableHead className="w-32 text-foreground-subtle">ใบรับ</TableHead>
                      <TableHead className="text-foreground-subtle">ผู้จัดจำหน่าย</TableHead>
                      <TableHead className="w-28 text-foreground-subtle">วันผลิต</TableHead>
                      <TableHead className="w-28 text-foreground-subtle">วันหมดอายุ</TableHead>
                      <TableHead className="w-20 text-right text-foreground-subtle">รับเข้า</TableHead>
                      <TableHead className="w-20 text-right text-foreground-subtle">คงเหลือ</TableHead>
                      <TableHead className="w-28 text-right text-foreground-subtle">ราคาทุน</TableHead>
                      <TableHead className="w-24 text-center text-foreground-subtle">สถานะ</TableHead>
                      <TableHead className="w-28 text-center text-foreground-subtle">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {(product.lots?.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-16">
                        <Package className="size-10 mx-auto mb-2 opacity-30" />
                        ยังไม่มีล็อต
                      </TableCell>
                    </TableRow>
                  ) : product.lots.map(lot => {
                    const expStatus = getExpiryStatus(lot.expiry_date)
                    const isEditing = editingLotId === lot.id

                    if (isEditing) {
                      return (
                        <TableRow key={lot.id} className="bg-primary-soft/40">
                          {/* Lot No. */}
                          <TableCell>
                            <Input value={lotEditForm.lot_number} onChange={e => setLotEditForm(f => ({ ...f, lot_number: e.target.value }))}
                              className="h-9 w-28 rounded-lg text-sm font-mono" />
                          </TableCell>
                          {/* ใบรับ — read only */}
                          <TableCell className="text-xs text-muted-foreground">{lot.invoice_no ?? '—'}</TableCell>
                          {/* ผู้จัดจำหน่าย — read only */}
                          <TableCell className="text-sm">{(lot as any).supplier_name ?? '—'}</TableCell>
                          {/* วันผลิต */}
                          <TableCell>
                            <DateInput value={lotEditForm.manufactured_date}
                              onChange={v => setLotEditForm(f => ({ ...f, manufactured_date: v }))}
                              className="h-9 w-32 rounded-lg text-sm" />
                          </TableCell>
                          {/* วันหมดอายุ */}
                          <TableCell>
                            <DateInput value={lotEditForm.expiry_date}
                              onChange={v => setLotEditForm(f => ({ ...f, expiry_date: v }))}
                              className="h-9 w-32 rounded-lg text-sm" />
                          </TableCell>
                          {/* รับเข้า — read only */}
                          <TableCell className="text-right text-sm tabular-nums">{lot.qty_received}</TableCell>
                          {/* คงเหลือ */}
                          <TableCell>
                            <Input type="number" value={lotEditForm.qty_on_hand}
                              onChange={e => setLotEditForm(f => ({ ...f, qty_on_hand: e.target.value }))}
                              className="h-9 w-20 rounded-lg text-right text-sm tabular-nums" min={0} />
                          </TableCell>
                          {/* ราคาทุน */}
                          <TableCell>
                            <Input type="number" value={lotEditForm.cost_price}
                              onChange={e => setLotEditForm(f => ({ ...f, cost_price: e.target.value }))}
                              className="h-9 w-24 rounded-lg text-right text-sm tabular-nums" min={0} step="0.01" />
                          </TableCell>
                          <TableCell />
                          {/* Save / Cancel */}
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button size="icon-xl" variant="success" onClick={handleSaveLot} disabled={lotSaving} title="บันทึก">
                                <Check />
                              </Button>
                              <Button size="icon-xl" variant="outline" onClick={() => setEditingLotId(null)} disabled={lotSaving} title="ยกเลิก">
                                <X />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }

                    return (
                      <TableRow key={lot.id} className="hover:bg-primary-soft/60 transition-colors">
                        <TableCell className="font-mono text-sm font-semibold">{lot.lot_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lot.invoice_no ?? '—'}</TableCell>
                        <TableCell className="text-sm">{(lot as any).supplier_name ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(lot as any).manufactured_date ? formatExpiry((lot as any).manufactured_date) : '—'}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          <span className={
                            expStatus === 'expired' ? 'text-destructive font-semibold' :
                            expStatus === 'danger'  ? 'text-warning-strong font-semibold' :
                            expStatus === 'warning' ? 'text-warning' : ''
                          }>
                            {formatExpiry(lot.expiry_date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{lot.qty_received}</TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{lot.qty_on_hand}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatCurrency(lot.cost_price)}</TableCell>
                        <TableCell className="text-center">
                          {lot.is_cancelled
                            ? <Badge variant="destructive" className="text-xs rounded-md">ยกเลิก</Badge>
                            : lot.is_closed
                            ? <Badge variant="secondary" className="text-xs rounded-md">ปิด</Badge>
                            : lot.qty_on_hand === 0
                            ? <Badge variant="secondary" className="text-xs rounded-md">หมด</Badge>
                            : <Badge variant="success" className="text-xs rounded-md">ใช้งาน</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            {!lot.is_cancelled && (
                              <Button size="icon-xl" variant="outline" onClick={() => startEditLot(lot)} title="แก้ไข">
                                <Edit2 />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
              <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground shrink-0 flex items-center justify-between">
                <span>ทั้งหมด <span className="font-semibold text-foreground tabular-nums">{product.lots?.length ?? 0}</span> ล็อต</span>
                <span className="flex items-center gap-3">
                  <span>ใช้งาน <span className="font-semibold text-success tabular-nums">{activeLotList.length}</span></span>
                  <span>คงเหลือรวม <span className="font-semibold text-foreground tabular-nums">{totalStock.toLocaleString()}</span> {baseUnit}</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================== UNIT DIALOG ======================== */}
      <Dialog open={unitDialog} onOpenChange={setUnitDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingUnit?.is_base_unit ? 'แก้ไขหน่วยหลัก' : editingUnit ? 'แก้ไขหน่วยนับ' : 'เพิ่มหน่วยนับ'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">หน่วยนับ <span className="text-destructive">*</span></label>
              <SelectField value={unitForm.unit_id ?? 0} onChange={v => setUnitForm((f: any) => ({ ...f, unit_id: Number(v) }))}>
                <option value={0}>— เลือกหน่วย —</option>
                {itemUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </SelectField>
            </div>
            {editingUnit?.is_base_unit ? (
              <p className="text-xs text-muted-foreground">
                หน่วยหลักดึงราคา/บาร์โค้ดจากตัวสินค้าโดยอัตโนมัติ — แก้ไขได้ที่แท็บ "ข้อมูลทั่วไป"
              </p>
            ) : (
              <>
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
                  <Toggle checked={!!unitForm.is_for_sale} onChange={v => setUnitForm((f: any) => ({ ...f, is_for_sale: v ? 1 : 0 }))} label="ใช้ขาย" />
                  <Toggle checked={!!unitForm.is_for_purchase} onChange={v => setUnitForm((f: any) => ({ ...f, is_for_purchase: v ? 1 : 0 }))} label="ใช้ซื้อ" />
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialog(false)}>ยกเลิก</Button>
            <Button onClick={handleSaveUnit} disabled={unitSaving}>{unitSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================== PRICE WARNING DIALOG ======================== */}
      <Dialog open={priceWarning.length > 0} onOpenChange={() => setPriceWarning([])}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="text-xl">ราคาขายผิดปกติ</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex gap-3">
              <AlertTriangle className="size-10 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-base font-medium">{priceWarning.join(', ')} ต่ำกว่าราคาทุน</p>
                <p className="text-base text-muted-foreground">ยืนยันจะบันทึกข้อมูลนี้?</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="senary" onClick={() => setPriceWarning([])}>กลับไปแก้ไข</Button>
            <Button variant="destructive" onClick={doSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
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
