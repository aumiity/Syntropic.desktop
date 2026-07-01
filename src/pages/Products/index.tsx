import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Package, Boxes, Plus, Ban, Tags, LayoutGrid, ChevronDown } from 'lucide-react'

// Products page is a Tabs shell. Products AND bundles now share ONE unified list
// (ProductsList) — bundles are just products with is_bundle=1, so they live in
// the same table, split by a ประเภท filter. The summary cards up here double as
// that type filter (+ a disabled shortcut); ProductsList reads them via context.
const TABS = [
  { value: 'products', label: 'สินค้า',     icon: Package, path: '/products' },
  { value: 'print',    label: 'พิมพ์บาร์โค้ด/ป้ายราคา', icon: Tags, path: '/products/print' },
]

function resolveTab(pathname: string): string {
  if (pathname.startsWith('/products/print')) return 'print'
  return 'products'
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
}

type UsageFilter = 'all' | 'enabled' | 'disabled'
type TypeFilter = 'all' | 'product' | 'bundle'

export interface ProductsOutletContext {
  // Children call this after a mutation (toggle disabled, adjust stock, etc.)
  // to ask the shell to re-fetch the shared summary stats.
  refreshSummary: () => void
  // Usage-status + product-type filters are lifted to the shell so the summary
  // cards can drive them (click a card = filter, active = ring) and stay in sync
  // with the list's StatusFilterButton. ProductsList reads both.
  statusFilter: UsageFilter
  setStatusFilter: React.Dispatch<React.SetStateAction<UsageFilter>>
  typeFilter: TypeFilter
  setTypeFilter: React.Dispatch<React.SetStateAction<TypeFilter>>
}

interface GlobalStats {
  total_all: number
  disabled: number
}

export default function ProductsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const tab = resolveTab(location.pathname)
  // overflow-hidden is required during height animation to clip collapsing
  // content, but it also clips active-ring states (extends outside).
  // Flip overflow back to visible once the enter animation settles.
  const [animatingSummary, setAnimatingSummary] = useState(true)

  // Per-type snapshots (products vs bundles) — the merged list needs both counts
  // to build the ทั้งหมด/สินค้า/ชุด cards. stockStats pins is_stock_item=1 when
  // is_bundle is unset (excluding bundles), so we ask for each type explicitly.
  const [prodStats, setProdStats] = useState<GlobalStats>({ total_all: 0, disabled: 0 })
  const [bundleStats, setBundleStats] = useState<GlobalStats>({ total_all: 0, disabled: 0 })
  // Shared filters (see ProductsOutletContext). Not persisted — reset per session.
  const [statusFilter, setStatusFilter] = useState<UsageFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const refreshSummary = useCallback(() => {
    window.api.products.stockStats({ include_disabled: true, is_bundle: 0 })
      .then((s: any) => setProdStats(s ?? { total_all: 0, disabled: 0 }))
    window.api.products.stockStats({ include_disabled: true, is_bundle: 1 })
      .then((s: any) => setBundleStats(s ?? { total_all: 0, disabled: 0 }))
  }, [])

  useEffect(() => { refreshSummary() }, [refreshSummary])

  // Cards double as filters: ทั้งหมด/สินค้า/ชุด drive the type filter, ปิดการใช้งาน
  // drives the status filter. Clicking the active card (except ทั้งหมด) toggles
  // back to 'all'. Both facets can be active at once (e.g. ชุด + ปิดการใช้งาน).
  const pickType = (v: TypeFilter) => () =>
    setTypeFilter(cur => (cur === v && v !== 'all' ? 'all' : v))
  const pickStatus = (v: UsageFilter) => () =>
    setStatusFilter(cur => (cur === v && v !== 'all' ? 'all' : v))
  const summary = useMemo(() => {
    const totalAll = prodStats.total_all + bundleStats.total_all
    const disabledAll = prodStats.disabled + bundleStats.disabled
    return [
      { label: 'ทั้งหมด',     value: totalAll.toLocaleString(),                   icon: LayoutGrid, tint: 'primary'     as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground',                                    onClick: pickType('all'),        isActive: typeFilter === 'all' },
      { label: 'สินค้า',      value: prodStats.total_all.toLocaleString(),        icon: Package,    tint: 'info-soft'   as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground',                                    onClick: pickType('product'),    isActive: typeFilter === 'product' },
      { label: 'ชุดสินค้า',    value: bundleStats.total_all.toLocaleString(),      icon: Boxes,      tint: 'amber'       as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground',                                    onClick: pickType('bundle'),     isActive: typeFilter === 'bundle' },
      { label: 'ปิดการใช้งาน', value: disabledAll.toLocaleString(),                icon: Ban,        tint: 'destructive' as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground', onClick: pickStatus('disabled'), isActive: statusFilter === 'disabled' },
    ]
  }, [prodStats, bundleStats, typeFilter, statusFilter])

  const ctx = useMemo<ProductsOutletContext>(
    () => ({ refreshSummary, statusFilter, setStatusFilter, typeFilter, setTypeFilter }),
    [refreshSummary, statusFilter, typeFilter],
  )

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="สินค้า" />

      {/* Top row: segmented tabs (left) + add menu (right). The list now holds
          both types, so "เพิ่ม" is a split menu: สินค้า → EditProduct, ชุดสินค้า
          → EditBundle. */}
      <TabStrip className="-mb-2">
        <Tabs
          value={tab}
          onValueChange={v => {
            const t = TABS.find(x => x.value === v)
            if (t) navigate(t.path)
          }}
        >
          <TabsList variant="segmented">
            {TABS.map(t => (
              <TabsTrigger key={t.value} value={t.value}>
                <t.icon /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {tab !== 'print' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button className="ml-auto h-10 px-3">
                <Plus className="size-4" /> เพิ่ม <ChevronDown className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1 gap-0">
              <button type="button" onClick={() => navigate('/products/new')}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                <Package className="size-4" /> เพิ่มสินค้า
              </button>
              <button type="button" onClick={() => navigate('/products/bundles/new')}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-muted transition-colors">
                <Boxes className="size-4" /> เพิ่มชุดสินค้า
              </button>
            </PopoverContent>
          </Popover>
        )}
      </TabStrip>

      {tab !== 'print' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onAnimationStart={() => setAnimatingSummary(true)}
          onAnimationComplete={() => setAnimatingSummary(false)}
          className={`shrink-0 pt-3 ${animatingSummary ? 'overflow-hidden' : ''}`}
        >
          <div className={`grid grid-cols-2 ${COLS_BY_COUNT[summary.length] ?? 'md:grid-cols-3'} gap-3 p-0.5`}>
            {summary.map((c, i) => <MetricCard key={i} {...c} />)}
          </div>
        </motion.div>
      )}

      <div className="flex-1 min-h-0 flex flex-col [scrollbar-gutter:stable]">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
