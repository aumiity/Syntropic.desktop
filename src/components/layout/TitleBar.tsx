import React, { useState, useEffect } from 'react'
import { Minus, Plus, X, Maximize2, Copy, Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDevTabStore } from '@/stores/devTabStore'

// DEV ONLY — route path → source file map for quick copy-paste to Claude
const ROUTE_FILE_MAP: { pattern: string; file: string }[] = [
  { pattern: '/products/bundles/new',      file: 'src/pages/Products/EditBundle/index.tsx' },
  { pattern: '/products/bundles/:id/edit', file: 'src/pages/Products/EditBundle/index.tsx' },
  { pattern: '/products/bundles',          file: 'src/pages/Products/BundlesList.tsx' },
  { pattern: '/products/new',              file: 'src/pages/Products/EditProduct/index.tsx' },
  { pattern: '/products/:id/edit',         file: 'src/pages/Products/EditProduct/index.tsx' },
  { pattern: '/products',                  file: 'src/pages/Products/ProductsList.tsx' },
  { pattern: '/purchase-intake',           file: 'src/pages/PurchaseIntake/index.tsx' },
  { pattern: '/purchase',                  file: 'src/pages/Purchase/index.tsx' },
  { pattern: '/people',                    file: 'src/pages/People/index.tsx' },
  { pattern: '/manage/purchases',          file: 'src/pages/Manage/Purchases.tsx' },
  { pattern: '/manage/expenses',           file: 'src/pages/Manage/Expenses.tsx' },
  { pattern: '/manage/dead-stock',         file: 'src/pages/Manage/DeadStock.tsx' },
  { pattern: '/manage/low-stock',          file: 'src/pages/Manage/LowStock.tsx' },
  { pattern: '/manage/expiry',             file: 'src/pages/Manage/Expiry.tsx' },
  { pattern: '/manage/negative-stock',     file: 'src/pages/Manage/NegativeStock.tsx' },
  { pattern: '/manage',                    file: 'src/pages/Manage/Sales.tsx' },
  { pattern: '/reports/fda/khor-yor-9',   file: 'src/pages/Reports/KhorYor9.tsx' },
  { pattern: '/reports/fda',              file: 'src/pages/Reports/FdaReports.tsx' },
  { pattern: '/reports/vat',              file: 'src/pages/Reports/VatReport.tsx' },
  { pattern: '/reports',                  file: 'src/pages/Reports/Dashboard.tsx' },
  { pattern: '/settings',                 file: 'src/pages/Settings/index.tsx' },
  { pattern: '/theme',                    file: 'src/pages/Theme/index.tsx' },
  { pattern: '/css',                      file: 'src/pages/CSS/index.tsx' },
  { pattern: '/',                         file: 'src/pages/POS/index.tsx' },
]

// DEV ONLY — for pages whose tab lives in local state (not the URL), map the
// active tab value → its sub-file so the path display reaches the open tab.
// Keyed by the route file resolved above, then by the published tab value.
const SUBFILE_MAP: Record<string, Record<string, string>> = {
  'src/pages/Settings/index.tsx': {
    shop: 'src/pages/Settings/ShopTab.tsx',
    sales: 'src/pages/Settings/SalesTab.tsx',
    'product-mgmt': 'src/pages/Settings/ProductMgmtTab.tsx',
    units: 'src/pages/Settings/UnitsTab.tsx',
    'drug-usage': 'src/pages/Settings/DrugUsageTab.tsx',
    printers: 'src/pages/Settings/PrintersTab.tsx',
    database: 'src/pages/Settings/DatabaseTab.tsx',
  },
  'src/pages/Products/EditProduct/index.tsx': {
    general: 'src/pages/Products/EditProduct/GeneralTab.tsx',
    units: 'src/pages/Products/EditProduct/UnitsTab.tsx',
    labels: 'src/pages/Products/EditProduct/LabelsTab.tsx',
    lots: 'src/pages/Products/EditProduct/LotsTab.tsx',
    history: 'src/pages/Products/EditProduct/HistoryTab.tsx',
  },
  'src/pages/Products/EditBundle/index.tsx': {
    general: 'src/pages/Products/EditBundle/GeneralTab.tsx',
    components: 'src/pages/Products/EditBundle/ComponentsTab.tsx',
    labels: 'src/pages/Products/EditProduct/LabelsTab.tsx',
    history: 'src/pages/Products/EditBundle/HistoryTab.tsx',
  },
}

function matchFilePath(pathname: string, tab: string | null): string {
  const norm = pathname || '/'
  for (const { pattern, file } of ROUTE_FILE_MAP) {
    const pp = pattern.split('/').filter(Boolean)
    const ap = norm.split('/').filter(Boolean)
    if (pp.length !== ap.length) continue
    if (pp.every((seg, i) => seg.startsWith(':') || seg === ap[i])) {
      if (tab) return SUBFILE_MAP[file]?.[tab] ?? file
      return file
    }
  }
  return norm
}

