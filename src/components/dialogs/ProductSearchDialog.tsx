import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

export interface ProductSearchDialogProps<Row> {
  open: boolean
  onClose: () => void
  /** Controlled query — the consumer owns query state so a page-level search
   *  input (POS / ComponentsTab) and this modal input drive the same results. */
  query: string
  onQueryChange: (q: string) => void
  searching?: boolean
  /** The flat, navigable rows (consumer flattens products→units / filters). */
  rows: Row[]
  /** Inner cells for one row. The component owns the wrapper (active bg, click, ref). */
  renderRow: (row: Row, active: boolean) => React.ReactNode
  onPick: (row: Row, index: number) => void
  rowKey: (row: Row, index: number) => string
  /** Layout for each row wrapper (e.g. a grid template) — kept in sync with `header`. */
  rowClassName?: string
  rowStyle?: React.CSSProperties
  /** Column-header band content (already laid out to match rowStyle). */
  header?: React.ReactNode
  placeholder?: string
  /** Shown in the result area when the query is empty. */
  emptyHint?: React.ReactNode
  /** "พบ N รายการ" footer count. Defaults to rows.length. */
  resultCount?: number
  /** Forwarded to the modal input so a parent focus-guard can target it. */
  inputRef?: React.Ref<HTMLInputElement>
  /** Pre-handle a key before the built-in arrow/Enter nav. Return true if handled. */
  onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean
  /** Slot beside the input (e.g. a multiplier badge). */
  headerRight?: React.ReactNode
  /** Extra note in the footer-left (e.g. a multiplier hint). */
  footerExtra?: React.ReactNode
  /** Dialog size; defaults to the POS 1000×800. */
  size?: { width: string; height: string }
  /** sr-only dialog title. */
  title?: string
}

/**
 * Shared product-search modal extracted from the POS cart search (the canonical
 * one — see docs/claude/pos.md). Owns ONLY the modal: chrome, keyboard-owned
 * highlight (reset on query change, never on hover/scroll), scroll-into-view,
 * and Esc. Query/results/focus-guard/multiplier stay with the consumer so the
 * POS HARD invariants (always-focused input, single global focus listener) are
 * preserved unchanged.
 */
export function ProductSearchDialog<Row>({
  open,
  onClose,
  query,
  onQueryChange,
  searching = false,
  rows,
  renderRow,
  onPick,
  rowKey,
  rowClassName,
  rowStyle,
  header,
  placeholder = 'ค้นหารหัส, ชื่อยา หรือสแกนบาร์โค้ด...',
  emptyHint,
  resultCount,
  inputRef,
  onInputKeyDown,
  headerRight,
  footerExtra,
  size,
  title = 'ค้นหาสินค้า',
}: ProductSearchDialogProps<Row>) {
  const [highlightIdx, setHighlightIdx] = useState(0)
  const activeRowRef = useRef<HTMLDivElement>(null)
  const localInputRef = useRef<HTMLInputElement | null>(null)

  // Highlight is keyboard-owned: reset ONLY when the query text changes —
  // never on scroll/focus/hover (mouse handlers would reset it spuriously).
  useEffect(() => { setHighlightIdx(0) }, [query])

  // Keep the highlighted row visible as the user arrows through.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onInputKeyDown?.(e)) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const sel = rows[highlightIdx]
      if (sel) onPick(sel, highlightIdx)
    }
  }

  const setInputRef = (el: HTMLInputElement | null) => {
    localInputRef.current = el
    if (typeof inputRef === 'function') inputRef(el)
    else if (inputRef) { (inputRef as any).current = el }
  }

  const count = resultCount ?? rows.length

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        showCloseButton={false}
        onClose={onClose}
        className="flex flex-col overflow-hidden p-0 gap-0 sm:max-w-none border-0 border-transparent"
        style={{
          width: size?.width ?? '1000px',
          maxWidth: 'calc(100vw - 2rem)',
          height: size?.height ?? '800px',
          maxHeight: 'calc(100vh - 4rem)',
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 shrink-0">
          <Search className="size-5 text-primary shrink-0" />
          <Input
            ref={setInputRef}
            value={query}
            autoFocus
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 text-lg outline-none bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 h-auto px-0"
            autoComplete="off"
          />
          {query && (
            <Button variant="elevated" size="icon-xs" onClick={() => { onQueryChange(''); localInputRef.current?.focus() }}
              className="rounded-full text-foreground-subtle"><X className="size-3" strokeWidth={3} /></Button>
          )}
          {headerRight}
          <Button variant="elevated" size="sm" onClick={onClose} className="h-7">Esc</Button>
        </div>

        {/* Column header band */}
        {header}

        {/* Results — flex-1, scrolls internally, empty space stays empty */}
        <div className="flex-1 overflow-y-auto scrollbar-thin" tabIndex={-1}>
          {searching && rows.length === 0 ? (
            <div className="py-12 text-center text-foreground-subtle text-base">กำลังค้นหา...</div>
          ) : query && rows.length === 0 ? (
            <div className="py-12 text-center text-foreground-subtle text-base">ไม่พบสินค้า "{query}"</div>
          ) : !query ? (
            <div className="py-12 text-center text-foreground-subtle">
              {emptyHint ?? (
                <>
                  <Search className="size-10 mx-auto mb-2 opacity-40" />
                  <p className="text-base">พิมพ์เพื่อค้นหาสินค้า</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((row, i) => {
                const active = i === highlightIdx
                return (
                  <div
                    key={rowKey(row, i)}
                    ref={active ? activeRowRef : undefined}
                    onClick={() => onPick(row, i)}
                    className={`cursor-pointer transition-colors ${active ? 'bg-primary-soft' : 'hover:bg-primary-soft/60'} ${rowClassName ?? ''}`}
                    style={rowStyle}
                  >
                    {renderRow(row, active)}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer status */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted border-t border-border text-xs text-muted-foreground shrink-0">
          <span>
            <kbd>↑↓</kbd> เลื่อน · <kbd>Enter</kbd> เลือก · <kbd>Esc</kbd> ปิด
            {footerExtra}
          </span>
          <span>พบ {count} รายการ</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
