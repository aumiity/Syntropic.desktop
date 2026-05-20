import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Package, Boxes } from 'lucide-react'

// Products page is a Tabs shell — products vs bundles, each owns its own list
// component (ProductsList / BundlesList) with its own filters and IPC calls.
// Children render via <Outlet />; routes are declared in App.tsx.
const TABS = [
  { value: 'products', label: 'สินค้า',     icon: Package, path: '/products' },
  { value: 'bundles',  label: 'ชุดสินค้า',  icon: Boxes,   path: '/products/bundles' },
]

function resolveTab(pathname: string): string {
  if (pathname.startsWith('/products/bundles')) return 'bundles'
  return 'products'
}

export default function ProductsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const tab = resolveTab(location.pathname)

  return (
    <div className="flex flex-col h-full px-8 pt-10 pb-4 gap-3">
      <PageHeader title="สินค้า" />

      <Tabs
        value={tab}
        onValueChange={v => {
          const t = TABS.find(x => x.value === v)
          if (t) navigate(t.path)
        }}
        className="items-center shrink-0"
      >
        <TabsList>
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value}>
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0 flex flex-col [scrollbar-gutter:stable]">
        <Outlet />
      </div>
    </div>
  )
}
