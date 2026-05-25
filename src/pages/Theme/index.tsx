import React, { useState, useEffect } from 'react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { ACCENT_PRESETS, HIGHLIGHT_PRESETS } from '@/lib/accent-presets'
import { TAILWIND_FAMILIES, SHADES, swatchColor } from '@/lib/tailwind-palette'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { useToast } from '@/components/ui/toast'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectItem, SelectGroup, SelectLabel,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch, Toggle } from '@/components/ui/switch'
import {
  Card, CardHeader, CardTitle, CardDescription,
  CardContent, CardFooter, CardAction,
  SectionCard, MetricCard, StatCard,
} from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell,
} from '@/components/ui/table'
import { SortableTableBody, SortableRow } from '@/components/ui/sortable'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Popover, PopoverTrigger, PopoverContent,
  PopoverHeader, PopoverTitle, PopoverDescription,
} from '@/components/ui/popover'
import { Pagination } from '@/components/ui/pagination'
import { DateInput } from '@/components/ui/date-input'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { PeriodPicker, type PeriodMode } from '@/components/ui/period-picker'
import { Calendar } from '@/components/ui/calendar'
import {
  Search, Plus, Edit, Trash2, Info, ExternalLink,
  AlertTriangle, CheckCircle, Package, ChevronRight,
  TrendingUp, FileText, Boxes, AlertCircle, Coins, Building2,
  Settings2,
} from 'lucide-react'
import { Combobox } from '@/components/ui/combobox'
import { PriceInput } from '@/components/ui/price-input'
import { UnitPickerDialog } from '@/components/ui/unit-picker-dialog'

const MODE_CARDS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'สว่าง' },
  { mode: 'auto', label: 'อัตโนมัติ' },
  { mode: 'dark', label: 'มืด' },
]

// ─── Showcase helpers ─────────────────────────────────────────────────────────

function Section({
  title, path, children, full = false,
}: {
  title: string
  path: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={cn(
      'rounded-card bg-card shadow-card overflow-hidden',
      full && 'col-span-full',
    )}>
      <div className="flex items-center justify-between bg-muted px-5 py-3 gap-4">
        <span className="font-semibold text-sm text-foreground-subtle">{title}</span>
        <code className="text-sm font-mono text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-md shrink-0">
          {path}
        </code>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  )
}

function DemoRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

// ─── Showcase constants ───────────────────────────────────────────────────────

const PRODUCTS = [
  { id: 'prd-001', name: 'Amoxicillin 500mg', cat: 'ยาต้านเชื้อ', price: '12.00', stock: 240, status: 'success' as const },
  { id: 'prd-002', name: 'Paracetamol 500mg', cat: 'ยาแก้ปวด', price: '2.50', stock: 800, status: 'success' as const },
  { id: 'prd-003', name: 'Metformin 500mg', cat: 'ยาเบาหวาน', price: '8.00', stock: 15, status: 'warning' as const },
  { id: 'prd-004', name: 'Atorvastatin 10mg', cat: 'ยาลดไขมัน', price: '35.00', stock: 0, status: 'danger' as const },
]

const STATUS_LABEL: Record<string, string> = {
  success: 'ปกติ',
  warning: 'ใกล้หมด',
  danger: 'หมดสต็อก',
}

