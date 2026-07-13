import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Search, Plus, X, ExternalLink, ChevronDown, MoreHorizontal, GripVertical,
  Eye, Trash2, Link2, Paperclip, Upload, Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, Image as ImageIcon, TrendingUp, TrendingDown, Bell,
  Home, MapPin, Building2, Mail, Phone, MessageSquare, Settings as SettingsIcon,
  LayoutGrid, FileText, Users, Wallet, CheckCircle2, AlertCircle, Circle,
} from 'lucide-react'

// ─── Local showcase scaffolding (mirrors src/pages/Theme/index.tsx conventions,
//     duplicated locally so this page has zero coupling to the real showcase) ──

function Section({
  title, note, children, full = false,
}: {
  title: string
  note?: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={cn(
      'rounded-2xl bg-lab-card shadow-card border border-border/60 overflow-hidden',
      full && 'col-span-full',
    )}>
      <div className="flex items-center justify-between px-5 py-3 gap-4 border-b border-border/60">
        <span className="font-semibold text-sm text-foreground">{title}</span>
        {note && <span className="text-xs text-muted-foreground shrink-0">{note}</span>}
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  )
}

function SectionGroup({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="col-span-full flex items-end justify-between gap-3 pt-4 pb-1 border-b border-border">
      <div className="flex items-baseline gap-3 min-w-0">
        <h2 className="text-lg font-bold font-lab-serif text-foreground">{title}</h2>
        {subtitle && <span className="text-sm text-muted-foreground truncate">{subtitle}</span>}
      </div>
    </div>
  )
}

function DemoRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

// ─── Small reference-only primitives (not real house components — demo only) ──

type LabBadgeTone = 'draft' | 'viewed' | 'sent' | 'accepted' | 'rejected' | 'awaiting' | 'pending'

const LAB_BADGE_CLASSES: Record<LabBadgeTone, string> = {
  draft:    'bg-muted text-muted-foreground',
  viewed:   'bg-info-soft text-info-soft-foreground',
  sent:     'bg-lab-amber-soft text-lab-amber-soft-foreground',
  accepted: 'bg-lab-forest-soft text-lab-forest-soft-foreground',
  rejected: 'bg-destructive-soft text-destructive',
  awaiting: 'bg-foreground text-background',
  pending:  'bg-lab-amber text-lab-amber-foreground',
}
const LAB_BADGE_LABEL: Record<LabBadgeTone, string> = {
  draft: 'Draft', viewed: 'Viewed', sent: 'Sent', accepted: 'Accepted',
  rejected: 'Rejected', awaiting: 'Awaiting review', pending: 'Pending',
}
function LabBadge({ tone }: { tone: LabBadgeTone }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      LAB_BADGE_CLASSES[tone],
    )}>
      {LAB_BADGE_LABEL[tone]}
    </span>
  )
}

type ChecklistState = 'done' | 'blocked' | 'in-progress' | 'todo'
function ChecklistStatusIcon({ state }: { state: ChecklistState }) {
  if (state === 'done') return <CheckCircle2 className="size-4 shrink-0 text-lab-forest fill-lab-forest-soft" />
  if (state === 'blocked') return <AlertCircle className="size-4 shrink-0 text-destructive fill-destructive-soft" />
  if (state === 'in-progress') {
    return (
      <span className="relative inline-flex size-4 shrink-0 rounded-full border border-foreground/50 overflow-hidden">
        <span className="absolute inset-y-0 right-0 w-1/2 bg-foreground" />
      </span>
    )
  }
  return <Circle className="size-4 shrink-0 text-border" strokeDasharray="2 2" />
}

function SplitBar({ left, className }: { left: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full rounded-full overflow-hidden flex bg-muted', className)}>
      <div className="h-full bg-lab-forest" style={{ width: `${left}%` }} />
      <div className="h-full bg-lab-amber" style={{ width: `${100 - left}%` }} />
    </div>
  )
}

