import React, { useEffect, useState } from 'react'
import { NavLink, useResolvedPath, useMatch } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  ShoppingBag, Pill, PackagePlus, User,
  FileText, Settings, ChartArea,
  Palette, Sun, Moon, CodeXml,
  ChevronLeft, ChevronRight, Scan, FlaskConical,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useGRDraftStore } from '@/stores/grDraftStore'
import { useTagDraftStore } from '@/stores/tagDraftStore'
import { useCartStore } from '@/stores/cartStore'
import { usePermission } from '@/hooks/usePermission'
import { useCan } from '@/hooks/useCan'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { CountBadge } from '@/components/ui/count-badge'
import { LogoMark } from '@/components/ui/logo-mark'
import { SidebarUser } from './SidebarUser'

// adminOnly items are hidden from staff (the finance reports landing page is
// entirely admin-gated IPC; settings is all writes). This is UX — the IPC layer
// enforces the same boundary regardless (R1/R2).
const mainNavItems = [
  { to: '/', label: 'การขาย', icon: ShoppingBag, exact: true },
  { to: '/purchase', label: 'การรับสินค้า', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Pill },
  { to: '/manage', label: 'การจัดการ', icon: FileText },
  { to: '/reports', label: 'รายงาน', icon: ChartArea, adminOnly: true },
  { to: '/people', label: 'บุคคล', icon: User },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings, adminOnly: true },
]

const bottomNavItems = [
  // จับคู่ใบส่งของ — HIDDEN from nav 2026-06-05, ยังไม่ได้ใช้. Page/code kept (route
  // still live in App.tsx, reachable by URL). Re-enable by uncommenting this line.
  // { to: '/purchase-intake', label: 'จับคู่ใบส่งของ', icon: Scan },
  { to: '/css', label: 'CSS', icon: CodeXml },
  { to: '/theme', label: 'Appearance', icon: Palette },
  // Separate reference gallery — components extracted from an external design
  // reference, kept isolated from the real /theme showcase (see CLAUDE.md).
  { to: '/theme-lab', label: 'Theme Lab', icon: FlaskConical },
]

// Below this window width the sidebar auto-collapses (independent of the
// user's manual/persisted preference — see useIsNarrowViewport below).
const AUTO_COLLAPSE_BREAKPOINT = 1500

function useIsNarrowViewport(breakpoint: number) {
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isNarrow
}

type NavItemProps = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  collapsed: boolean
  // Numeric badge (e.g. in-progress GR line items, negative-stock count).
  // Expanded: an accent chip with the count, flush right on the row after
  // the label. Collapsed: just a plain accent dot pinned to the icon corner
  // (no room to show the number — the count still reads in the tooltip).
  // Hidden when falsy/0.
  countBadge?: number
}

