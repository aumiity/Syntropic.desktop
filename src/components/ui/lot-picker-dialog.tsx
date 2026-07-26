import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from './dialog'
import { Button } from './button'
import { Badge } from './badge'
import { CheckRow } from './checkbox'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead,
} from './table'
import { Check, PackageX } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

// Shared "เลือกล็อต" picker. Two structural decisions worth keeping:
//
// 1. Rendered as a Dialog (NOT a Popover) on purpose: a Popover is portaled to
//    document.body, so when opened from inside another Dialog the parent's
//    scroll-lock (react-remove-scroll) blocks the lot list from scrolling.
//    A Dialog body lives inside the allow-listed node and scrolls.
// 2. The list is a sortable TABLE, not a card stack. The operator's real task
//    here is a LOOKUP — they hold a box with a lot number printed on it and
//    need to find that row — not a comparison. A table scans faster, fits
//    ~2x the rows in the same height, and gets column sorting for free.
export interface LotPickerOption {
  id: number
  lot_number?: string | null
  expiry_date?: string | null
  /** Date the lot was received. `created_at`, NOT `order_date`. */
  created_at?: string | null
  qty_on_hand: number
  is_closed?: number
}

interface LotPickerDialogProps<T extends LotPickerOption> {
  open: boolean
  onClose: () => void
  /** Product name shown under the title. */
  productName?: string
  /** Lots to choose from. */
  lots: T[]
  /** Currently selected lot id — marks the matching row with a check. */
  activeLotId?: number
  /** Title/verb override (e.g. "เลือกล็อตที่จะคืนเข้า"). */
  title?: string
  onSelect: (lot: T) => void
}

type SortField = 'lot_number' | 'expiry_date' | 'received' | 'qty_on_hand'
type SortDir = 'asc' | 'desc'
interface SortState { by: SortField; dir: SortDir }

// A lot is hidden by default once it's closed or sold out — the toggle reveals them.
const isDepleted = (lot: LotPickerOption) => lot.is_closed === 1 || lot.qty_on_hand <= 0

// null = "missing", which always sinks to the bottom regardless of direction
// (a lot with no expiry / no lot number is never the row being hunted for).
const sortValue = (lot: LotPickerOption, by: SortField): string | number | null => {
  switch (by) {
    case 'qty_on_hand': return Number(lot.qty_on_hand) || 0
    case 'lot_number':  return lot.lot_number?.trim() || null
    case 'expiry_date': return lot.expiry_date || null
    case 'received':    return lot.created_at || null
  }
}

