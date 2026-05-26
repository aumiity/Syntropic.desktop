import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { MetricCard, StatCard, type MetricTint } from '@/components/ui/card'
import { Package, Boxes, Plus } from 'lucide-react'

// Products page is a Tabs shell — products vs bundles, each owns its own list
// component (ProductsList / BundlesList) with its own filters and IPC calls.
// Stat cards live up here in the shell; children push their stat set via
// outlet context (same pattern as Manage).
const TABS = [
  { value: 'products', label: 'สินค้า',     icon: Package, path: '/products' },
  { value: 'bundles',  label: 'ชุดสินค้า',  icon: Boxes,   path: '/products/bundles' },
]

function resolveTab(pathname: string): string {
  if (pathname.startsWith('/products/bundles')) return 'bundles'
  return 'products'
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
}

export interface ProductsSummaryCard {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tint: MetricTint
  // Clickable filter shortcut → StatCard (with ring on active);
  // omit onClick for a passive MetricCard.
  onClick?: () => void
  isActive?: boolean
}

export interface ProductsOutletContext {
  setSummary: (cards: ProductsSummaryCard[] | null) => void
}

export default function ProductsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const tab = resolveTab(location.pathname)
  const [summary, setSummary] = useState<ProductsSummaryCard[] | null>(null)
  // overflow-hidden is required during height animation to clip collapsing
  // content, but it also clips the StatCard active-ring (extends 2px outside).
  // Flip overflow back to visible once the enter animation settles.
  const [animatingSummary, setAnimatingSummary] = useState(true)

  // Drop summary the instant the tab changes so the new tab never paints with
  // the previous tab's cards. During-render reset (vs useEffect) avoids the
  // one-frame flash of stale data after route change.
  const [prevTab, setPrevTab] = useState(tab)
  if (prevTab !== tab) {
    setPrevTab(tab)
    setSummary(null)
  }

  const ctx = useMemo<ProductsOutletContext>(() => ({ setSummary }), [])

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="สินค้า" />

      {/* Top row: segmented tabs (left) + add button (right). Add button label
          and target route depend on the active tab. */}
      <div className="flex items-center gap-3 shrink-0">
        <Tabs
          value={tab}
          onValueChange={v => {
            const t = TABS.find(x => x.value === v)
            if (t) navigate(t.path)
          }}
        >
          <TabsList variant="segmented" className="h-10">
            {TABS.map(t => (
              <TabsTrigger key={t.value} value={t.value}>
                <t.icon /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          onClick={() => navigate(tab === 'bundles' ? '/products/bundles/new' : '/products/new')}
          className="ml-auto h-10 px-3"
        >
          <Plus className="size-4" /> {tab === 'bundles' ? 'เพิ่มชุดสินค้า' : 'เพิ่มสินค้า'}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {summary && summary.length > 0 && (
          <motion.div
            key="products-summary"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onAnimationStart={() => setAnimatingSummary(true)}
            onAnimationComplete={() => setAnimatingSummary(false)}
            className={`shrink-0 ${animatingSummary ? 'overflow-hidden' : ''}`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className={`grid grid-cols-2 ${COLS_BY_COUNT[summary.length] ?? 'md:grid-cols-3'} gap-3 p-0.5`}
              >
                {summary.map((c, i) => c.onClick
                  ? <StatCard key={i} label={c.label} value={c.value} icon={c.icon} tint={c.tint} onClick={c.onClick} isActive={c.isActive} />
                  : <MetricCard key={i} {...c} />)}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 flex flex-col [scrollbar-gutter:stable]">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
