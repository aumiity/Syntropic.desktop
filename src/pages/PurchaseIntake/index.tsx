import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { DateInput } from '@/components/ui/date-input'
import { useToast } from '@/components/ui/toast'
import { PageHeader } from '@/components/layout/PageHeader'
import { getCurrentUserId } from '@/stores/userStore'
import type { Supplier } from '@/types'
import { Wand2, Search, FileDown, PackageSearch } from 'lucide-react'

const AUTO_CONFIRM = 0.95

type Tier = 'alias' | 'token' | 'fuzzy' | 'none'

interface Candidate {
  productId: number
  code: string | null
  name: string
  generic: string | null
  barcode: string | null
  unitName: string | null
  score: number
}

interface MatchResult {
  supplierText: string
  normalized: string
  tier: Tier
  candidates: Candidate[]
}

interface Row {
  supplierText: string
  normalized: string
  tier: Tier
  candidates: Candidate[]
  // current selection
  productId: number | null
  productName: string
  barcode: string | null
  score: number
  initialProductId: number | null // top candidate / cached alias at match time
  qty: string
  expiry: string // ISO yyyy-mm-dd
  lineTotal: string
}

function resolveBarcode(p: any): string | null {
  for (const b of [p?.barcode, p?.barcode2, p?.barcode3, p?.barcode4]) {
    const v = (b ?? '').toString().trim()
    if (v) return v
  }
  return null
}

