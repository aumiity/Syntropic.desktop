import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MetricCard, StatCard, type MetricTint } from '@/components/ui/card'
import { Package, Boxes } from 'lucide-react'

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

  const ctx = useMemo<ProductsOutletContext>(() => ({ setSummary }), [])

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader title="สินค้า" />

      {summary && summary.length > 0 && (
        <div className={`grid grid-cols-2 ${COLS_BY_COUNT[summary.length] ?? 'md:grid-cols-3'} gap-3 shrink-0`}>
          {summary.map((c, i) => c.onClick
            ? <StatCard key={i} label={c.label} value={c.value} icon={c.icon} tint={c.tint} onClick={c.onClick} isActive={c.isActive} />
            : <MetricCard key={i} {...c} />)}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={v => {
          const t = TABS.find(x => x.value === v)
          if (t) navigate(t.path)
        }}
        className="shrink-0 items-center"
      >
        <TabsList>
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value}>
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0 flex flex-col [scrollbar-gutter:stable]">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
