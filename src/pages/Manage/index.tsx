import React, { useCallback, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { MetricCard, StatCard, type MetricTint } from '@/components/ui/card'
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
  // Override the auto-tinted value/sub color on passive MetricCard.
  valueClassName?: string
  subClassName?: string
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
  const [summaryState, setSummaryState] = useState<{ tab: TabValue; cards: ManageSummaryCard[] } | null>(null)
  // overflow-hidden is required during height animation to clip collapsing
  // content, but it also clips the StatCard active-ring (extends 2px outside).
  // Flip overflow back to visible once the enter animation settles.
  const [animatingSummary, setAnimatingSummary] = useState(true)
  const negativeStockCount = useNegativeStockBadge(s => s.count)

  const setSummary = useCallback((cards: ManageSummaryCard[] | null) => {
    const ownerTab = current
    setSummaryState(prev => {
      if (cards && cards.length > 0) return { tab: ownerTab, cards }
      return prev?.tab === ownerTab ? null : prev
    })
  }, [current])

  const ctx = useMemo<ManageOutletContext>(() => ({ setSummary }), [setSummary])
  const summary = summaryState?.tab === current ? summaryState.cards : null

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ประวัติ & สต็อก" />

      <TabStrip className="-mb-2">
        <Tabs
          value={current}
          onValueChange={(v) => {
            const tab = TABS.find(t => t.value === v)
            if (tab) navigate(tab.to)
          }}
        >
          <TabsList variant="segmented" className="h-10">
            {TABS.map(({ value, label, icon: Icon }) => {
              const showBadge = value === 'negative-stock' && negativeStockCount > 0
              return (
                <TabsTrigger key={value} value={value}>
                  <Icon />
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
      </TabStrip>

      {summary && summary.length > 0 && (
        <motion.div
          key={`manage-summary-${current}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onAnimationStart={() => setAnimatingSummary(true)}
          onAnimationComplete={() => setAnimatingSummary(false)}
          className={`shrink-0 pt-3 ${animatingSummary ? 'overflow-hidden' : ''}`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className={`grid grid-cols-2 md:grid-cols-3 ${COLS_BY_COUNT[summary.length] ?? 'xl:grid-cols-6'} gap-3 p-0.5`}
            >
              {summary.map((c, i) => c.onClick
                ? <StatCard key={i} label={c.label} value={c.value} icon={c.icon} tint={c.tint} onClick={c.onClick} isActive={c.isActive} />
                : <MetricCard key={i} {...c} />)}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}

      <Outlet context={ctx} />
    </div>
  )
}
