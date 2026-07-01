import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { MessageSquarePlus, List, Copy, Download, Trash2, X, Check, Pin } from 'lucide-react'

// ── DEV-ONLY UI review/annotation overlay ───────────────────────────────────
// A floating tool that lets the operator click any element on ANY page, drop a
// numbered pin, and type "แก้ตรงนี้…". Notes persist in localStorage keyed by
// route, and export as markdown (route + element label + CSS-ish selector + the
// note) so Claude can map each note straight back to the source file.
//
// Positioning: the app has NO single app-wide scroller — <main> is overflow-hidden
// and each page owns its scroll (some pages scroll, some are h-full and don't). So
// a pin is anchored to the NEAREST scroll container of the clicked element, stored
// in that scroller's CONTENT space (scroll-offset included). On every scroll/resize
// the pin's viewport position is recomputed (position: fixed) and it's hidden when
// scrolled outside its scroller. Pages with no scroller anchor to the viewport.
//
// Mounted inside <HashRouter> in App.tsx, gated on import.meta.env.DEV → the whole
// component (and this import) is tree-shaken out of production builds. It is a dev
// TOOL, deliberately self-contained: it does NOT follow the ui-primitive/no-raw-HTML
// rule (nothing here ships to users). Delete this file + its mount to remove.

const STORE_KEY = 'syntropic-review-notes-v2'

interface Note {
  id: string
  route: string        // hash pathname the note was dropped on
  scroller: string     // CSS path of the scroll container ('' = viewport-anchored)
  sx: number           // X in the scroller's content space (or page X if viewport)
  sy: number           // Y in the scroller's content space (or page Y if viewport)
  label: string        // human anchor — nearest card heading › clicked text
  selector: string     // short CSS-ish path to help locate in source
  text: string
}

// Friendly names for the common routes (fallback = raw pathname).
const ROUTE_NAMES: Record<string, string> = {
  '/': 'POS / ขายหน้าร้าน',
  '/purchase': 'รับสินค้า (GR)',
  '/products': 'สินค้า — รายการ',
  '/products/bundles': 'สินค้า — ชุด',
  '/products/print': 'สินค้า — พิมพ์ป้าย/สติ๊กเกอร์',
  '/people': 'ลูกค้า/ผู้จำหน่าย',
  '/manage': 'จัดการ — ขาย',
  '/manage/purchases': 'จัดการ — ซื้อ',
  '/manage/expenses': 'จัดการ — ค่าใช้จ่าย',
  '/reports': 'Dashboard / ศูนย์บัญชาการ',
  '/reports/vat': 'รายงาน — ภาษีมูลค่าเพิ่ม',
  '/reports/export': 'รายงาน — ส่งออก',
  '/settings': 'ตั้งค่า',
  '/theme': 'Theme',
}
const routeName = (p: string) => ROUTE_NAMES[p] ?? p

const scrollable = (el: HTMLElement) => {
  const oy = getComputedStyle(el).overflowY
  return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1
}

// Nearest scrollable ancestor of the clicked element, or null (viewport-anchored).
function nearestScroller(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el
  while (cur && cur !== document.body) {
    if (scrollable(cur)) return cur
    cur = cur.parentElement
  }
  return null
}

