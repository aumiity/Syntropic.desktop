import React, { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard, type MetricTint } from '@/components/ui/card'
import { Receipt, CalendarClock, PackagePlus, PackageX, PackageMinus } from 'lucide-react'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'

// Phase 1: ประวัติการขาย + ใกล้หมดอายุ. Phase 2: + ประวัติการซื้อ.
// Phase 3: + ต่ำกว่าจุดสั่งซื้อ. See PROGRESS.md.
const TABS = [
  { value: 'sales',          to: '/manage',                label: 'ประวัติการขาย', icon: Receipt },
  { value: 'purchases',      to: '/manage/purchases',      label: 'ประวัติการซื้อ', icon: PackagePlus },
  { value: 'low-stock',      to: '/manage/low-stock',      label: 'ต่ำกว่าจุดสั่งซื้อ', icon: PackageX },
  { value: 'expiry',         to: '/manage/expiry',         label: 'ใกล้หมดอายุ',   icon: CalendarClock },
  { value: 'negative-stock', to: '/manage/negative-stock', label: 'สต๊อคติดลบ',    icon: PackageMinus },
] as const

type TabValue = typeof TABS[number]['value']

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/manage/expiry')) return 'expiry'
  if (pathname.startsWith('/manage/purchases')) return 'purchases'
  if (pathname.startsWith('/manage/low-stock')) return 'low-stock'
  if (pathname.startsWith('/manage/negative-stock')) return 'negative-stock'
  return 'sales'
}

export interface ManageSummaryCard {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tint: MetricTint
  // When set, the card renders as a clickable StatCard filter shortcut
  // (active = ring) instead of a passive MetricCard.
  onClick?: () => void
  isActive?: boolean
}

export interface ManageOutletContext {
  setSummary: (cards: ManageSummaryCard[] | null) => void
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
}

export default function ManageLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = resolveTab(location.pathname)
  const [summary, setSummary] = useState<ManageSummaryCard[] | null>(null)
  // overflow-hidden is required during height animation to clip collapsing
  // content, but it also clips the StatCard active-ring (extends 2px outside).
  // Flip overflow back to visible once the enter animation settles.
  const [animatingSummary, setAnimatingSummary] = useState(true)
  const negativeStockCount = useNegativeStockBadge(s => s.count)

  // Drop summary the instant the tab changes so the new tab never paints with
  // the previous tab's cards. During-render reset (vs useEffect) avoids the
  // one-frame flash of stale data after route change.
  const [prevTab, setPrevTab] = useState(current)
  if (prevTab !== current) {
    setPrevTab(current)
    setSummary(null)
  }

  const ctx = useMemo<ManageOutletContext>(() => ({ setSummary }), [])

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ประวัติ & สต็อก" />

      <Tabs
        value={current}
        onValueChange={(v) => {
          const tab = TABS.find(t => t.value === v)
          if (tab) navigate(tab.to)
        }}
        className="shrink-0 self-start"
      >
        <TabsList>
          {TABS.map(({ value, label, icon: Icon }) => {
            const showBadge = value === 'negative-stock' && negativeStockCount > 0
            return (
              <TabsTrigger key={value} value={value}>
                <Icon className="size-4 mr-1.5" />
                <span className="relative inline-block">
                  {label}
                  {showBadge && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-2.5 h-2 w-2 rounded-full bg-warning ring-2 ring-card"
                    />
                  )}
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <AnimatePresence initial={false}>
        {summary && summary.length > 0 && (
          <motion.div
            key="manage-summary"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onAnimationStart={() => setAnimatingSummary(true)}
            onAnimationComplete={() => setAnimatingSummary(false)}
            className={`shrink-0 ${animatingSummary ? 'overflow-hidden' : ''}`}
          >
            {/* Inner AnimatePresence crossfades the card grid per tab.
                popLayout removes the exiting grid from flow so the new one
                takes the slot immediately — keeps Outlet stable below. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className={`grid grid-cols-2 md:grid-cols-3 ${COLS_BY_COUNT[summary.length] ?? 'xl:grid-cols-6'} gap-3 p-0.5`}
              >
                {summary.map((c, i) => (
                  <StatCard key={i} label={c.label} value={c.value} icon={c.icon} tint={c.tint} onClick={c.onClick} isActive={c.isActive} />
                ))}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <Outlet context={ctx} />
    </div>
  )
}
