import React, { useState, useEffect } from 'react'
import { Minus, Plus, X, Maximize2, Copy, Check, ShieldCheck, User, MessageSquarePlus, List } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDevTabStore } from '@/stores/devTabStore'
import { useUserStore } from '@/stores/userStore'
import { useReviewOverlayStore } from '@/stores/reviewOverlayStore'

// DEV ONLY — route path → source file map for quick copy-paste to Claude
const ROUTE_FILE_MAP: { pattern: string; file: string }[] = [
  { pattern: '/products/bundles/new',      file: 'src/pages/Products/EditBundle/index.tsx' },
  { pattern: '/products/bundles/:id/edit', file: 'src/pages/Products/EditBundle/index.tsx' },
  { pattern: '/products/print',            file: 'src/pages/Products/PrintTab/index.tsx' },
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
  { pattern: '/reports/fda/khor-yor-10',  file: 'src/pages/Reports/KhorYor10.tsx' },
  { pattern: '/reports/fda/khor-yor-11',  file: 'src/pages/Reports/KhorYor11.tsx' },
  { pattern: '/reports/fda/environment',  file: 'src/pages/Reports/EnvLog.tsx' },
  { pattern: '/reports/fda',              file: 'src/pages/Reports/FdaReports.tsx' },
  { pattern: '/reports/vat',              file: 'src/pages/Reports/VatReport.tsx' },
  { pattern: '/reports/export',           file: 'src/pages/Reports/ExportHub.tsx' },
  { pattern: '/reports',                  file: 'src/pages/Reports/Dashboard.tsx' },
  { pattern: '/settings',                 file: 'src/pages/Settings/index.tsx' },
  { pattern: '/theme',                    file: 'src/pages/Theme/index.tsx' },
  { pattern: '/css',                      file: 'src/pages/CSS/index.tsx' },
  { pattern: '/',                         file: 'src/pages/POS/index.tsx' },
]

