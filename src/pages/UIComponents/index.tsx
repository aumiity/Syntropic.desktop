import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import tailwindColors from 'tailwindcss/colors'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Card, CardHeader, CardTitle, CardDescription,
  CardContent, CardFooter, CardAction,
} from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, TableCaption,
} from '@/components/ui/table'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Popover, PopoverTrigger, PopoverContent,
  PopoverHeader, PopoverTitle, PopoverDescription,
} from '@/components/ui/popover'
import { Pagination } from '@/components/ui/pagination'
import { DateInput } from '@/components/ui/date-input'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Calendar } from '@/components/ui/calendar'
import {
  Search, Plus, Edit, Trash2, Info,
  AlertTriangle, CheckCircle, Package, ChevronRight,
} from 'lucide-react'

// ─── Layout helpers ───────────────────────────────────────────────────────────

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
      'rounded-xl border border-border bg-card overflow-hidden',
      full && 'col-span-full',
    )}>
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3 gap-4">
        <span className="font-semibold text-sm text-foreground">{title}</span>
        <code className="text-[11px] font-mono text-muted-foreground bg-muted border border-border/60 px-2 py-0.5 rounded-md shrink-0">
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
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

type ColorTokenRow = {
  token: string
  light: string
  dark: string
}

type SelectedPaletteColor = {
  family: string
  shade: string
  hex: string
  hsl: string
}

const TAILWIND_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
] as const

const TAILWIND_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