function Sparkline() {
  return (
    <svg viewBox="0 0 160 48" className="w-full h-12" fill="none">
      <path
        d="M2 40 C 20 34, 30 20, 44 18 S 68 26, 80 24 S 100 8, 118 6 S 140 4, 158 4"
        stroke="hsl(var(--lab-forest))" strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx="158" cy="4" r="3.5" fill="hsl(var(--lab-forest))" />
    </svg>
  )
}

function BarMini() {
  const heights = [40, 65, 30, 80, 50, 70]
  return (
    <div className="flex items-end gap-1.5 h-12">
      {heights.map((h, i) => (
        <div
          key={i}
          className={cn('w-3 rounded-t-sm', i === 3 ? 'bg-lab-forest' : 'bg-lab-forest/25')}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

function DotGrid() {
  const rows = 3, cols = 8
  const lit = new Set(['0-1', '0-2', '0-3', '1-2', '1-3', '2-1'])
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const r = Math.floor(i / cols), c = i % cols
        const on = lit.has(`${r}-${c}`)
        return (
          <span
            key={i}
            className={cn('size-2.5 rounded-full', on ? 'bg-lab-forest' : 'bg-muted')}
          />
        )
      })}
    </div>
  )
}

function Gauge() {
  // three-zone semicircle gauge: red / amber / forest, with a needle
  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-[220px]">
      <path d="M10 100 A 90 90 0 0 1 65 20" stroke="hsl(var(--destructive))" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M65 20 A 90 90 0 0 1 135 20" stroke="hsl(var(--lab-amber))" strokeWidth="14" fill="none" />
      <path d="M135 20 A 90 90 0 0 1 190 100" stroke="hsl(var(--lab-forest))" strokeWidth="14" fill="none" strokeLinecap="round" />
      <line x1="100" y1="100" x2="150" y2="45" stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="100" r="6" fill="hsl(var(--foreground))" />
      <text x="6" y="108" fontSize="10" fill="hsl(var(--muted-foreground))">0</text>
      <text x="184" y="108" fontSize="10" fill="hsl(var(--muted-foreground))">100</text>
    </svg>
  )
}

const SERIF_CANDIDATES = [
  { key: 'source',     label: 'Source Serif 4', cls: 'font-lab-serif-source', recommended: true,
    desc: 'Transitional serif, quiet and readable — safest pick for a CRM/dashboard' },
  { key: 'lora',       label: 'Lora',           cls: 'font-lab-serif-lora', recommended: false,
    desc: 'Slightly rounder, warmer contour — a touch more casual' },
  { key: 'newsreader', label: 'Newsreader',     cls: 'font-lab-serif-newsreader', recommended: false,
    desc: 'Editorial feel, higher contrast — reads more "magazine" than "app"' },
  { key: 'fraunces',   label: 'Fraunces',       cls: 'font-lab-serif-fraunces', recommended: false,
    desc: 'Expressive/quirky, wet-ink terminals — most personality, most risk' },
] as const

