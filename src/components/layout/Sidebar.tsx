import React from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import {
  ShoppingCart, Package, PackagePlus, Users, BarChart2, Settings,
  Sun, Moon, Layers,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'การขาย', icon: ShoppingCart, exact: true },
  { to: '/purchase', label: 'การซื้อ', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Package },
  { to: '/people', label: 'บุคคล', icon: Users },
  { to: '/reports', label: 'รายงาน', icon: BarChart2 },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
  { to: '/ui', label: 'UI', icon: Layers },
]

export function Sidebar() {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <aside className="flex flex-col w-20 h-screen bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex flex-col items-center justify-center h-16 border-b border-sidebar-border">
        <div className="text-sidebar-foreground font-extrabold text-lg leading-none">Rx</div>
        <div className="text-sidebar-primary-foreground text-[14px] font-medium leading-tight">Syntropic</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto scrollbar-thin">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-colors gap-1',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )
            }
            title={label}
          >
            <Icon className="h-6 w-6" />
            <span className="text-[14px] font-medium leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="flex items-center justify-center pb-10">
        <button
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center w-16 h-10 rounded-xl text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
          title={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  )
}
