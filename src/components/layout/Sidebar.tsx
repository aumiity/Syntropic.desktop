import React, { useEffect } from 'react'
import { NavLink, useResolvedPath, useMatch } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  ShoppingCart, Pill, PackagePlus, Users, ClipboardList, Settings,
  Palette, Sun, Moon, Braces, ChevronLeft, ChevronRight, ScanLine, LineChart,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import { useGRDraftStore } from '@/stores/grDraftStore'
import { usePermission } from '@/hooks/usePermission'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { LogoMark } from '@/components/ui/logo-mark'
import { SidebarUser } from './SidebarUser'

// adminOnly items are hidden from staff (the finance reports landing page is
// entirely admin-gated IPC; settings is all writes). This is UX — the IPC layer
// enforces the same boundary regardless (R1/R2).
const mainNavItems = [
  { to: '/', label: 'การขาย', icon: ShoppingCart, exact: true },
  { to: '/purchase', label: 'การรับสินค้า', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Pill },
  { to: '/manage', label: 'การจัดการ', icon: ClipboardList },
  { to: '/reports', label: 'รายงาน', icon: LineChart, adminOnly: true },
  { to: '/people', label: 'บุคคล', icon: Users },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings, adminOnly: true },
]

const bottomNavItems = [
  // จับคู่ใบส่งของ — HIDDEN from nav 2026-06-05, ยังไม่ได้ใช้. Page/code kept (route
  // still live in App.tsx, reachable by URL). Re-enable by uncommenting this line.
  // { to: '/purchase-intake', label: 'จับคู่ใบส่งของ', icon: ScanLine },
  { to: '/css', label: 'CSS', icon: Braces },
  { to: '/theme', label: 'Appearance', icon: Palette },
]

type NavItemProps = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  collapsed: boolean
  // Numeric red badge (e.g. in-progress GR line items, negative-stock count).
  // A red pill carrying the number, pinned to the icon corner in BOTH collapsed
  // and expanded modes. Hidden when falsy/0.
  countBadge?: number
}

function NavItem({ to, label, icon: Icon, exact, collapsed, countBadge }: NavItemProps) {
  const resolved = useResolvedPath(to)
  const isActive = !!useMatch({ path: resolved.pathname, end: !!exact })

  const className = cn(
    'relative flex items-center h-11 w-full px-6 gap-3 rounded-xl transition-colors',
    isActive
      ? 'text-sidebar-accent-foreground'
      : 'text-sidebar-primary-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground'
  )

  const link = (
    <NavLink to={to} end={exact} className={className}>
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          aria-hidden
          className="absolute inset-0 rounded-xl bg-sidebar-accent"
          transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
        />
      )}
      <span className="relative z-10 shrink-0 inline-flex">
        <Icon className="h-5 w-5" />
        {!!countBadge && countBadge > 0 && (
          <span className="absolute -top-1.5 -right-2.5 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold leading-none ring-2 ring-sidebar">
            {countBadge > 99 ? '99+' : countBadge}
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="relative z-10 text-sm font-bold leading-none whitespace-nowrap">{label}</span>
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
  const collapsed = isSidebarCollapsed
  const { isAdmin } = usePermission()
  const visibleNavItems = mainNavItems.filter(item => isAdmin || !item.adminOnly)

  // Hydrate the negative-stock badge once on mount; every mutation site
  // (POS save, GR save, void, reconcile, dismiss) calls refresh() too.
  const negativeStockCount = useNegativeStockBadge(s => s.count)
  const refreshNegativeStock = useNegativeStockBadge(s => s.refresh)
  useEffect(() => { refreshNegativeStock() }, [refreshNegativeStock])

  // In-progress goods-receive line items — red count badge on "การรับสินค้า".
  // Selector returns a number, so this only re-renders when the count changes.
  const grDraftCount = useGRDraftStore(s => s.draft?.rows.length ?? 0)

  const btnClass = cn(
    'flex items-center justify-center h-11 w-full rounded-xl transition-colors',
    'text-sidebar-primary-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground'
  )

  const themeBtn = (
    <button onClick={toggleTheme} className={btnClass}>
      {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
    </button>
  )

  return (
    <aside
      className={cn(
        'no-print relative z-10 flex flex-col h-screen bg-sidebar shrink-0 border-r border-sidebar-border',
        'transition-[width] duration-200',
        collapsed ? 'w-20' : 'w-48'
      )}
    >
      {/* Collapse toggle — floats on the sidebar's right border seam */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleSidebar}
            className={cn(
              'absolute -right-3 top-1/2 -translate-y-1/2 z-20 grid place-items-center',
              'size-6 rounded-full border border-sidebar-border bg-sidebar shadow-sm',
              'text-sidebar-primary-foreground transition-colors',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            {collapsed
              ? <ChevronRight className="size-4 shrink-0" />
              : <ChevronLeft className="size-4 shrink-0" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{collapsed ? 'ขยาย sidebar' : 'ยุบ sidebar'}</TooltipContent>
      </Tooltip>

      {/* Logo */}
      <div className="flex items-center gap-2 mt-4 h-20 bg-sidebar justify-center overflow-hidden px-2">
        <LogoMark className="size-10 shrink-0 text-sidebar-accent-foreground" />
        {!collapsed && (
          <div className="font-brand text-sidebar-accent-foreground text-2xl font-bold leading-none tracking-tight">
            Rx <span className="font-medium opacity-80">Desktop</span>
          </div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col py-3 px-1.5 gap-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {visibleNavItems.map(({ adminOnly: _adminOnly, ...item }) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={collapsed}
            countBadge={
              item.to === '/purchase' ? grDraftCount
              : item.to === '/manage' ? negativeStockCount
              : undefined
            }
          />
        ))}
      </nav>

      {/* Bottom Nav */}
      <nav className="flex flex-col mb-4 px-1.5 gap-1">
        {bottomNavItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{themeBtn}</TooltipTrigger>
            <TooltipContent>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</TooltipContent>
          </Tooltip>
        ) : themeBtn}

        <div className="mt-1 pt-1 border-t border-sidebar-border">
          <SidebarUser collapsed={collapsed} />
        </div>
      </nav>
    </aside>
  )
}