const trafficLight =
  'flex items-center justify-center w-4 h-4 rounded-full transition-colors shrink-0'
const iconBase =
  'opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold leading-none select-none'

const colors = {
  close: { bg: '#FF5F57', hover: '#FF3B30', ring: '#E0443E' },
  minimize: { bg: '#28CA41', hover: '#1EAB31', ring: '#1D8E2B' },
  maximize: { bg: '#FFBD2E', hover: '#FF9F0A', ring: '#DEA123' },
}

const PRESETS: { label: string; w: number; h: number; note?: string }[] = [
  { label: '1024 × 768', w: 1024, h: 768, note: 'เล็กสุด' },
  { label: '1280 × 720', w: 1280, h: 720, note: 'HD' },
  { label: '1366 × 768', w: 1366, h: 768, note: 'โน้ตบุ๊ก' },
  { label: '1440 × 900', w: 1440, h: 900 },
  { label: '1600 × 900', w: 1600, h: 900 },
  { label: '1920 × 1080', w: 1920, h: 1080, note: 'FHD' },
]

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState<'close' | 'minimize' | 'maximize' | null>(null)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const location = useLocation()
  const devTab = useDevTabStore((s) => s.tab)

  const filePath = matchFilePath(location.pathname, devTab)

  const copyPath = () => {
    navigator.clipboard.writeText(filePath)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    window.api.window.isMaximized().then(setMaximized)
  }, [])

  const minimize = () => window.api.window.minimize()
  const maximize = () =>
    window.api.window.maximize().then(() => window.api.window.isMaximized().then(setMaximized))
  const close = () => window.api.window.close()
  const setSize = (w: number, h: number) => {
    window.api.window.setSize(w, h)
    setResizeOpen(false)
    setTimeout(() => window.api.window.isMaximized().then(setMaximized), 50)
  }

  return (
    <div
      className="no-print absolute top-0 left-0 right-0 flex items-center justify-between h-9 select-none z-50"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left spacer (mirrors right control cluster width to keep center true) */}
      <div className="w-[88px] h-full shrink-0" />

      {/* Center: path display + resize-to-preset (test tools) */}
      <div
        className="flex items-center gap-1 h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Current route path — click to copy (DEV ONLY) */}
        <button
          type="button"
          onClick={copyPath}
          title="คัดลอก path"
          className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors font-mono"
        >
          {copied
            ? <Check className="size-3.5 text-success" />
            : <Copy className="size-3.5" />
          }
          <span>{filePath}</span>
        </button>

        <div className="w-px h-3.5 bg-border mx-0.5" />

        <Popover open={resizeOpen} onOpenChange={setResizeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="ปรับขนาดหน้าจอ (สำหรับทดสอบ)"
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <Maximize2 className="size-3.5" />
              <span>ปรับขนาดหน้าจอ</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={6}
            className="w-56 p-1.5"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="px-2 py-1 text-xs text-muted-foreground">ขนาดทดสอบ</div>
            <div className="flex flex-col">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSize(p.w, p.h)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-primary-soft/60 transition-colors"
                >
                  <span className="">{p.label}</span>
                  {p.note && (
                    <span className="text-xs text-muted-foreground">{p.note}</span>
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Right: traffic-light controls */}
      <div
        className="flex items-center gap-2 px-3 h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize — yellow */}
        <button
          onClick={minimize}
          onMouseEnter={() => setHovered('minimize')}
          onMouseLeave={() => setHovered(null)}
          className={`group ${trafficLight}`}
          style={{
            backgroundColor: colors.minimize.bg,
            ...(hovered === 'minimize' ? { backgroundColor: colors.minimize.hover } : {}),
          }}
          title="ย่อ"
        >
          <Minus className={`${iconBase} text-[#003D0A]`} size={12} strokeWidth={4} />
        </button>

        {/* Maximize — green */}
        <button
          onClick={maximize}
          onMouseEnter={() => setHovered('maximize')}
          onMouseLeave={() => setHovered(null)}
          className={`group ${trafficLight}`}
          style={{
            backgroundColor: colors.maximize.bg,
            ...(hovered === 'maximize' ? { backgroundColor: colors.maximize.hover } : {}),
          }}
          title={maximized ? 'คืนขนาด' : 'ขยาย'}
        >
          <Plus className={`${iconBase} text-[#7A4E00]`} size={12} strokeWidth={4} />
        </button>

        {/* Close — red */}
        <button
          onClick={close}
          onMouseEnter={() => setHovered('close')}
          onMouseLeave={() => setHovered(null)}
          className={`group ${trafficLight}`}
          style={{
            backgroundColor: colors.close.bg,
            ...(hovered === 'close' ? { backgroundColor: colors.close.hover } : {}),
          }}
          title="ปิด"
        >
          <X className={`${iconBase} text-[#4A0000]`} size={12} strokeWidth={4} />
        </button>
      </div>
    </div>
  )
}
