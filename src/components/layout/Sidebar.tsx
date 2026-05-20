import React from 'react'
import { NavLink, useResolvedPath, useMatch } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  ShoppingCart, Pill, PackagePlus, Users, ClipboardList, Settings,
  Palette, Sun, Moon, Braces, PanelLeftClose, PanelLeftOpen, ScanLine, LineChart,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

const mainNavItems = [
  { to: '/', label: 'การขาย', icon: ShoppingCart, exact: true },
  { to: '/purchase', label: 'การซื้อ', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Pill },
  { to: '/manage', label: 'ประวัติ & สต็อก', icon: ClipboardList },
  { to: '/reports', label: 'รายงาน', icon: LineChart },
  { to: '/people', label: 'บุคคล', icon: Users },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
]

const bottomNavItems = [
  { to: '/purchase-intake', label: 'จับคู่ใบส่งของ', icon: ScanLine },
  { to: '/css', label: 'CSS', icon: Braces },
  { to: '/theme', label: 'Appearance', icon: Palette },
]

type NavItemProps = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  collapsed: boolean
}

function NavItem({ to, label, icon: Icon, exact, collapsed }: NavItemProps) {
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
      <Icon className="relative z-10 h-5 w-5 shrink-0" />
      {!collapsed && (
        <span className="relative z-10 text-sm font-bold leading-none whitespace-nowrap">{label}</span>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const { theme, toggleTheme, isSidebarCollapsed, toggleSidebar } = useThemeStore()
  const isDark = theme === 'dark'
  const collapsed = isSidebarCollapsed

  const btnClass = cn(
    'flex items-center justify-center h-11 w-full rounded-xl transition-colors',
    'text-sidebar-primary-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground'
  )

  const themeBtn = (
    <button onClick={toggleTheme} className={btnClass}>
      {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
    </button>
  )

  const collapseBtn = (
    <button onClick={toggleSidebar} className={btnClass}>
      {collapsed
        ? <PanelLeftOpen className="h-5 w-5 shrink-0" />
        : <PanelLeftClose className="h-5 w-5 shrink-0" />}
    </button>
  )

  return (
    <aside
      className={cn(
        'no-print flex flex-col h-screen bg-sidebar shrink-0 border-r border-sidebar-border',
        'transition-[width] duration-200',
        collapsed ? 'w-20' : 'w-48'
      )}
    >
      {/* Logo */}
      <div className="flex items-center mt-4 h-20 bg-sidebar justify-center overflow-hidden">
        <div className="text-sidebar-accent-foreground font-extrabold text-6xl leading-none">
          R<span className="text-sidebar-accent font-extrabold text-4xl leading-none">x</span>
        </div>
        {!collapsed && (
          <div className="text-sidebar-accent-foreground text-2xl font-medium leading-none">Syntropic</div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col py-3 px-1.5 gap-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {mainNavItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
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

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{collapseBtn}</TooltipTrigger>
            <TooltipContent>ขยาย sidebar</TooltipContent>
          </Tooltip>
        ) : collapseBtn}
      </nav>
    </aside>
  )
}