function toCssColor(value: string) {
  const v = value.trim()
  if (!v) return null
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/i.test(v)) return `hsl(${v})`
  if (/^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lch\(|lab\(|color-mix\(|var\()/i.test(v)) return v
  return null
}

function hexToHslTriplet(hex: string) {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null

  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/** Parse "yyyy-mm-dd" as local-time midnight, not UTC midnight */
function parseISOLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function UIComponents() {
  const { toast } = useToast()
  const [colorRows, setColorRows] = useState<ColorTokenRow[]>([])
  const [isSavingColors, setIsSavingColors] = useState(false)
  const [fontSize, setFontSize] = useState('18px')
  const [isSavingFontSize, setIsSavingFontSize] = useState(false)
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<SelectedPaletteColor | null>(null)

  // form state
  const [inputVal, setInputVal] = useState('')
  const [selectVal, setSelectVal] = useState('')
  const [checked, setChecked] = useState(false)
  const [switchOn, setSwitchOn] = useState(false)
  const [calDate, setCalDate] = useState<Date | undefined>()
  const [dateVal, setDateVal] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [page, setPage] = useState(3)

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmDestrOpen, setConfirmDestrOpen] = useState(false)
  const [confirmReasonOpen, setConfirmReasonOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [res, currentFontSize] = await Promise.all([
          window.api.settings.getThemeColors(),
          window.api.settings.getThemeFontSize(),
        ])
        const rootEntries = Object.entries(res?.root ?? {}) as Array<[string, string]>
        const darkEntries = Object.entries(res?.dark ?? {}) as Array<[string, string]>

        const seen = new Set<string>()
        const orderedTokens: string[] = []
        for (const [token] of rootEntries) {
          seen.add(token)
          orderedTokens.push(token)
        }
        for (const [token] of darkEntries) {
          if (!seen.has(token)) orderedTokens.push(token)
        }

        setColorRows(
          orderedTokens.map(token => ({
            token,
            light: res?.root?.[token] ?? res?.dark?.[token] ?? '',
            dark: res?.dark?.[token] ?? res?.root?.[token] ?? '',
          })),
        )
        if (typeof currentFontSize === 'string' && currentFontSize.trim()) {
          setFontSize(currentFontSize.trim())
        }
      } catch {
        toast('โหลดค่าสีจาก index.css ไม่สำเร็จ', 'error')
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateColorValue = (token: string, mode: 'light' | 'dark', value: string) => {
    setColorRows(prev => prev.map(row => (
      row.token === token
        ? { ...row, [mode]: value }
        : row
    )))
  }

  const saveColorTokens = async () => {
    try {
      setIsSavingColors(true)
      await window.api.settings.saveThemeColors(
        colorRows.map(({ token, light, dark }) => ({
          token,
          light: light.trim(),
          dark: dark.trim(),
        })),
      )
      toast('บันทึกสีลง src/index.css แล้ว', 'success')
    } catch {
      toast('บันทึกสีไม่สำเร็จ', 'error')
    } finally {
      setIsSavingColors(false)
    }
  }

  const saveFontSize = async () => {
    try {
      const value = fontSize.trim()
      if (!/^\d+(\.\d+)?px$/i.test(value)) {
        toast('กรุณาใส่ขนาดฟอนต์เป็น px เช่น 18px', 'error')
        return
      }
      setIsSavingFontSize(true)
      await window.api.settings.saveThemeFontSize(value)
      toast('บันทึกขนาดฟอนต์ลง src/index.css แล้ว', 'success')
    } catch {
      toast('บันทึกขนาดฟอนต์ไม่สำเร็จ', 'error')
    } finally {
      setIsSavingFontSize(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background">

      {/* ── Header ── */}
      <div className="border-b border-border bg-card px-8 py-6">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Component Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All UI primitives available in{' '}
          <code className="font-mono bg-muted border border-border/60 px-1.5 py-0.5 rounded text-xs">
            src/components/ui/
          </code>
          {' '}— click each component to interact.
        </p>
      </div>

      <div className="p-8">
        <Tabs defaultValue="components" className="w-full max-w-6xl rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <TabsList className="mb-0">
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="color-ui">Color UI</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="color-ui" className="m-0 p-6">
            <div className="grid grid-cols-2 gap-4">
              {/* ── COLOR TOKENS ── */}
              <Section title="Color Tokens (from index.css)" path="src/index.css" full>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    แก้ค่า HSL ได้จากหน้านี้ แล้วกดบันทึกเพื่อเขียนลงไฟล์ <code className="font-mono">src/index.css</code>
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 w-24 text-xs font-mono"
                      value={fontSize}
                      onChange={e => setFontSize(e.target.value)}
                      placeholder="18px"
                    />
                    <Button size="sm" variant="outline" onClick={saveFontSize} disabled={isSavingFontSize}>
                      {isSavingFontSize ? 'กำลังบันทึก...' : 'บันทึกขนาดฟอนต์'}
                    </Button>
                    <Button size="sm" onClick={saveColorTokens} disabled={isSavingColors}>
                      {isSavingColors ? 'กำลังบันทึก...' : 'บันทึกสีลงไฟล์'}
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[190px_1fr_1fr] bg-muted/40 border-b border-border">
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Token</div>
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Light (:root)</div>
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Dark (.dark)</div>
                  </div>
                  {colorRows.map(({ token, light, dark }) => {
                    const lightPreview = toCssColor(light)
                    const darkPreview = toCssColor(dark)
                    return (
                      <div key={token} className="grid grid-cols-[190px_1fr_1fr] border-b border-border last:border-b-0 bg-card">
                        <div className="px-3 py-2 flex items-center">
                          <p className="text-[11px] font-mono text-foreground">{token}</p>
                        </div>
                        <div className="px-3 py-2">
                          <div
                            className="h-7 rounded-md px-2 flex items-center justify-between"
                            style={{
                              backgroundColor: lightPreview ?? 'hsl(var(--muted))',
                              border: lightPreview ? undefined : '1px dashed hsl(var(--border))',
                            }}
                          >
                            <span className="text-[10px] font-semibold text-foreground">Aa</span>
                            <Input
                              className="h-6 w-40 border-border/70 bg-background/85 text-[10px] font-mono text-foreground placeholder:text-muted-foreground"
                              value={light}
                              onChange={e => updateColorValue(token, 'light', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="px-3 py-2">
                          <div
                            className="h-7 rounded-md px-2 flex items-center justify-between"
                            style={{
                              backgroundColor: darkPreview ?? 'hsl(var(--muted))',
                              border: darkPreview ? undefined : '1px dashed hsl(var(--border))',
                            }}
                          >
                            <span className="text-[10px] leading-none text-foreground">Aa</span>
                            <Input
                              className="h-6 w-40 border-border/70 bg-background/85 text-[10px] font-mono text-foreground placeholder:text-muted-foreground"
                              value={dark}
                              onChange={e => updateColorValue(token, 'dark', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">Tailwind Full Palette (HSL)</p>
                    <p className="text-xs text-muted-foreground">คลิกที่สีเพื่อดูโค้ดสีด้านล่าง</p>
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                    {selectedPaletteColor ? (
                      <div className="flex items-center justify-center gap-3 text-xs">
                        <div
                          className="size-8 rounded border border-border shrink-0"
                          style={{ backgroundColor: selectedPaletteColor.hex }}
                        />
                        <p className="font-semibold text-xs text-foreground">{selectedPaletteColor.family}-{selectedPaletteColor.shade}</p>
                        <p className="font-mono text-xs text-muted-foreground">{selectedPaletteColor.hex}</p>
                        <p className="font-mono text-xs text-muted-foreground">{selectedPaletteColor.hsl}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">ยังไม่ได้เลือกสี</p>
                    )}
                  </div>
                  <div className="space-y-2 mt-3">
                    <div className="flex items-stretch gap-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      <span className="text-xs w-16 shrink-0">Family</span>
                      <div className="grid grid-cols-11 gap-1 flex-1 min-w-0">
                        {TAILWIND_SHADES.map(shade => (
                          <span key={`shade-head-${shade}`} className="text-center text-xs">{shade}</span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-border overflow-hidden bg-background divide-y divide-border">
                      {TAILWIND_FAMILIES.map(family => (
                        <div key={family} className="flex items-center gap-2 px-2 py-0.5">
                          <span className="w-16 shrink-0 text-xs font-semibold text-foreground">{family}</span>
                          <div className="grid grid-cols-11 flex-1 min-w-0 gap-0.5">
                            {TAILWIND_SHADES.map(shade => {
                              const hex = (tailwindColors as any)?.[family]?.[shade] as string | undefined
                              if (!hex) {
                                return (
                                  <div
                                    key={`${family}-${shade}-empty`}
                                    className="h-8 w-full rounded border border-transparent"
                                    aria-hidden="true"
                                  />
                                )
                              }
                              const hslValue = hexToHslTriplet(hex) ?? '-'
                              const isActive =
                                selectedPaletteColor?.family === family &&
                                selectedPaletteColor?.shade === shade
                              return (
                                <button
                                  key={`${family}-${shade}`}
                                  type="button"
                                  onClick={() => setSelectedPaletteColor({ family, shade, hex, hsl: hslValue })}
                                  className={cn(
                                    'h-8 w-full rounded border transition-all',
                                    isActive ? 'border-foreground ring-2 ring-ring/40' : 'border-border hover:border-foreground/40'
                                  )}
                                  style={{ backgroundColor: hex }}
                                  title={`${family}-${shade} | ${hslValue} | ${hex}`}
                                />
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          </TabsContent>

          <TabsContent value="components" className="m-0 p-6">
            <div className="grid grid-cols-2 gap-4">
              {/* ── BUTTON ── */}
              <Section title="Button" path="src/components/ui/button.tsx" full>
                <DemoRow label="Variants">
                  <Button variant="default">Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="success">Success</Button>
                  <Button variant="warning">Warning</Button>
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
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="destructive">Destructive</Badge>
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
                  {inputVal && <span className="text-xs text-muted-foreground">ค่า: {inputVal}</span>}
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
              </Section>

              {/* ── TABS ── */}
              <Section title="Tabs" path="src/components/ui/tabs.tsx" full>
                <DemoRow label="Default (Pill)">
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList>
                      <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
                      <TabsTrigger value="detail">รายละเอียด</TabsTrigger>
                      <TabsTrigger value="history">ประวัติ</TabsTrigger>
                      <TabsTrigger value="disabled" disabled>ปิดใช้งาน</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เนื้อหาแท็บ <strong className="text-foreground">ภาพรวม</strong> — สรุปข้อมูลทั่วไป
                      </div>
                    </TabsContent>
                    <TabsContent value="detail">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เนื้อหาแท็บ <strong className="text-foreground">รายละเอียด</strong> — ข้อมูลเพิ่มเติม
                      </div>
                    </TabsContent>
                    <TabsContent value="history">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เนื้อหาแท็บ <strong className="text-foreground">ประวัติ</strong> — บันทึกการเปลี่ยนแปลง
                      </div>
                    </TabsContent>
                  </Tabs>
                </DemoRow>
                <DemoRow label="Line Variant">
                  <Tabs defaultValue="all" className="w-full">
                    <TabsList variant="line">
                      <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
                      <TabsTrigger value="active">ใช้งาน</TabsTrigger>
                      <TabsTrigger value="expired">หมดอายุ</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        แสดงทั้งหมด
                      </div>
                    </TabsContent>
                    <TabsContent value="active">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        เฉพาะที่ใช้งานอยู่
                      </div>
                    </TabsContent>
                    <TabsContent value="expired">
                      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        สินค้าหมดอายุ
                      </div>
                    </TabsContent>
                  </Tabs>
                </DemoRow>
                <DemoRow label="Vertical Orientation">
                  <Tabs defaultValue="a" orientation="vertical" className="w-full max-w-sm">
                    <TabsList>
                      <TabsTrigger value="a">ข้อมูลยา</TabsTrigger>
                      <TabsTrigger value="b">คลังสินค้า</TabsTrigger>
                      <TabsTrigger value="c">ผู้จัดจำหน่าย</TabsTrigger>
                    </TabsList>
                    <TabsContent value="a">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        ข้อมูลยา
                      </div>
                    </TabsContent>
                    <TabsContent value="b">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        คลังสินค้า
                      </div>
                    </TabsContent>
                    <TabsContent value="c">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        ผู้จัดจำหน่าย
                      </div>
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
                          <p className="text-xs text-muted-foreground">รายการสินค้าทั้งหมด</p>
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

              {/* ── TABLE ── */}
              <Section title="Table" path="src/components/ui/table.tsx" full>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชื่อสินค้า</TableHead>
                      <TableHead>หมวดหมู่</TableHead>
                      <TableHead className="text-right">ราคาขาย (฿)</TableHead>
                      <TableHead className="text-right">สต็อก</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="w-20">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PRODUCTS.map(row => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.cat}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{row.price}</TableCell>
                        <TableCell className="text-right">{row.stock.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={row.status}>{STATUS_LABEL[row.status]}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon-sm"><Edit /></Button>
                            <Button variant="ghost" size="icon-sm"><Trash2 /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableCaption>ตัวอย่างตารางสินค้า 4 รายการ</TableCaption>
                </Table>
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
                        <DialogDescription>
                          กรอกข้อมูลสินค้าที่ต้องการเพิ่มเข้าระบบ
                        </DialogDescription>
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
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                          ยกเลิก
                        </Button>
                        <Button onClick={() => { setDialogOpen(false); toast('บันทึกสำเร็จ', 'success') }}>
                          บันทึก
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </DemoRow>
                <p className="text-xs text-muted-foreground">
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

              {/* ── PAGINATION ── */}
              <Section title="Pagination" path="src/components/ui/pagination.tsx">
                <DemoRow label="Interactive (10 pages)">
                  <Pagination page={page} totalPages={10} onPageChange={setPage} />
                </DemoRow>
                <p className="text-xs text-muted-foreground font-mono">
                  page = {page} / totalPages = 10
                </p>
                <p className="text-xs text-muted-foreground">
                  Note: component renders <code className="font-mono">null</code> when <code className="font-mono">totalPages &lt;= 1</code>
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
                    variant="outline"
                    onClick={() => toast('กำลังประมวลผล รอสักครู่...', 'info')}
                  >
                    <Info /> Info
                  </Button>
                </DemoRow>
                <p className="text-xs text-muted-foreground">
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
                      <p className="text-xs text-muted-foreground font-mono">ISO: {dateVal}</p>
                    )}
                  </div>
                </DemoRow>
                <p className="text-xs text-muted-foreground">
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
                      <p className="text-xs text-muted-foreground font-mono">
                        {rangeFrom || '—'} → {rangeTo || '—'}
                      </p>
                    )}
                  </div>
                </DemoRow>
                <p className="text-xs text-muted-foreground">
                  มี preset วันนี้ / เมื่อวาน / 7 วัน / 30 วัน / เดือนนี้ / เดือนที่แล้ว / ปีนี้ / ทั้งหมด
                </p>
              </Section>

              {/* ── CALENDAR ── */}
              <Section title="Calendar" path="src/components/ui/calendar.tsx" full>
                <div className="grid grid-cols-2 gap-8 items-start">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                      Single Mode
                    </p>
                    <Calendar
                      mode="single"
                      selected={calDate}
                      onSelect={setCalDate}
                    />
                    {calDate && (
                      <p className="text-xs text-muted-foreground mt-2 font-mono">
                        Selected: {calDate.toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
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
                    <p className="text-xs text-muted-foreground mt-2">
                      เลือกช่วงวันผ่าน DateRangePicker ด้านบนเพื่อดูผล
                    </p>
                  </div>
                </div>
              </Section>

            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

