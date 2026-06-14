import React, { useCallback, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { MetricCard, StatCard, type MetricTint } from '@/components/ui/card'
import { Receipt, CalendarClock, PackagePlus, PackageX, PackageMinus, Wallet, Box } from 'lucide-react'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { usePermission } from '@/hooks/usePermission'

// Phase 1: ประวัติการขาย + ใกล้หมดอายุ. Phase 2: + ประวัติการซื้อ.
// Phase 3: + ต่ำกว่าจุดสั่งซื้อ. See PROGRESS.md.
// adminOnly tabs are hidden from staff (ค่าใช้จ่าย is all expenses:* — admin-gated IPC).
const TABS = [
  { value: 'sales',          to: '/manage',                label: 'ประวัติการขาย', icon: Receipt },
  { value: 'purchases',      to: '/manage/purchases',      label: 'ประวัติการซื้อ', icon: PackagePlus },
  { value: 'dead-stock',     to: '/manage/dead-stock',     label: 'สินค้าค้างสต็อก', icon: Box },
  { value: 'low-stock',      to: '/manage/low-stock',      label: 'ต่ำกว่าจุดสั่งซื้อ', icon: PackageX },
  { value: 'expiry',         to: '/manage/expiry',         label: 'วันหมดอายุ',   icon: CalendarClock },
  { value: 'negative-stock', to: '/manage/negative-stock', label: 'สต๊อคติดลบ',    icon: PackageMinus },
  { value: 'expenses',       to: '/manage/expenses',       label: 'ค่าใช้จ่าย',    icon: Wallet, adminOnly: true },
] as const

type TabValue = typeof TABS[number]['value']

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/manage/expiry')) return 'expiry'
  if (pathname.startsWith('/manage/purchases')) return 'purchases'
  if (pathname.startsWith('/manage/expenses')) return 'expenses'
  if (pathname.startsWith('/manage/dead-stock')) return 'dead-stock'
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
  const { isAdmin } = usePermission()
  const visibleTabs = useMemo(() => TABS.filter(t => isAdmin || !('adminOnly' in t && t.adminOnly)), [isAdmin])
  const current = resolveTab(location.pathname)
  const [summaryState, setSummaryState] = useState<{ tab: TabValue; cards: ManageSummaryCard[] } | null>(null)
  // overflow-hidden is required during the enter/exit height animation to clip
  // the collapsing content, but it also clips the StatCard active-ring (extends
  // 2px outside). Flip overflow back to visible once the animation settles.
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
      <PageHeader title="การจัดการ" />

      <TabStrip className="-mb-2">
        <Tabs
          value={current}
          onValueChange={(v) => {
            const tab = TABS.find(t => t.value === v)
            if (tab) navigate(tab.to)
          }}
        >
          <TabsList variant="segmented">
            {visibleTabs.map(({ value, label, icon: Icon }) => {
              const showBadge = value === 'negative-stock' && negativeStockCount > 0
              return (
                <TabsTrigger key={value} value={value}>
                  <Icon />
                  <span className="relative inline-block">
                    {label}
                    {showBadge && (
                      <span className="absolute -top-2 -right-4 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold leading-none ring-2 ring-card">
                        {negativeStockCount > 99 ? '99+' : negativeStockCount}
                      </span>
                    )}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </TabStrip>

      {/* The summary block animates its HEIGHT on both enter and exit (wrapped
          in AnimatePresence with a stable key), so switching to a tab without
          cards (สต๊อคติดลบ / ค่าใช้จ่าย) makes the cards collapse upward and the
          table below stretch in to fill — and the reverse on the way back —
          instead of popping in/out. pt-3 lives on the inner wrapper so the
          breathing room collapses together with the card row. The inner
          AnimatePresence still cross-fades the card set when moving between two
          tabs that both have cards. */}
      <AnimatePresence initial={false}>
        {summary && summary.length > 0 && (
          <motion.div
            key="manage-summary"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onAnimationStart={() => setAnimatingSummary(true)}
            onAnimationComplete={() => setAnimatingSummary(false)}
            className={`shrink-0 ${animatingSummary ? 'overflow-hidden' : ''}`}
          >
            <div className="pt-3">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs without summary cards (สต๊อคติดลบ, ค่าใช้จ่าย) would otherwise butt
          right up against the TabStrip divider — the summary block's pt-3 is what
          gives the other tabs their breathing room. Restore that gap here. */}
      <div className={`flex flex-1 min-h-0 flex-col ${summary && summary.length > 0 ? '' : 'pt-3'}`}>
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