// Unique-enough CSS path (nth-of-type chain from body) so the scroll container can
// be re-found on later renders / after reload.
function uniquePath(el: HTMLElement): string {
  const parts: string[] = []
  let cur: HTMLElement | null = el
  while (cur && cur !== document.body && cur.nodeType === 1) {
    let s = cur.tagName.toLowerCase()
    const parent: HTMLElement | null = cur.parentElement
    if (parent) {
      const sibs = Array.from(parent.children).filter(c => c.tagName === cur!.tagName)
      if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(cur) + 1})`
    }
    parts.unshift(s)
    cur = parent
  }
  return parts.join(' > ')
}

// Describe the clicked element: a readable breadcrumb label + a short selector
// path. The label/selector — NOT the coords — is how a note maps back to source,
// so it's as specific as possible: nearest card heading › clicked text.
function describe(el: HTMLElement): { label: string; selector: string } {
  const parts: string[] = []
  let cur: HTMLElement | null = el
  let depth = 0
  while (cur && depth < 4 && cur !== document.body) {
    let s = cur.tagName.toLowerCase()
    if (typeof cur.className === 'string' && cur.className.trim()) {
      const c = cur.className.trim().split(/\s+/).filter(x => x && !x.startsWith('css-'))[0]
      if (c) s += '.' + c
    }
    parts.unshift(s)
    cur = cur.parentElement
    depth++
  }
  const selector = parts.join(' > ')

  const own = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
  const target = own.length > 0 && own.length <= 48 ? own : ''
  const card = el.closest('[class*="card"],[class*="Card"],[data-slot]')
  const heading = card?.querySelector('h1,h2,h3,h4') ?? el.closest('h1,h2,h3,h4')
  const section = heading ? (heading.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48) : ''

  const label =
    section && target && section !== target ? `${section} › ${target}`
    : section || target || el.tagName.toLowerCase()
  return { label, selector }
}

// Current viewport position of a note + whether it's inside its scroller's view.
function place(n: Note): { left: number; top: number; visible: boolean } {
  if (n.scroller) {
    const sc = document.querySelector(n.scroller) as HTMLElement | null
    if (sc) {
      const r = sc.getBoundingClientRect()
      const left = r.left + (n.sx - sc.scrollLeft)
      const top = r.top + (n.sy - sc.scrollTop)
      const visible = top >= r.top - 2 && top <= r.bottom + 2 && left >= r.left - 2 && left <= r.right + 2
      return { left, top, visible }
    }
  }
  return { left: n.sx - window.scrollX, top: n.sy - window.scrollY, visible: true }
}

const uid = () => Math.random().toString(36).slice(2, 9)

function load(): Note[] {
  try {
    const arr = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')
    return Array.isArray(arr) ? arr.filter((n) => typeof n?.sx === 'number') : []
  } catch { return [] }
}

export default function ReviewOverlay() {
  const location = useLocation()
  const route = location.pathname

  const [notes, setNotes] = useState<Note[]>(load)
  const [noting, setNoting] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  // Live highlight box (viewport coords) around the element under the cursor.
  const [hoverRect, setHoverRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [, setTick] = useState(0)  // bumped on scroll/resize to reposition pins

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(notes)) }, [notes])

  const notesHere = useMemo(() => notes.filter(n => n.route === route), [notes, route])

  // Reposition pins on any scroll (capture=true catches inner scrollers) or resize.
  useEffect(() => {
    let raf = 0
    const onMove = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setTick(t => t + 1) })
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Capture-phase click while noting: swallow the click and drop a pin instead.
  useEffect(() => {
    if (!noting) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-review-ui]')) return
      e.preventDefault()
      e.stopPropagation()
      const { label, selector } = describe(t)
      const scEl = nearestScroller(t)
      let scroller = '', sx: number, sy: number
      if (scEl) {
        const r = scEl.getBoundingClientRect()
        scroller = uniquePath(scEl)
        sx = e.clientX - r.left + scEl.scrollLeft
        sy = e.clientY - r.top + scEl.scrollTop
      } else {
        sx = e.clientX + window.scrollX
        sy = e.clientY + window.scrollY
      }
      const id = uid()
      setNotes(prev => [...prev, { id, route, scroller, sx, sy, label, selector, text: '' }])
      setEditing(id)
    }
    const onHover = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.closest('[data-review-ui]')) { setHoverRect(null); return }
      const r = t.getBoundingClientRect()
      setHoverRect({ x: r.left, y: r.top, w: r.width, h: r.height })
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('mousemove', onHover, true)
    document.body.style.cursor = 'crosshair'
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('mousemove', onHover, true)
      document.body.style.cursor = ''
      setHoverRect(null)
    }
  }, [noting, route])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setEditing(null); setNoting(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Scroll a note into view (in its own scroller, or the window) + flash it.
  const focusPin = useCallback((n: Note) => {
    setEditing(n.id)
    if (n.route !== route) return
    setTimeout(() => {
      const sc = n.scroller ? (document.querySelector(n.scroller) as HTMLElement | null) : null
      if (sc) sc.scrollTo({ top: Math.max(0, n.sy - sc.clientHeight / 2), behavior: 'smooth' })
      else window.scrollTo({ top: Math.max(0, n.sy - window.innerHeight / 2), behavior: 'smooth' })
      setFlashId(n.id)
      setTimeout(() => setFlashId(null), 1200)
    }, 0)
  }, [route])

  const setText = useCallback((id: string, text: string) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, text } : n)))
  }, [])
  const remove = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    setEditing(cur => (cur === id ? null : cur))
  }, [])

  const markdown = useMemo(() => {
    if (notes.length === 0) return '(ยังไม่มีโน้ต)'
    const byRoute = new Map<string, Note[]>()
    for (const n of notes) {
      const arr = byRoute.get(n.route) ?? []
      arr.push(n)
      byRoute.set(n.route, arr)
    }
    let out = '# โน้ตรีวิว UI\n'
    for (const [r, arr] of byRoute) {
      out += `\n## ${r}  —  ${routeName(r)}\n`
      arr.forEach((n, i) => {
        out += `${i + 1}. **${n.label || '(องค์ประกอบ)'}** — ${n.text.trim() || '(ยังไม่ได้พิมพ์)'}\n`
        out += `   - selector: \`${n.selector}\`\n`
      })
    }
    return out
  }, [notes])

  const copyMd = useCallback(async () => {
    try { await navigator.clipboard.writeText(markdown) } catch { /* clipboard blocked */ }
  }, [markdown])
  const downloadMd = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ui-review-notes.md'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [markdown])

  const globalIndex = (n: Note) => notes.findIndex(x => x.id === n.id) + 1
  const editingNote = editing ? notes.find(x => x.id === editing) ?? null : null

  return createPortal(
    <>
      {/* Aim highlight — box around the element under the cursor while noting */}
      {noting && hoverRect && (
        <div
          data-review-ui
          style={{ left: hoverRect.x, top: hoverRect.y, width: hoverRect.w, height: hoverRect.h }}
          className="pointer-events-none fixed z-[9995] rounded-md border-2 border-accent bg-accent/10"
        />
      )}

      {/* Pins for the current route (position: fixed, recomputed each scroll) */}
      {notesHere.map(n => {
        const num = notesHere.indexOf(n) + 1
        const p = place(n)
        return (
          <button
            key={n.id}
            data-review-ui
            onClick={(e) => { e.stopPropagation(); setEditing(n.id) }}
            title={n.text || '(ว่าง) — คลิกเพื่อพิมพ์'}
            style={{ left: p.left, top: p.top, display: p.visible ? undefined : 'none' }}
            className={`fixed z-[9998] -translate-x-1/2 -translate-y-full grid size-6 place-items-center rounded-full rounded-bl-sm border-2 border-white bg-destructive text-[0.7rem] font-bold text-white shadow-md hover:brightness-110 ${
              flashId === n.id ? 'ring-4 ring-accent animate-pulse' : ''
            }`}
          >
            {num}
          </button>
        )
      })}

      {/* Inline editor for the pin being edited */}
      {editingNote && editingNote.route === route && (() => {
        const p = place(editingNote)
        const left = Math.min(Math.max(8, p.left - 8), window.innerWidth - 288)
        const top = Math.min(Math.max(8, p.top + 10), window.innerHeight - 180)
        return (
          <div
            data-review-ui
            style={{ left, top }}
            className="fixed z-[9999] w-72 rounded-xl border border-border bg-popover p-3 shadow-xl"
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground-subtle">
              <Pin className="size-3.5" /> {editingNote.label || 'องค์ประกอบ'}
            </div>
            <textarea
              autoFocus
              value={editingNote.text}
              onChange={(e) => setText(editingNote.id, e.target.value)}
              placeholder="พิมพ์บอกว่าจะแก้อะไรตรงนี้…"
              className="min-h-[4.5rem] w-full resize-y rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => remove(editingNote.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-destructive-soft py-1.5 text-sm text-destructive hover:bg-destructive-soft"
              >
                <Trash2 className="size-3.5" /> ลบ
              </button>
              <button
                onClick={() => setEditing(null)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-sm font-semibold text-white hover:brightness-110"
              >
                <Check className="size-3.5" /> เสร็จ
              </button>
            </div>
          </div>
        )
      })()}

      {/* Slide-in list panel */}
      {panelOpen && (
        <div data-review-ui className="fixed right-0 top-0 z-[9997] flex h-full w-80 flex-col border-l border-border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <List className="size-4" />
            <b className="text-sm">โน้ตรีวิว UI</b>
            <span className="ml-auto text-xs text-foreground-subtle">{notes.length} รายการ</span>
            <button onClick={() => setPanelOpen(false)} className="ml-1 grid size-6 place-items-center rounded hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2.5">
            {notes.length === 0 ? (
              <div className="p-8 text-center text-sm text-foreground-subtle">
                ยังไม่มีโน้ต<br />กด “เปิดโหมดโน้ต” แล้วคลิกบนหน้าจอ
              </div>
            ) : (
              notes.map(n => (
                <button
                  key={n.id}
                  onClick={() => focusPin(n)}
                  className="mb-2 block w-full rounded-lg border border-border p-2.5 text-left hover:bg-muted"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="grid size-5 place-items-center rounded-full bg-destructive text-[0.65rem] font-bold text-white">{globalIndex(n)}</span>
                    <span className="truncate text-xs font-semibold text-foreground-subtle">{routeName(n.route)}</span>
                  </div>
                  <div className="truncate text-xs text-foreground-subtle">{n.label}</div>
                  <div className={`text-sm ${n.text ? 'text-foreground' : 'italic text-foreground-subtle'}`}>
                    {n.text || '(ยังไม่ได้พิมพ์)'}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex gap-2 border-t border-border p-2.5">
            <button onClick={copyMd} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm font-semibold text-white hover:brightness-110">
              <Copy className="size-3.5" /> คัดลอก
            </button>
            <button onClick={downloadMd} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-2 text-sm hover:bg-muted">
              <Download className="size-3.5" /> .md
            </button>
            <button onClick={() => { if (confirm('ล้างโน้ตทั้งหมด?')) setNotes([]) }} className="grid size-9 place-items-center rounded-md border border-border hover:bg-muted" title="ล้างทั้งหมด">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating launcher (bottom-right) */}
      <div data-review-ui className="fixed bottom-4 right-4 z-[9996] flex flex-col items-end gap-2">
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs shadow-lg hover:bg-muted"
          title="รายการโน้ต"
        >
          <List className="size-4" /> {notes.length}
        </button>
        <button
          onClick={() => setNoting(o => !o)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition-colors ${
            noting ? 'bg-accent text-accent-foreground' : 'bg-primary text-white hover:brightness-110'
          }`}
          title="เปิด/ปิดโหมดปักโน้ต"
        >
          <MessageSquarePlus className="size-4" />
          {noting ? 'กำลังปักโน้ต (คลิกบนหน้า)' : 'เปิดโหมดโน้ต'}
        </button>
      </div>
    </>,
    document.body,
  )
}
