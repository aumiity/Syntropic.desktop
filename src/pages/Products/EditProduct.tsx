import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch, Toggle } from '@/components/ui/switch'
import { MetricCard, SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { getCurrentUserId } from '@/stores/userStore'
import { formatCurrency, formatExpiry, getExpiryStatus } from '@/lib/utils'
import type { Product, ProductUnit, ProductLot, ProductLabel, ProductCategory, DrugType, ItemUnit } from '@/types'
import { DateInput } from '@/components/ui/date-input'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  ArrowLeft, Save, Plus, Trash2, Edit, ChevronDown, Check, X, AlertTriangle,
  Package, ScanBarcode, Tag, Pill, Boxes, FileText, Coins, Percent, EyeOff, Info,
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

// ========================
// MAIN COMPONENT
// ========================
// Required field keys for create + edit save validation
const REQUIRED_FIELDS = ['trade_name', 'unit_id', 'price_retail'] as const
const REQUIRED_LABEL: Record<string, string> = {
  trade_name: 'ชื่อสินค้า',
  unit_id: 'หน่วยหลัก',
  price_retail: 'ราคาขายปลีก',
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isNew = id === undefined
  const productId = Number(id)

  const [tab, setTab] = useState('general')
  const [product, setProduct] = useState<FullProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [priceWarning, setPriceWarning] = useState<string[]>([])
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [isDirty, setIsDirty] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

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
  // Lot edit confirm modal — extra step to prevent accidental saves
  const [confirmLot, setConfirmLot] = useState<ProductLot | null>(null)

  useEffect(() => {
    loadAll()
  }, [productId])


  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, cats, dts, units, freqs, dosages, meals, times, advices] = await Promise.all([
        isNew ? Promise.resolve(null) : window.api.products.get(productId),
        window.api.settings.allCategories(),
        window.api.settings.allDrugTypes(),
        window.api.settings.allUnits(),
        window.api.settings.listLabelFrequencies(),
        window.api.settings.listLabelDosages(),
        window.api.settings.listLabelMealRelations(),
        window.api.settings.listLabelTimes(),
        window.api.settings.listLabelAdvices(),
      ])
      setCategories(cats as ProductCategory[])
      setDrugTypes(dts as DrugType[])
      setItemUnits(units as ItemUnit[])
      setLabelFrequencies(freqs as any[])
      setLabelDosages(dosages as any[])
      setLabelMealRelations(meals as any[])
      setLabelTimes(times as any[])
      setLabelAdvices(advices as any[])

      if (isNew) {
        // Pre-select "ชิ้น" as the default base unit so users can save immediately.
        const defaultUnit = (units as ItemUnit[]).find(u => u.name === 'ชิ้น')
        setProduct({ id: 0, trade_name: '', units: [], lots: [], labels: [] } as unknown as FullProduct)
        setForm({
          trade_name: '', name_for_print: '', code: '',
          barcode: '', barcode2: '', barcode3: '', barcode4: '',
          category_id: 0,
          unit_id: defaultUnit?.id ?? 0,
          drug_type_id: 0, drug_generic_name_id: 0, tmt_id: '',
          price_retail: '', price_wholesale1: '', price_wholesale2: '', cost_price: '',
          has_wholesale1: 0, has_wholesale2: 0,
          is_vat: 0, is_drug: 0, is_stock_item: 1,
          reorder_point: 0, safety_stock: 0,
          is_antibiotic: 0,
          is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0,
          indication_note: '', side_effect_note: '', search_keywords: '', note: '',
          is_hidden: 0, is_disabled: 0,
        })
        setGenericQuery('')
        return
      }

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
        unit_id: prod.unit_id ?? 0,
        drug_type_id: prod.drug_type_id ?? 0,
        drug_generic_name_id: prod.drug_generic_name_id ?? 0,
        tmt_id: prod.tmt_id ?? '',
        price_retail: prod.price_retail ?? 0,
        price_wholesale1: prod.price_wholesale1 ?? 0,
        price_wholesale2: prod.price_wholesale2 ?? 0,
        // The editable cost field is the *pricing reference* = last cost paid
        // (last_cost_price), NOT the weighted-avg cost_price (which stays
        // auto-managed by stock flows and drives reports/valuation).
        cost_price: prod.last_cost_price ?? 0,
        has_wholesale1: prod.has_wholesale1 ?? 0,
        has_wholesale2: prod.has_wholesale2 ?? 0,
        is_vat: prod.has_vat ?? 0,
        is_drug: prod.is_drug ?? 0,
        is_stock_item: prod.is_stock_item ?? 1,
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
    } finally {
      setLoading(false)
    }
  }

  const setF = (key: string, value: any) => {
    setForm((f: any) => ({ ...f, [key]: value }))
    setIsDirty(true)
    setErrors(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Returns set of required field keys that are empty/invalid.
  // A "0" or empty string for price_retail counts as missing (a sellable product
  // must have a price). unit_id of 0 means "— เลือกหน่วย —" placeholder.
  const validate = (): Set<string> => {
    const missing = new Set<string>()
    if (!form.trade_name?.trim()) missing.add('trade_name')
    if (!form.unit_id || Number(form.unit_id) <= 0) missing.add('unit_id')
    const retail = parseFloat(form.price_retail)
    if (!form.price_retail || Number.isNaN(retail) || retail <= 0) missing.add('price_retail')
    return missing
  }

  // Browser-close / refresh guard. In-app navigation is intercepted at each
  // entry point (back arrow, post-save redirect handles itself).
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const goBack = () => {
    if (isDirty) { setShowLeaveConfirm(true); return }
    navigate('/products')
  }

  // ---- Save general ----
  const handleSave = async () => {
    const missing = validate()
    if (missing.size > 0) {
      setErrors(missing)
      const labels = REQUIRED_FIELDS.filter(k => missing.has(k)).map(k => REQUIRED_LABEL[k])
      toast({ title: 'กรุณากรอกข้อมูลที่จำเป็น', description: labels.join(', '), variant: 'error' })
      // Scroll to first missing field
      const first = REQUIRED_FIELDS.find(k => missing.has(k))
      if (first) {
        const el = document.querySelector(`[data-field="${first}"]`) as HTMLElement | null
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        ;(el?.querySelector('input, button') as HTMLElement | null)?.focus()
      }
      return
    }
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
      // products:update / products:create build dynamic SQL from Object.keys(data); any
      // non-column key aborts with "no such column". Strip UI-only / renamed keys here.
      // cost_price is pulled out of `rest`: the edited value is the pricing
      // reference and must land in last_cost_price, NEVER overwrite the
      // auto-managed weighted-avg cost_price column.
      const {
        is_vat,
        drug_generic_name_id, has_wholesale1, has_wholesale2,
        cost_price: _editedCost,
        ...rest
      } = form
      void _editedCost
      const lastCost = parseFloat(form.cost_price) || 0
      const payload = {
        ...rest,
        category_id: form.category_id || null,
        drug_type_id: form.drug_type_id || null,
        price_retail: parseFloat(form.price_retail) || 0,
        price_wholesale1: parseFloat(form.price_wholesale1) || 0,
        price_wholesale2: parseFloat(form.price_wholesale2) || 0,
        last_cost_price: lastCost,
        barcode: form.barcode || null,
        barcode2: form.barcode2 || null,
        barcode3: form.barcode3 || null,
        barcode4: form.barcode4 || null,
        code: form.code || null,
        has_vat: is_vat ? 1 : 0,
        // 0 = "— เลือกหน่วย —" placeholder; coerce to null so the FK doesn't reject the save
        unit_id: form.unit_id || null,
      }
      if (isNew) {
        // products.code is auto-generated by the backend — don't send our empty value.
        // is_hidden / is_disabled are not part of the products:create INSERT (they
        // default to 0 in schema); strip to avoid superfluous bindings.
        const { code, is_hidden, is_disabled, ...createPayload } = payload as any
        void code; void is_hidden; void is_disabled
        // No lots yet → seed the weighted-avg cost_price from the entered
        // value too (recomputed automatically once stock is received).
        const created = await window.api.products.create({ ...createPayload, cost_price: lastCost }) as any
        setIsDirty(false)
        toast({ title: 'เพิ่มสินค้าสำเร็จ', variant: 'success' })
        navigate(`/products/${created.id}/edit`, { replace: true })
        return
      }
      await window.api.products.update(productId, payload)
      setIsDirty(false)
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

  // "Check" button on the lot row — validates and opens the confirm modal.
  // If nothing actually changed, just exit edit mode (no modal, no IPC call).
  const handleSaveLot = () => {
    if (!editingLotId) return

    // Validate qty/cost explicitly — never silently coerce blank/NaN to 0.
    // `parseFloat('') || 0` would turn an accidentally cleared field into an
    // adjust_out that wipes stock to zero (or sets cost to 0), with no undo.
    if (lotEditForm.qty_on_hand.trim() === '' || Number.isNaN(parseFloat(lotEditForm.qty_on_hand)) || parseFloat(lotEditForm.qty_on_hand) < 0) {
      toast({ title: 'กรุณาระบุจำนวนคงเหลือที่ถูกต้อง', variant: 'error' })
      return
    }
    if (lotEditForm.cost_price.trim() === '' || Number.isNaN(parseFloat(lotEditForm.cost_price)) || parseFloat(lotEditForm.cost_price) < 0) {
      toast({ title: 'กรุณาระบุราคาทุนที่ถูกต้อง', variant: 'error' })
      return
    }

    const lot = product?.lots?.find(l => l.id === editingLotId)
    if (!lot) return

    if (getLotEditChanges(lot).length === 0) {
      setEditingLotId(null)
      return
    }
    setConfirmLot(lot)
  }

  // Diff for the confirm modal — only includes fields whose value actually changed.
  const getLotEditChanges = (lot: ProductLot) => {
    const changes: { label: string; before: string; after: string }[] = []
    if ((lot.lot_number ?? '') !== lotEditForm.lot_number) {
      changes.push({ label: 'Lot No.', before: lot.lot_number || '—', after: lotEditForm.lot_number || '—' })
    }
    if ((lot.expiry_date ?? '') !== lotEditForm.expiry_date) {
      changes.push({
        label: 'วันหมดอายุ',
        before: lot.expiry_date ? formatExpiry(lot.expiry_date) : '—',
        after: lotEditForm.expiry_date ? formatExpiry(lotEditForm.expiry_date) : '—',
      })
    }
    const oldMfg = (lot as any).manufactured_date ?? ''
    if (oldMfg !== lotEditForm.manufactured_date) {
      changes.push({
        label: 'วันผลิต',
        before: oldMfg ? formatExpiry(oldMfg) : '—',
        after: lotEditForm.manufactured_date ? formatExpiry(lotEditForm.manufactured_date) : '—',
      })
    }
    const newQty = parseFloat(lotEditForm.qty_on_hand)
    if (Number(lot.qty_on_hand) !== newQty) {
      changes.push({ label: 'จำนวนคงเหลือ', before: String(lot.qty_on_hand), after: String(newQty) })
    }
    const newCost = parseFloat(lotEditForm.cost_price)
    if (Number(lot.cost_price) !== newCost) {
      changes.push({ label: 'ราคาทุน', before: formatCurrency(lot.cost_price), after: formatCurrency(newCost) })
    }
    return changes
  }

  const confirmSaveLot = async () => {
    if (!editingLotId) return
    setLotSaving(true)
    try {
      await window.api.products.updateLot(editingLotId, {
        lot_number: lotEditForm.lot_number || undefined,
        expiry_date: lotEditForm.expiry_date || null,
        manufactured_date: lotEditForm.manufactured_date || null,
        qty_on_hand: parseFloat(lotEditForm.qty_on_hand),
        cost_price: parseFloat(lotEditForm.cost_price),
        user_id: getCurrentUserId(),
      })
      toast({ title: 'บันทึกล็อตสำเร็จ', variant: 'success' })
      setConfirmLot(null)
      setEditingLotId(null)
      const updated = await window.api.products.get(productId) as FullProduct
      setProduct(updated)
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
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
  const baseUnit = product.unit_name ?? itemUnits.find(u => u.id === product.unit_id)?.name ?? '—'
  const categoryName = categories.find(c => c.id === product.category_id)?.name
  // Pricing glance → margin vs last cost paid (last_cost_price), not the
  // weighted avg. Avoids underpricing when cost has risen.
  const refCost = product.last_cost_price ?? 0
  const profit = (product.price_retail ?? 0) - refCost
  const profitPct = refCost > 0 ? (profit / refCost) * 100 : 0
  const updatedShort = (product as any).updated_at ? String((product as any).updated_at).slice(0, 10) : null

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader
        title={isNew ? 'เพิ่มสินค้าใหม่' : 'สินค้า'}
        right={
          <>
            {tab === 'general' ? (
              <>
                <Button variant="primary-soft" onClick={goBack}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  ย้อนกลับ
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-1.5" />
                  {saving ? 'กำลังบันทึก...' : isNew ? 'เพิ่มสินค้า' : 'บันทึก'}
                </Button>
              </>
            ) : (
              <Button variant="primary-soft" onClick={goBack}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                ย้อนกลับ
              </Button>
            )}
          </>
        }
      />

      {/* 4 cards: meta + 3 stats. In create mode, MetricCards stay in place
          but are grayed out — values aren't meaningful until the product exists. */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {/* Meta card */}
        <div className="bg-card rounded-card p-4 shadow-card h-32 overflow-hidden relative flex flex-col">
          <span className={`absolute top-4 right-4 grid place-items-center size-11 rounded-xl bg-primary-soft text-primary ${isNew ? 'opacity-50' : ''}`}>
            <Info className="size-7" />
          </span>
          <div className="pr-14 min-w-0">
            <div
              className="text-base font-bold text-foreground leading-snug truncate"
              title={isNew ? 'สินค้าใหม่' : product.trade_name}
            >
              {isNew ? (form.trade_name?.trim() || 'สินค้าใหม่') : product.trade_name}
            </div>
            <div className="text-sm text-muted-foreground truncate mt-0.5">
              <span className="font-mono">{isNew ? '—' : (product.code ?? '—')}</span>
              <span className="mx-1.5">·</span>
              <span>{isNew ? 'รอบันทึก' : (categoryName ?? 'ไม่ระบุ')}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap min-h-[18px] mt-auto">
            <div className="flex items-center gap-1 flex-wrap">
              {!isNew && !!product.is_drug && <Badge variant="success" className="text-xs rounded-md px-1.5 py-0">ยา</Badge>}
              {!isNew && !!product.is_fda9 && <Badge variant="brand-soft" className="text-xs rounded-md px-1.5 py-0">ข.ย.9</Badge>}
              {!isNew && !!product.is_fda10 && <Badge variant="warm" className="text-xs rounded-md px-1.5 py-0">ข.ย.10</Badge>}
              {!isNew && !!product.is_fda11 && <Badge variant="destructive2" className="text-xs rounded-md px-1.5 py-0">ข.ย.11</Badge>}
              {!isNew && !!product.is_fda13 && <Badge variant="info-soft" className="text-xs rounded-md px-1.5 py-0">ข.ย.13</Badge>}
              {!isNew && !!product.is_hidden && <Badge variant="secondary" className="text-xs rounded-md px-1.5 py-0">ซ่อน</Badge>}
            </div>
            {!isNew && !!product.is_disabled && <Badge variant="destructive" className="text-xs rounded-md px-1.5 py-0">ปิดใช้งาน</Badge>}
          </div>
        </div>

        <MetricCard
          label="ราคาทุน (ล่าสุด)"
          value={isNew ? '—' : formatCurrency(product.last_cost_price)}
          sub={isNew
            ? undefined
            : [baseUnit ? `ต่อ ${baseUnit}` : null, `เฉลี่ย ${formatCurrency(product.cost_price)}`]
                .filter(Boolean).join(' · ')}
          icon={Coins}
          tint="warm"
          className={isNew ? 'opacity-50' : ''}
        />
        <MetricCard
          label="ราคาขาย"
          value={isNew ? '—' : formatCurrency(product.price_retail)}
          valueClassName={'text-foreground'}
          sub={!isNew && refCost > 0
            ? `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${profit >= 0 ? '+' : ''}${profitPct.toFixed(0)}%)`
            : undefined}
          subClassName={profit >= 0 ? 'text-success font-semibold' : 'text-destructive font-semibold'}
          icon={Tag}
          tint="success"
          className={isNew ? 'opacity-50' : ''}
        />
        <MetricCard
          label="คงเหลือ"
          value={isNew ? '—' : totalStock.toLocaleString()}
          sub={isNew ? undefined : baseUnit}
          badge={!isNew && nearExpiryCount > 0
            ? <Badge variant="warning"><AlertTriangle className="size-3" /> ใกล้หมดอายุ {nearExpiryCount} ล็อต</Badge>
            : undefined}
          icon={Boxes}
          tint={isNew ? 'info-soft' : (totalStock <= 0 ? 'destructive' : 'info-soft')}
          className={isNew ? 'opacity-50' : ''}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-8 [scrollbar-gutter:stable]">
        <Tabs value={tab} onValueChange={setTab} className="items-center">
          <TabsList>
            <TabsTrigger value="general"><FileText /> ข้อมูลทั่วไป</TabsTrigger>
            <TabsTrigger value="units" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการหน่วยนับ' : undefined}>
              <Boxes /> หน่วยนับ ({(product.units?.length ?? 0) + 1})
            </TabsTrigger>
            <TabsTrigger value="labels" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการฉลากยา' : undefined}>
              <Pill /> ฉลากยา ({product.labels?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="lots" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการล็อต' : undefined}>
              <Package /> ล็อต ({product.lots?.length ?? 0})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ======================== TAB: GENERAL ======================== */}
        {tab === 'general' && (
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
        )}

        {/* ======================== TAB: UNITS ======================== */}
        {tab === 'units' && (
          <div className="pt-4">
            <div className="bg-card rounded-card shadow-card overflow-hidden">
              <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between h-12">
                <span>หน่วยนับสำหรับซื้อ/ขายสินค้า · <span className="text-foreground tabular-nums">{(product.units?.length ?? 0) + 1}</span> หน่วย</span>
                <Button onClick={openAddUnit} className="h-9 rounded-lg px-2 text-sm">
                  <Plus className="size-4" /> เพิ่มหน่วย
                </Button>
              </div>
              <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>หน่วย</TableHead>
                      <TableHead className="text-center">ตัวคูณ</TableHead>
                      <TableHead className="text-right">ราคาปลีก</TableHead>
                      <TableHead className="text-right">ราคาส่ง 1</TableHead>
                      <TableHead className="text-right">ราคาส่ง 2</TableHead>
                      <TableHead className="text-center">ขาย</TableHead>
                      <TableHead className="text-center">ซื้อ</TableHead>
                      <TableHead className="text-center">หน่วยหลัก</TableHead>
                      <TableHead className="text-center">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {/* Base unit row — sourced from the products table. Edited via General tab. */}
                  <TableRow className="bg-primary-soft/30 h-10">
                    <TableCell className="font-semibold text-sm">{baseUnit}</TableCell>
                    <TableCell className="text-center text-sm tabular-nums">1</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrency(product.price_retail ?? 0)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-muted-foreground">{(product.price_wholesale1 ?? 0) > 0 ? formatCurrency(product.price_wholesale1) : '—'}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-muted-foreground">{(product.price_wholesale2 ?? 0) > 0 ? formatCurrency(product.price_wholesale2) : '—'}</TableCell>
                    <TableCell className="text-center"><Check className="size-4 mx-auto text-success" /></TableCell>
                    <TableCell className="text-center"><Check className="size-4 mx-auto text-success" /></TableCell>
                    <TableCell className="text-center"><Badge variant="warm" className="text-xs rounded-md">หลัก</Badge></TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">แก้ไขที่แท็บข้อมูลทั่วไป</TableCell>
                  </TableRow>
                  {product.units?.map(u => (
                    <TableRow key={u.id} className={`hover:bg-primary-soft/60 transition-colors ${u.is_disabled ? 'opacity-60' : ''}`}>
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
                        {u.is_disabled
                          ? <Badge variant="danger" className="text-xs rounded-md">ปิดอยู่</Badge>
                          : <span className="text-foreground-subtle">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5 justify-center">
                          <Button className="w-16" size="icon-lg" variant="warm" onClick={() => openEditUnit(u)} title="แก้ไข">
                            <Edit />
                          </Button>
                          <Button className="w-16" size="icon-lg" variant="destructive2" onClick={() => handleDeleteUnit(u.id)} title="ลบ">
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <div className="px-5 py-2.5 border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-between">
                <span>ทั้งหมด <span className="font-semibold text-foreground tabular-nums">{(product.units?.length ?? 0) + 1}</span> หน่วย</span>
                <span>หน่วยหลัก: <span className="font-semibold text-foreground">{baseUnit}</span></span>
              </div>
            </div>
          </div>
        )}

        {/* ======================== TAB: LABELS ======================== */}
        {tab === 'labels' && (
          <div className="pt-4">
            <div className="bg-card rounded-card shadow-card overflow-hidden">
              <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between h-12 border-b">
                <span>ฉลากยาสำหรับพิมพ์ · <span className="text-foreground tabular-nums">{product.labels?.length ?? 0}</span> ฉลาก</span>
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
                              <Edit />
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
              <div className="px-5 py-2.5 border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-between h-12">
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
            <div className="bg-card rounded-card shadow-card overflow-hidden">
              <div className="px-5 py-2.5 text-sm font-semibold text-muted-foreground shrink-0 flex items-center gap-2 h-12">
                <Edit className="size-4 shrink-0" />
                <span>คลิกไอคอนแก้ไขเพื่อแก้ข้อมูลล็อตโดยตรง — การเปลี่ยนจำนวนคงเหลือจะบันทึกในประวัติการเคลื่อนไหวสต็อกอัตโนมัติ</span>
              </div>
              <div className="[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-36">Lot No.</TableHead>
                      <TableHead className="min-w-32">ผู้จัดจำหน่าย</TableHead>
                      <TableHead className="min-w-40">วันหมดอายุ</TableHead>
                      <TableHead className="min-w-24 text-right">รับเข้า</TableHead>
                      <TableHead className="min-w-28 text-right">คงเหลือ</TableHead>
                      <TableHead className="min-w-32 text-right">ราคาทุน</TableHead>
                      <TableHead className="min-w-24 text-center">สถานะ</TableHead>
                      <TableHead className="min-w-32 text-center">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {(product.lots?.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-16">
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
                              className="h-8 w-full rounded-lg text-sm font-mono bg-card" />
                          </TableCell>
                          {/* ผู้จัดจำหน่าย — read only */}
                          <TableCell className="text-sm">{(lot as any).supplier_name ?? '—'}</TableCell>
                          {/* วันหมดอายุ */}
                          <TableCell>
                            <DateInput value={lotEditForm.expiry_date}
                              onChange={v => setLotEditForm(f => ({ ...f, expiry_date: v }))}
                              className="h-8 w-full rounded-lg text-sm [&_input]:bg-card" />
                          </TableCell>
                          {/* รับเข้า — read only */}
                          <TableCell className="text-right text-sm tabular-nums">{lot.qty_received}</TableCell>
                          {/* คงเหลือ */}
                          <TableCell>
                            <Input type="number" value={lotEditForm.qty_on_hand}
                              onChange={e => setLotEditForm(f => ({ ...f, qty_on_hand: e.target.value }))}
                              className="h-8 w-full rounded-lg text-right text-sm tabular-nums bg-card" min={0} />
                          </TableCell>
                          {/* ราคาทุน */}
                          <TableCell>
                            <Input type="number" value={lotEditForm.cost_price}
                              onChange={e => setLotEditForm(f => ({ ...f, cost_price: e.target.value }))}
                              className="h-8 w-full rounded-lg text-right text-sm tabular-nums bg-card" min={0} step="0.01" />
                          </TableCell>
                          <TableCell />
                          {/* Save / Cancel */}
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button className="w-16" size="icon-lg" variant="success" onClick={handleSaveLot} disabled={lotSaving} title="บันทึก">
                                <Check />
                              </Button>
                              <Button className="w-16" size="icon-lg" variant="destructive" onClick={() => setEditingLotId(null)} disabled={lotSaving} title="ยกเลิก">
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
                        <TableCell className="text-sm">{(lot as any).supplier_name ?? '—'}</TableCell>
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
                              <Button className="w-16" size="icon-lg" variant="warm" onClick={() => startEditLot(lot)} title="แก้ไข">
                                <Edit />
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
              <div className="px-5 py-2.5 border-t border-border text-sm text-muted-foreground shrink-0 flex items-center justify-between h-12">
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
        <DialogContent size="4xl">
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
              const per = (u: string) => <span className="font-normal text-muted-foreground">ต่อ {u}</span>
              return (
                <div className="grid grid-cols-2 gap-5 items-start">
                  {/* ── ซ้าย: ข้อมูลหน่วย + ตัวเลือก ── */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="หน่วยนับ" required>
                        <Select value={String(unitForm.unit_id ?? 0)} onValueChange={v => setUnitForm((f: any) => ({ ...f, unit_id: Number(v) }))}>
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="— เลือกหน่วย —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">— เลือกหน่วย —</SelectItem>
                            {itemUnits.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="ขนาดบรรจุ">
                        <Input type="number" value={unitForm.qty_per_base ?? 1} onChange={e => setUnitForm((f: any) => ({ ...f, qty_per_base: e.target.value }))} className="text-right tabular-nums" min={0.0001} step="0.0001" />
                      </Field>
                    </div>
                    <Field label="บาร์โค้ด">
                      <Input value={unitForm.barcode ?? ''} onChange={e => setUnitForm((f: any) => ({ ...f, barcode: e.target.value }))} />
                    </Field>

                    {/* ตัวเลือกการใช้งาน */}
                    <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">ใช้ขาย</div>
                        <div className="text-xs text-muted-foreground">ใช้หน่วยนี้ในการขาย</div>
                      </div>
                      <Switch size="lg" checked={!!unitForm.is_for_sale} onCheckedChange={v => setUnitForm((f: any) => ({ ...f, is_for_sale: v ? 1 : 0 }))} />
                    </div>
                    <div className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">ใช้ซื้อ</div>
                        <div className="text-xs text-muted-foreground">ใช้หน่วยนี้ในการรับเข้าสต็อก</div>
                      </div>
                      <Switch size="lg" checked={!!unitForm.is_for_purchase} onCheckedChange={v => setUnitForm((f: any) => ({ ...f, is_for_purchase: v ? 1 : 0 }))} />
                    </div>
                    <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 border ${unitForm.is_disabled ? 'border-destructive/40 bg-destructive-soft/40' : 'border-border'}`}>
                      <div>
                        <div className="text-sm font-semibold text-foreground">ปิดการใช้งานหน่วยนี้</div>
                        <div className="text-xs text-muted-foreground">ซ่อนจาก POS ชั่วคราวโดยไม่ต้องลบ</div>
                      </div>
                      <Switch size="lg" checked={!!unitForm.is_disabled} onCheckedChange={v => setUnitForm((f: any) => ({ ...f, is_disabled: v ? 1 : 0 }))} />
                    </div>
                  </div>

                  {/* ── ขวา: ราคา + รายละเอียด ── */}
                  <div className="space-y-3">
                    {/* ราคาทุนปกติ (อ้างอิง) */}
                    <div className="rounded-lg bg-warm/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">ราคาทุนปกติ (อ้างอิง)</span>
                      <span className="text-sm font-bold text-warm-foreground tabular-nums">
                        {formatCurrency(baseCost)} {per(baseUnit)}
                      </span>
                    </div>

                    {/* ราคาปลีก + รายละเอียด */}
                    <Field label="ราคาปลีก">
                      <Input type="number" value={unitForm.price_retail ?? 0} onChange={e => setUnitForm((f: any) => ({ ...f, price_retail: e.target.value }))} className="text-right tabular-nums" min={0} step="0.01" />
                    </Field>
                    <div className="rounded-lg bg-success-soft/50 px-3 py-2 space-y-2 tabular-nums">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">ราคาทุน</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(unitCost)} {per(newUnit)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">คิดเป็น</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(retail.perPiece)} {per(baseUnit)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${retail.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไร</span>
                        {retail.dim ? (
                          <span className="text-sm text-foreground-subtle">—</span>
                        ) : (
                          <span className={`text-sm font-bold ${retail.pos ? 'text-success' : 'text-destructive'}`}>
                            {retail.pos ? '+' : ''}{retail.profit.toFixed(2)} ({retail.pos ? '+' : ''}{retail.pct.toFixed(0)}%) {per(newUnit)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ราคาส่ง 1 | ราคาส่ง 2 + รายละเอียดด้านล่าง */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="ราคาส่ง 1">
                        <Input type="number" value={unitForm.price_wholesale1 ?? 0} onChange={e => setUnitForm((f: any) => ({ ...f, price_wholesale1: e.target.value }))} className="text-right tabular-nums" min={0} step="0.01" />
                      </Field>
                      <Field label="ราคาส่ง 2">
                        <Input type="number" value={unitForm.price_wholesale2 ?? 0} onChange={e => setUnitForm((f: any) => ({ ...f, price_wholesale2: e.target.value }))} className="text-right tabular-nums" min={0} step="0.01" />
                      </Field>
                      {[ws1, ws2].map((d, i) => (
                        <div key={i} className="rounded-lg bg-success-soft/50 px-3 py-2 space-y-1.5 tabular-nums">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">คิดเป็น</span>
                            <span className="text-sm font-bold text-foreground">{formatCurrency(d.perPiece)} {per(baseUnit)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm ${d.dim ? 'text-foreground-subtle' : 'text-muted-foreground'}`}>กำไร</span>
                            {d.dim ? (
                              <span className="text-sm text-foreground-subtle">—</span>
                            ) : (
                              <span className={`text-sm font-bold ${d.pos ? 'text-success' : 'text-destructive'}`}>
                                {d.pos ? '+' : ''}{d.profit.toFixed(2)} ({d.pos ? '+' : ''}{d.pct.toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setUnitDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveUnit} disabled={unitSaving}>{unitSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
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
            <Button variant="destructive2" size="xl" onClick={() => setPriceWarning([])}>กลับไปแก้ไข</Button>
            <Button variant="destructive" size="xl" onClick={doSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================== LEAVE CONFIRM DIALOG ======================== */}
      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="text-xl">ยังไม่ได้บันทึก</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex gap-3">
              <AlertTriangle className="size-10 text-warning-strong shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-base font-medium">มีข้อมูลที่กรอกไว้แต่ยังไม่ได้บันทึก</p>
                <p className="text-base text-muted-foreground">หากออกตอนนี้ ข้อมูลทั้งหมดจะหายไป</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setShowLeaveConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="destructive" size="xl" onClick={() => { setShowLeaveConfirm(false); setIsDirty(false); navigate('/products') }}>
              ออกจากหน้านี้
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
              <Field label="ชื่อฉลาก">
                <Input value={labelForm.label_name ?? ''} onChange={e => setLF('label_name', e.target.value)} placeholder="เช่น วิธีรับประทานมาตรฐาน" />
              </Field>
              <Field label="ลำดับ">
                <Input type="number" value={labelForm.sort_order ?? 0} onChange={e => setLF('sort_order', e.target.value)} className="w-24" min={0} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="ปริมาณยา">
                <Select value={String(labelForm.dosage_id ?? 0)} onValueChange={v => setLF('dosage_id', v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="— เลือก —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— เลือก —</SelectItem>
                    {labelDosages.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name_th}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="ความถี่">
                <Select value={String(labelForm.frequency_id ?? 0)} onValueChange={v => setLF('frequency_id', v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="— เลือก —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— เลือก —</SelectItem>
                    {labelFrequencies.map((f: any) => <SelectItem key={f.id} value={String(f.id)}>{f.name_th}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="เวลาเทียบมื้ออาหาร">
                <Select value={String(labelForm.timing_id ?? 0)} onValueChange={v => setLF('timing_id', v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="— เลือก —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— เลือก —</SelectItem>
                    {labelMealRelations.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name_th}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="เวลาที่รับประทาน">
                <Select value={String(labelForm.label_time_id ?? 0)} onValueChange={v => setLF('label_time_id', v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="— เลือก —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— เลือก —</SelectItem>
                    {labelTimes.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name_th}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="คำแนะนำ">
              <Select value={String(labelForm.advice_id ?? 0)} onValueChange={v => setLF('advice_id', v)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="— เลือก —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— เลือก —</SelectItem>
                  {labelAdvices.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name_th}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="สรรพคุณ (ไทย)">
              <Textarea value={labelForm.indication_th ?? ''} onChange={e => setLF('indication_th', e.target.value)} rows={2} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="สรรพคุณ (ภาษาพม่า)">
                <Textarea value={labelForm.indication_mm ?? ''} onChange={e => setLF('indication_mm', e.target.value)} rows={2} />
              </Field>
              <Field label="สรรพคุณ (ภาษาจีน)">
                <Textarea value={labelForm.indication_zh ?? ''} onChange={e => setLF('indication_zh', e.target.value)} rows={2} />
              </Field>
            </div>

            <Field label="หมายเหตุ (ไทย)">
              <Textarea value={labelForm.note_th ?? ''} onChange={e => setLF('note_th', e.target.value)} rows={2} />
            </Field>

            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle size="lg" checked={!!labelForm.is_default} onChange={v => setLF('is_default', v ? 1 : 0)} label="ฉลากค่าเริ่มต้น" />
              <Toggle size="lg" checked={!!labelForm.is_active} onChange={v => setLF('is_active', v ? 1 : 0)} label="เปิดใช้งาน" />
              <Toggle size="lg" checked={!!labelForm.show_barcode} onChange={v => setLF('show_barcode', v ? 1 : 0)} label="แสดงบาร์โค้ด" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setLabelDialog(false)}>ยกเลิก</Button>
            <Button size="xl" onClick={handleSaveLabel} disabled={labelSaving}>{labelSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm lot edit — shows diff (before → after) for each changed field */}
      <Dialog open={!!confirmLot} onOpenChange={open => { if (!open && !lotSaving) setConfirmLot(null) }}>
        <DialogContent size="sm" onClose={() => { if (!lotSaving) setConfirmLot(null) }}>
          <DialogHeader>
            <DialogTitle className="text-xl">ยืนยันการแก้ไขล็อต</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {confirmLot && (
              <>
                <div className="bg-muted rounded-card px-4 py-3">
                  <div className="text-sm text-muted-foreground">ล็อต</div>
                  <div className="font-mono font-semibold text-sm">{confirmLot.lot_number}</div>
                </div>
                <div className="space-y-2">
                  {getLotEditChanges(confirmLot).map((c, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="w-28 shrink-0 text-muted-foreground">{c.label}</span>
                      <span className="text-foreground-subtle tabular-nums line-through">{c.before}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-semibold tabular-nums">{c.after}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  การแก้ไขจะถูกบันทึกในประวัติการเคลื่อนไหวสต็อกและไม่สามารถย้อนกลับได้ทันที
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive2" size="xl" onClick={() => setConfirmLot(null)} disabled={lotSaving}>ยกเลิก</Button>
            <Button size="xl" onClick={confirmSaveLot} disabled={lotSaving} autoFocus>
              {lotSaving ? 'กำลังบันทึก...' : 'ยืนยันการแก้ไข'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
