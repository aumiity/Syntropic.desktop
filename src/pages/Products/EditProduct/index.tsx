import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { AdjustStockDialog } from '@/components/dialogs/AdjustStockDialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import type { ProductCategory, DrugType, ItemUnit } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import {
  ArrowLeft, Save, AlertTriangle,
  Package, Tag, Pill, Boxes, FileText, Coins, Info,
  History,
} from 'lucide-react'
import { HistoryTab } from './HistoryTab'
import { LotsTab } from './LotsTab'
import { LabelsTab } from './LabelsTab'
import { UnitsTab } from './UnitsTab'
import { GeneralTab } from './GeneralTab'
import { PriceTab } from './PriceTab'
import {
  type FullProduct,
  REQUIRED_FIELDS,
  REQUIRED_LABEL,
} from './shared'

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
  const [adjustOpen, setAdjustOpen] = useState(false)

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
        return
      }

      if (!p) { navigate('/products'); return }
      const prod = p as FullProduct
      // Bundle products live on a different page — bounce so the user never
      // sees an EditProduct form filled with bundle-irrelevant fields.
      if ((prod as any).is_bundle === 1) {
        navigate(`/products/bundles/${productId}/edit`, { replace: true })
        return
      }
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
    } finally {
      setLoading(false)
    }
  }

  // Tabs call this after a successful mutation IPC to pull a fresh product.
  const refreshProduct = async () => {
    if (isNew) return
    const updated = await window.api.products.get(productId) as FullProduct
    setProduct(updated)
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
      // Scroll to first missing field. price_retail now lives on the "ราคา"
      // tab — switch there first so the highlighted field is actually visible,
      // then defer the scroll/focus until the tab content has rendered.
      const first = REQUIRED_FIELDS.find(k => missing.has(k))
      if (first) {
        const targetTab = first === 'price_retail' ? 'price' : 'general'
        setTab(targetTab)
        setTimeout(() => {
          const el = document.querySelector(`[data-field="${first}"]`) as HTMLElement | null
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ;(el?.querySelector('input, button') as HTMLElement | null)?.focus()
        }, 60)
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
      // Audit price changes BEFORE the generic update. products:update does a
      // raw UPDATE with no logging; products:updatePrice writes a price_logs
      // row and self-dedupes (reads current DB value, skips when unchanged) —
      // so it must run while the column still holds the old price.
      const priceNote = 'แก้ไขจากหน้าสินค้า'
      await Promise.all([
        window.api.products.updatePrice(productId, { price_type: 'retail', new_price: payload.price_retail, note: priceNote }),
        window.api.products.updatePrice(productId, { price_type: 'wholesale1', new_price: payload.price_wholesale1, note: priceNote }),
        window.api.products.updatePrice(productId, { price_type: 'wholesale2', new_price: payload.price_wholesale2, note: priceNote }),
      ])
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

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">กำลังโหลด...</div>
  }
  if (!product) return null

  // ---- Derived stats for ProductInfoCard ----
  const activeLotList = (product.lots ?? []).filter(l => !l.is_cancelled)
  const totalStock = activeLotList.reduce((sum, l) => sum + (Number(l.qty_on_hand) || 0), 0)
  const baseUnit = product.unit_name ?? itemUnits.find(u => u.id === product.unit_id)?.name ?? '—'
  const categoryName = categories.find(c => c.id === product.category_id)?.name
  // Pricing glance → margin vs last cost paid (last_cost_price), not the
  // weighted avg. Avoids underpricing when cost has risen.
  const refCost = product.last_cost_price ?? 0
  const profit = (product.price_retail ?? 0) - refCost
  const profitPct = refCost > 0 ? (profit / refCost) * 100 : 0
  const updatedShort = (product as any).updated_at ? String((product as any).updated_at).slice(0, 10) : null

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title={isNew ? 'เพิ่มสินค้าใหม่' : 'สินค้า'} />

      <TabStrip className="-mb-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="segmented" className="h-10">
            <TabsTrigger value="general"><FileText /> ข้อมูลทั่วไป</TabsTrigger>
            <TabsTrigger value="price"><Tag /> ราคา</TabsTrigger>
            <TabsTrigger value="units" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการหน่วยนับ' : undefined}>
              <Boxes /> หน่วยนับ ({(product.units?.length ?? 0) + 1})
            </TabsTrigger>
            <TabsTrigger value="labels" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการฉลากยา' : undefined}>
              <Pill /> ฉลากยา ({product.labels?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="lots" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการล็อต' : undefined}>
              <Package /> ล็อต ({product.lots?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="history" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อดูประวัติ' : undefined}>
              <History /> ความเคลื่อนไหว
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="primary-soft" size="lg" className="h-10 px-2" onClick={goBack}>
            <ArrowLeft className="size-4" /> ย้อนกลับ
          </Button>
          {(tab === 'general' || tab === 'price') && (
            <Button size="lg" className="h-10 px-3" onClick={handleSave} disabled={saving}>
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : isNew ? 'เพิ่มสินค้า' : 'บันทึก'}
            </Button>
          )}
        </div>
      </TabStrip>

      {(() => {
        // 4 cards: meta + 3 stats. In create mode, MetricCards stay in place
        // but are grayed out — values aren't meaningful until the product exists.
        const metricCardsGrid = (
          <div className="grid grid-cols-4 gap-3 shrink-0 pt-3">
            {/* Meta card — hand-rolled to match MetricCard size="sm" proportions */}
            <div className="bg-card rounded-card shadow-card border border-border px-4 py-2 flex items-center gap-3 overflow-hidden">
              <div className="flex flex-col min-w-0 flex-1 text-left">
                <div
                  className="text-base font-bold text-foreground truncate"
                  title={isNew ? 'สินค้าใหม่' : product.trade_name}
                >
                  {isNew ? (form.trade_name?.trim() || 'สินค้าใหม่') : product.trade_name}
                </div>
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="text-sm text-muted-foreground font-mono shrink-0">{isNew ? '—' : (product.code ?? '—')}</span>
                  <span className="text-sm text-muted-foreground shrink-0">·</span>
                  <span className="text-sm text-muted-foreground truncate">{isNew ? 'รอบันทึก' : (categoryName ?? 'ไม่ระบุ')}</span>
                  {!isNew && !!product.is_drug && <Badge variant="success" className="text-xs rounded-md px-1.5 py-0">ยา</Badge>}
                  {!isNew && !!product.is_fda9 && <Badge variant="brand-soft" className="text-xs rounded-md px-1.5 py-0">ข.ย.9</Badge>}
                  {!isNew && !!product.is_fda10 && <Badge variant="warm" className="text-xs rounded-md px-1.5 py-0">ข.ย.10</Badge>}
                  {!isNew && !!product.is_fda11 && <Badge variant="destructive2" className="text-xs rounded-md px-1.5 py-0">ข.ย.11</Badge>}
                  {!isNew && !!product.is_fda13 && <Badge variant="info-soft" className="text-xs rounded-md px-1.5 py-0">ข.ย.13</Badge>}
                  {!isNew && !!product.is_hidden && <Badge variant="secondary" className="text-xs rounded-md px-1.5 py-0">ซ่อน</Badge>}
                  {!isNew && !!product.is_disabled && <Badge variant="destructive" className="text-xs rounded-md px-1.5 py-0">ปิดใช้งาน</Badge>}
                </div>
              </div>
              <span className={`grid place-items-center size-11 rounded-xl bg-primary-soft text-primary shrink-0 ${isNew ? 'opacity-50' : ''}`}>
                <Info className="size-7" />
              </span>
            </div>

            <MetricCard
              size="sm"
              label="ราคาทุน (ล่าสุด)"
              value={isNew ? '—' : formatCurrency(product.last_cost_price)}
              unit={isNew ? undefined : (baseUnit !== '—' ? `/ ${baseUnit}` : undefined)}
              sub={isNew ? undefined : `เฉลี่ย ${formatCurrency(product.cost_price)}`}
              icon={Coins}
              tint="warm"
              className={isNew ? 'opacity-50' : ''}
            />
            <MetricCard
              size="sm"
              label="ราคาขาย"
              value={isNew ? '—' : formatCurrency(product.price_retail)}
              valueClassName={'text-foreground'}
              unit={isNew ? undefined : (baseUnit !== '—' ? `/ ${baseUnit}` : undefined)}
              sub={!isNew && refCost > 0
                ? `กำไร ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${profit >= 0 ? '+' : ''}${profitPct.toFixed(0)}%)`
                : undefined}
              subClassName={profit < 0 ? 'text-destructive' : undefined}
              icon={Tag}
              tint="success"
              className={isNew ? 'opacity-50' : ''}
            />
            <MetricCard
              size="sm"
              label="คงเหลือ"
              value={isNew ? '—' : totalStock.toLocaleString()}
              unit={isNew ? undefined : (baseUnit !== '—' ? baseUnit : undefined)}
              sub={isNew ? undefined : 'คลิกเพื่อปรับสต็อก'}
              icon={Boxes}
              tint={isNew ? 'info-soft' : (totalStock <= 0 ? 'destructive' : 'info-soft')}
              onClick={isNew ? undefined : () => setAdjustOpen(true)}
              className={isNew ? 'opacity-50' : ''}
            />
          </div>
        )

        // Lots / History own internal table scroll → keep metric cards as a
        // shrink-0 sibling so the table fills the remaining height.
        if (tab === 'lots' || tab === 'history') {
          return (
            <>
              {metricCardsGrid}
              <div className="flex-1 min-h-0 flex flex-col">
                {tab === 'lots' ? (
                  <LotsTab
                    product={product}
                    productId={productId}
                    baseUnit={baseUnit}
                    onRefresh={refreshProduct}
                  />
                ) : (
                  <HistoryTab
                    productId={productId}
                    isNew={isNew}
                    active={tab === 'history'}
                  />
                )}
              </div>
            </>
          )
        }

        // Form tabs: one thin scrollbar scrolls metric cards + form together.
        return (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin [scrollbar-gutter:stable] pb-8 space-y-2">
            {metricCardsGrid}
            {tab === 'general' && (
              <GeneralTab
                form={form}
                setF={setF}
                setForm={setForm}
                errors={errors}
                categories={categories}
                drugTypes={drugTypes}
                itemUnits={itemUnits}
                productId={productId}
                isNew={isNew}
              />
            )}
            {tab === 'price' && (
              <PriceTab
                form={form}
                setF={setF}
                errors={errors}
                productId={productId}
                isNew={isNew}
                avgCost={product.cost_price ?? 0}
                baseUnit={baseUnit}
                reloadToken={(product as any).updated_at ?? ''}
              />
            )}
            {tab === 'units' && (
              <UnitsTab
                product={product}
                productId={productId}
                itemUnits={itemUnits}
                baseUnit={baseUnit}
                defaultPriceRetail={form.price_retail}
                onRefresh={refreshProduct}
              />
            )}
            {tab === 'labels' && (
              <LabelsTab
                product={product}
                productId={productId}
                labelFrequencies={labelFrequencies}
                labelDosages={labelDosages}
                labelMealRelations={labelMealRelations}
                labelTimes={labelTimes}
                labelAdvices={labelAdvices}
                onRefresh={refreshProduct}
              />
            )}
          </div>
        )
      })()}

      {/* ======================== ADJUST STOCK DIALOG ======================== */}
      <AdjustStockDialog
        target={adjustOpen && !isNew && product ? {
          id: productId,
          trade_name: product.trade_name,
          stock_qty: totalStock,
          unit_name: baseUnit,
        } : null}
        onClose={() => setAdjustOpen(false)}
        onSaved={async () => {
          const updated = await window.api.products.get(productId) as FullProduct
          setProduct(updated)
        }}
      />

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

    </div>
  )
}