/** Parse "yyyy-mm-dd" as local-time midnight, not UTC midnight */
function parseISOLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function Theme() {
  const { toast } = useToast()
  const { mode, accentKey, highlightKey, customColorKey,
          setMode, setAccent, setHighlight, setCustomColor, resetAccent } = useThemeStore()

  // ── component showcase state ──
  const [inputVal, setInputVal] = useState('')
  const [selectVal, setSelectVal] = useState('')
  const [checked, setChecked] = useState(false)
  const [switchOn, setSwitchOn] = useState(false)
  const [calDate, setCalDate] = useState<Date | undefined>()
  const [dateVal, setDateVal] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  // PeriodPicker showcase state — default to this-month (owner-style)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  })
  const [periodTo, setPeriodTo] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
  })
  const [page, setPage] = useState(3)
  const [pageSize, setPageSize] = useState<import('@/components/ui/pagination').PageSize>(50)
  const [tableQ, setTableQ] = useState('')
  // Standard Table-Card showcase: per-column show/hide (จัดการ column always shown)
  const [showColName, setShowColName] = useState(true)
  const [showColCategory, setShowColCategory] = useState(true)
  const [showColPrice, setShowColPrice] = useState(true)
  const [showColStock, setShowColStock] = useState(true)
  const [showColStatus, setShowColStatus] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const comboItems = [
    { id: 1, name: 'บริษัท ฟาร์มาซี จำกัด', code: 'S0001' },
    { id: 2, name: 'องค์การเภสัชกรรม', code: 'S0002' },
    { id: 3, name: 'ดีทแฮล์ม เคลเลอร์ โลจิสติกส์', code: 'S0003' },
    { id: 4, name: 'ซิลลิค ฟาร์มา', code: 'S0004' },
  ]
  const [comboVal, setComboVal] = useState<(typeof comboItems)[number] | null>(null)
  const [comboFilterVal, setComboFilterVal] = useState<(typeof comboItems)[number] | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmDestrOpen, setConfirmDestrOpen] = useState(false)
  const [confirmReasonOpen, setConfirmReasonOpen] = useState(false)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [scrollModalOpen, setScrollModalOpen] = useState(false)
  const [statFilter, setStatFilter] = useState<'all' | 'low' | 'out'>('all')
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false)
  const [seedRunning, setSeedRunning] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const [seedDaysChoice, setSeedDaysChoice] = useState<90 | 365 | 730>(90)
  const [sortRows, setSortRows] = useState(PRODUCTS)
  const [priceVal, setPriceVal] = useState<string>('120.00')
  const [unitPickerOpen, setUnitPickerOpen] = useState(false)
  const pickerUnits = [
    { id: -1, unit_name: 'เม็ด', qty_per_base: 1, price_retail: 2.5 },
    { id: 11, unit_name: 'แผง', qty_per_base: 10, price_retail: 24 },
    { id: 12, unit_name: 'กล่อง', qty_per_base: 100, price_retail: 220 },
  ]
  const [pickerUnit, setPickerUnit] = useState('เม็ด')

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="ธีม" />

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="components" className="w-full max-w-6xl rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <TabsList variant="pill" className="mb-0">
              {/* <TabsTrigger value="theme">ธีม</TabsTrigger> */}
              <TabsTrigger value="components">คอมโพเนนต์</TabsTrigger>
              <TabsTrigger value="dev">เครื่องมือ Dev</TabsTrigger>
            </TabsList>
          </div>

          {/* ── Theme Tab ───────────────────────────────────── */}
          <TabsContent value="theme" className="m-0 p-6">
            <div className="max-w-3xl space-y-8">

              {/* ── Section 1 — Mode ────────────────────────── */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-1">โหมด</h2>
                <p className="text-sm text-muted-foreground mb-4">เลือกลักษณะการแสดงผลของแอป</p>
                <div className="flex gap-4">
                  {MODE_CARDS.map(({ mode: m, label }) => {
                    const active = mode === m
                    return (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          'flex flex-col items-center gap-2 flex-1 rounded-xl border px-4 py-4 text-sm font-medium transition-all',
                          active
                            ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary/30'
                            : 'bg-muted border-border text-muted-foreground hover:bg-surface-hover',
                        )}
                      >
                        <div className={cn(
                          'w-full h-14 rounded-lg overflow-hidden border',
                          active ? 'border-primary-soft-border' : 'border-border',
                        )}>
                          {m === 'light' && <div className="w-full h-full" style={{ background: '#ffffff' }} />}
                          {m === 'dark' && <div className="w-full h-full" style={{ background: '#171717' }} />}
                          {m === 'auto' && (
                            <div className="w-full h-full flex">
                              <div className="w-1/2 h-full" style={{ background: '#ffffff' }} />
                              <div className="w-1/2 h-full" style={{ background: '#171717' }} />
                            </div>
                          )}
                        </div>
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* ── Section 2 — Accent ──────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-foreground">สีธีม</h2>
                  <Button variant="ghost" size="sm" onClick={() => resetAccent()}>
                    คืนค่าเริ่มต้น
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">เลือกสีหลักของแอปพลิเคชัน</p>
                <div className="flex flex-wrap gap-3">
                  {ACCENT_PRESETS.map(p => (
                    <button
                      key={p.key}
                      title={p.label}
                      onClick={() => setAccent(p.key)}
                      style={{ background: p.displayColor }}
                      className={cn(
                        'w-10 h-10 rounded-full transition-all',
                        accentKey === p.key
                          ? 'ring-2 ring-offset-2 ring-primary scale-110'
                          : 'hover:scale-110',
                      )}
                    />
                  ))}
                  <button
                    title="กำหนดเอง"
                    onClick={() => setAccent('custom')}
                    className={cn(
                      'w-10 h-10 rounded-full border-2 border-dashed border-border transition-all text-sm text-muted-foreground flex items-center justify-center',
                      accentKey === 'custom'
                        ? 'ring-2 ring-offset-2 ring-primary scale-110'
                        : 'hover:scale-110',
                    )}
                  >
                    +
                  </button>
                </div>
                {accentKey === 'custom' && (
                  <div className="mt-4 max-h-56 overflow-y-auto space-y-1">
                    {TAILWIND_FAMILIES.map(family => (
                      <div key={family.key} className="flex items-center gap-1">
                        <span className="w-12 shrink-0 text-sm text-muted-foreground">{family.label}</span>
                        {SHADES.map(shade => {
                          const colorKey = `${family.key}:${shade}`
                          const selected = customColorKey === colorKey
                          return (
                            <button
                              key={shade}
                              onClick={() => setCustomColor(family.key, shade)}
                              style={{ background: swatchColor(family, shade) }}
                              className={cn(
                                'w-10 h-10 rounded-sm cursor-pointer transition-all',
                                selected
                                  ? 'ring-1 ring-offset-1 ring-primary scale-110'
                                  : 'hover:scale-110',
                              )}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Section 3 — Highlight ───────────────────── */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-1">สีไฮไลต์</h2>
                <p className="text-sm text-muted-foreground mb-4">สีที่ใช้เมื่อเลือกข้อความ</p>
                <div className="flex flex-wrap gap-3">
                  {HIGHLIGHT_PRESETS.map(p => (
                    <button
                      key={p.key}
                      title={p.label}
                      onClick={() => setHighlight(p.key)}
                      style={p.color ? { background: p.color } : undefined}
                      className={cn(
                        'w-10 h-10 rounded-full border transition-all flex items-center justify-center',
                        p.color ? 'border-border' : 'bg-muted border-border',
                        highlightKey === p.key
                          ? 'ring-2 ring-offset-1 ring-primary scale-110'
                          : 'hover:scale-110',
                      )}
                    >
                      {!p.color && (
                        <span className="text-foreground-subtle text-sm font-bold">A</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Section 4 — Live Preview ────────────────── */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-1">ตัวอย่างสด</h2>
                <p className="text-sm text-muted-foreground mb-4">แสดงผลด้วยสีธีมปัจจุบัน — เปลี่ยนค่าด้านบนเพื่อดูการเปลี่ยนแปลง</p>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex gap-6">
                      {/* Fake sidebar */}
                      <div className="w-40 shrink-0 rounded-lg bg-sidebar text-sidebar-foreground p-3 space-y-2 text-sm">
                        <div className="font-semibold mb-3 text-sidebar-foreground">เมนู</div>
                        <div className="px-2 py-1.5 rounded bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                          รายการหลัก
                        </div>
                        <div className="px-2 py-1.5 rounded hover:bg-sidebar-accent/50 cursor-default">รายการอื่น</div>
                        <div className="px-2 py-1.5 rounded hover:bg-sidebar-accent/50 cursor-default">ตั้งค่า</div>
                      </div>
                      {/* Preview controls */}
                      <div className="flex-1 space-y-5">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="default">ปุ่มหลัก</Button>
                          <Button variant="secondary">รอง</Button>
                          <Button variant="tertiary">รอง3</Button>
                          <Button variant="destructive">ลบ</Button>
                        </div>
                        <div className="max-w-xs space-y-4">
                          <Input placeholder="พิมพ์ข้อความ..." />
                          <div className="flex items-center gap-3">
                            <Switch defaultChecked />
                            <span className="text-sm text-foreground">เปิดใช้งาน</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

            </div>
          </TabsContent>

          {/* ── Components Tab ──────────────────────────────── */}
          <TabsContent value="components" className="m-0 p-6">
            <div className="grid grid-cols-2 gap-4">
              {/* ── BUTTON ── */}
              <Section title="Button" path="src/components/ui/button.tsx" full>
                <DemoRow label="Variants">
                  <Button variant="default">Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="tertiary">Tertiary</Button>
                  <Button variant="brand-soft">Brand-soft</Button>
                  <Button variant="primary-soft">Primary-soft</Button>
                  <Button variant="info-soft">Info-soft</Button>
                  <Button variant="warm">Warm</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="destructive2">Destructive2</Button>
                  <Button variant="success">Success</Button>
                  <Button variant="link">Link</Button>
                </DemoRow>
                <DemoRow label="Sizes">
                  <Button size="xl">XL</Button>
                  <Button size="lg">Large</Button>
                  <Button size="default">Default</Button>
                  <Button size="sm">Small</Button>
                  <Button size="xs">XSmall</Button>
                </DemoRow>
                <DemoRow label="Icon Buttons">
                  <Button size="icon-lg" variant="outline"><Search /></Button>
                  <Button size="icon" variant="outline"><Search /></Button>
                  <Button size="icon-sm" variant="outline"><Search /></Button>
                  <Button size="icon-xs" variant="outline"><Search /></Button>
                </DemoRow>
                <DemoRow label="With Icons">
                  <Button><Plus /> เพิ่มสินค้า</Button>
                  <Button variant="outline"><Edit /> แก้ไข</Button>
                  <Button variant="destructive"><Trash2 /> ลบ</Button>
                  <Button variant="ghost"><ChevronRight /> ถัดไป</Button>
                </DemoRow>
                <DemoRow label="States">
                  <Button disabled>Disabled</Button>
                  <Button variant="outline" disabled>Disabled Outline</Button>
                  <Button variant="destructive" disabled>Disabled Destructive</Button>
                </DemoRow>
              </Section>

              {/* ── BADGE ── */}
              <Section title="Badge" path="src/components/ui/badge.tsx">
                <DemoRow label="Variants">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="tertiary">Tertiary</Badge>
                  <Badge variant="brand-soft">Brand-soft</Badge>
                  <Badge variant="info-soft">Info-soft</Badge>
                  <Badge variant="warm">Warm</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="destructive2">Destructive2</Badge>
                  <Badge variant="danger">Danger</Badge>
                  <Badge variant="ghost">Ghost</Badge>
                </DemoRow>
                <DemoRow label="In Context">
                  <div className="flex items-center gap-2 text-sm">
                    <span>สถานะ:</span>
                    <Badge variant="success">ชำระแล้ว</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span>สต็อก:</span>
                    <Badge variant="warning">ใกล้หมด</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span>ประเภท:</span>
                    <Badge variant="outline">ยาอันตราย</Badge>
                  </div>
                </DemoRow>
              </Section>

              {/* ── LABEL ── */}
              <Section title="Label" path="src/components/ui/label.tsx">
                <DemoRow label="Standalone">
                  <Label>ชื่อสินค้า</Label>
                  <Label className="text-muted-foreground">Optional label</Label>
                </DemoRow>
                <DemoRow label="With Input">
                  <div className="w-full space-y-1.5">
                    <Label htmlFor="lbl-demo">ชื่อสินค้า <span className="text-destructive">*</span></Label>
                    <Input id="lbl-demo" placeholder="ระบุชื่อสินค้า..." className="max-w-xs" />
                  </div>
                </DemoRow>
                <DemoRow label="Disabled State">
                  <div className="flex items-center gap-2 group" data-disabled="true">
                    <Checkbox id="lbl-dis" disabled />
                    <Label htmlFor="lbl-dis">ตัวเลือกนี้ถูกปิดใช้งาน</Label>
                  </div>
                </DemoRow>
              </Section>

              {/* ── INPUT ── */}
              <Section title="Input" path="src/components/ui/input.tsx">
                <DemoRow label="Default">
                  <Input
                    className="max-w-xs"
                    placeholder="พิมพ์ข้อความ..."
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                  />
                  {inputVal && <span className="text-sm text-muted-foreground">ค่า: {inputVal}</span>}
                </DemoRow>
                <DemoRow label="Types">
                  <Input className="max-w-[140px]" type="number" placeholder="0.00" />
                  <Input className="max-w-[140px]" type="password" placeholder="รหัสผ่าน" />
                </DemoRow>
                <DemoRow label="States">
                  <Input className="max-w-[180px]" placeholder="Disabled" disabled />
                  <Input className="max-w-[180px]" placeholder="Invalid" aria-invalid="true" />
                </DemoRow>
              </Section>

              {/* ── PRICE INPUT ── */}
              <Section title="PriceInput" path="src/components/ui/price-input.tsx">
                <DemoRow label="Currency (decimals=2) — ชิดขวา, tabular-nums, ว่าง→0 เมื่อ blur">
                  <PriceInput
                    className="max-w-[160px]"
                    value={priceVal}
                    onChange={setPriceVal}
                  />
                  <span className="text-sm text-muted-foreground">ค่า: {priceVal || '(ว่าง)'}</span>
                </DemoRow>
                <DemoRow label="จำนวนเต็ม (decimals=0) · ทศนิยม 3 ตำแหน่ง">
                  <PriceInput className="max-w-[160px]" decimals={0} value={undefined} onChange={() => {}} />
                  <PriceInput className="max-w-[160px]" decimals={3} value={undefined} onChange={() => {}} />
                </DemoRow>
                <DemoRow label="Disabled">
                  <PriceInput className="max-w-[160px]" value={99} onChange={() => {}} disabled />
                </DemoRow>
              </Section>

              {/* ── TEXTAREA ── */}
              <Section title="Textarea" path="src/components/ui/textarea.tsx">
                <DemoRow label="Default">
                  <Textarea className="max-w-xs" placeholder="ระบุบันทึกหรือหมายเหตุ..." />
                </DemoRow>
                <DemoRow label="States">
                  <Textarea className="max-w-[180px]" placeholder="Disabled" disabled />
                  <Textarea className="max-w-[180px]" placeholder="Invalid" aria-invalid="true" />
                </DemoRow>
              </Section>

              {/* ── SELECT ── */}
              <Section title="Select" path="src/components/ui/select.tsx">
                <DemoRow label="Default">
                  <Select value={selectVal} onValueChange={setSelectVal}>
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="เลือกประเภทยา..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>ตามกฎหมาย</SelectLabel>
                        <SelectItem value="otc">ยาไม่อันตราย (OTC)</SelectItem>
                        <SelectItem value="hazard">ยาอันตราย</SelectItem>
                        <SelectItem value="special">ยาควบคุมพิเศษ</SelectItem>
                        <SelectItem value="psycho">วัตถุออกฤทธิ์</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {selectVal && <Badge variant="outline">{selectVal}</Badge>}
                </DemoRow>
                <DemoRow label="Small Size">
                  <Select>
                    <SelectTrigger className="w-36" size="sm">
                      <SelectValue placeholder="เลือก..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">ตัวเลือก 1</SelectItem>
                      <SelectItem value="2">ตัวเลือก 2</SelectItem>
                      <SelectItem value="3">ตัวเลือก 3</SelectItem>
                    </SelectContent>
                  </Select>
                </DemoRow>
                <DemoRow label="Disabled">
                  <Select disabled>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="ปิดใช้งาน..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">ตัวเลือก 1</SelectItem>
                    </SelectContent>
                  </Select>
                </DemoRow>
              </Section>

              {/* ── CHECKBOX ── */}
              <Section title="Checkbox" path="src/components/ui/checkbox.tsx">
                <DemoRow label="Interactive">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="cb-toggle"
                      checked={checked}
                      onCheckedChange={v => setChecked(v === true)}
                    />
                    <Label htmlFor="cb-toggle">
                      สถานะ: <span className="font-mono">{checked ? 'checked' : 'unchecked'}</span>
                    </Label>
                  </div>
                </DemoRow>
                <DemoRow label="All States">
                  <div className="flex items-center gap-2">
                    <Checkbox id="cb-u" />
                    <Label htmlFor="cb-u">Unchecked</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="cb-c" defaultChecked />
                    <Label htmlFor="cb-c">Checked</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="cb-du" disabled />
                    <Label htmlFor="cb-du" className="opacity-50">Disabled</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="cb-dc" disabled defaultChecked />
                    <Label htmlFor="cb-dc" className="opacity-50">Disabled Checked</Label>
                  </div>
                </DemoRow>
              </Section>

              {/* ── SWITCH ── */}
              <Section title="Switch" path="src/components/ui/switch.tsx">
                <DemoRow label="Interactive">
                  <div className="flex items-center gap-3">
                    <Switch id="switch-focus-mode" />
                    <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
                    <span className={cn('text-sm font-medium transition-colors', !switchOn ? 'text-foreground' : 'text-muted-foreground/50')}>ปิด</span>
                    <span className="text-muted-foreground/30 text-sm select-none">/</span>
                    <span className={cn('text-sm font-medium transition-colors', switchOn ? 'text-primary' : 'text-muted-foreground/50')}>เปิด</span>
                  </div>
                </DemoRow>
                <DemoRow label="Sizes">
                  <div className="flex items-center gap-2">
                    <Switch size="lg" defaultChecked />
                    <Label>Large</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch defaultChecked />
                    <Label>Default</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch size="sm" defaultChecked />
                    <Label>Small</Label>
                  </div>
                </DemoRow>
                <DemoRow label="Disabled">
                  <div className="flex items-center gap-2">
                    <Switch disabled />
                    <Label className="opacity-50">Disabled off</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch disabled defaultChecked />
                    <Label className="opacity-50">Disabled on</Label>
                  </div>
                </DemoRow>
                <DemoRow label="Variants — default (primary) vs destructive (red when on)">
                  <div className="flex items-center gap-2">
                    <Switch size="lg" defaultChecked />
                    <Label>Default</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch size="lg" variant="destructive" defaultChecked />
                    <Label>Destructive</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch size="lg" variant="warning" defaultChecked />
                    <Label>Warning</Label>
                  </div>
                </DemoRow>
                <DemoRow label="Toggle (label + switch) — label on left, switch on right (iOS settings style)">
                  <Toggle size="lg" checked={switchOn} onChange={setSwitchOn} label="พื้นฐาน" />
                </DemoRow>
                <DemoRow label="Toggle framed — pill for dialogs / tinted bg (h-10, bg-card, border, rounded-lg)">
                  <Toggle framed size="lg" checked={switchOn} onChange={setSwitchOn} label="แสดงที่พักใช้งาน" />
                </DemoRow>
                <DemoRow label='Toggle framed="input" — top-bar variant: borderless h-10 bg-input, blends with the search Input beside it'>
                  <div className="flex items-center gap-3 w-80 rounded-card bg-card p-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <Input placeholder="ค้นหา..." className="h-10 pl-9 rounded-lg text-sm bg-input" />
                    </div>
                    <Toggle framed="input" size="lg" checked={switchOn} onChange={setSwitchOn} label="แสดงที่ปิดใช้งาน" className="shrink-0 text-muted-foreground" />
                  </div>
                </DemoRow>
                <DemoRow label="Toggle framed + destructive — กรอบธรรมดาเมื่อปิด, สวิช + กรอบแดงเมื่อเปิด (พักใช้งาน, ปิดบัญชี)">
                  <Toggle framed variant="destructive" size="lg" checked={switchOn} onChange={setSwitchOn} label="พักการใช้งาน" />
                </DemoRow>
                <DemoRow label="Toggle framed + warning — กรอบธรรมดาเมื่อปิด, สวิช + กรอบเหลืองเมื่อเปิด (เปิดการแจ้งเตือน)">
                  <Toggle framed variant="warning" size="lg" checked={switchOn} onChange={setSwitchOn} label="เปิดการแจ้งเตือน" />
                </DemoRow>
              </Section>

              {/* ── TABS ── */}
              <Section title="Tabs" path="src/components/ui/tabs.tsx" full>
                <DemoRow label="Default — equal-width grid, primary active">
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList>
                      <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
                      <TabsTrigger value="detail">รายละเอียด</TabsTrigger>
                      <TabsTrigger value="history">ประวัติ</TabsTrigger>
                      <TabsTrigger value="disabled" disabled>ปิดใช้งาน</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เนื้อหาแท็บ <strong className="text-foreground">ภาพรวม</strong> — ใช้สำหรับ navigation หลักของหน้า (ไม่ต้องระบุ variant)
                      </div>
                    </TabsContent>
                    <TabsContent value="detail">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เนื้อหาแท็บ <strong className="text-foreground">รายละเอียด</strong>
                      </div>
                    </TabsContent>
                    <TabsContent value="history">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เนื้อหาแท็บ <strong className="text-foreground">ประวัติ</strong>
                      </div>
                    </TabsContent>
                  </Tabs>
                </DemoRow>
                <DemoRow label="Pill — transparent track, larger padding">
                  <Tabs defaultValue="now" className="w-full">
                    <TabsList variant="pill">
                      <TabsTrigger value="now">วันนี้</TabsTrigger>
                      <TabsTrigger value="week">สัปดาห์นี้</TabsTrigger>
                      <TabsTrigger value="month">เดือนนี้</TabsTrigger>
                      <TabsTrigger value="year">ปีนี้</TabsTrigger>
                    </TabsList>
                    <TabsContent value="now">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ข้อมูลวันนี้</div>
                    </TabsContent>
                    <TabsContent value="week">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ข้อมูลสัปดาห์นี้</div>
                    </TabsContent>
                    <TabsContent value="month">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ข้อมูลเดือนนี้</div>
                    </TabsContent>
                    <TabsContent value="year">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ข้อมูลปีนี้</div>
                    </TabsContent>
                  </Tabs>
                </DemoRow>
                <DemoRow label="Line — underline indicator">
                  <Tabs defaultValue="info" className="w-full">
                    <TabsList variant="line">
                      <TabsTrigger value="info">ข้อมูลทั่วไป</TabsTrigger>
                      <TabsTrigger value="units">หน่วยนับ</TabsTrigger>
                      <TabsTrigger value="labels">ฉลากยา</TabsTrigger>
                      <TabsTrigger value="lots">ล็อต</TabsTrigger>
                    </TabsList>
                    <TabsContent value="info">
                      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ฟิลด์ข้อมูลทั่วไปของสินค้า</div>
                    </TabsContent>
                    <TabsContent value="units">
                      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">รายการหน่วยนับและราคา</div>
                    </TabsContent>
                    <TabsContent value="labels">
                      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ฉลากยาแบบกำหนดเอง</div>
                    </TabsContent>
                    <TabsContent value="lots">
                      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">รายการล็อตและวันหมดอายุ</div>
                    </TabsContent>
                  </Tabs>
                </DemoRow>
                <DemoRow label="Vertical orientation (any variant)">
                  <Tabs defaultValue="a" orientation="vertical" className="w-full max-w-md">
                    <TabsList variant="pill">
                      <TabsTrigger value="a">ข้อมูลยา</TabsTrigger>
                      <TabsTrigger value="b">คลังสินค้า</TabsTrigger>
                      <TabsTrigger value="c">ผู้จัดจำหน่าย</TabsTrigger>
                    </TabsList>
                    <TabsContent value="a">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ข้อมูลยา</div>
                    </TabsContent>
                    <TabsContent value="b">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">คลังสินค้า</div>
                    </TabsContent>
                    <TabsContent value="c">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">ผู้จัดจำหน่าย</div>
                    </TabsContent>
                  </Tabs>
                </DemoRow>
              </Section>

              {/* ── CARD ── */}
              <Section title="Card" path="src/components/ui/card.tsx" full>
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="border-b">
                      <CardTitle>ข้อมูลสินค้า</CardTitle>
                      <CardDescription>Full card with header, content, and footer</CardDescription>
                      <CardAction>
                        <Button variant="outline" size="sm"><Edit /> แก้ไข</Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">รหัสสินค้า</span>
                          <span className="font-mono">PRD-0042</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">หมวดหมู่</span>
                          <Badge variant="secondary">ยาต้านเชื้อ</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">สต็อก</span>
                          <span className="text-primary font-medium">142 เม็ด</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ราคาขาย</span>
                          <span className="font-medium">฿12.00</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" size="sm" className="ml-auto">
                        ดูรายละเอียด <ChevronRight />
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Card size="sm"</CardTitle>
                      <CardDescription>Compact variant for widgets</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                        <Package className="size-8 text-primary" />
                        <div>
                          <p className="font-semibold text-foreground">1,284</p>
                          <p className="text-sm text-muted-foreground">รายการสินค้าทั้งหมด</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Card without footer</CardTitle>
                      <CardDescription>Just header and content slots</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        การ์ดสามารถใช้ได้ทั้งแบบมี footer และไม่มี footer
                        ขึ้นอยู่กับบริบทการใช้งาน
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </Section>

              {/* ── DASHBOARD CARDS ── */}
              <Section title="SectionCard · MetricCard · StatCard" path="src/components/ui/card.tsx" full>
                <DemoRow label="SectionCard (form grouping)">
                  <div className="grid grid-cols-2 gap-4 w-full">
                    <SectionCard
                      icon={Package}
                      title="ข้อมูลสินค้า"
                      tint="primary"
                      right={<Button size="sm" variant="warm"><Edit /> แก้ไข</Button>}
                    >
                      <p className="text-sm text-muted-foreground">
                        ใช้จัดกลุ่มฟอร์มในหน้า EditProduct / Settings — มี icon, title, slot ขวา
                      </p>
                    </SectionCard>
                    <SectionCard icon={AlertTriangle} title="แจ้งเตือนสต็อก" tint="warning">
                      <p className="text-sm text-muted-foreground">tint=&quot;warning&quot;</p>
                    </SectionCard>
                  </div>
                </DemoRow>
                <DemoRow label="MetricCard (read-only KPI · `unit` inline · sub auto-tints to icon color)">
                  <div className="grid grid-cols-3 gap-4 w-full">
                    <MetricCard label="ราคาทุน" value="฿8.50" unit="/ ชิ้น" sub="เฉลี่ย ฿8.20" icon={Coins} tint="warm" />
                    <MetricCard label="ราคาขาย" value="฿15.00" unit="/ ชิ้น" sub="กำไร +6.50 (+76%)" icon={TrendingUp} tint="success" />
                    <MetricCard
                      label="คงเหลือ"
                      value="48"
                      unit="ชิ้น"
                      sub="คลิกเพื่อปรับสต็อก"
                      icon={Boxes}
                      tint="info-soft"
                      badge={<Badge variant="warning"><AlertTriangle className="size-3" /> ใกล้หมดอายุ 2 ล็อต</Badge>}
                    />
                  </div>
                </DemoRow>
                <DemoRow label="MetricCard size='sm' (compact — icon-right · 3 stacked lines: label / value+unit / sub)">
                  <div className="grid grid-cols-3 gap-4 w-full">
                    <MetricCard size="sm" label="ราคาทุน" value="฿8.50" unit="/ ชิ้น" sub="เฉลี่ย ฿8.20" icon={Coins} tint="warm" />
                    <MetricCard size="sm" label="ราคาขาย" value="฿15.00" unit="/ ชิ้น" sub="กำไร +6.50 (+76%)" icon={TrendingUp} tint="success" />
                    <MetricCard
                      size="sm"
                      label="คงเหลือ"
                      value="48"
                      unit="ชิ้น"
                      icon={Boxes}
                      tint="info-soft"
                      badge={<Badge variant="warning"><AlertTriangle className="size-3" /> 2 ล็อต</Badge>}
                    />
                  </div>
                </DemoRow>
                <DemoRow label="StatCard (clickable filter — active = ring)">
                  <div className="grid grid-cols-3 gap-4 w-full">
                    <StatCard label="ทั้งหมด" value="1,284" icon={Boxes} tint="primary"
                      isActive={statFilter === 'all'} onClick={() => setStatFilter('all')} />
                    <StatCard label="ใกล้หมด" value="7" icon={AlertTriangle} tint="warning"
                      isActive={statFilter === 'low'} onClick={() => setStatFilter('low')} />
                    <StatCard label="หมดสต็อก" value="3" icon={AlertCircle} tint="destructive"
                      isActive={statFilter === 'out'} onClick={() => setStatFilter('out')} />
                  </div>
                </DemoRow>
              </Section>

              {/* ── STANDARD TABLE-CARD ── */}
              <Section title="Standard Table-Card Layout" path="CLAUDE.md → UI Conventions" full>
                <p className="text-sm text-muted-foreground">
                  รูปแบบมาตรฐานของ Products list / EditProduct tabs — 4 แถบ:
                  แถบบน (ขาว ไม่มีเส้น, <code className="font-mono">h-14 px-2</code> — px-2 ให้ขอบ search ตรงกับ inset 8px ของตาราง) = ช่องค้นหา (ซ้าย) + Select filter / ปุ่ม action / <strong>ปุ่ม ⚙️ ตั้งค่า</strong> (ขวาสุด)
                  · column header (muted, sticky) · เนื้อหา (ขาว เลื่อนได้)
                  · แถบล่าง (ขาว + เส้นบน, <code className="font-mono">h-12 px-5</code>) = page-size selector (ซ้าย) · pagination (กลาง) · จำนวนที่พบ (ขวา)
                  — <strong>controls ในแถบบน <code className="font-mono">h-14</code> ใช้ <code className="font-mono">h-10</code></strong> (Input/Select/Combobox/DateInput/DateRangePicker + Button <code className="font-mono">size="lg" className="h-10"</code>) — ตรงกับ default ของ DateInput/DateRangePicker/Combobox.
                  ส่วน controls ในแถบล่าง <code className="font-mono">h-12</code> ใช้ <code className="font-mono">h-9</code> (Button <code className="font-mono">size="lg"</code>)
                  <br />
                  <strong>ปุ่มตั้งค่า ⚙️</strong> = <code className="font-mono">{'<Button variant="outline" size="lg" className="h-10 w-10 p-0">'}</code> + <code className="font-mono">{'<Settings2 />'}</code> ในรูป Popover (<code className="font-mono">align="end"</code> เพราะอยู่ขวาสุด) — รวบทั้ง <strong>คอลัมน์ที่แสดง</strong> (ยกเว้น <em>จัดการ</em> ซึ่งแสดงตลอด) + <strong>ตัวกรองเพิ่มเติม</strong> (เช่น "แสดงที่ปิดใช้งาน") ไว้ในที่เดียว เพื่อไม่ให้แถบ <code className="font-mono">h-14</code> รก
                </p>
                <div className="bg-card rounded-card shadow-card overflow-hidden">
                  <div className="h-14 px-2 flex items-center gap-3">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <Input
                        value={tableQ}
                        onChange={e => setTableQ(e.target.value)}
                        placeholder="ค้นหาชื่อสินค้า, บาร์โค้ด, รหัส..."
                        className="h-10 pl-9 rounded-lg text-sm bg-input"
                      />
                    </div>
                    <Select defaultValue="all">
                      <SelectTrigger className="h-10 flex-1 min-w-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกหมวดหมู่</SelectItem>
                        <SelectItem value="1">ยาต้านเชื้อ</SelectItem>
                        <SelectItem value="2">ยาแก้ปวด</SelectItem>
                        <SelectItem value="3">วิตามิน</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="lg" className="h-10 px-2 shrink-0"><Plus className="size-4" /> เพิ่มสินค้า</Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="lg" variant="outline" className="h-10 w-10 p-0 shrink-0" title="ตัวเลือกการแสดงผล">
                          <Settings2 className="size-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56">
                        <PopoverHeader>
                          <PopoverTitle>คอลัมน์ที่แสดง</PopoverTitle>
                        </PopoverHeader>
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                          <Checkbox checked={showColName} onCheckedChange={v => setShowColName(v === true)} />
                          <span className="text-sm">ชื่อสินค้า</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                          <Checkbox checked={showColCategory} onCheckedChange={v => setShowColCategory(v === true)} />
                          <span className="text-sm">หมวดหมู่</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                          <Checkbox checked={showColPrice} onCheckedChange={v => setShowColPrice(v === true)} />
                          <span className="text-sm">ราคา</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                          <Checkbox checked={showColStock} onCheckedChange={v => setShowColStock(v === true)} />
                          <span className="text-sm">สต็อก</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                          <Checkbox checked={showColStatus} onCheckedChange={v => setShowColStatus(v === true)} />
                          <span className="text-sm">สถานะ</span>
                        </label>
                        <div className="my-1 border-t border-border" />
                        <PopoverHeader>
                          <PopoverTitle>ตัวกรองเพิ่มเติม</PopoverTitle>
                        </PopoverHeader>
                        <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-muted">
                          <Checkbox checked={switchOn} onCheckedChange={v => setSwitchOn(v === true)} />
                          <span className="text-sm">แสดงที่ปิดใช้งาน</span>
                        </label>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Table containerClassName="max-h-[260px]">
                    <TableHeader>
                      <TableRow>
                        {showColName && <TableHead className="min-w-[220px]">ชื่อสินค้า</TableHead>}
                        {showColCategory && <TableHead className="min-w-40">หมวดหมู่</TableHead>}
                        {showColPrice && <TableHead className="min-w-32 text-right">ราคา (฿)</TableHead>}
                        {showColStock && <TableHead className="min-w-24 text-right">สต็อก</TableHead>}
                        {showColStatus && <TableHead className="min-w-28">สถานะ</TableHead>}
                        <TableHead className="min-w-[148px] text-center">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...PRODUCTS, ...PRODUCTS, ...PRODUCTS].map((row, i) => (
                        <TableRow key={`${row.id}-${i}`}>
                          {showColName && <TableCell className="font-medium">{row.name}</TableCell>}
                          {showColCategory && <TableCell><Badge variant="outline">{row.cat}</Badge></TableCell>}
                          {showColPrice && <TableCell className="text-right font-mono">{row.price}</TableCell>}
                          {showColStock && <TableCell className="text-right tabular-nums">{row.stock.toLocaleString()}</TableCell>}
                          {showColStatus && <TableCell><Badge variant={row.status}>{STATUS_LABEL[row.status]}</Badge></TableCell>}
                          <TableCell>
                            {/* Row actions = square icon buttons (no w-16).
                                edit=outline · info=warm · external-link=primary-soft */}
                            <div className="flex gap-1.5 justify-center">
                              <Button size="icon-lg" variant="outline" title="แก้ไข"><Edit /></Button>
                              <Button size="icon-lg" variant="warm" title="ดูรายละเอียด"><Info /></Button>
                              <Button size="icon-lg" variant="primary-soft" title="เปิดดู"><ExternalLink /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="h-12 px-5 bg-card border-t border-border flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                      <span>แสดง</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={v => setPageSize(v === 'all' ? 'all' : Number(v))}
                      >
                        <SelectTrigger className="h-9 min-w-20">
                          <SelectValue>{pageSize === 'all' ? 'ทั้งหมด' : String(pageSize)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="min-w-28">
                          {[50, 100, 250, 500, 'all'].map(opt => (
                            <SelectItem key={String(opt)} value={String(opt)}>
                              {opt === 'all' ? 'ทั้งหมด' : String(opt)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>รายการ</span>
                    </div>
                    <div className="flex-1 flex justify-center">
                      <Pagination page={page} totalPages={10} onPageChange={setPage} className="w-auto justify-center" />
                    </div>
                    <span className="text-muted-foreground shrink-0">แสดง <span className="font-semibold text-foreground tabular-nums">{PRODUCTS.length * 3}</span> รายการ</span>
                  </div>
                </div>
              </Section>

              {/* ── SORTABLE (DRAG REORDER) ── */}
              <Section title="Sortable Table (drag-to-reorder)" path="src/components/ui/sortable.tsx" full>
                <p className="text-sm text-muted-foreground">
                  ลากจัดลำดับด้วย <code className="font-mono">SortableTableBody</code> + <code className="font-mono">SortableRow</code>.
                  คอลัมน์แรกเป็น grip handle (ลากได้เฉพาะที่ handle — กันลากพลาด) state เป็นของ caller
                  (<code className="font-mono">values</code>/<code className="font-mono">onReorder</code>) ส่วนการเซฟลำดับให้ทำใน
                  <code className="font-mono">onDragEnd</code>. ใช้คู่กับปุ่มสลับโหมด "จัดลำดับ" ในแถบหัวตาราง
                </p>
                <div className="bg-card rounded-card shadow-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center min-w-16">ลาก</TableHead>
                        <TableHead className="min-w-[220px]">ชื่อสินค้า</TableHead>
                        <TableHead className="min-w-40">หมวดหมู่</TableHead>
                        <TableHead className="min-w-28">สถานะ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <SortableTableBody values={sortRows} onReorder={setSortRows}>
                      {sortRows.map(row => (
                        <SortableRow key={row.id} value={row}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell><Badge variant="outline">{row.cat}</Badge></TableCell>
                          <TableCell><Badge variant={row.status}>{STATUS_LABEL[row.status]}</Badge></TableCell>
                        </SortableRow>
                      ))}
                    </SortableTableBody>
                  </Table>
                </div>
              </Section>

              {/* ── MODAL LAYOUT ── */}
              <Section title="Modal Layout (form + scrolling body)" path="src/components/ui/dialog.tsx" full>
                <DemoRow label="Patterns">
                  <Button variant="outline" onClick={() => setFormModalOpen(true)}>ฟอร์ม 2 คอลัมน์</Button>
                  <Button variant="outline" onClick={() => setScrollModalOpen(true)}>เนื้อหายาว (body เลื่อน)</Button>
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  ทุก modal: คลิกนอกไม่ปิด · Esc ปิด · Enter = ปุ่มหลัก · บังคับโครงสร้าง
                  DialogHeader / DialogBody / DialogFooter · ปุ่ม &quot;ยกเลิก/ปิด&quot; ใช้ variant=&quot;destructive2&quot;
                </p>

                <Dialog open={formModalOpen} onOpenChange={setFormModalOpen}>
                  <DialogContent size="lg" onClose={() => setFormModalOpen(false)}>
                    <DialogHeader>
                      <DialogTitle>เพิ่มสินค้าใหม่</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>ชื่อสินค้า <span className="text-destructive">*</span></Label>
                          <Input placeholder="ระบุชื่อสินค้า..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label>บาร์โค้ด</Label>
                          <Input placeholder="สแกนหรือพิมพ์..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label>หมวดหมู่</Label>
                          <Select>
                            <SelectTrigger className="w-full"><SelectValue placeholder="เลือก..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">ยาต้านเชื้อ</SelectItem>
                              <SelectItem value="2">ยาแก้ปวด</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>หน่วยนับ</Label>
                          <Select>
                            <SelectTrigger className="w-full"><SelectValue placeholder="เลือก..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">เม็ด</SelectItem>
                              <SelectItem value="2">แผง</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>ราคาขาย</Label>
                          <Input type="number" placeholder="0.00" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>ราคาทุน</Label>
                          <Input type="number" placeholder="0.00" />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <Label>หมายเหตุ</Label>
                          <Textarea placeholder="ระบุหมายเหตุ (ถ้ามี)..." />
                        </div>
                        <div className="col-span-2 flex items-center gap-3">
                          <Switch size="lg" defaultChecked />
                          <Label>เปิดขายสินค้านี้</Label>
                        </div>
                      </div>
                    </DialogBody>
                    <DialogFooter>
                      <Button size="xl" variant="destructive2" onClick={() => setFormModalOpen(false)}>ยกเลิก</Button>
                      <Button size="xl" onClick={() => { setFormModalOpen(false); toast('บันทึกสำเร็จ', 'success') }}>บันทึก</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={scrollModalOpen} onOpenChange={setScrollModalOpen}>
                  <DialogContent size="md" onClose={() => setScrollModalOpen(false)}>
                    <DialogHeader>
                      <DialogTitle>เงื่อนไขการใช้งาน</DialogTitle>
                    </DialogHeader>
                    <DialogBody className="max-h-[50vh] overflow-y-auto space-y-3">
                      {Array.from({ length: 14 }).map((_, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          {i + 1}. ตัวอย่างเนื้อหายาวสำหรับทดสอบการเลื่อนภายใน body
                          โดยที่ส่วนหัวและส่วนท้ายของ modal ยังคงอยู่กับที่เสมอ
                        </p>
                      ))}
                    </DialogBody>
                    <DialogFooter>
                      <Button size="xl" variant="destructive2" onClick={() => setScrollModalOpen(false)}>ปิด</Button>
                      <Button size="xl" onClick={() => setScrollModalOpen(false)}>รับทราบ</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </Section>

              {/* ── DIALOG ── */}
              <Section title="Dialog" path="src/components/ui/dialog.tsx">
                <DemoRow label="Open Dialog">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">เปิด Dialog</Button>
                    </DialogTrigger>
                    <DialogContent size="md" onClose={() => setDialogOpen(false)}>
                      <DialogHeader>
                        <DialogTitle>เพิ่มสินค้าใหม่</DialogTitle>
                      </DialogHeader>
                      <DialogBody className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>ชื่อสินค้า <span className="text-destructive">*</span></Label>
                          <Input placeholder="ระบุชื่อสินค้า..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label>หมวดหมู่</Label>
                          <Select>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="เลือกหมวดหมู่..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">ยาต้านเชื้อ</SelectItem>
                              <SelectItem value="2">ยาแก้ปวด</SelectItem>
                              <SelectItem value="3">ยาเบาหวาน</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>หมายเหตุ</Label>
                          <Textarea placeholder="ระบุหมายเหตุ (ถ้ามี)..." />
                        </div>
                      </DialogBody>
                      <DialogFooter>
                        <Button size="xl" variant="destructive2" onClick={() => setDialogOpen(false)}>
                          ยกเลิก
                        </Button>
                        <Button size="xl" onClick={() => { setDialogOpen(false); toast('บันทึกสำเร็จ', 'success') }}>
                          บันทึก
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  Available sizes: <code className="font-mono">sm md lg xl 2xl full</code>
                </p>
              </Section>

              {/* ── CONFIRM DIALOG ── */}
              <Section title="ConfirmDialog" path="src/components/ui/confirm-dialog.tsx">
                <DemoRow label="Variants">
                  <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                    ยืนยันปกติ
                  </Button>
                  <Button variant="destructive" onClick={() => setConfirmDestrOpen(true)}>
                    <Trash2 /> ยืนยันลบ
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmReasonOpen(true)}>
                    <AlertTriangle /> ต้องระบุเหตุผล
                  </Button>
                </DemoRow>

                <ConfirmDialog
                  open={confirmOpen}
                  onOpenChange={setConfirmOpen}
                  title="ยืนยันการดำเนินการ"
                  description="คุณต้องการดำเนินการนี้หรือไม่?"
                  onConfirm={() => { setConfirmOpen(false); toast('ยืนยันแล้ว') }}
                />
                <ConfirmDialog
                  open={confirmDestrOpen}
                  onOpenChange={setConfirmDestrOpen}
                  title="ลบรายการนี้"
                  description="การลบจะไม่สามารถกู้คืนได้ คุณแน่ใจหรือไม่?"
                  variant="destructive"
                  confirmLabel="ลบ"
                  onConfirm={() => { setConfirmDestrOpen(false); toast('ลบแล้ว', 'error') }}
                />
                <ConfirmDialog
                  open={confirmReasonOpen}
                  onOpenChange={setConfirmReasonOpen}
                  title="ยกเลิกใบสั่งซื้อ"
                  description="กรุณาระบุเหตุผลในการยกเลิก"
                  requireReason
                  reasonLabel="เหตุผลการยกเลิก"
                  confirmLabel="ยกเลิกใบสั่งซื้อ"
                  variant="destructive"
                  onConfirm={reason => {
                    setConfirmReasonOpen(false)
                    toast(`ยกเลิกแล้ว: ${reason}`, 'info')
                  }}
                />
              </Section>

              {/* ── UNIT PICKER DIALOG ── */}
              <Section title="UnitPickerDialog" path="src/components/ui/unit-picker-dialog.tsx">
                <DemoRow label="เลือกหน่วย (POS / Purchase) — แถวฐาน id=-1 อยู่บนสุด badge 'หลัก'">
                  <Button variant="outline" onClick={() => setUnitPickerOpen(true)}>เปิดตัวเลือกหน่วย</Button>
                  <span className="text-sm text-muted-foreground">หน่วยที่เลือก: {pickerUnit}</span>
                </DemoRow>
                <UnitPickerDialog
                  open={unitPickerOpen}
                  onClose={() => setUnitPickerOpen(false)}
                  productName="พาราเซตามอล 500 มก."
                  units={pickerUnits}
                  activeUnitName={pickerUnit}
                  onSelect={(u) => { setPickerUnit(u.unit_name ?? ''); setUnitPickerOpen(false) }}
                />
              </Section>

              {/* ── POPOVER ── */}
              <Section title="Popover" path="src/components/ui/popover.tsx">
                <DemoRow label="With Header + Content">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline"><Info /> รายละเอียดล็อต</Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <PopoverHeader>
                        <PopoverTitle>ล็อต LOT-2024-001</PopoverTitle>
                        <PopoverDescription>ข้อมูลล็อตสินค้าปัจจุบัน</PopoverDescription>
                      </PopoverHeader>
                      <div className="text-sm space-y-1.5 text-muted-foreground">
                        <div className="flex justify-between">
                          <span>วันที่รับ</span>
                          <span className="text-foreground font-medium">01/06/2024</span>
                        </div>
                        <div className="flex justify-between">
                          <span>วันหมดอายุ</span>
                          <span className="text-foreground font-medium">31/12/2025</span>
                        </div>
                        <div className="flex justify-between">
                          <span>คงเหลือ</span>
                          <span className="text-primary font-medium">142 เม็ด</span>
                        </div>
                        <div className="flex justify-between">
                          <span>ราคาทุน</span>
                          <span className="text-foreground font-medium">฿8.50</span>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </DemoRow>
                <DemoRow label="Minimal (No Header)">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="icon-sm" variant="ghost"><Info /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56">
                      <p className="text-sm text-muted-foreground">
                        Popover เล็กไม่มี header เหมาะสำหรับ tooltip ที่มีเนื้อหาหลายบรรทัด
                      </p>
                    </PopoverContent>
                  </Popover>
                </DemoRow>
              </Section>

              {/* ── COMBOBOX ── */}
              <Section title="Combobox" path="src/components/ui/combobox.tsx">
                <DemoRow label="Searchable select (click → search inside)">
                  <div className="w-72">
                    <Combobox
                      items={comboItems}
                      value={comboVal}
                      onChange={setComboVal}
                      getKey={(s) => s.id}
                      getLabel={(s) => s.name}
                      getSublabel={(s) => s.code}
                      icon={Building2}
                      placeholder="— เลือกผู้จำหน่าย —"
                      searchPlaceholder="ชื่อหรือรหัส..."
                      emptyText="ไม่พบรายการ"
                    />
                  </div>
                </DemoRow>
                <DemoRow label="With empty/all row (filter mode) — h-10 เท่ากับ Input / DateInput / DateRangePicker">
                  <div className="w-72">
                    <Combobox
                      items={comboItems}
                      value={comboFilterVal}
                      onChange={setComboFilterVal}
                      getKey={(s) => s.id}
                      getLabel={(s) => s.name}
                      getSublabel={(s) => s.code}
                      icon={Building2}
                      emptyLabel="ทุกผู้จัดจำหน่าย"
                      searchPlaceholder="ชื่อหรือรหัส..."
                      emptyText="ไม่พบรายการ"
                    />
                  </div>
                </DemoRow>
              </Section>

              {/* ── PAGINATION ── */}
              <Section title="Pagination" path="src/components/ui/pagination.tsx">
                <DemoRow label="Interactive (10 pages)">
                  <Pagination page={page} totalPages={10} onPageChange={setPage} />
                </DemoRow>
                <p className="text-sm text-muted-foreground font-mono">
                  page = {page} / totalPages = 10
                </p>
                <DemoRow label="Few pages (≤7, no ellipsis)">
                  <Pagination page={2} totalPages={5} onPageChange={() => {}} />
                </DemoRow>
                <DemoRow label="At first page">
                  <Pagination page={1} totalPages={20} onPageChange={() => {}} />
                </DemoRow>
                <DemoRow label="Middle page">
                  <Pagination page={10} totalPages={20} onPageChange={() => {}} />
                </DemoRow>
                <DemoRow label="At last page">
                  <Pagination page={20} totalPages={20} onPageChange={() => {}} />
                </DemoRow>
                <DemoRow label="With page-size selector (full-width footer)">
                  <div className="w-full px-4 h-12 border-t border-border bg-card flex items-center">
                    <Pagination
                      page={page}
                      totalPages={10}
                      onPageChange={setPage}
                      pageSize={pageSize}
                      onPageSizeChange={setPageSize}
                    />
                  </div>
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  Note: page-nav-only mode renders <code className="font-mono">null</code> when <code className="font-mono">totalPages {'<='} 1</code>. Pass both <code className="font-mono">pageSize</code> and <code className="font-mono">onPageSizeChange</code> to show the selector (default options <code className="font-mono">[50, 100, 250, 500, &apos;all&apos;]</code>) — layout becomes full-width <code className="font-mono">justify-between</code>: selector on the left, page nav on the right. Pages collapse to ellipsis (first, last, current ±1) when <code className="font-mono">totalPages {'>'} 7</code>.
                </p>
              </Section>

              {/* ── TOAST ── */}
              <Section title="Toast + useToast()" path="src/components/ui/toast.tsx" full>
                <DemoRow label="Trigger Each Type">
                  <Button
                    variant="success"
                    onClick={() => toast('บันทึกข้อมูลสำเร็จแล้ว', 'success')}
                  >
                    <CheckCircle /> Success
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => toast('เกิดข้อผิดพลาด ไม่สามารถบันทึกได้', 'error')}
                  >
                    <AlertTriangle /> Error
                  </Button>
                  <Button
                    variant="warm"
                    onClick={() => toast('ดูข้อมูลย้อนหลังได้สูงสุด 7 วัน', 'warning')}
                  >
                    <AlertTriangle /> Warning
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toast('กำลังประมวลผล รอสักครู่...', 'info')}
                  >
                    <Info /> Info
                  </Button>
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  ใช้ <code className="font-mono bg-muted px-1 rounded">useToast()</code> hook แล้วเรียก{' '}
                  <code className="font-mono bg-muted px-1 rounded">toast(message, type?, duration?)</code>.
                  Toast จะแสดงที่มุมขวาล่างของหน้าจอ
                </p>
              </Section>

              {/* ── DATE INPUT ── */}
              <Section title="DateInput" path="src/components/ui/date-input.tsx">
                <DemoRow label="With Calendar Picker">
                  <div className="w-full space-y-1.5">
                    <Label>วันที่รับสินค้า</Label>
                    <DateInput
                      value={dateVal}
                      onChange={setDateVal}
                      className="max-w-xs"
                    />
                    {dateVal && (
                      <p className="text-sm text-muted-foreground font-mono">ISO: {dateVal}</p>
                    )}
                  </div>
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  รับ / ส่งค่าเป็น ISO <code className="font-mono">yyyy-mm-dd</code>.
                  แสดงผลเป็น <code className="font-mono">dd/mm/yyyy</code>. มี calendar picker ในตัว.
                </p>
              </Section>

              {/* ── DATE RANGE PICKER ── */}
              <Section title="DateRangePicker" path="src/components/ui/date-range-picker.tsx">
                <DemoRow label="With Presets">
                  <div className="w-full space-y-1.5">
                    <Label>ช่วงวันที่รายงาน</Label>
                    <DateRangePicker
                      from={rangeFrom}
                      to={rangeTo}
                      onChange={(f, t) => { setRangeFrom(f); setRangeTo(t) }}
                      className="max-w-xs"
                    />
                    {(rangeFrom || rangeTo) && (
                      <p className="text-sm text-muted-foreground font-mono">
                        {rangeFrom || '—'} → {rangeTo || '—'}
                      </p>
                    )}
                  </div>
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  มี preset วันนี้ / เมื่อวาน / 7 วัน / 30 วัน / เดือนนี้ / เดือนที่แล้ว / ปีนี้ / ทั้งหมด.
                  ใช้ในหน้า <strong>filter / list ทั่วไป</strong> (Manage/Sales, Manage/Purchases, Expiry).
                </p>
              </Section>

              {/* ── PERIOD PICKER ── */}
              <Section title="PeriodPicker" path="src/components/ui/period-picker.tsx" full>
                <DemoRow label="Granularity-first (วัน/เดือน/ปี/กำหนดเอง) + Prev/Next stepper">
                  <div className="w-full space-y-3">
                    <PeriodPicker
                      mode={periodMode}
                      from={periodFrom}
                      to={periodTo}
                      onChange={(m, f, t) => { setPeriodMode(m); setPeriodFrom(f); setPeriodTo(t) }}
                      align="start"
                    />
                    <p className="text-sm text-muted-foreground font-mono">
                      mode: <span className="text-foreground">{periodMode}</span>{' · '}
                      {periodFrom} → {periodTo}
                    </p>
                  </div>
                </DemoRow>
                <DemoRow label="Non-owner — only [วัน] [กำหนดเอง] exposed">
                  <PeriodPicker
                    mode={periodMode === 'month' || periodMode === 'year' ? 'day' : periodMode}
                    from={periodFrom}
                    to={periodTo}
                    onChange={(m, f, t) => { setPeriodMode(m); setPeriodFrom(f); setPeriodTo(t) }}
                    allowedModes={['day', 'custom']}
                    align="start"
                  />
                </DemoRow>
                <p className="text-sm text-muted-foreground">
                  ใช้แทน <code className="font-mono bg-muted px-1 rounded">DateRangePicker</code> ในหน้า <strong>รายงาน/แดชบอร์ด</strong> ที่
                  ผู้ใช้ต้องการเลือก "ทั้งเดือน/ทั้งปี" ทีเดียวบ่อย ๆ — pattern แบบ Hygeia.
                  Prev/next stepper เลื่อนหน่วยเวลาทีละ 1 หน่วยตาม mode (custom = shift by range length).
                  ใช้ <code className="font-mono bg-muted px-1 rounded">defaultPeriodFor(isOwner)</code> + <code className="font-mono bg-muted px-1 rounded">allowedModesFor(isOwner)</code> helper ใน parent.
                </p>
              </Section>

              {/* ── CALENDAR ── */}
              <Section title="Calendar" path="src/components/ui/calendar.tsx" full>
                <div className="grid grid-cols-2 gap-8 items-start">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                      Single Mode
                    </p>
                    <Calendar
                      mode="single"
                      selected={calDate}
                      onSelect={setCalDate}
                    />
                    {calDate && (
                      <p className="text-sm text-muted-foreground mt-2 font-mono">
                        Selected: {calDate.toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                      Range Mode — linked to DateRangePicker above
                    </p>
                    <Calendar
                      mode="range"
                      selected={
                          rangeFrom
                            ? {
                                from: parseISOLocal(rangeFrom),
                                to:   rangeTo ? parseISOLocal(rangeTo) : undefined,
                              }
                            : undefined
                        }
                      numberOfMonths={1}
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      เลือกช่วงวันผ่าน DateRangePicker ด้านบนเพื่อดูผล
                    </p>
                  </div>
                </div>
              </Section>

            </div>
          </TabsContent>

          {/* ── Dev Tools Tab ──────────────────────────────── */}
          <TabsContent value="dev" className="m-0 p-6">
            <div className="max-w-3xl space-y-6">
              <SectionCard
                icon={Boxes}
                title="Seed ข้อมูลขาย/รับของย้อนหลัง"
                tint="info-soft"
              >
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>สร้างข้อมูลทดสอบย้อนหลัง (เลือก 90 / 365 / 730 วัน) — ใช้ products / suppliers / customers ที่ seed แล้ว ผ่าน business logic เดียวกับ POS / GR จริง</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-2">
                      <li>ใบรับสินค้า (GR) — 3-6 ใบ/วัน, 5-30 รายการ/ใบ <strong>แบบ stock-aware</strong> (สินค้าต่ำกว่าจุดสั่งซื้อจะถูกเติมก่อน)</li>
                      <li>มี Lot ทุกสินค้า — รับเข้าทุก SKU ตั้งแต่วันแรก จำนวน lot สะสมตาม turnover จริง</li>
                      <li>ใบขาย (RC) — 80-100 ใบ/วัน, 1-12 รายการ/ใบ, FEFO ถูกต้อง</li>
                      <li>บิลละ 50-2,000 บาท เฉลี่ย ~150 บ./บิล → ยอดรายวัน ~10,000-20,000 บ.</li>
                      <li>สต็อกแต่ละ SKU เพดาน = <code className="bg-muted px-1 rounded">safety_stock × 3</code>, opening ≈ safety × 1.5-2.5 (default safety = 200 หาก NULL)</li>
                      <li>กระจาย supplier / payment / discount / customer</li>
                    </ul>
                    <p className="pt-2 font-semibold text-foreground">End-state ที่การันตี:</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-2">
                      <li>20 SKU หมดสต็อก</li>
                      <li>80-100 SKU ต่ำกว่าจุดสั่งซื้อ</li>
                      <li>20 SKU expired</li>
                      <li>40 SKU near-expire (30-90 วัน)</li>
                    </ul>
                    <p className="pt-2">
                      <span className="font-semibold text-foreground">Idempotent</span> — รันซ้ำได้, ลบ seed เดิม (โดย note marker <code className="bg-muted px-1 rounded">[DEV-SEED]</code>) แล้วสร้างใหม่. แต่ละปุ่มสร้างชุดข้อมูลของตัวเอง ไม่ต้องกดเรียงลำดับ. ข้อมูลที่กรอกผ่าน UI จะไม่โดนแตะ
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      variant="info-soft"
                      size="lg"
                      onClick={() => { setSeedDaysChoice(90); setSeedConfirmOpen(true) }}
                      disabled={seedRunning}
                    >
                      90 วัน
                    </Button>
                    <Button
                      variant="brand-soft"
                      size="lg"
                      onClick={() => { setSeedDaysChoice(365); setSeedConfirmOpen(true) }}
                      disabled={seedRunning}
                    >
                      365 วัน (1 ปี)
                    </Button>
                    <Button
                      variant="default"
                      size="lg"
                      onClick={() => { setSeedDaysChoice(730); setSeedConfirmOpen(true) }}
                      disabled={seedRunning}
                    >
                      730 วัน (2 ปี)
                    </Button>
                    {seedRunning && (
                      <span className="text-sm text-muted-foreground">กำลัง seed... (อาจใช้เวลาหลายนาที)</span>
                    )}
                  </div>

                  {seedResult && (
                    <div className="rounded-lg bg-success-soft border border-success/30 px-4 py-3 text-sm">
                      <div className="font-semibold text-success mb-1">เสร็จแล้ว</div>
                      <div className="text-foreground whitespace-pre-wrap">{seedResult}</div>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          </TabsContent>

        </Tabs>
      </div>

      <ConfirmDialog
        open={seedConfirmOpen}
        onOpenChange={setSeedConfirmOpen}
        title={`Seed ข้อมูลทดสอบ ${seedDaysChoice} วัน?`}
        description={`จะลบ seed dev เดิม (ถ้ามี) แล้วสร้าง GR + sales ย้อน ${seedDaysChoice} วัน พร้อม engineer end-state (หมดสต็อก/ต่ำกว่าจุดสั่งซื้อ/expired/near-expire).${seedDaysChoice >= 365 ? ' ⏱ อาจใช้เวลา 2-5 นาที.' : ''} ข้อมูลที่กรอกผ่าน UI จะไม่โดนแตะ`}
        confirmLabel="เริ่ม Seed"
        variant="default"
        onConfirm={async () => {
          setSeedRunning(true)
          setSeedResult(null)
          try {
            const res = await window.api.dev.seedSalesHistory(seedDaysChoice)
            setSeedResult(res.message)
            toast({ title: 'Seed สำเร็จ', description: res.message, variant: 'success' })
          } catch (e: any) {
            toast({ title: 'Seed ล้มเหลว', description: e?.message ?? String(e), variant: 'destructive' })
          } finally {
            setSeedRunning(false)
          }
        }}
      />
    </div>
  )
}
