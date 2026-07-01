import React, { useCallback, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { TabStrip } from '@/components/layout/TabStrip'
import { MetricCard, type MetricTint } from '@/components/ui/card'
import { Receipt, CalendarClock, PackagePlus, PackageX, PackageMinus, Wallet, Box, Boxes } from 'lucide-react'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useCan } from '@/hooks/useCan'

// Phase 1: ประวัติการขาย + ใกล้หมดอายุ. Phase 2: + ประวัติการซื้อ.
// Phase 3: + ต่ำกว่าจุดสั่งซื้อ. See PROGRESS.md.
// adminOnly tabs are hidden from staff (ค่าใช้จ่าย is all expenses:* — admin-gated IPC).
const TOP_TABS = [
  { value: 'sales',     to: '/manage',            label: 'ประวัติการขาย', icon: Receipt },
  { value: 'purchases', to: '/manage/purchases',  label: 'ประวัติการซื้อ', icon: PackagePlus },
  { value: 'stock',     to: '/manage/dead-stock', label: 'สต็อคสินค้า',   icon: Boxes },
  { value: 'expenses',  to: '/manage/expenses',   label: 'ค่าใช้จ่าย',     icon: Wallet, adminOnly: true },
] as const

const STOCK_SUBTABS = [
  { value: 'dead-stock',     to: '/manage/dead-stock',     label: 'ค้างสต็อก',        icon: Box },
  { value: 'expiry',         to: '/manage/expiry',         label: 'วันหมดอายุ',        icon: CalendarClock },
  { value: 'low-stock',      to: '/manage/low-stock',      label: 'ต่ำกว่าจุดสั่งซื้อ', icon: PackageX },
  { value: 'negative-stock', to: '/manage/negative-stock', label: 'ติดลบ',            icon: PackageMinus },
] as const

type TopTabValue = typeof TOP_TABS[number]['value']
type SubTabValue = typeof STOCK_SUBTABS[number]['value']
type TabValue = TopTabValue | SubTabValue

function resolveTab(pathname: string): TabValue {
  if (pathname.startsWith('/manage/expiry')) return 'expiry'
  if (pathname.startsWith('/manage/purchases')) return 'purchases'
  if (pathname.startsWith('/manage/expenses')) return 'expenses'
  if (pathname.startsWith('/manage/dead-stock')) return 'dead-stock'
  if (pathname.startsWith('/manage/low-stock')) return 'low-stock'
  if (pathname.startsWith('/manage/negative-stock')) return 'negative-stock'
  return 'sales'
}

function resolveTopTab(t: TabValue): TopTabValue {
  if (t === 'dead-stock' || t === 'low-stock' || t === 'expiry' || t === 'negative-stock') return 'stock'
  return t as TopTabValue
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
  // When set, the MetricCard becomes clickable (a filter shortcut) and shows a
  // tinted ring while active — same card look, just interactive.
  onClick?: () => void
  isActive?: boolean
}

export interface ManageOutletContext {
  setSummary: (cards: ManageSummaryCard[] | null) => void
  // A child page can inject a control (e.g. a date picker) into the TabStrip
  // row, aligned right beside the tabs. Pass null to clear (do this on unmount).
  setTabActions: (node: React.ReactNode | null) => void
  // A child page can also inject a control into the STOCK sub-tab strip row,
  // aligned right beside the sub-tabs (e.g. an Export button). Pass null to clear.
  setSubTabActions: (node: React.ReactNode | null) => void
}

// Tailwind needs literal class strings to be discoverable in source.
const COLS_BY_COUNT: Record<number, string> = {
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
}

// Centered content column. The scroller runs full-bleed (scrollbar at the window
// edge, empty side margins still scrollable) while every content row sits in this
// capped, centered column — so tables stay 1280px wide, not stretched. On staff
// the parent layout already caps the page at max-w-7xl, so this is a no-op there.
const CAP = 'w-full max-w-7xl mx-auto px-8'

