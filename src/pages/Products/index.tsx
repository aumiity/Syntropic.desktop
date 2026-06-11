import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { Package, Boxes, Plus, Ban, Check, Tags } from 'lucide-react'

// Products page is a Tabs shell — products vs bundles, each owns its own list
// component (ProductsList / BundlesList) with its own filters and IPC calls.
// Stat cards live up here in the shell; children push their stat set via
// outlet context (same pattern as Manage).
const TABS = [
  { value: 'products', label: 'สินค้า',     icon: Package, path: '/products' },
  { value: 'bundles',  label: 'ชุดสินค้า',  icon: Boxes,   path: '/products/bundles' },
  { value: 'print',    label: 'พิมพ์บาร์โค้ด/ป้ายราคา', icon: Tags, path: '/products/print' },
]

function resolveTab(pathname: string): string {
  if (pathname.startsWith('/products/bundles')) return 'bundles'
  if (pathname.startsWith('/products/print')) return 'print'
  return 'products'
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
}

export interface ProductsOutletContext {
  // Children call this after a mutation (toggle disabled, adjust stock, etc.)
  // to ask the shell to re-fetch the shared summary stats.
  refreshSummary: () => void
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

  // Shared global summary — same 4-card snapshot for both Products and
  // Bundles tabs (matches the original intent: one dashboard, two lists).
  // Lives here in the shell so the cards don't flicker on tab switch and
  // both children read the same source of truth.
  const [allStats, setAllStats] = useState<GlobalStats>({ total_all: 0, disabled: 0 })
  const [bundleCount, setBundleCount] = useState(0)

  const refreshSummary = useCallback(() => {
    window.api.products.stockStats({ include_disabled: true })
      .then((s: any) => setAllStats(s ?? { total_all: 0, disabled: 0 }))
    window.api.products.stockStats({ include_disabled: true, is_bundle: 1 })
      .then((s: any) => setBundleCount(s?.total_all ?? 0))
  }, [])

  useEffect(() => { refreshSummary() }, [refreshSummary])

  const summary = useMemo(() => [
    { label: 'ทั้งหมด',     value: allStats.total_all.toLocaleString(),                       icon: Package, tint: 'primary'   as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground' },
    { label: 'เปิดใช้งาน',   value: (allStats.total_all - allStats.disabled).toLocaleString(), icon: Check,   tint: 'success'   as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    { label: 'ปิดการใช้งาน', value: allStats.disabled.toLocaleString(),                        icon: Ban,     tint: 'destructive' as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground', valueClassName: 'text-foreground' },
    { label: 'ชุดสินค้า',    value: bundleCount.toLocaleString(),                              icon: Boxes,   tint: 'info-soft' as MetricTint, sub: 'รายการ', subClassName: 'text-base text-foreground' },
  ], [allStats, bundleCount])

  const ctx = useMemo<ProductsOutletContext>(() => ({ refreshSummary }), [refreshSummary])

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="สินค้า" />

      {/* Top row: segmented tabs (left) + add button (right). Add button label
          and target route depend on the active tab. */}
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
          <Button
            onClick={() => navigate(tab === 'bundles' ? '/products/bundles/new' : '/products/new')}
            className="ml-auto h-10 px-3"
          >
            <Plus className="size-4" /> {tab === 'bundles' ? 'เพิ่มชุดสินค้า' : 'เพิ่มสินค้า'}
          </Button>
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
