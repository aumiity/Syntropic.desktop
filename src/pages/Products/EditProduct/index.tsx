import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AdjustStockDialog } from '@/components/dialogs/AdjustStockDialog'
import { useToast } from '@/components/ui/toast'
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { TintIcon } from '@/components/ui/tint-icon'
import { formatCurrency } from '@/lib/utils'
import type { ProductCategory, DrugType, ItemUnit } from '@/types'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import {
  ArrowLeft, Save,
  Package, Tag, Pill, FileText, Coins, Info,
  History, PackageOpen, Blocks,
} from 'lucide-react'
import { HistoryTab } from './HistoryTab'
import { LotsTab } from './LotsTab'
import { LabelsTab } from './LabelsTab'
import { UnitsTab } from './UnitsTab'
import { GeneralTab } from './GeneralTab'
import {
  type FullProduct,
  REQUIRED_FIELDS,
  REQUIRED_LABEL,
} from './shared'
import { usePublishDevTab } from '@/stores/devTabStore'

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  // location.key === 'default' means the user landed here via direct URL /
  // refresh — there's no history entry to pop back to, so we fall back to
  // /products. Otherwise navigate(-1) returns them to where they came from
  // (POS, sales report, dashboard, etc.).
  const backToOrigin = () => {
    if (location.key === 'default') navigate('/products')
    else navigate(-1)
  }
  const isNew = id === undefined
  const productId = Number(id)

  const [tab, setTab] = useState('general')
  usePublishDevTab(tab) // DEV ONLY — surfaces open sub-tab file in TitleBar path
  const [product, setProduct] = useState<FullProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const overridePrice = useManagerOverride()
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
          is_drug: 0, is_stock_item: 1,
          reorder_point: 0, safety_stock: 0,
          default_qty: 1,
          is_antibiotic: 0,
          is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0,
          search_keywords: '',
          is_disabled: 0,
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
        is_drug: prod.is_drug ?? 0,
        is_stock_item: prod.is_stock_item ?? 1,
        reorder_point: prod.reorder_point ?? 0,
        safety_stock: prod.safety_stock ?? 0,
        default_qty: prod.default_qty ?? 1,
        is_antibiotic: prod.is_antibiotic ?? 0,
        is_fda9:  prod.is_fda9  ?? 0,
        is_fda10: prod.is_fda10 ?? 0,
        is_fda11: prod.is_fda11 ?? 0,
        is_fda13: prod.is_fda13 ?? 0,
        search_keywords: prod.search_keywords ?? '',
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
    backToOrigin()
  }

  // ---- Save general ----
  const handleSave = async () => {
    const missing = validate()
    if (missing.size > 0) {
      setErrors(missing)
      const labels = REQUIRED_FIELDS.filter(k => missing.has(k)).map(k => REQUIRED_LABEL[k])
      toast({ title: 'กรุณากรอกข้อมูลที่จำเป็น', description: labels.join(', '), variant: 'error' })
      // Scroll to first missing field. All required fields (incl. price_retail)
      // now live on the General tab, so just switch there if we're elsewhere.
      const first = REQUIRED_FIELDS.find(k => missing.has(k))
      if (first) {
        setTab('general')
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
        // 0 = "— เลือกหน่วย —" placeholder; coerce to null so the FK doesn't reject the save
        unit_id: form.unit_id || null,
        // Starting cart qty in POS — never blank→0 (qty must be ≥1); fallback 1.
        default_qty: parseFloat(String(form.default_qty)) > 0 ? parseFloat(String(form.default_qty)) : 1,
      }
      if (isNew) {
        // products.code is auto-generated by the backend — don't send our empty value.
        // is_disabled is not part of the products:create INSERT (defaults to 0 in
        // schema); strip it + the auto-generated code to avoid superfluous bindings.
        const { code, is_disabled, ...createPayload } = payload as any
        void code; void is_disabled
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
      // row and self-dedupes — so it must run while the column still holds the
      // old price. updatePrice is admin-only (override): only call it for prices
      // that ACTUALLY changed, so a staff edit of non-price fields never trips
      // the override prompt unnecessarily.
      const priceNote = 'แก้ไขจากหน้าสินค้า'
      const priceChanges: Array<{ price_type: 'retail' | 'wholesale1' | 'wholesale2'; new_price: number }> = []
      if ((Number(product?.price_retail) || 0) !== payload.price_retail) priceChanges.push({ price_type: 'retail', new_price: payload.price_retail })
      if ((Number(product?.price_wholesale1) || 0) !== payload.price_wholesale1) priceChanges.push({ price_type: 'wholesale1', new_price: payload.price_wholesale1 })
      if ((Number(product?.price_wholesale2) || 0) !== payload.price_wholesale2) priceChanges.push({ price_type: 'wholesale2', new_price: payload.price_wholesale2 })

      const finishSave = async () => {
        setIsDirty(false)
        toast({ title: 'บันทึกสำเร็จ', variant: 'success' })
        const updated = await window.api.products.get(productId) as FullProduct
        setProduct(updated)
      }

      if (priceChanges.length > 0) {
        const mode = overridePrice.run(
          async (ov) => {
            await Promise.all(priceChanges.map(c =>
              window.api.products.updatePrice(productId, { ...c, note: priceNote }, ov)))
            await window.api.products.update(productId, payload)
          },
          {
            permKey: 'product.editPrice',
            title: 'แก้ไขราคาขาย',
            onDone: () => { setSaving(false); finishSave() },
            onError: (e: any) => { setSaving(false); toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }) },
          },
        )
        if (mode !== 'inline') setSaving(false)
        return
      }

      await window.api.products.update(productId, payload)
      await finishSave()
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

  // Full-bleed like Manage: page runs full width so the form scrollbar sits at the
  // window edge; CAP re-centers each region (header, tabs, metric cards, form body,
  // table tabs) at max-w-7xl so content + tables look unchanged.
  const CAP = 'w-full max-w-7xl mx-auto px-8'

  return (
    <div className="flex flex-col h-full pt-4 pb-4 gap-2">
      <div className={CAP}>
        <PageHeader title={isNew ? 'เพิ่มสินค้าใหม่' : 'สินค้า'} />
      </div>

      <div className={CAP}>
      <TabStrip className="-mb-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="segmented">
            <TabsTrigger value="general"><FileText /> ข้อมูลทั่วไป</TabsTrigger>
            <TabsTrigger value="units" disabled={isNew} title={isNew ? 'บันทึกสินค้าก่อนเพื่อจัดการหน่วยนับ' : undefined}>
              <Blocks /> หน่วยนับ ({(product.units?.length ?? 0) + 1})
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
          {tab === 'general' && (
            <Button size="lg" className="h-10 px-3" onClick={handleSave} disabled={saving}>
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : isNew ? 'เพิ่มสินค้า' : 'บันทึก'}
            </Button>
          )}
        </div>
      </TabStrip>
      </div>

      {(() => {
        // 4 cards: meta + 3 stats. In create mode, MetricCards stay in place
        // but are grayed out — values aren't meaningful until the product exists.
        const metricCardsGrid = (
          <div className={`shrink-0 pt-3 ${CAP}`}>
            <div className="grid grid-cols-4 gap-3 p-0.5">
            {/* Meta card — hand-rolled to match MetricCard default-size
                proportions (h-32, icon top-right). Custom layout because we
                need badges on their own row, which the MetricCard primitive
                doesn't model. */}
            <div className="bg-card rounded-card p-4 pt-3 shadow-card border border-border h-32 overflow-hidden relative">
              <TintIcon
                icon={Info}
                tint="primary"
                size="lg"
                bordered
                className={`absolute top-4 right-4 z-10 ${isNew ? 'opacity-50' : ''}`}
              />
              <div className="pr-10 min-w-0 relative z-10 h-full flex flex-col justify-start">
                <div
                  className="text-base font-bold text-foreground truncate"
                  title={isNew ? 'สินค้าใหม่' : product.trade_name}
                >
                  {isNew ? (form.trade_name?.trim() || 'สินค้าใหม่') : product.trade_name}
                </div>
                <div className="flex items-center gap-1.5 mt-1 min-w-0 text-sm h-[30px]">
                  <span className="text-muted-foreground shrink-0">{isNew ? '—' : (product.code ?? '—')}</span>
                  <span className="text-muted-foreground shrink-0">·</span>
                  <span className="text-muted-foreground truncate">{isNew ? 'รอบันทึก' : (categoryName ?? 'ไม่ระบุ')}</span>
                </div>
                <div className="flex items-center gap-1 mt-auto min-w-0 flex-wrap">
                  {!isNew && !!product.is_drug && <Badge variant="success-outline">ยา</Badge>}
                  {!isNew && !!product.is_fda9 && <Badge variant="primary-outline">ข.ย.9</Badge>}
                  {!isNew && !!product.is_fda10 && <Badge variant="amber-outline">ข.ย.10</Badge>}
                  {!isNew && !!product.is_fda11 && <Badge variant="destructive-outline">ข.ย.11</Badge>}
                  {!isNew && !!product.is_fda13 && <Badge variant="info-outline">ข.ย.13</Badge>}
                  {!isNew && !!product.is_disabled && <Badge variant="destructive-outline">ปิดใช้งาน</Badge>}
                </div>
              </div>
            </div>

            <MetricCard
              label="ราคาทุน (ล่าสุด)"
              value={isNew ? '—' : formatCurrency(product.last_cost_price)}
              unit={isNew ? undefined : (baseUnit !== '—' ? `/ ${baseUnit}` : undefined)}
              sub={isNew ? undefined : `เฉลี่ย ${formatCurrency(product.cost_price)}`}
              icon={Coins}
              tint="amber"
              className={isNew ? 'opacity-50' : ''}
            />
            <MetricCard
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
              label="คงเหลือ"
              value={isNew ? '—' : totalStock.toLocaleString()}
              unit={isNew ? undefined : (baseUnit !== '—' ? baseUnit : undefined)}
              sub={isNew ? undefined : 'คลิกเพื่อปรับสต็อก'}
              icon={PackageOpen}
              tint={isNew ? 'info-soft' : (totalStock <= 0 ? 'destructive' : 'info-soft')}
              onClick={isNew ? undefined : () => setAdjustOpen(true)}
              className={isNew ? 'opacity-50' : ''}
            />
            </div>
          </div>
        )

        // Lots / History own internal table scroll → keep metric cards as a
        // shrink-0 sibling so the table fills the remaining height.
        if (tab === 'lots' || tab === 'history') {
          return (
            <>
              {metricCardsGrid}
              <div className={`flex-1 min-h-0 flex flex-col ${CAP}`}>
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
            <div className={CAP}>
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
          last_cost_price: product.last_cost_price,
        } : null}
        onClose={() => setAdjustOpen(false)}
        onSaved={async () => {
          const updated = await window.api.products.get(productId) as FullProduct
          setProduct(updated)
        }}
      />

      {/* ======================== PRICE WARNING DIALOG ======================== */}
      <ConfirmDialog
        open={priceWarning.length > 0}
        onOpenChange={(o) => { if (!o) setPriceWarning([]) }}
        variant="destructive"
        title="ราคาขายผิดปกติ"
        description={<>{priceWarning.join(', ')} ต่ำกว่าราคาทุน — ยืนยันจะบันทึกข้อมูลนี้?</>}
        cancelLabel="กลับไปแก้ไข"
        confirmLabel={saving ? 'กำลังบันทึก...' : 'บันทึก'}
        busy={saving}
        onConfirm={doSave}
      />

      {/* ======================== LEAVE CONFIRM DIALOG ======================== */}
      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        variant="destructive"
        title="ยังไม่ได้บันทึก"
        description="มีข้อมูลที่กรอกไว้แต่ยังไม่ได้บันทึก หากออกตอนนี้ข้อมูลทั้งหมดจะหายไป"
        cancelLabel="กลับไปแก้ไข"
        confirmLabel="ออกจากหน้านี้"
        onConfirm={() => { setShowLeaveConfirm(false); setIsDirty(false); backToOrigin() }}
      />
      {overridePrice.dialog}

    </div>
  )
}