export default function ManageLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const canExpense = useCan('expense.manage') !== 'off'
  const visibleTopTabs = useMemo(() => TOP_TABS.filter(t => !('adminOnly' in t && t.adminOnly) || canExpense), [canExpense])
  const current = resolveTab(location.pathname)
  const topTab = resolveTopTab(current)
  const isStock = topTab === 'stock'
  const [summaryState, setSummaryState] = useState<{ tab: TabValue; cards: ManageSummaryCard[] } | null>(null)
  // Tab-row injected control, scoped to its owner tab so it can't leak into a
  // sibling tab while the child unmounts (mirrors the setSummary owner guard).
  const [tabActionsState, setTabActionsState] = useState<{ tab: TabValue; node: React.ReactNode } | null>(null)
  const [subTabActionsState, setSubTabActionsState] = useState<{ tab: TabValue; node: React.ReactNode } | null>(null)
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

  const setTabActions = useCallback((node: React.ReactNode | null) => {
    const ownerTab = current
    setTabActionsState(prev => {
      if (node != null) return { tab: ownerTab, node }
      return prev?.tab === ownerTab ? null : prev
    })
  }, [current])

  const setSubTabActions = useCallback((node: React.ReactNode | null) => {
    const ownerTab = current
    setSubTabActionsState(prev => {
      if (node != null) return { tab: ownerTab, node }
      return prev?.tab === ownerTab ? null : prev
    })
  }, [current])

  const ctx = useMemo<ManageOutletContext>(() => ({ setSummary, setTabActions, setSubTabActions }), [setSummary, setTabActions, setSubTabActions])
  const summary = summaryState?.tab === current ? summaryState.cards : null
  const tabActions = tabActionsState?.tab === current ? tabActionsState.node : null
  const subTabActions = subTabActionsState?.tab === current ? subTabActionsState.node : null

  return (
    <div className="flex flex-col h-full pt-4 pb-4 gap-2">
      <div className={CAP}>
        <PageHeader title="การจัดการ" />
      </div>

      <div className={CAP}>
        <TabStrip className="-mb-2">
        <Tabs
          value={topTab}
          onValueChange={(v) => {
            const tab = TOP_TABS.find(t => t.value === v)
            if (tab) navigate(tab.to)
          }}
        >
          <TabsList variant="segmented">
            {visibleTopTabs.map(({ value, label, icon: Icon }) => {
              const showBadge = value === 'stock' && negativeStockCount > 0
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
        {(tabActions ?? subTabActions) && <div className="ml-auto flex items-center">{tabActions ?? subTabActions}</div>}
        </TabStrip>
      </div>

      {isStock && (
        <div className={CAP}>
        <div className="flex items-center gap-3 h-12 shrink-0">
          <Tabs value={current} className="flex-1" onValueChange={(v) => { const sub = STOCK_SUBTABS.find(t => t.value === v); if (sub) navigate(sub.to) }}>
            <TabsList variant="line" className="w-full">
              {STOCK_SUBTABS.map(({ value, label, icon: Icon }) => {
                const showBadge = value === 'negative-stock' && negativeStockCount > 0
                return (
                  <TabsTrigger key={value} value={value} className="flex-1 px-4 py-2">
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
        </div>
        </div>
      )}

      {/* The summary block animates its HEIGHT on both enter and exit (wrapped
          in AnimatePresence with a stable key), so switching to a tab without
          cards (สต๊อคติดลบ / ค่าใช้จ่าย) makes the cards collapse upward and the
          table below stretch in to fill — and the reverse on the way back —
          instead of popping in/out. pt-3 lives on the inner wrapper so the
          breathing room collapses together with the card row. The inner
          AnimatePresence still cross-fades the card set when moving between two
          tabs that both have cards. */}
      <div className="flex-1 min-h-0 flex flex-col">
      <div className={`${CAP} flex flex-col gap-2 flex-1 min-h-0`}>
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
                  {summary.map((c, i) => <MetricCard key={i} {...c} />)}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs without summary cards (สต๊อคติดลบ, ค่าใช้จ่าย) would otherwise butt
          right up against the TabStrip divider — the summary block's pt-3 is what
          gives the other tabs their breathing room. Restore that gap here. */}
      <div className={`flex flex-1 min-h-0 flex-col ${summary?.length ? '' : 'pt-3'}`}>
        <Outlet context={ctx} />
      </div>
      </div>
      </div>
    </div>
  )
}
