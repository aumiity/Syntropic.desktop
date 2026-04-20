import React from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import {
  ShoppingCart, Package, PackagePlus, Users, BarChart2, Settings,
  Sun, Moon, Store,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'การขาย', icon: ShoppingCart, exact: true },
  { to: '/purchase', label: 'รับสินค้า', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Package },
  { to: '/people', label: 'บุคคล', icon: Users },
  { to: '/reports', label: 'รายงาน', icon: BarChart2 },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
]

export function Sidebar() {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <aside className="flex flex-col w-[72px] h-screen bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
          <Store className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center py-4 gap-1 overflow-y-auto scrollbar-thin">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center w-14 h-14 rounded-lg transition-colors text-xs gap-1',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-foreground'
              )
            }
            title={label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="flex items-center justify-center pb-4">
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-foreground transition-colors"
          title={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  )
}
