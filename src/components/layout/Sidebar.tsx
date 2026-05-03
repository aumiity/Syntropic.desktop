import React from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  ShoppingCart, Pill, PackagePlus, Users, BarChart2, Settings,
  Palette, Sun, Moon,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

const mainNavItems = [
  { to: '/', label: 'การขาย', icon: ShoppingCart, exact: true },
  { to: '/purchase', label: 'การซื้อ', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Pill },
  { to: '/people', label: 'บุคคล', icon: Users },
  { to: '/reports', label: 'รายงาน', icon: BarChart2 },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
]

const bottomNavItems = [
  { to: '/theme', label: 'Appearance', icon: Palette },
]

function NavItem({ to, label, icon: Icon, exact }: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          'flex items-center w-full h-11 px-6 gap-3 rounded-xl transition-colors',
          isActive
            ? 'bg-sidebar-accent text-primary-strong font-bold'
            : 'text-sidebar-primary-foreground hover:bg-sidebar-accent/20'
        )
      }
      title={label}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium leading-none">{label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  const { theme, toggleTheme } = useThemeStore()
  const isDark = theme === 'dark'

  return (
    <aside className="flex flex-col w-56 h-screen bg-sidebar shrink-0 shadow-lg border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center mt-4 h-20 bg-sidebar justify-center">
        <div className="text-sidebar-accent-foreground font-extrabold text-6xl leading-none">R<span className="text-sidebar-accent font-extrabold text-4xl leading-none">x</span></div>
        <div className="text-sidebar-accent-foreground text-2xl font-medium leading-none">Syntropic</div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col py-3 px-2 gap-1 overflow-y-auto scrollbar-thin">
        {mainNavItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom Nav */}
      <nav className="flex flex-col mb-4 px-2 gap-1">
        {bottomNavItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        <button
          onClick={toggleTheme}
          title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
          className="flex items-center w-full h-11 px-6 gap-3 rounded-xl transition-colors text-sidebar-foreground hover:bg-accent-soft"
        >
          {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
          <span className="text-sm font-medium leading-none">
            {isDark ? 'สว่าง' : 'มืด'}
          </span>
        </button>
      </nav>
    </aside>
  )
}
