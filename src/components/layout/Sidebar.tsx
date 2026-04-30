import React from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  ShoppingCart, Package, PackagePlus, Users, BarChart2, Settings,
  Palette,
} from 'lucide-react'

const mainNavItems = [
  { to: '/', label: 'การขาย', icon: ShoppingCart, exact: true },
  { to: '/purchase', label: 'การซื้อ', icon: PackagePlus },
  { to: '/products', label: 'สินค้า', icon: Package },
  { to: '/people', label: 'บุคคล', icon: Users },
  { to: '/reports', label: 'รายงาน', icon: BarChart2 },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
]

const bottomNavItems = [
  { to: '/theme', label: 'Theme', icon: Palette },
]

function NavItem({ to, label, icon: Icon, exact }: { to: string; label: string; icon: React.ComponentType; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-colors gap-1',
          isActive
            ? 'bg-sidebar-accent/10 text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/10 hover:text-sidebar-foreground'
        )
      }
      title={label}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[14px] font-medium leading-none text-sidebar-foreground">{label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="flex flex-col w-20 h-screen bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex flex-col items-center justify-center h-16 border-b border-sidebar-border bg-sidebar-accent-foreground">
        <div className="text-primary-foreground font-extrabold text-lg leading-none">Rx</div>
        <div className="text-primary-foreground text-[14px] font-medium leading-tight">Syntropic</div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto scrollbar-thin">
        {mainNavItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom Nav */}
      <nav className="flex flex-col items-center py-11 gap-1">
        {bottomNavItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>
    </aside>
  )
}