export default function PurchaseIntake() {
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [matching, setMatching] = useState(false)
  const [exporting, setExporting] = useState(false)

  // per-row product override search
  const [searchIdx, setSearchIdx] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.people.allSuppliers().then((s: Supplier[]) => {
      setSuppliers(s)
      if (s.length && supplierId == null) setSupplierId(s[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runMatch = async (text: string, sid: number) => {
    const lines = text.split('\n')
    if (!lines.some((l) => l.trim())) {
      setRows([])
      return
    }
    setMatching(true)
    try {
      const results = (await window.api.matcher.matchLines(sid, lines)) as MatchResult[]
      setRows(
        results.map((r) => {
          const top = r.candidates[0] ?? null
          return {
            supplierText: r.supplierText,
            normalized: r.normalized,
            tier: r.tier,
            candidates: r.candidates,
            productId: top?.productId ?? null,
            productName: top?.name ?? '',
            barcode: top?.barcode ?? null,
            score: top?.score ?? 0,
            initialProductId: top?.productId ?? null,
            qty: '',
            expiry: '',
            lineTotal: '',
          }
        }),
      )
    } catch (e: any) {
      toast({ title: 'จับคู่ไม่สำเร็จ', description: String(e?.message ?? e), variant: 'destructive' })
    } finally {
      setMatching(false)
    }
  }

  // Debounced auto-match when the textarea changes.
  const onPasteChange = (v: string) => {
    setPasteText(v)
    if (matchTimer.current) clearTimeout(matchTimer.current)
    if (supplierId == null) return
    matchTimer.current = setTimeout(() => runMatch(v, supplierId), 600)
  }

  const triggerMatchNow = () => {
    if (matchTimer.current) clearTimeout(matchTimer.current)
    if (supplierId == null) {
      toast({ title: 'เลือกผู้ขายก่อน', variant: 'destructive' })
      return
    }
    runMatch(pasteText, supplierId)
  }

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  // ── per-row product override search ──────────────────────────────────────
  const openSearch = (i: number) => {
    setSearchIdx(i)
    setSearchQuery('')
    setSuggestions([])
  }
  const handleSearch = (q: string) => {
    setSearchQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) {
      setSuggestions([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = (await window.api.pos.searchProducts(q)) as any[]
        setSuggestions(data.slice(0, 8))
      } catch {}
    }, 180)
  }
  const pickProduct = (i: number, p: any) => {
    patchRow(i, {
      productId: p.id,
      productName: p.trade_name,
      barcode: resolveBarcode(p),
      score: 1, // user-confirmed
    })
    setSearchIdx(null)
    setSearchQuery('')
    setSuggestions([])
  }

  // ── export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!rows.length) {
      toast({ title: 'ไม่มีรายการ', variant: 'destructive' })
      return
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.productId || !r.barcode) {
        toast({ title: `แถว ${i + 1}: ยังไม่ได้เลือกสินค้า / ไม่มีบาร์โค้ด`, variant: 'destructive' })
        return
      }
      const qty = parseFloat(r.qty)
      if (!r.qty.trim() || isNaN(qty) || qty <= 0) {
        toast({ title: `แถว ${i + 1}: จำนวนไม่ถูกต้อง`, variant: 'destructive' })
        return
      }
      if (!r.expiry) {
        toast({ title: `แถว ${i + 1}: ยังไม่ได้ระบุวันหมดอายุ`, variant: 'destructive' })
        return
      }
      const lt = parseFloat(r.lineTotal)
      if (!r.lineTotal.trim() || isNaN(lt) || lt < 0) {
        toast({ title: `แถว ${i + 1}: ราคารวมไม่ถูกต้อง`, variant: 'destructive' })
        return
      }
    }

    setExporting(true)
    try {
      // Save aliases for rows that were not an exact cached-alias hit, or where
      // the user changed the product away from the cached alias.
      const userId = getCurrentUserId()
      const aliasRows = rows
        .filter((r) => r.tier !== 'alias' || r.productId !== r.initialProductId)
        .map((r) => ({
          supplierId: supplierId!,
          supplierText: r.supplierText,
          productId: r.productId!,
          confidence: 1.0,
          confirmedBy: userId ?? undefined,
        }))
      if (aliasRows.length) await window.api.matcher.saveAliases(aliasRows)

      const res = (await window.api.matcher.exportCSV(
        rows.map((r) => ({
          barcode: r.barcode!,
          qty: r.qty,
          expiry: r.expiry,
          lineTotal: r.lineTotal,
        })),
      )) as { ok: boolean; canceled?: boolean; path?: string }

      if (res.canceled) return
      if (res.ok) {
        toast({
          title: 'ส่งออกสำเร็จ',
          description: `บันทึก alias ${aliasRows.length} รายการ · ${res.path}`,
        })
      }
    } catch (e: any) {
      toast({ title: 'ส่งออกไม่สำเร็จ', description: String(e?.message ?? e), variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const tierBadge = (tier: Tier, score: number) => {
    if (tier === 'alias') return <Badge variant="success">เคยจับคู่</Badge>
    if (score >= AUTO_CONFIRM) return <Badge variant="success">{Math.round(score * 100)}%</Badge>
    if (score >= 0.7) return <Badge variant="warning">{Math.round(score * 100)}%</Badge>
    return <Badge variant="destructive">ตรวจสอบ</Badge>
  }

  const cellTint = (tier: Tier, score: number) => {
    if (tier === 'alias' || score >= AUTO_CONFIRM) return 'bg-success-soft/40'
    if (score >= 0.7) return 'bg-warm/40'
    return 'bg-destructive-soft/40'
  }

  const matchedCount = rows.filter((r) => r.productId != null && r.barcode).length

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="จับคู่ใบส่งของ" />

      <div className="flex flex-1 min-h-0 gap-3">
        {/* Left column — input */}
        <div className="w-[380px] shrink-0 flex flex-col gap-3 bg-card rounded-card border border-border shadow-card p-5">
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-muted-foreground">ผู้ขาย</span>
            <Select
              value={supplierId == null ? '' : String(supplierId)}
              onValueChange={(v) => setSupplierId(Number(v))}
            >
              <SelectTrigger className="h-10 w-full rounded-lg bg-input text-sm">
                <SelectValue placeholder="เลือกผู้ขาย" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col flex-1 min-h-0 space-y-1.5">
            <span className="text-sm font-semibold text-muted-foreground">
              วางรายการจากใบส่งของ (บรรทัดละ 1 รายการ)
            </span>
            <Textarea
              value={pasteText}
              onChange={(e) => onPasteChange(e.target.value)}
              placeholder={'เช่น\nPARA 500 100เม็ด\nAMOXY 250 ...'}
              className="flex-1 min-h-0 resize-none text-sm"
            />
          </div>

          <Button onClick={triggerMatchNow} disabled={matching} className="w-full" size="lg">
            <Wand2 className="size-4" />
            {matching ? 'กำลังจับคู่...' : 'จับคู่'}
          </Button>
        </div>

        {/* Right column — results table-card */}
        <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card border border-border shadow-card overflow-hidden">
          <div className="px-5 h-12 text-sm font-semibold text-muted-foreground shrink-0 flex items-center justify-between">
            <span>
              {rows.length
                ? `${rows.length} แถว · จับคู่แล้ว ${matchedCount}/${rows.length}`
                : 'ยังไม่มีรายการ'}
            </span>
          </div>

          <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-[24%]">ข้อความจากผู้ขาย</TableHead>
                  <TableHead className="w-[30%]">สินค้า</TableHead>
                  <TableHead className="w-[12%] text-right">จำนวน</TableHead>
                  <TableHead className="w-[11%] text-center">ล็อต</TableHead>
                  <TableHead className="w-[13%]">วันหมดอายุ</TableHead>
                  <TableHead className="w-[12%] text-right">ราคารวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                      <PackageSearch className="size-10 mx-auto mb-2 opacity-30" />
                      วางรายการจากใบส่งของแล้วกด “จับคู่”
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => {
                    const lot =
                      r.expiry && /^\d{4}-\d{2}-\d{2}$/.test(r.expiry)
                        ? r.expiry.slice(8, 10) + r.expiry.slice(5, 7) + r.expiry.slice(2, 4)
                        : '—'
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="break-words text-sm">{r.supplierText}</TableCell>
                        <TableCell className={cellTint(r.tier, r.score)}>
                          {searchIdx === i ? (
                            <div className="relative">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                  autoFocus
                                  value={searchQuery}
                                  onChange={(e) => handleSearch(e.target.value)}
                                  onBlur={() => setTimeout(() => setSearchIdx(null), 150)}
                                  placeholder="ค้นหาชื่อ / บาร์โค้ด..."
                                  className="h-9 pl-8 rounded-lg text-sm"
                                />
                              </div>
                              {suggestions.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border bg-popover shadow-card scrollbar-thin">
                                  {suggestions.map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => pickProduct(i, p)}
                                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-primary-soft"
                                    >
                                      <span className="font-medium">{p.trade_name}</span>
                                      <span className="text-muted-foreground">
                                        {p.code ?? '—'} · {resolveBarcode(p) ?? 'ไม่มีบาร์โค้ด'}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openSearch(i)}
                              className="flex w-full flex-col items-start gap-1 text-left"
                            >
                              {r.productId ? (
                                <>
                                  <span className="flex items-center gap-2 text-sm font-medium">
                                    {r.productName}
                                    {tierBadge(r.tier, r.score)}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {r.barcode ?? 'ไม่มีบาร์โค้ด'}
                                  </span>
                                </>
                              ) : (
                                <span className="flex items-center gap-2 text-sm text-destructive">
                                  ไม่พบสินค้า — คลิกเพื่อค้นหา
                                </span>
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={r.qty}
                            onChange={(e) => patchRow(i, { qty: e.target.value })}
                            inputMode="decimal"
                            className="h-9 rounded-lg text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {lot}
                        </TableCell>
                        <TableCell>
                          <DateInput
                            value={r.expiry}
                            onChange={(iso) => patchRow(i, { expiry: iso })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={r.lineTotal}
                            onChange={(e) => patchRow(i, { lineTotal: e.target.value })}
                            inputMode="decimal"
                            className="h-9 rounded-lg text-sm text-right"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="h-12 px-5 bg-card border-t border-border flex items-center justify-between shrink-0">
            <span className="text-sm text-muted-foreground">
              {rows.length} แถว · จับคู่แล้ว {matchedCount}/{rows.length}
            </span>
            <Button
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              size="lg"
            >
              <FileDown className="size-4" />
              {exporting ? 'กำลังส่งออก...' : 'บันทึก alias + ส่งออก CSV'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