export default function ThemeLab() {
  const [numSel, setNumSel] = useState(4)
  const [split, setSplit] = useState(25)
  const [switchOn, setSwitchOn] = useState(true)
  const [chips, setChips] = useState(['johndoe@offer.ai', 'johndoe222@gmail.com'])
  const [settingsNavActive, setSettingsNavActive] = useState('personal')

  return (
    <div className="theme-lab flex flex-col h-full pt-4 pb-4 gap-2">
      <div className="px-8">
        <PageHeader title="Theme Lab" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-lab-bg">
        <div className="px-8 py-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ── Intro ─────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-lab-card border border-border/60 shadow-card p-5">
              <h1 className="text-lg font-bold font-lab-serif text-foreground mb-1">
                หน้ารวมคอมโพเนนต์อ้างอิง — แยกจาก /theme
              </h1>
              <p className="text-sm text-muted-foreground max-w-3xl">
                แกะมาจากภาพต้นแบบ UI ของระบบ CRM อสังหาริมทรัพย์ (สไตล์ "Offer") — ใช้ forest green
                เป็นสีหลัก, amber เป็นสีรอง, และฟอนต์ serif คู่กับ sans สำหรับหัวข้อ/ตัวเลข ทุกอย่างในหน้านี้
                ถูกกันขอบเขตด้วยคลาส <code className="px-1 py-0.5 rounded bg-muted text-xs">.theme-lab</code> ใน
                <code className="px-1 py-0.5 rounded bg-muted text-xs mx-1">index.css</code>
                จึงไม่กระทบโทนสี/ฟอนต์ของแอปจริงเลย — หยิบไปใช้ต่อได้เมื่อพร้อม
              </p>
            </div>

            {/* ── Font comparison ──────────────────────────────────── */}
            <Section title="เปรียบเทียบฟอนต์ Serif (สำหรับหัวข้อ/ตัวเลขตัวใหญ่)" note="เลือก 1 ตัวแล้วบอกหนูได้เลยค่ะ" full>
              <div className="space-y-4">
                {SERIF_CANDIDATES.map(f => (
                  <div key={f.key} className={cn(
                    'rounded-xl border p-4',
                    f.recommended ? 'border-lab-forest/40 bg-lab-forest-soft/40' : 'border-border/60',
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{f.label}</span>
                      {f.recommended && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-lab-forest text-lab-forest-foreground">
                          แนะนำ
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">— {f.desc}</span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                      <span className={cn(f.cls, 'text-3xl text-foreground')}>$6,199,000</span>
                      <span className={cn(f.cls, 'text-xl font-semibold text-foreground')}>404 S Main ST, Logan, UT 84321</span>
                      <span className={cn(f.cls, 'text-base text-muted-foreground')}>Aa Bb Cc 0123456789</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* ═══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 gap-4">
              <SectionGroup title="สถานะ &amp; Badge" />

              <Section title="Status pills" full>
                <DemoRow label="Document / signer status">
                  <LabBadge tone="draft" />
                  <LabBadge tone="viewed" />
                  <LabBadge tone="sent" />
                  <LabBadge tone="accepted" />
                  <LabBadge tone="rejected" />
                  <LabBadge tone="awaiting" />
                  <LabBadge tone="pending" />
                </DemoRow>
                <DemoRow label="Checklist status icon — done / blocked / in-progress / not started">
                  <div className="flex items-center gap-4">
                    {(['done', 'blocked', 'in-progress', 'todo'] as ChecklistState[]).map(s => (
                      <div key={s} className="flex items-center gap-1.5 text-sm text-foreground">
                        <ChecklistStatusIcon state={s} /> {s}
                      </div>
                    ))}
                  </div>
                </DemoRow>
                <DemoRow label="Two-tone split bar (commission / progress split)">
                  <div className="w-64 space-y-1">
                    <SplitBar left={75} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>75% broker</span><span>25% agent</span>
                    </div>
                  </div>
                </DemoRow>
              </Section>

              <SectionGroup title="การ์ด" />

              <Section title="Header + divider card">
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/60 px-4 py-2.5 border-b border-border/60">
                    <span className="font-semibold text-sm text-foreground">404 S Main ST Logan, UT 8432</span>
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">Sign packet</span>
                      <LabBadge tone="draft" />
                    </div>
                    <span className="text-muted-foreground">September 26, 2024 7:30 pm</span>
                  </div>
                </div>
              </Section>

              <Section title="Empty / ghost placeholder">
                <div className="rounded-xl bg-muted/50 h-24 w-full" />
                <p className="text-xs text-muted-foreground">ใช้ตอนโหลดข้อมูล/การ์ดว่าง — ไม่มีเงา ไม่มีขอบ</p>
              </Section>

              <Section title="KPI / stat card — number + delta + sparkline" full>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-border/60 p-4">
                    <span className="text-xs text-muted-foreground">Total Listing · Year-to-Date</span>
                    <div className={cn('font-lab-serif text-3xl text-foreground mt-1')}>$50,500.00</div>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium rounded-full px-2 py-0.5 bg-lab-forest-soft text-lab-forest-soft-foreground">
                      <TrendingUp className="size-3" /> +6.8%
                    </span>
                    <div className="mt-2"><Sparkline /></div>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <span className="text-xs text-muted-foreground">Total households · Weekly</span>
                    <div className={cn('font-lab-serif text-3xl text-foreground mt-1')}>11,251</div>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium rounded-full px-2 py-0.5 bg-destructive-soft text-destructive">
                      <TrendingDown className="size-3" /> -0.8%
                    </span>
                    <div className="mt-2"><BarMini /></div>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <span className="text-xs text-muted-foreground">Activity · Average vs month</span>
                    <div className={cn('font-lab-serif text-3xl text-foreground mt-1')}>75%</div>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium rounded-full px-2 py-0.5 bg-lab-amber-soft text-lab-amber-soft-foreground">
                      compared to last period
                    </span>
                    <div className="mt-2"><DotGrid /></div>
                  </div>
                </div>
              </Section>

              <Section title="Hero / promo banner">
                <div className="rounded-2xl bg-lab-forest text-lab-forest-foreground p-5 relative overflow-hidden">
                  <button className="absolute top-4 right-4 size-8 rounded-lg bg-white/15 grid place-items-center">
                    <Bell className="size-4" />
                  </button>
                  <h3 className={cn('font-lab-serif text-2xl leading-snug max-w-[220px]')}>
                    How do you rate your latest sell process?
                  </h3>
                  <div className="flex gap-2 mt-4">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setNumSel(n)}
                        className={cn(
                          'size-8 rounded-full grid place-items-center text-sm font-semibold transition-all',
                          n === numSel
                            ? 'bg-lab-amber text-lab-amber-foreground ring-2 ring-white/60'
                            : 'bg-white/15 text-white/90',
                        )}
                      >{n}</button>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Photo-bleed banner (placeholder swatch instead of a real photo)">
                <div className="rounded-2xl bg-lab-card border border-border/60 p-5 relative overflow-hidden">
                  <div className="max-w-[55%] relative z-10">
                    <h3 className={cn('font-lab-serif text-xl text-foreground leading-snug')}>Closed deals even better with offer</h3>
                    <p className="text-xs text-muted-foreground mt-1 mb-3">And even more sold today.</p>
                    <Button variant="amber" size="sm">Call to action</Button>
                  </div>
                  <div
                    className="absolute -right-6 -bottom-6 size-40 rounded-[40%] opacity-70"
                    style={{ background: 'linear-gradient(135deg, hsl(var(--lab-forest-soft)), hsl(var(--lab-amber-soft)))' }}
                  />
                </div>
              </Section>

              <Section title="Tinted full-width summary strip" full>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-lab-amber-soft px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-lab-amber-soft-foreground">
                      <LayoutGrid className="size-4" /> 24 Total Potential Deals
                    </span>
                    <span className="rounded-full bg-lab-amber px-3 py-1 text-xs font-semibold text-lab-amber-foreground">$45,634,091</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-lab-forest-soft px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-lab-forest-soft-foreground">
                      <CheckCircle2 className="size-4" /> 8 Total Active
                    </span>
                    <span className="rounded-full bg-lab-forest px-3 py-1 text-xs font-semibold text-lab-forest-foreground">$45,634,091</span>
                  </div>
                </div>
              </Section>

              <SectionGroup title="รายการ &amp; ตาราง" />

              <Section title="Data table" full>
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"><input type="checkbox" className="size-4" /></TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { addr: '123 Highland…', agent: 'Taylor Brand', type: 'Listing', tone: 'accepted' as LabBadgeTone },
                        { addr: '789 Oak Ln.', agent: 'Taylor Brand', type: 'Listing', tone: 'awaiting' as LabBadgeTone },
                        { addr: '101 River Rd.', agent: 'Taylor Brand', type: 'Listing', tone: 'rejected' as LabBadgeTone },
                      ].map(r => (
                        <TableRow key={r.addr}>
                          <TableCell><input type="checkbox" className="size-4" /></TableCell>
                          <TableCell className="font-medium text-foreground">{r.addr}</TableCell>
                          <TableCell className="text-muted-foreground">{r.agent}</TableCell>
                          <TableCell><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.type}</span></TableCell>
                          <TableCell><LabBadge tone={r.tone} /></TableCell>
                          <TableCell><MoreHorizontal className="size-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Section>

              <Section title="Nested document checklist" full>
                <div className="rounded-xl border border-border/60 divide-y divide-border/60 overflow-hidden">
                  {[
                    { n: '1', label: 'Buyers Notice To Seller of Termination', state: 'done' as ChecklistState },
                    { n: '2', label: 'Wire Fraud Disclosure', state: 'blocked' as ChecklistState },
                    { n: '3', label: 'Buyer Due Diligence Checklist', state: 'in-progress' as ChecklistState },
                  ].map(row => (
                    <div key={row.n} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <GripVertical className="size-4 text-muted-foreground/50 shrink-0" />
                      <ChecklistStatusIcon state={row.state} />
                      <span className="text-muted-foreground w-4">{row.n}.</span>
                      <span className="flex-1 text-foreground">{row.label}</span>
                      <button className="text-xs text-lab-forest font-medium">Preview</button>
                      <span className="text-border">|</span>
                      <button className="text-xs text-destructive font-medium">Delete</button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 px-4 py-2.5 pl-10 text-sm text-muted-foreground">
                    <span className="w-4">3.1</span>
                    <span>(Blank) Addendum to Real Estate Purchase Contract</span>
                  </div>
                </div>
              </Section>

              <Section title="Sequence / automation row" full>
                <div className="rounded-xl border border-border/60 divide-y divide-border/60 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">Test Sequence</div>
                      <div className="text-xs text-muted-foreground">29 Jan 2025</div>
                    </div>
                    <LabBadge tone="accepted" />
                    <Trash2 className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Switch checked={false} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">Birthday Email — David</div>
                      <div className="text-xs text-muted-foreground">29 Jan 2025</div>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Inactive</span>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </Section>

              <SectionGroup title="ฟอร์ม &amp; ตัวเลือก" />

              <Section title="Rich search with result dropdown" full>
                <div className="relative max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input defaultValue="S Main" className="pl-9" />
                  </div>
                  <div className="mt-1 rounded-xl border border-border/60 bg-lab-card shadow-card overflow-hidden">
                    <div className="flex items-start gap-2 px-4 py-3">
                      <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">404 <span className="text-lab-forest">S Main</span> ST, Logan, UT 84321</div>
                        <div className="text-xs text-muted-foreground">MLS #1897690</div>
                        <div className="text-xs text-muted-foreground mt-1 border-t border-border/60 pt-1">
                          $6,199,000.00 · 4 beds, 2 baths, 1,504 sq ft
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Filter / query builder rows" full>
                <div className="space-y-2 max-w-2xl">
                  {[
                    { conj: 'Where', field: 'Stage', op: 'Is', val: 'Lead' },
                    { conj: 'And', field: 'Date Created', op: 'Is', val: 'Less than 14 days ago' },
                  ].map((r, i) => (
                    <div key={i} className="grid grid-cols-[80px_1fr_100px_1fr] gap-2">
                      <span className="flex items-center text-sm text-muted-foreground">{r.conj}</span>
                      <Select><SelectTrigger><SelectValue placeholder={r.field} /></SelectTrigger>
                        <SelectContent><SelectItem value="x">{r.field}</SelectItem></SelectContent></Select>
                      <Select><SelectTrigger><SelectValue placeholder={r.op} /></SelectTrigger>
                        <SelectContent><SelectItem value="x">{r.op}</SelectItem></SelectContent></Select>
                      <Select><SelectTrigger><SelectValue placeholder={r.val} /></SelectTrigger>
                        <SelectContent><SelectItem value="x">{r.val}</SelectItem></SelectContent></Select>
                    </div>
                  ))}
                  <button className="flex items-center gap-1 text-sm font-medium text-lab-forest">
                    <Plus className="size-4" /> Add Rule
                  </button>
                </div>
              </Section>

              <Section title="Tag / chip multi-value input">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 max-w-md">
                  {chips.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                      {c}
                      <button onClick={() => setChips(cs => cs.filter(x => x !== c))}>
                        <X className="size-3 text-muted-foreground" />
                      </button>
                    </span>
                  ))}
                  <ChevronDown className="size-4 text-muted-foreground ml-auto" />
                </div>
              </Section>

              <Section title="Split slider + %-input pair">
                <div className="max-w-sm space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0} max={100} value={split}
                      onChange={e => setSplit(Number(e.target.value))}
                      className="flex-1 accent-[hsl(var(--lab-forest))]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                      <span>{split}</span><span className="text-muted-foreground">%</span>
                    </div>
                    <span className="text-xs text-muted-foreground">broker</span>
                    <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                      <span>{100 - split}</span><span className="text-muted-foreground">%</span>
                    </div>
                    <span className="text-xs text-muted-foreground">agent</span>
                  </div>
                </div>
              </Section>

              <Section title="Circular rating picker (NPS style)">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} className={cn(
                      'size-9 rounded-full grid place-items-center text-sm font-semibold',
                      n === 4
                        ? 'bg-lab-amber text-lab-amber-foreground ring-2 ring-lab-forest/40'
                        : 'bg-lab-forest/85 text-white',
                    )}>{n}</span>
                  ))}
                </div>
              </Section>

              <Section title="File dropzone + uploaded pill">
                <div className="rounded-xl border-2 border-dashed border-border/70 bg-muted/30 px-4 py-6 flex items-center gap-3">
                  <span className="rounded-md bg-lab-forest text-lab-forest-foreground text-xs font-medium px-2 py-1">
                    Wire Fraud Disclosure.pdf
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Upload className="size-4" /> Drop files to upload
                  </span>
                </div>
              </Section>

              <Section title="Split-document range row">
                <div className="flex items-center gap-2 flex-wrap max-w-lg">
                  <Select><SelectTrigger className="w-20"><SelectValue placeholder="1" /></SelectTrigger>
                    <SelectContent><SelectItem value="1">1</SelectItem></SelectContent></Select>
                  <span className="text-xs text-muted-foreground">to</span>
                  <Select><SelectTrigger className="w-20"><SelectValue placeholder="2" /></SelectTrigger>
                    <SelectContent><SelectItem value="2">2</SelectItem></SelectContent></Select>
                  <Input defaultValue="Wire Fraud Disclosure" className="flex-1 min-w-[140px]" />
                  <Button size="icon" variant="elevated"><Paperclip className="size-4" /></Button>
                  <Button size="icon" variant="elevated"><Eye className="size-4" /></Button>
                  <Button size="icon" variant="elevated-destructive"><Trash2 className="size-4" /></Button>
                </div>
              </Section>

              <Section title="Minimal rich-text toolbar">
                <div className="flex items-center gap-1 rounded-lg border border-border/60 p-1.5 w-fit">
                  {[Bold, Italic, UnderlineIcon].map((Icon, i) => (
                    <button key={i} className="size-8 rounded-md grid place-items-center hover:bg-muted">
                      <Icon className="size-4" />
                    </button>
                  ))}
                  <span className="w-px h-5 bg-border mx-1" />
                  {[List, ListOrdered, ImageIcon, Link2].map((Icon, i) => (
                    <button key={i} className="size-8 rounded-md grid place-items-center hover:bg-muted">
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
              </Section>

              <SectionGroup title="Navigation / Layout" />

              <Section title="Forest sidebar (mini)">
                <div className="flex rounded-xl overflow-hidden border border-border/60 h-64 w-56">
                  <div className="w-full bg-lab-sidebar text-lab-sidebar-foreground flex flex-col p-3 gap-1">
                    <div className={cn('font-lab-serif text-lg font-semibold mb-3 px-1')}>Offer</div>
                    {[
                      { icon: LayoutGrid, label: 'Home', active: false },
                      { icon: FileText, label: 'Transactions', active: true },
                      { icon: Users, label: 'Contacts', active: false },
                      { icon: SettingsIcon, label: 'Settings', active: false },
                    ].map(({ icon: Icon, label, active }) => (
                      <div key={label} className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium',
                        active ? 'bg-white/10' : 'opacity-80',
                      )}>
                        <Icon className="size-4" /> {label}
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Two-level settings nav (mini)">
                <div className="flex rounded-xl border border-border/60 h-64 w-64 overflow-hidden">
                  <div className="w-full p-3 space-y-3 text-sm">
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground/70 px-2 mb-1">General</div>
                      {[{ id: 'personal', label: 'Personal Details' }, { id: 'team', label: 'Team' }].map(i => (
                        <button
                          key={i.id}
                          onClick={() => setSettingsNavActive(i.id)}
                          className={cn(
                            'block w-full text-left rounded-md px-2 py-1.5',
                            settingsNavActive === i.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
                          )}
                        >{i.label}</button>
                      ))}
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground/70 px-2 mb-1">Company</div>
                      {['Company Details', 'Commission Plans'].map(l => (
                        <div key={l} className="rounded-md px-2 py-1.5 text-muted-foreground">{l}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Kanban column + card + hover state" full>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { dot: 'bg-destructive', title: 'Initial Contact', count: 24 },
                    { dot: 'bg-lab-amber', title: 'Preparing', count: 1 },
                    { dot: 'bg-lab-forest', title: 'Completed', count: 2 },
                  ].map(col => (
                    <div key={col.title} className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className={cn('size-2 rounded-full', col.dot)} />
                        {col.title}
                        <span className="ml-auto rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{col.count}</span>
                      </div>
                      <div className={cn(
                        'rounded-lg bg-lab-card border border-border/60 p-3 space-y-1',
                        col.title === 'Preparing' && 'shadow-lg ring-2 ring-lab-forest/30 -rotate-1',
                      )}>
                        <div className="text-sm font-medium text-foreground">Jack Smith</div>
                        <div className="text-xs text-muted-foreground">404 S Main ST, Logan, UT 84321</div>
                        <div className="text-xs text-lab-forest font-medium">$1,000,000</div>
                      </div>
                      {col.title === 'Preparing' && (
                        <p className="text-xs text-muted-foreground italic">↑ ตัวอย่างสถานะ hover/ลาก</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="CRM detail split layout (mini)" full>
                <div className="grid grid-cols-[200px_1fr] gap-3">
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <div className="h-12 bg-lab-forest" />
                    <div className="p-3 -mt-6">
                      <div className="size-10 rounded-full bg-lab-card border-2 border-lab-card grid place-items-center font-lab-serif text-lab-forest">D</div>
                      <div className="mt-2 text-sm font-semibold text-foreground">David Coronado</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                        <Mail className="size-3" /> davidcoronado@gmail.com
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="size-3" /> 212-456-7890
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 p-3">
                    <div className="flex items-center gap-4 border-b border-border/60 pb-2 mb-2 text-sm">
                      <span className="flex items-center gap-1 font-medium text-lab-forest border-b-2 border-lab-forest pb-2 -mb-2">
                        <Mail className="size-3.5" /> Email
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MessageSquare className="size-3.5" /> SMS
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="size-3.5" /> Log Call
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">To: davidcoronado@gmail.com</div>
                    <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      Hi, I received your email. I'll send you contracts tomorrow.
                    </div>
                  </div>
                </div>
              </Section>

              <SectionGroup title="Charts" />

              <Section title="Gauge / speedometer">
                <Gauge />
              </Section>

              <Section title="Sparkline + bar mini + dot-grid">
                <div className="grid grid-cols-3 gap-4">
                  <div><Sparkline /><span className="text-xs text-muted-foreground">line</span></div>
                  <div><BarMini /><span className="text-xs text-muted-foreground">bar</span></div>
                  <div><DotGrid /><span className="text-xs text-muted-foreground">activity dots</span></div>
                </div>
              </Section>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
