import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Customer } from '@/types'
import { Search, X, Users, User, ChevronRight, AlertTriangle, Phone, UserPlus } from 'lucide-react'

interface CustomerSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the chosen customer, or `null` when the walk-in shortcut is picked. */
  onSelect: (customer: Customer | null) => void
  /** Show the pinned "ลูกค้าทั่วไป" (walk-in) row. POS = true; documents that need a named customer = false. */
  showWalkIn?: boolean
}

/**
 * Shared customer picker — keyboard-driven search modal used by POS and the
 * Quotation editor. Owns its own query/results/highlight state so it stays
 * self-contained: callers only wire `open`/`onOpenChange`/`onSelect`.
 *
 * Highlight is keyboard-owned (resets only on query change, no mouse handlers)
 * to match the POS search-UX invariant — see docs/claude/pos.md.
 */
export function CustomerSearchDialog({ open, onOpenChange, onSelect, showWalkIn = false }: CustomerSearchDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRowRef = useRef<HTMLDivElement>(null)

  const search = async (q: string) => {
    setQuery(q)
    const data = await window.api.pos.searchCustomers(q)
    setResults(data as Customer[])
  }

  // Reset + load all customers whenever the dialog opens.
  useEffect(() => {
    if (open) { setQuery(''); search('') }
  }, [open])

  // Highlight is keyboard-owned: reset only on query change.
  useEffect(() => { setHighlightIdx(-1) }, [query])

  // Keep the highlighted row visible as the user arrows through results.
  useEffect(() => {
    if (highlightIdx >= 0) activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const close = () => onOpenChange(false)
  const pick = (c: Customer | null) => { onSelect(c); close() }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent
        showCloseButton={false}
        onClose={close}
        className="flex flex-col overflow-hidden p-0 gap-0 sm:max-w-none border-0 border-transparent"
        style={{ width: '560px', maxWidth: 'calc(100vw - 2rem)', height: '620px', maxHeight: 'calc(100vh - 4rem)' }}
      >
        <DialogTitle className="sr-only">เลือกลูกค้า</DialogTitle>

        {/* Search input row */}
        <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-border">
          <Search className="size-5 text-primary shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            autoFocus
            onChange={e => search(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, results.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, -1)) }
              else if (e.key === 'Enter') {
                e.preventDefault()
                const idx = highlightIdx < 0 ? 0 : highlightIdx
                const sel = results[idx]
                if (sel) pick(sel)
              }
            }}
            placeholder="ค้นหา ชื่อ, เบอร์โทร, รหัส..."
            className="flex-1 text-lg outline-none bg-transparent border-0 shadow-none text-sm focus-visible:ring-0 focus-visible:border-0 h-auto px-0"
            autoComplete="off"
          />
          {query && (
            <Button variant="elevated" size="icon-xs" onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
              className="rounded-full text-foreground-subtle"><X className="size-3" strokeWidth={3} /></Button>
          )}
          <Button variant="elevated" size="sm" onClick={close} className="h-7">Esc</Button>
        </div>

        {/* Section label */}
        <div className="px-5 pt-3 pb-1.5 text-sm font-semibold text-muted-foreground shrink-0">
          {query ? `ผลการค้นหา (${results.length})` : 'ลูกค้าทั้งหมด'}
        </div>

        {/* Results — scrolls internally. Walk-in is pinned as the first row of the list. */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2" tabIndex={-1}>
          <div className="divide-y divide-border">
            {/* Walk-in shortcut — pinned first, styled as a list row */}
            {showWalkIn && (
              <div
                onClick={() => pick(null)}
                className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-primary-soft/60"
              >
                <span className="grid place-items-center size-11 rounded-xl shrink-0 bg-primary text-primary-foreground">
                  <Users className="size-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">ลูกค้าทั่วไป</div>
                  <div className="text-sm text-muted-foreground">ขายโดยไม่ระบุลูกค้า</div>
                </div>
                <Badge variant="accent" className="text-xs rounded-md shrink-0">ค่าเริ่มต้น</Badge>
                <ChevronRight className="size-4 text-foreground-subtle shrink-0 group-hover:text-foreground transition-colors" />
              </div>
            )}

            {results.map((c, i) => {
              const active = i === highlightIdx
              const hasAlert = !!(c.is_alert && c.alert_note)
              return (
                <div
                  key={c.id}
                  ref={active ? activeRowRef : undefined}
                  onClick={() => pick(c)}
                  className={`group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${active ? 'bg-primary-soft' : 'hover:bg-primary-soft/60'}`}
                >
                  <span className="grid place-items-center size-11 rounded-xl shrink-0 bg-primary text-primary-foreground">
                    <User className="size-6" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">{c.full_name}</span>
                      {hasAlert ? (
                        <Badge variant="destructive" className="gap-1 shrink-0">
                          <AlertTriangle className="size-3" /> แจ้งเตือน
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-sm">{c.code}</span>
                      {c.phone ? <><span className="text-foreground-subtle">·</span><Phone className="size-3 shrink-0" /><span className="truncate">{c.phone}</span></> : null}
                    </div>
                  </div>
                  <ChevronRight className={`size-4 shrink-0 transition-colors ${active ? 'text-primary' : 'text-foreground-subtle group-hover:text-foreground'}`} />
                </div>
              )
            })}
          </div>

          {results.length === 0 && (
            <div className="py-12 text-center text-foreground-subtle">
              {query ? (
                <>
                  <UserPlus className="size-10 mx-auto mb-2 opacity-40" />
                  <p className="text-base">ไม่พบลูกค้า "{query}"</p>
                  <p className="text-sm mt-1">ลองเพิ่มลูกค้าใหม่จากปุ่ม "เพิ่มลูกค้า"</p>
                </>
              ) : (
                <>
                  <Search className="size-10 mx-auto mb-2 opacity-40" />
                  <p className="text-base">พิมพ์เพื่อค้นหาลูกค้า</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted border-t border-border text-xs text-muted-foreground shrink-0">
          <span>
            <kbd>↑↓</kbd> เลื่อน · <kbd>Enter</kbd> เลือก · <kbd>Esc</kbd> ปิด
          </span>
          <span>พบ {results.length} รายการ</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