export function LotPickerDialog<T extends LotPickerOption>({
  open, onClose, productName, lots, activeLotId, title = 'เลือกล็อต', onSelect,
}: LotPickerDialogProps<T>) {
  const [showDepleted, setShowDepleted] = useState(false)
  // Longest-dated lot first (expiry desc) — operator decision 2026-07-26.
  // Display-only: which lot is pre-selected is decided by the caller, so
  // changing the sort never changes what gets returned.
  const [sort, setSort] = useState<SortState>({ by: 'expiry_date', dir: 'desc' })
  // Keyboard cursor tracked by lot ID (not index) so re-sorting / filtering
  // keeps the cursor on the same lot instead of on whatever slid into its slot.
  const [highlightId, setHighlightId] = useState<number | null>(activeLotId ?? null)
  const activeRowRef = useRef<HTMLTableRowElement>(null)

  const anyDepleted = lots.some(isDepleted)

  const visibleLots = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    // Always keep the active lot visible so the current selection never disappears.
    const kept = lots.filter(l => showDepleted || !isDepleted(l) || l.id === activeLotId)
    return [...kept].sort((a, b) => {
      const av = sortValue(a, sort.by)
      const bv = sortValue(b, sort.by)
      if (av === null || bv === null) {
        if (av === bv) return a.id - b.id
        return av === null ? 1 : -1
      }
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'th', { numeric: true })
      return cmp !== 0 ? cmp * dir : a.id - b.id
    })
  }, [lots, showDepleted, activeLotId, sort])

  const toggleSort = (field: SortField) => {
    setSort(s => s.by === field
      ? { by: field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: field, dir: 'asc' })
  }

  // Re-seed on (re)open so the primitive behaves the same whether the caller
  // unmounts it between opens or keeps it mounted.
  useEffect(() => {
    if (!open) return
    setShowDepleted(false)
    setHighlightId(activeLotId ?? null)
  }, [open, activeLotId])

  // Keep the cursor on a row that actually exists — hiding closed lots can
  // pull the highlighted lot out from under it.
  useEffect(() => {
    if (visibleLots.length === 0) { if (highlightId !== null) setHighlightId(null); return }
    if (highlightId !== null && visibleLots.some(l => l.id === highlightId)) return
    const fallback = visibleLots.find(l => l.id === activeLotId) ?? visibleLots[0]
    setHighlightId(fallback.id)
  }, [visibleLots, activeLotId, highlightId])

  // Focus FOLLOWS the cursor row. Two reasons this is imperative rather than
  // left to the browser: (a) POS runs a global focus-lock that snaps focus back
  // to its search input whenever focus lands on a non-interactive node — the
  // rows carry role="button" so they read as interactive and survive it; and
  // (b) if the focused row unmounts (toggling closed lots away) focus would
  // fall to <body> and that lock would steal the keyboard out of this dialog.
  useEffect(() => {
    const el = activeRowRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest' })
  }, [highlightId, visibleLots])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (visibleLots.length === 0) return
    const idx = Math.max(0, visibleLots.findIndex(l => l.id === highlightId))
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setHighlightId(visibleLots[Math.min(idx + 1, visibleLots.length - 1)].id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHighlightId(visibleLots[Math.max(idx - 1, 0)].id)
    } else if (e.key === 'Home') {
      e.preventDefault(); setHighlightId(visibleLots[0].id)
    } else if (e.key === 'End') {
      e.preventDefault(); setHighlightId(visibleLots[visibleLots.length - 1].id)
    } else if (e.key === 'Enter') {
      // Enter belongs to whatever control holds focus (a sort header, the
      // toggle, the close button). Only a focused ROW routes it to selection.
      if ((e.target as HTMLElement).closest('button, input')) return
      e.preventDefault(); onSelect(visibleLots[idx])
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      {open && (
        <DialogContent
          size="2xl"
          divided
          onClose={onClose}
          onKeyDown={handleKeyDown}
          // Radix would autofocus the first tabbable control (the toggle);
          // hand the keyboard to the cursor row instead so ↑↓/Enter work
          // the moment the dialog opens.
          onOpenAutoFocus={(e) => {
            if (!activeRowRef.current) return
            e.preventDefault()
            activeRowRef.current.focus({ preventScroll: true })
          }}
          // gap-0 overrides DialogContent's base gap-4: that grid gap is the
          // space between the header rule and the table title, and it read as
          // dead air. The `divided` rules (header border-b, footer border-t +
          // pt-3) still separate the three zones, so nothing runs together.
          className="h-[32rem] max-h-[85vh] grid-rows-[auto_1fr_auto] gap-0"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl">{title}</DialogTitle>
            <div className="text-base font-semibold text-foreground">{productName || '-'}</div>
          </DialogHeader>

          {/* rounded-none kills DialogBody's base rounded-xl: combined with
              overflow-hidden it clipped the bottom of the table's scrollbar. */}
          <DialogBody className="flex flex-col gap-0 p-0 overflow-hidden min-h-0 rounded-none">
            {/* Top bar — table-card layout (title + count Badge left, filter
                clustered right via ml-auto) but h-12, NOT the standard h-14.
                Deliberate carve-out (operator, 2026-07-26): a DialogHeader
                already sits directly above, so a full h-14 strip left a visible
                void between the header rule and the table title. */}
            <div className="h-12 px-2 flex items-center gap-3 shrink-0">
              <h3 className="text-lg font-semibold text-foreground">ตารางล็อตสินค้า</h3>
              <Badge variant="outline" className="shrink-0">{visibleLots.length}</Badge>
              {/* No "(N)" suffix on the label — the count appears/disappears with
                  the checkbox and the label reflows every toggle. */}
              <CheckRow
                className="ml-auto shrink-0"
                disabled={!anyDepleted}
                label="แสดงล็อตที่ปิด"
                checked={showDepleted}
                onChange={setShowDepleted}
              />
            </div>

            {/* Table area — the scroll zone; <th> is sticky via the primitive */}
            <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead field="lot_number" sort={sort} onToggle={toggleSort} className="min-w-28">
                      ล็อต
                    </SortableTableHead>
                    <SortableTableHead field="expiry_date" sort={sort} onToggle={toggleSort} className="min-w-24">
                      วันหมดอายุ
                    </SortableTableHead>
                    <SortableTableHead field="received" sort={sort} onToggle={toggleSort} className="min-w-24">
                      วันที่รับเข้า
                    </SortableTableHead>
                    <SortableTableHead field="qty_on_hand" align="right" sort={sort} onToggle={toggleSort} className="min-w-20">
                      คงเหลือ
                    </SortableTableHead>
                    <TableHead className="min-w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                        <PackageX className="size-10 mx-auto mb-2 opacity-30" />
                        ไม่มีล็อตให้เลือก
                      </TableCell>
                    </TableRow>
                  ) : visibleLots.map(lot => {
                    const highlighted = highlightId === lot.id
                    const selected = activeLotId === lot.id
                    return (
                      <TableRow
                        key={lot.id}
                        ref={highlighted ? activeRowRef : undefined}
                        // role="button" is what marks the row as interactive for
                        // POS's focus-lock (see the focus effect above) — without
                        // it, clicking a row bounces focus out of this dialog.
                        role="button"
                        tabIndex={-1}
                        onClick={() => onSelect(lot)}
                        className={cn(
                          'h-10 cursor-pointer outline-none',
                          highlighted ? 'bg-primary-soft hover:bg-primary-soft' : 'hover:bg-primary-soft/60',
                        )}
                      >
                        <TableCell className="font-semibold text-foreground">
                          {lot.lot_number || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(lot.expiry_date)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(lot.created_at)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground">
                          {lot.qty_on_hand}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {isDepleted(lot) && <Badge variant="destructive-outline">หมด</Badge>}
                            {selected && (
                              <span className="grid place-items-center size-6 rounded-full bg-primary text-primary-foreground shrink-0">
                                <Check className="size-3.5" strokeWidth={3} />
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button className="w-32 h-10 text-base" onClick={onClose}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
