import React, { useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  ShoppingCart, Package, PackagePlus, Users, BarChart2, Settings,
  Layers, Palette,
} from 'lucide-react'
import { AppearancePanel } from './AppearancePanel'

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
  const [open, setOpen] = React.useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <aside className="relative flex flex-col w-20 h-screen bg-sidebar border-r border-sidebar-border shrink-0">
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

      {/* Appearance trigger */}
      <div className="flex items-center justify-center pb-10">
        <button
          ref={btnRef}
          onClick={() => setOpen(v => !v)}
          className={cn(
            'flex flex-col items-center justify-center w-16 h-10 rounded-xl transition-colors',
            open
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
          title="รูปลักษณ์"
        >
          <Palette className="h-4 w-4" />
        </button>
      </div>

      {/* Inline panel — slides out to the right of the sidebar */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-6 left-[84px] z-50"
        >
          <AppearancePanel onClose={() => setOpen(false)} />
        </div>
      )}
    </aside>
  )
}