function NavItem({ to, label, icon: Icon, exact, collapsed, countBadge }: NavItemProps) {
  const resolved = useResolvedPath(to)
  const isActive = !!useMatch({ path: resolved.pathname, end: !!exact })

  const className = cn(
    'group relative flex items-center h-10 w-full rounded-lg transition-colors font-semibold',
    collapsed ? 'justify-center' : 'px-3.5 gap-3',
    isActive
      ? 'text-sidebar-accent-foreground'
      : 'text-sidebar-foreground hover:text-sidebar-accent-foreground'
  )

  const link = (
    <NavLink to={to} end={exact} className={className}>
      {isActive ? (
        <motion.div
          layoutId="sidebar-active"
          aria-hidden
          className="absolute inset-0 rounded-lg bg-sidebar-accent"
          transition={{ type: 'spring', bounce: 0.28, duration: 0.45 }}
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 rounded-lg transition-colors group-hover:bg-sidebar-accent/40"
        />
      )}
      <span className="relative z-10 shrink-0 inline-flex">
        <Icon className="h-5 w-5" />
        {collapsed && !!countBadge && countBadge > 0 && (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-2 size-2 rounded-full bg-destructive ring-2 ring-card"
          />
        )}
      </span>
      {!collapsed && (
        <span className="relative z-10 flex-1 flex items-center justify-between gap-2 min-w-0">
          <span className="text-sm leading-none whitespace-nowrap">{label}</span>
          {!!countBadge && countBadge > 0 && <CountBadge count={countBadge} />}
        </span>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent>
        {label}
        {countBadge && countBadge > 0 ? ` (${countBadge})` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const { theme, toggleTheme, isSidebarCollapsed, toggleSidebar } = useThemeStore()
  const isDark = theme === 'dark'
  // Forced by viewport width — layered on top of, and never overwrites, the
  // user's manual/persisted preference (isSidebarCollapsed).
  const isNarrow = useIsNarrowViewport(AUTO_COLLAPSE_BREAKPOINT)
  const collapsed = isSidebarCollapsed || isNarrow
  const { isAdmin } = usePermission()
  // Per-route fine-grained gates: the finance reports landing shows when the
  // role can see any finance report; settings shows for the owner or any role
  // granted settings.manage.
  const canReports = useCan('report.finance') !== 'off'
  const canSettingsManage = useCan('settings.manage') !== 'off'
  const canSettings = isAdmin || canSettingsManage
  const visibleNavItems = mainNavItems.filter(item => {
    if (!item.adminOnly) return true
    if (item.to === '/reports') return canReports
    if (item.to === '/settings') return canSettings
    return isAdmin
  })

  // Hydrate the negative-stock badge once on mount; every mutation site
  // (POS save, GR save, void, reconcile, dismiss) calls refresh() too.
  const negativeStockCount = useNegativeStockBadge(s => s.count)
  const refreshNegativeStock = useNegativeStockBadge(s => s.refresh)
  useEffect(() => { refreshNegativeStock() }, [refreshNegativeStock])

  // In-progress goods-receive line items — red count badge on "การรับสินค้า".
  // Selector returns a number, so this only re-renders when the count changes.
  const grDraftCount = useGRDraftStore(s => s.draft?.rows.length ?? 0)
  // In-progress price-tag list — red count badge on "สินค้า" (it lives at
  // /products/print). Survives navigating to the POS and back (tagDraftStore).
  const tagDraftCount = useTagDraftStore(s => s.priceItems.filter(Boolean).length)
  // Total line items across every cart basket — red count badge on "การขาย".
  // The active basket's live items sit at the store root; inactive baskets are
  // snapshotted in `slots`, so read per index to avoid the stale active snapshot.
  const cartItemCount = useCartStore(s =>
    s.slots.reduce((sum, slot, i) => sum + (i === s.activeSlot ? s.items.length : slot.items.length), 0)
  )

  const btnClass = cn(
    'group relative flex items-center justify-center h-10 w-full rounded-lg transition-colors',
    'text-sidebar-foreground hover:text-sidebar-accent-foreground'
  )

  const themeBtn = (
    <button onClick={toggleTheme} className={btnClass}>
      <span
        aria-hidden
        className="absolute inset-0 rounded-lg transition-colors group-hover:bg-sidebar-accent/40"
      />
      {isDark
        ? <Sun className="relative z-10 h-5 w-5 shrink-0" />
        : <Moon className="relative z-10 h-5 w-5 shrink-0" />}
    </button>
  )

  return (
    <aside
      className={cn(
        'no-print relative z-10 flex flex-col h-full bg-sidebar shrink-0 rounded-xl border border-sidebar-foreground shadow-card',
        'transition-[width] duration-400',
        collapsed ? 'w-20' : 'w-60'
      )}
    >
      {/* Collapse toggle — floats on the sidebar's right border seam.
          Disabled while the viewport forces collapse, so a click can't
          silently flip the persisted preference with no visible effect. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleSidebar}
            disabled={isNarrow}
            className={cn(
              'absolute -right-3 top-1/2 -translate-y-1/2 z-20 grid place-items-center',
              'size-6 rounded-full border border-sidebar-foreground bg-sidebar shadow-sm',
              'text-sidebar-foreground transition-colors',
              isNarrow
                ? 'opacity-50 pointer-events-none'
                : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            {collapsed
              ? <ChevronRight className="size-4 shrink-0" />
              : <ChevronLeft className="size-4 shrink-0" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {isNarrow ? 'จอแคบเกินไป — ขยายหน้าต่างเพื่อขยาย sidebar' : (collapsed ? 'ขยาย sidebar' : 'ยุบ sidebar')}
        </TooltipContent>
      </Tooltip>

      {/* Logo */}
      <div className="flex items-center gap-2 h-20 bg-sidebar justify-center overflow-hidden px-2 rounded-t-xl">
        <LogoMark className="size-10 shrink-0 text-sidebar-accent" />
        {!collapsed && (
          <div className="font-brand text-sidebar-accent text-2xl font-bold leading-none tracking-tight">
            Rx <span className="font-medium opacity-80">Desktop</span>
          </div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col py-3 px-4 gap-1.5 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {visibleNavItems.map(({ adminOnly: _adminOnly, ...item }) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            countBadge={
              item.to === '/' ? cartItemCount
              : item.to === '/purchase' ? grDraftCount
              : item.to === '/products' ? tagDraftCount
              : item.to === '/manage' ? negativeStockCount
              : undefined
            }
          />
        ))}
      </nav>

      {/* Bottom Nav */}
      <nav className="flex flex-col mb-2.5 px-4 gap-1.5">
        {bottomNavItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{themeBtn}</TooltipTrigger>
            <TooltipContent>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</TooltipContent>
          </Tooltip>
        ) : themeBtn}

        <div className="mt-1 pt-2.5 border-t border-sidebar-foreground">
          <SidebarUser collapsed={collapsed} />
        </div>
      </nav>
    </aside>
  )
}