// DEV ONLY — for pages whose tab lives in local state (not the URL), map the
// active tab value → its sub-file so the path display reaches the open tab.
// Keyed by the route file resolved above, then by the published tab value(s).
// A node is either a leaf file string OR a branch object holding `_self` (the
// file for the branch tab itself) plus its own nested children — so the path
// can drill through tabs-within-tabs (e.g. การพิมพ์ › ใบเสร็จ).
type SubNode = string | { [tab: string]: SubNode }
const SUBFILE_MAP: Record<string, SubNode> = {
  'src/pages/Settings/index.tsx': {
    shop: 'src/pages/Settings/ShopTab.tsx',
    sales: 'src/pages/Settings/SalesTab.tsx',
    'product-mgmt': {
      _self: 'src/pages/Settings/ProductMgmtTab.tsx',
      categories: 'src/pages/Settings/CategoriesTab.tsx',
      expenses: 'src/pages/Settings/ExpenseCategoriesTab.tsx',
      drugtypes: 'src/pages/Settings/DrugTypesTab.tsx',
    },
    units: 'src/pages/Settings/UnitsTab.tsx',
    'drug-usage': {
      _self: 'src/pages/Settings/LabelLookupTab.tsx',
      preset: 'src/pages/Settings/LabelPresetTab.tsx',
    },
    printers: {
      _self: 'src/pages/Settings/PrintersTab.tsx',
      documents: 'src/pages/Settings/DocumentSettingsTab.tsx',
      labels: 'src/pages/Settings/LabelSettingsTab.tsx',
      receipts: 'src/pages/Settings/ReceiptSettingsTab.tsx',
    },
    database: 'src/pages/Settings/DatabaseTab.tsx',
    permissions: 'src/pages/Settings/PermissionsTab.tsx',
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

// Walk the published tab chain down the nested SUBFILE_MAP. At each level, a
// leaf string is the resolved file; a branch object's `_self` is the file for
// the branch tab itself (used as the fallback if no deeper tab is open). Stops
// at the first segment that has no entry, so partially-published chains still
// resolve to the deepest known file.
function resolveSubFile(file: string, tabs: string[]): string {
  let node: SubNode | undefined = SUBFILE_MAP[file]
  let resolved = file
  for (const seg of tabs) {
    if (node == null || typeof node === 'string') break
    const next: SubNode | undefined = node[seg]
    if (next == null) break
    node = next
    if (typeof node === 'string') resolved = node
    else if (typeof node._self === 'string') resolved = node._self
  }
  return resolved
}

function matchFilePath(pathname: string, tabs: string[]): string {
  const norm = pathname || '/'
  for (const { pattern, file } of ROUTE_FILE_MAP) {
    const pp = pattern.split('/').filter(Boolean)
    const ap = norm.split('/').filter(Boolean)
    if (pp.length !== ap.length) continue
    if (pp.every((seg, i) => seg.startsWith(':') || seg === ap[i])) {
      return resolveSubFile(file, tabs)
    }
  }
  return norm
}

const trafficLight =
  'flex items-center justify-center w-4 h-4 rounded-full transition-colors shrink-0'
const iconBase =
  'opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold leading-none select-none'

const colors = {
  close: { bg: '#FF5F57', hover: '#FF3B30', ring: '#E0443E' },
  minimize: { bg: '#28CA41', hover: '#1EAB31', ring: '#1D8E2B' },
  maximize: { bg: '#FFBD2E', hover: '#FF9F0A', ring: '#DEA123' },
}

// Presets must respect the locked window min (1440 x 800 in electron/main.ts) —
// anything smaller would be clamped by the OS and not match its label.
const PRESETS: { label: string; w: number; h: number; note?: string }[] = [
  { label: '1440 × 800', w: 1440, h: 800, note: 'เล็กสุด' },
  { label: '1536 × 864', w: 1536, h: 864, note: '1080p @125%' },
  { label: '1600 × 900', w: 1600, h: 900 },
  { label: '1920 × 1080', w: 1920, h: 1080, note: 'FHD' },
]

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState<'close' | 'minimize' | 'maximize' | null>(null)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const location = useLocation()
  const devTabs = useDevTabStore((s) => s.tabs)
  // DEV ONLY — role switch (admin <-> staff) for testing. REMOVE before release.
  const currentUser = useUserStore((s) => s.current)
  // DEV ONLY — UI review-notes overlay launcher (moved up from a floating widget).
  const noting = useReviewOverlayStore((s) => s.noting)
  const noteCount = useReviewOverlayStore((s) => s.count)
  const toggleNoting = useReviewOverlayStore((s) => s.toggleNoting)
  const togglePanel = useReviewOverlayStore((s) => s.togglePanel)

  const filePath = matchFilePath(location.pathname, devTabs)

  // DEV ONLY — flip both the renderer store (UI gating) AND the authoritative
  // main-side session (IPC enforcement) so the whole stack reflects the new role.
  const switchRole = async () => {
    if (!currentUser) return
    const next = currentUser.role === 'owner' ? 'pharmacist'
      : currentUser.role === 'pharmacist' ? 'staff' : 'owner'
    const res = await window.api.auth.devSetRole(next)
    // Pull the fresh permission snapshot back so useCan reflects the new role
    // (not the stale owner snapshot). res is null only when packaged (no-op).
    useUserStore.getState().login({ ...currentUser, role: next, permissions: res?.permissions })
  }

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
  const close = () => setConfirmClose(true)
  const setSize = (w: number, h: number) => {
    window.api.window.setSize(w, h)
    setResizeOpen(false)
    setTimeout(() => window.api.window.isMaximized().then(setMaximized), 50)
  }

  return (
    <div
      data-review-ui
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

        {/* DEV ONLY — role switch (owner/pharmacist/staff) for testing. REMOVE before release. */}
        {import.meta.env.DEV && currentUser && (
          <>
            <div className="w-px h-3.5 bg-border mx-0.5" />
            <button
              type="button"
              onClick={switchRole}
              title="สลับ role (เจ้าของร้าน/เภสัชกร/พนักงาน) สำหรับทดสอบ"
              className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs transition-colors ${
                currentUser.role === 'owner'
                  ? 'text-primary hover:bg-primary-soft/60'
                  : currentUser.role === 'pharmacist'
                    ? 'text-info hover:bg-info-soft/60'
                    : 'text-accent-foreground hover:bg-amber-soft/60'
              }`}
            >
              {currentUser.role === 'owner'
                ? <ShieldCheck className="size-3.5" />
                : <User className="size-3.5" />
              }
              <span>{currentUser.role === 'owner' ? 'เจ้าของร้าน' : currentUser.role === 'pharmacist' ? 'เภสัชกร' : 'พนักงาน'}</span>
            </button>
          </>
        )}

        {/* DEV ONLY — UI review-notes launcher (toggle note mode + open list panel). */}
        {import.meta.env.DEV && (
          <>
            <div className="w-px h-3.5 bg-border mx-0.5" />
            <button
              type="button"
              onClick={toggleNoting}
              title="เปิด/ปิดโหมดปักโน้ต (Alt + N — ใช้ได้แม้เปิดโมดอลอยู่)"
              className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs transition-colors ${
                noting
                  ? 'text-accent-soft-foreground bg-accent-soft'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              <MessageSquarePlus className="size-3.5" />
              <span>{noting ? 'กำลังปักโน้ต' : 'โหมดโน้ต'}</span>
            </button>
            <button
              type="button"
              onClick={togglePanel}
              title="รายการโน้ตรีวิว UI (Alt + L)"
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <List className="size-3.5" />
              <span>{noteCount}</span>
            </button>
          </>
        )}
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

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        variant="destructive"
        title="ออกจากโปรแกรม?"
        description="คุณต้องการออกจากโปรแกรม ระบบจะสำรองข้อมูลอัตโนมัติก่อนปิด"
        confirmLabel="ยืนยัน"
        cancelLabel="ยกเลิก"
        onConfirm={() => {
          setConfirmClose(false)
          window.api.window.close()
        }}
      />
    </div>
  )
}
